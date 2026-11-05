// NFL game scripts in SIFT 3.0: the view-model of the Game Script tab. Pure.
//
// The logic is SIFT 2.0's, reused as is: `gameScripts` (src/lib/scripts.ts) reads the simulation's final-margin shares from
// `event_research.extensions.game_script_inputs`, applies the close-split calibration gate and orders the scripts most likely first;
// `multiScriptSurvivors` and `scriptExpressions` (src/lib/scriptExpressions.ts) choose the priced contracts. This file only
//   * builds the priced rows the SIFT 2.0 helpers read (`priceRow`, `marketLabel`, `scriptFit`) from the published markets, and
//   * words the presentation: card list, volume table against all simulated games, pass/run lean, key players' team-volume lean, margin map.
// A share is a SIMULATION SHARE (the simulator's own distribution), never an odds or a probability; nothing here prices anything.
// A price is never read here: the screen prints each through the quote gate (data/research/scriptPrices.ts `useSideQuotes`).
import type { EventResearchDoc, Market, ModelPrice } from '../../contract/types';
import { marketLabel, priceRow, type PriceRow } from '../../lib/gamedata';
import { gameScripts, scriptFit, sharePct, type GameScript, type ScriptId, type ScriptSet, type TeamVolume } from '../../lib/scripts';

export interface NflScript {
  set: ScriptSet;
  /** Every published market as the SIFT 2.0 helpers read it (label, margin fit against each script). */
  rows: PriceRow[];
}

const NO_MODEL = new Map<string, ModelPrice>();

/** The script set of a research document, or null when it carries no usable simulation (the thesis view then stands in). */
export const readScripts = (r: EventResearchDoc | null | undefined): ScriptSet | null => (r ? gameScripts(r) : null);

/** The priced rows for a game: the published markets, labelled in sports language, each with its fit against every script. */
export function scriptRows(r: EventResearchDoc, set: ScriptSet, markets: readonly Market[]): PriceRow[] {
  const home = r.participants.find((p) => p.home_away === 'HOME')?.participant_id;
  const away = r.participants.find((p) => p.home_away === 'AWAY')?.participant_id;
  if (!home || !away) return [];
  const abbrOf = (pid: string | null) => (pid ? r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? null : null);
  const playerName = (id: string | null) => (id ? r.players.find((p) => p.participant_id === id)?.display_name ?? null : null);
  return markets.map((m) => priceRow(m, NO_MODEL, marketLabel(m, abbrOf, playerName), scriptFit(m, set, home, away)));
}

export function readNflScript(r: EventResearchDoc | null | undefined, markets: readonly Market[] | null | undefined): NflScript | null {
  const set = readScripts(r);
  return set && r ? { set, rows: scriptRows(r, set, markets ?? []) } : null;
}

// ------------------------------------------------------------------ the script cards

export interface ScriptCard {
  id: ScriptId;
  name: string;
  /** The colour identity 1..5 (never the only signal: the name is always printed). */
  tone: GameScript['index'];
  share: number;
  /** Whole percent, "34%". */
  pct: string;
  /** One line: what the final margin is. */
  line: string;
  mostLikely: boolean;
}

/** The scripts as cards, in the set's order (most likely first). */
export function scriptCards(set: ScriptSet): ScriptCard[] {
  return set.scripts.map((s, i) => ({ id: s.id, name: s.name, tone: s.index, share: s.share, pct: sharePct(s.share), line: s.line, mostLikely: i === 0 }));
}

/** The selected script: the address's, else the most likely. An id this game does not have falls back to the most likely. */
export const pickScript = (set: ScriptSet, id: string | null | undefined): GameScript => set.scripts.find((s) => s.id === id) ?? set.scripts[0];

/** Where the final margin sits for a script, in plain words. */
export function rangeText(s: GameScript, set: ScriptSet): string {
  const fav = set.names[set.fav];
  const dog = set.names[set.fav === 'home' ? 'away' : 'home'];
  switch (s.id) {
    case 'fav-big': return `The ${fav} win by 14 or more points.`;
    case 'fav': return `The ${fav} win by 7 to 13 points.`;
    case 'close': return `The final margin is 6 points or fewer either way: the ${fav} winning a one-score game or the ${dog} winning one.`;
    case 'fav-close': return `The ${fav} win by 1 to 6 points.`;
    case 'dog-close': return `The ${dog} win by 1 to 6 points.`;
    case 'dog': return `The ${dog} win by 7 or more points.`;
  }
}

