// The authoritative projection: one number per stat from the one approved engine, and a withheld reason — never the
// other engine's number — when a promoted projection fails a critical check.
import { describe, expect, it } from 'vitest';
import { makeAuthority, thresholdProbability, typicalWidth } from '../src/lib/projectionAuthority';
import { parseRollback } from '../src/lib/projectionApprovals';
import { decodeProjections } from '../src/lib/projections';
import { cfbGame, decoded, feed, FRESH, mlbPitcher, NOW, nflPlayer, part } from './support/projectionFeed';

const RECEPTIONS = { receptions: {} };
const nfl = (players = [nflPlayer()], families: Record<string, object> = RECEPTIONS, now = NOW) => makeAuthority('NFL', decoded('NFL', players, families), now);
const q = { stat: 'receptions', playerId: '00-0036900' };

describe('which engine answers', () => {
  it('a legacy stat is left to the established model: no foundation number is produced', () => {
    const a = nfl([nflPlayer({ family: 'passing_tds', mean: 1.4 })], { passing_tds: {} });
    expect(a.resolve({ stat: 'passing_tds', playerId: '00-0036900' })).toEqual({ kind: 'legacy' });
    expect(a.resolve({ stat: 'receiving_yards', playerId: '00-0036900' })).toEqual({ kind: 'legacy' });   // held on the new-team defect
  });
  it('a promoted stat returns one value with range, reliability, availability, update time and context', () => {
    const r = nfl().resolve(q);
    expect(r.kind).toBe('authoritative');
    if (r.kind !== 'authoritative') return;
    const v = r.value;
    expect([v.mean, v.p10, v.p90]).toEqual([6.4, 3, 10]);
    expect(v.quantiles).toEqual({ p05: 2, p25: 4, p50: 6, p75: 8, p95: 11 });
    expect(v.reliability).toBe('HIGH');
    expect(v.availability?.status).toBe('CONFIRMED_ACTIVE');
    expect(v.updatedAt).toBe(FRESH);
    expect(v.opportunity?.family).toBe('targets');
    expect(v.modelVersion).toBe('pf-1.2.1');
  });
  it('rolls one family back to legacy without touching the others', () => {
    const rb = parseRollback('NFL:receptions=legacy');
    const doc = decoded('NFL', [nflPlayer(), nflPlayer({ family: 'completions', mean: 22 })], { receptions: {}, completions: {} });
    const a = makeAuthority('NFL', doc, NOW, rb);
    expect(a.resolve(q)).toEqual({ kind: 'legacy' });
    expect(a.resolve({ stat: 'completions', playerId: '00-0036900' }).kind).toBe('authoritative');
  });
});

describe('critical checks withhold the promoted number and never substitute the other engine', () => {
  const withheld = (r: ReturnType<ReturnType<typeof nfl>['resolve']>) => (r.kind === 'withheld' ? r.code : r.kind);
  it('feed missing or unreachable', () => {
    expect(withheld(makeAuthority('NFL', null, NOW).resolve(q))).toBe('FEED_UNAVAILABLE');
  });
  it('family not published, or not READY in the feed', () => {
    expect(withheld(nfl([nflPlayer()], {}).resolve(q))).toBe('FAMILY_NOT_PUBLISHED');
    expect(withheld(nfl([nflPlayer()], { receptions: { readiness: 'NEEDS IMPROVEMENT' } }).resolve(q))).toBe('FAMILY_NOT_READY');
  });
  it('player outside the projection population', () => {
    expect(withheld(nfl().resolve({ stat: 'receptions', playerId: 'nobody', name: 'Nobody', team: 'CIN' }))).toBe('NOT_PROJECTED');
  });
  it('gate BLOCK carries the gate’s own reason', () => {
    const r = nfl([nflPlayer({ gate: { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] } })]).resolve(q);
    expect(r).toEqual({ kind: 'withheld', code: 'GATE_BLOCK', reason: 'Player listed OUT' });
  });
  it('confirmed or likely out, even if the feed forgot to BLOCK', () => {
    expect(withheld(nfl([nflPlayer({ participation: part('CONFIRMED_OUT') })]).resolve(q))).toBe('OUT');
    expect(withheld(nfl([nflPlayer({ participation: part('LIKELY_OUT') })]).resolve(q))).toBe('OUT');
  });
  it('incoherent distributions', () => {
    expect(withheld(nfl([nflPlayer({ thresholds: { '4': 0.5, '6': 0.6 } })]).resolve(q))).toBe('INCOHERENT');
    expect(withheld(nfl([nflPlayer({ p10: 12, p90: 3 })]).resolve(q))).toBe('INCOHERENT');
  });
  it('stale inputs beyond the sport’s freshness limit', () => {
    expect(withheld(nfl([nflPlayer()], RECEPTIONS, NOW + 10 * 864e5).resolve(q))).toBe('STALE');
    // no timestamp anywhere: an unknown age is not fresh
    const raw = feed('NFL', [nflPlayer({ data_asof_utc: undefined })], RECEPTIONS);
    delete raw.data_asof_utc;
    expect(withheld(makeAuthority('NFL', decodeProjections(raw), NOW).resolve(q))).toBe('STALE');
  });
  it('a withheld result has no value for any consumer to render', () => {
    const r = nfl([nflPlayer({ participation: part('CONFIRMED_OUT') })]).resolve(q);
    expect(JSON.stringify(r)).not.toMatch(/6\.4/);
  });
});

