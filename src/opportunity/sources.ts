// Where opportunities come from: each sport publication's OWN candidate layer, normalised into the shared shape.
//
//   recommendations.json   Soccer, Tennis, NHL, MLB, NFL — the publication's recommendations (status, authority,
//                          selection, fair probability, bet-up-to, current price, fee, worst-case edge, expiry …)
//   theses.json            Soccer — the fixture summary in words and the published opposing factors
//   cfb_research_signals   CFB — Value Watch (Moderate CONTROL while the contract's status is VALUE_WATCH) and the
//                          CONTROL side's own price
//   board.json             every sport — who plays, when, in which competition
//
// Sift adds no probability, no bet-up-to and no stake. Where a publication publishes none (tennis, MLB research
// candidates, CFB), the field is null and the card says so.
import type { BoardItem, Recommendation, Thesis } from '../contract/types';
import { quoteFreshness } from '../live/freshness';
import { routes } from '../lib/routes';
import { soccerMarketTitle } from '../lib/soccer';
import { tennisMarketTitle } from '../lib/tennis';
import { describeNhlMarket } from '../lib/marketLabel';
import { describeMlbMarket } from '../lib/mlb';
import { nbaTeam } from '../lib/nba';
import { controlPrice, isPricedHigh, isStrong, isValueWatch, type SignalsDoc } from '../lib/cfbSignals';
import { priceIntel } from './pricing';
import { eventPhase, type PhaseRead } from './lifecycle';
import { mlbOrientation, soccerOrientation, tennisOrientation, type OrientationRead } from './identity';
import { soccerScoreRule, type Outcome } from './correlation';
import { tierOf, tierWord } from './rank';
import { nhlFamilyRecord } from './record';
import type { Learning } from '../lib/nhl';
import type { Confidence, Opportunity, OpportunityStatus, RankInputs, Side, SportVerdict } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Rec = Recommendation & { edge?: number | null; confidence?: string | null; current_price?: number | null; current_probability?: number | null; market_description?: string | null; data_freshness?: string | null; extensions?: Record<string, any> | null; lineup_status?: string | null; reason_not_playable?: string | null; thesis_id?: string | null; source_ids?: Record<string, string> | null };

const DEAD = /expired|void|cancel|settled|withdrawn|closed|superseded|rejected|inactive/i;
/** Soccer model versions whose publication's own study finds the market the better forecaster (docs/RESEARCH_DISAGREEMENT.md upstream). */
const SOCCER_MARKET_BEATS_MODEL = new Set(['dc_laplace_v1']);
const HIGH_VARIANCE = new Set(['player_goals', 'first_goal', 'first_td_scorer', 'exact_score', 'first_half_exact_score', 'exact_set_score', 'anytime_td']);

export interface SportInputs {
  sport: BoardItem['participants'] extends unknown ? { code: Opportunity['sport']; slug: string; label: string } : never;
  board: BoardItem[];
  recommendations: Rec[] | null;
  theses?: Thesis[] | null;
  /** NHL: the learning scorecard (metrics.json), for each candidate's family record. */
  learning?: Learning | null;
  now: number;
}

const sideOf = (sel: string | null | undefined): Side => (String(sel ?? 'YES').toUpperCase() === 'NO' ? 'NO' : 'YES');
const isResearch = (r: Rec) => r.research_only || /RESEARCH/i.test(r.authority ?? '');
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sides(item: BoardItem) {
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  return { home, away };
}

/** "Away @ Home" for team sports with sides; "A v B" otherwise. */
export function eventLabel(item: BoardItem, code: string): string {
  const { home, away } = sides(item);
  if (home && away) {
    const name = (p: typeof home) => (code === 'NBA' ? (nbaTeam(p.short_name) ? `${nbaTeam(p.short_name)!.city} ${nbaTeam(p.short_name)!.name}` : p.display_name) : code === 'SOCCER' ? p.display_name : p.short_name ?? p.display_name);
    return code === 'SOCCER' ? `${name(home)} v ${name(away)}` : `${name(away)} @ ${name(home)}`;
  }
  return item.participants.map((p) => p.display_name).join(' v ');
}

/**
 * The publication's recommendation status as an Opportunity status, with the reason. The event's lifecycle comes
 * first: once the start time has passed (whatever the publisher's status word says), or the game is final, postponed,
 * cancelled or suspended, nothing pregame is actionable or a candidate — the research is frozen for review.
 */
