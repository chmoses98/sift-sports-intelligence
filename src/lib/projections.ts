// Projection Foundation contract (`sift.projections.v1`), published by each sport repo's projection-foundation workflow
// to its `projection-data` branch (see research/projection_foundation/CONTRACT.md).
//
// What this module guarantees for every page that shows a projection (Home, Game Command Center, Player Prop Explorer,
// Research Lab):
//   * one decoder and one lookup, so two pages can never show different numbers for the same player-stat;
//   * a projection the engine's quality gate BLOCKed, or that fails SIFT's own coherence re-check, is never shown as a number;
//   * the engine's independent projection only becomes the headline number for a family the owner has explicitly promoted
//     (PROMOTED_FAMILIES, empty by default). Until then it is shown as a shadow challenger beside the incumbent;
//   * projection confidence is never worded as betting value.
import { nameKey } from '../history/boxLog';

export const PROJECTIONS_SCHEMA = 'sift.projections.v1';
export type ProjSport = 'NFL' | 'CFB' | 'NBA' | 'MLB' | 'NHL';
export type Readiness = 'READY' | 'SHADOW VALIDATION' | 'NEEDS IMPROVEMENT' | 'INSUFFICIENT DATA';
export type GateStatus = 'PASS' | 'REVIEW' | 'BLOCK';

const REPO: Record<ProjSport, string> = {
  NFL: 'nfl-edge-finder', CFB: 'cfb-edge-finder', NBA: 'nba-edge-finder', MLB: 'edge-finder-api', NHL: 'NHL-edge-finder',
};
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const projectionsUrl = (sport: ProjSport): string =>
  env[`VITE_SIFT_PROJECTIONS_${sport}_URL`] ??
  `https://raw.githubusercontent.com/chmoses98/${REPO[sport]}/projection-data/projections/${sport.toLowerCase()}/latest.json`;

/**
 * Families the owner has approved to replace the incumbent's headline number. Promotion is a human decision recorded
 * here in code review — never automatic, whatever the published readiness says.
 */
export const PROMOTED_FAMILIES: ReadonlySet<string> = new Set<string>([]);

/** Hours after which a projection is shown as stale (matches pf_core.gate.MAX_STALENESS_H). */
export const MAX_AGE_H: Record<ProjSport, number> = { NFL: 192, CFB: 192, NBA: 48, MLB: 36, NHL: 48 };

/** App stat keys that differ from the engine's family names. */
const FAMILY_ALIAS: Record<string, string> = {
  pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threes', threes_made: 'threes', three_pointers: 'threes',
  strikeouts: 'pitcher_strikeouts', ks: 'pitcher_strikeouts', sog: 'shots', shots_on_goal: 'shots',
  pass_yards: 'passing_yards', rush_yards: 'rushing_yards', rec_yards: 'receiving_yards', pass_attempts: 'passing_attempts',
  attempts: 'passing_attempts', pass_tds: 'passing_tds', passing_touchdowns: 'passing_tds', touchdowns: 'anytime_td',
};
export const familyOf = (stat: string): string => FAMILY_ALIAS[stat.toLowerCase()] ?? stat.toLowerCase();

export interface GateFinding { check: string; severity: GateStatus; what: string; category: string; action: string }
export interface PlayerProjection {
  playerId: string; name: string; team: string; opponent: string; gameId: string; family: string;
  mean: number; median: number | null; p10: number | null; p90: number | null;
  thresholds: { k: number; p: number }[];
  opportunity: { family: string; mean: number; p10: number | null; p90: number | null } | null;
  opponentAdjustment: { factor: number; sampleGames: number | null } | null;
  adjustments: string[];
  readiness: Readiness;
  gate: { status: GateStatus; findings: GateFinding[] };
  dataAsOf: string | null;
}
export interface TeamProjection { gameId: string; team: string; family: string; mean: number; p10: number | null; p90: number | null }
export interface FamilyInfo { readiness: Readiness; model: string; reason: string }
export interface ProjectionDoc {
  sport: ProjSport; generatedAt: string; dataAsOf: string | null; modelVersion: string;
  families: Record<string, FamilyInfo>; players: PlayerProjection[]; teams: TeamProjection[];
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x));
const READINESS: Readiness[] = ['READY', 'SHADOW VALIDATION', 'NEEDS IMPROVEMENT', 'INSUFFICIENT DATA'];
const asReadiness = (x: unknown): Readiness => (READINESS.includes(x as Readiness) ? (x as Readiness) : 'INSUFFICIENT DATA');
const asGate = (x: unknown): GateStatus => (x === 'PASS' || x === 'REVIEW' || x === 'BLOCK' ? x : 'REVIEW');