describe('a player listed for two games', () => {
  const two = [nflPlayer({ game_id: 'g1', opponent: 'PIT', mean: 6.4 }), nflPlayer({ game_id: 'g2', opponent: 'BAL', mean: 3.1 })];
  it('is matched to the right game by opponent, and left unmatched when it cannot be told', () => {
    const a = nfl(two);
    const r = a.resolve({ ...q, opponent: 'BAL' });
    expect(r.kind === 'authoritative' && r.value.mean).toBe(3.1);
    expect(a.resolve({ ...q, opponent: 'PIT' }).kind === 'authoritative').toBe(true);
    expect(a.resolve(q)).toMatchObject({ kind: 'withheld', code: 'NOT_PROJECTED' });   // never the wrong game's number
  });
});

describe('reliability is data quality, lowered with a stated reason', () => {
  const rel = (over: object) => { const r = nfl([nflPlayer(over)]).resolve(q); return r.kind === 'authoritative' ? r.value : null; };
  it('first games with a new team are LOW and say why, with no unvalidated correction applied', () => {
    const v = rel({ segments: { new_team_first4: true, tier: 'starter', backup: false, rookie: false } })!;
    expect(v.reliability).toBe('LOW');
    expect(v.reliabilityWhy.join(' ')).toMatch(/new team/);
    expect(v.mean).toBe(6.4);
  });
  it('unverified or uncertain availability is LOW (conditional on playing); a likely starter is MODERATE', () => {
    expect(rel({ participation: part('UNVERIFIED') })!.reliability).toBe('LOW');
    expect(rel({ participation: part('UNCERTAIN') })!.reliability).toBe('LOW');
    expect(rel({ participation: part('LIKELY_ACTIVE') })!.reliability).toBe('MODERATE');
  });
  it('REVIEW findings and backup/rookie roles lower it to MODERATE', () => {
    expect(rel({ gate: { status: 'REVIEW', findings: [{ check: 'x', severity: 'REVIEW', what: 'Wide interval', category: 'c', action: '' }] } })!.reliability).toBe('MODERATE');
    expect(rel({ segments: { new_team_first4: false, tier: 'backup', backup: true, rookie: false } })!.reliability).toBe('MODERATE');
  });
});

describe('MLB pitchers need a confirmed or probable starter', () => {
  const mlb = (p: object) => makeAuthority('MLB', decoded('MLB', [mlbPitcher(p)], { pitcher_strikeouts: {} }), NOW).resolve({ stat: 'pitcher_strikeouts', name: 'Tyler Glasnow', team: 'LAD' });
  it('shows a confirmed or probable starter', () => {
    expect(mlb({}).kind).toBe('authoritative');
    expect(mlb({ participation: part('LIKELY_ACTIVE', { source: 'mlb_probable_pitcher' }) }).kind).toBe('authoritative');
  });
  it('withholds a replaced, unverified or uncertain probable', () => {
    for (const s of ['UNVERIFIED', 'UNCERTAIN', 'CONFIRMED_OUT', 'LIKELY_OUT']) expect(mlb({ participation: part(s) }).kind, s).toBe('withheld');
  });
  it('joins across spellings of the team code', () => {
    const r = makeAuthority('MLB', decoded('MLB', [mlbPitcher({ team: 'AZ' })], { pitcher_strikeouts: {} }), NOW).resolve({ stat: 'pitcher_strikeouts', name: 'Tyler Glasnow', team: 'ARI' });
    expect(r.kind).toBe('authoritative');
  });
  it('maps pitcher_outs onto the engine’s outs family', () => {
    const a = makeAuthority('MLB', decoded('MLB', [mlbPitcher({ family: 'outs', mean: 17.5 })], { outs: {} }), NOW);
    expect(a.resolve({ stat: 'pitcher_outs', name: 'Tyler Glasnow', team: 'LAD' }).kind).toBe('authoritative');
  });
});

describe('probabilities and ranges come from the selected projection', () => {
  it('rung probabilities are the selected distribution’s own; a rung off its ladder has none, never the old model’s', () => {
    const r = nfl().resolve(q);
    if (r.kind !== 'authoritative') throw new Error('expected a value');
    expect(thresholdProbability(r.value, 6)).toBe(0.55);
    expect(thresholdProbability(r.value, 5)).toBeNull();
    expect(typicalWidth(r.value)).toBeCloseTo(0.526 * 7, 6);
  });
});

describe('team projections', () => {
  const teams = (sport: string, families: Record<string, object>, over: Record<string, unknown> = {}) =>
    makeAuthority('CFB', decoded(sport, [], families, [{ ...cfbGame, ...over }]), NOW);
  it('returns both teams for a promoted CFB family, away first', () => {
    const r = teams('CFB', { team_points: {}, plays: {} }).resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', startUtc: '2026-10-18T23:30:00Z' });
    expect(r.kind).toBe('authoritative');
    if (r.kind === 'authoritative') expect(r.teams.map((t) => t.team)).toEqual(['PSU', 'OSU']);
  });
  it('keeps the established model for held team families and withholds a stale or unmatched game', () => {
    const nflTeams = makeAuthority('NFL', decoded('NFL', [], { team_points: {} }, [{ ...cfbGame }]), NOW);
    expect(nflTeams.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU' })).toEqual({ kind: 'legacy' });   // NFL team points: held
    expect(makeAuthority('CFB', decoded('CFB', [], { team_points: {} }, [cfbGame]), NOW + 20 * 864e5).resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU' }).kind).toBe('withheld');
    expect(teams('CFB', { team_points: {} }).resolveTeams({ family: 'team_points', home: 'MICH', away: 'IOWA' }).kind).toBe('withheld');
  });
});
