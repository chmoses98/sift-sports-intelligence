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
// WHO WINS THE CLOSE GAME. `within6` pools both teams' one-score wins. From sim-script-1.1.0 the publication also
// splits exactly those rows by result (team_volume[TEAM].by_close_result: win1-6 · tie · lose1-6, shares summing to
// within6). When both teams carry it, Sift shows two winner-specific scripts in place of the pooled one — "<favourite>
// win by 1–6" and "<underdog> win by 1–6" — and reports the simulated tie share beside them (ties settle neither
// winner's moneyline, so they are not folded into either). Earlier publications keep the pooled one-score script.
//
// CALIBRATION GATE. The split is shown ONLY when the publication explicitly authorises it:
// extensions.game_script_inputs.calibration_gates.close_win_split = { status: 'SHOW', displayable: true } (nfl-edge-finder
// nfl_edge/handicap/script_block.close_split_gate, from research/game_script_v2/close_split_calibration.json). A missing,
// malformed or SUPPRESS gate — including every publication that predates the gate — keeps the pooled script. Authorisation is never
// inferred from the shares adding up: shares that sum to within6 say the arithmetic holds, not that the split is calibrated.
//
// Script fit is exact only where a market settles on the final margin (moneyline, full-game spread):
// for those, each bucket is a closed integer range and either always, never or partly satisfies the
// market. Totals, team totals, props and period markets need a joint (margin × points) script output the
// publication does not carry yet, so their fit is reported as unknown — never guessed.
import type { EventResearchDoc, Market } from '../contract/types';
import { isFullGame } from './period';
import { cfbName } from './cfbTeams';

export type ScriptId = 'fav-big' | 'fav' | 'close' | 'fav-close' | 'dog-close' | 'dog';
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
  /** Colour identity: 1 fav 14+, 2 fav 7–13, 3 one-score (pooled) or favourite by 1–6, 4 underdog by 7+, 5 underdog by 1–6. */
  index: 1 | 2 | 3 | 4 | 5;
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
  /** One tight sentence for tiles, cards and the priorities rail, naming the teams: "Cowboys by 14 or more." */
  line: string;
  /**
   * The expandable detail behind the tight sentence (null when the simulation shows nothing more): how the teams play in
   * games that end this way, from the conditional pass rates — "The Cowboys lean on the run while the Buccaneers throw to catch up."
   */
  detail: string | null;
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
  /** The teams as the titles say them ("Bills", "Iowa State"). */
  names: { home: string; away: string };
  /**
   * Share of simulated games that end tied after overtime, when the close game is split by winner (null when the
   * pooled one-score script is shown, which already holds the ties). The scripts plus this sum to the whole simulation.
   */
  tie: number | null;
  /** Volume over every simulated game (share-weighted), for comparison. */
  overall: { home: TeamVolume; away: TeamVolume };
  source: string | null;
  /** What the simulator does not model (from the publication). */
  notSimulated: string[];
  /** Whether the close game is split by winner, and the publication's calibration gate behind it. */
  closeSplit: { shown: boolean; gate: 'SHOW' | 'SUPPRESS' | 'MISSING' | 'INVALID' };
}

interface Bucket {
  share_of_rows?: number;
  plays_mean?: number;
  pass_att_mean?: number;
  rush_att_mean?: number;
  pass_rate_mean?: number;
}
type Buckets = Partial<Record<'lead14+' | 'lead7-13' | 'within6' | 'trail7-13' | 'trail14+', Bucket>>;
type CloseBuckets = Partial<Record<'win1-6' | 'tie' | 'lose1-6', Bucket>>;

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

