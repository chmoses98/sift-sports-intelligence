// Presentation helpers for a game: plain-language market labels, team form and head-to-head from the
// team profiles, injury rows, the one-sentence model read and the kickoff weather. Pure functions over
// published documents — they choose words and order, never create a number.
import type { EntityProfileDoc, EventResearchDoc, Market, ModelPrice } from '../contract/types';
import { STAT_LABEL } from './nfl';
import type { GameScript, ScriptFit, ScriptSet } from './scripts';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ markets

export type MarketGroupKey = 'spreads' | 'totals' | 'team_totals' | 'props' | 'halves' | 'more';

export function marketGroup(m: Pick<Market, 'market_family' | 'period' | 'player_id'>): MarketGroupKey {
  if (m.player_id || ['player_stat', 'first_td_scorer', 'game_player_leader', 'anytime_td', 'first_td'].includes(m.market_family)) return 'props';
  if (m.period === '1H' || m.period === '2H') return 'halves';
  if (m.period && m.period !== 'FULL') return 'more';
  if (m.market_family === 'spread' || m.market_family === 'game_winner') return 'spreads';
  if (m.market_family === 'total') return 'totals';
  if (m.market_family === 'team_total') return 'team_totals';
  return 'more';
}

const half = (v: number) => (Number.isInteger(v) ? `${v - 0.5}` : `${v}`);
const STAT_SHORT: Record<string, string> = {
  passing_yards: 'pass yds', receiving_yards: 'rec yds', rushing_yards: 'rush yds', receptions: 'receptions', carries: 'carries',
  attempts: 'pass att', completions: 'completions', passing_tds: 'pass TDs', touchdowns: 'TDs', rush_rec_yards: 'rush+rec yds',
  interceptions: 'INTs', longest_reception: 'longest rec', longest_rush: 'longest rush', fantasy_points: 'fantasy pts',
};

/**
 * A market in sports language. Kalshi YES conditions map one-to-one: "BUF margin > 6.5" is BUF −6.5,
 * "total ≥ 50" is Over 49.5, "BUF team points ≥ 28" is BUF Over 27.5.
 */
export function marketLabel(m: Market, abbrOf: (pid: string | null) => string | null, playerName: (id: string | null) => string | null): string {
  const who = abbrOf(m.participant_id);
  const per = m.period && m.period !== 'FULL' ? `${m.period} ` : '';
  const t = m.threshold;
  switch (m.market_family) {
    case 'game_winner':
      return `${per}${who ?? '?'} to win`;
    case 'spread':
      return t != null ? `${per}${who ?? '?'} −${t}` : m.yes_description;
    case 'total':
      return t != null ? `${per}Over ${half(t)}` : m.yes_description;
    case 'team_total':
      return t != null ? `${per}${who ?? '?'} Over ${half(t)}` : m.yes_description;
    case 'player_stat': {
      const stat = (m.extensions?.stat as string | undefined) ?? '';
      const name = playerName(m.player_id) ?? (m.extensions?.subject as string | undefined) ?? 'Player';
      return t != null ? `${name} ${t}+ ${STAT_SHORT[stat] ?? STAT_LABEL[stat] ?? stat.replace(/_/g, ' ')}` : `${name} ${STAT_LABEL[stat] ?? stat}`;
    }
    default:
      return m.yes_description.replace(/^YES iff /, '').replace(/_/g, ' ').replace(/\s*\(FULL\)/, '').replace(/>=/g, '≥');
  }
}

export interface PriceRow {
  m: Market;
  label: string;
  group: MarketGroupKey;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  /** The model's P(YES) — research evidence. */
  model: number | null;
  /** Model minus the current market midpoint, in probability points. */
  gap: number | null;
  fit: ScriptFit | null;
}

export function priceRow(m: Market, prices: Map<string, ModelPrice>, label: string, fit: ScriptFit | null): PriceRow {
  const bid = m.yes_bid ?? null;
  const ask = m.yes_ask ?? null;
  const mid = bid != null && ask != null ? (bid + ask) / 2 : m.market_probability ?? null;
  const mp = prices.get(m.market_id);
  const model = mp?.fair_probability ?? null;
  return { m, label, group: marketGroup(m), bid, ask, mid, model, gap: model != null && mid != null ? model - mid : null, fit };
}

