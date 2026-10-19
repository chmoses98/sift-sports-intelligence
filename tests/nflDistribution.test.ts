// Published NFL distributions: the real WAS @ SF Monday-night slate (2026-10-19) with George Kittle and Christian McCaffrey
// receptions and Brock Purdy / Jayden Daniels completions. The feed rows are the real published rows; the quantiles and the
// line ladder are what the publisher code (nfl-edge-finder research/projection_foundation/nfl/live/distribution.py) derives from
// each forecast's real archived pmf (tests/fixtures/nfl-distribution/projections.json says so in `_provenance`).
// What this file proves: the expected value, the prediction range, the drawn distribution and the probability of the over of
// one row all come from that row's one published distribution, and a document that contradicts itself is not shown.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { propBoard } from '../src/insights/propBoard';
import { makeAuthority, thresholdProbability } from '../src/lib/projectionAuthority';
import { decodeProjections, displayState, findProjection, quantileProblems, type PlayerProjection } from '../src/lib/projections';
import { quantilePoints, quantileMass } from '../src/components/fxResearch';

const dir = join(__dirname, 'fixtures', 'nfl-distribution');
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T;
const raw = read<Record<string, unknown>>('projections.json');
const ev = read<EventResearchDoc>('event_research.json');
const det = read<EventDetailDoc>('event_detail.json');
const NOW = Date.parse('2026-10-19T03:00:00Z');
const KITTLE = '00-0033288', MCCAFFREY = '00-0033280';

/** A deep copy of the feed with one player-row field replaced. */
function tampered(playerId: string, family: string, patch: (row: Record<string, any>) => void): unknown { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = JSON.parse(JSON.stringify(raw)) as { players: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  patch(d.players.find((p) => p.player_id === playerId && p.family === family)!);
  return d;
}
const resolveKittle = (doc: unknown) => makeAuthority('NFL', decodeProjections(doc), NOW).resolve({ stat: 'receptions', playerId: KITTLE, name: 'George Kittle', team: 'SF', opponent: 'WAS' });

describe('the real feed decodes with its distribution', () => {
  const doc = decodeProjections(raw)!;
  it('Kittle and McCaffrey receptions carry seven coherent quantiles on the declared pmf basis', () => {
    const k = findProjection(doc, { playerId: KITTLE, stat: 'receptions' })!;
    const m = findProjection(doc, { playerId: MCCAFFREY, stat: 'receptions' })!;
    expect(k.quantileBasis).toBe('pmf');
    expect(k.quantiles).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 });
    expect(m.quantiles).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 6, p90: 8, p95: 9 });
    for (const p of [k, m]) {
      expect(quantileProblems(p)).toEqual([]);
      expect(displayState(doc, p, NOW).kind).toBe('shown');
      // the row’s own summary numbers are the quantiles’
      expect([p.p10, p.median, p.p90]).toEqual([p.quantiles!.p10, p.quantiles!.p50, p.quantiles!.p90]);
    }
  });
  it('completions carry them too; rows the publisher had no pmf for carry none (and are not given any)', () => {
    const completions = doc.players.filter((p) => p.family === 'completions');
    expect(completions.length).toBe(2);
    for (const p of completions) expect(p.quantiles).not.toBeNull();
    const yards = doc.players.filter((p) => p.family === 'receiving_yards');
    expect(yards.length).toBeGreaterThan(0);
    for (const p of yards) expect(p.quantiles).toBeNull();
  });
});

describe('one selected projection: value, range, drawing and probability of the over agree', () => {
  const r = resolveKittle(raw);
  if (r.kind !== 'authoritative') throw new Error('Kittle receptions should be authoritative');
  const v = r.value;
  it('the authoritative value carries the same quantiles as the row', () => {
    expect(v.mean).toBe(5.077);
    expect(v.quantiles).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 });
    expect([v.p10, v.p90, v.median]).toEqual([2, 8, 5]);
  });
  it('every published line is a probability from the one distribution, non-increasing, and consistent with every quantile', () => {
    const ks = v.thresholds.map((t) => t.k);
    expect(ks).toEqual([...Array(ks.length)].map((_, i) => ks[0] + i));
    expect(ks).toContain(6);                                              // the main line of the live ladder
    for (let i = 1; i < v.thresholds.length; i++) expect(v.thresholds[i].p).toBeLessThanOrEqual(v.thresholds[i - 1].p);
    expect(thresholdProbability(v, 5)).toBe(0.5505);                      // the previously published rungs are unchanged
    expect(thresholdProbability(v, 3)).toBe(0.8495);
    expect(thresholdProbability(v, 7)).toBe(0.264);
    expect(thresholdProbability(v, 6)!).toBeGreaterThan(0.264);
    expect(thresholdProbability(v, 6)!).toBeLessThan(0.5505);
  });
  it('the drawing reads exactly the published quantiles', () => {
    const pts = quantilePoints(v.quantiles)!;
    expect(pts.map((q) => q.v)).toEqual([1, 2, 3, 5, 7, 8, 10]);
    expect(pts.map((q) => q.p)).toEqual([0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]);
    const qm = quantileMass(pts, 9, 3)!;
    expect(qm.mass.reduce((a, b) => a + b, 0)).toBeCloseTo(0.9, 9);       // 5th to 95th percentile: nine in ten
  });
});

