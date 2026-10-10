// The handful of numbers a featured matchup hero may show, read only from what a game's own research document
// publishes. Model figures come from `extensions.model_view` (NFL's shadow model, with its caveat); market figures
// from `extensions.market_implied` (midpoint-inferred, labelled research) or, failing that, the game-winner
// contracts' own market probability. Anything not published stays null and is simply not drawn.
import type { EventResearchDoc } from '../../contract/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SideNumbers {
  abbr: string;
  name: string;
  modelScore: number | null;
  modelWin: number | null;
  marketWin: number | null;
}

export interface HeroNumbers {
  away: SideNumbers;
  home: SideNumbers;
  /** Home line (negative = home favoured), as the publication states it. */
  modelSpread: number | null;
  modelTotal: number | null;
  marketSpread: number | null;
  marketTotal: number | null;
  modelVersion: string | null;
  /** The publication's own caveat on its model view, verbatim. */
  caveat: string | null;
  /** Where the market numbers came from, in words. */
  marketBasis: string | null;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function heroNumbers(r: EventResearchDoc | null | undefined): HeroNumbers | null {
  if (!r) return null;
  const ext = (r.extensions ?? {}) as any;
  const mv = ext.model_view ?? null;
  const mi = ext.market_implied ?? null;
  const side = (ha: 'HOME' | 'AWAY'): SideNumbers | null => {
    const part = r.participants.find((p) => p.home_away === ha);
    const ev = r.event.participants.find((p) => p.participant_id === part?.participant_id);
    if (!part || !ev) return null;
    const abbr = ev.short_name ?? ev.display_name;
    const winner = r.markets.find((m) => m.market_family === 'game_winner' && m.participant_id === ev.participant_id && (m.period == null || m.period === 'FULL'));
    const marketWin = num(mi?.win_probability?.[abbr]) ?? num(winner?.market_probability);
    return { abbr, name: ev.display_name, modelScore: num(mv?.model_score?.[abbr]), modelWin: num(mv?.model_win_probability?.[abbr]), marketWin };
  };
  const away = side('AWAY');
  const home = side('HOME');
  if (!away || !home) return null;
  return {
    away,
    home,
    modelSpread: num(mv?.model_spread),
    modelTotal: num(mv?.model_total),
    marketSpread: num(mi?.implied_spread),
    marketTotal: num(mi?.implied_total_median),
    modelVersion: mv?.model_version ?? null,
    caveat: mv?.caveat ?? null,
    marketBasis: mi ? 'Market-implied from contract midpoints (research, not executable)' : away.marketWin != null ? 'Game-winner contracts, publication capture' : null,
  };
}

/** "LA −3" from a home line: the favourite and the half-rounded points. */
export function spreadText(homeLine: number | null, n: HeroNumbers): string | null {
  if (homeLine == null) return null;
  const pts = Math.round(Math.abs(homeLine) * 2) / 2;
  if (pts < 0.5) return 'Pick’em';
  return `${homeLine <= 0 ? n.home.abbr : n.away.abbr} −${pts}`;
}

export const halfRound = (v: number) => Math.round(v * 2) / 2;
