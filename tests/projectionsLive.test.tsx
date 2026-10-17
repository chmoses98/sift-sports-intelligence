import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FoundationProjection, FoundationTeams } from '../src/components/FoundationProjection';
import { ProjectionScorecard } from '../src/components/ProjectionScorecard';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import {
  decodeProjections, decodeScorecard, displayState, findTeamProjections, liveVerdict, projectionsUrl, scorecardUrl, summaryUrl,
} from '../src/lib/projections';

const NOW = Date.parse('2026-10-20T20:00:00Z');
const player = (over: Record<string, unknown> = {}) => ({
  player_id: '1628369', name: 'Jayson Tatum', team: 'BOS', opponent: 'DET', game_id: '401800001',
  family: 'points', mean: 27.1, median: 27, p10: 18, p90: 36, thresholds: { '20': 0.78, '25': 0.58, '30': 0.33 },
  opportunity: { family: 'minutes', mean: 36.2, p10: 31, p90: 40 }, adjustments: [], readiness: 'READY',
  gate: { status: 'PASS', findings: [] }, data_asof_utc: '2026-10-20T18:30:00Z', role: 'shadow',
  participation: { status: 'CONFIRMED_ACTIVE', certainty: 'CONFIRMED', source: 'nba_official_injury_report', captured_utc: '2026-10-20T18:30:00Z', reasons: [] },
  ...over,
});
const doc = (players = [player()], games: unknown[] = []) => ({
  schema: 'sift.projections.v1', sport: 'NBA', generated_utc: '2026-10-20T18:31:00Z', data_asof_utc: '2026-10-20T18:30:00Z',
  model: { id: 'pf-nba', version: 'pf-1.2.0', authority: 'research_only' }, families: { points: { readiness: 'READY', model: 'E', reason: '' }, team_points: { readiness: 'SHADOW VALIDATION', model: 'D', reason: '' } },
  games, players,
});
const game = { game_id: '401800001', start_utc: '2026-10-20T23:30:00Z', home: 'DET', away: 'BOS',
  teams: [{ team: 'BOS', family: 'team_points', mean: 114.2, p10: 101, p90: 127 }, { team: 'DET', family: 'team_points', mean: 108.9, p10: 96, p90: 122 }] };
const card = (families: unknown[] = [], alerts: unknown[] = []) => ({
  schema: 'sift.prospective_scorecard.v1', authority: 'research_only', sport: 'NBA', generated_utc: '2026-10-21T12:00:00Z',
  capture: { forecasts_archived: 1240, games: 10 }, settlement: { settled: 610, void: 30 }, families, alerts,
});
const fam = (paired: unknown = { crps_diff: { mean_diff: -0.2, ci95: [-0.3, -0.1], n_obs: 600 } }) => ({
  family: 'points', models: [{ model_id: 'pf-nba-points', model_role: 'challenger', n: 610, n_games: 10, mae: 4.4, bias: -0.1, cover_80: 0.81 },
    { model_id: 'sim', model_role: 'incumbent', n: 600, n_games: 10, mae: 5.9, bias: -1.2 }], paired,
});

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(null); });

describe('live projection contract', () => {
  it('decodes participation and role; unknown participation becomes UNVERIFIED', () => {
    const d = decodeProjections(doc([player(), player({ player_id: '2', participation: { status: 'MAYBE' } }), player({ player_id: '3', participation: undefined })]))!;
    expect(d.players[0].participation?.status).toBe('CONFIRMED_ACTIVE');
    expect(d.players[0].role).toBe('shadow');
    expect(d.players[1].participation?.status).toBe('UNVERIFIED');
    expect(d.players[2].participation).toBeNull();
  });
  it('never shows a number for a confirmed-out player, even if the feed forgot to BLOCK', () => {
    const d = decodeProjections(doc([player({ participation: { status: 'CONFIRMED_OUT', certainty: 'REPORTED', source: 'x' } })]))!;
    expect(displayState(d, d.players[0], NOW)).toEqual({ kind: 'withheld', reason: 'confirmed out before the game' });
  });
  it('matches team projections only when exactly one game has both teams on the date', () => {
    const d = decodeProjections(doc([], [game]))!;
    expect(findTeamProjections(d, { home: 'DET', away: 'BOS', startUtc: '2026-10-20T23:30:00Z' })).toHaveLength(2);
    expect(findTeamProjections(d, { home: 'DET', away: 'NYK' })).toBeNull();
    expect(findTeamProjections(d, { home: 'DET', away: 'BOS', startUtc: '2026-10-25T23:30:00Z' })).toBeNull();
  });
  it('decodes the live scorecard and words verdicts by their confidence interval only', () => {
    const c = decodeScorecard(card([fam()], [{ family: 'points', status: 'OK', what: 'within expectations' }]))!;
    expect(c.families[0]).toMatchObject({ n: 610, status: 'OK' });
    expect(liveVerdict(c.families[0])).toBe('more accurate than the production model so far');
    const tie = decodeScorecard(card([fam({ crps_diff: { mean_diff: -0.05, ci95: [-0.2, 0.1], n_obs: 600 } })]))!;
    expect(liveVerdict(tie.families[0])).toBe('not yet distinguishable from the production model');
    expect(tie.families[0].status).toBe('INSUFFICIENT');   // no drift verdict published -> never claimed OK
    expect(decodeScorecard({ ...card(), authority: 'production' })).toBeNull();
  });
});

