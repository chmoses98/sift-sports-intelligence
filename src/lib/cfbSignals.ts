// The CFB research-signals contract (cfb_research_signals/1.x), published by cfb-edge-finder's conductor beside
// the app export. It carries, per game, the V2 football read in plain words (card line, quick-read sentence, short
// edges), the claims, the historical empirical range of the CONTROL tier and the CONTROL side's own game-winner
// price; and, once for the slate, what each research signal currently means (Value Watch, Strong CONTROL, Market
// Disagreement) with the study, protocol and capture-health provenance behind it.
//
// Sift only reads it. Every word a reader sees about a signal comes from the contract; nothing here ranks games by
// return, popularity or price, and nothing turns a count into a chance. A side's price is always that side's own
// YES ask: never 1 − the other side.
import type { BoardItem } from '../contract/types';
import { cfbCodeOfEspn, cfbName } from './cfbTeams';
import { signedPoints, type Engine } from './scriptEngine';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SignalStatus = 'VALUE_WATCH' | 'REVIEW_REQUIRED' | 'EDGE_CONFIRMED' | 'NO_EDGE' | 'INSUFFICIENT_DATA' | string;
export type PriceStatus = 'EXECUTABLE' | 'PRICE_1_00' | 'QUOTE_NOT_EXECUTABLE' | 'PRICE_UNAVAILABLE' | 'MARKET_NOT_OFFERED' | 'ORIENTATION_FAILURE' | string;

export interface Prospective {
  n: number;
  priced_n?: number;
  settled_n?: number;
  wins?: number | null;
  losses?: number | null;
  fee_adjusted_roi: number | null;
  statement: string;
  checkpoint?: { next: string | null; next_at_n: number | null; reached: string | null; reached_at_n: number | null };
}

export interface ResearchBasis {
  retrospective_priced_n?: number;
  wins?: number;
  losses?: number;
  fee_adjusted_roi?: number;
  roi_ci95?: [number, number] | null;
  market_verdict?: string;
  [k: string]: unknown;
}

export interface ModerateSignal {
  status: SignalStatus;
  label: string;
  short: string;
  meaning?: string;
  status_line: string;
  explanation: string;
  game_page_explanation: string;
  disclaimer?: string;
  small_sample: string;
  research_basis?: ResearchBasis;
  prospective: Prospective;
}

export interface StrongSignal {
  status: SignalStatus;
  label: string;
  short: string;
  market_summary: string;
  priced_high: string;
  explanation: string;
  research_basis?: ResearchBasis;
  prospective: Prospective;
}

export interface DisagreementSignal {
  status: SignalStatus;
  label: string;
  short: string;
  explanation: string;
  rule: { applies_to: string; below_cents: number; price?: string; never?: string };
  research_basis?: ResearchBasis;
  prospective: Prospective;
}

export interface NoClaimSignal { label: string; short: string; explanation: string }

export interface ContractPrice {
  status: PriceStatus;
  yes_ask: number | null;
  captured_at: string | null;
  market_ticker: string | null;
  source?: string | null;
}

export interface SignalMarket {
  side: 'home' | 'away';
  team: string;
  team_code: string | null;
  participant_id: string | null;
  is_control_side: boolean;
  price: ContractPrice | null;
  disagreement: boolean | null;
}

export interface SignalHistorical {
  median: number;
  central_50: [number, number];
  central_80: [number, number];
  wins: number;
  n: number;
  development_seasons?: number[];
  validation_n?: number;
  validation_seasons?: number[];
  calibration_sha256?: string;
  not?: string;
  label?: string;
}

export interface SignalClaims {
  control: { side: 'home' | 'away'; strength: 'MODERATE' | 'STRONG'; tier: string; team: string } | null;
  closeness: boolean;
  pace: 'HIGH' | 'LOW' | null;
  scoring: { level: 'ELEVATED' | 'SUPPRESSED'; incremental?: boolean } | null;
  defensive_suppression: boolean;
  disruption: { side: 'home' | 'away'; team: string; aligned_with_control: boolean | null }[];
}

export interface SignalGame {
  event_id: string;
  game_key?: string | null;
  espn_event_id?: string | null;
  kickoff_utc: string;
  season_week: number | null;
  title: string;
  status: 'CLAIMS_PUBLISHED' | 'NO_SUPPORTED_CLAIM' | 'NOT_BUILT' | string;
  data_quality?: string | null;
  headline?: string | null;
  card_line: string | null;
  read: string | null;
  edges: string[];
  claims: SignalClaims | null;
  signal: 'VALUE_WATCH' | 'STRONG_CONTROL' | null | string;
  historical: SignalHistorical | null;
  market: SignalMarket | null;
  capture: { status: string; window_opens_at?: string | null; window_closes_at?: string | null } | null;
  claims_artifact_hash?: string | null;
}

