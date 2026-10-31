// Which Kalshi contracts are "the win" and "the total" of a game, for every sport the app lists. American sports publish `moneyline` / `winner` / `total`
// with a full-game period; soccer publishes `match_result_3way` and `total_goals` with the period "regulation" (full time), tennis `match_winner` and
// `total_games` with none. A family named here is read as the game's own; every other period or family is left to the market sheet and the props lists.
import type { EventDetailDoc, Market } from '../../../contract/types';

export const WIN_FAMILY = /^(game_)?(moneyline|winner)$|^(match_result_3way|match_winner)$/;
export const TOTAL_FAMILY = /^(game_)?total$|^(total_goals|total_games)$/;

const FULL_PERIOD = /^full(_game)?$/i;
/** Soccer's full-time families carry the period "regulation"; a first-half or extra-time contract never does. */
const REGULATION_FAMILY = /^(match_result_3way|total_goals)$/;

/** The full-game contract (publications spell the period "FULL", "FULL_GAME", "full_game", leave it out, or call soccer's 90 minutes "regulation"). */
export const isFullGame = (m: Pick<Market, 'period' | 'market_family'>): boolean =>
  m.period == null || FULL_PERIOD.test(m.period) || (/^regulation$/i.test(m.period) && REGULATION_FAMILY.test(m.market_family));

/**
 * A contract document in which the two sides are always named. Tennis (an individual sport) publishes an event with no home and away participant: the
 * board's own rule is that the second-listed participant is the away side and the first the home side (views/broadcast/games.ts), so the same rule names
 * them here and every reader of the document (win prices, totals, the contract sheet) agrees with the board. A document that names them is unchanged.
 */
export function withSides(d: EventDetailDoc): EventDetailDoc {
  const e = d.event;
  if (e.away_participant && e.home_participant) return d;
  const ps = e.participants ?? [];
  if (ps.length !== 2) return d;
  return { ...d, event: { ...e, away_participant: e.away_participant ?? ps[1].participant_id, home_participant: e.home_participant ?? ps[0].participant_id } };
}
