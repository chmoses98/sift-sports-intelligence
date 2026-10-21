// Pins the decision-table facts docs/V4_PROJECTION_COVERAGE.md is written from. If a row is promoted, held or retained, this fails
// and the audit must be re-read: it also keeps v4 from ever being pointed at a projection the approvals table does not authorise.
import { describe, expect, it } from 'vitest';
import { APPROVALS, engineFor } from '../src/lib/projectionApprovals';

const of = (sport: string) => APPROVALS.filter((a) => a.sport === sport);
const names = (sport: string, decision: string) => of(sport).filter((a) => a.decision === decision).map((a) => a.family).sort();

describe('the v4 projection coverage audit matches the approvals table', () => {
  it('NBA: seven player families approved on history and waiting on live inputs, team points held; the established engine is still the number', () => {
    expect(names('NBA', 'APPROVED_PENDING_LIVE_INPUTS')).toEqual(['assists', 'fga', 'minutes', 'points', 'pra', 'rebounds', 'threes']);
    expect(names('NBA', 'HELD')).toEqual(['team_points']);
    expect(names('NBA', 'PROMOTED')).toEqual([]);
    for (const a of of('NBA')) expect(engineFor('NBA', a.family, [])).toBe('legacy');
  });

  it('MLB: only the three pitcher families are promoted, each requiring a verified starter; every hitter family is held', () => {
    expect(names('MLB', 'PROMOTED')).toEqual(['batters_faced', 'outs', 'pitcher_strikeouts']);
    for (const f of ['batters_faced', 'outs', 'pitcher_strikeouts']) expect(APPROVALS.find((a) => a.sport === 'MLB' && a.family === f)!.requiresVerifiedParticipation).toBe(true);
    expect(names('MLB', 'HELD')).toEqual(['game_total', 'hits', 'home_runs', 'hits_runs_rbis', 'pitcher_hits_allowed', 'pitcher_runs_allowed', 'pitcher_walks', 'plate_appearances', 'rbis', 'runs', 'team_runs', 'total_bases'].sort());
  });

  it('NHL: every family is retained, so no foundation number is shown for any NHL stat', () => {
    expect(names('NHL', 'RETAINED')).toEqual(['assists', 'goals', 'points', 'saves', 'shots', 'team_goals']);
    expect(of('NHL').every((a) => a.decision === 'RETAINED')).toBe(true);
    for (const a of of('NHL')) expect(engineFor('NHL', a.family, [])).toBe('legacy');
  });

  it('a promotion is never created by configuration: the rollback switch only moves a family back to legacy', () => {
    expect(engineFor('NBA', 'points', [])).toBe('legacy');
    expect(engineFor('MLB', 'outs', [{ sport: 'MLB', family: 'outs' }])).toBe('legacy');
  });
});