/** "+5" / "−3" probability points; "0" inside half a point. */
export function gapText(g: number | null): string {
  if (g == null) return '—';
  const v = Math.round(g * 100);
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0';
}

export const centsText = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

// ------------------------------------------------------------------ teams: record, form, head-to-head

export function recordOf(p: EntityProfileDoc | null | undefined): { w: number; l: number; t: number; text: string } | null {
  const r = (p?.extensions as any)?.record;
  if (!r) return null;
  return { w: r.wins, l: r.losses, t: r.ties ?? 0, text: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}` };
}

export interface FormGame {
  eventId: string;
  date: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  for: number;
  against: number;
  outcome: 'W' | 'L' | 'T';
}

/** Completed games before `beforeIso`, most recent first. */
export function completedGames(p: EntityProfileDoc | null | undefined, beforeIso?: string): FormGame[] {
  const games = ((p as any)?.games ?? []) as any[];
  return games
    .filter((g) => g.result && g.result.for != null && g.result.against != null && (!beforeIso || g.start_time_utc < beforeIso))
    .map((g) => ({
      eventId: g.event_id, date: g.start_time_utc, opponentId: g.opponent_id, opponentName: g.opponent_name, home: g.home_away === 'HOME',
      for: g.result.for, against: g.result.against, outcome: (g.result.outcome ?? (g.result.for > g.result.against ? 'W' : g.result.for < g.result.against ? 'L' : 'T')) as FormGame['outcome'],
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface H2HGame {
  eventId: string;
  date: string;
  winnerId: string | null;
  winnerPts: number;
  loserPts: number;
  loserId: string | null;
  /** Where it was played, from the first team's side. */
  homeId: string;
}

/** Meetings between the two teams, most recent first; winner's score first. */
export function headToHead(a: EntityProfileDoc | null | undefined, aId: string, bId: string, beforeIso?: string): H2HGame[] {
  return completedGames(a, beforeIso)
    .filter((g) => g.opponentId === bId)
    .map((g) => {
      const aWon = g.for > g.against;
      const tie = g.for === g.against;
      return { eventId: g.eventId, date: g.date, winnerId: tie ? null : aWon ? aId : bId, loserId: tie ? null : aWon ? bId : aId, winnerPts: Math.max(g.for, g.against), loserPts: Math.min(g.for, g.against), homeId: g.home ? aId : bId };
    });
}

export interface RankedStat {
  metricId: string;
  value: number | null;
  rank: number | null;
  size: number | null;
}

export function teamStat(p: EntityProfileDoc | null | undefined, metricId: string): RankedStat {
  const o = ((p as any)?.metrics ?? []).find((m: any) => m.metric_id === metricId);
  return { metricId, value: o?.value ?? null, rank: o?.context?.rank ?? null, size: o?.context?.universe_size ?? null };
}

// ------------------------------------------------------------------ availability

export interface InjuryRow {
  player: string;
  position: string | null;
  team: string | null;
  status: string;
  note: string | null;
  asOf: string | null;
}

const STATUS_ORDER = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE'];

/** "Name (POS, TEAM): note" → structured rows, non-active only, most serious first. */
export function injuryRows(r: EventResearchDoc): InjuryRow[] {
  return (r.context?.injuries ?? [])
    .filter((i) => i.status && i.status !== 'ACTIVE')
    .map((i) => {
      const m = /^(.+?) \(([^,]+), ([A-Z]{2,3})\):\s*(.*)$/.exec(i.detail ?? '');
      return { player: m?.[1] ?? i.detail ?? '', position: m?.[2] ?? null, team: m?.[3] ?? null, status: i.status, note: m?.[4] ?? null, asOf: i.as_of ?? null };
    })
    .sort((a, b) => ((STATUS_ORDER.indexOf(a.status) + 9) % 9) - ((STATUS_ORDER.indexOf(b.status) + 9) % 9));
}

const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
/** The injuries worth a glance on the overview: skill players and the most serious designations first. */
export function notableInjuries(rows: InjuryRow[], team: string, n = 4): InjuryRow[] {
  const mine = rows.filter((x) => x.team === team);
  const score = (x: InjuryRow) => (STATUS_ORDER.indexOf(x.status) + 9) % 9 + (SKILL.has(x.position ?? '') ? 0 : 3);
  return [...mine].sort((a, b) => score(a) - score(b)).slice(0, n);
}

// ------------------------------------------------------------------ model read

const halfRound = (v: number) => Math.round(v * 2) / 2;

/**
 * The one-line read: who the model favours, by how much, and the strongest unit behind it (by
 * league rank among opponent-adjusted ratings). No caveats here — methodology lives in the deep views.
 */
export function modelRead(r: EventResearchDoc, homeName: string, awayName: string, homeProf: EntityProfileDoc | null | undefined, awayProf: EntityProfileDoc | null | undefined): string | null {
  const ext = r.extensions as any;
  const mv = ext?.model_view;
  const home = r.participants.find((p) => p.home_away === 'HOME');
  if (!mv || mv.model_spread == null || !home) return null;
  const spread = Number(mv.model_spread); // home line: negative = home favoured
  const favHome = spread <= 0;
  const fav = favHome ? homeName : awayName;
  const pts = halfRound(Math.abs(spread));
  const favProf = favHome ? homeProf : awayProf;
  const units: [string, string][] = [
    ['met_nfl.adj_off_epa', 'offense'],
    ['met_nfl.adj_def_epa', 'defense'],
    ['met_nfl.adj_off_db_epa', 'passing offense'],
    ['met_nfl.adj_off_rush_epa', 'run game'],
    ['met_nfl.adj_def_db_epa', 'pass defense'],
  ];
  const best = units
    .map(([id, word]) => ({ word, ...teamStat(favProf, id) }))
    .filter((u) => u.rank != null && u.rank <= 5)
    .sort((a, b) => (a.rank as number) - (b.rank as number))[0];
  const wp = mv.model_win_probability?.[favHome ? short(r, 'HOME') : short(r, 'AWAY')];
  const lead = pts < 1 ? `${homeName} and ${awayName} project as a near coin flip` : `${fav} projects as a ${pts}-point favorite${wp != null ? ` (${Math.round(wp * 100)}% to win)` : ''}`;
  const why = best ? `, led by the league's No. ${best.rank} opponent-adjusted ${best.word}` : '';
  const mi = ext?.market_implied;
  let vs = '';
  if (mi?.implied_spread != null) {
    const diff = Math.abs(spread) - Math.abs(Number(mi.implied_spread));
    vs = Math.abs(diff) < 1 ? ' The market agrees within a point.' : ` That is ${halfRound(Math.abs(diff))} points ${diff > 0 ? 'more' : 'less'} than the market.`;
  }
  return `${lead}${why}.${vs}`;
}

