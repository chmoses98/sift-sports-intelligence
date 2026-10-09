// THE OPPORTUNITY LAYER — one shape for "something worth a viewer's attention" across every sport Sift reads.
//
// An Opportunity is never invented by Sift. It is a contract and side that a sport publication itself flags
// (recommendations.json: a RESEARCH_CANDIDATE or an actionable recommendation; the CFB research-signals contract's
// Value Watch; the NFL publication's own recommendations), carried with:
//   WHAT      the exact contract, side and line, in the sport's own words
//   WHY       the publication's thesis in plain English
//   EVIDENCE  the specific, published statements that support it
//   PRICE     the executable quote for that side, the fee-aware break-even, the publication's bet-up-to price (never
//             derived by Sift), liquidity and the quote's age
//   CONFIDENCE the publication's authority and calibration record, and whether the market has beaten the model
//   RISK      the strongest published reason it loses (counter-case, worst-case edge, data warnings)
//   ALTERNATIVES the related expressions the publication names
// A PASS is a first-class result: a sport with nothing that qualifies says so, with the precise missing prerequisite.
import type { SportCode } from '../contract/types';
import type { Outcome } from './correlation';
import type { EventPhase } from './lifecycle';
import type { Orientation } from './identity';

export type OpportunityStatus =
  /** The publication itself permits a bet (authority not research-only), the price is current and at or under its bet-up-to. */
  | 'ACTIONABLE'
  /** The publication flags the contract for research review; its model is research-only or unvalidated. */
  | 'RESEARCH_CANDIDATE'
  /** A published research signal on a game (CFB Value Watch, NFL multi-script support): a game to look at, not a priced edge. */
  | 'WATCH'
  /** The publication judged the contract and said no (expired, stale, above bet-up-to, data warning, rejected). */
  | 'PASS';

export type Side = 'YES' | 'NO';

export type PriceState =
  | 'CURRENT'            // a usable quote for the side, at or under the publication's bet-up-to where one exists
  | 'ABOVE_BET_UP_TO'    // the current ask exceeds the publication's bet-up-to price
  | 'EXPIRED'            // the publication's own validity window has passed
  | 'STALE'              // the quote is older than the market-quote policy allows
  | 'NO_QUOTE'           // no executable price is known for the side
  | 'UNPRICED';          // the publication prices nothing here (no fair probability)

export interface PriceIntel {
  side: Side;
  /** The ask a buyer of `side` pays (dollars 0..1). For NO this is the NO ask, never 1 − YES bid guessed. */
  ask: number | null;
  bid: number | null;
  observedAt: string | null;
  source: 'live' | 'publication' | 'recommendation' | null;
  /** The publication's probability that `side` wins. */
  fair: number | null;
  fairLow: number | null;
  fairHigh: number | null;
  /** Kalshi taker fee per contract at `ask` (the publication's figure when published, else the Kalshi schedule). */
  fee: number | null;
  feeSource: 'publication' | 'kalshi-schedule' | null;
  /** ask + fee: the probability the side must have to break even. */
  breakEven: number | null;
  /** fair − breakEven, per $1 contract; the publication's own figure when it publishes one. */
  evPerContract: number | null;
  evSource: 'publication' | 'derived' | null;
  /** The publication's bet-up-to price for the side. Sift never derives one. */
  betUpTo: number | null;
  /** Contracts available at the ask, when the publication reports it. */
  availableSize: number | null;
  expiresAt: string | null;
  state: PriceState;
}

export type Calibration =
  | 'VALIDATED'           // the publication reports settled calibration and permits real money
  | 'RESEARCH'            // research-only; calibration published but not promoted
  | 'MARKET_BEATS_MODEL'  // the publication's own settled record shows the market as the better forecaster
  | 'UNVALIDATED';        // no settled record published

