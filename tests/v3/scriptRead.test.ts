// SIFT 3.0 Script Engine logic over the REAL CFB publication fixture (tests/fixtures/cfb: a trimmed cfb-edge-finder export): the decoder is SIFT 2.0's own
// (src/lib/scriptEngine.ts); what v3 adds is tested here. Capabilities are decided per game from the data, the side price is the side's own ask through the same
// quote gate, scripts stay ranked (no probability), and scoring contracts are never listed as surviving.
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc, Market } from '../../src/contract/types';
import { isEngine, readEngine, type Engine } from '../../src/lib/scriptEngine';
import { sidePriceOf } from '../../src/v3/data/research/scriptPrices';
import { scriptStateOf } from '../../src/v3/data/research/scriptEngine';
import { gate } from '../../src/v3/data/quoteGate';
import { CAPABILITIES, capability, gameCapability, isReady, lockedReason } from '../../src/v3/model/capabilities';
import { METRIC_WHAT, fitSentence, scoringHidden, scriptCards, survivorRows, survivalWords, topAdvantages, whyBet } from '../../src/v3/model/scriptRead';
import { tabsFor } from '../../src/v3/screens/GameDetail';
import { readCfb } from '../helpers';

const UGA_ALA = 'evt_93e12676ae9337017c63';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const ALBY_STON = 'evt_776097ba6eef448fb340';
const JVST_KENN = 'evt_e56d7cee653c3507226b';
const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';

const research = (id: string) => readCfb<EventResearchDoc>(`explorer/events/${id}.json`);
const engineOf = (id: string): Engine => { const e = readEngine(research(id)); if (!isEngine(e)) throw new Error(`${id} has no engine payload`); return e; };

describe('capabilities are decided per game from the data', () => {
  it('declares CFB script and matchup as gated, never ready by flag, with the reason a viewer is told', () => {
    for (const s of ['gameScript', 'gameMatchup'] as const) {
      expect(capability('cfb', s).status).toBe('gated');
      expect(isReady('cfb', s)).toBe(false);
      expect(lockedReason('cfb', s)).toMatch(/Script Engine payload/);
    }
  });
  it('opens them for a game only when that game\'s research carries the payload', () => {
    expect(gameCapability('cfb', 'gameScript', { scriptEngine: true }).status).toBe('ready');
    expect(gameCapability('cfb', 'gameMatchup', { scriptEngine: true }).status).toBe('ready');
    expect(gameCapability('cfb', 'gameScript', {}).status).toBe('gated');
    expect(gameCapability('cfb', 'gameMatchup', { scriptEngine: false }).status).toBe('gated');
    // the evidence never opens an unrelated section
    expect(gameCapability('cfb', 'teamProfile', { scriptEngine: true }).status).toBe('none');
    // a sport that already declares the section keeps its own declaration
    expect(gameCapability('nfl', 'gameMatchup', {}).status).toBe('ready');
  });
  it('every declared section that is not ready carries a reason; NFL declares the game script ready', () => {
    for (const c of Object.values(CAPABILITIES)) for (const a of Object.values(c.sections)) if (a.status !== 'ready') expect(a.reason.length).toBeGreaterThan(10);
    expect(capability('nfl', 'gameScript').status).toBe('ready');
  });
  it('tab availability follows the game: NFL five, a Script Engine game four, any other game two', () => {
    expect(tabsFor('nfl')).toEqual(['overview', 'script', 'matchup', 'props', 'stats']);
    expect(tabsFor('cfb', { scriptEngine: true })).toEqual(['overview', 'script', 'matchup', 'props']);
    expect(tabsFor('cfb')).toEqual(['overview', 'props']);
    expect(tabsFor('cfb', { scriptEngine: false })).toEqual(['overview', 'props']);
    expect(tabsFor('nhl')).toEqual(['overview', 'props']);
    // any sport whose research carries the payload gets the script tabs
    expect(tabsFor('nhl', { scriptEngine: true })).toEqual(['overview', 'script', 'matchup', 'props']);
  });
});

