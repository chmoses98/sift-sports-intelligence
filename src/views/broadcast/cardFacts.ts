// What a game card may say, read only from published fields (issues 2, 19, 21, 50):
//   records      NFL win–loss from the nflverse schedule's finals before the game's date (src/history/league.ts)
//   ranks        NFL opponent-adjusted offense / defense EPA-per-play league ranks, from the game's own research
//                (direction-aware context ranks; "of N" is the publication's own universe)
//   model        the research model's projected score (NFL model_view) or expected goals (NHL sim), labelled research
//   market       the market-implied spread and total (NFL), else the game-winner contracts' market probability
//   final        the published final score; against the spread from the published closing spread (never estimated)
//   tag          one contextual word: a major matchup mismatch, a division game, primetime, or a coin-flip market
//   edge         ONLY a validated indicator: an ACTIONABLE row, or the publication's top research candidate (tiers 2–3)
//                with its tier word; a judged game with neither reads "No edge"; a game nobody judged says nothing
// Each piece is null when its source is not published: a card never fills a gap.
import type { EventResearchDoc } from '../../contract/types';
import { gameSides, matchupObs } from '../../insights/game';
import { matchupInsights } from '../../insights/matchups';
import { betPhrase } from '../../lib/betWords';
import { rankView } from '../../lib/rank';
import type { Opportunity } from '../../opportunity/types';
import { atsOf, finalOf, resultLine, totalResultOf, type AtsResult, type LeagueGame, type TeamRecord } from '../../history/league';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RankChip { rank: number; of: number; /** What is ranked, in words (for titles). */ basis?: string }
export interface SideFacts {
  abbr: string;
  record: string | null;
  off: RankChip | null;
  def: RankChip | null;
  score: number | null;
  won: boolean | null;
}

export interface CardEdge {
  tone: 'back' | 'research' | 'noedge';
  word: string;
  /** The position in betting words, for a qualifying row. */
  text: string | null;
  /** The full basis, for the accessible name / title. */
  title: string;
}

export type TagKind = 'mismatch' | 'division' | 'primetime' | 'close';
export interface CardTag { kind: TagKind; text: string; title: string }

