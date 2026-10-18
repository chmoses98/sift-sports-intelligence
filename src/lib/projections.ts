// Projection Foundation contract (`sift.projections.v1`), published by each sport repo's projection-foundation workflow
// to its `projection-data` branch (see research/projection_foundation/CONTRACT.md).
//
// What this module guarantees for every page that shows a projection (Home, Games, Game Command Center, Player Snapshot,
// Player Prop Explorer, Research Lab):
//   * one decoder and one lookup, so two pages can never show different numbers for the same player-stat;
//   * a projection the engine's quality gate BLOCKed, or that fails SIFT's own coherence re-check, is never shown as a number;
//   * which engine's number SIFT shows for a stat is decided in projectionApprovals.ts and resolved in projectionAuthority.ts.
//     This module is only the decoder and the shared lookups: it never decides what is displayed;
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

/** Hours after which a projection is shown as stale (matches pf_core.gate.MAX_STALENESS_H). */
export const MAX_AGE_H: Record<ProjSport, number> = { NFL: 192, CFB: 192, NBA: 48, MLB: 36, NHL: 48 };

/** App stat keys that differ from the engine's family names. */
const FAMILY_ALIAS: Record<string, string> = {
  pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threes', threes_made: 'threes', three_pointers: 'threes',
  strikeouts: 'pitcher_strikeouts', ks: 'pitcher_strikeouts', sog: 'shots', shots_on_goal: 'shots',
  pass_yards: 'passing_yards', rush_yards: 'rushing_yards', rec_yards: 'receiving_yards', pass_attempts: 'passing_attempts',
  attempts: 'passing_attempts', pitcher_outs: 'outs', outs_recorded: 'outs', pass_tds: 'passing_tds', passing_touchdowns: 'passing_tds', touchdowns: 'anytime_td',
};
export const familyOf = (stat: string): string => FAMILY_ALIAS[stat.toLowerCase()] ?? stat.toLowerCase();

/** Team codes the sources spell differently, folded to one key so a name+team join cannot miss on spelling alone. */
const TEAM_ALIAS: Record<string, string> = {
  ARI: 'AZ', OAK: 'ATH', CHW: 'CWS', WAS: 'WSH', WSN: 'WSH', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', JAC: 'JAX', LAR: 'LA',
};
export const teamKey = (t: string): string => { const u = (t ?? '').toUpperCase(); return TEAM_ALIAS[u] ?? u; };

export interface GateFinding { check: string; severity: GateStatus; what: string; category: string; action: string }
export interface PlayerProjection {
  playerId: string; name: string; team: string; opponent: string; gameId: string; family: string;
  mean: number; median: number | null; p10: number | null; p90: number | null;
  /** p05/p25/p50/p75/p95 from the same distribution, when the feed publishes them (additive, CONTRACT 3.1b) */
  quantiles: { p05: number; p25: number; p50: number; p75: number; p95: number } | null;
  thresholds: { k: number; p: number }[];
  opportunity: { family: string; mean: number; p10: number | null; p90: number | null } | null;
  opponentAdjustment: { factor: number; sampleGames: number | null } | null;
  adjustments: string[];
  readiness: Readiness;
  gate: { status: GateStatus; findings: GateFinding[] };
  dataAsOf: string | null;
  /** point-in-time availability call behind the projection (null when the feed predates pf_core 1.2.0) */
  participation: { status: Participation; certainty: string; source: string; capturedUtc: string | null; reasons: string[] } | null;
  /** engine-published player segments (NFL: first four games with a new team, backup tier, rookie); null when not published */
  segments: { newTeamFirst4: boolean; backup: boolean; rookie: boolean; tier: string } | null;
  /** the engine's own label; SIFT’s approvals, not this field, decide what is displayed */
  role: 'shadow' | 'production';
}
export type Participation = 'CONFIRMED_ACTIVE' | 'LIKELY_ACTIVE' | 'UNCERTAIN' | 'LIKELY_OUT' | 'CONFIRMED_OUT' | 'UNVERIFIED';
const PARTICIPATION: Participation[] = ['CONFIRMED_ACTIVE', 'LIKELY_ACTIVE', 'UNCERTAIN', 'LIKELY_OUT', 'CONFIRMED_OUT', 'UNVERIFIED'];
/** `teamId`/`homeId`/`awayId`: the source's own team ids (CFB publishes ESPN ids and team NAMES, not SIFT's contract codes), null when not published */
export interface TeamProjection { gameId: string; team: string; teamId: string | null; family: string; mean: number; p10: number | null; p90: number | null; startUtc: string | null; home: string; away: string; homeId: string | null; awayId: string | null }
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