/** Strict decode; anything unrecognised is null, which every consumer treats as "no projection published". */
export function decodeProjections(raw: unknown): ProjectionDoc | null {
  if (!isObj(raw) || raw.schema !== PROJECTIONS_SCHEMA) return null;
  const sport = str(raw.sport).toUpperCase() as ProjSport;
  if (!(sport in REPO)) return null;
  const model = isObj(raw.model) ? raw.model : {};
  // projections are research context; a document claiming any other authority is rejected outright
  if (model.authority !== 'research_only') return null;
  const families: Record<string, FamilyInfo> = {};
  if (isObj(raw.families)) for (const [k, v] of Object.entries(raw.families)) {
    if (isObj(v)) families[k] = { readiness: asReadiness(v.readiness), model: str(v.model), reason: str(v.reason) };
  }
  const players: PlayerProjection[] = [];
  for (const p of Array.isArray(raw.players) ? raw.players : []) {
    if (!isObj(p)) continue;
    const mean = num(p.mean);
    if (mean == null || !p.family || !p.player_id) continue;
    const g = isObj(p.gate) ? p.gate : {};
    const opp = isObj(p.opportunity) ? p.opportunity : null;
    const oa = isObj(p.opponent_adjustment) ? p.opponent_adjustment : null;
    players.push({
      playerId: str(p.player_id), name: str(p.name), team: str(p.team), opponent: str(p.opponent), gameId: str(p.game_id),
      family: str(p.family), mean, median: num(p.median), p10: num(p.p10), p90: num(p.p90),
      thresholds: isObj(p.thresholds) ? Object.entries(p.thresholds).map(([k, v]) => ({ k: Number(k), p: num(v) ?? NaN })).filter((t) => Number.isFinite(t.k)).sort((a, b) => a.k - b.k) : [],
      opportunity: opp && num(opp.mean) != null ? { family: str(opp.family), mean: num(opp.mean)!, p10: num(opp.p10), p90: num(opp.p90) } : null,
      opponentAdjustment: oa && num(oa.factor) != null ? { factor: num(oa.factor)!, sampleGames: num(oa.sample_games) } : null,
      adjustments: Array.isArray(p.adjustments) ? p.adjustments.map(str).filter(Boolean) : [],
      readiness: asReadiness(p.readiness ?? families[str(p.family)]?.readiness),
      gate: { status: asGate(g.status), findings: (Array.isArray(g.findings) ? g.findings : []).filter(isObj).map((f) => ({ check: str(f.check), severity: asGate(f.severity), what: str(f.what), category: str(f.category), action: str(f.action) })) },
      dataAsOf: str(p.data_asof_utc) || str(raw.data_asof_utc) || null,
    });
  }
  const teams: TeamProjection[] = [];
  for (const gm of Array.isArray(raw.games) ? raw.games : []) {
    if (!isObj(gm)) continue;
    for (const t of Array.isArray(gm.teams) ? gm.teams : []) {
      if (isObj(t) && num(t.mean) != null) teams.push({ gameId: str(gm.game_id), team: str(t.team), family: str(t.family), mean: num(t.mean)!, p10: num(t.p10), p90: num(t.p90) });
    }
  }
  return { sport, generatedAt: str(raw.generated_utc), dataAsOf: str(raw.data_asof_utc) || null, modelVersion: str(model.version), families, players, teams };
}

/**
 * SIFT's own defensive re-check of a published projection (the engine's gate runs first; this catches a broken or
 * tampered document). Returns the reasons the number must not be shown; empty = displayable.
 */
export function coherenceProblems(p: PlayerProjection): string[] {
  const out: string[] = [];
  if (!Number.isFinite(p.mean)) out.push('mean is not a number');
  if (p.p10 != null && p.p90 != null && p.p10 > p.p90) out.push('range is inverted');
  // >=90% of the mass sits at or above p10, so the mean cannot sit far below it (skewed stats can sit above p90: HR, TDs)
  if (p.p10 != null && p.mean < p.p10 - Math.max(1, 0.15 * Math.abs(p.p10))) out.push('mean below its own 10th percentile');
  for (let i = 0; i < p.thresholds.length; i++) {
    const t = p.thresholds[i];
    if (!(t.p >= 0 && t.p <= 1)) { out.push('a threshold probability is outside 0–1'); break; }
    if (i > 0 && t.p > p.thresholds[i - 1].p + 1e-9) { out.push('alternate thresholds are not coherent (a higher line is more likely)'); break; }
  }
  return out;
}

export type DisplayState =
  | { kind: 'none' }
  | { kind: 'withheld'; reason: string }
  | { kind: 'shown'; p: PlayerProjection; stale: boolean; ageHours: number | null; review: GateFinding[]; info: FamilyInfo | null };

export function findProjection(doc: ProjectionDoc | null, q: { playerId?: string | null; name?: string | null; team?: string | null; stat: string; gameId?: string | null }): PlayerProjection | null {
  if (!doc) return null;
  const fam = familyOf(q.stat);
  const cands = doc.players.filter((p) => p.family === fam && (!q.gameId || !p.gameId || p.gameId === q.gameId));
  if (q.playerId) { const byId = cands.find((p) => p.playerId === q.playerId); if (byId) return byId; }
  // name join only with a team match (19 active NFL players share a normalised name with another)
  if (q.name && q.team) {
    const nk = nameKey(q.name);
    const hits = cands.filter((p) => nameKey(p.name) === nk && p.team.toUpperCase() === q.team!.toUpperCase());
    if (hits.length === 1) return hits[0];
  }
  return null;
}

