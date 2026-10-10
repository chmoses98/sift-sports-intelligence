// TENNIS on Sift: decoders over the Tennis-Edge-Finder publication (tennis-data/…/app/latest). Tennis is an
// individual sport: an event has two participants and no home/away side; "player A" is the side the publication's
// match_winner_ticker.a names. Every model number is RESEARCH_ONLY by the publication's own capability notes (the
// Kalshi mid has beaten the model on settled rows), so Sift shows the model beside the market and never as a pick.
//   event.extensions                  discipline, level, surface, round, start status, model validity, warnings
//   extensions.slate_model_context    fair_v1 / gen1 / gen2 P(A wins), uncertainty, serve evidence, data quality
//   extensions.external_venues        de-vigged sharp references per match-winner ticker, triangulation verdict
//   extensions.first_ball             verified start status (main tour + Slams only)
//   matchup[]                         Elo, surface Elo, structural serve/return ability, serve-point win
import type { EntityProfileDoc, EventResearchDoc, Market, ResearchMarket } from '../contract/types';
import { cleanDescription } from './marketLabel';

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: any): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export interface TennisPlayerRef {
  id: string;
  name: string;
  path: string | null;
  /** The match-winner contract for this player (YES = this player wins). */
  ticker: string | null;
  identity: { status: string | null; ratingId: string | null; reason: string | null };
}

export interface TennisModel {
  fairV1: number | null;
  fairV1Envelope: [number | null, number | null] | null;
  gen1: number | null;
  gen2: number | null;
  uncertainty: number | null;
  predictedAt: string | null;
  validity: Record<string, string> | null;
  validityReason: string | null;
}

export interface TennisExternal {
  ticker: string;
  side: string | null;
  externalFair: number | null;
  sources: string[];
  kalshiMid: number | null;
  kalshiAsk: number | null;
  modelFair: number | null;
  modelVsExternal: number | null;
  triangulation: string | null;
  decision: string | null;
  quoteAgeS: number | null;
  referenceKind: string | null;
}

export interface TennisMatch {
  a: TennisPlayerRef;
  b: TennisPlayerRef;
  discipline: 'singles' | 'doubles' | string;
  tour: string | null;
  level: string | null;
  levelBucket: string | null;
  competition: string | null;
  round: string | null;
  surface: string | null;
  indoor: boolean | null;
  start: { status: string | null; expected: string | null; confidence: string | null; source: string | null; firstBall: string | null; liveCovered: boolean; reasons: string[]; nominalIsPlaceholder: boolean };
  betAllowed: boolean | null;
  warnings: string[];
  dataQuality: { status: string | null; grade: string | null; score: number | null; evidence: Record<string, number | null> };
  model: TennisModel;
  serve: { aPoints: number | null; bPoints: number | null; thinner: number | null };
  form: { daysSinceA: number | null; daysSinceB: number | null; matchesA: number | null; matchesB: number | null; note: string | null };
  surfaceAdjustment: Record<string, number | null> | null;
  external: TennisExternal[];
  selector: Record<string, string | null>;
  authority: string;
  /** Matchup rows as A/B pairs (the publication's "home" column is A). */
  rows: { metricId: string; name: string; a: number | null; b: number | null; aDisplay: string | null; bDisplay: string | null; note: string | null }[];
}

export const LEVEL_WORD: Record<string, string> = {
  GRAND_SLAM: 'Grand Slam', MASTERS_1000: 'Masters 1000', WTA_1000: 'WTA 1000', ATP_500: 'ATP 500', ATP_250: 'ATP 250', WTA_500: 'WTA 500', WTA_250: 'WTA 250',
  CHALLENGER: 'Challenger', ITF: 'ITF', WTA_125: 'WTA 125', DOUBLES: 'Doubles', QUALIFYING: 'Qualifying',
};
export const START_WORD: Record<string, string> = {
  VERIFIED_UPCOMING: 'Verified upcoming', START_UNKNOWN: 'Start time unverified', STARTED: 'Under way', FINISHED: 'Finished', NOT_OBSERVED_STARTED: 'Not yet started',
};
export const TRIANGULATION_WORD: Record<string, string> = {
  MODEL_LONE_OUTLIER: 'Model is the lone outlier against the sharp references', AGREES: 'Model agrees with the sharp references', MARKET_LONE_OUTLIER: 'Kalshi is the outlier against the references and the model',
};