describe('the state a research document stands for', () => {
  it('is ready only for a payload with script_generation', () => {
    expect(scriptStateOf(research(UGA_ALA)).kind).toBe('ready');
    expect(scriptStateOf(research(NMSU_FIU)).kind).toBe('ready');
    // the engine could not build any script but did publish a read: still a real payload
    const none = scriptStateOf(research(JVST_KENN));
    expect(none.kind).toBe('ready');
    expect(none.kind === 'ready' && none.engine.scripts).toHaveLength(0);
  });
  it('carries the engine\'s own status and reason when it could not match the game', () => {
    const s = scriptStateOf(research(ALBY_STON));
    expect(s).toMatchObject({ kind: 'unavailable', status: 'UNAVAILABLE' });
    expect(s.kind === 'unavailable' && s.reason).toMatch(/identity/);
  });
  it('is none for research with no payload, and for no research', () => {
    const r = research(UGA_ALA);
    expect(scriptStateOf({ ...r, extensions: {} })).toEqual({ kind: 'none', reason: null });
    expect(scriptStateOf(null)).toEqual({ kind: 'none', reason: null });
  });
});

describe('matchup advantages', () => {
  it('are the engine\'s own MATCHUP findings, strongest first, at most three, one per dimension and side', () => {
    const e = engineOf(LSU_UK);
    const top = topAdvantages(e, 3);
    expect(top).toHaveLength(3);
    expect(top.every((a) => a.kind === 'finding')).toBe(true);
    const keys = top.map((a) => `${a.dimension}|${a.side}`);
    expect(new Set(keys).size).toBe(keys.length);
    const order = top.map((a) => (a.strength === 'STRONG' ? 0 : 1));
    expect(order).toEqual([...order].sort());
    for (const a of top) {
      const f = e.findings.find((x) => x.code === a.code)!;
      expect(f.category).toBe('MATCHUP');
      expect(a.statement).toBe(f.statement);
      expect(a.why.length).toBeGreaterThan(20);
    }
  });
  it('for an even matchup (no MATCHUP finding) are the largest published positive gaps, marked as such and carrying no sentence the engine did not write', () => {
    const e = engineOf(UGA_ALA);
    expect(e.findings.some((f) => f.category === 'MATCHUP')).toBe(false);
    const top = topAdvantages(e, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (const a of top) { expect(a.kind).toBe('gap'); expect(a.statement).toBeNull(); expect(a.strength).toBeNull(); expect(a.edge.forward).toBeGreaterThan(0); }
    const gaps = top.map((a) => a.edge.forward!);
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
  });
  it('carry the ranks of the two units compared, and what the metric measures, when the tables are on the page', () => {
    const e = engineOf(UGA_ALA);
    const withRanks = topAdvantages(e, 3).filter((a) => a.offense && a.defense);
    expect(withRanks.length).toBeGreaterThan(0);
    for (const a of withRanks) {
      expect(a.offense!.unit).toBe('offense');
      expect(a.defense!.unit).toBe('defense');
      expect(a.offense!.rank).toBeGreaterThan(0);
      expect(a.offense!.of).toBeGreaterThan(100);
      expect(a.metric?.name).toBeTruthy();
      expect(a.metric?.what).toBeTruthy();
    }
  });
});

describe('what a metric measures', () => {
  it('comes from the event\'s own description, else the engine\'s published registry words, never a guess', () => {
    const e = engineOf(LSU_UK);
    const have = topAdvantages(e, 3).find((a) => a.metric);
    expect(have?.metric?.what).toBeTruthy();
    const stripped = { ...e, registry: Object.fromEntries(Object.entries(e.registry).map(([k, v]) => [k, { ...v, description: undefined }])) } as Engine;
    const fallback = topAdvantages(stripped, 3).filter((a) => a.metric);
    expect(fallback.length).toBeGreaterThan(0);
    for (const a of fallback) expect(Object.keys(METRIC_WHAT)).toContain(Object.keys(e.registry).find((k) => e.registry[k].name === a.metric!.name));
    for (const a of fallback) expect(a.metric!.what).toBeTruthy();
  });
});

describe('scripts and the bets that survive them', () => {
  it('are ranked in the engine\'s order, Primary first, each step citing findings the payload carries, and no probability anywhere', () => {
    for (const id of [UGA_ALA, LSU_UK]) {
      const e = engineOf(id);
      const cards = scriptCards(e);
      expect(cards.map((c) => c.script.rank)).toEqual(cards.map((_, i) => i + 1));
      expect(cards[0].role).toBe('Primary');
      for (const c of cards) {
        expect(c.script.probability).toBeNull();
        expect(c.steps.length).toBeGreaterThan(0);
        for (const st of c.steps) for (const f of st.findings) expect(e.findings.some((x) => x.code === f.code)).toBe(true);
      }
    }
  });
  it('list only contract sides the engine featured, never a scoring contract, with identical-support rungs folded', () => {
    const e = engineOf(UGA_ALA);
    const rows = survivorRows(e, 40);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(e.survivors).toContain(r.id);
      expect(r.authority).not.toBe('RESEARCH_UNCALIBRATED');
      expect(r.survival.total_scripts).toBe(e.scripts.length);
    }
    expect(new Set(rows.map((r) => `${r.thesis}|${r.compat.join('')}`)).size).toBe(rows.length);
    expect(e.scoringResearchOnly).toBe(true);
    expect(scoringHidden(e)).toBeGreaterThanOrEqual(0);
  });
  it('say which scripts support and contradict a row in words, as counts and never a percentage', () => {
    const e = engineOf(UGA_ALA);
    for (const r of survivorRows(e, 40)) {
      expect(fitSentence(e, r)).toMatch(/Supported by|Partly by|Contradicted by|No script/);
      expect(survivalWords(r)).toMatch(/^Survives \d+ of \d+ scripts/);
      expect(`${fitSentence(e, r)} ${survivalWords(r)}`).not.toMatch(/%|likely|probab/i);
    }
  });
  it('give a row its evidence: findings for it, findings and scripts against it, and the metrics behind it', () => {
    const e = engineOf(UGA_ALA);
    const rows = survivorRows(e, 40);
    const w = whyBet(e, rows[0], (id) => id);
    expect(w.fits).toHaveLength(e.scripts.length);
    expect(w.forFindings.length).toBeGreaterThan(0);
    for (const f of [...w.forFindings, ...w.againstFindings]) expect(e.findings.some((x) => x.code === f.code)).toBe(true);
    for (const f of w.contradictedBy) expect(f.compat).toBe('CONTRADICTED');
    expect(w.metrics.length).toBeGreaterThan(0);
  });
});