export interface CaptureHealth {
  expected_games: number;
  game_winner_markets_found?: number;
  valid_primary_captures: number;
  pending: number;
  market_absent?: number;
  unexecutable?: number;
  price_1_00?: number;
  orientation_failures: number;
  system_failures: number;
  windows_closed: number;
  primary_window_coverage?: number | null;
}

export interface SignalsDoc {
  schema: string;
  generated_at: string;
  sport: string;
  methodology_version: string;
  research_only: boolean;
  sources?: { catalog_captured_at?: string | null; market_read?: { ok: boolean; at: string | null; error: string | null } };
  study?: { pr?: string; protocol_sha256?: string; rows_sha256?: string; overall_verdict?: string };
  protocol?: { sha256?: string; primary_window?: { name?: string; open_minutes_before: number; close_minutes_before: number } };
  capture_health: CaptureHealth | null;
  signals: {
    moderate_control: ModerateSignal;
    strong_control: StrongSignal;
    market_disagreement: DisagreementSignal;
    no_claim: NoClaimSignal;
  };
  games: SignalGame[];
  byEvent: Map<string, SignalGame>;
}

export class SignalsSchemaError extends Error {
  constructor(why: string) {
    super(`not a cfb_research_signals/1.x document: ${why}`);
    this.name = 'SignalsSchemaError';
  }
}

/**
 * The contract names teams by the football schedule ("Massachusetts"); the board's participants are shown by
 * lib/cfbTeams.ts cfbName ("UMass"). Re-name each side through its ESPN team id so one game never shows a school
 * two ways (the CONTROL line, the price token and the matchup all say the same name). An id outside the identity
 * map keeps the contract's own name.
 */
function withPublicNames(g: any): any {
  const sideName = (side: 'home' | 'away' | undefined, fallback: string): string => {
    const t = side ? g.teams?.[side] : null;
    const code = cfbCodeOfEspn(t?.team_id);
    return code ? cfbName(code, t?.name) : fallback;
  };
  const teams = g.teams && typeof g.teams === 'object'
    ? Object.fromEntries(Object.entries(g.teams).map(([k, t]: [string, any]) => [k, t && typeof t === 'object' ? { ...t, name: sideName(k as 'home' | 'away', t.name) } : t]))
    : g.teams;
  const c = g.claims;
  const claims = c && typeof c === 'object'
    ? {
        ...c,
        control: c.control ? { ...c.control, team: sideName(c.control.side, c.control.team) } : c.control,
        disruption: Array.isArray(c.disruption) ? c.disruption.map((x: any) => ({ ...x, team: sideName(x.side, x.team) })) : [],
      }
    : c;
  const market = g.market && typeof g.market === 'object' ? { ...g.market, team: sideName(g.market.side, g.market.team) } : g.market;
  return { ...g, teams, claims, market };
}

/** Accept a cfb_research_signals/1.x document, or throw: a malformed contract never renders half a signal. */
export function decodeSignals(raw: unknown): SignalsDoc {
  const d = raw as any;
  if (!d || typeof d !== 'object') throw new SignalsSchemaError('not an object');
  if (typeof d.schema !== 'string' || !/^cfb_research_signals\/1\./.test(d.schema)) throw new SignalsSchemaError(`schema ${String(d.schema)}`);
  if (!Array.isArray(d.games)) throw new SignalsSchemaError('no games');
  const s = d.signals;
  for (const k of ['moderate_control', 'strong_control', 'market_disagreement', 'no_claim']) {
    if (!s || typeof s[k] !== 'object' || s[k] == null) throw new SignalsSchemaError(`signals.${k} missing`);
  }
  if (typeof s.market_disagreement.rule?.below_cents !== 'number') throw new SignalsSchemaError('market_disagreement.rule.below_cents missing');
  const games: SignalGame[] = d.games
    .filter((g: any) => g && typeof g.event_id === 'string')
    .map((g: any) => withPublicNames({ ...g, edges: Array.isArray(g.edges) ? g.edges.filter((x: unknown) => typeof x === 'string') : [] }));
  return { ...d, capture_health: d.capture_health ?? null, games, byEvent: new Map(games.map((g) => [g.event_id, g])) };
}

// ------------------------------------------------------------------ the claims, as booleans

