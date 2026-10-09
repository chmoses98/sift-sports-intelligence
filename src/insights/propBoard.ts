// THE PROP BOARD — every NFL player prop of a game as one row per player and stat, grouped by family
// (passing, rushing, receiving, touchdowns), with what the publication actually knows about each:
//
//   WHAT          the player, the stat, the market's main line (the rung nearest a coin flip) and its ladder
//   WHY           where the simulation's projection sits against that line, and the matchup behind the stat
//   EVIDENCE      the projected range (5th–95th and the middle half), the shadow model's P(over) next to the
//                 market's, and (in the view) the player's last games against today's line
//   PRICE         the executable over and under asks and the fee-aware break-even of each (Kalshi schedule)
//   CONFIDENCE    always research: the publication's own scorecard shows its pricing redundant to the closing
//                 market on player props, and every shadow row is PROJECTABLE_NOT_YET_VALIDATED
//   RISK          injury designation, a range that straddles the line, a thin or wide quote, no simulation
//   ALTERNATIVES  the other rungs of the same ladder with their prices
//
// Nothing here is a pick. There is no bet-up-to, no fair price presented as a limit, and the "read" words
// ("sim above the line") describe where a published projection sits, never a probability of its own.
import type { EventDetailDoc, EventResearchDoc, Market, ModelPrice } from '../contract/types';
import { describeMarket, overLine } from '../lib/marketLabel';
import { isFullGame } from '../lib/period';
import { rankView, type RankView } from '../lib/rank';
import { breakEven, kalshiFee } from '../opportunity/pricing';
import { nameKey } from './context';
import { gameSides, matchupObs, type GameSides, type Side } from './game';
import { mainLine, rangeOf, type PropRange } from './props';