describe('the prop board on the real event reads that one projection', () => {
  const board = propBoard(ev, det, undefined, makeAuthority('NFL', decodeProjections(raw), NOW));
  const row = (name: string, stat: string) => board.rows.find((x) => x.name === name && x.def.stat === stat)!;
  const kittle = row('George Kittle', 'receptions');
  const legacyMean = ev.distributions.find((d) => d.entity_id === kittle.playerId && d.metric_id === 'met_nfl.sim_receptions')!.mean!;

  it('shows the selected projection’s mean, never the established simulation’s', () => {
    expect(kittle.projectionStatus.kind).toBe('authoritative');
    expect(kittle.projection).toBe(5.077);
    expect(legacyMean).not.toBe(5.077);
  });
  it('range, prediction range and distribution are the published quantiles', () => {
    expect(kittle.distribution).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 });
    expect(kittle.range).toEqual({ typical: [3, 7], full: [1, 10], median: 5 });
    expect(kittle.predictionRange).toEqual({ lo: 2, hi: 8 });
    expect(kittle.band).toBeNull();
  });
  it('every priced rung with a published line carries that line’s probability; the main line has one', () => {
    expect(kittle.main).not.toBeNull();
    expect(kittle.main!.modelP).not.toBeNull();
    const auth = kittle.projectionStatus.kind === 'authoritative' ? kittle.projectionStatus.value : null;
    for (const x of kittle.ladder) {
      expect(x.modelP).toBe(thresholdProbability(auth!, x.threshold));
      expect(x.modelState).toBe('PROJECTION');
    }
    expect(kittle.ladder.filter((x) => x.modelP != null).length).toBeGreaterThanOrEqual(8);
  });
  it('McCaffrey and the quarterbacks resolve the same way', () => {
    const cmc = row('Christian McCaffrey', 'receptions');
    expect(cmc.projection).toBe(4.923);
    expect(cmc.distribution).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 6, p90: 8, p95: 9 });
    for (const q of ['Brock Purdy', 'Jayden Daniels']) {
      const c = row(q, 'completions');
      expect(c.projectionStatus.kind).toBe('authoritative');
      expect(c.distribution).not.toBeNull();
      expect(c.main?.modelP).not.toBeNull();
    }
  });
  it('a row without published quantiles still shows its 80% range, with no drawing', () => {
    const noQ = propBoard(ev, det, undefined, makeAuthority('NFL', decodeProjections(tampered(KITTLE, 'receptions', (p) => { delete p.quantiles; })), NOW));
    const k = noQ.rows.find((x) => x.name === 'George Kittle' && x.def.stat === 'receptions')!;
    expect(k.projection).toBe(5.077);
    expect(k.distribution).toBeNull();
    expect(k.range).toBeNull();
    expect(k.predictionRange).toEqual({ lo: 2, hi: 8 });
  });
});

