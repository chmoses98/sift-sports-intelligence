// Lane C: statistics, matchups and schemes, on the real week-4 publication and the real 2026 history files.
// Units and denominators are stated and never converted (a rate is never a per-game count); the box-score basics
// are sums of published counts over the weeks before a game; unit-by-unit conclusions follow the published ranks;
// scheme links are observations with samples and never claim a bet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityProfileDoc, EventDetailDoc, EventResearchDoc, Observation } from '../src/contract/types';
import type { TeamHistoryDoc, UnitCounts } from '../src/history/types';
import { BASICS, basicText, leagueBasics, teamBasics } from '../src/insights/basics';
import { gameSides } from '../src/insights/game';
import { propCards } from '../src/insights/props';
import { schemeBoard, tendencyWord } from '../src/insights/schemeBoard';
import { boxLink, blitzLink, schemePlayerLinks } from '../src/insights/schemePlayers';
import { conclude, pick, SECTIONS, unitSections } from '../src/insights/unitAnalysis';
import { basisOf, basisTag, formatStat, unitInfo, unitLine, valueWithUnit } from '../src/insights/units';
import { depthChart } from '../src/views/stats/DepthChart';
import { BUILDER_UNITS } from '../src/views/stats/Builder';
import { friendlyName } from '../src/views/stats/MetricTable';
import { HISTORY_DIR, readSnapshot } from './helpers';

const NE_BUF = 'evt_0cb333291f580a201a70';
const r = readSnapshot<EventResearchDoc>(`explorer/events/${NE_BUF}.json`);
const detail = readSnapshot<EventDetailDoc>(`event_detail/${NE_BUF}.json`);
const g = gameSides(r)!;
const prof = (pid: string) => readSnapshot<EntityProfileDoc>(`explorer/teams/${pid}.json`);
const profiles = { home: prof(g.home.pid), away: prof(g.away.pid) };
const teams = JSON.parse(readFileSync(join(HISTORY_DIR, 'teams.json'), 'utf-8')) as TeamHistoryDoc;
const metric = (p: EntityProfileDoc, id: string) => p.metrics.find((m) => m.metric_id === id && !m.split)!;

describe('units and denominators', () => {
  it('names what every team rate is counted over, from the registry definitions', () => {
    expect(unitInfo('met_nfl.def_sack_rate')).toMatchObject({ short: 'of dropbacks', share: true });
    expect(unitInfo('met_nfl.off_rush_epa')?.short).toBe('EPA / run');
    expect(unitInfo('met_nfl.adj_off_db_epa')?.short).toBe('EPA / dropback');
    expect(unitInfo('met_nfl.off_td_drive_rate')?.short).toBe('of drives');
    expect(unitLine('met_nfl.points_for')).toBe('per game');
  });

  it('never labels a turnover RATE as a per-game count', () => {
    for (const id of ['met_nfl.off_turnover_rate', 'met_nfl.def_takeaway_rate', 'met_nfl.adj_off_to_rate', 'met_nfl.adj_def_to_rate']) {
      expect(unitLine(id)).not.toMatch(/game/);
      expect(valueWithUnit(id, 0.0167)).not.toMatch(/game/);
      expect(unitInfo(id)?.per).toMatch(/per play/);
    }
    expect(valueWithUnit('met_nfl.off_turnover_rate', 0.01673)).toBe('1.7% of plays');
    // The per-game count exists only in the box-score basics, computed from counts and games.
    const to = BASICS.find((b) => b.key === 'turnovers')!;
    expect(to.label.off).toBe('Turnovers per game');
    expect(to.value({ ints: 3, fum_lost: 2, games: 4 } as Record<keyof UnitCounts, number> & { games: number })).toBe(1.25);
  });

  it('writes adjusted ratings as a difference from league average, raw values in their own unit', () => {
    expect(formatStat('met_nfl.adj_def_sack_rate', 0.01756)).toBe('+1.8 pts');
    expect(formatStat('met_nfl.adj_off_to_rate', -0.00325)).toBe('−0.33 pts');
    expect(formatStat('met_nfl.adj_off_to_rate', -0.00001)).toBe('0.00 pts');
    expect(formatStat('met_nfl.adj_off_db_epa', -0.03429)).toBe('−0.034');
    expect(formatStat('met_nfl.def_sack_rate', 0.08052)).toBe('8.1%');
    expect(formatStat('met_nfl.off_cpoe', -2.48327)).toBe('−2.5 pts');
    expect(formatStat('met_nfl.points_for', 18)).toBe('18.0');
    expect(unitLine('met_nfl.adj_def_sack_rate')).toBe('pts vs league average (% of dropbacks)');
    expect(valueWithUnit('met_nfl.adj_off_db_epa', 0.05)).toBe('+0.050 vs league average (EPA / dropback)');
  });

  it('tags the footing of every observation from its window', () => {
    const adj = metric(profiles.home, 'met_nfl.adj_off_epa');
    const raw = metric(profiles.home, 'met_nfl.off_epa_play');
    const season = metric(profiles.home, 'met_nfl.points_for');
    expect([basisOf(adj), basisOf(raw), basisOf(season)]).toEqual(['adjusted', 'raw', 'season']);
    expect(basisTag(raw)).toBe('Raw · last 34 games');
    expect(friendlyName('Adjusted defensive EPA per dropback allowed')).toBe('Defensive EPA per dropback allowed');
  });
});

