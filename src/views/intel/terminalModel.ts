// The Intelligence Terminal's pure parts: layout presets, the board's type filters (only kinds the publications
// actually produce), the opponent-adjusted unit pairs of one game, the simulated game environment and the game's
// main market lines. Everything is read from published fields; nothing is smoothed, blended or filled in.
import type { EventResearchDoc, Observation, ResearchMarket } from '../../contract/types';
import { AREAS } from '../../insights/matchups';
import { gameSides, matchupObs, type GameSides } from '../../insights/game';
import { rankView } from '../../lib/rank';
import type { Discovery, DiscoveryKind, Significance } from '../../intelligence/discoveries';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Layout = 'discovery' | 'matchups' | 'markets';
export const LAYOUTS: { id: Layout; label: string; icon: string; sub: string }[] = [
  { id: 'discovery', label: 'Discovery', icon: 'layers', sub: 'The board first, every connected panel around the selection' },
  { id: 'matchups', label: 'Matchups', icon: 'compare', sub: 'Opponent-adjusted units and game scripts first' },
  { id: 'markets', label: 'Markets', icon: 'chart', sub: 'Prices, the publication’s fair and quote freshness first' },
];
export const isLayout = (v: unknown): v is Layout => v === 'discovery' || v === 'matchups' || v === 'markets';
/** Old workspace links (?ws=football / props / market) open the closest preset. */
export const layoutFromWorkspace = (ws: string | null): Layout | null => (ws === 'football' || ws === 'props' ? 'matchups' : ws === 'market' ? 'markets' : null);

export type PanelId = 'matchup' | 'projection' | 'scripts' | 'markets' | 'context' | 'evidence' | 'same' | 'compare';
/** Each preset's panels in reading order, with their span on the 12-column desktop grid. */
export const LAYOUT_PANELS: Record<Layout, { id: PanelId; span: 4 | 5 | 6 | 7 | 8 | 12 }[]> = {
  discovery: [
    { id: 'matchup', span: 4 }, { id: 'projection', span: 4 }, { id: 'scripts', span: 4 },
    { id: 'markets', span: 7 }, { id: 'context', span: 5 },
    { id: 'evidence', span: 6 }, { id: 'same', span: 6 }, { id: 'compare', span: 12 },
  ],
  matchups: [
    { id: 'matchup', span: 8 }, { id: 'scripts', span: 4 },
    { id: 'context', span: 6 }, { id: 'projection', span: 6 },
    { id: 'markets', span: 12 }, { id: 'evidence', span: 6 }, { id: 'same', span: 6 },
  ],
  markets: [
    { id: 'markets', span: 8 }, { id: 'projection', span: 4 },
    { id: 'compare', span: 12 },
    { id: 'context', span: 6 }, { id: 'evidence', span: 6 },
    { id: 'matchup', span: 6 }, { id: 'scripts', span: 6 }, { id: 'same', span: 12 },
  ],
};

/** The board's type filters. A chip is shown only when today's discoveries include that kind. */
export const TYPE_FILTERS: { kind: DiscoveryKind; label: string; short: string }[] = [
  { kind: 'mismatch', label: 'Mismatches', short: 'Mismatch' },
  { kind: 'market', label: 'Model vs market', short: 'Model vs market' },
  { kind: 'context', label: 'Lineup & context', short: 'Context' },
  { kind: 'model', label: 'Model evidence', short: 'Model' },
  { kind: 'freshness', label: 'Data freshness', short: 'Freshness' },
];
export const SHORT_KIND: Record<DiscoveryKind, string> = Object.fromEntries(TYPE_FILTERS.map((t) => [t.kind, t.short])) as Record<DiscoveryKind, string>;

export const SIG_BARS: Record<Significance, 1 | 2 | 3> = { high: 3, medium: 2, low: 1 };
export const SIG_SHORT: Record<Significance, string> = { high: 'High', medium: 'Med', low: 'Low' };

export function kindCounts(ds: Discovery[]): Map<DiscoveryKind, number> {
  const m = new Map<DiscoveryKind, number>();
  for (const d of ds) m.set(d.kind, (m.get(d.kind) ?? 0) + 1);
  return m;
}

