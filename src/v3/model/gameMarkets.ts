// Game and team markets as research rows (pure). One game's published Kalshi contracts are grouped into the families a viewer thinks in (game total,
// team total, spread, moneyline, period winner) and, for the families that have a ladder, into rungs: "CHI scores at least 18" is the 17.5 line.
// Each group names the evidence that can honestly stand beside it (last games' scoring, margins, results from the team profiles) or says why none can
// (no per-period scoring history is published for football). Whether a price may be SHOWN is the quote gate's decision, never made here.
import type { Market } from '../../contract/types';
import { isTradableWord } from './marketStatus';

export type MarketKind = 'total' | 'team_total' | 'spread' | 'moneyline' | 'period_winner';
export interface Rung { k: number; ticker: string; askCents: number | null; capturedAt: string | null; status: string | null }
export interface MarketGroup {
  key: string;
  kind: MarketKind;
  /** 'FULL', '1H', '2H', '1Q', ... */
  period: string;
  /** The team a team total or spread is about, from the contract's own participant. */
  side: 'away' | 'home' | null;
  title: string;
  /** Ladder rungs ascending (empty for a moneyline or period winner, which are single contracts per side). */
  rungs: Rung[];
  /** The rung nearest a coin flip at the captured ask; the lower one on a tie. */
  featured: number | null;
  /** Single contracts (moneyline, period winner): one per side and a possible tie. */
  singles: { label: string; side: 'away' | 'home' | 'tie'; ticker: string; askCents: number | null }[];
  /** True for the full game. */
  full: boolean;
}

const cents = (d: number | null | undefined) => (d == null || !Number.isFinite(d) || d <= 0 || d >= 1 ? null : Math.round(d * 100));
const ext = (m: Market) => (m.extensions ?? {}) as { operator?: string | null; subject?: string | null };

export function periodOf(m: Market): string {
  const p = (m.period ?? 'FULL').toUpperCase().replace(/\s+/g, '_');
  if (p === 'FULL' || p === 'FULL_GAME') return 'FULL';
  if (p === 'FIRST_HALF') return '1H';
  if (p === 'SECOND_HALF') return '2H';
  return p;
}

const KIND_OF: Record<string, MarketKind | undefined> = {
  total: 'total', game_total: 'total', period_total: 'total', first_half_total: 'total',
  team_total: 'team_total', period_team_total: 'team_total',
  spread: 'spread', game_spread: 'spread', period_spread: 'spread', first_half_spread: 'spread',
  game_winner: 'moneyline', game_moneyline: 'moneyline', moneyline: 'moneyline', first_half_moneyline: 'moneyline',
  period_winner: 'period_winner',
};

/** The count a rung settles on: "at least k" (>=, threshold k) or "more than k - 0.5" (>, threshold k - 0.5). */
export function rungK(m: Market): number | null {
  const t = m.threshold ?? m.line;
  if (t == null || !Number.isFinite(t)) return null;
  const op = ext(m).operator;
  if (op === '>=') return t;
  return Number.isInteger(t) ? t : Math.floor(t) + 1;
}

const PERIOD_WORD: Record<string, string> = { FULL: '', '1H': '1st half ', '2H': '2nd half ', '1Q': '1st quarter ', '2Q': '2nd quarter ', '3Q': '3rd quarter ', '4Q': '4th quarter ' };
const KIND_ORDER: MarketKind[] = ['moneyline', 'spread', 'total', 'team_total', 'period_winner'];

export interface GameCtx { awayId: string | null; homeId: string | null; awayName: string; homeName: string }

/** The game's non-player markets, grouped. Withheld statuses (closed, suspended, unknown words) are not listed (model/marketStatus.ts). */
export function parseGameMarkets(markets: Market[] | undefined, g: GameCtx): MarketGroup[] {
  const groups = new Map<string, MarketGroup>();
  const seen = new Set<string>();
  const sideOf = (m: Market): 'away' | 'home' | null => (m.participant_id && m.participant_id === g.awayId ? 'away' : m.participant_id && m.participant_id === g.homeId ? 'home' : null);
  for (const m of markets ?? []) {
    const kind = KIND_OF[m.market_family];
    if (!kind || seen.has(m.kalshi_ticker) || !isTradableWord(m.market_status)) continue;
    seen.add(m.kalshi_ticker);
    const period = periodOf(m);
    const side = sideOf(m);
    const ladder = kind === 'total' || kind === 'team_total' || kind === 'spread';
    const key = ladder ? `${kind}:${period}:${side ?? ''}` : `${kind}:${period}`;
    let grp = groups.get(key);
    if (!grp) {
      const nm = side === 'away' ? g.awayName : side === 'home' ? g.homeName : '';
      const pw = PERIOD_WORD[period] ?? `${period} `;
      const title = kind === 'total' ? `${pw}game total` : kind === 'team_total' ? `${nm} ${pw}team total`.replace(/\s+/g, ' ').trim()
        : kind === 'spread' ? `${nm} ${pw}margin`.replace(/\s+/g, ' ').trim() : kind === 'moneyline' ? `${pw}moneyline`.trim() : `${pw}winner`.trim();
      grp = { key, kind, period, side, title: title[0].toUpperCase() + title.slice(1), rungs: [], featured: null, singles: [], full: period === 'FULL' };
      groups.set(key, grp);
    }
    if (ladder) {
      const k = rungK(m);
      if (k == null || grp.rungs.some((r) => r.k === k)) continue;
      grp.rungs.push({ k, ticker: m.kalshi_ticker, askCents: cents(m.yes_ask), capturedAt: m.captured_at ?? null, status: m.market_status ?? null });
    } else {
      const s = sideOf(m);
      const who = s === 'away' ? g.awayName : s === 'home' ? g.homeName : 'Tie';
      grp.singles.push({ label: who, side: s ?? 'tie', ticker: m.kalshi_ticker, askCents: cents(m.yes_ask) });
    }
  }
  const out = [...groups.values()];
  for (const grp of out) {
    grp.rungs.sort((a, b) => a.k - b.k);
    const priced = grp.rungs.filter((r) => r.askCents != null);
    const pool = priced.length ? priced : grp.rungs;
    grp.featured = pool.length ? [...pool].sort((a, b) => Math.abs((a.askCents ?? 50) - 50) - Math.abs((b.askCents ?? 50) - 50) || a.k - b.k)[0].k : null;
  }
  return out.sort((a, b) => Number(b.full) - Number(a.full) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.period.localeCompare(b.period) || (a.side ?? '').localeCompare(b.side ?? ''));
}

