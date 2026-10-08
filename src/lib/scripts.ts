// GAME SCRIPTS — the plausible ways a game unfolds, from the simulation the publication attached.
//
// Source: event_research.extensions.game_script_inputs.team_volume[TEAM].by_final_margin (nfl-edge-finder
// sim-script-1.0.0, nfl_edge/sim/script.py MARGIN_STATES). Each simulated game falls in exactly one
// final-margin bucket — lead14+ · lead7-13 · within6 · trail7-13 · trail14+ (integer margins, from that
// team's side) — and `share_of_rows` is the share of simulated games in it. Sift groups the five buckets
// into four scripts named from the favourite's side, listed most likely first. The weights are SIMULATION SHARES: the simulator's
// own distribution, not calibrated probabilities (the publication validates no calibration for them),
// so Sift calls them "sim share" and shows whole percents.
//
// Script fit is exact only where a market settles on the final margin (moneyline, full-game spread):
// for those, each bucket is a closed integer range and either always, never or partly satisfies the
// market. Totals, team totals, props and period markets need a joint (margin × points) script output the
// publication does not carry yet, so their fit is reported as unknown — never guessed.
import type { EventResearchDoc, Market } from '../contract/types';
import { isFullGame } from './period';

export type ScriptId = 'fav-big' | 'fav' | 'close' | 'dog';
export type Fit = 'yes' | 'part' | 'no';

/** A range of HOME final margin (home points − away points), inclusive; null = unbounded. */
export interface MarginRange {
  lo: number | null;
  hi: number | null;
}

export interface TeamVolume {
  plays: number | null;
  passAtt: number | null;
  rushAtt: number | null;
  passRate: number | null;
}

export interface GameScript {
  id: ScriptId;
  index: 1 | 2 | 3 | 4;
  /** The DISPLAY title, plain words a casual fan reads instantly ("Cowboys Win Big"). Presentation only. */
  name: string;
  /** The canonical model bucket this script is, unchanged by wording ("DAL by 14+"): for debugging, packets, tests. */
  canonical: string;
  /** One line, plain sports language: the final margin that defines the script. */
  summary: string;
  /**
   * The summary plus, when the simulation shows it, how the teams play in games that end this way (from the
   * conditional pass rates in team_volume.by_final_margin): "Cowboys win by 14 or more. The Buccaneers throw more
   * to catch up." Never more than the publication carries — no score-state or scoring narrative is inferred.
   */
  story: string;
  /** The compact form for tiles and the priorities rail, under the title: "By 14 or more. The Buccaneers throw more to catch up." */
  line: string;
  /** Share of simulated games (0..1). */
  share: number;
  home: MarginRange;
  /** Team expected to lead in this script (null for a one-score game). */
  leader: 'home' | 'away' | null;
  /** Conditional simulated volume for each team in games that ended this way. */
  volume: { home: TeamVolume; away: TeamVolume };
}

export interface ScriptSet {
  scripts: GameScript[];
  fav: 'home' | 'away';
  homeAbbr: string;
  awayAbbr: string;
  /** Volume over every simulated game (share-weighted), for comparison. */
  overall: { home: TeamVolume; away: TeamVolume };
  source: string | null;
  /** What the simulator does not model (from the publication). */
  notSimulated: string[];
}

interface Bucket {
  share_of_rows?: number;
  plays_mean?: number;
  pass_att_mean?: number;
  rush_att_mean?: number;
  pass_rate_mean?: number;
}
type Buckets = Partial<Record<'lead14+' | 'lead7-13' | 'within6' | 'trail7-13' | 'trail14+', Bucket>>;

/** A team's own-perspective bucket for the HOME-margin range. */
const MIRROR: Record<string, keyof Buckets> = { 'lead14+': 'trail14+', 'lead7-13': 'trail7-13', within6: 'within6', 'trail7-13': 'lead7-13', 'trail14+': 'lead14+' };
const RANGES: Record<keyof Buckets, MarginRange> = {
  'lead14+': { lo: 14, hi: null },
  'lead7-13': { lo: 7, hi: 13 },
  within6: { lo: -6, hi: 6 },
  'trail7-13': { lo: -13, hi: -7 },
  'trail14+': { lo: null, hi: -14 },
};

function pool(bs: (Bucket | undefined)[]): TeamVolume & { share: number } {
  const xs = bs.filter((b): b is Bucket => !!b && (b.share_of_rows ?? 0) > 0);
  const w = xs.reduce((a, b) => a + (b.share_of_rows ?? 0), 0);
  const avg = (k: keyof Bucket) => {
    const v = xs.filter((b) => b[k] != null);
    const ww = v.reduce((a, b) => a + (b.share_of_rows ?? 0), 0);
    return ww > 0 ? v.reduce((a, b) => a + (b[k] as number) * (b.share_of_rows ?? 0), 0) / ww : null;
  };
  return { share: w, plays: avg('plays_mean'), passAtt: avg('pass_att_mean'), rushAtt: avg('rush_att_mean'), passRate: avg('pass_rate_mean') };
}