export interface Confidence {
  calibration: Calibration;
  /** One sentence, from the publication, on what the record shows. */
  note: string;
  /** Freshness of the inputs that produced the number, as the publication reports them. */
  inputs: Record<string, string>;
  /** Published support strength (soccer expression label, NHL robustness tier, tennis external confirmation …). */
  support: string | null;
  supportNote: string | null;
  /** 0..1 share of simulated worlds / posterior draws in which the edge is positive, when published. */
  edgeShare: number | null;
  /** How this kind of candidate has done when settled, from the publication's own scorecard (null when none is published). */
  record?: TrackRecord | null;
}

/** A publication's settled record for the candidate's family: what a skeptical viewer checks before trusting a gap. */
export interface TrackRecord {
  /** One line a viewer reads in seconds: "318 past player-goals candidates won 33% against 38% expected; closing line −0.4¢". */
  line: string;
  /** True when the record runs against the model (won less than expected, or a negative closing line / shadow return). */
  adverse: boolean;
  n: number;
  /** Where the numbers come from and when they were computed. */
  source: string;
}

export interface Opportunity {
  id: string;
  sport: SportCode;
  slug: string;
  eventId: string;
  /** "Arsenal v Leeds United", "NSH @ TOR", "Khachanov v Fery". */
  eventLabel: string;
  competition: string | null;
  startTime: string;
  marketId: string | null;
  ticker: string | null;
  family: string | null;
  what: { title: string; side: Side; subject: string | null };
  why: string;
  evidence: string[];
  risk: string | null;
  alternatives: string[];
  price: PriceIntel;
  confidence: Confidence;
  status: OpportunityStatus;
  /** The publication's authority word for this number, verbatim. */
  authority: string;
  /** Why the status is what it is, in one sentence. */
  statusReason: string;
  /** The event's lifecycle phase at evaluation time (src/opportunity/lifecycle.ts): only PREGAME can be acted on. */
  phase: EventPhase;
  /** The publication's pricing inputs, kept so a newer live quote can reprice the side (src/opportunity/live.ts). */
  reprice: RepriceInputs;
  /** A thesis / exposure group shared with related opportunities on the same game (correlation). */
  group: string | null;
  /** Whether the Kalshi ticker's own side code agrees with the side the publication names (src/opportunity/identity.ts). */
  orientation: Orientation;
  /** What must happen for the position to pay, from the contract words (src/opportunity/correlation.ts). */
  outcome?: Outcome;
  /** Set when a live quote changed the ask: which published figures were re-based and which are as of the research run. */
  priceNote?: string | null;
  href: string;
  gameHref: string;
  /** Auditable ranking inputs; the order is a documented rule over these, never a hidden score. */
  rank: RankInputs;
}

/** What priceIntel needs besides the ask and its clock: the publication's fair band, fee, EV, limit and expiry. */
export interface RepriceInputs {
  side: Side;
  fair: number | null;
  fairLow?: number | null;
  fairHigh?: number | null;
  publishedFee?: number | null;
  publishedEv?: number | null;
  betUpTo?: number | null;
  availableSize?: number | null;
  expiresAt?: string | null;
  publishedPriceState?: string | null;
}

export interface RankInputs {
  tier: 1 | 2 | 3 | 4 | 5;
  tierWord: string;
  worstCaseEdge: number | null;
  evPerContract: number | null;
  edgeShare: number | null;
  priceCurrent: boolean;
  highVariance: boolean;
  kickoff: string;
}

/** A sport's verdict when nothing qualifies, or the context around what does. */
export interface SportVerdict {
  sport: SportCode;
  slug: string;
  label: string;
  /** How many games/matches the publication lists in the window. */
  games: number;
  opportunities: number;
  passes: number;
  /** The precise prerequisite that is missing, when there is no opportunity. */
  passReason: string | null;
  /** Publication health / model state words. */
  modelState: string | null;
  /** The publication's own market-capture clock, so a stale feed is said in words next to its passes and candidates. */
  marketCaptureAt: string | null;
  loaded: boolean;
  error: string | null;
}
