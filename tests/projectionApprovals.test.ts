// The promotion record: which engine is SIFT's one number for each stat, and the evidence that justifies it.
import { describe, expect, it } from 'vitest';
import evidence from '../research/projection_foundation/promotion/evidence.json';
import { APPROVALS, approvalFor, engineFor, parseRollback } from '../src/lib/projectionApprovals';
import { evidenceVerdict, PROMOTION_POLICY, type EvidenceFile } from '../src/lib/projectionPolicy';

const ev = evidence as unknown as EvidenceFile;

describe('promotion approvals vs the frozen holdout evidence', () => {
  it('has exactly one decision for every family the study evaluated, and none without evidence', () => {
    for (const [sport, s] of Object.entries(ev.sports)) {
      for (const family of Object.keys(s.families)) expect(approvalFor(sport, family), `${sport}:${family} has no decision`).not.toBeNull();
    }
    const keys = APPROVALS.map((a) => `${a.sport}:${a.family}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of APPROVALS) expect(ev.sports[a.sport]?.families[a.family], `${a.sport}:${a.family} has no evidence`).toBeDefined();
  });

  it('promotes (or approves) a family only when the policy passes, and holds every family the policy fails', () => {
    for (const a of APPROVALS) {
      const v = evidenceVerdict(ev.sports[a.sport].families[a.family], { competingProductionNumber: a.competingProductionNumber });
      const wantsPromotion = a.decision === 'PROMOTED' || a.decision === 'APPROVED_PENDING_LIVE_INPUTS';
      expect(v.ok, `${a.sport}:${a.family} ${a.decision}: ${v.reasons.join('; ')}`).toBe(wantsPromotion);
    }
  });

  it('shows the engine only for PROMOTED rows; everything else keeps the established model', () => {
    for (const a of APPROVALS) expect(a.engine).toBe(a.decision === 'PROMOTED' ? 'foundation' : 'legacy');
    expect(engineFor('NFL', 'receptions', [])).toBe('foundation');
    expect(engineFor('NFL', 'passing_tds', [])).toBe('legacy');
    expect(engineFor('NBA', 'points', [])).toBe('legacy');          // approved on history, waiting on live availability
    expect(engineFor('NHL', 'shots', [])).toBe('legacy');           // significant but marginal
    expect(engineFor('MLB', 'hits', [])).toBe('legacy');            // hitters stay out
    expect(engineFor('XXX', 'anything', [])).toBe('legacy');
  });

  it('applies the owner’s named exclusions and candidates', () => {
    const decision = (s: string, f: string) => approvalFor(s, f)!.decision;
    expect(decision('NFL', 'passing_tds')).toBe('RETAINED');
    expect(decision('NFL', 'passing_yards')).toBe('HELD');            // interval versus the incumbent includes 0
    for (const f of ['receptions', 'targets', 'completions', 'team_pass_attempts', 'team_rush_attempts']) expect(decision('NFL', f)).toBe('PROMOTED');
    for (const f of ['shots', 'assists', 'points', 'saves']) expect(decision('NHL', f)).toBe('RETAINED');
    for (const f of ['pitcher_strikeouts', 'batters_faced', 'outs']) expect(decision('MLB', f)).toBe('PROMOTED');
    for (const f of ['hits', 'total_bases', 'home_runs', 'rbis', 'runs', 'plate_appearances']) expect(decision('MLB', f)).toBe('HELD');
    for (const f of ['team_points', 'plays', 'team_passing_yards', 'team_rushing_yards', 'points_per_play', 'success_rate']) expect(decision('CFB', f)).toBe('PROMOTED');
    for (const f of ['game_total', 'margin']) expect(decision('CFB', f)).toBe('RETAINED');
    for (const f of ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga']) expect(decision('NBA', f)).toBe('APPROVED_PENDING_LIVE_INPUTS');
  });

  it('approves a fallback to the established model only where it is explicit, bounded and narrow', () => {
    const withFb = APPROVALS.filter((a) => a.fallback);
    expect(withFb.map((a) => `${a.sport}:${a.family}`).sort()).toEqual(['MLB:outs', 'MLB:pitcher_strikeouts', 'NFL:completions', 'NFL:receptions']);
    for (const a of withFb) {
      expect(a.fallback!.triggers).toEqual(['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED']);   // never OUT, GATE_BLOCK, INCOHERENT, FAMILY_NOT_READY, NOT_PROJECTED
    }
    for (const a of APPROVALS.filter((x) => !x.fallback)) expect(a.fallback).toBeNull();
  });

  it('requires a verified starter for every promoted MLB pitcher stat', () => {
    for (const a of APPROVALS.filter((x) => x.sport === 'MLB' && x.decision === 'PROMOTED')) expect(a.requiresVerifiedParticipation).toBe(true);
  });

  it('keeps the policy’s materiality floor at 1% (NHL’s significant 0.3–1.0% gains stay marginal)', () => {
    expect(PROMOTION_POLICY.minRelativeGain).toBe(0.01);
    for (const f of ['shots', 'assists', 'points']) {
      const e = ev.sports.NHL.families[f];
      expect(e.vsIncumbent!.hi).toBeLessThan(0);
      expect(e.relGain!).toBeLessThan(0.01);
    }
  });
});

describe('rollback of one family without reverting the deployment', () => {
  it('parses the build-time switch and can only move a family back to legacy', () => {
    expect(parseRollback('NFL:receptions=legacy; MLB:*=legacy')).toEqual([{ sport: 'NFL', family: 'receptions' }, { sport: 'MLB', family: '*' }]);
    expect(parseRollback('NFL:receptions=foundation')).toEqual([]);    // a promotion is never created by configuration
    expect(parseRollback(undefined)).toEqual([]);
    const rb = parseRollback('NFL:receptions=legacy');
    expect(engineFor('NFL', 'receptions', rb)).toBe('legacy');
    expect(engineFor('NFL', 'completions', rb)).toBe('foundation');   // only that family moved
    expect(engineFor('MLB', 'outs', parseRollback('MLB:*=legacy'))).toBe('legacy');
    expect(engineFor('CFB', 'plays', parseRollback('MLB:*=legacy'))).toBe('foundation');
  });
});