// ------------------------------------------------------------------ how it plays: team volume against all simulated games

export interface VolumeDef { k: keyof TeamVolume; label: string; fmt: (v: number) => string; pct?: boolean }
export const VOLUME: VolumeDef[] = [
  { k: 'plays', label: 'Offensive plays', fmt: (v) => v.toFixed(1) },
  { k: 'passAtt', label: 'Pass attempts', fmt: (v) => v.toFixed(1) },
  { k: 'rushAtt', label: 'Rush attempts', fmt: (v) => v.toFixed(1) },
  { k: 'passRate', label: 'Pass rate', fmt: (v) => `${Math.round(v * 100)}%`, pct: true },
];

export interface DeltaText { text: string; dir: 'up' | 'down' | 'flat' }

/** The move from the all-games average: percent for counts, points for a rate; null when either number is not published. */
export function deltaOf(v: number | null, base: number | null, pct = false): DeltaText | null {
  if (v == null || base == null || base === 0) return null;
  const r = Math.round(pct ? (v - base) * 100 : ((v - base) / base) * 100);
  if (r === 0) return { text: `±0${pct ? ' pts' : '%'}`, dir: 'flat' };
  return { text: `${r > 0 ? '+' : '−'}${Math.abs(r)}${pct ? ' pts' : '%'}`, dir: r > 0 ? 'up' : 'down' };
}

export interface VolumeRow {
  key: keyof TeamVolume;
  label: string;
  cells: Record<'away' | 'home', { value: string; delta: DeltaText | null }>;
}

export function volumeRows(s: GameScript, set: ScriptSet): VolumeRow[] {
  return VOLUME.map((d) => {
    const cell = (side: 'away' | 'home') => {
      const v = s.volume[side][d.k];
      return { value: v != null ? d.fmt(v) : 'unavailable', delta: deltaOf(v, set.overall[side][d.k], d.pct) };
    };
    return { key: d.k, label: d.label, cells: { away: cell('away'), home: cell('home') } };
  });
}

/** A team's attempts in a script against all simulated games, as a fraction (+0.12 = 12% more). Null when the publication states neither. */
export function attemptLean(s: GameScript, set: ScriptSet, side: 'home' | 'away', k: 'passAtt' | 'rushAtt'): number | null {
  const v = s.volume[side][k];
  const b = set.overall[side][k];
  return v != null && b ? (v - b) / b : null;
}

export const leanWord = (x: number | null): string => (x == null ? 'not published' : Math.abs(x) < 0.03 ? 'about the same' : `${x > 0 ? 'more' : 'less'} (${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%)`);

/** "Cowboys pass more (+8%), run less (−5%)" for each team: the pass/run lean of this script. */
export function leanSentences(s: GameScript, set: ScriptSet): string[] {
  return (['away', 'home'] as const).map((side) => `${set.names[side]} pass ${leanWord(attemptLean(s, set, side, 'passAtt'))}, run ${leanWord(attemptLean(s, set, side, 'rushAtt'))}`);
}

/** The most common other endings, for "the rest of the simulated games". */
export function otherEndings(s: GameScript, set: ScriptSet): { rest: string; top: GameScript | null } {
  const others = set.scripts.filter((x) => x.id !== s.id);
  return { rest: sharePct(1 - s.share), top: others[0] ?? null };
}

// ------------------------------------------------------------------ key players' team-volume lean

export interface KeyPlayer {
  side: 'home' | 'away';
  abbr: string;
  pid: string;
  name: string;
  role: string;
  vol: 'passAtt' | 'rushAtt';
  volLabel: string;
}

