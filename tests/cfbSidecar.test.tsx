// P0 2026-10-10: Texas A&M at Missouri (evt_03ae795dcfb6056381a6) published its Script Engine payload trimmed to the
// event budget: no metric registry, no team metric tables, no matchup dimensions, so the Matchup tab showed nine
// empty headings and an all-dash edges table. The publisher now links a verified same-run research sidecar. These
// tests run on the REAL captured files (tests/fixtures/cfb-sidecar/README.md).
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { NotFoundError, setFetchText } from '../src/data/fetcher';
import { loadScriptResearch, trimInfo, verifyScriptResearch } from '../src/data/scriptResearch';
import { normalizeCfbNames } from '../src/lib/cfbTeams';
import { isEngine, readEngine, type Engine } from '../src/lib/scriptEngine';
import { EngineDetailNotice, EngineEdgesPanel, EngineMatchupTab } from '../src/views/game/ScriptEngine';

const DIR = join(__dirname, 'fixtures', 'cfb-sidecar');
const EID = 'evt_03ae795dcfb6056381a6';
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf-8');
const doc = (rel: string) => normalizeCfbNames(JSON.parse(read(rel)) as EventResearchDoc);
const SIDECAR = `script_research/${EID}.json`;
const url = (p: string) => `disk://cfb/${p}`;

function diskText(files: Record<string, string>) {
  setFetchText(async (u) => {
    const rel = u.replace('disk://cfb/explorer/', '');
    if (!(rel in files)) throw new NotFoundError(u);
    return files[rel];
  });
}

beforeEach(() => diskText({ [SIDECAR]: read(SIDECAR) }));
afterEach(() => {
  cleanup();
  setFetchText(null);
});

function engineOf(r: EventResearchDoc, research?: Parameters<typeof readEngine>[1]): Engine {
  const e = readEngine(r, research);
  if (!isEngine(e)) throw new Error('no engine');
  return e;
}

describe('the event as published on 2026-10-10 (trimmed, unlinked)', () => {
  const r = doc(`${EID}.published-2026-10-10.json`);

  it('is the right game: Missouri home, Texas A&M away, 26OCT10TXAMMIZZ', () => {
    expect(r.event.event_id).toBe(EID);
    expect(r.event.source_ids?.kalshi_game_key).toBe('26OCT10TXAMMIZZ');
    expect(r.participants.find((p) => p.home_away === 'HOME')?.display_name).toBe('Missouri');
    expect(r.participants.find((p) => p.home_away === 'AWAY')?.display_name).toBe('Texas A&M');
    expect(JSON.stringify(r.participants)).not.toMatch(/East Texas/);
  });

  it('keeps its read, two scripts and seven findings, but the detail is gone and says why', () => {
    const e = engineOf(r, { state: 'unavailable', reason: 'x' });
    expect(e.read.headline).toMatch(/Missouri/);
    expect(e.scripts).toHaveLength(2);
    expect(e.findings).toHaveLength(7);
    expect(e.confidence.level).toBe('HIGH');
    expect(e.teams.home.name).toBe('Missouri');
    expect(e.teams.away.name).toBe('Texas A&M');
    expect(Object.keys(e.teams.home.metrics)).toHaveLength(0);
    expect(Object.keys(e.dimensions)).toHaveLength(0);
    expect(e.detail.state).toBe('unavailable');
    expect(e.scripts.every((s) => s.probability == null)).toBe(true);
  });

  it('the loader names the reason (no sidecar linked) and never rejects', async () => {
    const res = await loadScriptResearch(r, url);
    expect(res.state).toBe('unavailable');
    if (res.state === 'unavailable') expect(res.reason).toMatch(/linked no detailed research file/);
  });

  it('renders an explicit unavailable notice instead of empty headings', () => {
    const e = engineOf(r, { state: 'unavailable', reason: 'the publication trimmed this game to fit its size budget and linked no detailed research file' });
    render(<MemoryRouter><EngineDetailNotice engine={e} /><EngineMatchupTab engine={e} homeAbbr="MIZZ" awayAbbr="TXAM" /></MemoryRouter>);
    expect(screen.getByTestId('engine-detail-unavailable').textContent).toMatch(/7 matchup findings/);
    expect(document.body.textContent).toMatch(/opponent-adjusted metric tables not available for this game/);
    expect(document.body.textContent).not.toMatch(/Sustained efficiency/); // no orphan dimension headings
  });
});

