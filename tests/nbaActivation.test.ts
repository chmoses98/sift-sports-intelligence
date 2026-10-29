// The seven NBA player families promoted on 2026-10-23 (minutes, points, rebounds, assists, threes, PRA, FGA) after three independent joint READY verdicts.
// What this proves: the promotion is in force and narrow (approvals, engines, fallback triggers; team points still held); what SIFT shows for the real first
// live feed behaves as required (uncertain / unverified = Low reliability with its reason; ruled-out and blocked rows withheld); and the verification still
// refuses to call a feed ready while the evidence is missing. Real rows: tests/fixtures/nba-activation/first_live_run_rows.json (nba-edge-finder,
// 2026-10-19T18:52Z). Synthetic variants are marked as such and exist only to exercise the decision logic.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NBA_FAMILIES, verifyNbaFeed } from '../src/lib/nbaActivation';
import { APPROVALS, approvalFor, engineFor } from '../src/lib/projectionApprovals';
import { makeAuthority } from '../src/lib/projectionAuthority';
import { decodeProjections } from '../src/lib/projections';

const real = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'nba-activation', 'first_live_run_rows.json'), 'utf-8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOW = Date.parse('2026-10-19T19:30:00Z');
const clone = () => JSON.parse(JSON.stringify(real)) as typeof real;
const decode = (raw: unknown) => decodeProjections(raw);
const status = (v: ReturnType<typeof verifyNbaFeed>, id: string) => v.checks.find((c) => c.id === id)!.status;

describe('the promotion', () => {
  it('has all seven families promoted to the Foundation engine with the narrow fallback, and team points held', () => {
    for (const f of NBA_FAMILIES) {
      expect(engineFor('NBA', f, [])).toBe('foundation');
      expect(approvalFor('NBA', f)!.decision).toBe('PROMOTED');
      expect(approvalFor('NBA', f)!.fallback!.triggers).toEqual(['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED']);
    }
    expect(APPROVALS.filter((a) => a.sport === 'NBA' && a.decision === 'PROMOTED').map((a) => a.family).sort()).toEqual([...NBA_FAMILIES].sort());
    expect(approvalFor('NBA', 'team_points')!.decision).toBe('HELD');
    expect(engineFor('NBA', 'team_points', [])).toBe('legacy');
  });
  it('resolves every row of the real first feed through the approved projection authority: a projection or a withheld reason, never the established engine and never a fallback', () => {
    const doc = decode(real)!;
    const a = makeAuthority('NBA', doc, NOW);
    for (const p of doc.players) {
      const r = a.resolve({ stat: p.family, playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent });
      expect(['authoritative', 'withheld']).toContain(r.kind);
      if (r.kind === 'withheld') expect(r.fallbackEligible).toBeUndefined();   // fresh feed, row present: the fallback situations do not arise
    }
  });
  it('the rollback switch moves one family back to the established engine without touching the others', () => {
    expect(engineFor('NBA', 'points', [{ sport: 'NBA', family: 'points' }])).toBe('legacy');
    expect(engineFor('NBA', 'rebounds', [{ sport: 'NBA', family: 'points' }])).toBe('foundation');
    expect(engineFor('NBA', 'team_points', [], true)).toBe('legacy');         // a preview flag cannot promote the held family either
  });
  it('S1 (the promotion in force and narrow) and S10 (the fallback stays closed) pass on the real first feed', () => {
    const v = verifyNbaFeed(decode(real), NOW);
    expect(status(v, 'S1')).toBe('PASS');
    expect(status(v, 'S10')).toBe('PASS');
  });
});

describe('the real first live feed', () => {
  const v = verifyNbaFeed(decode(real), NOW);
  it('is NOT ready: no ruled-out and no available player is on it yet, because the league had published no player-level rows', () => {
    expect(v.ready).toBe(false);
    expect(status(v, 'S4')).toBe('PENDING');
    expect(status(v, 'S7')).toBe('PENDING');
    expect(status(v, 'S5')).toBe('PENDING');
  });
  it('shows every unverified player at Low reliability (conditional on playing), and keeps the promotion, readability, readiness and identity PASS', () => {
    expect(['S1', 'S2', 'S3', 'S6', 'S8'].map((id) => status(v, id))).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
    for (const fam of ['points', 'minutes']) expect(Object.keys(v.tally[fam])).toEqual(['authoritative:LOW']);
  });
});