export interface Result { for: number; against: number; outcome: 'W' | 'L' | 'T'; date: string; opp: string }
export interface EvidenceSeries { label: string; values: number[]; team: 'away' | 'home' | null }
export type Evidence =
  | { state: 'ready'; unit: string; series: EvidenceSeries[]; note: string }
  | { state: 'none'; reason: string };

/** Last-N scoring evidence for a group, from the two teams' completed games this season (newest first in, oldest first out). */
export function evidenceFor(grp: MarketGroup, away: Result[], home: Result[], n = 8): Evidence {
  if (!grp.full && grp.kind !== 'moneyline') {
    return { state: 'none', reason: `The publication has no ${grp.period === '1H' || grp.period === '2H' ? 'half' : 'quarter'}-by-${grp.period === '1H' || grp.period === '2H' ? 'half' : 'quarter'} scoring history for either team, so this market shows price and scenario only.` };
  }
  const take = (r: Result[]) => r.slice(0, n).reverse();
  const a = take(away), h = take(home);
  if (!a.length && !h.length) return { state: 'none', reason: 'No completed games this season are published for these teams yet.' };
  if (grp.kind === 'total') {
    return { state: 'ready', unit: 'combined points', note: 'Combined points in each team’s last games (both teams’ games, not head-to-head).',
      series: [{ label: 'Away team’s games', values: a.map((r) => r.for + r.against), team: 'away' }, { label: 'Home team’s games', values: h.map((r) => r.for + r.against), team: 'home' }] };
  }
  if (grp.kind === 'team_total' && grp.side) {
    const r = grp.side === 'away' ? a : h;
    return { state: 'ready', unit: 'points scored', note: 'Points scored in the team’s last games.', series: [{ label: 'Points scored', values: r.map((x) => x.for), team: grp.side }] };
  }
  if (grp.kind === 'spread' && grp.side) {
    const r = grp.side === 'away' ? a : h;
    return { state: 'ready', unit: 'margin', note: 'Final margin (points for minus against) in the team’s last games; negative is a loss.', series: [{ label: 'Margin', values: r.map((x) => x.for - x.against), team: grp.side }] };
  }
  if (grp.kind === 'moneyline') {
    return { state: 'ready', unit: 'margin', note: 'Final margins in each team’s last games; above zero is a win.',
      series: [{ label: 'Away team', values: a.map((x) => x.for - x.against), team: 'away' }, { label: 'Home team', values: h.map((x) => x.for - x.against), team: 'home' }] };
  }
  return { state: 'none', reason: 'No scoring history applies to this market.' };
}

/** How many of the values clear the rung (>= k for totals and team totals; margin >= k for a spread; > 0 for the moneyline). */
export function clears(kind: MarketKind, values: number[], k: number): { hit: number; n: number } {
  const ok = kind === 'moneyline' ? (v: number) => v > 0 : (v: number) => v >= k;
  return { hit: values.filter(ok).length, n: values.length };
}

/** The rung's plain words: "CHI scores at least 18", "Total points at least 44", "SEA wins by 8 or more". */
export function rungWords(grp: MarketGroup, k: number, teamName: string): string {
  if (grp.kind === 'total') return `Total points: ${k} or more`;
  if (grp.kind === 'team_total') return `${teamName} scores ${k} or more`;
  if (grp.kind === 'spread') return `${teamName} wins by ${k} or more`;
  return grp.title;
}

/**
 * Is a team profile's season THIS season and recently published? Evidence from a profile that is not is never charted as "last games": the NBA publication,
 * for one, still carries 2025-26 (as of 2026-06-14), and its "last 8" would be last spring's. `season` is "2026-27" or "2026"; only its start year is compared.
 */
export function profileCurrent(p: { season: string | null; asOf: string | null } | null | undefined, now: number): { ok: boolean; reason: string | null } {
  if (!p) return { ok: false, reason: 'The team statistics are not loaded.' };
  const d = new Date(now);
  const startYear = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const profYear = Number((p.season ?? '').slice(0, 4));
  if (!Number.isFinite(profYear) || profYear !== startYear) return { ok: false, reason: `The published team statistics are for ${p.season ?? 'an unknown season'}${p.asOf ? `, as of ${p.asOf.slice(0, 10)}` : ''}, not this season, so no recent results are charted.` };
  const t = p.asOf ? Date.parse(p.asOf) : NaN;
  if (!Number.isFinite(t) || now - t > 7 * 86_400_000) return { ok: false, reason: `The published team statistics date from ${p.asOf ? p.asOf.slice(0, 10) : 'an unknown day'}, so no recent results are charted.` };
  return { ok: true, reason: null };
}