export type PropFamily = 'passing' | 'rushing' | 'receiving' | 'touchdowns' | 'other';
export const PROP_FAMILY_ORDER: PropFamily[] = ['passing', 'rushing', 'receiving', 'touchdowns', 'other'];
export const PROP_FAMILY_LABEL: Record<PropFamily, string> = { passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', touchdowns: 'Touchdowns', other: 'Other' };

export interface PropStatDef {
  stat: string;
  label: string;
  /** Unit word for values ("yds", "rec", "TD"). */
  unit: string;
  family: PropFamily;
  /** The simulation distribution metric for this stat, when the publication simulates it. */
  sim: string | null;
  /** The opposing unit whose rank bears on this stat. */
  def: string | null;
  defUnit: string | null;
  /** Positions this stat is read for (others are skipped: a receiver's passing line is noise). */
  positions: string[] | null;
  /** A value is a count (whole numbers) rather than yards. */
  count: boolean;
}

const QB = ['QB'];
const SKILL = ['RB', 'WR', 'TE', 'FB', 'QB'];
export const PROP_STAT_DEFS: PropStatDef[] = [
  { stat: 'passing_yards', label: 'Passing yards', unit: 'yds', family: 'passing', sim: 'met_nfl.sim_passing_yards', def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: QB, count: false },
  { stat: 'attempts', label: 'Pass attempts', unit: 'att', family: 'passing', sim: 'met_nfl.sim_attempts', def: null, defUnit: null, positions: QB, count: true },
  { stat: 'completions', label: 'Completions', unit: 'cmp', family: 'passing', sim: 'met_nfl.sim_completions', def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: QB, count: true },
  { stat: 'passing_tds', label: 'Passing TDs', unit: 'TD', family: 'passing', sim: 'met_nfl.sim_passing_tds', def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: QB, count: true },
  { stat: 'interceptions', label: 'Interceptions thrown', unit: 'INT', family: 'passing', sim: 'met_nfl.sim_interceptions', def: null, defUnit: null, positions: QB, count: true },
  { stat: 'rushing_yards', label: 'Rushing yards', unit: 'yds', family: 'rushing', sim: 'met_nfl.sim_rushing_yards', def: 'met_nfl.adj_def_rush_epa', defUnit: 'run defense', positions: SKILL, count: false },
  { stat: 'carries', label: 'Carries', unit: 'car', family: 'rushing', sim: 'met_nfl.sim_carries', def: null, defUnit: null, positions: ['RB', 'FB', 'QB'], count: true },
  { stat: 'longest_rush', label: 'Longest rush', unit: 'yds', family: 'rushing', sim: null, def: 'met_nfl.adj_def_rush_epa', defUnit: 'run defense', positions: SKILL, count: false },
  { stat: 'receiving_yards', label: 'Receiving yards', unit: 'yds', family: 'receiving', sim: 'met_nfl.sim_receiving_yards', def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: ['WR', 'TE', 'RB', 'FB'], count: false },
  { stat: 'receptions', label: 'Receptions', unit: 'rec', family: 'receiving', sim: 'met_nfl.sim_receptions', def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: ['WR', 'TE', 'RB', 'FB'], count: true },
  { stat: 'longest_reception', label: 'Longest reception', unit: 'yds', family: 'receiving', sim: null, def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense', positions: ['WR', 'TE', 'RB', 'FB'], count: false },
  { stat: 'rush_rec_yards', label: 'Rush + rec yards', unit: 'yds', family: 'other', sim: null, def: null, defUnit: null, positions: SKILL, count: false },
  { stat: 'touchdowns', label: 'Touchdowns', unit: 'TD', family: 'touchdowns', sim: 'met_nfl.sim_touchdowns', def: 'met_nfl.adj_def_rz_epa', defUnit: 'red-zone defense', positions: null, count: true },
  { stat: 'fantasy_points', label: 'Fantasy points', unit: 'pts', family: 'other', sim: null, def: null, defUnit: null, positions: null, count: false },
  { stat: 'field_goals', label: 'Field goals', unit: 'FG', family: 'other', sim: null, def: null, defUnit: null, positions: null, count: true },
];
export const propStatDef = (stat: string | null | undefined) => PROP_STAT_DEFS.find((s) => s.stat === stat) ?? null;

/** The shadow model's own word for a priced row (publication field, never reinterpreted). */
export type ShadowState = 'PROJECTABLE_NOT_YET_VALIDATED' | 'PRICED' | 'DATA_UNAVAILABLE' | string;

export interface Rung {
  market: Market;
  threshold: number;
  /** The over line in market words ("79.5"). */
  line: string;
  yesBid: number | null;
  yesAsk: number | null;
  noAsk: number | null;
  /** The market's own probability for YES (publication field, else the mid). */
  marketP: number | null;
  /** The shadow model's P(YES) for this rung, with the model's own support word. Research only. */
  modelP: number | null;
  modelState: ShadowState | null;
}

export type PropRead = 'ABOVE' | 'BELOW' | 'ON' | 'NO_SIM' | 'NO_LINE';
export const PROP_READ_WORD: Record<PropRead, string> = {
  ABOVE: 'Sim above the line', BELOW: 'Sim below the line', ON: 'Sim on the line', NO_SIM: 'No simulation', NO_LINE: 'No priced line',
};

export interface PropRow {
  id: string;
  playerId: string;
  name: string;
  role: string | null;
  team: Side;
  opp: Side;
  def: PropStatDef;
  family: PropFamily;
  /** The simulation's mean and range, when it simulates this stat. For touchdowns the mean is expected TDs. */
  projection: number | null;
  range: PropRange | null;
  /** The main line (rung nearest a coin flip), when a two-sided quote exists. */
  main: Rung | null;
  line: number | null;
  ladder: Rung[];
  read: PropRead;
  /** How far the projection sits from the line in units of the typical range's width (0 = on it). */
  separation: number | null;
  matchup: { label: string; rank: RankView; metricId: string } | null;
  /** Fee-aware break-even for each side of the main line, from the Kalshi general schedule. */
  price: { overAsk: number | null; underAsk: number | null; overBreakEven: number | null; underBreakEven: number | null; spread: number | null } | null;
  /** Plain risks, from publication facts only. */
  risks: string[];
  /** The player's injury designation when listed (QUESTIONABLE, DOUBTFUL, OUT…). */
  injury: string | null;
  /** Ordering key, higher first. */
  interest: number;
  /** Plain reasons this prop is worth reading (why). */
  reasons: string[];
  marketTitle: string | null;
}

export interface PropBoard {
  rows: PropRow[];
  byFamily: Record<PropFamily, number>;
  /** Players the publication lists OUT / IR / DOUBTFUL / SUSPENDED: their props are hidden, listed here. */
  sidelined: { name: string; status: string }[];
}

const mid = (m: Pick<Market, 'yes_bid' | 'yes_ask'>) => (m.yes_bid != null && m.yes_ask != null && m.yes_ask > 0 ? (m.yes_bid + m.yes_ask) / 2 : null);
const ask = (v: number | null | undefined) => (v == null || v <= 0 || v >= 1 ? null : v);

function shadowOf(mp: ModelPrice | undefined, m: Market): { p: number | null; state: ShadowState | null } {
  const ext = (mp?.extensions ?? null) as { shadow_v2?: { p_yes?: number | null; support_state?: string | null } } | null;
  const mext = (m.extensions ?? null) as { shadow_v2_p_yes?: number | null } | null;
  const p = ext?.shadow_v2?.p_yes ?? mext?.shadow_v2_p_yes ?? null;
  const state = ext?.shadow_v2?.support_state ?? (p != null ? 'PROJECTABLE_NOT_YET_VALIDATED' : null);
  return { p: typeof p === 'number' && Number.isFinite(p) ? p : null, state };
}

function rungOf(m: Market, prices: Map<string, ModelPrice>): Rung | null {
  if (m.threshold == null) return null;
  const sh = shadowOf(prices.get(m.market_id), m);
  return {
    market: m, threshold: m.threshold, line: overLine(m.threshold),
    yesBid: m.yes_bid ?? null, yesAsk: ask(m.yes_ask), noAsk: ask(m.no_ask),
    marketP: m.market_probability ?? mid(m), modelP: sh.p, modelState: sh.state,
  };
}

const SIDELINED = new Set(['OUT', 'INJURED_RESERVE', 'DOUBTFUL', 'SUSPENDED']);

/** Injury designations by player name key, from the event's injury rows ("Name (POS, TEAM): …"). */
export function injuryByName(r: EventResearchDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of r.context?.injuries ?? []) {
    const name = /^(.+?) \(/.exec(i.detail ?? '')?.[1];
    if (name) out.set(nameKey(name), i.status);
  }
  return out;
}

/** The whole board for a game. `markets` are the game's markets (live-overlaid when the view has quotes). */
export function propBoard(r: EventResearchDoc, detail: Pick<EventDetailDoc, 'markets' | 'model_prices'> | { markets: Market[]; model_prices?: ModelPrice[] }, g: GameSides | null = gameSides(r)): PropBoard {
  const empty: PropBoard = { rows: [], byFamily: { passing: 0, rushing: 0, receiving: 0, touchdowns: 0, other: 0 }, sidelined: [] };
  if (!g) return empty;
  const prices = new Map<string, ModelPrice>();
  for (const mp of detail.model_prices ?? []) {
    const prev = prices.get(mp.market_id);
    if (!prev || prev.generated_at < mp.generated_at) prices.set(mp.market_id, mp);
  }
  const injuries = injuryByName(r);
  const sidelined = [...injuries.entries()].filter(([, s]) => SIDELINED.has(s));
  const byPlayerStat = new Map<string, Market[]>();
  for (const m of detail.markets) {
    const stat = (m.extensions as { stat?: string } | null)?.stat;
    if (m.market_family !== 'player_stat' || !m.player_id || !stat || !isFullGame(m.period)) continue;
    const k = `${m.player_id}|${stat}`;
    byPlayerStat.set(k, [...(byPlayerStat.get(k) ?? []), m]);
  }
  const rows: PropRow[] = [];
  const seen = new Set<string>();
  for (const p of r.players) {
    const team = g.byPid(p.team_id ?? null);
    if (!team) continue;
    const key = nameKey(p.display_name);
    if (SIDELINED.has(injuries.get(key) ?? '')) continue;
    const opp = g.opp(team.abbr);
    for (const def of PROP_STAT_DEFS) {
      if (def.positions && p.role && !def.positions.includes(p.role)) continue;
      if (def.positions && !p.role) continue;
      const markets = byPlayerStat.get(`${p.participant_id}|${def.stat}`) ?? [];
      const d = def.sim ? r.distributions.find((x) => x.entity_id === p.participant_id && x.metric_id === def.sim) : null;
      const range = d ? rangeOf(d) : null;
      const projection = d?.mean ?? null;
      if (!markets.length && projection == null) continue;
      const ladder = markets.map((m) => rungOf(m, prices)).filter((x): x is Rung => !!x).sort((a, b) => a.threshold - b.threshold);
      const mainM = mainLine(markets);
      const main = mainM ? ladder.find((x) => x.market.market_id === mainM.market_id) ?? null : null;
      const line = main ? Number(main.line) : null;
      const defObs = def.def ? matchupObs(r, def.def, opp) : null;
      const rank = rankView(defObs?.context);
      // Separation: projection minus line, in widths of the typical (25th–75th) band. Not a probability.
      const width = range ? Math.max(def.count ? 0.5 : 1, range.typical[1] - range.typical[0]) : null;
      const separation = projection != null && line != null && width ? (projection - line) / width : null;
      // Touchdown ladders settle on counts whose simulated quartiles collapse to 0: the mean (expected TDs) is the read.
      const read: PropRead = projection == null ? 'NO_SIM' : line == null ? 'NO_LINE' : separation == null ? 'NO_SIM' : Math.abs(separation) < 0.15 ? 'ON' : separation > 0 ? 'ABOVE' : 'BELOW';
      const price = main
        ? { overAsk: main.yesAsk, underAsk: main.noAsk, overBreakEven: breakEven(main.yesAsk, kalshiFee(main.yesAsk)), underBreakEven: breakEven(main.noAsk, kalshiFee(main.noAsk)), spread: main.yesAsk != null && main.yesBid != null ? Math.round((main.yesAsk - main.yesBid) * 100) / 100 : null }
        : null;
      // A designation worth a word: ACTIVE and PROBABLE rows are the publication saying "no concern".
      const listed = injuries.get(key) ?? null;
      const injury = listed && !['ACTIVE', 'PROBABLE', 'AVAILABLE'].includes(listed) ? listed : null;
      const risks: string[] = [];
      if (injury) risks.push(`${p.display_name} is listed ${injury.toLowerCase().replace(/_/g, ' ')}; the projection assumes he plays.`);
      if (range && line != null && range.typical[0] <= line && line <= range.typical[1]) risks.push(`The line sits inside the typical range (${fmtRange(range.typical, def)}): the simulation calls this close to a coin flip.`);
      if (price?.spread != null && price.spread >= 0.04) risks.push(`Wide quote: ${Math.round(price.spread * 100)}¢ between bid and ask.`);
      if (main && (main.market.volume ?? 0) < 50) risks.push('Thin market: little volume traded on this line.');
      if (!def.sim) risks.push('The publication simulates no distribution for this stat: market prices only.');
      else if (!d) risks.push('No simulation row for this player and stat this week.');
      if (def.stat === 'touchdowns') risks.push('Touchdowns are high variance: an expected 0.5 TD is a near coin flip on one score, not a trend.');
      const reasons: string[] = [];
      if (rank && rank.tier !== 'average') reasons.push(`${opp.nick} ${def.defUnit} ${rank.text}`);
      if (read === 'ABOVE' || read === 'BELOW') reasons.push(`Projection ${read === 'ABOVE' ? 'above' : 'below'} the line by ${fmtValue(Math.abs(projection! - line!), def)}`);
      if (main?.modelP != null && main.marketP != null && Math.abs(main.modelP - main.marketP) >= 0.08) reasons.push(`Shadow model ${Math.round(main.modelP * 100)}% vs market ${Math.round(main.marketP * 100)}% on the over (research)`);
      if (p.role && projection != null && isFeatured(def, projection)) reasons.push('Featured role');
      const extreme = rank ? Math.abs(rank.strength - 0.5) * 2 : 0;
      const sep = separation != null ? Math.min(1, Math.abs(separation)) : 0;
      const star = projection != null ? Math.min(1, projection / featureBar(def)) : 0;
      const interest = (0.45 * star + 0.3 * extreme + 0.25 * sep) * (main ? 1 : 0.35) * (def.family === 'other' ? 0.5 : 1);
      const id = `${p.participant_id}|${def.stat}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id, playerId: p.participant_id, name: p.display_name, role: p.role ?? null, team, opp, def, family: def.family,
        projection, range, main, line, ladder, read, separation, matchup: rank && def.defUnit && def.def ? { label: `${opp.nick} ${def.defUnit}`, rank, metricId: def.def } : null,
        price, risks, injury, interest, reasons,
        marketTitle: main ? describeMarket(main.market, { playerName: () => p.display_name }).title : null,
      });
    }
  }
  rows.sort((a, b) => b.interest - a.interest || a.name.localeCompare(b.name));
  const byFamily: Record<PropFamily, number> = { passing: 0, rushing: 0, receiving: 0, touchdowns: 0, other: 0 };
  for (const row of rows) byFamily[row.family]++;
  return { rows, byFamily, sidelined: sidelined.map(([k, s]) => ({ name: r.players.find((p) => nameKey(p.display_name) === k)?.display_name ?? k, status: s })) };
}

/** The projection at which a role counts as featured for a stat (a 250-yard passer, an 80-yard rusher…). */
function featureBar(def: PropStatDef): number {
  switch (def.stat) {
    case 'passing_yards': return 250; case 'attempts': return 35; case 'completions': return 24; case 'passing_tds': return 2; case 'interceptions': return 1;
    case 'rushing_yards': return 80; case 'carries': return 18; case 'receiving_yards': return 75; case 'receptions': return 6; case 'touchdowns': return 0.6;
    default: return Number.POSITIVE_INFINITY;
  }
}
const isFeatured = (def: PropStatDef, v: number) => v / featureBar(def) >= 0.85;

export function fmtValue(v: number, def: Pick<PropStatDef, 'count' | 'unit' | 'stat'>): string {
  if (def.stat === 'touchdowns' || def.stat === 'passing_tds' || def.stat === 'interceptions') return `${(Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '')} ${def.unit}`;
  if (def.count) return `${(Math.round(v * 10) / 10).toString().replace(/\.0$/, '')} ${def.unit}`;
  return `${Math.round(v)} ${def.unit}`;
}
export function fmtRange(r: [number, number], def: Pick<PropStatDef, 'count' | 'unit' | 'stat'>): string {
  const f = (v: number) => (def.count ? (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') : String(Math.round(v)));
  return `${f(r[0])}–${f(r[1])} ${def.unit}`;
}

/** Filters a board the way the view does: by family, by team and (by default) to priced lines only. */
export function filterBoard(rows: PropRow[], f: { family?: PropFamily | 'all'; team?: string | 'both'; pricedOnly?: boolean }): PropRow[] {
  return rows.filter((row) =>
    (!f.family || f.family === 'all' || row.family === f.family) &&
    (!f.team || f.team === 'both' || row.team.abbr === f.team) &&
    (f.pricedOnly === false || row.main != null));
}

/** The publication's scorecard sentence for player props, from its PLAYER_STAT family row when present. */
export function propScorecardSentence(families: { family: string; model: number; market: number; leader: 'model' | 'market' | 'even'; nModel: number | null }[] | null | undefined): string {
  const row = families?.find((f) => f.family === 'PLAYER_STAT');
  if (!row) return 'The publication rates its NFL pricing research-only and reports it redundant to the closing market on player props.';
  const n = row.nModel != null ? ` on ${row.nModel.toLocaleString()} settled contracts` : '';
  if (row.leader === 'market') return `Research only: on the publication's own scorecard the market's payout error (${row.market.toFixed(3)}) beat the model's (${row.model.toFixed(3)})${n} for player props.`;
  if (row.leader === 'even') return `Research only: the publication's scorecard has the model and market about even on player props${n}; nothing here is a validated edge.`;
  return `Research only: the publication's scorecard has the model ahead on player props${n}, which is past accuracy, not a validated edge.`;
}
