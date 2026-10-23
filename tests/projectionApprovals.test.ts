// The promotion record: which engine is SIFT's one number for each stat, and the evidence that justifies it.
import { describe, expect, it } from 'vitest';
import evidence from '../research/projection_foundation/promotion/evidence.json';
import { APPROVALS, approvalFor, engineFor, parseRollback } from '../src/lib/projectionApprovals';
import absolute from '../research/projection_foundation/promotion/absolute_evidence.json';
import { ABSOLUTE_STANDARD, absoluteVerdict, evidenceVerdict, PROMOTION_POLICY, type AbsoluteEvidenceFile, type EvidenceFile } from '../src/lib/projectionPolicy';

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
    expect(engineFor('NBA', 'points', [])).toBe('foundation');      // promoted 2026-10-23 after three independent joint READY verdicts
    expect(engineFor('NBA', 'team_points', [])).toBe('legacy');     // team points stay held
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
    for (const f of ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga']) expect(decision('NBA', f)).toBe('PROMOTED');
    expect(decision('NBA', 'team_points')).toBe('HELD');
  });

  it('approves a fallback to the established model only where it is explicit, bounded and narrow', () => {
    const withFb = APPROVALS.filter((a) => a.fallback);
    expect(withFb.map((a) => `${a.sport}:${a.family}`).sort()).toEqual(['MLB:outs', 'MLB:pitcher_strikeouts', 'NBA:assists', 'NBA:fga', 'NBA:minutes', 'NBA:points', 'NBA:pra', 'NBA:rebounds', 'NBA:threes', 'NFL:completions', 'NFL:receptions']);
    for (const a of withFb) {
      expect(a.fallback!.triggers).toEqual(['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED']);   // never OUT, GATE_BLOCK, INCOHERENT, FAMILY_NOT_READY, NOT_PROJECTED
    }
    for (const a of APPROVALS.filter((x) => !x.fallback)) expect(a.fallback).toBeNull();
  });

  it('records the NBA promotion and its fallback as the owner approved them (2026-10-23), and keeps team points held with no fallback', () => {
    for (const f of ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga']) {
      const a = approvalFor('NBA', f)!;
      expect(a.decision).toBe('PROMOTED');
      expect(a.approvedOn).toBe('2026-10-23');
      expect(a.competingProductionNumber).toBe(true);
      expect(a.fallback).toMatchObject({ engine: 'legacy', approvedOn: '2026-10-23', triggers: ['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED'] });
      expect(a.fallback!.approval).toMatch(/^Owner-approved 2026-10-23/);
      expect(a.fallback!.approval).toMatch(/Never for a player who is ruled out, a projection the quality gate blocked, or an incoherent one/);
      expect(a.requiresVerifiedParticipation).toBeUndefined();            // an uncertain or unverified player is shown at Low reliability, not hidden
    }
    expect(approvalFor('NBA', 'team_points')).toMatchObject({ decision: 'HELD', engine: 'legacy', fallback: null });
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

describe('absolute publication standard for families promoted without an incumbent comparison', () => {
  const abs = absolute as unknown as AbsoluteEvidenceFile & { rules: Record<string, number> };

  it('uses exactly the rules the evidence script documents', () => {
    expect(abs.rules).toEqual(ABSOLUTE_STANDARD);
  });

  it('records a publication verdict for every promoted family that has no incumbent comparison, and for CFB team points', () => {
    const noIncumbent = APPROVALS.filter((a) => a.decision === 'PROMOTED' && !ev.sports[a.sport].families[a.family].vsIncumbent).map((a) => `${a.sport}:${a.family}`);
    expect(noIncumbent.sort()).toEqual(['CFB:plays', 'CFB:points_per_play', 'CFB:success_rate', 'CFB:team_passing_yards', 'CFB:team_rushing_yards', 'NFL:team_pass_attempts', 'NFL:team_rush_attempts']);
    for (const k of [...noIncumbent, 'CFB:team_points']) {
      const [sport, family] = k.split(':');
      expect(approvalFor(sport, family)!.publication, k).toBeDefined();
      expect(abs.families[k], k).toBeDefined();
    }
  });

  it('the recorded standard equals the verdict recomputed from the per-period numbers (TypeScript and Python agree)', () => {
    for (const [k, f] of Object.entries(abs.families)) {
      const v = absoluteVerdict(f.periods);
      expect(v, k).toEqual(f.verdict);
      const [sport, family] = k.split(':');
      expect(approvalFor(sport, family)!.publication!.standard, k).toBe(v.status);
    }
  });

  it('a family that fails the standard is withheld, however well it beats the baseline', () => {
    const f = abs.families['CFB:success_rate'];
    expect(f.verdict.status).toBe('NOT_MET');
    expect(f.verdict.failures.join(' ')).toMatch(/2026 to date.*80% range covers 0\.732/);
    // it beat the baseline on every period; that alone was not enough
    for (const p of f.periods) expect(p.crps).toBeLessThan(p.baselineCrps);
  });

  it('a verdict is NOT_MET if calibration, bias, information or stability fails, and cannot be decided by a small sample', () => {
    const base = abs.families['CFB:plays'].periods;
    const mutate = (i: number, over: object) => base.map((p, j) => (j === i ? { ...p, ...over } : p));
    expect(absoluteVerdict(base).status).toBe('MET');
    expect(absoluteVerdict(mutate(1, { cover80: 0.74 })).status).toBe('NOT_MET');                // under-coverage
    expect(absoluteVerdict(mutate(1, { cover90: 0.97 })).status).toBe('NOT_MET');                // over-coverage
    expect(absoluteVerdict(mutate(1, { pitVar: 1.4 })).status).toBe('NOT_MET');                  // PIT
    expect(absoluteVerdict(mutate(1, { bias: 2 })).status).toBe('NOT_MET');                      // bias 0.15 x RMSE
    expect(absoluteVerdict(mutate(1, { crps: base[1].baselineCrps * 0.995 })).status).toBe('NOT_MET');   // under 1%
    expect(absoluteVerdict(mutate(2, { vsBaseline: { diff: -0.1, lo: -0.3, hi: 0.1 } })).status).toBe('NOT_MET'); // not confirmed later
    expect(absoluteVerdict(mutate(3, { clusters: 80, cover80: 0.6 })).status).not.toBe('NOT_MET');      // 80 games cannot decide
    expect(absoluteVerdict(mutate(0, { cover80: 0.2 })).status).toBe('MET');                      // the selection split never decides
  });
});
