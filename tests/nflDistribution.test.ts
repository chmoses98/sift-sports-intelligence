// Published NFL distributions: the real WAS @ SF Monday-night slate (2026-10-19) with George Kittle and Christian McCaffrey receptions and
// Brock Purdy / Jayden Daniels completions. `projections.json` is the real published feed (mean, median, p10/p90 and the study's rungs; no
// quantiles) and `distributions.json` is the artifact the publisher code (nfl-edge-finder nfl/live/distributions_artifact.py) builds from the
// real archived pmfs of those forecasts. What this file proves: SIFT joins the artifact only to the feed it describes and only where a row's
// pmf reproduces the published row; the expected value, prediction range, drawn distribution and probability of the over of one row all
// come from that one distribution; and anything contradictory, stale or unpublished shows no distribution (or no projection) rather than a guess.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { propBoard } from '../src/insights/propBoard';
import { makeAuthority, thresholdProbability } from '../src/lib/projectionAuthority';
import { attachDistributions, decodeDistributions, decodeProjections, displayState, distributionsUrl, findProjection, quantileProblems, type PlayerProjection } from '../src/lib/projections';
import { quantilePoints, quantileMass } from '../src/components/fxResearch';

const dir = join(__dirname, 'fixtures', 'nfl-distribution');
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T;
const rawFeed = read<Record<string, any>>('projections.json'); // eslint-disable-line @typescript-eslint/no-explicit-any
const rawDist = read<Record<string, any>>('distributions.json'); // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = read<EventResearchDoc>('event_research.json');
const det = read<EventDetailDoc>('event_detail.json');
const NOW = Date.parse('2026-10-19T03:00:00Z');
const KITTLE = '00-0033288', MCCAFFREY = '00-0033280';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The feed joined with the artifact, each optionally tampered with first. */
function joined(feedPatch?: (d: Record<string, any>) => void, distPatch?: (d: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const f = clone(rawFeed), d = clone(rawDist);
  feedPatch?.(f);
  distPatch?.(d);
  return attachDistributions(decodeProjections(f), decodeDistributions(d));
}
const feedRow = (d: Record<string, any>, pid: string, fam: string) => d.players.find((p: any) => p.player_id === pid && p.family === fam)!; // eslint-disable-line @typescript-eslint/no-explicit-any
const distRow = (d: Record<string, any>, pid: string, fam: string) => d.rows.find((p: any) => p.player_id === pid && p.family === fam)!; // eslint-disable-line @typescript-eslint/no-explicit-any
const resolveKittle = (doc: ReturnType<typeof joined>, now = NOW) => makeAuthority('NFL', doc, now).resolve({ stat: 'receptions', playerId: KITTLE, name: 'George Kittle', team: 'SF', opponent: 'WAS' });

describe('the artifact is decoded strictly and joined only to the feed it describes', () => {
  it('names the artifact URL beside the feed for NFL only', () => {
    expect(distributionsUrl('NFL')).toBe('https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/projection-data/projections/nfl/distributions/latest.json');
    for (const s of ['CFB', 'NBA', 'MLB', 'NHL'] as const) expect(distributionsUrl(s)).toBeNull();
  });
  it('the real feed alone has no quantiles; with its artifact Kittle and McCaffrey receptions carry seven coherent ones', () => {
    const bare = decodeProjections(rawFeed)!;
    expect(findProjection(bare, { playerId: KITTLE, stat: 'receptions' })!.quantiles).toBeNull();
    const doc = joined()!;
    const k = findProjection(doc, { playerId: KITTLE, stat: 'receptions' })!;
    const m = findProjection(doc, { playerId: MCCAFFREY, stat: 'receptions' })!;
    expect(k.quantileBasis).toBe('pmf');
    expect(k.quantiles).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 });
    expect(m.quantiles).toEqual({ p05: 1, p10: 2, p25: 3, p50: 5, p75: 6, p90: 8, p95: 9 });
    for (const p of [k, m]) {
      expect(quantileProblems(p)).toEqual([]);
      expect(displayState(doc, p, NOW).kind).toBe('shown');
      expect([p.p10, p.median, p.p90]).toEqual([p.quantiles!.p10, p.quantiles!.p50, p.quantiles!.p90]);   // the row's own summary numbers are the quantiles'
    }
  });
  it('every family the publisher reproduced carries its distribution (completions, targets, receptions, yards, touchdowns)', () => {
    const doc = joined()!;
    for (const fam of ['completions', 'receptions', 'targets', 'receiving_yards', 'anytime_td', 'passing_attempts']) {
      for (const p of doc.players.filter((x) => x.family === fam)) expect(p.quantiles, `${p.name} ${fam}`).not.toBeNull();
    }
    expect(doc.players.length).toBe(rawFeed.players.length);                  // nothing is added or dropped
  });
  it('the join never changes a published number: mean, median, range, gate, participation are the feed’s, and its rungs sit in the ladder', () => {
    const a = decodeProjections(rawFeed)!, b = joined()!;
    for (const p of a.players) {
      const q = b.players.find((x) => x.playerId === p.playerId && x.family === p.family)!;
      expect({ ...q, quantiles: null, quantileBasis: null, thresholds: [] }).toEqual({ ...p, quantiles: null, quantileBasis: null, thresholds: [] });
      for (const t of p.thresholds) expect(Math.abs(q.thresholds.find((x) => x.k === t.k)!.p - t.p)).toBeLessThanOrEqual(1.5e-4);   // the feed's own rungs are in the ladder, to their 4-decimal rounding
    }
  });
  it('an artifact built for a different feed (generated_utc differs) is ignored whole', () => {
    const doc = joined(undefined, (d) => { d.projection.generated_utc = '2026-10-19T01:30:00Z'; })!;
    expect(doc.players.every((p) => p.quantiles === null)).toBe(true);
    expect(resolveKittle(doc).kind).toBe('authoritative');                    // the projection itself is untouched
  });
  it('a row whose pmf does not reproduce the feed’s row is not given a distribution', () => {
    for (const patch of [
      (d: any) => { distRow(d, KITTLE, 'receptions').mean = 5.2; },           // eslint-disable-line @typescript-eslint/no-explicit-any
      (d: any) => { distRow(d, KITTLE, 'receptions').survival['5'] = 0.61; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    ]) {
      const doc = joined(undefined, patch)!;
      expect(findProjection(doc, { playerId: KITTLE, stat: 'receptions' })!.quantiles).toBeNull();
      expect(findProjection(doc, { playerId: MCCAFFREY, stat: 'receptions' })!.quantiles).not.toBeNull();   // other rows are unaffected
    }
    const doc = joined((f) => { feedRow(f, KITTLE, 'receptions').mean = 5.6; })!;      // the feed moved on; the artifact is for an older forecast
    expect(findProjection(doc, { playerId: KITTLE, stat: 'receptions' })!.quantiles).toBeNull();
  });
  it('a malformed artifact is no artifact; a malformed row is dropped alone', () => {
    expect(decodeDistributions(null)).toBeNull();
    expect(decodeDistributions({ ...rawDist, schema: 'sift.projection_distributions.v2' })).toBeNull();
    expect(decodeDistributions({ ...rawDist, distribution: { quantile_rule: 'linear interpolation' } })).toBeNull();
    expect(decodeDistributions({ ...rawDist, projection: {} })).toBeNull();
    const bad = clone(rawDist);
    const row = distRow(bad, KITTLE, 'receptions');
    row.quantiles.p25 = 99;                                                    // unordered
    distRow(bad, MCCAFFREY, 'receptions').quantiles.p05 = -1;                  // negative
    const d = decodeDistributions(bad)!;
    expect(d.rows.size).toBe(rawDist.rows.length - 2);
  });
  it('rows that contradict themselves are dropped: median, range, or a line the quantiles rule out', () => {
    const cases: [string, (r: any) => void][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      ['median', (r) => { r.quantiles.p50 = 6; }],
      ['p10 vs range', (r) => { r.quantiles.p10 = 3; r.quantiles.p25 = 3; }],
      ['a line above p90 priced as likely', (r) => { r.survival['9'] = 0.4; r.survival['10'] = 0.3; r.survival['11'] = 0.2; }],
      ['a line below p10 priced as unlikely', (r) => { r.survival['2'] = 0.5; r.survival['3'] = 0.4; }],
      ['a probability outside 0-1', (r) => { r.survival['6'] = 1.4; }],
      ['a higher line more likely', (r) => { r.survival['6'] = 0.9; }],
      ['a non-integer quantile', (r) => { r.quantiles.p25 = 3.5; }],
      ['a non-finite value', (r) => { r.quantiles.p75 = null; }],
    ];
    for (const [name, patch] of cases) {
      const d = clone(rawDist);
      patch(distRow(d, KITTLE, 'receptions'));
      const dec = decodeDistributions(d)!;
      expect(dec.rows.has(`${rawDist.rows[0].game_id}|${KITTLE}|receptions`), name).toBe(false);
    }
  });
});