/** Each team's lead passer, runner and receiver by the simulation's own projected volume (the publication's distributions). */
export function keyPlayers(r: EventResearchDoc, set: ScriptSet): KeyPlayer[] {
  const proj = (pid: string, metric: string) => r.distributions.find((d) => d.entity_id === pid && d.metric_id === metric)?.mean ?? null;
  const out: KeyPlayer[] = [];
  for (const side of ['away', 'home'] as const) {
    const tid = r.participants.find((p) => p.home_away === (side === 'home' ? 'HOME' : 'AWAY'))?.participant_id;
    const abbr = side === 'home' ? set.homeAbbr : set.awayAbbr;
    const top = (roles: string[], metric: string) => r.players.filter((p) => p.team_id === tid && roles.includes(p.role ?? '')).map((p) => ({ p, v: proj(p.participant_id, metric) })).filter((x) => x.v != null).sort((a, b) => b.v! - a.v!)[0];
    const qb = top(['QB'], 'met_nfl.sim_passing_yards');
    const rb = top(['RB'], 'met_nfl.sim_carries');
    const wr = top(['WR', 'TE'], 'met_nfl.sim_receiving_yards');
    if (qb) out.push({ side, abbr, pid: qb.p.participant_id, name: qb.p.display_name, role: 'QB', vol: 'passAtt', volLabel: 'Team pass att' });
    if (rb) out.push({ side, abbr, pid: rb.p.participant_id, name: rb.p.display_name, role: rb.p.role ?? 'RB', vol: 'rushAtt', volLabel: 'Team rush att' });
    if (wr) out.push({ side, abbr, pid: wr.p.participant_id, name: wr.p.display_name, role: wr.p.role ?? 'WR', vol: 'passAtt', volLabel: 'Team pass att' });
  }
  return out;
}

export interface PlayerLean { p: KeyPlayer; value: string; delta: DeltaText | null }

/** His TEAM's volume in the script against all simulated games. Player projections are not split by script, so this is never his projection. */
export function playerLeans(r: EventResearchDoc, set: ScriptSet, s: GameScript): PlayerLean[] {
  return keyPlayers(r, set).map((p) => {
    const v = s.volume[p.side][p.vol];
    const d = deltaOf(v, set.overall[p.side][p.vol]);
    // Under 3% is "average", the same threshold the pass/run sentences use.
    const base = set.overall[p.side][p.vol];
    const flat = v != null && base ? Math.abs((v - base) / base) < 0.03 : false;
    return { p, value: v != null ? v.toFixed(1) : 'unavailable', delta: d && flat ? { text: 'avg', dir: 'flat' } : d };
  });
}

// ------------------------------------------------------------------ where it ends: the margin map

export interface MarginSeg { id: ScriptId; label: string; name: string; tone: GameScript['index']; lo: number | null; hi: number | null; on: boolean }

/** Each script as a range of HOME margin; the selected one is marked. */
export function marginSegs(set: ScriptSet, selected: ScriptId): MarginSeg[] {
  return set.scripts.map((s) => ({ id: s.id, label: s.canonical, name: s.name, tone: s.index, lo: s.home.lo, hi: s.home.hi, on: s.id === selected }));
}

/** The simulation's published home-margin band: mean, middle half, nine in ten. Null when it publishes none. */
export function marginBand(r: EventResearchDoc): { mean: number | null; r50: [number, number] | null; r90: [number, number] | null } | null {
  const hm = (r.extensions as { game_script_inputs?: { game_environment?: { home_margin?: { mean?: number; range_50?: [number, number]; range_90?: [number, number] } } } } | null | undefined)?.game_script_inputs?.game_environment?.home_margin;
  return hm ? { mean: hm.mean ?? null, r50: hm.range_50 ?? null, r90: hm.range_90 ?? null } : null;
}

/** Position on a margin axis of ±span as 0..100 (away's big win at 0, home's at 100). */
export const marginPos = (v: number, span: number): number => ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * 100;

export function marginWords(lo: number | null, hi: number | null, home: string, away: string): string {
  if (lo != null && lo >= 0) return hi == null ? `${home} by ${Math.max(1, lo)} or more` : `${home} by ${Math.max(1, lo)} to ${hi}`;
  if (hi != null && hi <= 0) return lo == null ? `${away} by ${Math.max(1, -hi)} or more` : `${away} by ${Math.max(1, -hi)} to ${-lo}`;
  return `within ${Math.max(Math.abs(lo ?? 0), Math.abs(hi ?? 0))} either way`;
}

// ------------------------------------------------------------------ small notes

export const SIM_SHARE_NOTE = 'Shares are of simulated games: the simulator’s own distribution, not odds and not calibrated probabilities.';
export const CLOSE_SPLIT_HELD = 'The one-score script pools both teams’ close wins. Splitting it by winner is held back: over 2021–2025 that split was not shown to be more accurate than the point spread alone.';
export const closeSplitShown = (tie: number): string => `Ties after overtime: ${(tie * 100).toFixed(1)}% of simulated games, no winner, so not a script. Over 2021–2025 the winner split was about as accurate as the point spread alone, no better.`;