describe('the basics (box score per game)', () => {
  it('sums published counts over the weeks before the game only', () => {
    const b = teamBasics(teams, 'BUF', 4)!;
    expect(b.games).toBe(3);
    expect(b.weeks).toEqual([1, 2, 3]);
    const v = (side: 'off' | 'def', k: string) => b[side].find((x) => x.def.key === k)!;
    expect(v('off', 'points').value).toBeCloseTo(101 / 3, 6);
    // Passing yards are net of sack yards (gross − sack yards), per game.
    expect(v('off', 'pass_yds').value).toBeCloseTo(740 / 3, 6);
    expect(v('off', 'turnovers').value).toBeCloseTo(5 / 3, 6);
    // Percentages carry the counts behind them.
    expect(v('off', 'third').value).toBeCloseTo(18 / 33, 6);
    expect(v('off', 'third').sample).toBe('18 of 33 third downs');
    expect(basicText(v('off', 'third'))).toBe('55%');
    expect(basicText(v('off', 'points'))).toBe('33.7');
  });

  it('ranks #1 as best for the job: most points scored, fewest turnovers, fewest points allowed', () => {
    const all = leagueBasics(teams, 4);
    const ranked = (side: 'off' | 'def', key: string) => [...all.values()].map((t) => t[side].find((x) => x.def.key === key)!).filter((x) => x.rank != null);
    const best = (side: 'off' | 'def', key: string) => ranked(side, key).find((x) => x.rank === 1)!.value!;
    const vals = (side: 'off' | 'def', key: string) => ranked(side, key).map((x) => x.value!);
    expect(best('off', 'points')).toBe(Math.max(...vals('off', 'points')));
    expect(best('off', 'turnovers')).toBe(Math.min(...vals('off', 'turnovers')));
    expect(best('def', 'points')).toBe(Math.min(...vals('def', 'points')));
    expect(best('def', 'turnovers')).toBe(Math.max(...vals('def', 'turnovers')));
    expect(ranked('off', 'points')[0].of).toBe(32);
  });

  it('leaves out a stat whose counts an older document does not carry, never estimating it', () => {
    const old: TeamHistoryDoc = JSON.parse(JSON.stringify(teams));
    for (const t of Object.values(old.teams)) for (const w of t.weeks) delete (w.off as Partial<UnitCounts>).third_att;
    const b = teamBasics(old, 'BUF', 4)!;
    expect(b.off.find((x) => x.def.key === 'third')).toBeUndefined();
    expect(b.off.find((x) => x.def.key === 'points')).toBeDefined();
  });
});

describe('unit by unit', () => {
  it('concludes from the two published ranks, offense against the defense it faces', () => {
    const o = { context: { rank: 2, universe_size: 32, higher_is_better: true } } as Observation;
    const d = { context: { rank: 30, universe_size: 32, higher_is_better: false } } as Observation;
    expect(conclude(g.home, g.away, 'run offense', 'run defense', o, d)).toMatchObject({ lean: 'offense', size: 'major' });
    expect(conclude(g.home, g.away, 'run offense', 'run defense', d, o)).toMatchObject({ lean: 'defense' });
    const even = conclude(g.home, g.away, 'pass offense', 'pass defense', { context: { rank: 3, universe_size: 32, higher_is_better: true } } as Observation, { context: { rank: 5, universe_size: 32, higher_is_better: false } } as Observation)!;
    expect(even.lean).toBe('even');
    expect(even.text).toMatch(/^Strength meets strength/);
  });

  it('Buffalo run game vs New England: the published ranks, in the reader’s footing', () => {
    const adj = unitSections(r, profiles, g, g.home, 'adjusted', leagueBasics(teams, 4));
    const run = adj.find((s) => s.key === 'run')!;
    expect(run.pairs[0].off?.obs.metric_id).toBe('met_nfl.adj_off_rush_epa');
    expect(run.pairs[0].off?.basis).toBe('adjusted');
    expect(run.conclusion?.lean).toBe('offense');
    expect(run.conclusion?.text).toContain('Bills run offense');
    const raw = unitSections(r, profiles, g, g.home, 'raw', null).find((s) => s.key === 'run')!;
    expect(raw.pairs[0].off?.obs.metric_id).toBe('met_nfl.off_rush_epa');
    expect(raw.pairs[0].off?.obs.window.label).toBe('L34');
    // Special teams exist only adjusted: in raw footing the value says so (fallback), never silently swapped.
    const st = unitSections(r, profiles, g, g.home, 'raw', null).find((s) => s.key === 'special')!;
    expect(st.pairs[0].off).toMatchObject({ basis: 'adjusted', fallback: true });
  });

  it('pick() keeps the footing visible when only one version exists', () => {
    const get = (id: string | null) => (id === 'raw' ? ({ metric_id: 'raw' } as Observation) : null);
    expect(pick(['adj', 'raw'], get, 'adjusted')).toMatchObject({ basis: 'raw', fallback: true });
    expect(pick(['adj', 'raw'], get, 'raw')).toMatchObject({ basis: 'raw', fallback: false });
    expect(pick([null, null], get, 'raw')).toBeNull();
  });

  it('every section and builder unit names a registry metric or a basic', () => {
    for (const s of SECTIONS) for (const p of s.pairs) for (const id of [...p.off, ...p.def]) if (id) expect(id).toMatch(/^met_nfl\./);
    for (const u of BUILDER_UNITS) expect(Boolean(u.basic) || Boolean(u.off?.[0] || u.off?.[1])).toBe(true);
  });
});

