// NHL on the research packet and the load budget: a GAME packet for an NHL event carries the NHL_SCRIPT_V1 script
// line and the research candidates (RESEARCH_ONLY, with survival and stake type) as context notes, is deterministic,
// and the NHL home stays light — it never pulls players, series, rankings or market history, and event documents
// stay inside the per-document budget.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { clearAsyncMemo } from '../src/data/hooks';
import { setFetchJson } from '../src/data/fetcher';
import { buildPacket } from '../src/packet/build';
import { renderText } from '../src/packet/render';
import { routes } from '../src/lib/routes';
import { SportHomeView } from '../src/views/SportHome';
import { NHL_DIR, NHL_ROOT, nhlRepo, readDisk, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
const GENERATED_AT = '2026-10-06T23:30:00Z';

beforeAll(() => useDiskFetch());
beforeEach(() => clearAsyncMemo());

describe('NHL research packet', () => {
  it('a GAME packet carries the script distribution and research candidates, research only', async () => {
    const pkt = await buildPacket(nhlRepo(), { scope: 'GAME', eventId: FLA_LAK, generatedAt: GENERATED_AT });
    const ev = pkt.events.find((e) => e.event_id === FLA_LAK)!;
    const notes = ev.context_notes.join('\n');
    expect(notes).toMatch(/NHL_SCRIPT_V1 game scripts \(simulated, sum 100%\)/);
    expect(notes).toMatch(/Research candidate \(RESEARCH_ONLY\)/);
    expect(notes).toMatch(/survives \d+% of simulated games/);
    expect(notes).toMatch(/shadow only|funded research|nominal research|no stake/);
    const text = renderText(pkt);
    expect(text).toContain('NHL_SCRIPT_V1');
    expect(text.toLowerCase()).not.toMatch(/best bet|\block\b|guaranteed|profitable/);
    expect(pkt.markets.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same publication and request', async () => {
    const a = await buildPacket(nhlRepo(), { scope: 'GAME', eventId: FLA_LAK, generatedAt: GENERATED_AT });
    clearAsyncMemo();
    const b = await buildPacket(nhlRepo(), { scope: 'GAME', eventId: FLA_LAK, generatedAt: GENERATED_AT });
    expect(a.packet_id).toBe(b.packet_id);
    expect(renderText(a)).toBe(renderText(b));
  });
});

describe('NHL load budget', () => {
  it('the NHL home reads only the board-level documents and event research, never the heavy explorer files', async () => {
    const seen: string[] = [];
    setFetchJson(async (url: string) => {
      seen.push(url);
      return readDisk(url);
    });
    try {
      renderScreen(routes.sport('nhl'), '/:sport', <SportHomeView />, {}, 'nhl');
      await screen.findByRole('heading', { name: 'Research that survives the scripts' }, { timeout: 6000 });
      await screen.findAllByText(/most likely script/, {}, { timeout: 6000 });
    } finally {
      useDiskFetch();
    }
    const nhl = seen.filter((u) => u.startsWith(NHL_ROOT + '/')).map((u) => u.slice(NHL_ROOT.length + 1));
    expect(nhl.length).toBeGreaterThan(0);
    for (const p of nhl) expect(p).not.toMatch(/^explorer\/(players|series|rankings|market_history|teams)\//);
    expect(nhl.filter((p) => p.startsWith('explorer/events/')).length).toBeLessThanOrEqual(12);
  });

  it('every NHL event research document stays under the 400 KB per-document budget', () => {
    const dir = join(NHL_DIR, 'explorer', 'events');
    for (const f of readdirSync(dir)) expect(statSync(join(dir, f)).size, f).toBeLessThan(400_000);
  });
});
