// What SIFT shows for the seven promoted NBA player families (minutes, points, rebounds, assists, threes, PRA, FGA), judged on a published
// feed. Pure: scripts/verify-nba-activation.ts fetches the feed, tests/nbaActivation.test.ts feeds it recorded and synthetic documents.
//
// Promoted 2026-10-23 (docs/PROJECTION_PROMOTION.md §11) after the repository's own activation check
// (nba-edge-finder research/projection_foundation/nba/live/activation_check.py) and this verification both read READY on three independent
// feeds. This script changes nothing: it is the check that must read READY on a fresh feed immediately before each activation or re-activation,
// and the monitor that says whether the promotion still behaves. NBA team points stay HELD.
import { approvalFor, engineFor } from './projectionApprovals';
import { makeAuthority, type Resolution } from './projectionAuthority';
import { MAX_AGE_H, teamKey, type ProjectionDoc } from './projections';

export const NBA_FAMILIES = ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga'] as const;
export type CheckStatus = 'PASS' | 'FAIL' | 'PENDING';
export interface NbaCheck { id: string; title: string; status: CheckStatus; detail: string }

const bucket = (r: Resolution): string => (r.kind === 'withheld' ? `withheld:${r.code}` : r.kind === 'fallback' ? `fallback:${r.trigger}` : r.kind === 'authoritative' ? `authoritative:${r.value.reliability}` : 'legacy');

