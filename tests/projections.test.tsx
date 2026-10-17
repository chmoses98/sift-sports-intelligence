import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FoundationProjection } from '../src/components/FoundationProjection';
import { ProjectionScorecard } from '../src/components/ProjectionScorecard';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import {
  agreement, coherenceProblems, decodeProjections, decodeSummary, displayState, familyOf, findProjection, isPrimary,
  projectionsUrl, summaryUrl, type ProjectionDoc,
} from '../src/lib/projections';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const player = (over: Record<string, unknown> = {}) => ({
  player_id: '00-0036900', name: "Ja'Marr Chase", team: 'CIN', opponent: 'PIT', game_id: '2026_07_PIT_CIN',
  family: 'receptions', mean: 6.4, median: 6, p10: 3, p90: 10,
  thresholds: { '4': 0.8, '6': 0.55, '8': 0.27 },
  opportunity: { family: 'targets', mean: 9.1, p10: 5, p90: 13 },
  opponent_adjustment: { factor: 1.04, sample_games: 6 },
  adjustments: ['Target share 27% (last 8 games, shrunk)'],
  readiness: 'SHADOW VALIDATION', gate: { status: 'PASS', findings: [] }, data_asof_utc: '2026-10-18T06:00:00Z', ...over,
});
const doc = (players: Record<string, unknown>[] = [player()], authority = 'research_only') => ({
  schema: 'sift.projections.v1', sport: 'NFL', generated_utc: '2026-10-18T07:00:00Z', data_asof_utc: '2026-10-18T06:00:00Z',
  model: { id: 'pf-nfl', version: 'pf-1.0.0', authority },
  families: { receptions: { readiness: 'SHADOW VALIDATION', model: 'C_opp_x_eff', reason: 'beat baselines on validation' } },
  games: [{ game_id: '2026_07_PIT_CIN', teams: [{ team: 'CIN', family: 'team_points', mean: 24.1, p10: 13, p90: 35 }] }],
  players,
});

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(null); });

describe('projection contract', () => {
  it('decodes only the documented schema with research-only authority', () => {
    const d = decodeProjections(doc())!;
    expect(d.players).toHaveLength(1);
    expect(d.teams[0].mean).toBe(24.1);
    expect(d.players[0].thresholds.map((t) => t.k)).toEqual([4, 6, 8]);
    expect(decodeProjections(doc([player()], 'actionable'))).toBeNull();
    expect(decodeProjections({ ...doc(), schema: 'x' })).toBeNull();
    expect(decodeProjections(null)).toBeNull();
  });
  it('maps app stat keys onto engine families', () => {
    expect(familyOf('pts')).toBe('points');
    expect(familyOf('sog')).toBe('shots');
    expect(familyOf('receiving_yards')).toBe('receiving_yards');
  });
  it('joins by id, or by name only together with the team', () => {
    const d = decodeProjections(doc())!;
    expect(findProjection(d, { playerId: '00-0036900', stat: 'receptions' })).not.toBeNull();
    expect(findProjection(d, { name: 'JaMarr Chase', team: 'CIN', stat: 'receptions' })).not.toBeNull();
    expect(findProjection(d, { name: "Ja'Marr Chase", team: null, stat: 'receptions' })).toBeNull();
    expect(findProjection(d, { name: "Ja'Marr Chase", team: 'BAL', stat: 'receptions' })).toBeNull();
    expect(findProjection(d, { playerId: '00-0036900', stat: 'receiving_yards' })).toBeNull();
  });
  it('withholds BLOCKed and incoherent projections and never shows their number', () => {
    const blocked = decodeProjections(doc([player({ gate: { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] } })]))!;
    expect(displayState(blocked, blocked.players[0], NOW)).toEqual({ kind: 'withheld', reason: 'Player listed OUT' });
    const bad = decodeProjections(doc([player({ thresholds: { '4': 0.5, '6': 0.6 } })]))!;
    expect(coherenceProblems(bad.players[0])[0]).toMatch(/not coherent/);
    expect(displayState(bad, bad.players[0], NOW).kind).toBe('withheld');
    const inv = decodeProjections(doc([player({ p10: 12, p90: 3 })]))!;
    expect(displayState(inv, inv.players[0], NOW).kind).toBe('withheld');
  });
  it('marks stale projections and never promotes without an owner-approved family', () => {
    const d = decodeProjections(doc([player({ readiness: 'READY' })]))!;
    const fresh = displayState(d, d.players[0], NOW);
    expect(fresh.kind === 'shown' && !fresh.stale).toBe(true);
    expect(isPrimary('NFL', fresh)).toBe(false); // PROMOTED_FAMILIES is empty by default
    const old = displayState(d, d.players[0], NOW + 30 * 864e5);
    expect(old.kind === 'shown' && old.stale).toBe(true);
  });
  it('states agreement between models without turning it into an edge', () => {
    expect(agreement(6.2, 6.4)!.tone).toBe('ok');
    const a = agreement(4.0, 6.4)!;
    expect(a.tone).toBe('caution');
    expect(a.words).toMatch(/uncertain, not as an edge/);
    expect(agreement(null, 6.4)).toBeNull();
  });
  it('summary decode keeps readiness and holdout numbers', () => {
    const s = decodeSummary({ schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024-2025' },
      families: [{ family: 'receptions', readiness: 'SHADOW VALIDATION', readiness_reason: 'r', best_model: 'C', holdout: { n_obs: 9000, mae: 1.4, bias: -0.1, cover_80: 0.79, vs_baseline: { mean_diff: -0.02 } } },
                 { family: 'x', readiness: 'BOGUS' }] })!;
    expect(s.families[0].holdout!.cover80).toBe(0.79);
    expect(s.families[1].readiness).toBe('INSUFFICIENT DATA');
  });
});

