// Baseball on Sift: MLB club identity (nicknames, colours), the KXMLB* market grammar in plain baseball language,
// and the publisher's per-market player-prop object (`market.extensions.player_prop`, schema mlb.player_prop.v1).
//
// Nothing here creates a number. A player prop's MODEL probability is read only from model_probability_yes, and
// only when projection_status is a *_PROJECTION; every other status is shown as a status with its reason, never as
// a model number and never with the market price standing in for one. No "edge" is ever derived for a prop.
import type { Market } from '../contract/types';
import { inningWords, isFullGame } from './period';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MlbClub { nick: string; colors: [string, string] }

/** All 30 clubs, by the abbreviations the MLB publication and Kalshi use (aliases below). */
export const MLB_CLUBS: Record<string, MlbClub> = {
  AZ: { nick: 'Diamondbacks', colors: ['#A71930', '#E3D4AD'] }, ATL: { nick: 'Braves', colors: ['#CE1141', '#13274F'] },
  BAL: { nick: 'Orioles', colors: ['#DF4601', '#000000'] }, BOS: { nick: 'Red Sox', colors: ['#BD3039', '#0C2340'] },
  CHC: { nick: 'Cubs', colors: ['#0E3386', '#CC3433'] }, CWS: { nick: 'White Sox', colors: ['#27251F', '#C4CED4'] },
  CIN: { nick: 'Reds', colors: ['#C6011F', '#000000'] }, CLE: { nick: 'Guardians', colors: ['#00385D', '#E50022'] },
  COL: { nick: 'Rockies', colors: ['#33006F', '#C4CED4'] }, DET: { nick: 'Tigers', colors: ['#0C2340', '#FA4616'] },
  HOU: { nick: 'Astros', colors: ['#002D62', '#EB6E1F'] }, KC: { nick: 'Royals', colors: ['#004687', '#BD9B60'] },
  LAA: { nick: 'Angels', colors: ['#BA0021', '#003263'] }, LAD: { nick: 'Dodgers', colors: ['#005A9C', '#EF3E42'] },
  MIA: { nick: 'Marlins', colors: ['#00A3E0', '#EF3340'] }, MIL: { nick: 'Brewers', colors: ['#12284B', '#FFC52F'] },
  MIN: { nick: 'Twins', colors: ['#002B5C', '#D31145'] }, NYM: { nick: 'Mets', colors: ['#002D72', '#FF5910'] },
  NYY: { nick: 'Yankees', colors: ['#0C2340', '#C4CED4'] }, ATH: { nick: 'Athletics', colors: ['#003831', '#EFB21E'] },
  PHI: { nick: 'Phillies', colors: ['#E81828', '#002D72'] }, PIT: { nick: 'Pirates', colors: ['#27251F', '#FDB827'] },
  SD: { nick: 'Padres', colors: ['#2F241D', '#FFC425'] }, SF: { nick: 'Giants', colors: ['#FD5A1E', '#27251F'] },
  SEA: { nick: 'Mariners', colors: ['#0C2C56', '#005C5C'] }, STL: { nick: 'Cardinals', colors: ['#C41E3A', '#0C2340'] },
  TB: { nick: 'Rays', colors: ['#092C5C', '#8FBCE6'] }, TEX: { nick: 'Rangers', colors: ['#003278', '#C0111F'] },
  TOR: { nick: 'Blue Jays', colors: ['#134A8E', '#1D2D5C'] }, WSH: { nick: 'Nationals', colors: ['#AB0003', '#14225A'] },
};
const ALIAS: Record<string, string> = { ARI: 'AZ', OAK: 'ATH', CHW: 'CWS', WAS: 'WSH', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', ANA: 'LAA' };

export function mlbClub(abbr: string | null | undefined): MlbClub | null {
  if (!abbr) return null;
  const a = abbr.toUpperCase();
  return MLB_CLUBS[a] ?? MLB_CLUBS[ALIAS[a] ?? ''] ?? null;
}

/** The registry code for a club ("OAK" → "ATH", "CHW" → "CWS"), or null for an unknown code. */
export function mlbCode(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const a = abbr.toUpperCase();
  return MLB_CLUBS[a] ? a : ALIAS[a] && MLB_CLUBS[ALIAS[a]] ? ALIAS[a] : null;
}

/** "ATL" → "Braves". Never a football name: an unknown code stays the code. */
export function mlbNick(abbr: string | null | undefined): string | null {
  return abbr ? mlbClub(abbr)?.nick ?? abbr : null;
}

const CODES = [...Object.keys(MLB_CLUBS), ...Object.keys(ALIAS)].sort((a, b) => b.length - a.length);

/** Leading club code of a ticker suffix ("LAD4", "LADTGLASNOW31"). */
export function mlbLeadTeam(s: string): [string | null, string] {
  for (const c of CODES) if (s.startsWith(c)) return [c, s.slice(c.length)];
  return [null, s];
}

// ------------------------------------------------------------------ market grammar

export type MlbKind = 'moneyline' | 'run_line' | 'total' | 'team_total' | 'period_result' | 'yrfi' | 'player' | 'unknown';

const PROP_SERIES: Record<string, string> = {
  KXMLBKS: 'pitcher_strikeouts', KXMLBOUTS: 'pitcher_outs', KXMLBHIT: 'hitter_hits', KXMLBTB: 'hitter_total_bases',
  KXMLBHRR: 'hitter_hrr', KXMLBRBI: 'hitter_rbi', KXMLBSB: 'hitter_stolen_bases', KXMLBHR: 'hitter_home_runs', KXMLBRUNS: 'hitter_runs',
};
const FAMILY_ALIAS: Record<string, string> = { hitter_hits_runs_rbis: 'hitter_hrr', hitter_rbis: 'hitter_rbi', hitter_hrs: 'hitter_home_runs' };

export const PROP_FAMILY_LABEL: Record<string, string> = {
  pitcher_strikeouts: 'Strikeouts', pitcher_outs: 'Outs recorded', hitter_hits: 'Hits', hitter_total_bases: 'Total bases',
  hitter_hrr: 'Hits + runs + RBIs', hitter_rbi: 'RBIs', hitter_runs: 'Runs', hitter_stolen_bases: 'Stolen bases', hitter_home_runs: 'Home runs',
};
const PROP_WORDS: Record<string, [string, string]> = {
  pitcher_strikeouts: ['strikeouts', 'K'], pitcher_outs: ['outs recorded', 'outs'], hitter_hits: ['hits', 'H'], hitter_total_bases: ['total bases', 'TB'],
  hitter_hrr: ['hits + runs + RBIs', 'H+R+RBI'], hitter_rbi: ['RBIs', 'RBI'], hitter_runs: ['runs', 'R'], hitter_stolen_bases: ['stolen bases', 'SB'],
  hitter_home_runs: ['home runs', 'HR'],
};

export const isMlbTicker = (t: string | null | undefined): boolean => /^KXMLB/.test(t ?? '');

type M = Partial<Pick<Market, 'market_family' | 'period' | 'participant_id' | 'player_id' | 'threshold' | 'line' | 'yes_description' | 'extensions'>> & { kalshi_ticker: string };

const series = (m: { kalshi_ticker: string }) => m.kalshi_ticker.split('-')[0];
const ext = (m: M) => (m.extensions ?? {}) as Record<string, any>;

/** The market's period: the published one, else the inning window in the series name (KXMLBF5TOTAL → F5). */
export function mlbPeriod(m: M): string | null {
  if (m.period && !isFullGame(m.period)) return m.period;
  const f = /^KXMLB(F\d)/.exec(series(m));
  if (f) return f[1];
  if (/^KXMLBRFI$/.test(series(m)) || ['yrfi', 'nrfi', 'first_inning_run'].includes(m.market_family ?? '')) return 'F1';
  return null;
}

/** The player-prop family of a market (mlb.player_prop.v1 names), or null when it is not a player prop. */
export function propFamily(m: M): string | null {
  const pp = ext(m).player_prop;
  if (pp && typeof pp === 'object' && typeof pp.family === 'string' && pp.family !== 'unknown') return pp.family;
  const f = m.market_family ?? '';
  if (/^(hitter|pitcher)_/.test(f)) return FAMILY_ALIAS[f] ?? f;
  return PROP_SERIES[series(m)] ?? null;
}

/** Is this an MLB player market (a hitter or pitcher prop), whatever the publication managed to parse? */
export function isMlbPlayerMarket(m: M): boolean {
  if (!isMlbTicker(m.kalshi_ticker)) return false;
  const e = ext(m);
  return !!(e.player_prop || propFamily(m) || m.player_id || typeof e.player === 'string');
}

export function mlbKind(m: M): MlbKind {
  if (isMlbPlayerMarket(m)) return 'player';
  const f = m.market_family ?? '';
  const s = series(m);
  if (['yrfi', 'nrfi', 'first_inning_run'].includes(f) || s === 'KXMLBRFI') return 'yrfi';
  if (['team_total', 'tt_home_over', 'tt_away_over', 'tt_home_under', 'tt_away_under'].includes(f) || /^KXMLB(F\d)?TEAMTOTAL$/.test(s)) return 'team_total';
  if (['spread', 'winning_margin', 'run_line'].includes(f) || /^KXMLB(F\d)?SPREAD$/.test(s)) return 'run_line';
  if (['total', 'game_total', 'inning_total'].includes(f) || /^KXMLB(F\d)?TOTAL$/.test(s)) return 'total';
  if (/^KXMLBF\d$/.test(s) || /^f\d_ml/.test(f) || f === 'inning_result') return 'period_result';
  if (['game_winner', 'game_result', 'ml', 'ml_home', 'ml_away', 'moneyline'].includes(f) || s === 'KXMLBGAME') return 'moneyline';
  return 'unknown';
}

/** "TGLASNOW31" → "T. Glasnow" (ticker player codes: team, first initial, surname, jersey). */
function tickerPlayer(code: string): string | null {
  const m = /^([A-Z])([A-Z']+?)(\d+)?$/.exec(code);
  return m ? `${m[1]}. ${m[2].charAt(0)}${m[2].slice(1).toLowerCase()}` : null;
}

/** The player a market is about: the prop object's name, the publication's extensions.player, else the ticker code. */
export function mlbPlayerName(m: M): string | null {
  const e = ext(m);
  if (typeof e.player_prop?.player_name === 'string' && e.player_prop.player_name) return e.player_prop.player_name;
  if (typeof e.player === 'string' && e.player) return e.player;
  const [, rest] = mlbLeadTeam(m.kalshi_ticker.split('-')[2] ?? '');
  return rest ? tickerPlayer(rest) : null;
}

/** The club a market belongs to: the prop object's team, extensions.team, else the ticker suffix's leading code. */
export function mlbTeamOf(m: M, abbrOf?: (pid: string | null) => string | null): string | null {
  const e = ext(m);
  if (typeof e.player_prop?.team === 'string' && e.player_prop.team) return e.player_prop.team;
  const viaPid = abbrOf?.(m.participant_id ?? null) ?? null;
  if (viaPid) return viaPid;
  if (typeof e.team === 'string' && e.team) return e.team;
  const s0 = m.kalshi_ticker.split('-')[2] ?? '';
  const [c] = mlbLeadTeam(s0);
  return c && s0 !== 'TIE' ? c : null;
}

/** One stable key per player: participant id when published, else the name (never the team: hitters never merge). */
export function mlbPlayerKey(m: M): string {
  const pp = ext(m).player_prop;
  return m.player_id ?? (typeof pp?.player_id === 'string' ? pp.player_id : null) ?? `name:${mlbPlayerName(m) ?? m.kalshi_ticker.split('-')[2] ?? m.kalshi_ticker}`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmtN = (v: number) => (Number.isInteger(v) ? String(v) : String(v));
/** "≥ 9" on a whole number is "over 8.5"; a half line stays as published. */
const over = (t: number) => fmtN(Number.isInteger(t) ? t - 0.5 : t);

/** The threshold of a market: the published one, else the number at the end of the ticker. */
function thresholdOf(m: M, kind: MlbKind): number | null {
  const t = num(m.threshold) ?? num(m.line);
  if (t != null) return t;
  const last = m.kalshi_ticker.split('-').slice(2).join('-');
  if (kind === 'player') {
    const v = Number(m.kalshi_ticker.split('-')[3]);
    return Number.isFinite(v) ? v : null;
  }
  const [, rest] = mlbLeadTeam(last);
  const v = Number(rest);
  if (!Number.isFinite(v) || rest === '') return null;
  return kind === 'run_line' ? v - 0.5 : kind === 'team_total' ? v - 0.5 : v;
}

export interface MlbLabel { title: string; short: string; subject: string | null }

/** Any MLB market in baseball language: "Braves moneyline", "Dodgers −1.5 (first 5 innings)", "Tyler Glasnow 9+ strikeouts". */
export function describeMlbMarket(m: M, ctx: { abbrOf?: (pid: string | null) => string | null; playerName?: (id: string | null) => string | null } = {}): MlbLabel {
  const kind = mlbKind(m);
  const per = mlbPeriod(m);
  const words = inningWords(per);
  const team = mlbTeamOf(m, ctx.abbrOf);
  const nick = mlbNick(team);
  const t = thresholdOf(m, kind);
  const s0 = m.kalshi_ticker.split('-')[2] ?? '';
  const perSuffix = words ? ` (${words.charAt(0).toLowerCase()}${words.slice(1)})` : '';
  const ps = per ? `${per} ` : '';
  switch (kind) {
    case 'moneyline':
      if (nick) return { title: `${nick} moneyline`, short: `${team} to win`, subject: nick };
      break;
    case 'period_result':
      if (s0 === 'TIE' || /tie$/i.test(m.yes_description ?? '')) return { title: `${words ?? 'Period'} tied`, short: `${ps}tie`, subject: null };
      if (nick) return { title: `${nick} lead after ${words ? words.replace(/^First /, '').replace(/^1st inning$/, '1 inning') : 'the period'}`, short: `${ps}${team}`, subject: nick };
      break;
    case 'run_line':
      if (nick && t != null) return { title: `${nick} −${fmtN(t)}${perSuffix}`, short: `${ps}${team} −${fmtN(t)}`, subject: nick };
      break;
    case 'total':
      if (t != null) return { title: words ? `${words}: over ${over(t)} runs` : `Total runs over ${over(t)}`, short: `${ps}O ${over(t)}`, subject: null };
      break;
    case 'team_total':
      if (nick && t != null) return { title: `${nick} team total over ${over(t)} runs${perSuffix}`, short: `${ps}${team} O ${over(t)}`, subject: nick };
      break;
    case 'yrfi':
      return { title: 'Run in 1st inning', short: 'YRFI', subject: null };
    case 'player': {
      const who = ctx.playerName?.(m.player_id ?? null) ?? mlbPlayerName(m) ?? 'Player';
      const fam = propFamily(m);
      const [w, sw] = PROP_WORDS[fam ?? ''] ?? [null, null];
      if (w && t != null) return { title: `${who} ${fmtN(t)}+ ${w}`, short: `${who} ${fmtN(t)}+ ${sw}`, subject: who };
      const d = cleanMlb(m.yes_description);
      if (d) return { title: d, short: d, subject: who };
      break;
    }
    default:
      break;
  }
  const d = cleanMlb(m.yes_description);
  return d ? { title: d, short: d, subject: null } : { title: 'Kalshi contract', short: 'Contract', subject: null };
}

/** A published YES condition without question marks or ticker echoes ("YES on KXMLB…" is never a label). */
function cleanMlb(d: string | null | undefined): string | null {
  const s = (d ?? '').replace(/\?\s*$/, '').trim();
  return s && !/^YES on KX/.test(s) ? s : null;
}

// ------------------------------------------------------------------ the player-prop object (mlb.player_prop.v1)

export type ProjectionStatus =
  | 'VERIFIED_PROJECTION' | 'RESEARCH_PROJECTION' | 'NO_MODEL_SUPPORT' | 'MISSING_REQUIRED_CONTEXT' | 'LINEUP_UNCONFIRMED'
  | 'PLAYER_NOT_STARTING' | 'AMBIGUOUS_MARKET' | 'GAME_STARTED';

export interface ExpectedStat { stat: string | null; mean: number | null; median: number | null; p10: number | null; p90: number | null; unit: string | null }
export interface PropValidation { status: string | null; summary: string | null; n: number | null; modelBrier: number | null; marketBrier: number | null }

export interface PlayerProp {
  playerName: string | null;
  mlbamId: string | null;
  playerId: string | null;
  role: 'PITCHER' | 'HITTER' | null;
  team: string | null;
  opponent: string | null;
  family: string | null;
  statLabel: string | null;
  threshold: number | null;
  comparison: string | null;
  yesSemantics: string | null;
  /** As published (an unknown value is kept, and treated as "not projected"). */
  status: string;
  statusReason: string | null;
  /** Non-null ONLY for VERIFIED_PROJECTION / RESEARCH_PROJECTION with a probability in [0, 1]. */
  modelProbabilityYes: number | null;
  expected: ExpectedStat | null;
  generatedAt: string | null;
  inputsAsOf: string | null;
  lineupStatus: string | null;
  lineupSlot: number | null;
  drivers: { label: string; value: string }[];
  provenance: { engine: string | null; engineVersion: string | null; source: string | null } | null;
  limitations: string[];
  validation: PropValidation | null;
  bettingEligible: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** The statuses that carry a model probability. Anything else (including an unknown status) shows none. */
export const isProjected = (status: string | null | undefined): status is 'VERIFIED_PROJECTION' | 'RESEARCH_PROJECTION' =>
  status === 'VERIFIED_PROJECTION' || status === 'RESEARCH_PROJECTION';

/** Read market.extensions.player_prop defensively; null when the market carries none. */
export function readPlayerProp(m: Pick<Market, 'extensions'> | { extensions?: Record<string, unknown> | null }): PlayerProp | null {
  const pp = (m.extensions as Record<string, any> | null | undefined)?.player_prop;
  if (!pp || typeof pp !== 'object' || Array.isArray(pp)) return null;
  const status = str(pp.projection_status) ?? 'UNKNOWN';
  const p = num(pp.model_probability_yes);
  const es = pp.expected_stat && typeof pp.expected_stat === 'object' ? pp.expected_stat : null;
  const val = pp.validation && typeof pp.validation === 'object' ? pp.validation : null;
  const prov = pp.provenance && typeof pp.provenance === 'object' ? pp.provenance : null;
  const role = pp.role === 'PITCHER' || pp.role === 'HITTER' ? pp.role : null;
  return {
    playerName: str(pp.player_name), mlbamId: str(pp.mlbam_player_id) ?? (num(pp.mlbam_player_id) != null ? String(pp.mlbam_player_id) : null),
    playerId: str(pp.player_id), role, team: str(pp.team), opponent: str(pp.opponent), family: str(pp.family), statLabel: str(pp.stat_label),
    threshold: num(pp.threshold), comparison: str(pp.comparison), yesSemantics: str(pp.yes_semantics), status, statusReason: str(pp.status_reason),
    modelProbabilityYes: isProjected(status) && p != null && p >= 0 && p <= 1 ? p : null,
    expected: es && isProjected(status) ? { stat: str(es.stat), mean: num(es.mean), median: num(es.median), p10: num(es.p10), p90: num(es.p90), unit: str(es.unit) } : null,
    generatedAt: str(pp.projection_generated_at), inputsAsOf: str(pp.inputs_as_of), lineupStatus: str(pp.lineup_status), lineupSlot: num(pp.lineup_slot),
    drivers: Array.isArray(pp.drivers) ? pp.drivers.filter((d: any) => d && str(d.label)).map((d: any) => ({ label: String(d.label), value: d.value == null ? '—' : String(d.value) })) : [],
    provenance: prov ? { engine: str(prov.engine), engineVersion: str(prov.engine_version), source: str(prov.source) } : null,
    limitations: Array.isArray(pp.limitations) ? pp.limitations.filter((x: unknown) => typeof x === 'string' && x.trim()) : [],
    validation: val ? { status: str(val.status), summary: str(val.summary), n: num(val.n), modelBrier: num(val.model_brier), marketBrier: num(val.market_brier) } : null,
    bettingEligible: pp.betting_eligible === true,
  };
}

/** The status in words, for the badge ("Not projected — lineup unconfirmed"). */
export function statusWords(status: string): string {
  switch (status) {
    case 'VERIFIED_PROJECTION': return 'Verified projection';
    case 'RESEARCH_PROJECTION': return 'Research projection';
    case 'NO_MODEL_SUPPORT': return 'Not projected — no model for this market';
    case 'MISSING_REQUIRED_CONTEXT': return 'Not projected — missing required inputs';
    case 'LINEUP_UNCONFIRMED': return 'Not projected — lineup unconfirmed';
    case 'PLAYER_NOT_STARTING': return 'Not projected — not starting';
    case 'AMBIGUOUS_MARKET': return 'Not projected — ambiguous market';
    case 'GAME_STARTED': return 'Not projected — game started';
    default: return 'Not projected';
  }
}

/** The model column's label for a status: "Model" (verified), "Model (research)" (research), null otherwise. */
export function modelLabel(status: string): string | null {
  return status === 'VERIFIED_PROJECTION' ? 'Model' : status === 'RESEARCH_PROJECTION' ? 'Model (research)' : null;
}

/** "Proj. 6.2 K (p10–p90 3–9)". */
export function expectedLine(e: ExpectedStat | null, fallbackUnit?: string | null): string | null {
  if (!e || e.mean == null) return null;
  const unit = e.unit ?? fallbackUnit ?? '';
  const mean = Math.round(e.mean * 10) / 10;
  const range = e.p10 != null && e.p90 != null ? ` (p10–p90 ${fmtN(e.p10)}–${fmtN(e.p90)})` : '';
  return `Proj. ${mean}${unit ? ` ${unit}` : ''}${range}`;
}

export const propUnit = (family: string | null | undefined): string | null => PROP_WORDS[family ?? '']?.[1] ?? null;