export const isControl = (g: SignalGame | null | undefined) => !!g?.claims?.control;
export const isModerate = (g: SignalGame | null | undefined) => g?.claims?.control?.strength === 'MODERATE';
export const isStrong = (g: SignalGame | null | undefined) => g?.claims?.control?.strength === 'STRONG';
/** The contract says Moderate CONTROL is currently a Value Watch (data-driven: it can stop being one). */
export const valueWatchActive = (doc: SignalsDoc | null | undefined) => doc?.signals.moderate_control.status === 'VALUE_WATCH';
export const isValueWatch = (g: SignalGame | null | undefined, doc: SignalsDoc | null | undefined) => isModerate(g) && valueWatchActive(doc);
export const isClose = (g: SignalGame | null | undefined) => !!g?.claims?.closeness;
export const isFast = (g: SignalGame | null | undefined) => g?.claims?.pace === 'HIGH';
export const isDefensive = (g: SignalGame | null | undefined) => !!g?.claims?.defensive_suppression || g?.claims?.scoring?.level === 'SUPPRESSED';

/** Pace, scoring environment and defensive suppression: how many environment claims the game carries. */
export function environmentCount(g: SignalGame | null | undefined): number {
  const c = g?.claims;
  if (!c) return 0;
  return (c.pace ? 1 : 0) + (c.scoring ? 1 : 0) + (c.defensive_suppression ? 1 : 0);
}

export const hasEnvironment = (g: SignalGame | null | undefined) => environmentCount(g) > 0;

export function hasAnyClaim(g: SignalGame | null | undefined): boolean {
  const c = g?.claims;
  return !!c && (!!c.control || c.closeness || !!c.pace || !!c.scoring || c.defensive_suppression || c.disruption.length > 0);
}

// ------------------------------------------------------------------ prices

export interface PriceView {
  kind: 'EXECUTABLE' | 'NO_OFFER' | 'UNAVAILABLE';
  /** The YES ask in dollars, only when executable. */
  ask: number | null;
  /** Whole cents, only when executable. */
  cents: number | null;
  /** When the number was observed (null = unknown). */
  observedAt: string | null;
  source: 'live' | 'contract' | 'publication' | null;
}

export const NO_PRICE: PriceView = { kind: 'UNAVAILABLE', ask: null, cents: null, observedAt: null, source: null };

/** A quote this code can read: the live store's quote or a publication market row, both YES-side. */
export interface YesQuote { yesAsk: number | null; observedAt: string | null }

const executable = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0 && v < 1;

/** A YES ask as a price view: 1.00 (or more) means there is no offer below $1; nothing means unavailable. */
export function viewOfAsk(ask: number | null | undefined, observedAt: string | null, source: PriceView['source']): PriceView {
  if (executable(ask)) return { kind: 'EXECUTABLE', ask, cents: Math.round(ask * 100), observedAt, source };
  if (ask != null && ask >= 1) return { kind: 'NO_OFFER', ask: null, cents: null, observedAt, source };
  return { ...NO_PRICE, observedAt, source };
}