describe('the decision logic (SYNTHETIC variants of the real rows)', () => {
  function resolved(): typeof real {
    // as the corrected pipeline resolves the same real observations: ESPN OUT -> LIKELY_OUT + BLOCK, QUESTIONABLE -> UNCERTAIN + REVIEW,
    // and every unobserved player -> LIKELY_ACTIVE + PASS (what an official report with player-level rows would give them)
    const d = clone();
    for (const p of d.players) {
      const st = p.participation.status as string;
      if (st !== 'UNVERIFIED') continue;
      p.participation = { ...p.participation, status: 'LIKELY_ACTIVE', certainty: 'REPORTED', source: 'nba_official_injury_report', captured_utc: '2026-10-19T18:50:00Z' };
      p.gate = { status: 'PASS', findings: [] };
    }
    // the first few rows stand in for the observed players
    const obs = d.players.slice(0, 6);
    obs.forEach((p: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const out = i % 2 === 0;
      p.participation = { ...p.participation, status: out ? 'LIKELY_OUT' : 'UNCERTAIN', certainty: 'PROJECTED', source: 'espn_injuries' };
      p.gate = { status: out ? 'BLOCK' : 'REVIEW', findings: out ? [{ check: 'participation', severity: 'BLOCK', what: 'Ruled out before the game', category: 'availability', action: '' }] : [] };
    });
    return d;
  }
  it('is READY only when ruled-out rows are withheld, uncertain rows are Low and available rows have a projection', () => {
    const v = verifyNbaFeed(decode(resolved()), NOW);
    expect(v.checks.filter((c) => c.status !== 'PASS')).toEqual([]);
    expect(v.ready).toBe(true);
    const t = v.tally.points;
    expect(t['withheld:GATE_BLOCK']).toBeGreaterThan(0);                     // the ruled-out rows are withheld
    expect(Object.keys(t).filter((k) => k.startsWith('authoritative'))).toContain('authoritative:LOW');
  });
  it('is not ready if a family is not READY', () => {
    const d = resolved();
    d.families.pra.readiness = 'SHADOW VALIDATION';
    const v = verifyNbaFeed(decode(d), NOW);
    expect(status(v, 'S3')).toBe('FAIL');
    expect(v.ready).toBe(false);
  });
  it('is not ready on a malformed identity (duplicate rows or a team playing itself)', () => {
    const d = resolved();
    d.players.push(JSON.parse(JSON.stringify(d.players[8])));
    expect(status(verifyNbaFeed(decode(d), NOW), 'S8')).toBe('FAIL');
    const e = resolved();
    e.players[9].opponent = e.players[9].team;
    expect(status(verifyNbaFeed(decode(e), NOW), 'S8')).toBe('FAIL');
  });
  it('withholds stale inputs along with everything else, and is not ready on a missing feed', () => {
    const stale = verifyNbaFeed(decode(resolved()), NOW + 72 * 3600_000);
    expect(Object.keys(stale.tally.points).filter((k) => k.startsWith('authoritative'))).toEqual([]);
    expect(stale.tally.points['withheld:STALE']).toBeGreaterThan(0);
    expect(status(stale, 'S9')).toBe('FAIL');                                // withheld only because the feed is old: verify on a current feed
    const none = verifyNbaFeed(null, NOW);
    expect(none.ready).toBe(false);
    expect(status(none, 'S2')).toBe('FAIL');
  });
  it('a malformed feed is unreadable, not a pass', () => {
    expect(verifyNbaFeed(decode({ schema: 'sift.projections.v1', sport: 'NBA', players: 'x', model: { authority: 'betting' } }), NOW).ready).toBe(false);
    expect(verifyNbaFeed(decode(null), NOW).ready).toBe(false);
  });
});
