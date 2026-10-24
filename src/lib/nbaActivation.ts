// What SIFT would show for the improved NBA engines if they were promoted today, judged on a published feed. Pure: the script
// scripts/verify-nba-activation.ts fetches the feed, tests/nbaActivation.test.ts feeds it recorded and synthetic documents.
//
// It never promotes anything. The seven families stay 'APPROVED_PENDING_LIVE_INPUTS' (engine 'legacy') until a person changes
// projectionApprovals.ts after the repository's own activation check (nba-edge-finder research/projection_foundation/nba/live/
// activation_check.py) reads READY on the live archive AND this verification agrees on the published feed.
import { engineFor } from './projectionApprovals';
import { makeAuthority, type Resolution } from './projectionAuthority';
import { MAX_AGE_H, teamKey, type ProjectionDoc } from './projections';

/** The budget a game offers (240 + expected overtime) and the tolerance a conserving engine must meet; the joint rotation model makes the sum exact. */
export const MINUTES_BUDGET = 241.5;
export const MINUTES_TOLERANCE = 0.03;
export const NBA_FAMILIES = ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga'] as const;
/** INFO: reported, never required (a property of the established engine that its own approval already covers). */
export type CheckStatus = 'PASS' | 'FAIL' | 'PENDING' | 'INFO';
export interface NbaCheck { id: string; title: string; status: CheckStatus; detail: string }

const bucket = (r: Resolution): string => (r.kind === 'withheld' ? `withheld:${r.code}` : r.kind === 'fallback' ? `fallback:${r.trigger}` : r.kind === 'authoritative' ? `authoritative:${r.value.reliability}` : 'legacy');

export function verifyNbaFeed(doc: ProjectionDoc | null, nowMs: number): { checks: NbaCheck[]; ready: boolean; tally: Record<string, Record<string, number>> } {
  const checks: NbaCheck[] = [];
  const add = (id: string, title: string, status: CheckStatus, detail: string) => checks.push({ id, title, status, detail });
  // S1 the hold: with the approvals as they stand, none of the seven families resolves to the new engine
  const held = makeAuthority('NBA', doc, nowMs);
  const heldKinds = new Set(NBA_FAMILIES.map((f) => engineFor('NBA', f, [])));
  const leaks = NBA_FAMILIES.filter((f) => doc?.players.some((p) => p.family === f && held.resolve({ stat: f, playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent, gameId: p.gameId }).kind !== 'legacy'));
  add('S1', 'The hold is intact: today every NBA family still resolves to the established engine', heldKinds.size === 1 && heldKinds.has('legacy') && !leaks.length ? 'PASS' : 'FAIL',
    `engines ${[...heldKinds].join(',')}; families resolving otherwise: ${leaks.join(',') || 'none'}`);
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
  // the preview: what a reader would see if the seven families were promoted
  const preview = makeAuthority('NBA', doc, nowMs, [], { previewPending: true });
  const tally: Record<string, Record<string, number>> = {};
  const bad: Record<string, string[]> = { out: [], uncertain: [], blocked: [], eligible: [], identity: [] };
  const seen = new Set<string>();
  for (const p of doc.players) {
    if (!(NBA_FAMILIES as readonly string[]).includes(p.family)) continue;
    const r = preview.resolve({ stat: p.family, playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent, gameId: p.gameId });
    const b = bucket(r);
    (tally[p.family] ??= {})[b] = ((tally[p.family] ?? {})[b] ?? 0) + 1;
    const st = p.participation?.status ?? 'UNVERIFIED';
    const label = `${p.name} ${p.family}`;
    if (st === 'CONFIRMED_OUT' || st === 'LIKELY_OUT') { if (r.kind !== 'withheld') bad.out.push(label); }      // withheld by the BLOCK or by the OUT check, whichever fires first
    else if (p.gate.status === 'BLOCK') { if (r.kind !== 'withheld') bad.blocked.push(label); }
    else if (st === 'UNCERTAIN' || st === 'UNVERIFIED') { if (!(r.kind === 'authoritative' && r.value.reliability === 'LOW') && !(r.kind === 'withheld' && ['STALE', 'INCOHERENT'].includes(r.code))) bad.uncertain.push(label); }
    else if (st === 'LIKELY_ACTIVE' || st === 'CONFIRMED_ACTIVE') { if (!(r.kind === 'authoritative' || (r.kind === 'withheld' && ['STALE', 'INCOHERENT'].includes(r.code)))) bad.eligible.push(label); }
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
  // S10 structural minutes integrity: the team's minutes must add up by construction (sum of p(play) x E[minutes | play] = 241.5) with no normalisation
  // applied. Required when the feed declares the joint rotation model; reported for the established engine, whose team normalisation is covered by its own
  // D5 policy (nba-edge-finder activation_check) and not required here.
  const sums = new Map<string, number>();
  const normalised = new Map<string, number>();
  for (const p of rows) {
    if (p.family !== 'minutes' || p.participation?.pPlay == null) continue;
    const k = `${p.gameId}|${p.team}`;
    sums.set(k, (sums.get(k) ?? 0) + p.participation.pPlay * p.mean);
    const m = p.adjustments.map((a) => /Team reconciliation:.*expected minutes [\d.]+ vs [\d.]+ available: scaled x(\d+(?:\.\d+)?)/.exec(a)).find(Boolean);
    if (m) normalised.set(k, Number(m[1]));
  }
  const off = [...sums].filter(([, v]) => Math.abs(v / MINUTES_BUDGET - 1) > MINUTES_TOLERANCE).map(([k, v]) => `${k.split('|')[1]} ${v / MINUTES_BUDGET - 1 >= 0 ? '+' : ''}${Math.round((v / MINUTES_BUDGET - 1) * 1000) / 10}%`);
  const scales = [...normalised.values()];
  const title = 'Team minutes are structurally coherent: sum of p x E[min | play] = 241.5 per team-game with no minutes normalisation';
  if (doc.minutesEngine) {
    if (!sums.size) add('S10', title, 'PENDING', 'no minutes rows with a published P(play)');
    else add('S10', title, off.length || normalised.size ? 'FAIL' : 'PASS',
      off.length || normalised.size ? `${off.length} team(s) off the budget (${list(off)}); ${normalised.size} team(s) normalised` : `all ${sums.size} team-games within ±${MINUTES_TOLERANCE * 100}% and none normalised (engine ${doc.minutesEngine})`);
  } else {
    add('S10', title, 'INFO', `established engine: ${normalised.size} of ${sums.size || '?'} team-games normalised${scales.length ? ` (x${Math.min(...scales)}-x${Math.max(...scales)})` : ''}; covered by its D5 policy, not required here`);
  }
  const ready = checks.every((c) => c.status === 'PASS' || c.status === 'INFO');
  return { checks, ready, tally };
}
