// KALSHI-STYLE BROWSING (owner items 38 and 40): the market board's opportunities as event cards with category chips.
// Pure rules over the opportunity layer's own records — the order is the documented ranking (compareOpportunities),
// the words are the conventional betting words (lib/betWords), and a category is read from the contract's family and
// words. Nothing here re-prices, re-ranks by gap, or combines contracts.
import type { Featured } from '../opportunity/rank';
import type { Opportunity } from '../opportunity/types';

export type MarketKind = 'winner' | 'spread' | 'total' | 'props' | 'other';

export const KIND_WORD: Record<MarketKind, string> = { winner: 'Winner', spread: 'Spread & handicap', total: 'Totals & scoring', props: 'Player props', other: 'Other' };
export const KIND_ORDER: MarketKind[] = ['winner', 'spread', 'total', 'props', 'other'];

/** Which category a contract belongs to, from its family first and its title second. */
export function marketKind(o: Pick<Opportunity, 'family' | 'what'>): MarketKind {
  const f = (o.family ?? '').toLowerCase();
  const t = o.what.title.toLowerCase();
  if (/^player_|goal_?scorer|first_goal|first_td|anytime|assist|strikeout|pitcher|hitter|passing|rushing|receiving|reception/.test(f) || /\b(goals?|assists?|points|shots|strikeouts|yards|receptions)\b.*\d|\d\+ (goals?|assists?|points)/.test(t) && /:/.test(t)) return 'props';
  if (/spread|handicap|margin|run_line|puck_line|exact_set|wins by/.test(f) || /[−-]\d+(\.\d)?$|wins by more than/.test(t)) return 'spread';
  if (/total|btts|both_teams|yrfi|nrfi|tt_|over|under|score/.test(f) || /\b(over|under)\b|both teams/.test(t)) return 'total';
  if (/winner|moneyline|result|^ml|_ml|f5_ml|to_win|first_to_score/.test(f) || /to win|\bdraw\b|tie\b/.test(t)) return 'winner';
  return 'other';
}

export interface EventCard {
  key: string;
  sport: string;
  slug: string;
  eventId: string;
  eventLabel: string;
  competition: string | null;
  startTime: string;
  gameHref: string;
  /** Featured leads on this game, best first (the documented ranking). */
  items: Featured[];
  /** The best tier on the card (1 actionable … 4 signals). */
  tier: number;
}

/**
 * Featured opportunities grouped by game, games ordered by their best lead (featured is already ranked), narrowed to a
 * category when one is chosen. A game's leads are one exposure: the card says so when it carries more than one.
 */
export function eventCards(featured: Featured[], kind: MarketKind | null): EventCard[] {
  const out = new Map<string, EventCard>();
  for (const f of featured) {
    if (kind && marketKind(f.lead) !== kind) continue;
    const o = f.lead;
    const key = `${o.sport}:${o.eventId}`;
    let c = out.get(key);
    if (!c) {
      c = { key, sport: o.sport, slug: o.slug, eventId: o.eventId, eventLabel: o.eventLabel, competition: o.competition, startTime: o.startTime, gameHref: o.gameHref, items: [], tier: o.rank.tier };
      out.set(key, c);
    }
    c.items.push(f);
    c.tier = Math.min(c.tier, o.rank.tier);
  }
  return [...out.values()];
}

export function kindCounts(featured: Featured[]): Record<MarketKind, number> {
  const c = { winner: 0, spread: 0, total: 0, props: 0, other: 0 };
  for (const f of featured) c[marketKind(f.lead)]++;
  return c;
}

/** "Research candidates or better exist" — otherwise the board must say first that no validated bet exists. */
export const hasBackedBet = (featured: Featured[]) => featured.some((f) => f.lead.rank.tier <= 3);