describe('malformed, stale, unavailable and contradictory distributions', () => {
  it('unordered, negative, non-finite or half-valid quantile sets are ignored: the projection stays, the drawing does not', () => {
    for (const q of [
      { p05: 1, p10: 2, p25: 9, p50: 5, p75: 7, p90: 8, p95: 10 },       // unordered
      { p05: -1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 },       // negative
      { p05: 1, p10: 2, p25: 3, p50: null, p75: 7, p90: 8, p95: 10 },     // not a number
      { p05: 1, p10: 'x', p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 },      // p10 present but invalid
      { p05: 1, p25: 3, p50: 5, p75: 7 },                                 // incomplete
    ]) {
      const r = resolveKittle(tampered(KITTLE, 'receptions', (p) => { p.quantiles = q; }));
      expect(r.kind, JSON.stringify(q)).toBe('authoritative');
      expect(r.kind === 'authoritative' && r.value.quantiles).toBeNull();
    }
  });
  it('quantiles that contradict the row’s own median, range or probabilities withhold the projection whole', () => {
    const cases: [string, (p: Record<string, any>) => void][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      ['median', (p) => { p.quantiles.p50 = 6; }],
      ['p10 vs range', (p) => { p.quantiles.p10 = 3; p.quantiles.p25 = 3; }],
      ['p90 vs range', (p) => { p.quantiles.p90 = 9; p.quantiles.p95 = 10; }],
      ['a line above p90 priced as likely', (p) => { p.thresholds['9'] = 0.4; p.thresholds['10'] = 0.3; p.thresholds['11'] = 0.2; }],
      ['a line below p10 priced as unlikely', (p) => { p.thresholds = { ...p.thresholds, '2': 0.5 }; }],
      ['non-integer quantile', (p) => { p.quantiles.p25 = 3.5; }],
    ];
    for (const [name, patch] of cases) {
      const r = resolveKittle(tampered(KITTLE, 'receptions', patch));
      expect(r.kind, name).toBe('withheld');
      if (r.kind === 'withheld') expect(r.code, name).toBe('INCOHERENT');
    }
  });
  it('a document that does not declare the pmf basis is not held to the cross-check (other sports’ quantiles are unchanged)', () => {
    const declared = decodeProjections(tampered(KITTLE, 'receptions', (p) => { p.quantiles.p50 = 6; }))!;
    expect(findProjection(declared, { playerId: KITTLE, stat: 'receptions' })!.quantileBasis).toBe('pmf');
    const loose = JSON.parse(JSON.stringify(raw)) as Record<string, unknown> & { players: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete loose.distribution;
    loose.players.find((p) => p.player_id === KITTLE && p.family === 'receptions')!.quantiles.p50 = 6;
    expect(findProjection(decodeProjections(loose)!, { playerId: KITTLE, stat: 'receptions' })!.quantileBasis).toBeNull();
    expect(resolveKittle(loose).kind).toBe('authoritative');
  });
  it('non-monotone or out-of-range threshold probabilities still withhold', () => {
    expect(resolveKittle(tampered(KITTLE, 'receptions', (p) => { p.thresholds['6'] = 0.9; })).kind).toBe('withheld');
    expect(resolveKittle(tampered(KITTLE, 'receptions', (p) => { p.thresholds['6'] = 1.4; })).kind).toBe('withheld');
  });
  it('a ruled-out or blocked player has no number and no distribution', () => {
    for (const patch of [
      (p: Record<string, any>) => { p.participation.status = 'CONFIRMED_OUT'; }, // eslint-disable-line @typescript-eslint/no-explicit-any
      (p: Record<string, any>) => { p.gate = { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Listed OUT', category: 'availability', action: '' }] }; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    ]) {
      const r = resolveKittle(tampered(KITTLE, 'receptions', patch));
      expect(r.kind).toBe('withheld');
    }
  });
  it('stale inputs withhold the distribution along with the number (the approved established fallback needs its own checks)', () => {
    const r = makeAuthority('NFL', decodeProjections(raw), NOW + 400 * 3600_000).resolve({ stat: 'receptions', playerId: KITTLE, name: 'George Kittle', team: 'SF', opponent: 'WAS' });
    expect(r.kind).toBe('withheld');
    expect(r.kind === 'withheld' && r.code).toBe('STALE');
  });
  it('a missing or malformed feed gives no projection at all, never a drawing', () => {
    expect(decodeProjections(null)).toBeNull();
    expect(decodeProjections({ ...raw, schema: 'sift.projections.v2' })).toBeNull();
    const r = makeAuthority('NFL', null, NOW).resolve({ stat: 'receptions', playerId: KITTLE, name: 'George Kittle', team: 'SF' });
    expect(r.kind).toBe('withheld');
  });
});

describe('quantiles are never reconstructed from the other published numbers', () => {
  it('a row without quantiles decodes to null quantiles whatever its p10, p90, median or mean', () => {
    const d = decodeProjections(tampered(KITTLE, 'receptions', (p) => { delete p.quantiles; }))!;
    const p = findProjection(d, { playerId: KITTLE, stat: 'receptions' }) as PlayerProjection;
    expect(p.quantiles).toBeNull();
    expect([p.p10, p.median, p.p90]).toEqual([2, 5, 8]);
  });
});