export function contractPriceView(p: ContractPrice | null | undefined): PriceView {
  if (!p) return NO_PRICE;
  if (p.status === 'EXECUTABLE' && executable(p.yes_ask)) return viewOfAsk(p.yes_ask, p.captured_at, 'contract');
  if (p.status === 'PRICE_1_00') return { kind: 'NO_OFFER', ask: null, cents: null, observedAt: p.captured_at, source: 'contract' };
  return { ...NO_PRICE, observedAt: p.captured_at ?? null, source: 'contract' };
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/**
 * The CONTROL side's current price: a live quote of that side's own game-winner contract when it is at least as new
 * as the contract's capture, otherwise the contract's price. Only the CONTROL side is priced; no side is ever priced
 * as 1 − the other.
 */
export function controlPrice(g: SignalGame | null | undefined, live?: YesQuote | null): PriceView {
  const m = g?.market;
  if (!m || !m.is_control_side || !g?.claims?.control) return NO_PRICE;
  const contract = contractPriceView(m.price);
  if (live && live.observedAt) {
    const lt = time(live.observedAt);
    const ct = time(m.price?.captured_at);
    if (Number.isFinite(lt) && (!Number.isFinite(ct) || lt >= ct)) return viewOfAsk(live.yesAsk, live.observedAt, 'live');
  }
  return contract;
}

/** "BYU win · 79¢" · "No offer below $1" · "Price unavailable". */
export function priceText(team: string, p: PriceView): string {
  if (p.kind === 'EXECUTABLE') return `${team} win · ${p.cents}¢`;
  if (p.kind === 'NO_OFFER') return 'No offer below $1';
  return 'Price unavailable';
}

/**
 * The Market Disagreement rule, exactly as the contract states it: Strong CONTROL, and a current executable YES ask
 * of the CONTROL team's own game-winner market below `below_cents`. No price, no flag; Moderate CONTROL never.
 */
export function isDisagreement(g: SignalGame | null | undefined, doc: SignalsDoc | null | undefined, price: PriceView): boolean {
  if (!doc || !g) return false;
  const rule = doc.signals.market_disagreement.rule;
  if (rule.applies_to !== 'STRONG_CONTROL' || !isStrong(g)) return false;
  return price.kind === 'EXECUTABLE' && price.cents != null && price.cents < rule.below_cents;
}

/** Strong CONTROL already priced at or above the rule's threshold (or with no offer below $1). */
export function isPricedHigh(g: SignalGame | null | undefined, doc: SignalsDoc | null | undefined, price: PriceView): boolean {
  if (!doc || !isStrong(g)) return false;
  if (price.kind === 'NO_OFFER') return true;
  return price.kind === 'EXECUTABLE' && price.cents != null && price.cents >= doc.signals.market_disagreement.rule.below_cents;
}

// ------------------------------------------------------------------ the slate: priority, filters, sorts

export interface SlateGame {
  item: BoardItem;
  g: SignalGame | null;
  price: PriceView;
  disagreement: boolean;
  valueWatch: boolean;
  tier: number;
}

/**
 * SIFT priority (deterministic; kickoff order within a tier):
 *   1 Value Watch · 2 Strong CONTROL (no disagreement) · 3 Market Disagreement · 4 any other CONTROL ·
 *   5 a close-game profile or two or more environment claims · 6 any other claim · 7 no claim / not built.
 */
export function priorityTier(g: SignalGame | null | undefined, doc: SignalsDoc | null | undefined, disagreement: boolean): number {
  if (!g) return 7;
  if (isValueWatch(g, doc)) return 1;
  if (isStrong(g) && !disagreement) return 2;
  if (isStrong(g) && disagreement) return 3;
  if (isControl(g)) return 4;
  if (isClose(g) || environmentCount(g) >= 2) return 5;
  if (hasAnyClaim(g)) return 6;
  return 7;
}

export function slateGame(item: BoardItem, doc: SignalsDoc | null | undefined, live?: YesQuote | null): SlateGame {
  const g = doc?.byEvent.get(item.event_id) ?? null;
  const price = controlPrice(g, live);
  const disagreement = isDisagreement(g, doc, price);
  return { item, g, price, disagreement, valueWatch: isValueWatch(g, doc), tier: priorityTier(g, doc, disagreement) };
}

export type FilterId = 'all' | 'value-watch' | 'moderate' | 'strong' | 'close' | 'fast' | 'defensive' | 'disagreement' | 'environment';
export type SortId = 'priority' | 'time';

export const FILTERS: FilterId[] = ['all', 'value-watch', 'moderate', 'strong', 'close', 'fast', 'defensive', 'disagreement', 'environment'];

export function matchesFilter(x: SlateGame, f: FilterId): boolean {
  switch (f) {
    case 'value-watch': return x.valueWatch;
    case 'moderate': return isModerate(x.g);
    case 'strong': return isStrong(x.g);
    case 'close': return isClose(x.g);
    case 'fast': return isFast(x.g);
    case 'defensive': return isDefensive(x.g);
    case 'disagreement': return x.disagreement;
    case 'environment': return hasEnvironment(x.g);
    default: return true;
  }
}

const label = (x: SlateGame) => x.item.participants.map((p) => p.display_name ?? '').join(' ');
const byKickoff = (a: SlateGame, b: SlateGame) => a.item.start_time_utc.localeCompare(b.item.start_time_utc) || label(a).localeCompare(label(b)) || a.item.event_id.localeCompare(b.item.event_id);

export function sortSlate(xs: SlateGame[], s: SortId): SlateGame[] {
  return [...xs].sort(s === 'time' ? byKickoff : (a, b) => a.tier - b.tier || byKickoff(a, b));
}

export const parseFilter = (v: string | null): FilterId => (FILTERS.includes(v as FilterId) ? (v as FilterId) : 'all');
export const parseSort = (v: string | null): SortId => (v === 'time' ? 'time' : 'priority');

/**
 * This slate: the board games of the earliest season week that still has a game to play. Games kicked off more than
 * a day ago without a final status do not hold an old week open. Without week numbers (no signals document), the
 * seven days from the first game still to play.
 */
export function slateOf(items: BoardItem[], doc: SignalsDoc | null | undefined, now: number): { week: number | null; items: BoardItem[] } {
  const open = items.filter((i) => i.status !== 'FINAL');
  const recent = open.filter((i) => Date.parse(i.start_time_utc) >= now - 24 * 3600e3);
  const pool = recent.length ? recent : open;
  const weekOf = (i: BoardItem) => doc?.byEvent.get(i.event_id)?.season_week ?? null;
  const weeks = pool.map(weekOf).filter((w): w is number => w != null);
  if (weeks.length) {
    const week = Math.min(...weeks);
    return { week, items: open.filter((i) => weekOf(i) === week) };
  }
  if (!pool.length) return { week: null, items: [] };
  const first = Math.min(...pool.map((i) => Date.parse(i.start_time_utc)));
  return { week: null, items: open.filter((i) => Date.parse(i.start_time_utc) < first + 7 * 24 * 3600e3) };
}

// ------------------------------------------------------------------ words

export const STRENGTH_LABEL: Record<string, string> = { MODERATE: 'Moderate Control', STRONG: 'Strong Control' };

/** "+8 to +35" — the CONTROL side's margin, signed from that team's perspective. */
export function marginRange(r: [number, number]): string {
  return `${signedPoints(r[0])} to ${signedPoints(r[1])}`;
}

/** "Historical margin: +8 to +35 (middle half)" — one compact fact for a card. */
export function cardHistorical(h: SignalHistorical | null | undefined): string | null {
  return h ? `Historical margin: ${marginRange(h.central_50)} (middle half)` : null;
}

/** "566 of 628 past games" — a count, never a percentage or a chance. */
export function pastGamesText(h: { wins: number; n: number }): string {
  return `${h.wins} of ${h.n} past games`;
}

export interface CaptureLine { title: string; value: string }

/** Capture health in one line: primary-window coverage once a window has closed, otherwise how many await theirs. */
export function captureLine(doc: SignalsDoc): CaptureLine | null {
  const h = doc.capture_health;
  if (!h) return null;
  const hours = Math.round((doc.protocol?.primary_window?.open_minutes_before ?? 180) / 60);
  if (!h.windows_closed) {
    return { title: 'Capture health', value: `${h.pending} ${h.pending === 1 ? 'game' : 'games'} awaiting ${h.pending === 1 ? 'its' : 'their'} ${hours}-hour pre-kickoff window` };
  }
  const eligible = h.valid_primary_captures + h.orientation_failures + h.system_failures;
  return { title: 'Capture health', value: `Primary-window prices: ${h.valid_primary_captures}/${eligible} eligible games` };
}

// ------------------------------------------------------------------ the game page's own payload, in the same shape

/** The game's own V2 claims (event_research.extensions.script_engine.claims_v2) in the contract's per-game shape. */
export function claimsFromV2(engine: Engine): SignalClaims | null {
  const v2 = engine.claimsV2;
  if (!v2) return null;
  const c = v2.claims;
  const team = (side: 'home' | 'away') => engine.teams[side]?.name ?? side;
  return {
    control: c.control ? { side: c.control.side, strength: c.control.strength, tier: c.control.tier, team: team(c.control.side) } : null,
    closeness: !!c.closeness,
    pace: c.pace?.level ?? null,
    scoring: c.scoring_environment ? { level: c.scoring_environment.level, incremental: c.scoring_environment.incremental_over_baseline } : null,
    defensive_suppression: !!c.defensive_suppression,
    disruption: c.disruption.map((d) => ({ side: d.side, team: team(d.side), aligned_with_control: d.aligned_with_control })),
  };
}

/** Short ✓ edges from the claims, when the contract publishes none for a game. */
export function edgesFromClaims(c: SignalClaims | null): string[] {
  if (!c) return [];
  return [
    c.control && `${c.control.team} holds a ${c.control.strength === 'STRONG' ? 'strong' : 'moderate'} control edge`,
    c.closeness && 'Evidence supports a relatively close game',
    c.pace === 'HIGH' && 'More plays than an average FBS game',
    c.pace === 'LOW' && 'Fewer plays than an average FBS game',
    c.scoring?.level === 'ELEVATED' && 'Scoring above what the baseline expects',
    c.scoring?.level === 'SUPPRESSED' && 'Lower scoring, as the baseline already expects',
    c.defensive_suppression && 'Both defenses suppress the offenses they face',
    ...c.disruption.map((d) => `${d.team} owns the disruption edge${d.aligned_with_control ? ', aligned with control' : ''}`),
  ].filter((x): x is string => !!x).slice(0, 4);
}