function statusOf(r: Rec, phase: PhaseRead, priceState: string, orientation: OrientationRead, quoteFresh: boolean): { status: OpportunityStatus; reason: string } {
  const st = String(r.status ?? '').toUpperCase();
  const act = String(r.extensions?.action ?? st).toUpperCase();
  if (phase.phase !== 'PREGAME' && phase.phase !== 'NO_START') return { status: 'PASS', reason: phase.reason };
  if (DEAD.test(st) || st === 'PASS' || st === 'NOT_PLAYABLE') return { status: 'PASS', reason: r.reason_not_playable ?? r.extensions?.native_status ?? `The publication marked this ${st.toLowerCase().replace(/_/g, ' ')}.` };
  if (orientation.state === 'MISMATCH') return { status: 'PASS', reason: `Contract identity failed: ${orientation.reason} Sift does not feature a price and a probability that belong to different contracts.` };
  if (priceState === 'EXPIRED') return { status: 'PASS', reason: 'The publication’s validity window for this price has passed; it says to treat the price as stale and take no action.' };
  if (priceState === 'ABOVE_BET_UP_TO') return { status: 'PASS', reason: 'The ask is above the publication’s own bet-up-to price: at this price its model no longer supports the contract.' };
  if (act === 'ACTIONABLE' && !isResearch(r)) {
    if (phase.phase === 'NO_START') return { status: 'RESEARCH_CANDIDATE', reason: `${phase.reason} The publication permits a bet, but Sift cannot verify the game has not started.` };
    if (priceState === 'STALE' || priceState === 'NO_QUOTE') return { status: 'PASS', reason: 'No current executable quote for this side.' };
    if (!quoteFresh) return { status: 'PASS', reason: 'The quote is no longer fresh (over 15 minutes old): refresh before acting.' };
    return { status: 'ACTIONABLE', reason: `The publication permits a bet on this contract and the price is current and within its bet-up-to.${phase.staleStatus ? ' The listed start has passed but the publication verifies the start as still upcoming.' : ''}` };
  }
  const research = r.extensions?.research_status ?? r.extensions?.action_reasons?.[0] ?? `${r.authority}: the publication flags this for research review, not as a bet.`;
  return { status: 'RESEARCH_CANDIDATE', reason: phase.phase === 'NO_START' ? `${research} ${phase.reason}` : research };
}

interface Extra {
  verifiedUpcoming?: boolean;
  orientation?: OrientationRead;
  outcome?: Outcome;
}

