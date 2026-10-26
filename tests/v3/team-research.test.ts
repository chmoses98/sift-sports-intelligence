// Team Research view-models against REAL published documents (trimmed copies in tests/v3/fixtures, captured 2026-10-26).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntityProfileDoc, ExplorerIndexDoc, MetricDef } from '../../src/contract/types';
import { nextGame, normalizeTeamProfile, scheduleOf } from '../../src/v3/data/research/normalize';
import {
  availabilityCounts, availabilityOf, completedGames, extremesOf, fmtValue, halves, identityOf, isAdjustedId, lastN, marginScale, metricLookup, nextGameOf,
  observe, opponentUnits, parseAvailability, profileOf, propCountsOf, resolveWindow, scheduleSummary, seasonGames, seasonSpan, skillPlayersOf, splitsOf, upcomingOf, windowKey, windowWord,
} from '../../src/v3/model/teamResearch';
import { teamSport } from '../../src/v3/model/teamSports';

const load = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/${f}`, 'utf8')) as T;
const nflDefs = new Map(load<{ items: MetricDef[] }>('nfl-metrics-team.json').items.map((d) => [d.metric_id, d]));
const nhlDefs = new Map(load<{ items: MetricDef[] }>('nhl-metrics-team.json').items.map((d) => [d.metric_id, d]));
const nflIdx = load<ExplorerIndexDoc>('nfl-index-slim.json');
const nhlIdx = load<ExplorerIndexDoc>('nhl-index-slim.json');
const dal = normalizeTeamProfile(load<EntityProfileDoc>('nfl-team-dal-full.json'), 'nfl');
const phi = normalizeTeamProfile(load<EntityProfileDoc>('nfl-team-phi.json'), 'nfl');
const tor = normalizeTeamProfile(load<EntityProfileDoc>('nhl-team-tor-full.json'), 'nhl');
const nflLook = metricLookup(nflDefs, 'nfl');
const nhlLook = metricLookup(nhlDefs, 'nhl');
const nflCode = (id: string | null) => nflIdx.teams.find((t) => t.participant_id === id)?.short_name ?? null;
const nhlCode = (id: string | null) => nhlIdx.teams.find((t) => t.participant_id === id)?.short_name ?? null;
const NOW = Date.parse('2026-10-26T20:00:00Z');

describe('statistics', () => {
  it('resolves windows by the published label: SEASON is the season label when that is how the sport publishes', () => {
    expect(windowKey(dal.metrics.get('off_epa_play'), 'SEASON', dal.season)).toBe('SEASON');
    expect(windowKey(tor.metrics.get('gf_per_game'), 'SEASON', tor.season)).toBe('2026-27');
    expect(windowKey(tor.metrics.get('gf_per_game'), 'L10', tor.season)).toBe('L10');
    expect(windowKey(tor.metrics.get('pp_pct'), 'L10', tor.season)).toBeNull();
    expect(resolveWindow('L34', ['SEASON', 'L10'])).toBe('SEASON');
    expect(resolveWindow('L10', ['SEASON', 'L10'])).toBe('L10');
  });
  it('reads rank, universe and the percentile rule from the document (not the published percentile)', () => {
    const o = observe(dal, 'adj_def_epa', 'ADJ_RIDGE', nflLook)!;
    expect(o).toMatchObject({ rank: 28, n: 28, role: 'def', window: 'ADJ_RIDGE' });
    expect(o.pct).toBe(0);
    const off = observe(dal, 'adj_off_epa', 'ADJ_RIDGE', nflLook)!;
    expect(off.rank).toBe(5);
    expect(off.pct).toBeCloseTo((23 / 27) * 100, 6);
    expect(observe(dal, 'adj_off_epa', 'SEASON', nflLook)).toBeNull(); // adjusted statistics have their own window only
  });
  it('knows adjusted statistics apart from raw ones in both sports', () => {
    expect(isAdjustedId('adj_off_epa')).toBe(true);
    expect(isAdjustedId('oa_xgf60_5v5')).toBe(true);
    expect(isAdjustedId('off_epa_play', { name: '', category: 'offense', unit: null, higherIsBetter: true })).toBe(false);
  });
  it('formats by unit', () => {
    expect(fmtValue(0.04801, 'deviation from league mean')).toBe('+0.048');
    expect(fmtValue(-0.1, 'EPA/play')).toBe('−0.100');
    expect(fmtValue(0.302, 'share')).toBe('30.2%');
    expect(fmtValue(3.8462, 'goals per game')).toBe('3.85');
    expect(fmtValue(null, 'share')).toBe('—');
  });
  it('words windows from the declaration', () => {
    const d = teamSport('nfl');
    expect(windowWord(d, 'L6')).toBe('Last 6');
    expect(windowWord(teamSport('nhl'), '2026-27')).toBe('2026–27');
  });
});

describe('identity (TR1, TR6)', () => {
  it('football adjusted: four units, offense and defense kept on their own tracks, never mixed with raw', () => {
    const v = identityOf('nfl', dal, { adj: true, win: 'SEASON' }, nflLook)!;
    expect(v.adjusted).toBe(true);
    expect(v.rows.map((r) => r.label)).toEqual(['Overall', 'Passing', 'Rushing', 'Early downs']);
    expect(v.rows.every((r) => r.off.id.startsWith('adj_off_') && r.def.id.startsWith('adj_def_'))).toBe(true);
    expect(v.head.off.rank).toBe(5);
    expect(v.head.def.rank).toBe(28);
    expect(v.head.offText).toBe('+0.048 EPA/play');
    expect(v.head.defText).toMatch(/^\+0\.\d{3} allowed$/);
    expect(v.sentence).toMatch(/^Offense ranks 4th to 7th of 28 and defense 27th to 28th of 28 across these four units\./);
  });
  it('football raw: the raw pairs only', () => {
    const v = identityOf('nfl', dal, { adj: false, win: 'SEASON' }, nflLook)!;
    expect(v.adjusted).toBe(false);
    expect(v.rows.every((r) => !isAdjustedId(r.off.id) && r.off.window === 'SEASON')).toBe(true);
    expect(v.sentence).toContain('what happened, not how good the team is');
  });
  it('hockey: the switch is the window; special teams are season-only and are left out of L10 with the reason', () => {
    const s = identityOf('nhl', tor, { adj: true, win: 'SEASON' }, nhlLook)!;
    expect(s.control).toBe('window');
    expect(s.window).toBe('SEASON');
    expect(s.head.off).toMatchObject({ id: 'gf_per_game', rank: 5, n: 32 });
    expect(s.rows.map((r) => r.label)).toEqual(['Goals', 'Exp. goals', 'Special teams']);
    expect(s.rows[2].marks).toEqual(['P', 'K']);
    expect(s.sentence).toMatch(/^Special teams: P is the power play \(\d+\.\d%\), K the penalty kill \(95\.2%\)\. 2026–27 values\.$/);
    const l = identityOf('nhl', tor, { adj: true, win: 'L10' }, nhlLook)!;
    expect(l.rows.map((r) => r.label)).toEqual(['Goals', 'Exp. goals']);
    expect(l.omitted).toEqual(['Special teams']);
    expect(l.sentence).toContain('published for the season only');
    expect(l.options.map((o) => o.label)).toEqual(['2026–27', 'L10']);
  });
  it('returns nothing for a sport with no declaration or a team without the statistics', () => {
    expect(identityOf('mlb', dal, { adj: true, win: 'SEASON' }, nflLook)).toBeNull();
    expect(identityOf('nfl', { ...dal, metrics: new Map() }, { adj: true, win: 'SEASON' }, nflLook)).toBeNull();
  });
});

describe('strongest and weakest', () => {
  it('lists raw statistics by percentile, one per family, from the registry categories', () => {
    const e = extremesOf('nfl', dal, 'SEASON', nflLook)!;
    expect(e.best).toHaveLength(3);
    expect(e.worst).toHaveLength(3);
    expect(e.n).toBe(e.best[0].n);
    expect(e.best.every((o, i, a) => i === 0 || a[i - 1].pct! >= o.pct!)).toBe(true);
    expect(e.worst.every((o, i, a) => i === 0 || a[i - 1].pct! <= o.pct!)).toBe(true);
    expect(e.best.every((o) => !isAdjustedId(o.id))).toBe(true);
    expect(e.best.map((o) => o.id).some((id) => /^(off_adot|off_no_huddle|off_plays_per|off_proe|off_shotgun)/.test(id))).toBe(false);
  });
  it('hockey leaves model output out', () => {
    const e = extremesOf('nhl', tor, 'SEASON', nhlLook)!;
    const ids = [...e.best, ...e.worst].map((o) => o.id);
    expect(ids.some((id) => /^(model_|rating_|corsi|fenwick|sva|hd_xgf)/.test(id))).toBe(false);
    expect(e.windowText).toBe('2026–27');
  });
});

describe('profile (TR2)', () => {
  it('raw: offense and defense groups sorted best first, with the 34-game baseline beside the season rank', () => {
    const v = profileOf('nfl', dal, { adj: false, win: 'SEASON', all: false }, nflLook)!;
    expect(v.adjusted).toBe(false);
    expect(v.windows.map((w) => w.key)).toEqual(['SEASON', 'L6', 'L34']);
    const off = v.groups.find((g) => g.key === 'off')!;
    expect(off.rows).toHaveLength(4);
    expect(off.rows.map((r) => r.obs.rank)).toEqual([...off.rows.map((r) => r.obs.rank)].sort((a, b) => a! - b!));
    expect(off.total).toBeGreaterThan(4);
    const r = off.rows[0];
    expect(r.base?.window).toBe('L34');
    expect(r.delta).toBe(r.base!.rank! - r.obs.rank!);
    expect(v.counts.off).toBe(off.total);
    expect(v.hasMore).toBe(true);
    expect(v.baselineLabel).toBe('last 34');
    expect(v.groups.every((g) => g.rows.every((x) => !isAdjustedId(x.obs.id)))).toBe(true);
  });
  it('the shorter window re-cuts the list and the long window carries no ghost marker against itself', () => {
    const l34 = profileOf('nfl', dal, { adj: false, win: 'L34', all: false }, nflLook)!;
    expect(l34.window).toBe('L34');
    expect(l34.groups[0].rows.every((r) => r.base == null && r.delta == null)).toBe(true);
    const l6 = profileOf('nfl', dal, { adj: false, win: 'L6', all: false }, nflLook)!;
    expect(l6.groups[0].rows[0].obs.window).toBe('L6');
  });
  it('show all adds every row and the style and results groups', () => {
    const all = profileOf('nfl', dal, { adj: false, win: 'SEASON', all: true }, nflLook)!;
    expect(all.groups.map((g) => g.key)).toEqual(['off', 'def', 'style', 'results']);
    const off = all.groups.find((g) => g.key === 'off')!;
    expect(off.rows).toHaveLength(off.total);
  });
  it('adjusted: only adjusted statistics, one window, no baseline', () => {
    const v = profileOf('nfl', dal, { adj: true, win: 'L6', all: true }, nflLook)!;
    expect(v.adjusted).toBe(true);
    expect(v.window).toBe('ADJ_RIDGE');
    expect(v.windows).toEqual([]);
    expect(v.groups.map((g) => g.key)).toEqual(['off', 'def']);
    expect(v.groups.every((g) => g.rows.every((x) => isAdjustedId(x.obs.id) && x.base == null))).toBe(true);
    expect(v.groups[0].rows.every((x) => x.obs.id.startsWith('adj_off_'))).toBe(true);
  });
  it('is not declared for hockey (the tab is gated)', () => {
    expect(profileOf('nhl', tor, { adj: false, win: 'SEASON', all: false }, nhlLook)).toBeNull();
  });
  it('counts the games the season window covers', () => {
    expect(seasonGames(dal)).toBe(6);
  });
});

describe('games (TR1, TR3)', () => {
  const games = completedGames('nfl', dal, nflCode);
  it('lists completed games oldest first with the opponent code, margin and week', () => {
    expect(games.length).toBeGreaterThan(12);
    expect(games.map((g) => g.startUtc)).toEqual([...games.map((g) => g.startUtc)].sort());
    const g = games.at(-1)!;
    expect(g.margin).toBe(g.for - g.against);
    expect(g.oppCode).toMatch(/^[A-Z]{2,3}$/);
    expect(games.some((g) => g.week === 'Wk 6')).toBe(true);
  });
  it('last six of this season match the record the page prints', () => {
    const last6 = lastN(games, 6);
    expect(last6).toHaveLength(6);
    expect(last6.filter((g) => g.outcome === 'W').length).toBe(dal.record!.wins);
    expect(marginScale(last6)).toBeGreaterThanOrEqual(6);
  });
  it('last twelve cross seasons and say so; splits come from the game rows', () => {
    const l12 = lastN(games, 12);
    expect(seasonSpan(l12)).toBe('2025 · 2026');
    const sp = splitsOf(l12, 8);
    expect(sp.home.n + sp.away.n).toBe(12);
    expect(sp.home.wins + sp.home.losses + sp.home.ties).toBe(sp.home.n);
    expect(sp.one.n).toBe(l12.filter((g) => Math.abs(g.margin) <= 8).length);
    const h = halves(l12);
    expect(h.last!.n).toBe(6);
    expect(h.prev!.n).toBe(6);
  });
  it('hockey: overtime losses count as losses in the rows and the margin rule is one goal', () => {
    const g = completedGames('nhl', tor, nhlCode);
    const sp = splitsOf(g, 1);
    expect(sp.home.wins + sp.home.losses + sp.home.ties).toBe(sp.home.n);
    expect(tor.record!.text).toBe('7–4–2');
  });
});

describe('schedule (TR4) and the next game', () => {
  const sched = scheduleOf(nflIdx);
  const pid = dal.participantId;
  it('takes the next game from the schedule authority and its start time, never from a market', () => {
    const ev = nextGame(sched, pid, NOW)!;
    const n = nextGameOf(dal, pid, sched, ev, nflCode, () => 'Philadelphia Eagles', NOW)!;
    expect(n.eventId).toBe(ev.eventId);
    expect(n.startUtc).toBe(ev.startUtc);
    expect(n.oppCode).toBe('PHI');
    expect(n.home).toBe(false);
  });
  it('falls back to the profile schedule when the league index does not list the game (hockey)', () => {
    const ts = scheduleOf(nhlIdx);
    const n = nextGameOf(tor, tor.participantId, ts, nextGame(ts, tor.participantId, NOW), nhlCode, () => null, NOW);
    expect(n === null || typeof n.startUtc === 'string').toBe(true);
    const u = upcomingOf(tor, ts, nhlCode, NOW);
    expect(u.every((x) => Date.parse(x.startUtc) >= NOW - 4 * 3600_000)).toBe(true);
  });
  it('lists the next opponents in order with rest days, the league schedule winning on the start time', () => {
    const u = upcomingOf(dal, sched, nflCode, NOW, 6);
    expect(u).toHaveLength(6);
    expect(u.map((x) => x.startUtc)).toEqual([...u.map((x) => x.startUtc)].sort());
    expect(u[0].oppCode).toBe('PHI');
    expect(u.every((x) => x.restDays != null && x.restDays > 0)).toBe(true);
    const ev = sched.find((e) => e.eventId === u[0].eventId)!;
    expect(u[0].startUtc).toBe(ev.startUtc);
    const moved = upcomingOf(dal, sched.map((e) => (e.eventId === u[0].eventId ? { ...e, startUtc: '2026-10-27T02:00:00Z' } : e)), nflCode, NOW, 6);
    expect(moved[0].startUtc).toBe('2026-10-27T02:00:00Z');
  });
  it('summarises the opponents that are ranked, and says how many', () => {
    const u = opponentUnits('nfl', phi, nflLook);
    expect(u.off).toMatchObject({ id: 'adj_off_epa', window: 'ADJ_RIDGE' });
    expect(u.def).toMatchObject({ id: 'adj_def_epa' });
    const s = scheduleSummary([u, { off: null, def: null }]);
    expect(s).toMatchObject({ ranked: 1, total: 2 });
    expect(s.off).toBe(Math.round(u.off!.pct!));
    expect(scheduleSummary([{ off: null, def: null }])).toEqual({ off: null, def: null, ranked: 0, total: 1 });
    expect(opponentUnits('nfl', null, nflLook)).toEqual({ off: null, def: null });
  });
});

describe('availability and players (TR5)', () => {
  it('parses both publication shapes', () => {
    expect(parseAvailability('Dee Winters (LB, DAL): Strain; return 2026-11-01; impact: ruled out')).toEqual({ name: 'Dee Winters', pos: 'LB', reason: 'Strain', returnDate: '2026-11-01' });
    expect(parseAvailability('Cade Webber (D): Injured Reserve, Elbow; return 2026-10-31')).toEqual({ name: 'Cade Webber', pos: 'D', reason: 'Injured Reserve, Elbow', returnDate: '2026-10-31' });
    expect(parseAvailability('free text')).toEqual({ name: 'free text', pos: null, reason: null, returnDate: null });
    expect(parseAvailability(null)).toBeNull();
  });
  it('lists only players who are not active, out first, with counts that add up', () => {
    const a = availabilityOf(dal);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((r) => r.status !== 'ACTIVE')).toBe(true);
    const kinds = a.map((r) => r.kind);
    expect(kinds).toEqual([...kinds].sort((x, y) => ['out', 'ir', 'other'].indexOf(x) - ['out', 'ir', 'other'].indexOf(y)));
    const c = availabilityCounts(a);
    expect(c.out + c.ir + c.other).toBe(a.length);
    expect(a.find((r) => r.name === 'Dee Winters')).toMatchObject({ pos: 'LB', kind: 'out', label: 'Out' });
  });
  it('links a player only when the name matches a roster player', () => {
    const a = availabilityOf(dal);
    for (const r of a) expect(r.playerId === null || dal.players.some((p) => p.participantId === r.playerId)).toBe(true);
    const h = availabilityOf(tor);
    expect(h.every((r) => r.kind === 'ir')).toBe(true);
  });
  it('an availability row links to Player Research exactly when its name matches a player the publication lists', () => {
    const lamb = dal.players.find((p) => p.name === 'CeeDee Lamb')!;
    const withLamb = { ...dal, availability: [...dal.availability, { status: 'QUESTIONABLE', detail: 'CeeDee Lamb (WR, DAL): Ankle; return 2026-11-01', asOf: null, eventId: null, source: null }] };
    const rows = availabilityOf(withLamb);
    expect(rows.find((r) => r.name === 'CeeDee Lamb')).toMatchObject({ playerId: lamb.participantId, kind: 'other', label: 'Questionable' });
    expect(rows.filter((r) => r.name !== 'CeeDee Lamb').every((r) => r.playerId === null)).toBe(true);
  });
  it('skill players are the declared roles, ordered by props when the board is known, never "no props" on a guess', () => {
    const av = availabilityOf(dal);
    const unknown = skillPlayersOf('nfl', dal, null, av);
    expect(unknown.every((p) => p.props === null && ['QB', 'RB', 'WR', 'TE'].includes(p.role!))).toBe(true);
    const lamb = dal.players.find((p) => p.name === 'CeeDee Lamb')!;
    const counts = propCountsOf([{ playerId: lamb.participantId }, { playerId: lamb.participantId }, { playerId: 'prt_other' }, { playerId: null }], dal.players.map((p) => p.participantId));
    expect(counts).toMatchObject({ props: 2, players: 1 });
    const known = skillPlayersOf('nfl', dal, counts.byPlayer, av);
    expect(known[0]).toMatchObject({ name: 'CeeDee Lamb', props: 2 });
    expect(known.slice(1).every((p) => p.props === 0)).toBe(true);
  });
});
