// Real-publication adapters: board rows and event documents -> the v3 view-model. Nothing is invented here: a field the
// publication does not state stays null and the screen says so. Lines are Kalshi contract ladders (never sportsbook
// consensus), reduced to the one nearest 50¢ for the compact chip and kept whole for the market sheet.
import type { BoardItem, Market } from '../../contract/types';
import type { GameRow } from '../../views/broadcast/games';
import { heroTeam } from '../../lib/hero/input';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFor, heroInputForTeam } from '../../lib/hero/input';
import type { EventResearchDoc } from '../../contract/types';
import { cents } from '../model/format';
import type { MarketLine, Phase, Price, V3Game, V3Team } from '../model/types';

type Participant = BoardItem['participants'][number];

/** Initials for a participant the publication gives no code for (clubs, tennis players): "Real Madrid" -> "RM", "Mitsuki Leong" -> "LEO". */
function codeFromName(name: string, individual: boolean): string {
  const words = name.replace(/[^\p{L}\s'-]/gu, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '—';
  if (individual) return words[words.length - 1].slice(0, 3).toUpperCase();
  return (words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 3)).toUpperCase();
}

export function toTeam(sport: string, slug: string, p: Participant | undefined, fallback: string): V3Team {
  const named = p?.short_name ?? null;
  const code = named ?? p?.participant_id ?? fallback;
  const h = named ? heroTeam(sport, named, p?.display_name ?? named) : null;
  const name = h?.name ?? p?.display_name ?? code;
  return {
    id: code, slug, sport, name,
    nick: h?.short ?? name,
    abbr: named ?? codeFromName(name, sport === 'TENNIS'),
    logo: h?.logo ?? null,
    colors: h?.colors ?? ['#1d2d52', '#3f5079'],
  };
}

function phaseOf(g: GameRow): Phase {
  if (g.phase === 'FINAL') return 'final';
  if (g.phase === 'STARTED') return g.stale ? 'other' : 'live';
  if (g.phase === 'PREGAME' || g.phase === 'NO_START') return 'pregame';
  return 'other';
}

/** A slate row as the view-model, before its per-game documents are read (no lines, no score yet). */
export function toGame(g: GameRow): V3Game {
  const away = toTeam(g.sport, g.slug, g.away, 'AWAY');
  const home = toTeam(g.sport, g.slug, g.home, 'HOME');
  return {
    key: `${g.slug}:${g.item.event_id}`,
    slug: g.slug, sport: g.sport, eventId: g.item.event_id, league: g.item.competition ?? g.item.league ?? g.sport,
    phase: phaseOf(g), startMs: g.startMs, network: null,
    away, home, score: null, lines: [], signals: g.candidates, provenance: 'publication', item: g.item,
  };
}

// ---------------------------------------------------------------- Kalshi ladders -> compact lines

const OPEN = (m: Market) => !m.market_status || /^(OPEN|ACTIVE|UNOPENED)$/i.test(m.market_status);
/** The full-game contract (publications spell the period "FULL", "FULL_GAME", "full_game" or leave it out). */
const FULL = (m: Market) => m.period == null || /^full(_game)?$/i.test(m.period);

export function priceOf(m: Market): Price {
  const ask = cents(m.yes_ask);
  const bid = cents(m.yes_bid);
  const mid = ask != null && bid != null ? (ask + bid) / 2 : ask;
  return {
    ask, bid,
    implied: m.market_probability != null ? Math.round(m.market_probability * 1000) / 10 : mid,
    ticker: m.kalshi_ticker, side: 'YES', description: m.yes_description,
    observedAt: m.captured_at, source: 'Kalshi', volume: m.volume ?? null,
  };
}

const nearHalf = (m: Market) => Math.abs((m.market_probability ?? (m.yes_ask ?? 0)) - 0.5);

/** The line a spread contract is struck at: "wins by more than 9.5" is a 9.5 spread. */
const spreadLine = (m: Market): number | null => (m.threshold != null && m.threshold > 0 ? m.threshold : m.line);

/** A `total_points >= 45` contract is "over 44.5"; "Over 203.5" (published `line`) is already a half-point line. */
function totalLine(m: Market): number | null {
  const mm = /(>=|>)\s*(-?\d+(?:\.\d+)?)/.exec(m.yes_description);
  if (mm) { const t = Number(mm[2]); return mm[1] === '>=' && Number.isInteger(t) ? t - 0.5 : t; }
  const t = m.line ?? m.threshold;
  return t != null && Number.isFinite(t) ? t : null;
}

const fmtLine = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function deriveLines(markets: Market[], away: V3Team, home: V3Team, partIds: { away: string | null; home: string | null }): MarketLine[] {
  const open = markets.filter((m) => OPEN(m) && m.yes_ask != null && FULL(m));
  const out: MarketLine[] = [];
  const spreads = open.filter((m) => /^(game_)?spread$/.test(m.market_family) && spreadLine(m) != null);
  if (spreads.length) {
    const best = [...spreads].sort((a, b) => nearHalf(a) - nearHalf(b))[0];
    const team = best.participant_id === partIds.home ? home : best.participant_id === partIds.away ? away : null;
    if (team) {
      out.push({ kind: 'spread', label: `${team.abbr} −${fmtLine(spreadLine(best)!)}`, price: priceOf(best), line: spreadLine(best), teamId: team.id, alternates: [...spreads].sort((a, b) => (a.participant_id ?? '').localeCompare(b.participant_id ?? '') || spreadLine(a)! - spreadLine(b)!).map(priceOf) });
    }
  }
  const totals = open.filter((m) => /^(game_)?total$/.test(m.market_family) && totalLine(m) != null);
  if (totals.length) {
    const best = [...totals].sort((a, b) => nearHalf(a) - nearHalf(b))[0];
    const ln = totalLine(best)!;
    out.push({ kind: 'total', label: `O/U ${fmtLine(ln)}`, price: priceOf(best), line: ln, alternates: [...totals].sort((a, b) => totalLine(a)! - totalLine(b)!).map(priceOf) });
  }
  const ml = open.filter((m) => /^(game_)?(moneyline|winner)$/.test(m.market_family) && m.participant_id);
  if (ml.length) {
    const a = ml.find((m) => m.participant_id === partIds.away);
    const h = ml.find((m) => m.participant_id === partIds.home);
    const pick = [a, h].filter(Boolean) as Market[];
    if (pick.length) {
      const fav = [...pick].sort((x, y) => (y.market_probability ?? y.yes_ask ?? 0) - (x.market_probability ?? x.yes_ask ?? 0))[0];
      const team = fav.participant_id === partIds.home ? home : away;
      out.push({ kind: 'moneyline', label: `${team.abbr} to win`, price: priceOf(fav), line: null, teamId: team.id, alternates: pick.map(priceOf) });
    }
  }
  return out;
}

export function photoFor(item: BoardItem, sport: string, research: EventResearchDoc | null | undefined): V3Game['photo'] {
  try {
    const spec = resolveHero(heroInputFor(item, research ?? null, sport));
    const p = spec.photo;
    if (!p) return null;
    const big = [...p.srcset].filter((s) => s.w <= 1200).sort((a, b) => b.w - a.w)[0] ?? p.srcset[0];
    return { src: big?.src ?? p.card, srcset: p.srcset.map((s) => `${s.src} ${s.w}w`).join(', '), focus: p.focus.mobile, credit: `${p.credit.artist} · ${p.credit.license}` };
  } catch { return null; }
}

// ---------------------------------------------------------------- player props from the same event document

export interface PropRow {
  key: string;
  player: string;
  playerId: string | null;
  stat: string;
  statLabel: string;
  /** The main line: the ladder rung nearest 50¢ ("receiving yards over 59.5"). */
  line: number;
  price: Price;
  ladder: Price[];
  /** The same ladder with each contract's own numeric line ("receptions over 6.5" is the 7+ rung), lowest first. */
  rungs: { line: number; price: Price }[];
  teamAbbr: string | null;
}

const STAT_WORDS: Record<string, string> = {
  pts: 'Points', reb: 'Rebounds', ast: 'Assists', fg3m: '3-pointers', pra: 'Pts + reb + ast', stl: 'Steals', double_double: 'Double-double', receiving_yards: 'Receiving yards', receptions: 'Receptions', rushing_yards: 'Rushing yards', touchdowns: 'Touchdowns', passing_yards: 'Passing yards',
  passing_tds: 'Passing TDs', fantasy_points: 'Fantasy points', longest_reception: 'Longest reception', points: 'Points', rebounds: 'Rebounds', assists: 'Assists',
  threes: '3-pointers', goals: 'Goals', shots: 'Shots', hits: 'Hits', strikeouts: 'Strikeouts', total_bases: 'Total bases',
};
export const statWord = (s: string) => STAT_WORDS[s] ?? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

type MktExt = { stat?: string | null; subject?: string | null; subject_kind?: string | null; operator?: string | null; player_display_name?: string | null; entity_name?: string | null; comparator?: string | null };

/** The player a prop contract is about, as the publications name it ("subject", "player_display_name", "entity_name", or "Name: 1+ assists"). */
function propSubject(m: Market): string | null {
  const x = (m.extensions ?? {}) as MktExt;
  return x.subject ?? x.player_display_name ?? x.entity_name ?? (/^(.+?):/.exec(m.yes_description)?.[1] ?? null);
}

const propLine = (m: Market): number | null => {
  const x = (m.extensions ?? {}) as MktExt;
  if (m.line != null) return m.line;
  if (m.threshold == null) return null;
  return x.operator === '>=' && Number.isInteger(m.threshold) ? m.threshold - 0.5 : m.threshold;
};

/** Player-stat contracts grouped by player and stat; each group's ladder, with the main line nearest 50¢. */
export function deriveProps(markets: Market[]): PropRow[] {
  const groups = new Map<string, Market[]>();
  for (const m of markets) {
    const x = (m.extensions ?? {}) as MktExt;
    if (!/^(player|hitter|pitcher)_/.test(m.market_family) || m.market_family === 'player_unknown' || !x.stat || m.yes_ask == null || !OPEN(m) || propLine(m) == null || !FULL(m)) continue;
    if (x.subject_kind && x.subject_kind !== 'player') continue;
    const who = propSubject(m);
    if (!who) continue;
    const k = `${m.player_id ?? who}|${x.stat}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const rows: PropRow[] = [];
  for (const [key, ms] of groups) {
    const x = (ms[0].extensions ?? {}) as MktExt;
    const sorted = [...ms].sort((a, b) => propLine(a)! - propLine(b)!);
    const main = [...ms].sort((a, b) => nearHalf(a) - nearHalf(b))[0];
    rows.push({ key, player: propSubject(ms[0])!, playerId: ms[0].player_id, stat: x.stat!, statLabel: statWord(x.stat!), line: propLine(main)!, price: priceOf(main), ladder: sorted.map(priceOf), rungs: sorted.map((m) => ({ line: propLine(m)!, price: priceOf(m) })), teamAbbr: null });
  }
  return rows.sort((a, b) => Math.abs((a.price.ask ?? 0) - 50) - Math.abs((b.price.ask ?? 0) - 50) || a.player.localeCompare(b.player));
}

/** A club's own verified home-venue photograph (src/lib/hero), or null for the logo-led layout. */
export function teamPhoto(sport: string, code: string, name: string, date: string): V3Game['photo'] {
  try {
    const spec = resolveHero(heroInputForTeam(sport, code, name, date));
    const p = spec.photo;
    if (!p) return null;
    const big = [...p.srcset].filter((s) => s.w <= 1200).sort((a, b) => b.w - a.w)[0] ?? p.srcset[0];
    return { src: big?.src ?? p.card, srcset: p.srcset.map((s) => `${s.src} ${s.w}w`).join(', '), focus: p.focus.mobile, credit: `${p.credit.artist} · ${p.credit.license}` };
  } catch { return null; }
}