export interface UnitSide {
  abbr: string;
  nick: string;
  unit: string;
  rank: number | null;
  of: number | null;
  tierWord: string | null;
  value: number | null;
}

export interface AreaPair {
  key: string;
  label: string;
  off: UnitSide;
  def: UnitSide;
}

function sideOf(obs: Observation | null, abbr: string, nick: string, unit: string): UnitSide {
  const rv = rankView(obs?.context);
  const usable = rv && rv.directional ? rv : null;
  return { abbr, nick, unit, rank: usable?.rank ?? null, of: usable?.of ?? null, tierWord: usable?.tierWord ?? null, value: obs?.value ?? null };
}

/**
 * Every opponent-adjusted area for one offense against the defense it faces, from the game's own matchup rows
 * (the same direction-aware league ranks the matchup insights use). Areas the publication does not rank are left
 * out; a side with no rank stays unranked, never estimated.
 */
export function areaPairs(r: EventResearchDoc, offenseAbbr: string, g: GameSides | null = gameSides(r)): AreaPair[] {
  if (!g) return [];
  const off = g.byAbbr(offenseAbbr);
  const def = g.opp(off.abbr);
  const out: AreaPair[] = [];
  for (const a of AREAS) {
    if (a.source !== 'matchup') continue;
    const o = sideOf(matchupObs(r, a.offense, off), off.abbr, off.nick, a.offUnit);
    const d = sideOf(matchupObs(r, a.defense, def), def.abbr, def.nick, a.defUnit);
    if (o.rank == null && d.rank == null) continue;
    out.push({ key: a.key, label: a.label, off: o, def: d });
  }
  return out;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && num(v[0]) != null && num(v[1]) != null ? [Number(v[0]), Number(v[1])] : null);

export interface Spread {
  mean: number;
  r50: [number, number];
  r90: [number, number];
}

export interface Environment {
  total: Spread | null;
  homeMargin: Spread | null;
  /** The market-implied centre the simulation was run around, when the publication says so. */
  centre: { total: number | null; homeMargin: number | null; source: string | null };
}

function spreadOf(v: any): Spread | null {
  const mean = num(v?.mean);
  const r50 = pair(v?.range_50);
  const r90 = pair(v?.range_90);
  return mean != null && r50 && r90 ? { mean, r50, r90 } : null;
}

/** The simulated game environment (NFL extensions.game_script_inputs.game_environment), or null when not published. */
export function gameEnvironment(r: EventResearchDoc | null | undefined): Environment | null {
  const env = (r?.extensions as any)?.game_script_inputs?.game_environment;
  if (!env || typeof env !== 'object') return null;
  const total = spreadOf(env.total);
  const homeMargin = spreadOf(env.home_margin);
  if (!total && !homeMargin) return null;
  return { total, homeMargin, centre: { total: num(env.centre?.total), homeMargin: num(env.centre?.home_margin), source: typeof env.centre?.source === 'string' ? env.centre.source : null } };
}

const MAIN_FAMILIES = ['game_winner', 'spread', 'total'];

/**
 * The game's main lines from its research document: both sides to win, then the spread and total contracts
 * whose market probability sits nearest 50% (the market's own centre). At most `n`, in that order.
 */
export function mainLines(r: EventResearchDoc | null | undefined, n = 6): ResearchMarket[] {
  if (!r) return [];
  const full = r.markets.filter((m) => MAIN_FAMILIES.includes(m.market_family) && (m.period == null || m.period === 'FULL') && !m.player_id);
  const winners = full.filter((m) => m.market_family === 'game_winner').slice(0, 2);
  const near = (fam: string, k: number) =>
    full
      .filter((m) => m.market_family === fam && m.market_probability != null)
      .sort((a, b) => Math.abs((a.market_probability as number) - 0.5) - Math.abs((b.market_probability as number) - 0.5))
      .slice(0, k);
  return [...winners, ...near('spread', 2), ...near('total', 2)].slice(0, n);
}

/** The publication's research fair probability for a market, when its projections carry one. */
export function researchFair(r: EventResearchDoc | null | undefined, marketId: string): number | null {
  const p = r?.projections.find((x) => x.market_id === marketId && x.fair_probability != null);
  return p?.fair_probability ?? null;
}