describe('live components', () => {
  it('shows availability with its source and an exact update time', async () => {
    setFetchJson(async (url) => { expect(url).toBe(projectionsUrl('NBA')); return doc(); });
    render(<FoundationProjection sport="NBA" stat="pts" playerId="1628369" now={NOW} />);
    const av = await screen.findByTestId('foundation-availability');
    expect(av).toHaveTextContent(/Confirmed to play \(nba official injury report, Oct 20/);
    expect(screen.getByTestId('foundation-projection')).toHaveTextContent(/Shadow model: shown for comparison, not as SIFT’s headline number/);
  });
  it('labels an unverified player as an assumption, never as active', async () => {
    setFetchJson(async () => doc([player({ participation: { status: 'UNVERIFIED', certainty: 'UNKNOWN', source: '' } })]));
    render(<FoundationProjection sport="NBA" stat="points" playerId="1628369" now={NOW} />);
    expect(await screen.findByTestId('foundation-availability')).toHaveTextContent('Availability not verified — projection assumes he plays');
  });
  it('one-line variant shows the same number with a shadow label', async () => {
    setFetchJson(async () => doc());
    render(<FoundationProjection variant="micro" sport="NBA" stat="points" playerId="1628369" now={NOW} />);
    expect(await screen.findByTestId('foundation-projection')).toHaveTextContent('Independent (shadow): 27 · 18–36');
  });
  it('game command center team line', async () => {
    setFetchJson(async () => doc([], [game]));
    render(<FoundationTeams sport="NBA" home="DET" away="BOS" startUtc="2026-10-20T23:30:00Z" now={NOW} />);
    const el = await screen.findByTestId('foundation-teams');
    expect(el).toHaveTextContent(/BOS 114 \(101–127\) · DET 109 \(96–122\)/);
    expect(el).toHaveTextContent('Not a betting signal');
  });
  it('Research Lab card separates historical from live results and shows progress', async () => {
    setFetchJson(async (url) => {
      if (url === summaryUrl('NBA')) return { schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NBA', splits: { holdout: '2024-25 – 2025-26' },
        families: [{ family: 'points', readiness: 'READY', readiness_reason: 'beats incumbent', best_model: 'E', holdout: { n_obs: 52796, mae: 4.52, cover_80: 0.79 } },
                   { family: 'team_points', readiness: 'SHADOW VALIDATION', readiness_reason: 'no incumbent', best_model: 'D' }] };
      if (url === scorecardUrl('NBA')) return card([fam()], [{ family: 'points', status: 'OK', what: 'within expectations' }]);
      throw new NotFoundError(url);
    });
    render(<ProjectionScorecard sport="NBA" />);
    await waitFor(() => expect(screen.getByTestId('pfs-live')).toBeInTheDocument());
    expect(screen.getByTestId('pfs-progress')).toHaveTextContent(/1 validated on held-out seasons.*1 in shadow validation/);
    expect(screen.getByTestId('projection-scorecard')).toHaveTextContent(/Historical test — held-out 2024-25 – 2025-26/);
    expect(screen.getByTestId('pfs-live')).toHaveTextContent(/Points.*610.*4\.40.*81%.*more accurate than the production model so far.*On track/);
    expect(screen.getByRole('table')).toHaveAccessibleName(/Live accuracy of settled pregame projections/);
  });
  it('Research Lab card says when no live record exists yet', async () => {
    setFetchJson(async (url) => {
      if (url === summaryUrl('NBA')) return { schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NBA', splits: {}, families: [{ family: 'points', readiness: 'READY', best_model: 'E' }] };
      throw new NotFoundError(url);
    });
    render(<ProjectionScorecard sport="NBA" />);
    expect(await screen.findByTestId('pfs-live-empty')).toHaveTextContent('Live tracking has not published results for this sport yet.');
  });
});