function decodeQuantiles(x: unknown): PlayerProjection['quantiles'] {
  if (!isObj(x)) return null;
  const v = ['p05', 'p25', 'p50', 'p75', 'p95'].map((k) => num(x[k]));
  if (v.some((n) => n == null)) return null;
  const [p05, p25, p50, p75, p95] = v as number[];
  // a malformed (unordered) set is ignored rather than drawn
  return p05 <= p25 && p25 <= p50 && p50 <= p75 && p75 <= p95 ? { p05, p25, p50, p75, p95 } : null;
}

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
    const pa = isObj(p.participation) ? p.participation : null;
    const opp = isObj(p.opportunity) ? p.opportunity : null;
    const oa = isObj(p.opponent_adjustment) ? p.opponent_adjustment : null;
    players.push({
      playerId: str(p.player_id), name: str(p.name), team: str(p.team), opponent: str(p.opponent), gameId: str(p.game_id),
      family: str(p.family), mean, median: num(p.median), p10: num(p.p10), p90: num(p.p90), quantiles: decodeQuantiles(p.quantiles),
      thresholds: isObj(p.thresholds) ? Object.entries(p.thresholds).map(([k, v]) => ({ k: Number(k), p: num(v) ?? NaN })).filter((t) => Number.isFinite(t.k)).sort((a, b) => a.k - b.k) : [],
      opportunity: opp && num(opp.mean) != null ? { family: str(opp.family), mean: num(opp.mean)!, p10: num(opp.p10), p90: num(opp.p90) } : null,
      opponentAdjustment: oa && num(oa.factor) != null ? { factor: num(oa.factor)!, sampleGames: num(oa.sample_games) } : null,
      adjustments: Array.isArray(p.adjustments) ? p.adjustments.map(str).filter(Boolean) : [],
      readiness: asReadiness(p.readiness ?? families[str(p.family)]?.readiness),
      gate: { status: asGate(g.status), findings: (Array.isArray(g.findings) ? g.findings : []).filter(isObj).map((f) => ({ check: str(f.check), severity: asGate(f.severity), what: str(f.what), category: str(f.category), action: str(f.action) })) },
      dataAsOf: str(p.data_asof_utc) || str(raw.data_asof_utc) || null,
      participation: pa ? {
        status: PARTICIPATION.includes(pa.status as Participation) ? (pa.status as Participation) : 'UNVERIFIED',
        certainty: str(pa.certainty), source: str(pa.source), capturedUtc: str(pa.captured_utc) || null,
        reasons: Array.isArray(pa.reasons) ? pa.reasons.map(str).filter(Boolean) : [],
      } : null,
      segments: isObj(p.segments) ? { newTeamFirst4: p.segments.new_team_first4 === true, backup: p.segments.backup === true, rookie: p.segments.rookie === true, tier: str(p.segments.tier) } : null,
      role: p.role === 'production' ? 'production' : 'shadow',
    });
  }
  const teams: TeamProjection[] = [];
  for (const gm of Array.isArray(raw.games) ? raw.games : []) {
    if (!isObj(gm)) continue;
    for (const t of Array.isArray(gm.teams) ? gm.teams : []) {
      if (isObj(t) && num(t.mean) != null) teams.push({ gameId: str(gm.game_id), team: str(t.team), teamId: str(t.team_id) || null, family: str(t.family), mean: num(t.mean)!, p10: num(t.p10), p90: num(t.p90), startUtc: str(gm.start_utc) || null, home: str(gm.home), away: str(gm.away), homeId: str(gm.home_id) || null, awayId: str(gm.away_id) || null });
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

export function findProjection(doc: ProjectionDoc | null, q: { playerId?: string | null; name?: string | null; team?: string | null; stat: string; gameId?: string | null; opponent?: string | null }): PlayerProjection | null {
  if (!doc) return null;
  const fam = familyOf(q.stat);
  // a player listed for two games in the window is matched to the right one by opponent; if it still cannot be told, no match
  const cands = doc.players.filter((p) => p.family === fam && (!q.gameId || !p.gameId || p.gameId === q.gameId) && (!q.opponent || !p.opponent || teamKey(p.opponent) === teamKey(q.opponent)));
  if (q.playerId) { const ids = cands.filter((p) => p.playerId === q.playerId); if (ids.length === 1) return ids[0]; if (ids.length > 1) return null; }
  // name join only with a team match (19 active NFL players share a normalised name with another)
  if (q.name && q.team) {
    const nk = nameKey(q.name);
    const hits = cands.filter((p) => nameKey(p.name) === nk && teamKey(p.team) === teamKey(q.team!));
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
  if (p.participation?.status === 'CONFIRMED_OUT') return { kind: 'withheld', reason: 'confirmed out before the game' };
  const probs = coherenceProblems(p);
  if (probs.length) return { kind: 'withheld', reason: probs[0] };
  const asOf = p.dataAsOf ? Date.parse(p.dataAsOf) : NaN;
  const ageHours = Number.isFinite(asOf) ? (nowMs - asOf) / 3.6e6 : null;
  const stale = ageHours == null || ageHours > MAX_AGE_H[doc.sport];
  return { kind: 'shown', p, stale, ageHours, review: p.gate.findings.filter((f) => f.severity === 'REVIEW'), info: doc.families[p.family] ?? null };
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

// ---------------------------------------------------------------------------------------------------------------------
// Words and lookups shared by every surface (one wording, one lookup: no page can contradict another).

export const PARTICIPATION_WORDS: Record<Participation, string> = {
  CONFIRMED_ACTIVE: 'Confirmed to play',
  LIKELY_ACTIVE: 'Expected to play (not yet confirmed)',
  UNCERTAIN: 'Participation uncertain — projection assumes he plays',
  LIKELY_OUT: 'Likely out — projection only applies if he plays',
  CONFIRMED_OUT: 'Confirmed out',
  UNVERIFIED: 'Availability not verified — projection assumes he plays',
};

/** Exact capture/update time in the viewer's zone, e.g. "Oct 20, 5:42 PM". */
export function fmtWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The independent team projections for one game, matched by both team codes (and the start date when the feed gives
 * one). Null unless exactly one game matches, so a mis-join never shows another game's numbers.
 */
export function findTeamProjections(doc: ProjectionDoc | null, q: { home: string; away: string; startUtc?: string | null; homeId?: string | null; awayId?: string | null }): TeamProjection[] | null {
  if (!doc) return null;
  const H = teamKey(q.home), A = teamKey(q.away);
  const byGame = new Map<string, TeamProjection[]>();
  for (const t of doc.teams) byGame.set(t.gameId, [...(byGame.get(t.gameId) ?? []), t]);
  const hits = [...byGame.values()].filter((ts) => {
    // the source's team ids decide when both sides have them (CFB publishes names and ESPN ids, not SIFT's codes); codes otherwise
    const ids = new Set(ts.map((t) => t.teamId).filter((x): x is string => !!x));
    if (q.homeId && q.awayId && ids.size >= 2) { if (!ids.has(q.homeId) || !ids.has(q.awayId)) return false; }
    else {
      const codes = new Set(ts.map((t) => teamKey(t.team)));
      if (!codes.has(H) || !codes.has(A)) return false;
    }
    const s = ts[0].startUtc, w = q.startUtc;
    return !s || !w || Math.abs(Date.parse(s) - Date.parse(w)) < 18 * 3.6e6;
  });
  return hits.length === 1 ? hits[0] : null;
}

// Live (prospective) scorecard: settled pregame forecasts scored against final results. `sift.prospective_scorecard.v1`.
export const SCORECARD_SCHEMA = 'sift.prospective_scorecard.v1';
export const scorecardUrl = (sport: ProjSport, view: 'season' | 'weekly' | 'daily' = 'season'): string =>
  env[`VITE_SIFT_PF_SCORECARD_${sport}_URL`] ??
  `https://raw.githubusercontent.com/chmoses98/${REPO[sport]}/projection-data/scorecards/${sport.toLowerCase()}/${view}.json`;

export interface LiveFamily {
  family: string; n: number; games: number; mae: number; bias: number; cover80: number | null;
  vsIncumbent: { diff: number; lo: number; hi: number; n: number } | null;
  status: 'OK' | 'WATCH' | 'ALERT' | 'INSUFFICIENT'; note: string;
}
export interface LiveScorecard { sport: ProjSport; generatedAt: string; archived: number; settled: number; families: LiveFamily[] }

export function decodeScorecard(raw: unknown): LiveScorecard | null {
  if (!isObj(raw) || raw.schema !== SCORECARD_SCHEMA || raw.authority !== 'research_only') return null;
  const sport = str(raw.sport).toUpperCase() as ProjSport;
  if (!(sport in REPO) || !Array.isArray(raw.families)) return null;
  const alerts = new Map<string, { status: string; what: string }>();
  for (const a of Array.isArray(raw.alerts) ? raw.alerts : []) if (isObj(a)) alerts.set(str(a.family), { status: str(a.status), what: str(a.what) });
  const fams: LiveFamily[] = [];
  for (const f of raw.families) {
    if (!isObj(f) || !Array.isArray(f.models)) continue;
    const m = f.models.find((x) => isObj(x) && x.model_role === 'challenger') as Record<string, unknown> | undefined;
    if (!m || num(m.n) == null || num(m.mae) == null) continue;
    const pc = isObj(f.paired) && isObj(f.paired.crps_diff) ? f.paired.crps_diff : isObj(f.paired) && isObj(f.paired.mae_diff) ? f.paired.mae_diff : null;
    const ci = pc && Array.isArray(pc.ci95) ? pc.ci95 : null;
    const al = alerts.get(str(f.family));
    const st = al?.status;
    fams.push({
      family: str(f.family), n: num(m.n)!, games: num(m.n_games) ?? 0, mae: num(m.mae)!, bias: num(m.bias) ?? 0, cover80: num(m.cover_80),
      vsIncumbent: pc && ci && num(pc.mean_diff) != null ? { diff: num(pc.mean_diff)!, lo: num(ci[0]) ?? NaN, hi: num(ci[1]) ?? NaN, n: num(pc.n_obs) ?? 0 } : null,
      status: st === 'OK' || st === 'WATCH' || st === 'ALERT' || st === 'INSUFFICIENT' ? st : 'INSUFFICIENT', note: al?.what ?? '',
    });
  }
  const cap = isObj(raw.capture) ? raw.capture : {};
  const set = isObj(raw.settlement) ? raw.settlement : {};
  return { sport, generatedAt: str(raw.generated_utc), archived: num(cap.forecasts_archived) ?? 0, settled: num(set.settled) ?? 0, families: fams };
}