const nick = (name: string | undefined, abbr: string) => {
  if (!name) return abbr;
  const w = name.split(' ');
  // "New York Jets Jets" → "Jets"; "Washington Commanders" → "Commanders"
  return w[w.length - 1] || abbr;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function gameScripts(r: EventResearchDoc): ScriptSet | null {
  const gsi = (r.extensions as any)?.game_script_inputs;
  const tv = gsi?.team_volume as Record<string, { by_final_margin?: Buckets }> | undefined;
  const homeP = r.participants.find((p) => p.home_away === 'HOME');
  const awayP = r.participants.find((p) => p.home_away === 'AWAY');
  const short = (pid?: string) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '';
  const homeAbbr = short(homeP?.participant_id);
  const awayAbbr = short(awayP?.participant_id);
  const hb = tv?.[homeAbbr]?.by_final_margin;
  const ab = tv?.[awayAbbr]?.by_final_margin;
  if (!homeP || !awayP || !hb) return null;
  const total = Object.values(hb).reduce((a, b) => a + (b?.share_of_rows ?? 0), 0);
  if (!(total > 0.95 && total < 1.05)) return null;

  // Home-margin bucket k ↔ the away team's own bucket MIRROR[k].
  const sum = (keys: (keyof Buckets)[]) => {
    const h = pool(keys.map((k) => hb[k]));
    const a = pool(keys.map((k) => ab?.[MIRROR[k]]));
    return { share: h.share, home: { plays: h.plays, passAtt: h.passAtt, rushAtt: h.rushAtt, passRate: h.passRate }, away: { plays: a.plays, passAtt: a.passAtt, rushAtt: a.rushAtt, passRate: a.passRate } };
  };
  const span = (keys: (keyof Buckets)[]): MarginRange => {
    const rs = keys.map((k) => RANGES[k]);
    return { lo: rs.some((x) => x.lo == null) ? null : Math.min(...rs.map((x) => x.lo as number)), hi: rs.some((x) => x.hi == null) ? null : Math.max(...rs.map((x) => x.hi as number)) };
  };
  const homeWin = (hb['lead14+']?.share_of_rows ?? 0) + (hb['lead7-13']?.share_of_rows ?? 0);
  const awayWin = (hb['trail14+']?.share_of_rows ?? 0) + (hb['trail7-13']?.share_of_rows ?? 0);
  const pHome = gsi?.game_environment?.p_home_win;
  const fav: 'home' | 'away' = pHome != null ? (pHome >= 0.5 ? 'home' : 'away') : homeWin >= awayWin ? 'home' : 'away';
  const dog = fav === 'home' ? 'away' : 'home';
  const name = { home: nick(homeP.display_name, homeAbbr), away: nick(awayP.display_name, awayAbbr) };
  const keys: Record<ScriptId, (keyof Buckets)[]> =
    fav === 'home'
      ? { 'fav-big': ['lead14+'], fav: ['lead7-13'], close: ['within6'], dog: ['trail7-13', 'trail14+'] }
      : { 'fav-big': ['trail14+'], fav: ['trail7-13'], close: ['within6'], dog: ['lead7-13', 'lead14+'] };
  const mk = (id: ScriptId, index: 1 | 2 | 3 | 4, title: string, canonical: string, summary: string, leader: 'home' | 'away' | null): GameScript => {
    const s = sum(keys[id]);
    return { id, index, name: title, canonical, summary, story: summary, line: summary, share: s.share, home: span(keys[id]), leader, volume: { home: s.home, away: s.away } };
  };
  // DISPLAY LANGUAGE. The four margin buckets are the model's; only their titles are written for a casual fan:
  // "Win Big" (14+), "Win Comfortably" (7–13, or 7+ for the underdog), "Close Game Either Way" (6 or fewer).
  // No title implies scoring (the publication simulates no joint margin × points script) or game flow. Index is
  // the script's colour identity and never changes; the list itself is ordered most likely first.
  const abbr = { home: homeAbbr, away: awayAbbr };
  const scripts = sortScripts([
    mk('fav-big', 1, `${name[fav]} Win Big`, `${abbr[fav]} by 14+`, `${name[fav]} win by 14 or more.`, fav),
    mk('fav', 2, `${name[fav]} Win Comfortably`, `${abbr[fav]} by 7–13`, `${name[fav]} win by 7 to 13.`, fav),
    mk('close', 3, 'Close Game Either Way', 'Within 6 either way', 'Decided by 6 points or fewer, either way.', null),
    mk('dog', 4, `${name[dog]} Win Comfortably`, `${abbr[dog]} by 7+`, `${name[dog]} win by 7 or more.`, dog),
  ]);
  const all = sum(['lead14+', 'lead7-13', 'within6', 'trail7-13', 'trail14+']);
  const margin: Record<ScriptId, string> = { 'fav-big': 'By 14 or more.', fav: 'By 7 to 13.', close: 'Decided by 6 points or fewer, either way.', dog: 'By 7 or more.' };
  for (const sc of scripts) {
    const clause = scriptClause(sc, all, name);
    sc.story = clause ? `${sc.summary} ${clause}` : sc.summary;
    sc.line = clause ? `${margin[sc.id]} ${clause}` : margin[sc.id];
  }
  return { scripts, fav, homeAbbr, awayAbbr, overall: { home: all.home, away: all.away }, source: gsi?.script_source ?? null, notSimulated: gsi?.not_simulated ?? [] };
}

/** Pass-rate shift (share of plays) that counts as a real change in how a team plays in a script: 3 points. */
const PASS_SHIFT = 0.03;

/**
 * The clause after a script's margin: how the winner and loser play in simulated games that end this
 * way, but only where the publication's conditional pass rate moves by PASS_SHIFT or more from that team's
 * average. A close game gets no clause (neither side is forced to change).
 */
function scriptClause(s: GameScript, all: { home: TeamVolume; away: TeamVolume }, name: { home: string; away: string }): string | null {
  if (!s.leader) return null;
  const lead = s.leader;
  const trail = lead === 'home' ? 'away' : 'home';
  const shift = (side: 'home' | 'away') => {
    const a = s.volume[side].passRate;
    const b = all[side].passRate;
    return a != null && b != null ? a - b : 0;
  };
  const runs = shift(lead) <= -PASS_SHIFT;
  const throws = shift(trail) >= PASS_SHIFT;
  if (runs && throws) return `The ${name[lead]} lean on the run while the ${name[trail]} throw to catch up.`;
  if (throws) return `The ${name[trail]} throw more to catch up.`;
  if (runs) return `The ${name[lead]} lean on the run.`;
  return null;
}

/** Most likely first; ties keep the favourite-to-underdog order. */
export function sortScripts(scripts: GameScript[]): GameScript[] {
  return [...scripts].sort((a, b) => b.share - a.share || a.index - b.index);
}

export const scriptById = (set: ScriptSet, id: ScriptId) => set.scripts.find((s) => s.id === id)!;

/** The HOME-margin condition a market settles on, when it settles on the full-game final margin. */
export function marginCondition(m: Pick<Market, 'market_family' | 'period' | 'participant_id' | 'threshold'>, homeId: string, awayId: string): { op: '>' | '<'; v: number } | null {
  if (!isFullGame(m.period)) return null;
  if (m.market_family !== 'game_winner' && m.market_family !== 'spread') return null;
  const L = m.market_family === 'game_winner' ? 0 : m.threshold;
  if (L == null) return null;
  if (m.participant_id === homeId) return { op: '>', v: L };
  if (m.participant_id === awayId) return { op: '<', v: -L };
  return null;
}

/** Does a HOME-margin range satisfy a margin condition always, never or only partly? */
export function rangeFit(r: MarginRange, c: { op: '>' | '<'; v: number }): Fit {
  if (c.op === '>') {
    if (r.lo != null && r.lo > c.v) return 'yes';
    if (r.hi != null && r.hi <= c.v) return 'no';
    return 'part';
  }
  if (r.hi != null && r.hi < c.v) return 'yes';
  if (r.lo != null && r.lo >= c.v) return 'no';
  return 'part';
}

export interface ScriptFit {
  fits: Fit[];
  /** Scripts it always wins in. */
  full: number;
  /** Scripts it wins only some of the time in. */
  part: number;
  /** Sim share of the scripts it always wins in. */
  coverage: number;
  /** Sim share of scripts it can win in (always or partly) — the upper bound. */
  coverageMax: number;
}

/** A market against every script, or null when the market does not settle on the final margin. */
export function scriptFit(m: Pick<Market, 'market_family' | 'period' | 'participant_id' | 'threshold'>, set: ScriptSet, homeId: string, awayId: string): ScriptFit | null {
  const c = marginCondition(m, homeId, awayId);
  if (!c) return null;
  const fits = set.scripts.map((s) => rangeFit(s.home, c));
  let coverage = 0;
  let coverageMax = 0;
  fits.forEach((f, i) => {
    if (f === 'yes') coverage += set.scripts[i].share;
    if (f !== 'no') coverageMax += set.scripts[i].share;
  });
  return { fits, full: fits.filter((f) => f === 'yes').length, part: fits.filter((f) => f === 'part').length, coverage, coverageMax };
}

/** Whole percent, never more precision than the simulation supports. */
export const sharePct = (v: number) => `${Math.round(v * 100)}%`;