describe('one selected projection: value, range, drawing and probability of the over agree', () => {
  const r = resolveKittle(joined());
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
  const board = propBoard(ev, det, undefined, makeAuthority('NFL', joined(), NOW));
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
  it('without the artifact the projection and its 80% range stand, with no drawing and no model probability off the study rungs', () => {
    const bare = propBoard(ev, det, undefined, makeAuthority('NFL', decodeProjections(rawFeed), NOW));
    const k = bare.rows.find((x) => x.name === 'George Kittle' && x.def.stat === 'receptions')!;
    expect(k.projection).toBe(5.077);
    expect(k.distribution).toBeNull();
    expect(k.range).toBeNull();
    expect(k.predictionRange).toEqual({ lo: 2, hi: 8 });
    expect(k.ladder.some((x) => x.threshold === 6 && x.modelP === null)).toBe(true);     // the 6+ line is not on the study's ladder
  });
});

describe('a feed that embeds its own quantiles (the declared pmf basis) is held to the same coherence', () => {
  /** The artifact's row folded into the feed row, as a publisher that embeds the distribution would write it. */
  const embedded = (patch?: (row: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const f = clone(rawFeed);
    const r = distRow(rawDist, KITTLE, 'receptions');
    const p = feedRow(f, KITTLE, 'receptions');
    p.quantiles = clone(r.quantiles);
    p.thresholds = clone(r.survival);
    patch?.(p);
    f.distribution = { schema: 'sift.projection_distribution.v1', quantile_rule: 'smallest integer x with P(X <= x) >= level, from the same integer pmf as the mean and the threshold probabilities' };
    return resolveKittle(decodeProjections(f));
  };
  it('is shown when it coheres', () => {
    const r = embedded();
    expect(r.kind === 'authoritative' && r.value.quantiles?.p50).toBe(5);
  });
  it('is withheld whole when quantiles contradict the row’s median, range or probabilities', () => {
    for (const patch of [
      (p: any) => { p.quantiles.p50 = 6; },                                           // eslint-disable-line @typescript-eslint/no-explicit-any
      (p: any) => { p.quantiles.p90 = 9; p.quantiles.p95 = 10; },                     // eslint-disable-line @typescript-eslint/no-explicit-any
      (p: any) => { p.thresholds['9'] = 0.4; p.thresholds['10'] = 0.3; },             // eslint-disable-line @typescript-eslint/no-explicit-any
      (p: any) => { p.quantiles.p25 = 3.5; },                                         // eslint-disable-line @typescript-eslint/no-explicit-any
    ]) {
      const r = embedded(patch);
      expect(r.kind).toBe('withheld');
      if (r.kind === 'withheld') expect(r.code).toBe('INCOHERENT');
    }
  });
  it('without the pmf declaration the quantiles are not cross-checked (other sports are unchanged)', () => {
    const f = clone(rawFeed);
    const p = feedRow(f, KITTLE, 'receptions');
    p.quantiles = { ...distRow(rawDist, KITTLE, 'receptions').quantiles, p50: 6 };
    const doc = decodeProjections(f)!;
    expect(findProjection(doc, { playerId: KITTLE, stat: 'receptions' })!.quantileBasis).toBeNull();
    expect(resolveKittle(doc).kind).toBe('authoritative');
  });
  it('unordered, negative, non-finite or half-valid embedded sets are ignored: the projection stays, the drawing does not', () => {
    for (const q of [
      { p05: 1, p10: 2, p25: 9, p50: 5, p75: 7, p90: 8, p95: 10 }, { p05: -1, p10: 2, p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 },
      { p05: 1, p10: 2, p25: 3, p50: null, p75: 7, p90: 8, p95: 10 }, { p05: 1, p10: 'x', p25: 3, p50: 5, p75: 7, p90: 8, p95: 10 }, { p05: 1, p25: 3, p50: 5, p75: 7 },
    ]) {
      const f = clone(rawFeed);
      feedRow(f, KITTLE, 'receptions').quantiles = q;
      const r = resolveKittle(decodeProjections(f));
      expect(r.kind, JSON.stringify(q)).toBe('authoritative');
      expect(r.kind === 'authoritative' && r.value.quantiles).toBeNull();
    }
  });
});

describe('unavailable, stale, ruled-out and malformed feeds', () => {
  it('a ruled-out or blocked player has no number and no distribution', () => {
    for (const patch of [
      (f: any) => { feedRow(f, KITTLE, 'receptions').participation.status = 'CONFIRMED_OUT'; }, // eslint-disable-line @typescript-eslint/no-explicit-any
      (f: any) => { feedRow(f, KITTLE, 'receptions').gate = { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Listed OUT', category: 'availability', action: '' }] }; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    ]) expect(resolveKittle(joined(patch)).kind).toBe('withheld');
  });
  it('stale inputs withhold the distribution along with the number', () => {
    const r = resolveKittle(joined(), NOW + 400 * 3600_000);
    expect(r.kind).toBe('withheld');
    expect(r.kind === 'withheld' && r.code).toBe('STALE');
  });
  it('a missing or malformed feed gives no projection at all, never a drawing', () => {
    expect(decodeProjections(null)).toBeNull();
    expect(decodeProjections({ ...rawFeed, schema: 'sift.projections.v2' })).toBeNull();
    expect(attachDistributions(null, decodeDistributions(rawDist))).toBeNull();
    const r = makeAuthority('NFL', null, NOW).resolve({ stat: 'receptions', playerId: KITTLE, name: 'George Kittle', team: 'SF' });
    expect(r.kind).toBe('withheld');
  });
  it('quantiles are never reconstructed from the other published numbers', () => {
    const p = findProjection(decodeProjections(rawFeed), { playerId: KITTLE, stat: 'receptions' }) as PlayerProjection;
    expect(p.quantiles).toBeNull();
    expect([p.p10, p.median, p.p90]).toEqual([2, 5, 8]);
  });
});