describe('the same run with its research sidecar (cfb-edge-finder #127)', () => {
  const r = doc(`${EID}.json`);

  it('links the sidecar by digest and artifact', () => {
    const t = trimInfo(r)!;
    expect(t.steps.length).toBeGreaterThan(0);
    expect(t.pointer?.path).toBe(SIDECAR);
    expect(t.pointer?.artifact_hash).toBe((r.extensions as { script_engine: { script_generation: { artifact_hash: string } } }).script_engine.script_generation.artifact_hash);
  });

  it('recovers the opponent-adjusted metrics, ranks, registry and dimensions verbatim', async () => {
    const res = await loadScriptResearch(r, url);
    expect(res.state).toBe('recovered');
    const e = engineOf(r, res);
    expect(e.detail.state).toBe('recovered');
    expect(Object.keys(e.registry)).toHaveLength(26);
    expect(Object.keys(e.teams.home.metrics)).toHaveLength(52);
    expect(Object.keys(e.teams.away.metrics)).toHaveLength(52);
    expect(Object.keys(e.dimensions)).toEqual(expect.arrayContaining(['passing', 'rushing', 'sustained_efficiency', 'scoring']));
    // identity survives the merge
    expect(e.teams.home.name).toBe('Missouri');
    expect(e.teams.away.name).toBe('Texas A&M');
    expect(e.scripts).toHaveLength(2);
    expect(e.findings).toHaveLength(7);
    // a real rank out of the FBS universe, straight from the frozen table
    const ranked = Object.values(e.teams.home.metrics).filter((m) => m.rank != null);
    expect(ranked.length).toBeGreaterThan(20);
    expect(ranked.every((m) => m.rank! >= 1 && m.rank! <= m.universe_size)).toBe(true);
    // the sidecar restores the market map the trim dropped; still no probability, no price verdict
    expect(e.expressions.length).toBeGreaterThan(0);
    expect(e.scripts.every((s) => s.probability == null)).toBe(true);
  });

  it('renders the matchup tab with real ranks and no unavailable notice', async () => {
    const e = engineOf(r, await loadScriptResearch(r, url));
    render(<MemoryRouter><EngineDetailNotice engine={e} /><EngineMatchupTab engine={e} homeAbbr="MIZZ" awayAbbr="TXAM" /></MemoryRouter>);
    expect(screen.queryByTestId('engine-detail-unavailable')).toBeNull();
    expect(document.querySelectorAll('.mettab tbody tr').length).toBeGreaterThan(20);
    expect(document.body.textContent).toMatch(/#\d+\/\d+/);
    expect(document.querySelectorAll('.etab .num')).not.toHaveLength(0);
    expect([...document.querySelectorAll('.etab .num')].some((n) => n.textContent !== '—')).toBe(true);
  });

  it('shows a loading state, then never a blank page, while the sidecar is read', () => {
    const e = engineOf(r, 'loading');
    render(<MemoryRouter><EngineDetailNotice engine={e} /><EngineEdgesPanel engine={e} homeAbbr="MIZZ" awayAbbr="TXAM" /></MemoryRouter>);
    expect(screen.getByTestId('engine-detail-loading')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Loading the unit-by-unit matchup edges/);
    expect(e.read.headline).toBeTruthy();
  });

  it('rejects a tampered file by digest', async () => {
    diskText({ [SIDECAR]: read(SIDECAR).replace('"Missouri"', '"Mizzou!"') });
    const res = await loadScriptResearch(r, url);
    expect(res.state).toBe('unavailable');
    if (res.state === 'unavailable') expect(res.reason).toMatch(/does not match the digest/);
    expect(engineOf(r, res).detail.state).toBe('unavailable');
  });

  it('rejects a sidecar for another event or another football artifact, even with a matching digest', () => {
    const t = trimInfo(r)!;
    const forged = JSON.parse(read(SIDECAR));
    forged.event_id = 'evt_aaaaaaaaaaaaaaaaaaaa';
    const text = JSON.stringify(forged);
    const res = verifyScriptResearch(text, r, { ...t.pointer!, sha256: bytesToHex(sha256(utf8ToBytes(text))) });
    expect(res.state).toBe('unavailable');
    if (res.state === 'unavailable') expect(res.reason).toMatch(/describes evt_aaaa/);
    const other = verifyScriptResearch(read(SIDECAR), { ...r, extensions: { script_engine: { ...(r.extensions as { script_engine: object }).script_engine, script_generation: { artifact_hash: 'f'.repeat(64) } } } } as unknown as EventResearchDoc, t.pointer!);
    expect(other.state).toBe('unavailable');
  });

  it('reports a sidecar that is linked but not yet published', async () => {
    diskText({});
    const res = await loadScriptResearch(r, url);
    expect(res).toEqual({ state: 'unavailable', reason: 'the detailed research file this game links is not published yet' });
  });
});

describe('a small event published whole', () => {
  it('needs no sidecar and reads inline', async () => {
    const r = doc('untrimmed-evt_00e6e5d0563aa046ddef.json');
    expect(trimInfo(r)).toBeNull();
    const e = engineOf(r);
    expect(e.detail.state).toBe('inline');
    expect(Object.keys(e.teams.home.metrics).length).toBeGreaterThan(0);
    render(<MemoryRouter><EngineDetailNotice engine={e} /></MemoryRouter>);
    expect(document.querySelector('.eng-detail')).toBeNull();
  });
});