describe('a contract side is priced by its own ask, through the quote gate', () => {
  const detail = readCfb<EventDetailDoc>(`event_detail/${UGA_ALA}.json`);
  const market = (t: string): Market => detail.markets.find((m) => m.kalshi_ticker === t)!;
  const e = engineOf(UGA_ALA);
  const START = Date.parse(detail.event.start_time_utc);
  const ctx = { kind: 'list' as const, startMs: START, live: false };

  it('YES is the YES ask and NO is the NO ask, in whole cents, never 1 minus the other', () => {
    let checked = 0;
    for (const x of e.expressions.slice(0, 40)) {
      const m = market(x.ticker);
      if (!m || m.yes_ask == null || m.no_ask == null) continue;
      const p = sidePriceOf(m, x.side);
      expect(p.side).toBe(x.side);
      expect(p.ask).toBe(Math.round((x.side === 'YES' ? m.yes_ask : m.no_ask) * 100));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    expect(e.expressions.some((x) => x.side === 'NO')).toBe(true);
  });
  it('is withheld by the same gate as every other price: an old observation, a missing ask, or a market that cannot trade', () => {
    const m = market(e.expressions.find((x) => x.side === 'NO')!.ticker);
    const seen = Date.parse(m.captured_at!);
    expect(gate(sidePriceOf(m, 'NO'), ctx, seen + 30_000).price?.ask).toBe(Math.round(m.no_ask! * 100));
    expect(gate(sidePriceOf(m, 'NO'), ctx, seen + 3 * 3600_000).price).toBeNull();            // too old
    expect(gate(sidePriceOf({ ...m, no_ask: null }, 'NO'), ctx, seen + 30_000).price).toBeNull(); // not derived from the YES side
    expect(gate(sidePriceOf({ ...m, no_ask: 1 }, 'NO'), ctx, seen + 30_000).price).toBeNull();     // 100 cents is "no offer", not a price
    const closed = sidePriceOf({ ...m, market_status: 'CLOSED' }, 'NO');
    expect(closed.ask).toBeNull();
    expect(gate(closed, ctx, seen + 30_000).reason).toBe('not-tradable');
  });
});
