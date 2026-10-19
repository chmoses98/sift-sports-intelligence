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
    const r = teams('CFB', { team_points: {}, plays: {} }).resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213', startUtc: '2026-10-18T23:30:00Z' });
    expect(r.kind).toBe('authoritative');
    if (r.kind === 'authoritative') expect(r.teams.map((t) => t.team)).toEqual(['Penn State', 'Ohio State']);       // away first, the feed's own names
  });
  it('keeps the established model for held team families and withholds a stale or unmatched game', () => {
    const nflTeams = makeAuthority('NFL', decoded('NFL', [], { team_points: {} }, [{ ...cfbGame }]), NOW);
    expect(nflTeams.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' })).toEqual({ kind: 'legacy' });   // NFL team points: held
    expect(makeAuthority('CFB', decoded('CFB', [], { team_points: {} }, [cfbGame]), NOW + 20 * 864e5).resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' }).kind).toBe('withheld');
    expect(teams('CFB', { team_points: {} }).resolveTeams({ family: 'team_points', home: 'MICH', away: 'IOWA' }).kind).toBe('withheld');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The approved established-model fallback.
import { approvalFor, APPROVALS } from '../src/lib/projectionApprovals';
import { legacyFallbackProblems, type LegacyCandidate } from '../src/lib/projectionFallback';
import { usesEstablished } from '../src/lib/projectionAuthority';

const good = (over: Partial<LegacyCandidate> = {}): LegacyCandidate => ({
  mean: 21.9, interval: { lo: 14, hi: 30 }, generatedAt: new Date(NOW - 5 * 3.6e6).toISOString(), designation: null, line: 23.5, checkLine: true, ...over,
});
const QB = { stat: 'completions', playerId: '00-0036900', name: "Ja'Marr Chase", team: 'CIN', opponent: 'PIT' };
const qb = (over: object = {}) => nflPlayer({ family: 'completions', mean: 22, p10: 17, p90: 27, thresholds: { '18': 0.9, '22': 0.5 }, ...over });
const stale = new Date(NOW - 12 * 864e5).toISOString();

describe('which stats may fall back (explicit approvals)', () => {
  it('only promoted stats that already have a production number SIFT shows, never a descriptive baseline', () => {
    const fb = APPROVALS.filter((a) => a.fallback).map((a) => `${a.sport}:${a.family}`).sort();
    expect(fb).toEqual(['MLB:outs', 'MLB:pitcher_strikeouts', 'NFL:completions', 'NFL:receptions']);
    for (const a of APPROVALS.filter((x) => x.fallback)) {
      expect(a.decision).toBe('PROMOTED');
      expect(a.competingProductionNumber).toBe(true);
      expect(a.fallback!.engine).toBe('legacy');
      expect(a.fallback!.approval).toMatch(/Owner-approved/);
    }
    expect(approvalFor('CFB', 'team_points')!.fallback).toBeNull();      // the script engine's baseline points are "not a projection"
    expect(approvalFor('NFL', 'receptions')!.fallback!.requiresKnownSegments).toBe(true);
  });
});

describe('fallback happens only when the feed is missing, stale or has not published the game, and the established number passes its own checks', () => {
  it('feed missing: the established projection is shown alone, with the trigger', () => {
    const r = makeAuthority('NFL', null, NOW).resolve(QB, good());
    expect(r).toEqual({ kind: 'fallback', trigger: 'FEED_UNAVAILABLE', reason: 'the projection feed is unavailable right now' });
    expect(usesEstablished(r)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/\b22\b|21\.9/);                  // the resolution carries no number: the page reads the established one
  });
  it('feed stale', () => {
    const a = makeAuthority('NFL', decoded('NFL', [qb({ data_asof_utc: stale })], { completions: {} }), NOW);
    expect(a.resolve(QB, good())).toMatchObject({ kind: 'fallback', trigger: 'STALE' });
  });
  it('game not yet in the feed (outside its window) — but a player missing from a game the feed covers is NOT a fallback case', () => {
    const doc = decoded('NFL', [qb({ team: 'BAL', opponent: 'CLE', player_id: 'x', name: 'Someone Else' })], { completions: {} });
    const a = makeAuthority('NFL', doc, NOW);
    expect(a.resolve({ ...QB, team: 'CIN', opponent: 'PIT' }, good())).toMatchObject({ kind: 'fallback', trigger: 'NOT_PUBLISHED' });
    const covered = makeAuthority('NFL', decoded('NFL', [qb({ player_id: 'other', name: 'Other QB' })], { completions: {} }), NOW);
    expect(covered.resolve({ ...QB, playerId: 'zzz', name: 'Backup QB' }, good())).toMatchObject({ kind: 'withheld', code: 'NOT_PROJECTED' });
  });
  it('a fresh, healthy feed row is always the number: the established model is not even consulted', () => {
    const a = makeAuthority('NFL', decoded('NFL', [qb()], { completions: {} }), NOW);
    expect(a.resolve(QB, good()).kind).toBe('authoritative');
    expect(a.resolve(QB, null).kind).toBe('authoritative');
  });
  it('a stat with no approval is withheld, however good the established number is', () => {
    const r = makeAuthority('NFL', null, NOW).resolve({ stat: 'targets', playerId: 'p', name: 'X', team: 'CIN' }, good());
    expect(r).toMatchObject({ kind: 'withheld', code: 'FEED_UNAVAILABLE' });
    expect((r as { fallbackEligible?: boolean }).fallbackEligible).toBeUndefined();
  });
  it('without an established candidate to check the page cannot fall back: eligible but withheld', () => {
    const r = makeAuthority('NFL', null, NOW).resolve(QB);
    expect(r).toMatchObject({ kind: 'withheld', code: 'FEED_UNAVAILABLE', fallbackEligible: true });
  });
});

describe('the fallback never applies to a structural problem, an absent player, or unverifiable information', () => {
  const stalePlayer = (over: object) => makeAuthority('NFL', decoded('NFL', [qb({ data_asof_utc: stale, ...over })], { completions: {} }), NOW).resolve(QB, good());
  it('player out (confirmed or likely), even though the feed is stale', () => {
    expect(stalePlayer({ participation: part('CONFIRMED_OUT') })).toMatchObject({ kind: 'withheld', code: 'OUT' });
    expect(stalePlayer({ participation: part('LIKELY_OUT') })).toMatchObject({ kind: 'withheld', code: 'OUT' });
  });
  it('quality gate BLOCK, an incoherent distribution, a family no longer READY', () => {
    expect(stalePlayer({ gate: { status: 'BLOCK', findings: [{ check: 'x', severity: 'BLOCK', what: 'bad input', category: 'c', action: '' }] } })).toMatchObject({ code: 'GATE_BLOCK' });
    expect(stalePlayer({ p10: 30, p90: 10 })).toMatchObject({ code: 'INCOHERENT' });
    const a = makeAuthority('NFL', decoded('NFL', [qb()], { completions: { readiness: 'NEEDS IMPROVEMENT' } }), NOW);
    expect(a.resolve(QB, good())).toMatchObject({ kind: 'withheld', code: 'FAMILY_NOT_READY' });
  });
  it('a first game with a new team (a documented defect) on a stale row', () => {
    const r = stalePlayer({ segments: { new_team_first4: true, tier: 'starter', backup: false, rookie: false } });
    expect(r).toMatchObject({ kind: 'withheld', code: 'STALE' });
    expect((r as { fallbackEligible?: boolean }).fallbackEligible).toBeUndefined();
  });
  it('receptions: no feed row means no evidence the player is outside the new-team defect, so no fallback; a stale row that shows he is not is enough', () => {
    const recQ = { stat: 'receptions', playerId: '00-0036900', team: 'CIN', opponent: 'PIT' };
    expect(makeAuthority('NFL', null, NOW).resolve(recQ, good())).toMatchObject({ kind: 'withheld', code: 'FEED_UNAVAILABLE' });
    const notYet = makeAuthority('NFL', decoded('NFL', [nflPlayer({ team: 'BAL', opponent: 'CLE', player_id: 'x', name: 'S' })], { receptions: {} }), NOW);
    expect(notYet.resolve(recQ, good()).kind).toBe('withheld');
    const staleOk = makeAuthority('NFL', decoded('NFL', [nflPlayer({ data_asof_utc: stale })], { receptions: {} }), NOW);
    expect(staleOk.resolve(recQ, good())).toMatchObject({ kind: 'fallback', trigger: 'STALE' });
    const staleNew = makeAuthority('NFL', decoded('NFL', [nflPlayer({ data_asof_utc: stale, segments: { new_team_first4: true, tier: 'starter', backup: false, rookie: false } })], { receptions: {} }), NOW);
    expect(staleNew.resolve(recQ, good()).kind).toBe('withheld');
    const noSegments = makeAuthority('NFL', decoded('NFL', [nflPlayer({ data_asof_utc: stale, segments: undefined })], { receptions: {} }), NOW);
    expect(noSegments.resolve(recQ, good()).kind).toBe('withheld');       // segments not published = cannot rule the defect out
  });
  it('MLB: an unconfirmed starter is withheld by the feed check, and the fallback needs the publisher to project him as a starter', () => {
    const mq = { stat: 'pitcher_strikeouts', name: 'Tyler Glasnow', team: 'LAD' };
    const cand = good({ mean: 7.4, interval: { lo: 4, hi: 11 }, line: null, checkLine: false, starter: true });
    expect(makeAuthority('MLB', null, NOW).resolve(mq, cand)).toMatchObject({ kind: 'fallback' });
    expect(makeAuthority('MLB', null, NOW).resolve(mq, { ...cand, starter: false })).toMatchObject({ kind: 'withheld' });
    const unverified = makeAuthority('MLB', decoded('MLB', [mlbPitcher({ participation: part('UNVERIFIED'), data_asof_utc: stale })], { pitcher_strikeouts: {} }), NOW);
    expect(unverified.resolve(mq, cand)).toMatchObject({ kind: 'withheld', code: 'OUT' });
  });
});

describe('the established projection must pass its own freshness, availability and quality checks', () => {
  const run = (c: LegacyCandidate | null) => makeAuthority('NFL', null, NOW).resolve(QB, c);
  const reason = (r: ReturnType<typeof run>) => (r.kind === 'withheld' ? r.reason : '');
  it('freshness: old, undated or future-dated publications fail', () => {
    expect(reason(run(good({ generatedAt: stale })))).toMatch(/published 288h ago, older than the 192h/);
    expect(reason(run(good({ generatedAt: null })))).toMatch(/publication time is unknown/);
    expect(reason(run(good({ generatedAt: new Date(NOW + 5 * 3.6e6).toISOString() })))).toMatch(/in the future/);
  });
  it('availability: any designation beyond active/probable/available fails (injury, doubtful, questionable, suspended)', () => {
    for (const d of ['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'INJURED_RESERVE', 'SUSPENDED']) expect(run(good({ designation: d })).kind, d).toBe('withheld');
    for (const d of [null, 'ACTIVE', 'PROBABLE', 'AVAILABLE']) expect(run(good({ designation: d })).kind, String(d)).toBe('fallback');
  });
  it('quality: missing, negative or NaN mean; inverted range; mean outside its range; line outside the simulated range; no range', () => {
    expect(run(good({ mean: null })).kind).toBe('withheld');
    expect(run(good({ mean: -1 })).kind).toBe('withheld');
    expect(run(good({ mean: Number.NaN })).kind).toBe('withheld');
    expect(reason(run(good({ interval: { lo: 30, hi: 14 } })))).toMatch(/inverted/);
    expect(reason(run(good({ mean: 60 })))).toMatch(/outside its own range/);
    expect(reason(run(good({ line: 45 })))).toMatch(/pricing different roles/);
    expect(reason(run(good({ interval: null })))).toMatch(/no range/);
    expect(run(null)).toMatchObject({ kind: 'withheld' });
  });
  it('a failed check keeps the withheld reason and adds why the established number was not used; no number either way', () => {
    const r = run(good({ designation: 'QUESTIONABLE' }));
    expect(r).toMatchObject({ kind: 'withheld', code: 'FEED_UNAVAILABLE' });
    expect(reason(r)).toBe('the projection feed is unavailable right now, and the established projection could not be used: the player is listed questionable');
    expect((r as { fallbackEligible?: boolean }).fallbackEligible).toBeUndefined();
  });
  it('legacyFallbackProblems is pure and sport-aware (MLB freshness limit is 36h)', () => {
    expect(legacyFallbackProblems('MLB', 'outs', good({ generatedAt: new Date(NOW - 40 * 3.6e6).toISOString(), checkLine: false }), NOW)[0]).toMatch(/older than the 36h/);
    expect(legacyFallbackProblems('NFL', 'completions', good({ generatedAt: new Date(NOW - 40 * 3.6e6).toISOString() }), NOW)).toEqual([]);
  });
});

describe('a family that does not meet the publication standard is withheld', () => {
  it('CFB success rate: withheld for the team line even with a fresh feed; plays still shown', () => {
    const game = { ...cfbGame, teams: [...cfbGame.teams, { team: 'Penn State', team_id: '213', family: 'success_rate', mean: 0.43, p10: 0.35, p90: 0.51 }, { team: 'Ohio State', team_id: '194', family: 'success_rate', mean: 0.47, p10: 0.39, p90: 0.55 }] };
    const a = makeAuthority('CFB', decoded('CFB', [], { team_points: {}, plays: {}, success_rate: {} }, [game]), NOW);
    const sr = a.resolveTeams({ family: 'success_rate', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' });
    expect(sr).toMatchObject({ kind: 'withheld', code: 'FAMILY_NOT_READY', reason: 'the projection does not yet meet SIFT’s publication standard for this stat' });
    expect(a.resolveTeams({ family: 'plays', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' }).kind).toBe('authoritative');
  });
  it('families published with caveats never read as High reliability and say why', () => {
    const a = makeAuthority('CFB', decoded('CFB', [], { team_passing_yards: {}, team_points: {} }, [{ ...cfbGame, teams: [
      { team: 'Penn State', team_id: '213', family: 'team_passing_yards', mean: 230, p10: 150, p90: 310 }, { team: 'Ohio State', team_id: '194', family: 'team_passing_yards', mean: 250, p10: 170, p90: 330 },
      { team: 'Penn State', team_id: '213', family: 'team_points', mean: 21.4, p10: 10, p90: 33 }, { team: 'Ohio State', team_id: '194', family: 'team_points', mean: 28.3, p10: 17, p90: 40 }] }]), NOW);
    const yds = a.resolveTeams({ family: 'team_passing_yards', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' });
    const pts = a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' });
    expect(yds.kind === 'authoritative' && yds.teams[0].value).toMatchObject({ reliability: 'MODERATE' });
    expect(yds.kind === 'authoritative' && yds.teams[0].value.reliabilityWhy.join(' ')).toMatch(/slightly wide/);
    expect(pts.kind === 'authoritative' && pts.teams[0].value.reliability).toBe('HIGH');
  });
});

describe('CFB team join uses the feed’s ESPN ids (it publishes names, not SIFT’s contract codes)', () => {
  const a = makeAuthority('CFB', decoded('CFB', [], { team_points: {} }, [cfbGame]), NOW);
  it('matches by id when codes and names differ, and never by a code that merely looks similar', () => {
    expect(a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' }).kind).toBe('authoritative');
    expect(a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU' })).toMatchObject({ kind: 'withheld', code: 'NOT_PUBLISHED' });   // no ids, names are not codes
    expect(a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '999' })).toMatchObject({ code: 'NOT_PUBLISHED' });
    expect(a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '213', awayId: '194' }).kind).toBe('authoritative');      // sides swapped: still the same game
  });
  it('orders by the away id', () => {
    const r = a.resolveTeams({ family: 'team_points', home: 'OSU', away: 'PSU', homeId: '194', awayId: '213' });
    expect(r.kind === 'authoritative' && r.teams.map((t) => t.team)).toEqual(['Penn State', 'Ohio State']);
  });
});
