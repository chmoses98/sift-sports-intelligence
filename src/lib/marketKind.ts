// One market-type vocabulary for the whole app. Every market maps to a kind (what it is about), an
// optional team (whose market it is) and an optional period, so the same symbol appears wherever that
// kind of market appears. The visual is drawn by components/MarketIcon.tsx.
import type { Market } from '../contract/types';

export type MarketKind =
  | 'moneyline' | 'spread' | 'total' | 'team-total'
  | 'passing' | 'rushing' | 'receiving' | 'receptions' | 'touchdown' | 'kicking' | 'defense' | 'fantasy'
  | 'period' | 'parlay' | 'game';

export const KIND_LABEL: Record<MarketKind, string> = {
  moneyline: 'Moneyline', spread: 'Spread', total: 'Game total', 'team-total': 'Team total',
  passing: 'Passing prop', rushing: 'Rushing prop', receiving: 'Receiving prop', receptions: 'Receptions prop',
  touchdown: 'Touchdown market', kicking: 'Kicking prop', defense: 'Defense market', fantasy: 'Fantasy points prop',
  period: 'Period result', parlay: 'Parlay / teaser', game: 'Game event',
};

const STAT_KIND: Record<string, MarketKind> = {
  passing_yards: 'passing', attempts: 'passing', completions: 'passing', passing_tds: 'passing', interceptions: 'passing',
  rushing_yards: 'rushing', carries: 'rushing', longest_rush: 'rushing',
  receiving_yards: 'receiving', longest_reception: 'receiving', rush_rec_yards: 'receiving',
  receptions: 'receptions',
  touchdowns: 'touchdown',
  field_goals: 'kicking', extra_points: 'kicking', kicking_points: 'kicking',
  team_sacks: 'defense', sacks: 'defense',
  fantasy_points: 'fantasy',
};

export interface MarketAnchor {
  kind: MarketKind;
  /** The team the market belongs to (its own team, or the player's team), when there is one. */
  team: string | null;
  /** '1H', '2H', '1Q'… for period markets; null for the full game. */
  period: string | null;
}

/**
 * What a market is, for its symbol. `abbrOf` names the market's participant (a team id); `playerTeam` names a
 * player's team. Defensive and special-teams subjects ("BUF Bills D/ST") count as defense for that team.
 */
export function marketAnchor(
  m: Pick<Market, 'market_family' | 'period' | 'participant_id' | 'player_id' | 'extensions'>,
  abbrOf: (pid: string | null) => string | null,
  playerTeam: (playerId: string | null) => string | null,
): MarketAnchor {
  const period = m.period && m.period !== 'FULL' ? m.period : null;
  const ext = (m.extensions ?? {}) as { stat?: string; subject?: string };
  const team = abbrOf(m.participant_id) ?? playerTeam(m.player_id) ?? null;
  const dst = /\bD\/ST\b/.test(ext.subject ?? '') ? (ext.subject ?? '').split(' ')[0] : null;
  switch (m.market_family) {
    case 'game_winner': return { kind: 'moneyline', team, period };
    case 'spread': return { kind: 'spread', team, period };
    case 'total': return { kind: 'total', team: null, period };
    case 'team_total': return { kind: 'team-total', team, period };
    case 'player_stat':
      if (dst) return { kind: 'defense', team: dst, period };
      return { kind: STAT_KIND[ext.stat ?? ''] ?? 'fantasy', team, period };
    case 'game_player_leader': return { kind: STAT_KIND[ext.stat ?? ''] ?? 'fantasy', team, period };
    case 'anytime_td': case 'first_td': case 'first_td_scorer': case 'first_td_team': return { kind: 'touchdown', team, period };
    case 'team_stat': return { kind: STAT_KIND[ext.stat ?? ''] ?? 'team-total', team, period };
    case 'period_winner': case 'half_full_result': return { kind: 'period', team, period };
    case 'parlay': case 'teaser': return { kind: 'parlay', team: null, period };
    default: return { kind: 'game', team, period };
  }
}