export function readTennis(r: EventResearchDoc): TennisMatch {
  const ev = r.event;
  const x = (ev.extensions ?? {}) as any;
  const ext = (r.extensions ?? {}) as any;
  const tick = x.match_winner_ticker ?? {};
  const byTicker = new Map(r.markets.map((m) => [m.kalshi_ticker, m]));
  const ident = (ext.identity ?? {}) as Record<string, any>;
  const ref = (pid: string | undefined, ticker: string | null): TennisPlayerRef => {
    const p = r.participants.find((q) => q.participant_id === pid) ?? r.participants[0];
    const id = ident[p?.participant_id ?? ''] ?? {};
    return { id: p?.participant_id ?? '', name: p?.display_name ?? '?', path: p?.path ?? null, ticker, identity: { status: id.status ?? null, ratingId: id.rating_id ?? null, reason: id.reason ?? null } };
  };
  const pidOf = (t: string | null) => (t ? byTicker.get(t)?.participant_id ?? undefined : undefined);
  let aId = pidOf(tick.a ?? null);
  let bId = pidOf(tick.b ?? null);
  if (!aId && !bId) {
    aId = r.participants[0]?.participant_id;
    bId = r.participants[1]?.participant_id;
  } else if (!aId) aId = r.participants.find((p) => p.participant_id !== bId)?.participant_id;
  else if (!bId) bId = r.participants.find((p) => p.participant_id !== aId)?.participant_id;
  const smc = ext.slate_model_context ?? {};
  const fb = ext.first_ball?.slate_start ?? {};
  const fbi = ext.first_ball?.first_ball ?? {};
  const dq = (r as any).event?.extensions?.data_quality_status ?? null;
  const venue = (r.context?.venue ?? {}) as any;
  const extv = (ext.external_venues ?? {}) as Record<string, any>;
  const validity = x.model_validity ?? null;
  return {
    a: ref(aId, tick.a ?? null), b: ref(bId, tick.b ?? null),
    discipline: x.discipline ?? 'singles', tour: ev.league ?? null, level: x.level ?? venue.level ?? null, levelBucket: x.level_bucket ?? null,
    competition: ev.competition ?? venue.competition ?? null, round: x.round ?? null, surface: x.surface ?? venue.surface ?? null, indoor: venue.indoor ?? null,
    start: {
      status: fb.start_status ?? x.start_status ?? null, expected: fb.current_expected_start ?? fbi.current_expected_start ?? null, confidence: fb.start_time_confidence ?? null,
      source: fb.start_time_source ?? null, firstBall: fb.first_ball_status ?? x.first_ball_status ?? null, liveCovered: Boolean(fb.live_source_covered ?? x.live_source_covered),
      reasons: ((fb.status_reasons ?? x.status_reasons ?? []) as any[]).map(String), nominalIsPlaceholder: Boolean(fb.nominal_is_placeholder ?? x.nominal_is_placeholder),
    },
    betAllowed: typeof x.bet_allowed === 'boolean' ? x.bet_allowed : null,
    warnings: ((x.warnings ?? []) as any[]).map(String),
    dataQuality: { status: dq, grade: smc.data_quality?.grade ?? null, score: n(smc.data_quality?.score), evidence: {} },
    model: {
      fairV1: n(smc.player_a_win?.fair_v1), fairV1Envelope: Array.isArray(smc.player_a_win?.fair_v1_envelope) ? [n(smc.player_a_win.fair_v1_envelope[0]), n(smc.player_a_win.fair_v1_envelope[1])] : null,
      gen1: n(smc.player_a_win?.gen1), gen2: n(smc.player_a_win?.gen2), uncertainty: n(smc.model_uncertainty),
      predictedAt: smc.model_rows_predicted_at?.shadow_board ?? smc.model_rows_predicted_at?.gen1_ledger ?? null,
      validity: validity && typeof validity === 'object' ? Object.fromEntries(Object.entries(validity).filter(([k]) => k !== 'reason').map(([k, v]) => [k, String(v)])) : null,
      validityReason: validity?.reason ?? null,
    },
    serve: { aPoints: n(smc.serve_evidence?.player_a_points), bPoints: n(smc.serve_evidence?.player_b_points), thinner: n(smc.serve_evidence?.thinner) },
    form: { daysSinceA: n(smc.recent_form_inputs?.days_since_last_match_a), daysSinceB: n(smc.recent_form_inputs?.days_since_last_match_b), matchesA: n(smc.recent_form_inputs?.matches_on_record_a), matchesB: n(smc.recent_form_inputs?.matches_on_record_b), note: smc.recent_form_inputs?.note ?? null },
    surfaceAdjustment: smc.surface_adjustment ? Object.fromEntries(Object.entries(smc.surface_adjustment).filter(([k]) => k !== 'basis').map(([k, v]) => [k, n(v)])) : null,
    external: Object.entries(extv).map(([ticker, v]) => ({
      ticker, side: v.side ?? null, externalFair: n(v.external_fair), sources: ((v.external_sources ?? []) as any[]).map(String), kalshiMid: n(v.kalshi_mid), kalshiAsk: n(v.kalshi_ask),
      modelFair: n(v.model_fair), modelVsExternal: n(v.model_vs_external), triangulation: v.triangulation ?? null, decision: v.decision ?? null, quoteAgeS: n(v.external_quote_age_s), referenceKind: v.reference_kind ?? null,
    })),
    selector: Object.fromEntries(Object.entries((smc.selector_v1 ?? {}) as Record<string, any>).map(([k, v]) => [k, v == null ? null : String(v)])),
    authority: String(ext.authority ?? 'RESEARCH_ONLY'),
    rows: r.matchup.map((m) => ({ metricId: m.metric_id, name: m.name, a: n(m.home?.value), b: n(m.away?.value), aDisplay: m.home?.display_value ?? null, bDisplay: m.away?.display_value ?? null, note: m.note })),
  };
}