function base(code: Opportunity['sport'], slug: string, item: BoardItem, r: Rec, title: string, subject: string | null, family: string | null, why: string, evidence: string[], risk: string | null, alternatives: string[], confidence: Confidence, price: Opportunity['price'], group: string | null, highVariance: boolean, now: number, x: Extra = {}): Opportunity {
  const phase = eventPhase(item, now, { verifiedUpcoming: x.verifiedUpcoming });
  const orientation = x.orientation ?? { state: 'UNVERIFIED', reason: null };
  const { status, reason } = statusOf(r, phase, price.state, orientation, quoteFreshness(price.observedAt, now) === 'FRESH');
  const worst = n(r.extensions?.worst_case_edge);
  const tier = tierOf({ status, support: confidence.support, worstCaseEdge: worst, highVariance, priceCurrent: price.state === 'CURRENT', calibration: confidence.calibration });
  return {
    id: `${code}:${r.recommendation_id}`, sport: code, slug, eventId: item.event_id, eventLabel: eventLabel(item, code), competition: item.competition, startTime: item.start_time_utc,
    marketId: r.market_id, ticker: r.source_ids?.kalshi_ticker ?? r.market_id.replace(/^mkt_kalshi_/, ''), family,
    what: { title, side: sideOf(r.selection), subject }, why, evidence, risk, alternatives, price, confidence, status, authority: r.authority, statusReason: reason, group, phase: phase.phase, orientation: orientation.state, outcome: x.outcome,
    reprice: { side: price.side, fair: price.fair, fairLow: price.fairLow, fairHigh: price.fairHigh, publishedFee: price.feeSource === 'publication' ? price.fee : null, publishedEv: price.evSource === 'publication' ? price.evPerContract : null, betUpTo: price.betUpTo, availableSize: price.availableSize, expiresAt: price.expiresAt, publishedPriceState: r.extensions?.freshness?.kalshi ?? null },
    href: routes.market(slug, r.market_id, item.event_id), gameHref: routes.game(slug, item.event_id),
    rank: { tier, tierWord: tierWord(tier, status), worstCaseEdge: worst, evPerContract: price.evPerContract, edgeShare: confidence.edgeShare, priceCurrent: price.state === 'CURRENT', highVariance, kickoff: item.start_time_utc },
  };
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const fresh = (x: Record<string, any> | null | undefined): Record<string, string> => Object.fromEntries(Object.entries(x ?? {}).map(([k, v]) => [k, String(v)]));

// ------------------------------------------------------------------ soccer

export function soccerOpportunities(x: SportInputs): Opportunity[] {
  const byEvent = new Map(x.board.map((i) => [i.event_id, i]));
  const thesis = new Map((x.theses ?? []).map((t) => [t.event_id, t]));
  const out: Opportunity[] = [];
  for (const r of x.recommendations ?? []) {
    const item = r.event_id ? byEvent.get(r.event_id) : undefined;
    if (!item) continue;
    const { home, away } = sides(item);
    const names = { home: home?.display_name ?? 'Home', away: away?.display_name ?? 'Away', homeId: home?.participant_id, awayId: away?.participant_id };
    const desc = r.market_description ?? '';
    const ticker = r.source_ids?.kalshi_ticker ?? r.market_id.replace(/^mkt_kalshi_/, '');
    const family = inferSoccerFamily(ticker, desc);
    const title = soccerMarketTitle({ kalshi_ticker: ticker, market_family: family, yes_description: desc, participant_id: /away/i.test(desc) ? names.awayId : /home/i.test(desc) ? names.homeId : null, line: n(/([\d.]+)/.exec(desc)?.[1] ? Number(/([\d.]+)/.exec(desc)![1]) : null), extensions: { period: /first.half/i.test(desc) ? 'first_half' : /second.half/i.test(desc) ? 'second_half' : 'regulation' } }, names);
    const ext = r.extensions ?? {};
    const side = sideOf(r.selection);
    // The publication states current_price, fair_probability, bet_up_to_price and the model band for the SELECTED side
    // (a NO at 29¢ with fair 47% and a 34¢ limit is exactly that); nothing is flipped here.
    const fair = r.fair_probability;
    const ask = n(r.current_price);
    const price = priceIntel({
      side, ask, observedAt: r.created_at, source: 'recommendation', fair, fairLow: n(ext.model_probability_low), fairHigh: n(ext.model_probability_high),
      publishedFee: n(ext.fee_per_contract), publishedEv: n(r.edge), betUpTo: r.bet_up_to_price, availableSize: n(ext.available_size), expiresAt: r.expires_at ?? null, publishedPriceState: ext.freshness?.kalshi ?? null, now: x.now,
    });
    const fairYes = side === 'NO' && fair != null ? 1 - fair : fair;
    const th = thesis.get(item.event_id);
    const why = th?.summary ? th.summary.replace(/; contract .*$/, '.').replace(/model xG/, 'model expected goals') : `${names.home} v ${names.away}: the publication's model prices this contract above the market after fees.`;
    const evidence = [
      fairYes != null ? `Model fair probability for ${side} ${pct(fair)} (YES ${pct(fairYes)}; ${ext.model_version ?? 'dc_laplace'}, ${ext.model_family ?? 'world_sim_v2'}); the side's price ${pct(r.current_probability)}` : null,
      ext.model_posterior_edge_share != null ? `Edge positive in ${pct(ext.model_posterior_edge_share)} of posterior draws at the research-run price of ${cents(ask)}` : null,
      ext.worst_case_edge != null ? `Worst-case edge ${(ext.worst_case_edge * 100).toFixed(1)} pts at the research-run price of ${cents(ask)}` : null,
      ext.best_expression ? 'The publication marks this the best expression of its thesis on this fixture' : null,
    ].filter((s): s is string => !!s);
    const opposing = (th?.opposing_factors ?? []).filter((s) => !/RESEARCH_ONLY/.test(s));
    const risk = opposing.length ? opposing.join('; ') : r.lineup_status === 'unknown' ? 'Lineups unknown: availability shocks are not priced.' : null;
    const label = ext.script_robustness?.[side.toLowerCase()]?.label ?? null;
    // The publication's own pre-registered study of this model against the de-vigged closing market
    // (soccer-edge-finder docs/RESEARCH_DISAGREEMENT.md, disagreement_v1, 12,248 walk-forward matches): the market is
    // reliably better in 112 of 116 subgroups and the model in none; the model's error grows with the size of the gap.
    const studied = SOCCER_MARKET_BEATS_MODEL.has(String(ext.model_version ?? ''));
    const confidence: Confidence = {
      calibration: studied ? 'MARKET_BEATS_MODEL' : 'RESEARCH',
      note: studied
        ? `RESEARCH_ONLY. The publication’s own walk-forward study of ${ext.model_version} (12,248 matches, 2019–2026) finds the de-vigged market reliably better in 112 of 116 subgroups and the model better in none; the bigger the gap, the bigger the model’s error. A gap here is a model disagreement, not an edge.`
        : 'Every soccer model family is RESEARCH_ONLY and this model version has no published comparison with the market.',
      inputs: fresh(ext.freshness), support: label ?? (ext.best_expression ? 'BEST_EXPRESSION' : null), supportNote: label ? `Script robustness ${String(label).toLowerCase()}` : ext.best_expression ? 'Best expression on this fixture' : null, edgeShare: n(ext.model_posterior_edge_share),
    };
    const orientation = soccerOrientation(ticker, desc, { home: names.home, away: names.away });
    const riskShown = studied ? `When this model and the market disagree, the market has been right: on 12,248 matches its error grew with the size of the gap.${risk ? ` ${risk}` : ''}` : risk;
    out.push(base('SOCCER', x.sport.slug, item, r, title, null, family, why, evidence, riskShown, [], confidence, price, `${item.event_id}:${r.thesis_id ?? 'thesis'}`, HIGH_VARIANCE.has(family ?? ''), x.now, { orientation, outcome: { score: soccerScoreRule(desc) } }));
  }
  return out;
}

function inferSoccerFamily(ticker: string, desc: string): string {
  const s = ticker.split('-')[0];
  if (/1HSCORE$/.test(s) || /^First-half exact score/i.test(desc)) return 'first_half_exact_score';
  if (/SCORE$/.test(s) || /^Exact score/i.test(desc)) return 'exact_score';
  if (/1HBTTS$/.test(s)) return 'first_half_btts';
  if (/BTTS$/.test(s)) return 'btts';
  if (/1HTEAMTOTAL$/.test(s)) return 'team_total';
  if (/TEAMTOTAL$/.test(s)) return 'team_total';
  if (/1HTOTAL$/.test(s)) return 'first_half_total';
  if (/TOTAL$/.test(s)) return 'total_goals';
  if (/1HSPREAD$/.test(s)) return 'first_half_handicap';
  if (/SPREAD$/.test(s)) return 'handicap';
  if (/1H$/.test(s)) return 'first_half_result';
  if (/2H$/.test(s)) return 'second_half_result';
  if (/FTTS$/.test(s)) return 'first_to_score';
  return 'match_result_3way';
}

// ------------------------------------------------------------------ tennis

export function tennisOpportunities(x: SportInputs): Opportunity[] {
  const byEvent = new Map(x.board.map((i) => [i.event_id, i]));
  const out: Opportunity[] = [];
  for (const r of x.recommendations ?? []) {
    const item = r.event_id ? byEvent.get(r.event_id) : undefined;
    if (!item) continue;
    const ext = r.extensions ?? {};
    const side = sideOf(r.selection);
    const ticker = r.source_ids?.kalshi_ticker ?? r.market_id.replace(/^mkt_kalshi_/, '');
    const family = /GTOTAL/.test(ticker) ? 'total_games' : /SETWINNER/.test(ticker) ? 'set_winner' : /SPREAD/.test(ticker) ? 'game_spread' : /EXACT/.test(ticker) ? 'exact_set_score' : 'match_winner';
    const desc = r.market_description ?? '';
    const subj = item.participants.find((p) => desc.startsWith(p.display_name)) ?? null;
    const opp = subj ? item.participants.find((p) => p.participant_id !== subj.participant_id) ?? null : null;
    const subjId = subj?.participant_id ?? null;
    const title = tennisMarketTitle({ kalshi_ticker: ticker, market_family: family, yes_description: desc, participant_id: subjId }, null);
    // current_price and fair_probability are stated for the SELECTED side; model_probability_yes is the YES view.
    const pYes = n(ext.model_probability_yes);
    const fair = r.fair_probability ?? (pYes == null ? null : side === 'NO' ? 1 - pYes : pYes);
    const ask = n(r.current_price);
    const price = priceIntel({ side, ask, observedAt: r.created_at, source: 'recommendation', fair, publishedEv: n(ext.model_side_edges?.[side]), betUpTo: null, expiresAt: null, now: x.now });
    const ext_conf = String(ext.external_confirmation_status ?? 'NO_EXTERNAL_REFERENCE');
    const why = `${eventLabel(item, 'TENNIS')}, ${item.competition ?? item.league}: the publication's projection_v2 puts ${side} on “${title}” at ${pct(fair)} against a market of ${pct(r.current_probability)}.`;
    const evidence = [
      `Model P(YES) ${pct(pYes)} (${ext.model_probability_source ?? 'projection_v2'}); gap to market ${n(ext.model_market_gap_pp) != null ? `${Math.abs(ext.model_market_gap_pp).toFixed(1)} pts` : '—'}`,
      `External sharp references: ${ext_conf.replace(/_/g, ' ').toLowerCase()}`,
      ext.identity_check_status ? `Identity ${String(ext.identity_check_status).replace(/_/g, ' ').toLowerCase()}` : null,
      ext.start_status ? `Start ${String(ext.start_status).replace(/_/g, ' ').toLowerCase()}` : null,
    ].filter((s): s is string => !!s);
    const tags = ((ext.discrepancy_reason_tags ?? []) as string[]).map((t) => t.replace(/_/g, ' ').toLowerCase());
    const risk = `On 15,117 settled rows the Kalshi mid has beaten this model (Brier 0.1776 vs 0.2193): a gap is more often the model's error than the market's.${tags.length ? ` Flags: ${tags.join(', ')}.` : ''}${ext.display_status ? ` Publication: ${String(ext.display_status).toLowerCase()}.` : ''}`;
    const confidence: Confidence = {
      calibration: 'MARKET_BEATS_MODEL', note: 'RESEARCH_ONLY; the publication reports no evidence of edge on settled rows.', inputs: { start: String(ext.start_status ?? 'unknown'), discrepancy: String(ext.discrepancy_band ?? 'unknown') },
      support: ext_conf, supportNote: ext_conf === 'AGREES_WITH_MODEL' ? 'Sharp references agree with the model' : ext_conf === 'NO_EXTERNAL_REFERENCE' ? 'No sharp reference to check against' : 'Sharp references side with the market', edgeShare: null,
    };
    const orientation = family === 'match_winner' || family === 'exact_set_score' ? tennisOrientation(ticker, subj?.display_name ?? null, opp?.display_name ?? null) : { state: 'UNVERIFIED' as const, reason: null };
    const winner = family === 'match_winner' ? (side === 'YES' ? subjId : opp?.participant_id ?? null) : family === 'exact_set_score' && side === 'YES' ? subjId : null;
    out.push(base('TENNIS', x.sport.slug, item, r, title, null, family, why, evidence, risk, [], confidence, price, `${item.event_id}:${family}`, HIGH_VARIANCE.has(family), x.now, { verifiedUpcoming: String(ext.start_status ?? '').toUpperCase() === 'VERIFIED_UPCOMING', orientation, outcome: { winner } }));
  }
  return out;
}

// ------------------------------------------------------------------ NHL

export function nhlOpportunities(x: SportInputs): Opportunity[] {
  const byEvent = new Map(x.board.map((i) => [i.event_id, i]));
  const out: Opportunity[] = [];
  for (const r of x.recommendations ?? []) {
    const item = r.event_id ? byEvent.get(r.event_id) : undefined;
    if (!item) continue;
    const ext = r.extensions ?? {};
    const side = sideOf(r.selection);
    const ticker = r.source_ids?.kalshi_ticker ?? r.market_id.replace(/^mkt_kalshi_/, '');
    const desc = (r.market_description ?? '').replace(/^(YES|NO)\s+/, '');
    const family = String(ext.family ?? 'unknown');
    const title = describeNhlMarket({ kalshi_ticker: ticker, market_family: family, yes_description: desc, period: 'FULL' })?.title ?? desc;
    const fair = r.fair_probability;
    const price = priceIntel({
      side, ask: n(r.current_price), observedAt: ext.price_observed_at_utc ?? r.created_at, source: 'recommendation', fair, publishedFee: n(ext.fee_per_contract), publishedEv: n(r.edge),
      betUpTo: r.bet_up_to_price, expiresAt: r.expires_at ?? null, now: x.now,
    });
    const thesis = String(ext.primary_thesis_key ?? '').replace(/^([A-Z]{2,3}):/, '$1 ').replace(/_/g, ' ').toLowerCase();
    const why = `${ext.team_opponent?.matchup ?? eventLabel(item, 'NHL')}: ${thesis ? `the thesis is ${thesis}` : 'the NHL joint simulation prices this contract above the market after fees'}${ext.secondary_thesis_key ? `, with ${String(ext.secondary_thesis_key).replace(/^([A-Z]{2,3}):/, '$1 ').replace(/_/g, ' ').toLowerCase()} behind it` : ''}.`;
    const evidence = [
      `Joint-simulation P(${side}) ${pct(n(ext.p_model_joint_draw) ?? fair)}; confidence-adjusted ${pct(n(ext.p_confidence_adjusted))}; Kalshi mid ${pct(n(ext.p_kalshi_mid_yes))}`,
      ext.family_reliability ? `Family reliability ${String(ext.family_reliability).replace(/_/g, ' ').toLowerCase()}` : null,
      r.lineup_status ? `Lines ${String(r.lineup_status).replace(/_/g, ' ').toLowerCase()}` : null,
    ].filter((s): s is string => !!s);
    const hv = HIGH_VARIANCE.has(family);
    const record = nhlFamilyRecord(x.learning, family);
    const risk = `${hv ? 'A goal-scorer contract settles on a single event and is high variance: the publication’s NHL home never features these.' : 'The NHL model is under prospective tracking; nothing is validated yet.'}${record?.adverse ? ' Its past candidates in this family have done worse than the model expected.' : ''}${ext.portfolio_impact?.delta_p10 != null ? ` Portfolio 10th percentile moves ${ext.portfolio_impact.delta_p10}.` : ''}`;
    const alternatives = ext.best_alternative_bet_id ? [`Best alternative expression: ${String(ext.best_alternative_bet_id).replace('|', ' · ')}`] : [];
    const confidence: Confidence = {
      calibration: 'RESEARCH', note: 'RESEARCH_ONLY under prospective tracking (the learning scorecard counts settled games).', inputs: { price: String(r.data_freshness ?? 'unknown'), lines: String(r.lineup_status ?? 'unknown') },
      support: String(ext.family_reliability ?? r.confidence ?? ''), supportNote: ext.family_reliability ? `Family reliability ${String(ext.family_reliability).replace(/_/g, ' ').toLowerCase()}` : null, edgeShare: null, record,
    };
    out.push(base('NHL', x.sport.slug, item, r, title, null, family, why, evidence, risk, alternatives, confidence, price, `${item.event_id}:${ext.primary_thesis_key ?? 'thesis'}`, hv, x.now));
  }
  return out;
}

// ------------------------------------------------------------------ MLB

export function mlbOpportunities(x: SportInputs): Opportunity[] {
  const byEvent = new Map(x.board.map((i) => [i.event_id, i]));
  const out: Opportunity[] = [];
  for (const r of x.recommendations ?? []) {
    const item = r.event_id ? byEvent.get(r.event_id) : undefined;
    if (!item) continue;
    const ext = r.extensions ?? {};
    const side = sideOf(r.selection);
    const ticker = r.source_ids?.kalshi_ticker ?? r.market_id.replace(/^mkt_kalshi_/, '');
    const { home, away } = sides(item);
    const abbrOf = (pid: string | null) => (pid === home?.participant_id ? home?.short_name ?? null : pid === away?.participant_id ? away?.short_name ?? null : null);
    const title = describeMlbMarket({ kalshi_ticker: ticker, market_family: String(ext.market_name ?? ''), yes_description: (r.market_description ?? '').replace(/\s*\(.*\)$/, ''), period: 'FULL_GAME' } as any, { abbrOf }).title;
    const price = priceIntel({ side, ask: n(r.current_price), observedAt: r.created_at, source: 'recommendation', fair: r.fair_probability, betUpTo: r.bet_up_to_price, expiresAt: r.expires_at ?? null, now: x.now });
    const why = `${eventLabel(item, 'MLB')}: the publication's slate ledger lists ${side} on “${title}” (${String(ext.market_name ?? '').replace(/_/g, ' ')}) with a bet-up-to of ${cents(r.bet_up_to_price)}.`;
    const evidence = [r.fair_probability != null ? `Fair probability ${pct(r.fair_probability)}` : 'No fair probability is published for this row', `Native status ${String(ext.native_status ?? 'unknown').toLowerCase()} · confidence ${String(r.confidence ?? 'unknown').toLowerCase()}`];
    const risk = ext.real_money_eligible === false ? 'Not real-money eligible by the publication’s own flag; the MLB model is research-only.' : null;
    const confidence: Confidence = { calibration: 'RESEARCH', note: 'RESEARCH_ONLY: the MLB slate ledger is a paper record.', inputs: { price: String(r.data_freshness ?? 'unknown') }, support: String(ext.native_status ?? ''), supportNote: null, edgeShare: null };
    const marketName = String(ext.market_name ?? '');
    const sideWord = /_Home(_|$)/.test(marketName) ? 'home' : /_Away(_|$)/.test(marketName) ? 'away' : null;
    const orientation = mlbOrientation(ticker, sideWord, { home: home?.short_name, away: away?.short_name });
    const winnerId = sideWord === 'home' ? home?.participant_id : away?.participant_id;
    const winner = /^ML_(Home|Away)$/.test(marketName) ? (side === 'YES' ? winnerId : sideWord === 'home' ? away?.participant_id : home?.participant_id) ?? null : null;
    out.push(base('MLB', x.sport.slug, item, r, title, null, String(ext.market_name ?? null), why, evidence, risk, [], confidence, price, `${item.event_id}:${ext.market_name ?? 'ml'}`, false, x.now, { orientation, outcome: { winner } }));
  }
  return out;
}

// ------------------------------------------------------------------ NFL (recommendations only; the model is research-only)

export function nflOpportunities(x: SportInputs): Opportunity[] {
  const byEvent = new Map(x.board.map((i) => [i.event_id, i]));
  const out: Opportunity[] = [];
  for (const r of x.recommendations ?? []) {
    const item = r.event_id ? byEvent.get(r.event_id) : undefined;
    if (!item) continue;
    const side = sideOf(r.selection);
    const price = priceIntel({ side, ask: n(r.current_price), observedAt: r.created_at, source: 'recommendation', fair: r.fair_probability, betUpTo: r.bet_up_to_price, expiresAt: r.expires_at ?? null, now: x.now });
    const confidence: Confidence = { calibration: isResearch(r) ? 'RESEARCH' : 'VALIDATED', note: isResearch(r) ? 'The NFL model is research-only (shown redundant to the closing market on props and behind it on game outcomes).' : 'The publication permits this bet.', inputs: { price: String(r.data_freshness ?? 'unknown') }, support: null, supportNote: null, edgeShare: null };
    out.push(base('NFL', x.sport.slug, item, r, r.market_description ?? r.market_id, null, null, `${eventLabel(item, 'NFL')}: the NFL publication recommends ${side} on this contract.`, [r.fair_probability != null ? `Fair probability ${pct(r.fair_probability)}` : 'No fair probability published'], null, [], confidence, price, `${item.event_id}`, false, x.now));
  }
  return out;
}

// ------------------------------------------------------------------ CFB (research signals)

export function cfbOpportunities(board: BoardItem[], doc: SignalsDoc | null, slug: string, now: number, live?: (ticker: string) => { yesAsk: number | null; observedAt: string | null } | null): Opportunity[] {
  if (!doc) return [];
  const out: Opportunity[] = [];
  for (const item of board) {
    const phase = eventPhase(item, now);
    if (phase.phase !== 'PREGAME') continue;
    const g = doc.byEvent.get(item.event_id);
    if (!g?.claims?.control) continue;
    const price = controlPrice(g, live && g.market?.price?.market_ticker ? live(g.market.price.market_ticker) : null);
    const value = isValueWatch(g, doc);
    const pricedHigh = isPricedHigh(g, doc, price);
    const team = g.claims.control.team;
    const ticker = g.market?.price?.market_ticker ?? null;
    const marketId = ticker ? `mkt_kalshi_${ticker}` : null;
    const strength = g.claims.control.strength;
    const sig = doc.signals.moderate_control;
    const quoteOk = price.kind === 'EXECUTABLE' && ['FRESH', 'AGING'].includes(quoteFreshness(price.observedAt, now));
    const status: OpportunityStatus = value && quoteOk ? 'WATCH' : 'PASS';
    const reason = value ? (quoteOk ? `${sig.label}: ${doc.signals.moderate_control.status_line}` : 'Value Watch needs a fresh executable price for the CONTROL side; none right now.') : isStrong(g) ? `${doc.signals.strong_control.label}: ${doc.signals.strong_control.market_summary}${pricedHigh ? ' The market already prices it.' : ''}` : 'CONTROL without a value signal.';
    const pi = priceIntel({ side: 'YES', ask: price.ask, observedAt: price.observedAt, source: price.source === 'live' ? 'live' : 'publication', fair: null, betUpTo: null, now });
    const hist = g.historical;
    const evidence = [
      g.read ?? g.card_line ?? null,
      ...g.edges.slice(0, 3),
      hist ? `Historically this CONTROL tier won ${hist.wins} of ${hist.n} (median margin ${hist.median}, central 50% ${hist.central_50[0]} to ${hist.central_50[1]})` : null,
    ].filter((s): s is string => !!s);
    const tier: RankInputs['tier'] = status === 'WATCH' ? 4 : 5;
    out.push({
      id: `CFB:${item.event_id}:${strength}`, sport: 'CFB', slug, eventId: item.event_id, eventLabel: g.title ?? eventLabel(item, 'CFB'), competition: item.competition, startTime: item.start_time_utc,
      marketId, ticker, family: 'game_winner', what: { title: `${team} to win`, side: 'YES', subject: team },
      why: g.headline ?? g.card_line ?? `${team} controls this game on the opponent-adjusted football read.`, evidence, risk: value ? doc.signals.moderate_control.small_sample ?? doc.signals.moderate_control.disclaimer ?? null : doc.signals.strong_control.explanation,
      alternatives: [], price: pi,
      confidence: { calibration: 'RESEARCH', note: value ? doc.signals.moderate_control.explanation : doc.signals.strong_control.explanation, inputs: { data_quality: String(g.data_quality ?? 'unknown'), price: price.kind }, support: `${strength}_CONTROL`, supportNote: `${strength === 'STRONG' ? 'Strong' : 'Moderate'} CONTROL${g.claims.closeness ? ' with a close-game profile' : ''}`, edgeShare: null },
      status, authority: 'RESEARCH_ONLY', statusReason: reason, group: `${item.event_id}:control`, phase: phase.phase, orientation: 'UNVERIFIED', outcome: { winner: team }, reprice: { side: 'YES', fair: null, betUpTo: null }, href: marketId ? routes.market(slug, marketId, item.event_id) : routes.game(slug, item.event_id), gameHref: routes.game(slug, item.event_id),
      rank: { tier, tierWord: tierWord(tier, status), worstCaseEdge: null, evPerContract: null, edgeShare: null, priceCurrent: quoteOk, highVariance: false, kickoff: item.start_time_utc },
    });
  }
  return out;
}

// ------------------------------------------------------------------ verdicts

/** The one-sentence reason a sport surfaces no opportunity, from what the publication itself says. */
export function passReasonFor(code: Opportunity['sport'], opps: Opportunity[], board: BoardItem[], recsRead: boolean, now: number): string | null {
  if (opps.some((o) => o.status !== 'PASS')) return null;
  // A publication that prices nothing has that as its reason whatever the clock says; the others depend on the board.
  if (code === 'NBA') return 'The NBA publication prices no contract, and its own study shows the market beating its model in 8 of 8 families.';
  if (code === 'CBB') return 'The CBB publication maps no Kalshi contract to its games yet: research only, no markets.';
  const upcoming = board.filter((i) => eventPhase(i, now).phase === 'PREGAME').length;
  if (!upcoming) return board.some((i) => eventPhase(i, now).staleStatus) ? 'Every game on the publication’s board has passed its published start; the publication has not refreshed since.' : 'No upcoming game on the publication’s board.';
  switch (code) {
    case 'NFL': return recsRead ? 'The NFL publication recommends nothing this week: its model is research-only (behind the closing market on game outcomes), so no model-vs-market gap is called an edge.' : 'The NFL recommendations file could not be read.';
    case 'CFB': return 'No Moderate CONTROL game with a fresh executable price qualifies as a Value Watch right now; Strong CONTROL reads are already priced by the market.';
    case 'NHL': return recsRead ? 'The NHL publication lists no research candidate on today’s games yet (games are simulated on their game day).' : 'The NHL recommendations file could not be read.';
    case 'MLB': return 'Every row of the MLB slate ledger is a PASS: no research candidate on the board.';
    case 'SOCCER': return 'No fixture on the board carries a research candidate at the current prices.';
    case 'TENNIS': return 'No match carries a research candidate at the current prices.';
    default: return 'Nothing qualifies.';
  }
}

export function verdict(code: Opportunity['sport'], slug: string, label: string, board: BoardItem[], opps: Opportunity[], recsRead: boolean, modelState: string | null, loaded: boolean, error: string | null, now: number, marketCaptureAt: string | null = null): SportVerdict {
  return {
    sport: code, slug, label, games: board.filter((i) => eventPhase(i, now).phase === 'PREGAME' || eventPhase(i, now).phase === 'STARTED').length, opportunities: opps.filter((o) => o.status !== 'PASS').length, passes: opps.filter((o) => o.status === 'PASS').length,
    passReason: loaded ? passReasonFor(code, opps, board, recsRead, now) : null, modelState, marketCaptureAt, loaded, error,
  };
}
