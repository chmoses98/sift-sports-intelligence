// Wave 2: units, denominators and footing for NHL / soccer / CBB / CFB (issue 6), plain availability wording (issue
// 43) and Kalshi short club names outside betPhrase. Real publication fixtures where the repo carries them.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { MatchupRow, MetricDef, Observation } from '../src/contract/types';
import { footingOf, formatUnitValue, rankWords, sportUnit, unitText, valueAndUnit, windowWords } from '../src/insights/sportUnits';
import { describeMarket, describeNhlMarket } from '../src/lib/marketLabel';
import { candidateTitle, governanceReason } from '../src/lib/nhl';
import { plainCodes } from '../src/lib/plainLabels';
import { findingLabel } from '../src/lib/scriptEngine';
import { RankRows } from '../src/views/shared/kit';

const def = (metric_id: string, over: Partial<MetricDef> = {}): MetricDef => ({
  metric_id, sport: 'X', name: metric_id, short_name: null, description: '', entity_type: 'TEAM', category: 'advanced', subcategory: null, unit: null,
  stat_type: 'rate', higher_is_better: true, comparison_universe: null, supports: {}, windows: [], splits: [], source: null, source_version: null,
  methodology_version: null, quality: { status: 'VERIFIED' } as MetricDef['quality'], historical_start: null, update_frequency: null, freshness: null,
  known_limitations: [], related_metrics: [], ...over,
});

const obs = (metric_id: string, value: number, over: Partial<Observation> = {}): Observation => ({
  observation_id: `o-${metric_id}-${value}`, sport: 'X', metric_id, entity_id: 'e', entity_type: 'TEAM', value, adjusted_value: null, display_value: null, unit: null,
  window: { kind: 'SEASON', n: null, start: null, end: null, label: '2026-27' }, split: null, sample_size: 5, as_of: '2026-10-11T00:00:00Z', season: null,
  event_id: null, opponent_id: null, source: 's', quality_status: 'VERIFIED', context: null, ...over,
});

describe('NHL units come from the registry descriptions, never guessed', () => {
  it('writes shares, per-60 rates and per-game counts in their own unit', () => {
    expect(valueAndUnit(0.6251, sportUnit('met_nhl.xgf_pct'))).toBe('62.5% of expected goals');
    expect(valueAndUnit(0.6021, sportUnit('met_nhl.corsi_pct'))).toBe('60.2% of shot attempts');
    expect(valueAndUnit(2.4523, sportUnit('met_nhl.oa_xgf60_5v5'))).toBe('2.45 xG / 60 at 5v5');
    expect(valueAndUnit(3.0, sportUnit('met_nhl.gf_per_game'))).toBe('3.00 goals / game');
    expect(valueAndUnit(0.2, sportUnit('met_nhl.pp_pct'))).toBe('20.0% of power plays scored on');
    expect(sportUnit('met_nhl.toi_per_game').short).toBe('min / game');
    // a count in a window is a total, not a per-game number
    expect(sportUnit('met_nhl.goals').long).toMatch(/in the window/);
  });

  it('keeps opponent-adjusted, MoneyPuck score/venue-adjusted, model inputs and raw values distinguishable', () => {
    const oa = obs('met_nhl.oa_xgf60_5v5', 2.715, { extensions: { basis: 'OPPONENT_ADJUSTED', raw_value: 3.14 }, window: { kind: 'CUSTOM', n: null, start: null, end: null, label: '5v5 recency-weighted' } });
    expect(footingOf('met_nhl.oa_xgf60_5v5', def('met_nhl.oa_xgf60_5v5', { category: 'opponent_adjusted' }), oa).word).toBe('Adjusted');
    const sva = footingOf('met_nhl.sva_xgf_pct', def('met_nhl.sva_xgf_pct', { description: 'Share of MoneyPuck score- and venue-adjusted expected goals.' }), obs('met_nhl.sva_xgf_pct', 0.6));
    expect(sva.kind).toBe('raw');
    expect(sva.detail).toMatch(/NOT for the opponent/);
    expect(footingOf('met_nhl.rating_off_xg60', def('met_nhl.rating_off_xg60', { category: 'model_inputs' }), obs('met_nhl.rating_off_xg60', 3.4)).word).toBe('Model input');
    const l10 = obs('met_nhl.xgf_pct', 0.58, { window: { kind: 'LAST_N', n: 10, start: null, end: null, label: 'L10' } });
    expect(footingOf('met_nhl.xgf_pct', def('met_nhl.xgf_pct'), l10).word).toBe('Raw · last 10 games');
    expect(footingOf('met_nhl.xgf_pct', def('met_nhl.xgf_pct'), obs('met_nhl.xgf_pct', 0.6)).word).toBe('Raw · season 2026-27');
  });

  it('takes the rank universe from the data: a slate-only ranking is never "of 32"', () => {
    expect(rankWords({ rank: 1, universe_size: 6, universe_label: 'NHL teams on the slate, run 2026-10-11T08:22Z' })).toBe('#1 of 6 on the slate');
    expect(rankWords({ rank: 30, universe_size: 32, universe_label: 'NHL teams, opponent-adjusted 5v5' })).toBe('#30 of 32');
    expect(rankWords({ rank: null, universe_size: 32, universe_label: null })).toBe('');
  });
});