const nick = (name: string | undefined, abbr: string, sport?: string) => {
  if (!name) return abbr;
  // College names are one name ("Iowa State"): their last word names nobody.
  if (sport === 'CFB') return cfbName(abbr, name);
  const w = name.split(' ');
  // "New York Jets Jets" → "Jets"; "Washington Commanders" → "Commanders"
  return w[w.length - 1] || abbr;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function gameScripts(r: EventResearchDoc): ScriptSet | null {
  const gsi = (r.extensions as any)?.game_script_inputs;
  const tv = gsi?.team_volume as Record<string, { by_final_margin?: Buckets; by_close_result?: CloseBuckets }> | undefined;
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
  const auth = closeSplitAuthorization(gsi?.calibration_gates);
  const split = auth === 'SHOW' ? closeSplit(hb, tv?.[homeAbbr]?.by_close_result, tv?.[awayAbbr]?.by_close_result) : null;

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
  const sport = (r.event as { sport?: string }).sport ?? (r as { sport?: string }).sport;
  const name = { home: nick(homeP.display_name, homeAbbr, sport), away: nick(awayP.display_name, awayAbbr, sport) };
  type PooledId = 'fav-big' | 'fav' | 'close' | 'dog';
  const keys: Record<PooledId, (keyof Buckets)[]> =
    fav === 'home'
      ? { 'fav-big': ['lead14+'], fav: ['lead7-13'], close: ['within6'], dog: ['trail7-13', 'trail14+'] }
      : { 'fav-big': ['trail14+'], fav: ['trail7-13'], close: ['within6'], dog: ['lead7-13', 'lead14+'] };
  const mk = (id: PooledId, index: GameScript['index'], title: string, canonical: string, summary: string, leader: 'home' | 'away' | null): GameScript => {
    const s = sum(keys[id]);
    return { id, index, name: title, canonical, summary, story: summary, line: summary, detail: null, share: s.share, home: span(keys[id]), leader, volume: { home: s.home, away: s.away } };
  };
  // A close win, from the split: the winner's own win1-6 bucket and the loser's lose1-6 bucket are the same rows.
  const mkClose = (id: 'fav-close' | 'dog-close', index: 3 | 5, side: 'home' | 'away', title: string, canonical: string, summary: string): GameScript => {
    const h = split!.home[side === 'home' ? 'win1-6' : 'lose1-6']!;
    const a = split!.away[side === 'home' ? 'lose1-6' : 'win1-6'];
    const ph = pool([h]);
    const pa = pool([a]);
    const vol = (x: typeof ph): TeamVolume => ({ plays: x.plays, passAtt: x.passAtt, rushAtt: x.rushAtt, passRate: x.passRate });
    return { id, index, name: title, canonical, summary, story: summary, line: summary, detail: null, share: h.share_of_rows ?? 0,
      home: side === 'home' ? { lo: 1, hi: 6 } : { lo: -6, hi: -1 }, leader: side, volume: { home: vol(ph), away: vol(pa) } };
  };
  // DISPLAY LANGUAGE. The four margin buckets are the model's; only their titles are written for a casual fan, and
  // every one names a team (owner item 8): "Win Big" (14+), "Win Comfortably" (7–13, or 7+ for the underdog) and, for
  // the POOLED one-score bucket, "<underdog> Keep It Close" — the bucket is the underdog finishing within 6 either way, which
  // includes the underdog winning a one-score game. No title implies scoring (the publication simulates no joint
  // margin × points script) or game flow. Index is the script's colour identity and never changes; the list itself is
  // ordered most likely first. A college name is one singular name ("Iowa State Wins Big"); a club nickname is plural.
  const abbr = { home: homeAbbr, away: awayAbbr };
  const one = sport === 'CFB';
  const v = (plural: string, singular: string) => (one ? singular : plural);
  // With the split published, the one-score game becomes two scripts, one per winner ("Bears Win a Close One"), and
  // the pooled script is not shown. Without it, the pooled script keeps its 1.0.0 title (the underdog finishing within 6).
  const close = split
    ? [
        mkClose('fav-close', 3, fav, `${name[fav]} ${v('Win', 'Wins')} a Close One`, `${abbr[fav]} by 1–6`, `${name[fav]} ${v('win', 'wins')} by 1 to 6.`),
        mkClose('dog-close', 5, dog, `${name[dog]} ${v('Win', 'Wins')} a Close One`, `${abbr[dog]} by 1–6`, `${name[dog]} ${v('win', 'wins')} by 1 to 6.`),
      ]
    : [mk('close', 3, `${name[dog]} ${v('Keep', 'Keeps')} It Close`, 'Within 6 either way', `${name[fav]} or ${name[dog]} by 6 points or fewer.`, null)];
  const scripts = sortScripts([
    mk('fav-big', 1, `${name[fav]} ${v('Win', 'Wins')} Big`, `${abbr[fav]} by 14+`, `${name[fav]} ${v('win', 'wins')} by 14 or more.`, fav),
    mk('fav', 2, `${name[fav]} ${v('Win', 'Wins')} Comfortably`, `${abbr[fav]} by 7–13`, `${name[fav]} ${v('win', 'wins')} by 7 to 13.`, fav),
    ...close,
    mk('dog', 4, `${name[dog]} ${v('Win', 'Wins')} Comfortably`, `${abbr[dog]} by 7+`, `${name[dog]} ${v('win', 'wins')} by 7 or more.`, dog),
  ]);
  const all = sum(['lead14+', 'lead7-13', 'within6', 'trail7-13', 'trail14+']);
  const margin: Record<ScriptId, string> = {
    'fav-big': `${name[fav]} by 14 or more.`, fav: `${name[fav]} by 7 to 13.`, close: `Either team by 6 or fewer.`,
    'fav-close': `${name[fav]} by 1 to 6.`, 'dog-close': `${name[dog]} by 1 to 6.`, dog: `${name[dog]} by 7 or more.`,
  };
  for (const sc of scripts) {
    const clause = scriptClause(sc, all, name);
    sc.story = clause ? `${sc.summary} ${clause}` : sc.summary;
    sc.line = margin[sc.id];
    sc.detail = clause;
  }
  return { scripts, fav, homeAbbr, awayAbbr, names: name, tie: split ? split.tie : null, overall: { home: all.home, away: all.away }, source: gsi?.script_source ?? null, notSimulated: gsi?.not_simulated ?? [], closeSplit: { shown: !!split, gate: auth } };
}

/**
 * The publication's explicit authorisation to show the close-win split. Only `{ status: 'SHOW', displayable: true }` authorises;
 * SUPPRESS, an absent gate (older publications) and anything malformed or unknown do not (fail closed).
 */
export function closeSplitAuthorization(gates: unknown): 'SHOW' | 'SUPPRESS' | 'MISSING' | 'INVALID' {
  if (gates == null) return 'MISSING';
  const g = typeof gates === 'object' ? (gates as Record<string, unknown>).close_win_split : undefined;
  if (g == null) return 'MISSING';
  if (typeof g !== 'object') return 'INVALID';
  const { status, displayable } = g as { status?: unknown; displayable?: unknown };
  if (status === 'SHOW' && displayable === true) return 'SHOW';
  if (status === 'SUPPRESS' && displayable === false) return 'SUPPRESS';
  return 'INVALID';
}

/** Slack between the split's shares and within6 (each is rounded to 4 places by the publication). */
const SPLIT_TOL = 0.002;

/**
 * The publication's split of the one-score bucket by winner, or null when it is absent or does not re-attribute
 * within6 exactly (then the pooled script is shown — never a guessed split). Both teams must carry it, and the home
 * team's close win must be the away team's close loss.
 */
function closeSplit(hb: Buckets, home: CloseBuckets | undefined, away: CloseBuckets | undefined): { home: CloseBuckets; away: CloseBuckets; tie: number } | null {
  if (!home || !away) return null;
  const sh = (b: Bucket | undefined) => b?.share_of_rows;
  const [hw, ht, hl, aw, al] = [sh(home['win1-6']), sh(home.tie), sh(home['lose1-6']), sh(away['win1-6']), sh(away['lose1-6'])];
  if ([hw, ht, hl, aw, al].some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) return null;
  const w6 = hb.within6?.share_of_rows;
  if (w6 == null || Math.abs(hw! + ht! + hl! - w6) > SPLIT_TOL) return null;
  if (Math.abs(hw! - al!) > SPLIT_TOL || Math.abs(hl! - aw!) > SPLIT_TOL) return null;
  return { home, away, tie: ht! };
}

/** The share of simulated games decided by six points or fewer (either winner, ties included). */
export function oneScoreShare(set: ScriptSet): number {
  return set.scripts.filter((s) => s.id === 'close' || s.id === 'fav-close' || s.id === 'dog-close').reduce((a, s) => a + s.share, 0) + (set.tie ?? 0);
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