export function displayState(doc: ProjectionDoc | null, p: PlayerProjection | null, nowMs: number): DisplayState {
  if (!doc || !p) return { kind: 'none' };
  if (p.gate.status === 'BLOCK') {
    const f = p.gate.findings.find((x) => x.severity === 'BLOCK');
    return { kind: 'withheld', reason: f ? f.what : 'the quality gate blocked this projection' };
  }
  const probs = coherenceProblems(p);
  if (probs.length) return { kind: 'withheld', reason: probs[0] };
  const asOf = p.dataAsOf ? Date.parse(p.dataAsOf) : NaN;
  const ageHours = Number.isFinite(asOf) ? (nowMs - asOf) / 3.6e6 : null;
  const stale = ageHours == null || ageHours > MAX_AGE_H[doc.sport];
  return { kind: 'shown', p, stale, ageHours, review: p.gate.findings.filter((f) => f.severity === 'REVIEW'), info: doc.families[p.family] ?? null };
}

/** Whether the independent projection may be the headline number (owner-promoted family, gate not BLOCK, not stale). */
export function isPrimary(sport: ProjSport, st: DisplayState): boolean {
  return st.kind === 'shown' && !st.stale && st.p.readiness === 'READY' && PROMOTED_FAMILIES.has(`${sport}:${st.p.family}`);
}

export const READINESS_WORDS: Record<Readiness, string> = {
  READY: 'Validated on held-out seasons',
  'SHADOW VALIDATION': 'Shadow validation — beat simple baselines historically, still being checked live',
  'NEEDS IMPROVEMENT': 'Needs improvement — historical tests found material errors',
  'INSUFFICIENT DATA': 'Insufficient data to validate',
};

/** Incumbent (published simulation) vs independent challenger: a plain agreement statement, never a bet signal. */
export function agreement(incumbent: number | null, challenger: number): { tone: 'ok' | 'caution'; words: string } | null {
  if (incumbent == null || !Number.isFinite(incumbent)) return null;
  const scale = Math.max(Math.abs(incumbent), Math.abs(challenger), 1);
  const rel = Math.abs(challenger - incumbent) / scale;
  if (rel <= 0.1) return { tone: 'ok', words: 'The independent model agrees with the published projection.' };
  return { tone: 'caution', words: `The two SIFT models disagree by ${Math.round(rel * 100)}% — treat this projection as uncertain, not as an edge.` };
}

export const fmtAge = (h: number | null): string => (h == null ? 'unknown age' : h < 1 ? 'under an hour ago' : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)} days ago`);

// ---------------------------------------------------------------------------------------------------------------------
// Research summary (`sift.projection_foundation.sport_summary.v1`): per-family readiness and best validated model, for
// the Research Lab scorecard. Same strict-decode rule: unrecognised = null = the scorecard is simply not shown.
export const SUMMARY_SCHEMA = 'sift.projection_foundation.sport_summary.v1';
export const summaryUrl = (sport: ProjSport): string =>
  env[`VITE_SIFT_PF_SUMMARY_${sport}_URL`] ??
  `https://raw.githubusercontent.com/chmoses98/${REPO[sport]}/projection-data/summary/${sport.toLowerCase()}/latest.json`;

export interface FamilyScore {
  family: string; readiness: Readiness; reason: string; bestModel: string;
  holdout: { n: number | null; mae: number | null; bias: number | null; cover80: number | null; vsBaseline: number | null } | null;
}
export interface FoundationSummary { sport: ProjSport; generatedAt: string; splits: Record<string, string>; families: FamilyScore[] }

export function decodeSummary(raw: unknown): FoundationSummary | null {
  if (!isObj(raw) || raw.schema !== SUMMARY_SCHEMA) return null;
  const sport = str(raw.sport).toUpperCase() as ProjSport;
  if (!(sport in REPO) || !Array.isArray(raw.families)) return null;
  const splits: Record<string, string> = {};
  if (isObj(raw.splits)) for (const [k, v] of Object.entries(raw.splits)) splits[k] = str(v);
  const families: FamilyScore[] = raw.families.filter(isObj).map((f) => {
    const h = isObj(f.holdout) ? f.holdout : null;
    const vb = h && isObj(h.vs_baseline) ? num(h.vs_baseline.mean_diff) : null;
    return {
      family: str(f.family), readiness: asReadiness(f.readiness), reason: str(f.readiness_reason), bestModel: str(f.best_model),
      holdout: h ? { n: num(h.n_obs), mae: num(h.mae), bias: num(h.bias), cover80: num(h.cover_80), vsBaseline: vb } : null,
    };
  }).filter((f) => f.family);
  return { sport, generatedAt: str(raw.generated_utc), splits, families };
}