describe('soccer, CBB and CFB units', () => {
  it('soccer percentages are already 0–100 and per-match values say so', () => {
    expect(formatUnitValue(100, sportUnit('met_soccer.clean_sheet_rate'))).toBe('100%');
    expect(valueAndUnit(44.83, sportUnit('met_soccer.clean_sheet_rate'))).toBe('45% of matches with a clean sheet');
    expect(valueAndUnit(1.6552, sportUnit('met_soccer.goals_for_per_game'))).toBe('1.66 goals / match');
    expect(formatUnitValue(-1, sportUnit('met_soccer.goal_difference_per_game'))).toBe('−1.00');
    expect(footingOf('met_soccer.dc_attack', def('met_soccer.dc_attack', { category: 'rating', description: 'Dixon-Coles attack parameter. Opponent-adjusted by construction.' }), null).kind).toBe('adjusted');
  });

  it('CBB efficiency is per 100 possessions and turnovers per 100 possessions, not a percentage', () => {
    expect(valueAndUnit(107.75, sportUnit('met_cbb.adj_off'))).toBe('107.8 pts / 100 poss');
    expect(valueAndUnit(16.5, sportUnit('met_cbb.adj_to_off'))).toBe('16.5 turnovers / 100 poss');
    expect(valueAndUnit(51, sportUnit('met_cbb.adj_efg_off'))).toBe('51.0% effective FG');
    expect(valueAndUnit(120.1152, sportUnit('met_cbb.expected_returning_minutes'))).toBe('120 of 200 min');
    expect(valueAndUnit(0.4291, sportUnit('met_cbb.returning_minutes_share'))).toBe('43% of last season’s minutes');
    expect(footingOf('met_cbb.adj_off', def('met_cbb.adj_off', { category: 'efficiency', extensions: { cbb: { adjusted: true } } }), null).word).toBe('Adjusted');
    expect(footingOf('met_cbb.returning_minutes_share', def('met_cbb.returning_minutes_share', { category: 'roster' }), null).word).toBe('Roster');
  });

  it('CFB engine metrics use the engine registry denominators', () => {
    expect(valueAndUnit(0.405, sportUnit('success_rate', { unit: 'rate' }, 'CFB'))).toBe('40.5% of plays successful');
    expect(valueAndUnit(0.065, sportUnit('sack_rate_allowed', { unit: 'rate' }, 'CFB'))).toBe('6.5% of dropbacks');
    expect(valueAndUnit(5.29, sportUnit('yards_per_play', { unit: 'yards' }, 'CFB'))).toBe('5.29 yds / play');
    expect(sportUnit('turnovers_per_game', { unit: 'count' }, 'CFB').short).toBe('turnovers / game');
  });

  it('says "unit not stated" when the publication states none, and passes an unknown unit through as published', () => {
    const none = sportUnit('met_nhl.model_learning_stage_x', def('met_nhl.model_learning_stage_x', { unit: null }));
    expect(none.stated).toBe(false);
    expect(unitText(none)).toBe('unit not stated');
    expect(valueAndUnit(1.5, none)).toBe('1.50 (unit not stated)');
    expect(sportUnit('met_nba.team_off_rtg', def('met_nba.team_off_rtg', { unit: 'points/100 poss' })).short).toBe('points/100 poss');
    expect(windowWords({ kind: 'SEASON', n: null, start: null, end: null, label: 'SEASON' })).toBe('season');
  });
});