describe('scheme tendencies and scheme meets players', () => {
  it('ranks charted tendencies highest-first, with samples, and the publication’s style metrics', () => {
    const rows = schemeBoard(teams, { BUF: profiles.home, NE: profiles.away }, ['NE', 'BUF'], 4);
    const blitz = rows.find((x) => x.key === 'blitz_rate')!;
    expect(blitz.side).toBe('def');
    expect(blitz.quality).toBe(false);
    expect(blitz.cells.NE.sample).toMatch(/charted dropbacks$/);
    expect(rows.find((x) => x.key === 'epa_vs_blitz')!.quality).toBe(true);
    expect(rows.some((x) => x.key === 'met_nfl.off_proe_early_ng' && x.source === 'publication')).toBe(true);
    expect(rows.find((x) => x.key === 'stacked_faced')!.cells.BUF.value).toBeGreaterThan(0);
    expect(tendencyWord(1, 32)).toBe('Highest in the NFL');
    expect(tendencyWord(16, 32)).toBe('League-typical (#16)');
  });

  it('connects a defense’s box counts to the back it faces, with samples and his published projection', () => {
    const props = propCards(r, detail.markets, g);
    const link = boxLink(r, g, teams, g.home, props)!;
    expect(link.defense.abbr).toBe('NE');
    expect(link.scheme).toMatch(/8\+ defenders in the box on \d+% of designed runs — the NFL's .+ \(#\d+ of \d+\)/);
    expect(link.sample).toMatch(/^\d+ charted runs faced$/);
    expect(link.player?.name).toMatch(/Cook/);
    const mean = r.distributions.find((d) => d.entity_id === link.player!.pid && d.metric_id === 'met_nfl.sim_rushing_yards')!.mean;
    expect(link.projection?.mean).toBe(mean);
    expect(link.evidence.some((e) => /League-wide/.test(e))).toBe(true);
    // An observation, never a pick.
    expect([link.headline, link.scheme, ...link.evidence, link.script ?? ''].join(' ')).not.toMatch(/\b(bet|lock|edge|value)\b/i);
  });

  it('connects blitz frequency to the quarterback, and orders links by how unusual the tendency is', () => {
    const props = propCards(r, detail.markets, g);
    const z = blitzLink(r, g, teams, g.away, props)!;
    expect(z.player?.role).toBe('QB');
    expect(z.projection?.stat).toBe('passing_yards');
    const all = schemePlayerLinks(r, g, teams, props, profiles);
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
  });
});

describe('depth chart', () => {
  it('groups by position, starters first, three receivers start, injuries from the publication', () => {
    const groups = depthChart(r, g.home);
    expect(groups.map((x) => x.pos)).toEqual(['QB', 'RB', 'WR', 'TE']);
    const qb = groups[0].players;
    expect(qb[0]).toMatchObject({ name: 'Josh Allen', starter: true });
    expect(qb[0].pid).toBeTruthy();
    const wr = groups.find((x) => x.pos === 'WR')!.players;
    expect(wr.filter((p) => p.starter).map((p) => p.name)).toEqual(['DJ Moore', 'Khalil Shakir', 'Keon Coleman']);
    const rb = groups.find((x) => x.pos === 'RB')!.players;
    expect(rb[0]).toMatchObject({ name: 'James Cook', starter: true });
    expect(rb[0].pid).toBeTruthy(); // "James Cook III" in the projections matches by name key
    expect(rb.find((p) => p.name === 'Ray Davis')?.injury).toBe('QUESTIONABLE');
  });
});