describe('components', () => {
  it('renders nothing when no projection is published', async () => {
    setFetchJson(async (url) => { throw new NotFoundError(url); });
    const r = render(<FoundationProjection sport="NFL" stat="receptions" playerId="00-0036900" now={NOW} />);
    await new Promise((res) => setTimeout(res, 20));
    expect(r.container).toBeEmptyDOMElement();
  });
  it('shows value, range, opportunity, readiness and model agreement', async () => {
    setFetchJson(async (url) => { expect(url).toBe(projectionsUrl('NFL')); return doc(); });
    render(<FoundationProjection sport="NFL" stat="receptions" playerId="00-0036900" incumbent={4.1} now={NOW} />);
    const el = await screen.findByTestId('foundation-projection');
    expect(el).toHaveTextContent(/Independent projection · shadow/);
    expect(el).toHaveTextContent(/6\.4.*realistic range 3\.0–10\.0.*targets 9\.1.*opponent ×1\.04 \(6 games\)/);
    expect(el).toHaveTextContent(/Shadow validation/);
    expect(screen.getByTestId('foundation-agreement')).toHaveTextContent(/disagree/);
    expect(el).not.toHaveTextContent(/profitable|value bet|\bbet\b/i);
  });
  it('explains a withheld projection without its number', async () => {
    setFetchJson(async () => doc([player({ gate: { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] } })]));
    render(<FoundationProjection sport="NFL" stat="receptions" playerId="00-0036900" now={NOW} />);
    const el = await screen.findByTestId('foundation-projection');
    expect(el).toHaveAttribute('data-state', 'withheld');
    expect(el).not.toHaveTextContent('6.4');
  });
  it('Research Lab scorecard lists family readiness from the summary', async () => {
    setFetchJson(async (url) => {
      expect(url).toBe(summaryUrl('NFL'));
      return { schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024-2025 seasons' },
        families: [{ family: 'receiving_yards', readiness: 'SHADOW VALIDATION', readiness_reason: 'beat baselines', best_model: 'C', holdout: { n_obs: 9000, mae: 18.2, cover_80: 0.8 } }] };
    });
    render(<ProjectionScorecard sport="NFL" />);
    await waitFor(() => expect(screen.getByTestId('projection-scorecard')).toHaveTextContent(/Receiving yards.*held-out error 18\.20, 80% range caught 80%/));
  });
});

export type { ProjectionDoc };