function short(r: EventResearchDoc, side: 'HOME' | 'AWAY'): string {
  const p = r.participants.find((x) => x.home_away === side);
  return r.event.participants.find((x) => x.participant_id === p?.participant_id)?.short_name ?? '';
}

// ------------------------------------------------------------------ weather

export interface KickoffWeather {
  icon: string;
  temp: number | null;
  forecast: string | null;
  wind: string | null;
  precip: number | null;
  indoor: boolean;
  roofNote: string | null;
}

export function weatherIcon(forecast: string | null | undefined): string {
  const f = (forecast ?? '').toLowerCase();
  if (/thunder|storm/.test(f)) return 'storm';
  if (/rain|shower|drizzle|snow|sleet/.test(f)) return 'rain';
  if (/partly|mostly cloudy/.test(f)) return 'partly';
  if (/cloud|overcast|fog/.test(f)) return 'cloud';
  if (/sun|clear/.test(f)) return 'sun';
  return 'partly';
}

/** Scripts a market wins in, as names (for accessible text). */
export function fitNames(fit: ScriptFit, set: ScriptSet): string {
  const yes = set.scripts.filter((_, i) => fit.fits[i] === 'yes').map((s) => s.name);
  const part = set.scripts.filter((_, i) => fit.fits[i] === 'part').map((s) => s.name);
  return [yes.length ? `wins in ${yes.join(', ')}` : 'wins in no script outright', part.length ? `partly in ${part.join(', ')}` : ''].filter(Boolean).join('; ');
}

export type { GameScript };
