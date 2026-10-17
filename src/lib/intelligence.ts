// The projection-intelligence contract (`sift.disagreement_status.v1`), published by the research engine
// (chmoses98/sift-sports-intelligence research/intelligence, run by nfl-edge-finder's disagreement-diagnosis workflow).
//
// Two things this module refuses to do: it never turns a projection-vs-market gap into a validation, and it never reads
// "nothing published" as "something validated". SIFT shows a validated opportunity only when the contract lists a
// VALIDATED_SIGNAL segment; every other state — including a missing contract — is the no-validated-opportunities state.
export const INTELLIGENCE_SCHEMA = 'sift.disagreement_status.v1';
export const INTELLIGENCE_URL: string =
  (import.meta.env?.VITE_SIFT_INTELLIGENCE_URL as string | undefined) ??
  'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/market-data/data/intelligence/nfl/latest.json';

export interface StatAccuracy { brier_model_minus_market: number; brier_se: number; mean_outcome_minus_model_prob: number; independent_units: number }
export interface IntelligenceStatus {
  generatedAt: string;
  validated: string[];
  modelError: string[];
  unresolvedCount: number;
  message: string;
  independentUnits: number | null;
  accuracy: Record<string, StatAccuracy>;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Decode strictly; anything unrecognised is null (and so the safe, nothing-validated state). */
export function decodeIntelligence(raw: unknown): IntelligenceStatus | null {
  if (!isObj(raw) || raw.schema !== INTELLIGENCE_SCHEMA || raw.authority !== 'RESEARCH_ONLY') return null;
  const bs = raw.betting_signals;
  if (!isObj(bs) || !Array.isArray(bs.validated_segments) || !Array.isArray(bs.model_error_segments)) return null;
  const counts = isObj(bs.status_counts) ? bs.status_counts : {};
  const acc = isObj(raw.projection_accuracy) && isObj(raw.projection_accuracy.by_stat) ? (raw.projection_accuracy.by_stat as Record<string, StatAccuracy>) : {};
  return {
    generatedAt: String(raw.generated_at ?? ''),
    validated: bs.validated_segments.map(String),
    modelError: bs.model_error_segments.map(String),
    unresolvedCount: Number(counts.UNRESOLVED ?? 0),
    message: typeof raw.message === 'string' ? raw.message : '',
    independentUnits: isObj(raw.sample_accounting) && typeof raw.sample_accounting.independent_player_stat_games === 'number' ? raw.sample_accounting.independent_player_stat_games : null,
    accuracy: acc,
  };
}

/** True only when the engine itself lists a validated segment. A gap size can never make this true. */
export const hasValidatedOpportunities = (s: IntelligenceStatus | null): boolean => !!s && s.validated.length > 0;

export const NO_VALIDATED_WORDS =
  'No validated opportunities. Projection gaps against the market are research context, not bets: in out-of-sample tests so far, trading a gap has not paid at the executable price after fees.';

export interface ReliabilityRead {
  /** one short line for the prop's stat */
  line: string;
  /** whether the projection runs systematically low/high on this stat */
  tone: 'ok' | 'caution';
}

/**
 * How far the published projection can be trusted for one stat, from the engine's own scorecard: the market's lead in Brier
 * terms and the model's mean error. Null when the engine has no scorecard for the stat (then nothing is claimed).
 */
export function reliabilityFor(s: IntelligenceStatus | null, stat: string): ReliabilityRead | null {
  const a = s?.accuracy[stat];
  if (!a) return null;
  const lead = a.brier_model_minus_market;
  const bias = a.mean_outcome_minus_model_prob;
  const z = a.brier_se > 0 ? lead / a.brier_se : 0;
  const behind = z >= 2 ? 'The market has been the more accurate forecast on this stat' : 'Model and market have been about equally accurate on this stat';
  const skew = Math.abs(bias) >= 0.03 ? `; the projection has run ${bias > 0 ? 'low' : 'high'} by about ${Math.round(Math.abs(bias) * 100)} points of probability` : '';
  return { line: `${behind}${skew} (${a.independent_units.toLocaleString()} player-games, research).`, tone: z >= 2 || Math.abs(bias) >= 0.03 ? 'caution' : 'ok' };
}