export interface CardFacts {
  away: SideFacts;
  home: SideFacts;
  final: { line: string; ats: AtsResult | null; total: ReturnType<typeof totalResultOf> } | null;
  model: { text: string; title: string } | null;
  market: { text: string; title: string } | null;
  tag: CardTag | null;
  edge: CardEdge | null;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const half = (v: number) => Math.round(v * 2) / 2;
const fmtPts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The opponent-adjusted offense/defense metrics a card ranks, per sport (only sports that publish them). */
export const CARD_RANKS: Record<string, { off: string; def: string; basis: string }> = {
  NFL: { off: 'met_nfl.adj_off_epa', def: 'met_nfl.adj_def_epa', basis: 'opponent-adjusted EPA per play' },
  NHL: { off: 'met_nhl.oa_xgf60_5v5', def: 'met_nhl.oa_xga60_5v5', basis: 'opponent-adjusted 5v5 expected goals per 60' },
};

/** One side's opponent-adjusted offense/defense league ranks, when the game's research carries them (direction-aware). */
export function sideRanks(r: EventResearchDoc | null | undefined, abbr: string | null | undefined, sport = 'NFL'): { off: RankChip | null; def: RankChip | null } {
  const spec = CARD_RANKS[sport];
  if (!r || !abbr || !spec) return { off: null, def: null };
  const g = gameSides(r);
  if (!g || (g.home.abbr !== abbr && g.away.abbr !== abbr)) return { off: null, def: null };
  const side = g.byAbbr(abbr);
  const chip = (metric: string): RankChip | null => {
    const v = rankView(matchupObs(r, metric, side)?.context);
    return v && v.directional ? { rank: v.rank, of: v.of, basis: spec.basis } : null;
  };
  return { off: chip(spec.off), def: chip(spec.def) };
}

/** Home line → "DET −5.5" (half-point rounded, as books quote it); "Pick’em" inside half a point. */
export function lineText(homeLine: number, away: string, home: string): string {
  const pts = half(Math.abs(homeLine));
  if (pts < 0.5) return 'Pick’em';
  return `${homeLine < 0 ? home : away} −${fmtPts(pts)}`;
}

/** The research model's read in a few characters, or null. NFL: projected score; NHL: expected goals. */
export function modelRead(sport: string, r: EventResearchDoc | null | undefined, away: string, home: string): CardFacts['model'] {
  const ext = (r?.extensions ?? {}) as any;
  if (sport === 'NFL') {
    const mv = ext.model_view;
    const a = num(mv?.model_score?.[away]);
    const h = num(mv?.model_score?.[home]);
    if (a == null || h == null) return null;
    return { text: `${away} ${Math.round(a)}–${Math.round(h)} ${home}`, title: `Research model${mv?.model_version ? ` ${mv.model_version}` : ''} projected score${mv?.caveat ? `. ${mv.caveat}` : ''}` };
  }
  if (sport === 'NHL') {
    const a = num(ext.sim?.away_lambda);
    const h = num(ext.sim?.home_lambda);
    if (a == null || h == null) return null;
    return { text: `${away} ${a.toFixed(1)}–${h.toFixed(1)} ${home}`, title: 'Research model expected goals (simulation means), not a calibrated forecast' };
  }
  return null;
}

/** The market's read: NFL market-implied spread and total; else the game-winner contract's market probability. */
export function marketRead(r: EventResearchDoc | null | undefined, away: string, home: string): CardFacts['market'] {
  if (!r) return null;
  const mi = (r.extensions as any)?.market_implied;
  const sp = num(mi?.implied_spread);
  const tot = num(mi?.implied_total_median);
  if (sp != null || tot != null) {
    const parts = [sp != null ? lineText(sp, away, home) : null, tot != null ? `O/U ${fmtPts(half(tot))}` : null].filter(Boolean);
    return { text: parts.join(' · '), title: 'Market-implied from Kalshi contract midpoints (research, not an executable price)' };
  }
  const g = gameSides(r);
  if (!g) return null;
  const win = (pid: string) => r.markets.find((m) => (m.market_family === 'game_winner' || m.market_family === 'game_moneyline') && m.participant_id === pid && (m.period == null || m.period === 'FULL' || m.period === 'full'));
  const h = num(win(g.home.pid)?.market_probability);
  const a = num(win(g.away.pid)?.market_probability);
  if (h == null && a == null) return null;
  const fav = h != null && (a == null || h >= a) ? { abbr: home, p: h } : { abbr: away, p: a! };
  return { text: `${fav.abbr} ${Math.round(fav.p * 100)}% to win`, title: 'Market probability of the game-winner contract at the publication’s capture (not an executable price)' };
}

/** The validated indicator, or "No edge" for a judged game, or null. Never a tier-4 signal or a pass dressed up. */
export function edgeOf(opps: Opportunity[]): CardEdge | null {
  if (!opps.length) return null;
  const act = opps.find((o) => o.status === 'ACTIONABLE');
  if (act) {
    const p = betPhrase(act.what.side, act.what.title).text;
    return { tone: 'back', word: 'Back', text: p, title: `Back: ${p}. The publication permits a bet at this price (${act.authority}).` };
  }
  const rc = opps.find((o) => o.status === 'RESEARCH_CANDIDATE' && o.rank.tier <= 3);
  if (rc) {
    const p = betPhrase(rc.what.side, rc.what.title).text;
    return { tone: 'research', word: rc.rank.tierWord, text: p, title: `${rc.rank.tierWord}: ${p}. Authority ${rc.authority || 'not stated'}; research, not a validated bet.` };
  }
  // A published watch signal (CFB Value Watch) is neither validated nor "no edge": the card stays quiet about it.
  if (opps.some((o) => o.status === 'WATCH')) return null;
  return { tone: 'noedge', word: 'No edge', text: null, title: 'The publication judged this game and nothing qualifies as a validated bet or a research candidate.' };
}

const PRIME = (timeEt: string | null | undefined) => !!timeEt && timeEt >= '19:30';

/** One contextual tag, in a fixed priority order. */
export function tagOf(sport: string, r: EventResearchDoc | null | undefined, league: LeagueGame | null, market: { home: number | null } | null): CardTag | null {
  if (sport === 'NFL' && r) {
    const ins = matchupInsights(r).find((i) => i.size === 'major');
    if (ins) return { kind: 'mismatch', text: `Mismatch · ${ins.headline.replace(/\s+(has|have) an? (major|clear) edge$/i, '')}`, title: `${ins.headline}: ${ins.offense.team.abbr} ${ins.offense.unit} #${ins.offense.rank.rank} vs ${ins.defense.team.abbr} ${ins.defense.unit} #${ins.defense.rank.rank} (opponent-adjusted). A matchup read, not a bet.` };
  }
  if (league && !finalOf(league)) {
    if (league.div) return { kind: 'division', text: 'Division game', title: 'Division rivals (nflverse schedule)' };
    if (PRIME(league.time_et)) return { kind: 'primetime', text: 'Primetime', title: `Kickoff ${league.time_et} ET (nflverse schedule)` };
  }
  if (market?.home != null && Math.abs(market.home - 0.5) < 0.05) return { kind: 'close', text: 'Coin flip', title: 'The market prices both sides within five points of 50%' };
  return null;
}

function marketHomeWin(r: EventResearchDoc | null | undefined): number | null {
  if (!r) return null;
  const mi = (r.extensions as any)?.market_implied;
  const g = gameSides(r);
  if (!g) return null;
  const v = num(mi?.win_probability?.[g.home.abbr]);
  if (v != null) return v;
  const m = r.markets.find((x) => (x.market_family === 'game_winner' || x.market_family === 'game_moneyline') && x.participant_id === g.home.pid && (x.period == null || x.period === 'FULL'));
  return num(m?.market_probability);
}

export interface FactsInput {
  sport: string;
  away: string;
  home: string;
  research?: EventResearchDoc | null;
  league?: LeagueGame | null;
  records?: Map<string, TeamRecord> | null;
  opps?: Opportunity[];
  /** Whether the game has started or finished (no pregame tag, no pregame edge). */
  over?: boolean;
}

export function cardFacts(x: FactsInput): CardFacts {
  const r = x.research ?? null;
  const lg = x.league ?? null;
  const fin = lg ? finalOf(lg) : null;
  const side = (abbr: string, isHome: boolean): SideFacts => {
    const rk = sideRanks(r, abbr, x.sport);
    const score = fin ? (isHome ? fin.home : fin.away) : null;
    return { abbr, record: x.records?.get(abbr)?.text ?? null, off: rk.off, def: rk.def, score, won: fin ? (fin.winner == null ? null : fin.winner === abbr) : null };
  };
  const over = !!x.over || !!fin;
  return {
    away: side(x.away, false),
    home: side(x.home, true),
    final: fin && lg ? { line: resultLine(lg) ?? '', ats: atsOf(lg), total: totalResultOf(lg) } : null,
    model: over ? null : modelRead(x.sport, r, x.away, x.home),
    market: over ? null : marketRead(r, x.away, x.home),
    tag: over ? null : tagOf(x.sport, r, lg, { home: marketHomeWin(r) }),
    edge: over ? null : edgeOf(x.opps ?? []),
  };
}