/** Which player a market is about (by participant id, else by the YES wording). */
export function tennisSide(m: { participant_id?: string | null; yes_description?: string | null }, t: TennisMatch): 'a' | 'b' | null {
  if (m.participant_id === t.a.id) return 'a';
  if (m.participant_id === t.b.id) return 'b';
  const d = cleanDescription(m.yes_description ?? '');
  if (d.startsWith(t.a.name)) return 'a';
  if (d.startsWith(t.b.name)) return 'b';
  return null;
}

type MarketLike = Partial<Pick<Market, 'market_family' | 'participant_id' | 'threshold' | 'line' | 'yes_description' | 'extensions'>> & { kalshi_ticker: string };

/** Tennis markets in tennis language: "Iga Swiatek to win the match", "Elise Mertens wins set 2", "Over 20.5 games". */
export function tennisMarketTitle(m: MarketLike, t: TennisMatch | null): string {
  const d = cleanDescription(m.yes_description);
  const fam = m.market_family ?? '';
  const side = t ? tennisSide(m, t) : null;
  const who = side ? t![side].name : d;
  // SETWINNER tickers carry the set number before the player code: KXWTASETWINNER-26OCT07MERSWI-2-MER.
  const setIdx = n((m.extensions as any)?.set_index) ?? n(/SETWINNER-[^-]+-(\d)-/.exec(m.kalshi_ticker)?.[1]);
  if (fam === 'match_winner') return `${who} to win the match`;
  if (fam === 'set_winner') return `${who} wins set ${setIdx ?? ''}`.trim();
  if (fam === 'total_games') {
    const mm = /(Over|Under)\s*([\d.]+)/i.exec(d);
    return mm ? `${mm[1]} ${mm[2]} total games` : d;
  }
  if (fam === 'game_spread') {
    const line = m.line ?? m.threshold;
    return side && line != null ? `${who} ${line > 0 ? '+' : ''}${line} games` : d;
  }
  if (fam === 'exact_set_score') return side ? `${who} wins ${d.replace(/^.*?(\d)\s*[-–]\s*(\d).*$/, '$1–$2')}` : d;
  return d || m.kalshi_ticker;
}

export const TENNIS_FAMILY_LABEL: Record<string, string> = {
  match_winner: 'Match winner', set_winner: 'Set winners', game_spread: 'Game handicaps', total_games: 'Total games', exact_set_score: 'Exact set score',
};
export const TENNIS_FAMILY_ORDER = Object.keys(TENNIS_FAMILY_LABEL);
export const tennisFamilyLabel = (f: string) => TENNIS_FAMILY_LABEL[f] ?? f.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export interface TennisRating {
  elo: number | null;
  eloRank: number | null;
  eloUniverse: number | null;
  surfaceElo: { surface: string; value: number }[];
  serve: number | null;
  ret: number | null;
  servePointEvidence: number | null;
  matchesRated: number | null;
  surfaceMatches: Record<string, number>;
  ratingsAsOf: string | null;
  tour: string | null;
  discipline: string | null;
  lastMatch: string | null;
  identity: string | null;
}

