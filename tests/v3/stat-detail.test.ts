// Stat Detail's pure model against REAL published documents (trimmed copies in tests/v3/fixtures, captured 2026-10-26).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntityProfileDoc, MetricDef, RankingDoc, SeriesDoc } from '../../src/contract/types';
import { buildRankingCatalog, normalizeRanking, normalizeTeamProfile } from '../../src/v3/data/research/normalize';
import {
  barShare, briefFor, compareBlocks, cutPoints, defaultThreshold, directionWord, entryValue, fmtBar, fmtValue, gameTag, limitsOf, nearestDot, orderWindows, ordinal, playerSummary, rankedTeams,
  resolveStat, sampleSpan, seasonPair, seasonRows, seriesPoints, siteSplit, spanLabel, spreadOf, swarmLayout, universeNote, updateWord, visibleRows, windowLabel, windowSentence, LAST_N, MAX_BARS,
} from '../../src/v3/model/statDetail';
import { roleOf, statDecl, unitWord, valueNote } from '../../src/v3/model/statDecl';
import { decode, encode } from '../../src/v3/state/url';
import { statSchema } from '../../src/v3/nav/schemas';
import { routes } from '../../src/v3/nav/routes';
import { canonicalRoute } from '../../src/v3/state/url';

const load = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/${f}`, 'utf8')) as T;
const dalDoc = load<EntityProfileDoc>('nfl-team-dal-stat.json');
const phiDoc = load<EntityProfileDoc>('nfl-team-phi-stat.json');
const torDoc = load<EntityProfileDoc>('nhl-team-tor.json');
const dal = normalizeTeamProfile(dalDoc, 'nfl');
const phi = normalizeTeamProfile(phiDoc, 'nfl');
const tor = normalizeTeamProfile(torDoc, 'nhl');
const nflDefs = new Map(load<{ items: MetricDef[] }>('nfl-metrics.json').items.map((d) => [d.metric_id, d]));
const nhlDefs = new Map(load<{ items: MetricDef[] }>('nhl-metrics.json').items.map((d) => [d.metric_id, d]));
const adjOff = normalizeRanking(load<RankingDoc>('nfl-ranking-adj-off-epa.json'), nflDefs.get('met_nfl.adj_off_epa'), (_i, s) => s ?? '?');
const ppRanking = normalizeRanking(load<RankingDoc>('nhl-ranking-pp-pct.json'), nhlDefs.get('met_nhl.pp_pct'), (_i, s) => s ?? '?');
const series = load<SeriesDoc>('nfl-series-dal-points-for.json');
const nflCatalog = buildRankingCatalog([dalDoc]);
const nhlCatalog = buildRankingCatalog([torDoc]);

describe('windows', () => {
  it('labels the publication\'s windows in plain words and leaves unknown ones as published', () => {
    expect(['SEASON', 'L6', 'L34', '2026-27', 'ADJ_RIDGE', '5v5 recency-weighted'].map(windowLabel)).toEqual(['Season', 'Last 6', 'Last 34', '2026–27', 'Adjusted', '5v5 recency-weighted']);
  });
  it('orders windows: adjusted rating, season, seasons newest first, then the last-N windows by length', () => {
    expect(orderWindows(['L34', 'L6', 'SEASON'])).toEqual(['SEASON', 'L6', 'L34']);
    expect(orderWindows(['L10', '2025-26', '2026-27'])).toEqual(['2026-27', '2025-26', 'L10']);
    expect(orderWindows(['SEASON', 'ADJ_RIDGE'])).toEqual(['ADJ_RIDGE', 'SEASON']);
  });
  it('says "three-season" only when the registry\'s own description states the window', () => {
    expect(windowSentence('ADJ_RIDGE', nflDefs.get('met_nfl.adj_off_epa'))).toBe('Three-season weighted rating');
    expect(windowSentence('ADJ_RIDGE', { description: 'something else' })).toBe('Opponent-adjusted rating');
    expect(windowSentence('L6')).toBe('Last 6 games');
  });
});

describe('which ranking is this', () => {
  it('resolves a short id and a window through the profile\'s own ranking list', () => {
    const r = resolveStat(nflCatalog, 'adj_off_epa', null);
    expect(r).toMatchObject({ ok: true, id: 'adj_off_epa', window: 'ADJ_RIDGE', rankingId: 'rnk_2d0e261738ef71649dc9', legacy: false, fellBack: false });
    const raw = resolveStat(nflCatalog, 'off_epa_play', 'L6');
    expect(raw).toMatchObject({ ok: true, window: 'L6', rankingId: 'rnk_eaddf1bcf94f465dbf95' });
    expect(raw.ok && raw.windows).toEqual(['SEASON', 'L6', 'L34']);
  });
  it('defaults to the sport\'s current window: the season label for hockey, season for raw football', () => {
    expect(resolveStat(nflCatalog, 'off_epa_play', null)).toMatchObject({ window: 'SEASON' });
    expect(resolveStat(nhlCatalog, 'pp_pct', null, ['2026-27'])).toMatchObject({ window: '2026-27', rankingId: 'rnk_a6ee305b17b08dd13098' });
    expect(resolveStat(nhlCatalog, 'pp_pct', null, [])).toMatchObject({ window: '2026-27' }); // newest season first even with no preference
  });
  it('falls back honestly when the window does not exist for the statistic', () => {
    const r = resolveStat(nflCatalog, 'adj_off_epa', 'L6');
    expect(r).toMatchObject({ ok: true, window: 'ADJ_RIDGE', requested: 'L6', fellBack: true });
  });
  it('resolves the first build\'s ranking id and flags it so the address can be rewritten', () => {
    const r = resolveStat(nflCatalog, 'rnk_eaddf1bcf94f465dbf95', null);
    expect(r).toMatchObject({ ok: true, id: 'off_epa_play', window: 'L6', legacy: true });
    expect(resolveStat(nflCatalog, 'rnk_unknown', null)).toEqual({ ok: false, reason: 'unknown' });
  });
  it('does not resolve what the publication does not rank, a sample id, or another sport\'s statistic', () => {
    expect(resolveStat(nflCatalog, 'sample-0', null).ok).toBe(false);
    expect(resolveStat(nflCatalog, 'pp_pct', null).ok).toBe(false);
    expect(resolveStat(nhlCatalog, 'adj_off_epa', null).ok).toBe(false);
  });
  it('accepts a full metric id', () => { expect(resolveStat(nflCatalog, 'met_nfl.adj_off_epa', null)).toMatchObject({ ok: true, id: 'adj_off_epa' }); });
});

describe('values', () => {
  it('prints each unit the way the design does', () => {
    expect(fmtValue(0.048, 'deviation from league mean')).toBe('+0.048');
    expect(fmtValue(-0.055, 'deviation from league mean')).toBe('−0.055');
    expect(fmtValue(0.0001, 'EPA/play')).toBe('0.000');
    expect(fmtValue(0.302, 'share')).toBe('30.2%');
    expect(fmtValue(20.6, 'points')).toBe('20.6');
    expect(fmtValue(3.0816, 'goals per game')).toBe('3.08');
    expect(fmtValue(null, 'share')).toBe('—');
    expect(fmtBar(31, 'points')).toBe('31');
    expect(fmtBar(0.523, 'share')).toBe('52');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(11)).toBe('11th');
  });
  it('takes the adjusted figure for an adjusted statistic and the raw one otherwise, never both', () => {
    expect(entryValue({ value: 0.1, adjusted: 0.2 }, true)).toBe(0.2);
    expect(entryValue({ value: 0.1, adjusted: 0.2 }, false)).toBe(0.1);
    expect(entryValue({ value: null, adjusted: 0.2 }, false)).toBe(0.2);
  });
  it('states the direction in words', () => { expect([true, false, null].map(directionWord)).toEqual(['Higher is better', 'Lower is better', 'Descriptive']); });
  it('says what follows a value from the declaration, else from the registry\'s own unit and name', () => {
    expect(valueNote('nfl', 'adj_off_epa', 'deviation from league mean', 'Adjusted offensive EPA per play')).toBe('EPA per play');
    expect(valueNote('nfl', 'off_dropback_epa', 'EPA/dropback', 'Off EPA/db')).toBe('EPA per dropback');
    expect(valueNote('nhl', 'pp_pct', 'share', 'Power-play percentage')).toBe('of power plays');
    expect(unitWord('nfl', 'adj_off_epa', 'Adj Off EPA')).toBe('offense');
    expect(unitWord('nhl', 'pp_pct', 'PP%')).toBe('power play');
    expect(unitWord('nhl', 'xgf_pct', 'xGF%')).toBe('xGF%');
  });
  it('colours defence amber and everything else ice, from the sport\'s declaration', () => {
    expect([roleOf('nfl', 'adj_def_epa'), roleOf('nfl', 'adj_off_epa'), roleOf('nhl', 'pk_pct'), roleOf('nhl', 'pp_pct'), roleOf('mlb', 'x')]).toEqual(['d', 'o', 'd', 'o', 'o']);
    expect(statDecl('nfl')!.compare.map((g) => g.role)).toEqual(['o', 'd']);
    expect(statDecl('curling')).toBeNull();
  });
});

describe('the ranked list (SD1, SD7)', () => {
  const teams = rankedTeams(adjOff);
  it('is the publication\'s own universe: 28 teams, not 32, in rank order', () => {
    expect(adjOff.n).toBe(28);
    expect(teams).toHaveLength(28);
    expect(teams.map((t) => t.rank)).toEqual([...teams.map((t) => t.rank)].sort((a, b) => a - b));
    expect(teams.find((t) => t.code === 'DAL')).toMatchObject({ rank: 5 });
    expect(teams.find((t) => t.code === 'PHI')).toMatchObject({ rank: 24 });
  });
  it('shows the leaders, the selected team with its neighbours and the next opponent, with gaps that add up', () => {
    const rows = visibleRows(teams, { sel: 'DAL', opp: 'PHI', all: false });
    expect(rows.map((r) => (r.type === 'row' ? r.team.rank : `gap${r.count}`))).toEqual([1, 2, 3, 4, 5, 6, 'gap17', 24, 'gap4']);
    const shown = rows.reduce((n, r) => n + (r.type === 'row' ? 1 : r.count), 0);
    expect(shown).toBe(28);
  });
  it('shows only the leaders with nothing selected, and every team on request', () => {
    expect(visibleRows(teams, { sel: null, opp: null, all: false }).filter((r) => r.type === 'row')).toHaveLength(5);
    expect(visibleRows(teams, { sel: 'DAL', opp: 'PHI', all: true }).every((r) => r.type === 'row')).toBe(true);
    expect(visibleRows(teams, { sel: 'XXX', opp: null, all: false }).filter((r) => r.type === 'row')).toHaveLength(5);
  });
  it('pins the selected team and neighbours when the team is deep in the list', () => {
    const rows = visibleRows(teams, { sel: teams[14].code, opp: null, all: false });
    expect(rows.map((r) => (r.type === 'row' ? r.team.rank : `gap${r.count}`))).toEqual([1, 2, 3, 4, 5, 'gap8', 14, 15, 16, 'gap12']);
  });
  it('draws the best bar full length whichever way the statistic runs, and never a zero-length bar', () => {
    const sp = spreadOf(teams)!;
    expect(barShare(teams[0].value, sp.lo, sp.hi, true)).toBe(1);
    expect(barShare(teams[27].value, sp.lo, sp.hi, true)).toBe(0.04);
    expect(barShare(sp.lo, sp.lo, sp.hi, false)).toBe(1);
    expect(barShare(null, sp.lo, sp.hi, true)).toBe(0.04);
  });
  it('states the universe the publication used', () => {
    expect(universeNote(adjOff.universe, adjOff.n)).toBe('28 teams in the current packet');
    expect(universeNote(ppRanking.universe, ppRanking.n)).toMatch(/^32 teams · 2026-27/);
    expect(universeNote('', 12)).toBe('12 teams');
  });
  it('reports the games a window covers from the entries\' own sample sizes', () => {
    expect(sampleSpan(ppRanking)).toMatch(/^\d+ to \d+ g$/);
    expect(sampleSpan(adjOff)).toBeNull();
  });
});

describe('the dot plot', () => {
  const items = rankedTeams(adjOff).map((t) => ({ code: t.code, v: t.value }));
  it('puts the best team furthest right for a higher-is-better statistic and for a lower-is-better one', () => {
    const hi = swarmLayout(items, { higherIsBetter: true });
    expect(hi.dots.find((d) => d.code === 'SF')!.cx).toBe(Math.max(...hi.dots.map((d) => d.cx)));
    const lo = swarmLayout(items, { higherIsBetter: false });
    expect(lo.dots.find((d) => d.code === 'SF')!.cx).toBe(Math.min(...lo.dots.map((d) => d.cx)));
  });
  it('places every team once, deterministically, with no overlaps', () => {
    const a = swarmLayout(items, { higherIsBetter: true }), b = swarmLayout([...items].reverse(), { higherIsBetter: true });
    expect(a.dots).toHaveLength(28);
    expect(new Set(a.dots.map((d) => d.code)).size).toBe(28);
    expect(b.dots.map((d) => [d.code, d.cx, d.cy]).sort()).toEqual(a.dots.map((d) => [d.code, d.cx, d.cy]).sort());
  });
  it('finds the dot a tap is nearest to, or none out of reach', () => {
    const l = swarmLayout(items, { higherIsBetter: true });
    const d = l.dots[3];
    expect(nearestDot(l.dots, d.cx + 2, d.cy - 2)?.code).toBe(d.code);
    expect(nearestDot(l.dots, -500, -500)).toBeNull();
  });
  it('leaves a team with no value off the plot', () => {
    expect(swarmLayout([{ code: 'A', v: 1 }, { code: 'B', v: null }], { higherIsBetter: true }).dots.map((d) => d.code)).toEqual(['A']);
  });
});

describe('trend (SD2)', () => {
  const pts = seriesPoints(series, 'nfl');
  it('keeps the observations that have a value, oldest first, each with its season', () => {
    expect(pts.length).toBe(40);
    expect(pts.map((p) => p.t)).toEqual([...pts.map((p) => p.t)].sort());
    expect(pts[pts.length - 1]).toMatchObject({ value: 13, season: '2026', rolling: 23.5 });
    expect(pts.map((p) => p.i)).toEqual(pts.map((_, i) => i));
  });
  it('cuts the latest twelve games, or one season, and labels what the cut spans', () => {
    const last = cutPoints(pts, null);
    expect(last.shown).toHaveLength(LAST_N);
    expect(last.cut).toBe('last');
    expect(spanLabel(last.shown)).toBe('2025–26');
    const y25 = cutPoints(pts, '2025');
    expect(y25.cut).toBe('2025');
    expect(y25.shown.every((p) => p.season === '2025')).toBe(true);
    expect(cutPoints(pts, '1999').cut).toBe('last');
    expect(cutPoints(pts, '2026').shown).toHaveLength(6);
    expect(MAX_BARS).toBeGreaterThanOrEqual(18);
  });
  it('averages by season and publishes a rank only where the profile does', () => {
    const rows = seasonRows(pts, dal.metrics.get('points_for')!.windows, dal.season);
    expect(rows.map((r) => [r.season, r.games])).toEqual([['2024', 17], ['2025', 17], ['2026', 6]]);
    expect(rows[0].avg).toBeCloseTo(20.6, 1);
    expect(rows[1].avg).toBeCloseTo(27.7, 1);
    expect(rows[2].avg).toBeCloseTo(25.2, 1);
    expect(rows[0].rank).toBeNull();
    expect(rows[2].rank).toEqual({ rank: 9, n: 32 });
    expect(rows[2].current).toBe(true);
  });
  it('splits the current season by site from the profile\'s own games, leaving unknown sites out', () => {
    const site = siteSplit(pts, (id) => dal.games.find((g) => g.eventId === id)?.home, '2026');
    expect(site.home).toMatchObject({ n: 3 });
    expect(site.home!.avg).toBeCloseTo(28, 0);
    expect(site.away).toMatchObject({ n: 3 });
    expect(siteSplit(pts, () => undefined, '2026')).toEqual({ home: null, away: null });
  });
  it('names a game by its week', () => {
    expect(gameTag('2026 REG week 6')).toBe('Week 6');
    expect(gameTag('2026 POST wild card')).toBe('Playoffs');
    expect(gameTag('regular')).toBeNull();
    expect(gameTag(null)).toBeNull();
  });
});

describe('compare teams (SD4)', () => {
  const blocks = compareBlocks('nfl', dal, phi);
  it('lists the unit rows both teams publish, grouped as the sport declares, with the ranks the design shows', () => {
    expect(blocks.map((b) => [b.role, b.title, b.lines.length])).toEqual([['o', 'Offense', 4], ['d', 'Defense', 4]]);
    const overall = blocks[0].lines[0];
    expect(overall).toMatchObject({ id: 'adj_off_epa', window: 'ADJ_RIDGE', aBetter: true });
    expect([overall.a.rank, overall.b.rank, overall.a.n]).toEqual([5, 24, 28]);
    const def = blocks[1].lines[0];
    expect([def.a.rank, def.b.rank, def.aBetter]).toEqual([28, 12, false]);
  });
  it('leaves out a row either team lacks and a sport with no declaration', () => {
    const lacking = { ...phi, metrics: new Map([...phi.metrics].filter(([k]) => k !== 'adj_off_db_epa')) };
    expect(compareBlocks('nfl', dal, lacking)[0].lines.map((l) => l.id)).not.toContain('adj_off_db_epa');
    expect(compareBlocks('curling', dal, phi)).toEqual([]);
  });
  it('compares hockey on its own declared rows, in the season window both teams have', () => {
    const b = compareBlocks('nhl', tor, tor);
    expect(b.flatMap((x) => x.lines.map((l) => l.id))).toEqual(expect.arrayContaining(['pp_pct', 'gf_per_game']));
    expect(b.every((x) => x.lines.every((l) => l.aBetter === null))).toBe(true);
  });
});

describe('season over season (SD7)', () => {
  const w = tor.metrics.get('pp_pct')!.windows;
  it('pairs the open season with the one before it, from the team\'s own observations', () => {
    const p = seasonPair(w, '2026-27')!;
    expect([p.from.window, p.from.obs.rank, p.to.window, p.to.obs.rank]).toEqual(['2025-26', 15, '2026-27', 5]);
    expect(seasonPair(w, 'L10')!.to.window).toBe('2026-27');
  });
  it('gives nothing when there is no earlier ranked season', () => {
    expect(seasonPair(w, '2025-26')).toBeNull();
    expect(seasonPair(dal.metrics.get('adj_off_epa')!.windows, 'ADJ_RIDGE')).toBeNull();
    expect(seasonPair(undefined, 'x')).toBeNull();
  });
});

describe('compare players (SD5)', () => {
  it('summarises observed values: average, median, best, and how many reached the line', () => {
    const lamb = [6, 6, 5, 1, 5, 8, 7, 17, 2, 9];
    expect(playerSummary(lamb, 5)).toMatchObject({ n: 10, median: 6, best: 17, hits: 8 });
    expect(playerSummary(lamb, 5).avg).toBeCloseTo(6.6, 5);
    expect(playerSummary([3, 7, 4, 1, 3, 6, 7, 2, 9, 6], 5)).toMatchObject({ hits: 5, median: 5 });
    expect(playerSummary([], 5)).toEqual({ n: 0, avg: null, median: null, best: null, hits: 0 });
  });
  it('starts the threshold from the pooled median, rounded down, never below 1', () => {
    expect(defaultThreshold([6, 6, 5, 1, 5, 8, 7, 17, 2, 9], [3, 7, 4, 1, 3, 6, 7, 2, 9, 6])).toBe(6);
    expect(defaultThreshold([], [])).toBe(1);
    expect(defaultThreshold([0, 0], [0])).toBe(1);
  });
});

describe('about (SD6)', () => {
  it('uses the approved plain wording for the ridge ratings only when the registry\'s description states that method', () => {
    expect(briefFor('adj_off_epa', nflDefs.get('met_nfl.adj_off_epa'))).toBe('An opponent-adjusted rating of the team’s offense: a weighted ridge regression over the last three seasons, with recent games counting more (half-life 10 weeks).');
    expect(briefFor('adj_def_epa', nflDefs.get('met_nfl.adj_def_epa'))).toMatch(/team’s defense/);
    expect(briefFor('adj_off_epa', { description: 'Opponent-adjusted rating.' })).toBe('Opponent-adjusted rating.');
    expect(briefFor('off_epa_play', nflDefs.get('met_nfl.off_epa_play'))).toMatch(/^Mean expected points added per offensive play, averaged over the window's team-games: SEASON = the basis season's games, L6 = the last 6, L34 = the last 34 across seasons \(games strictly before the packet week\)\.$/);
    expect(briefFor('x', undefined)).toBe('The publication gives no definition for this statistic.');
  });
  it('quotes every limit the publication states, registry first, no duplicates, untouched', () => {
    const l = limitsOf(nflDefs.get('met_nfl.adj_off_epa'), adjOff);
    expect(l).toHaveLength(3);
    expect(l[0]).toBe('current snapshot only; no committed history');
    expect(limitsOf(undefined, { limitations: ['a', 'a', 'b'] })).toEqual(['a', 'b']);
    expect(limitsOf(undefined, null)).toEqual([]);
  });
  it('words the cadence as the registry states it', () => {
    expect(updateWord('per RUN NFL / shadow-cycle report')).toBe('Each publication run');
    expect(updateWord('hourly schedule-cache refresh')).toBe('hourly schedule-cache refresh');
    expect(updateWord(null)).toBeNull();
  });
});

describe('the address (statSchema)', () => {
  it('carries the whole screen state and omits defaults', () => {
    expect(routes.stat({ slug: 'nfl', statId: 'adj_off_epa' }, {})).toBe('/v3/stat/nfl/adj_off_epa');
    const r = routes.stat({ slug: 'nfl', statId: 'adj_off_epa' }, { tab: 'compare', win: 'ADJ_RIDGE', sel: 'DAL', opp: 'PHI', cmpm: 'players', a: 'prt_a', b: 'prt_b', cs: 'receptions', thr: 5, more: true });
    expect(r).toBe('/v3/stat/nfl/adj_off_epa?v=1&tab=compare&win=ADJ_RIDGE&sel=DAL&opp=PHI&cmpm=players&a=prt_a&b=prt_b&more=1&cs=receptions&thr=5');
    expect(decode(statSchema, r.split('?')[1])).toMatchObject({ tab: 'compare', win: 'ADJ_RIDGE', sel: 'DAL', opp: 'PHI', cmpm: 'players', a: 'prt_a', b: 'prt_b', more: true, cs: 'receptions', thr: 5, sbs: false, all: false });
  });
  it('round-trips the trend and ranking state', () => {
    const q = encode(statSchema, { tab: 'trend', st: '2025', obs: 31, sel: 'DAL', all: true, sbs: true });
    expect(decode(statSchema, q)).toMatchObject({ tab: 'trend', st: '2025', obs: 31, sel: 'DAL', all: true, sbs: true });
  });
  it('is stable for a saved route: the same state is the same string whatever the parameter order', () => {
    expect(canonicalRoute('/v3/stat/nfl/adj_off_epa?sel=DAL&tab=about&v=1&win=ADJ_RIDGE')).toBe('/v3/stat/nfl/adj_off_epa?v=1&tab=about&win=ADJ_RIDGE&sel=DAL');
  });
  it('migrates the first build\'s vocabulary and keeps its ranking id openable', () => {
    expect(canonicalRoute('/v3/stat/nfl/rnk_2d0e261738ef71649dc9?tab=trends&team=DAL')).toBe('/v3/stat/nfl/rnk_2d0e261738ef71649dc9?v=1&tab=trend&sel=DAL');
  });
});
