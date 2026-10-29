// The v3 view-model. Screens never read contract documents directly: an adapter (data/adapt.ts for the real
// publications, demo/fixtures.ts for clearly-labelled sample data) produces these, so a screen cannot tell real
// from sample and cannot invent a field the adapters did not provide. `provenance` says which it is.

import type { BoardItem } from '../../contract/types';
import type { MarketState } from './marketStatus';

export type Phase = 'pregame' | 'live' | 'final' | 'other';
export type Provenance = 'publication' | 'demo';

export interface V3Team {
  /** The publication's team code (NFL "SF", CFB "UGA"): the stable identity used for routes, follows and logos. */
  id: string;
  /** Sport slug ("nfl", "cfb"); with `id` it is the team's canonical key. */
  slug: string;
  sport: string;
  /** "San Francisco 49ers". */
  name: string;
  /** "49ers": the name a row prints. */
  nick: string;
  abbr: string;
  logo: string | null;
  colors: [string, string];
  record?: string | null;
  /** AP/CFP style rank, only when the source states one. */
  rank?: number | null;
}

export interface Price {
  /** Executable YES ask in cents (0-100), the number a buyer pays. */
  ask: number | null;
  bid: number | null;
  /** The venue's own implied probability for the side, in percent (pre-fee). Never a SIFT model number. */
  implied: number | null;
  ticker: string;
  side: 'YES' | 'NO';
  /** What YES means, in the contract's own words. */
  description: string;
  observedAt: string | null;
  /**
   * 'received' = the provider gave no observation time and `observedAt` is only when this device got the answer: not an observation, never
   * usable (src/live/quoteUsable.ts). Absent = the observation time is the provider's own (every publication price, every timed live quote).
   */
  observedVia?: 'provider' | 'received';
  source: 'Kalshi' | 'Sample';
  volume?: number | null;
  /**
   * True only when the status word is positively open (open, active, trading) or the source carries no status at all. Any other word (closed,
   * settled, expired, suspended, not yet open, delisted, or one SIFT does not recognise) is false. A non-tradable Price carries no ask, bid or
   * implied price, and the quote gate withholds it whatever its age. A tradable one still needs a current observation: see model/marketStatus.ts.
   */
  tradable: boolean;
  /** The status word as a state: 'unreported' when the source carries none, 'unrecognised' for a word nothing recognises. */
  marketStatus: MarketState;
}

export interface MarketLine {
  kind: 'spread' | 'total' | 'moneyline';
  /** "SF −2.5" / "O/U 44.5" / "SF" — what the chip prints. */
  label: string;
  /** The second small line: the price. */
  price: Price;
  /** The ladder this line came from, for the market sheet. */
  alternates?: Price[];
  line: number | null;
  teamId?: string;
}

export interface Score {
  away: number;
  home: number;
  /** "Q3 6:24" / "Final" / "Bot 7th". */
  clock: string | null;
  /** Where the number came from; the UI must say so for anything but a publication result. */
  source: 'publication' | 'score-feed' | 'demo';
  /** When the source last confirmed the score. */
  asOf: string | null;
  /**
   * True when the score is verified but a little old while the game is in play (data/scoreVerify.ts: older than 60 s, no older than 5 min).
   * The screen prints a subtle "Delayed" word beside the status and nothing else. A score older than that is not a Score at all.
   */
  delayed?: boolean;
}

export interface V3Game {
  /** "cfb:evt_…" — the route key. */
  key: string;
  slug: string;
  sport: string;
  eventId: string;
  league: string;
  phase: Phase;
  startMs: number;
  network?: string | null;
  away: V3Team;
  home: V3Team;
  score: Score | null;
  /** Possession, down & distance, etc. — only when a source states them. */
  situation?: { possession?: 'away' | 'home'; text: string } | null;
  lines: MarketLine[];
  /** How many published research signals the publication flags. */
  signals: number;
  provenance: Provenance;
  /** The venue photo the hero system verified for this game (src/lib/hero), or null for the logo-led layout. */
  photo?: { src: string; srcset?: string; /** CSS object-position for a phone-width crop. */ focus?: string; credit?: string | null } | null;
  venue?: string | null;
  neutral?: boolean;
  /** The publication's board row (real games only), kept so per-game documents can be resolved lazily. */
  item?: BoardItem;
}

export const teamKey = (t: Pick<V3Team, 'slug' | 'id'>) => `${t.slug}:${t.id}`;