/** A player's rating profile from the publication (RESEARCH_ONLY ratings; the identity status says whether a rating attaches at all). */
export function tennisRating(p: EntityProfileDoc): TennisRating {
  const met = (id: string) => p.metrics.find((o) => o.metric_id === id && !o.split);
  const elo = met('met_tennis.elo_overall');
  const ext = (p.extensions ?? {}) as any;
  const surf = (p.splits?.surface ?? []).filter((o) => o.metric_id === 'met_tennis.elo_surface' && o.value != null).map((o) => ({ surface: o.split?.value ?? '', value: Number(o.value) }));
  return {
    elo: n(elo?.value), eloRank: n(elo?.context?.rank), eloUniverse: n(elo?.context?.universe_size), surfaceElo: surf,
    serve: n(met('met_tennis.sr_serve_ability')?.value), ret: n(met('met_tennis.sr_return_ability')?.value), servePointEvidence: n(met('met_tennis.serve_point_evidence')?.value),
    matchesRated: n(ext.rating?.matches_rated), surfaceMatches: (ext.rating?.surface_matches ?? {}) as Record<string, number>, ratingsAsOf: ext.rating?.ratings_as_of ?? null,
    tour: ext.tour ?? (p.entity.metadata as any)?.tour ?? null, discipline: ext.discipline ?? null, lastMatch: (p.entity.metadata as any)?.last_match_date ?? null, identity: ext.identity?.status ?? null,
  };
}

/** Surface for a tournament from a board row's research, else null (the board itself carries none). */
export const SURFACE_WORD: Record<string, string> = { Hard: 'Hard', Clay: 'Clay', Grass: 'Grass', Carpet: 'Carpet' };

export type TennisMarketLike = ResearchMarket | Market;

/** Player A and B names from a board row (two participants, no home/away). */
export function boardPlayers(item: { participants: { participant_id: string; display_name: string }[] }): [string, string] {
  return [item.participants[0]?.display_name ?? '?', item.participants[1]?.display_name ?? '?'];
}

/** Tournament grouping key for a board row. */
export function tournamentOf(item: { competition: string | null; league: string | null }): string {
  return item.competition ?? item.league ?? 'Other';
}

/** Tour level from a tournament name when the research is not loaded ("ATP Shanghai" → main tour, "M25 Kigali" → ITF). */
export function tournamentTier(name: string): 'main' | 'challenger' | 'itf' | 'other' {
  if (/^(ATP|WTA) (?!Challenger|125)/.test(name)) return 'main';
  if (/Challenger|WTA 125/.test(name)) return 'challenger';
  if (/^[MW]\d{2}\b/.test(name)) return 'itf';
  return 'other';
}
export const TIER_WORD: Record<ReturnType<typeof tournamentTier>, string> = { main: 'Main tour', challenger: 'Challenger', itf: 'ITF', other: 'Other' };

/**
 * The tennis publication's settled model-vs-market record, read live from the metric registry
 * (`met_tennis.settled_brier_score` → extensions.scorecard.forecasters). Null when it is not published.
 */
export function tennisRecord(metrics: Map<string, { extensions?: unknown }> | null | undefined): { n: number; model: number; market: number; asOf: string | null } | null {
  const sc = (metrics?.get('met_tennis.settled_brier_score')?.extensions as any)?.scorecard;
  const m = sc?.forecasters?.model_fair;
  const k = sc?.forecasters?.market_mid_at_decision;
  if (m?.brier == null || k?.brier == null) return null;
  return { n: Number(m.n ?? k.n ?? 0), model: Number(m.brier), market: Number(k.brier), asOf: sc.generated_at ?? null };
}

/** One sentence for that record, or a plain statement that the market's record is better when the numbers are not in hand. */
export function tennisRecordText(metrics: Map<string, { extensions?: unknown }> | null | undefined): string {
  const r = tennisRecord(metrics);
  if (!r) return 'the publication’s settled record has the Kalshi mid out-scoring the model';
  const better = r.market < r.model;
  return `on ${r.n.toLocaleString('en-US')} settled rows the Kalshi mid scored a Brier of ${r.market.toFixed(4)} against the model’s ${r.model.toFixed(4)}${better ? '' : ' (the model is not behind on this sample)'}`;
}