describe('shared rank rows', () => {
  const metrics = new Map([
    ['met_soccer.clean_sheet_rate', def('met_soccer.clean_sheet_rate', { name: 'Clean-sheet rate', unit: '%', category: 'defence' })],
    ['met_soccer.goals_for_per_game', def('met_soccer.goals_for_per_game', { name: 'Goals scored per game', unit: 'goals', category: 'attack' })],
  ]);
  const row = (id: string, h: number, a: number): MatchupRow => ({ metric_id: id, name: id, note: null, home: obs(id, h, { window: { kind: 'SEASON', n: null, start: null, end: null, label: 'SEASON' } }), away: obs(id, a) } as unknown as MatchupRow);

  it('shows every value in its unit with its footing, and says when no league rank exists', () => {
    render(<MemoryRouter><RankRows rows={[row('met_soccer.clean_sheet_rate', 100, 0), row('met_soccer.goals_for_per_game', 1, 0)]} metrics={metrics} left={{ label: 'Lille', side: 'home' }} right={{ label: 'Le Havre', side: 'away' }} leftId="a" rightId="b" slug="soccer" eventId="e" /></MemoryRouter>);
    const text = document.body.textContent ?? '';
    expect(text).toContain('100%');
    expect(text).toContain('0%');
    expect(text).toContain('1.00');
    expect(text).toContain('of matches with a clean sheet');
    expect(text).toContain('goals / match');
    expect(text).toMatch(/no league rank published/);
    expect(document.querySelectorAll('[data-footing="raw"]').length).toBe(2);
    expect(text).not.toMatch(/0\.0000|1\.0000/);
  });

  it('explains an empty matchup instead of rendering a bare line', () => {
    render(<MemoryRouter><RankRows rows={[]} metrics={metrics} left={{ label: 'A', side: 'home' }} right={{ label: 'B', side: 'away' }} leftId="a" rightId="b" slug="soccer" eventId="e" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(/No matchup statistics for this game yet/);
  });
});

describe('plain words for codes and Kalshi short names (issues 43, 8)', () => {
  it('rewrites enum constants in publication prose but keeps team codes', () => {
    expect(plainCodes('only OPPONENT_ADJUSTED, MODEL and AVAILABILITY findings may be cited; RAW statistics are context for NYR')).toBe('only opponent-adjusted, model and availability findings may be cited; raw statistics are context for NYR');
  });

  it('spells out "New York R" in NHL market titles and candidate titles', () => {
    const m = { kalshi_ticker: 'KXNHLSPREAD-26OCT11VANNYR-NYR2', market_family: 'game_spread', yes_description: 'New York R wins by over 1.5 goals', period: 'FULL' };
    expect(describeNhlMarket(m)!.title).toBe('NY Rangers −1.5');
    expect(describeNhlMarket({ ...m, kalshi_ticker: 'KXNHLGAME-26OCT11VANNYR-NYR', market_family: 'game_winner', yes_description: 'New York R wins' })!.title).toBe('NY Rangers to win');
    expect(candidateTitle({ title: 'New York R over 2.5 goals scored', side: 'no' })).toBe('NY Rangers over 2.5 goals scored — NO');
    expect(describeMarket({ kalshi_ticker: 'KXNHLTEAMTOTAL-X', market_family: 'team_total', yes_description: 'New York R over 3.5 goals scored' }).title).toBe('NY Rangers team total over 3.5 goals');
  });

  it('writes governance reasons as words and names the referenced contract', () => {
    const known = new Map([['KXNHLSPREAD-26OCT11VANNYR-NYR3', { kalshi_ticker: 'KXNHLSPREAD-26OCT11VANNYR-NYR3', market_family: 'game_spread', yes_description: 'New York R wins by over 2.5 goals', period: 'FULL' }]]);
    expect(governanceReason('NOT_SELECTED_BY_OPTIMIZER', known)).toBe('not picked by the research portfolio optimizer');
    expect(governanceReason('SUPERSEDED_BY_HIGHER_FIDELITY_EXPRESSION (KXNHLSPREAD-26OCT11VANNYR-NYR3|no)', known)).toBe('replaced by a closer way to bet the same idea (NO on NY Rangers −2.5)');
    expect(governanceReason('SOME_NEW_CODE', known)).toBe('some new code');
  });

  it('names the team in CFB finding codes', () => {
    const engine = { teams: { home: { name: 'UL Monroe' }, away: { name: 'Louisiana Tech' } } } as never;
    expect(findingLabel(engine, 'away_disruption_advantage')).toBe('Louisiana Tech disruption advantage');
    expect(findingLabel(engine, 'high_scoring_environment')).toBe('High scoring environment');
  });
});
