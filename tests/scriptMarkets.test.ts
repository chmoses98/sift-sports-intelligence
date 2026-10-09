// CFB script → markets: for one script, the exact contracts it supports, each with what it needs to pay, the scripts
// it loses in, its fee-aware price and the other rungs of its thesis. Script counts stay counts.
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc, Market } from '../src/contract/types';
import { isEngine, readEngine } from '../src/lib/scriptEngine';
import { relationWord, scriptBreaks, scriptMarketCards } from '../src/lib/scriptMarkets';
import { readCfb } from './helpers';

const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
const LSU_UK = 'evt_8c3166866b2bfa530c17';

function load(id: string) {
  const engine = readEngine(readCfb<EventResearchDoc>(`explorer/events/${id}.json`));
  if (!isEngine(engine)) throw new Error('engine expected');
  const markets = readCfb<EventDetailDoc>(`event_detail/${id}.json`).markets;
  return { engine, byTicker: new Map<string, Market>(markets.map((m) => [m.kalshi_ticker, m])) };
}

describe('script market cards', () => {
  it('lists the contracts the primary script supports with pays-when, loses-in, price after fee and the thesis ladder', () => {
    const { engine, byTicker } = load(SAC_BGSU);
    const cards = scriptMarketCards(engine, engine.scripts[0].script_id, byTicker);
    expect(cards.length).toBeGreaterThan(0);
    const first = cards[0];
    expect(['SUPPORTED', 'PARTIAL']).toContain(first.compat);
    expect(first.paysWhen).toMatch(/margin|points/);
    expect(first.survival).toMatch(/supported in \d of \d scripts/);
    if (first.ask != null) expect(first.breakEven).toBeGreaterThan(first.ask);
    // One card per thesis and survival pattern: a ladder's rungs collapse into one card with the rest as alternatives.
    const keys = cards.map((c) => `${c.e.thesis}|${c.e.compat.join('')}`);
    expect(new Set(keys).size).toBe(keys.length);
    const withAlts = cards.find((c) => c.alternatives.length > 0);
    expect(withAlts).toBeDefined();
    for (const a of withAlts!.alternatives) {
      expect(a.e.thesis).toBe(withAlts!.e.thesis);
      expect(relationWord(a.relation)).not.toMatch(/_/);
    }
    // Nothing in a card is a probability derived from script ranks.
    for (const c of cards) expect(JSON.stringify({ s: c.survival, w: c.paysWhen })).not.toMatch(/\d+%/);
  });

  it('the danger script supports different contracts and names what the primary ones lose in', () => {
    const { engine, byTicker } = load(SAC_BGSU);
    const primary = scriptMarketCards(engine, engine.scripts[0].script_id, byTicker);
    const danger = engine.scripts.find((s) => s.role === 'DANGER')!;
    const dangerCards = scriptMarketCards(engine, danger.script_id, byTicker);
    expect(dangerCards.length).toBeGreaterThan(0);
    expect(dangerCards.map((c) => c.e.id)).not.toEqual(primary.map((c) => c.e.id));
    const lost = primary.find((c) => c.losesIn.length > 0);
    expect(lost).toBeDefined();
    expect(lost!.losesIn.map((x) => x.role)).toContain('Danger');
    expect(scriptBreaks(engine, engine.scripts[0].script_id).every((e) => e.compat[0] === 'CONTRADICTED')).toBe(true);
  });

  it('an engine with three scripts and totals marks uncalibrated totals research only', () => {
    const { engine, byTicker } = load(LSU_UK);
    const cards = scriptMarketCards(engine, null, byTicker, 40);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards.filter((x) => x.e.authority === 'RESEARCH_UNCALIBRATED')) expect(c.researchOnly).toBe(true);
    expect(scriptMarketCards({ ...engine, scripts: [] }, null, byTicker)).toEqual([]);
  });
});
