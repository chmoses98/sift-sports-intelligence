// Contract lookups for one game's Kalshi markets (pure): the win-price contracts, a team's total, and the schedule authority's start
// for a game. Prices come out as `Price` rows; whether one may be SHOWN is decided by the quote gate (data/quoteGate.ts), not here.
import type { Market } from '../../../contract/types';
import type { Price } from '../../model/types';
import { priceOf } from '../adapt';
import type { ScheduleEvent } from './types';

const OPEN = (m: Market) => !m.market_status || /^(OPEN|ACTIVE|UNOPENED)$/i.test(m.market_status);
const FULL = (m: Market) => m.period == null || /^full(_game)?$/i.test(m.period);

export interface WinContract { team: 'away' | 'home'; ticker: string; price: Price }

/** The full-game win contracts, away then home. A side with no open contract is absent (never filled). */
export function winContracts(markets: Market[] | undefined, awayId: string | null, homeId: string | null): WinContract[] {
  const ml = (markets ?? []).filter((m) => OPEN(m) && FULL(m) && m.yes_ask != null && /^(game_)?(moneyline|winner)$/.test(m.market_family) && m.participant_id);
  const out: WinContract[] = [];
  for (const [team, pid] of [['away', awayId], ['home', homeId]] as const) {
    const m = pid ? ml.find((x) => x.participant_id === pid) : undefined;
    if (m) out.push({ team, ticker: m.kalshi_ticker, price: priceOf(m) });
  }
  return out;
}

const nearHalf = (m: Market) => Math.abs((m.market_probability ?? m.yes_ask ?? 0) - 0.5);
/** "scores at least 22" is the 21.5 line: an integer ">=" threshold sits half a point below. */
const totalLine = (m: Market): number | null => {
  const t = m.threshold ?? m.line;
  if (t == null || !Number.isFinite(t)) return null;
  const op = (m.extensions as { operator?: string } | null)?.operator;
  return op === '>=' && Number.isInteger(t) ? t - 0.5 : t;
};

export interface TeamTotal { ticker: string; price: Price; line: number }
/** A team's full-game total contract nearest to even money (the line the market treats as the middle), or null. */
export function teamTotalFor(markets: Market[] | undefined, participantId: string | null): TeamTotal | null {
  if (!participantId) return null;
  const rows = (markets ?? []).filter((m) => OPEN(m) && FULL(m) && m.yes_ask != null && m.market_family === 'team_total' && m.participant_id === participantId && totalLine(m) != null);
  const best = [...rows].sort((a, b) => nearHalf(a) - nearHalf(b) || totalLine(a)! - totalLine(b)!)[0];
  return best ? { ticker: best.kalshi_ticker, price: priceOf(best), line: totalLine(best)! } : null;
}

/**
 * The league schedule's start for a game (the schedule authority, never Kalshi event metadata): the explorer event with the same id,
 * else the one between the same two teams nearest the board's time (within three days: a rematch is a different game).
 */
export function scheduledStart(schedule: ScheduleEvent[], g: { eventId: string; away: string; home: string; startMs: number }): number | null {
  const same = schedule.find((e) => e.eventId === g.eventId);
  const pick = same ?? schedule
    .filter((e) => e.homeCode === g.home && e.awayCode === g.away && Number.isFinite(Date.parse(e.startUtc)))
    .map((e) => ({ e, d: Math.abs(Date.parse(e.startUtc) - g.startMs) }))
    .filter((x) => !Number.isFinite(g.startMs) || x.d <= 3 * 86_400_000)
    .sort((a, b) => a.d - b.d)[0]?.e;
  const t = pick ? Date.parse(pick.startUtc) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** "Week 7" from a competition label such as "2026 REG week 7". */
export const weekOf = (competition: string | null | undefined): string | null => {
  const m = /week\s*(\d{1,2})/i.exec(competition ?? '');
  return m ? `Week ${Number(m[1])}` : null;
};