export function verifyNbaFeed(doc: ProjectionDoc | null, nowMs: number): { checks: NbaCheck[]; ready: boolean; tally: Record<string, Record<string, number>> } {
  const checks: NbaCheck[] = [];
  const add = (id: string, title: string, status: CheckStatus, detail: string) => checks.push({ id, title, status, detail });
  // S1 the promotion is in force, and narrow: the approvals say PROMOTED with the fallback limited to the three approved situations, and no row of
  // the feed resolves to the established engine
  const live = makeAuthority('NBA', doc, nowMs);
  const FALLBACK_TRIGGERS = ['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED'];
  const promotedOk = NBA_FAMILIES.every((f) => {
    const a = approvalFor('NBA', f);
    return a?.decision === 'PROMOTED' && engineFor('NBA', f, []) === 'foundation' && a.fallback?.engine === 'legacy' && JSON.stringify(a.fallback.triggers) === JSON.stringify(FALLBACK_TRIGGERS);
  });
  const teamsHeld = approvalFor('NBA', 'team_points')?.decision === 'HELD' && engineFor('NBA', 'team_points', []) === 'legacy';
  const leaks = NBA_FAMILIES.filter((f) => doc?.players.some((p) => p.family === f && live.resolve({ stat: f, playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent, gameId: p.gameId }).kind === 'legacy'));
  add('S1', 'The promotion is in force and narrow: the seven families resolve to the Foundation engine, the fallback is limited to FEED_UNAVAILABLE / STALE / NOT_PUBLISHED, and team points stay held',
    promotedOk && teamsHeld && !leaks.length ? 'PASS' : 'FAIL',
    `approvals ${promotedOk ? 'promoted with the narrow fallback' : 'NOT as approved'}; team_points ${teamsHeld ? 'held' : 'NOT held'}; families resolving to the established engine: ${leaks.join(',') || 'none'}`);
  if (!doc) {
    add('S2', 'The feed is published and readable by SIFT', 'FAIL', 'missing, unreachable or unrecognised');
    return { checks, ready: false, tally: {} };
  }
  add('S2', 'The feed is published and readable by SIFT', 'PASS', `generated ${doc.generatedAt}; ${doc.players.length} player rows; model ${doc.modelVersion}`);
  const ageH = doc.dataAsOf ? (nowMs - Date.parse(doc.dataAsOf)) / 3.6e6 : NaN;
  add('S9', `The feed is current (inputs within ${MAX_AGE_H.NBA} h)`, Number.isFinite(ageH) && ageH >= -0.1 && ageH <= MAX_AGE_H.NBA ? 'PASS' : 'FAIL',
    Number.isFinite(ageH) ? `inputs are ${Math.round(ageH * 10) / 10} h old` : 'the feed carries no input time');
  const missing = NBA_FAMILIES.filter((f) => doc.families[f]?.readiness !== 'READY');
  add('S3', 'All seven families are published and READY', missing.length ? 'FAIL' : 'PASS', missing.length ? `not READY: ${missing.join(', ')}` : 'published and READY');
  const tally: Record<string, Record<string, number>> = {};
  const bad: Record<string, string[]> = { out: [], uncertain: [], blocked: [], eligible: [], identity: [], fallback: [] };
  const seen = new Set<string>();
  for (const p of doc.players) {
    if (!(NBA_FAMILIES as readonly string[]).includes(p.family)) continue;
    const r = live.resolve({ stat: p.family, playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent, gameId: p.gameId });
    const b = bucket(r);
    (tally[p.family] ??= {})[b] = ((tally[p.family] ?? {})[b] ?? 0) + 1;
    const st = p.participation?.status ?? 'UNVERIFIED';
    const label = `${p.name} ${p.family}`;
    if (st === 'CONFIRMED_OUT' || st === 'LIKELY_OUT') { if (r.kind !== 'withheld') bad.out.push(label); }      // withheld by the BLOCK or by the OUT check, whichever fires first
    else if (p.gate.status === 'BLOCK') { if (r.kind !== 'withheld') bad.blocked.push(label); }
    else if (st === 'UNCERTAIN' || st === 'UNVERIFIED') { if (!(r.kind === 'authoritative' && r.value.reliability === 'LOW') && !(r.kind === 'withheld' && ['STALE', 'INCOHERENT'].includes(r.code))) bad.uncertain.push(label); }
    else if (st === 'LIKELY_ACTIVE' || st === 'CONFIRMED_ACTIVE') { if (!(r.kind === 'authoritative' || (r.kind === 'withheld' && ['STALE', 'INCOHERENT'].includes(r.code)))) bad.eligible.push(label); }
    // the fallback is open only for a missing, stale or unpublished feed: never for a ruled-out, blocked, incoherent or unvalidated row
    if (r.kind === 'fallback' || (r.kind === 'withheld' && r.fallbackEligible && !FALLBACK_TRIGGERS.includes(r.code))) bad.fallback.push(label);
    const key = `${p.gameId}|${p.playerId}|${p.family}`;
    if (!/^espn:\d+$/.test(p.playerId) || !p.team || !p.opponent || !/^espn:\d+$/.test(p.gameId) || seen.has(key) || teamKey(p.team) === teamKey(p.opponent)) bad.identity.push(label);
    seen.add(key);
  }
  const rows = doc.players.filter((p) => (NBA_FAMILIES as readonly string[]).includes(p.family));
  const has = (pred: (s: string) => boolean) => rows.some((p) => pred(p.participation?.status ?? 'UNVERIFIED'));
  const list = (a: string[]) => a.slice(0, 4).join(', ');
  add('S4', 'Ruled-out players (confirmed or likely out) are withheld, not shown', bad.out.length ? 'FAIL' : has((s) => s === 'CONFIRMED_OUT' || s === 'LIKELY_OUT') ? 'PASS' : 'PENDING',
    bad.out.length ? `shown despite being ruled out: ${list(bad.out)}` : has((s) => s === 'CONFIRMED_OUT' || s === 'LIKELY_OUT') ? 'every ruled-out row is withheld' : 'no ruled-out player in the feed yet');
  add('S5', 'Rows the engine BLOCKed are withheld', bad.blocked.length ? 'FAIL' : rows.some((p) => p.gate.status === 'BLOCK') ? 'PASS' : 'PENDING', bad.blocked.length ? `shown despite a BLOCK: ${list(bad.blocked)}` : rows.some((p) => p.gate.status === 'BLOCK') ? 'every blocked row is withheld' : 'no blocked row in the feed yet');
  add('S6', 'Uncertain or unverified availability is shown at Low reliability, with its reason, never as High', bad.uncertain.length ? 'FAIL' : has((s) => s === 'UNCERTAIN' || s === 'UNVERIFIED') ? 'PASS' : 'PENDING',
    bad.uncertain.length ? `not Low: ${list(bad.uncertain)}` : 'uncertain / unverified rows resolve to Low reliability');
  const eligible = has((s) => s === 'LIKELY_ACTIVE' || s === 'CONFIRMED_ACTIVE');
  add('S7', 'Players listed or confirmed available get a projection', bad.eligible.length ? 'FAIL' : eligible ? 'PASS' : 'PENDING',
    bad.eligible.length ? `withheld although available: ${list(bad.eligible)}` : eligible ? 'every available row resolves to a projection' : 'no player is listed available yet (the official report has not published player-level rows)');
  add('S8', 'Identity: ESPN player and game ids, a distinct team and opponent, one row per player, game and family', bad.identity.length ? 'FAIL' : 'PASS', bad.identity.length ? `problems: ${list(bad.identity)}` : 'identities are well-formed and unique');
  add('S10', 'The established-model fallback stays closed on a current feed: no row is eligible for it except through a missing, stale or unpublished feed',
    bad.fallback.length ? 'FAIL' : 'PASS', bad.fallback.length ? `fallback open where it must not be: ${list(bad.fallback)}` : 'no ruled-out, blocked, incoherent or unvalidated row can fall back; no row on this feed needs it');
  const ready = checks.every((c) => c.status === 'PASS');
  return { checks, ready, tally };
}
