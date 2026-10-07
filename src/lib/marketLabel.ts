// Human-readable market names. ONE formatter for every market Sift shows: a Kalshi ticker such as
// KXNFLRSHYDS-26OCT05ATLNO-ATLBROBINSON7-80 is never a primary label — it becomes
// "Bijan Robinson over 79.5 rushing yards". The raw ticker stays on the market object for mapping and is
// shown only in provenance details.
//
// Kalshi YES conditions map one-to-one to sportsbook language:
//   team margin > 0            → "Falcons moneyline"
//   team margin > 2.5          → "Falcons −2.5"
//   total_points >= 48         → "Game total over 47.5"
//   team_points >= 25          → "Falcons team total over 24.5"
//   player stat >= 80          → "Bijan Robinson over 79.5 rushing yards"
// The label is built from the market's structured fields (family, period, subject, threshold); when only
// a ticker is known (price history rows, moves, newly listed contracts) the ticker grammar is parsed.
import type { Market } from '../contract/types';
import { describeMlbMarket, isMlbTicker, mlbNick } from './mlb';
import { isFullGame } from './period';

export interface LabelContext {
  /** Team abbreviation for a participant id. */
  abbrOf?: (pid: string | null) => string | null;
  /** Player display name for a player id. */
  playerName?: (id: string | null) => string | null;
  /** Team nickname for an abbreviation (defaults to the sport's built-in table: NFL, or MLB for baseball). */
  teamName?: (abbr: string) => string | null;
  /** The sport the market belongs to. Only NFL (the default) falls back to the NFL nickname table: an MLB "ATL"
   * is the Braves, never the Falcons; other sports keep the bare abbreviation. */
  sport?: string;
}

export interface MarketLabel {
  /** Full readable name: "Falcons team total over 24.5". */
  title: string;
  /** Compact form for dense rows: "ATL O 24.5". */
  short: string;
  /** Who/what it is about: a team nickname, a player, or null (game-level). */
  subject: string | null;
}

export const NFL_NICK: Record<string, string> = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
  DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', JAC: 'Jaguars',
  KC: 'Chiefs', LA: 'Rams', LAR: 'Rams', LAC: 'Chargers', LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots',
  NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders', WSH: 'Commanders',
};
const TEAM_CODES = Object.keys(NFL_NICK).sort((a, b) => b.length - a.length);

const PERIOD_ADJ: Record<string, string> = { '1H': 'First-half', '2H': 'Second-half', '1Q': '1st-quarter', '2Q': '2nd-quarter', '3Q': '3rd-quarter', '4Q': '4th-quarter' };
const PERIOD_NOUN: Record<string, string> = { '1H': 'first half', '2H': 'second half', '1Q': '1st quarter', '2Q': '2nd quarter', '3Q': '3rd quarter', '4Q': '4th quarter' };
const PERIOD_SHORT: Record<string, string> = { '1H': '1H', '2H': '2H', '1Q': 'Q1', '2Q': 'Q2', '3Q': 'Q3', '4Q': 'Q4' };

const STAT_WORDS: Record<string, [string, string]> = {
  // stat: [words after the line, compact]
  passing_yards: ['passing yards', 'pass yds'], rushing_yards: ['rushing yards', 'rush yds'], receiving_yards: ['receiving yards', 'rec yds'],
  receptions: ['receptions', 'rec'], carries: ['carries', 'car'], attempts: ['pass attempts', 'att'], completions: ['completions', 'cmp'],
  passing_tds: ['passing TDs', 'pass TD'], interceptions: ['interceptions thrown', 'INT'], touchdowns: ['touchdowns', 'TD'],
  rush_rec_yards: ['rushing + receiving yards', 'rush+rec yds'], longest_reception: ['yards on his longest catch', 'long rec'],
  longest_rush: ['yards on his longest run', 'long rush'], fantasy_points: ['fantasy points', 'fpts'], field_goals: ['field goals', 'FG'],
  team_sacks: ['sacks', 'sacks'], team_yards: ['total yards', 'yds'], sacks: ['sacks', 'sacks'],
};

const LEADER_WORDS: Record<string, string> = { receiving_yards: 'receiving yards', rushing_yards: 'rushing yards', passing_yards: 'passing yards', receptions: 'receptions' };

/** "≥ 80" on a whole number is "over 79.5"; a half line stays as published. */
export function overLine(t: number): string {
  const v = Number.isInteger(t) ? t - 0.5 : t;
  return String(v);
}

const minus = (t: number) => `−${t}`;

function nickOf(abbr: string | null | undefined, ctx: LabelContext): string | null {
  if (!abbr) return null;
  const own = ctx.teamName?.(abbr);
  if (own) return own;
  const sport = (ctx.sport ?? 'NFL').toUpperCase();
  if (sport === 'MLB') return mlbNick(abbr);
  if (sport !== 'NFL') return abbr;
  return NFL_NICK[abbr.toUpperCase()] ?? abbr;
}

/** "CHI Bears D/ST" → "Bears D/ST"; "Chicago" (a team subject) stays. */
function cleanSubject(s: string | null | undefined): string | null {
  if (!s) return null;
  const dst = /^([A-Z]{2,3})\s+(\S+)\s+D\/ST$/.exec(s);
  return dst ? `${dst[2]} D/ST` : s;
}

// ------------------------------------------------------------------ ticker grammar

export interface ParsedTicker {
  series: string;
  /** "26OCT05" + team codes: away then home. */
  away: string | null;
  home: string | null;
  suffix: string[];
  period: string | null;
  kind: string;
}

const SERIES_KIND: [RegExp, string][] = [
  [/^KXNFLGAME$/, 'game_winner'], [/^KXNFL(\d[HQ])?SPREAD$/, 'spread'], [/^KXNFL(\d[HQ])?TOTAL$/, 'total'],
  [/^KXNFL(\d[HQ])?TEAMTOTAL$/, 'team_total'], [/^KXNFLWINMARGIN$/, 'win_margin_bucket'], [/^KXNFLRACE$/, 'race_to_n'],
  [/^KXNFL1HFT$/, 'half_full_result'], [/^KXNFL(\d[HQ])BTTS$/, 'both_teams_score'], [/^KXNFLBOTH$/, 'both_teams_score_n'],
  [/^KXNFLFIRSTTDTEAM$/, 'first_td_team'], [/^KXNFLFIRSTTD$/, 'first_td_scorer'], [/^KXNFLMOST(\w+)$/, 'game_player_leader'],
  [/^KXNFLTEAM(SACK|YDS)$/, 'team_stat'], [/^KXNFLOT$/, 'overtime'], [/^KXNFLSFTY$/, 'safety'], [/^KXNFLDSTTD$/, 'defensive_st_td'],
  [/^KXNFLEQBTTS$/, 'every_quarter_btts'], [/^KXNFL(\d[HQ])$/, 'period_winner'],
  [/^KXNFL(PASSYDS|RSHYDS|RECYDS|REC|RSHATT|PASSATT|PASSCOMP|PASSINT|PASSTDS|TD|RRYDS|LONGREC|LONGRSH|FFPTS|FG)$/, 'player_stat'],
];
const SERIES_STAT: Record<string, string> = {
  PASSYDS: 'passing_yards', RSHYDS: 'rushing_yards', RECYDS: 'receiving_yards', REC: 'receptions', RSHATT: 'carries', PASSATT: 'attempts',
  PASSCOMP: 'completions', PASSINT: 'interceptions', PASSTDS: 'passing_tds', TD: 'touchdowns', RRYDS: 'rush_rec_yards', LONGREC: 'longest_reception',
  LONGRSH: 'longest_rush', FFPTS: 'fantasy_points', FG: 'field_goals', SACK: 'team_sacks', YDS: 'team_yards',
};
const LEADER_STAT: Record<string, string> = { RECYDS: 'receiving_yards', RSHYDS: 'rushing_yards', PASSYDS: 'passing_yards', REC: 'receptions' };

function splitTeams(code: string): [string | null, string | null] {
  for (const a of TEAM_CODES) {
    if (!code.startsWith(a)) continue;
    const rest = code.slice(a.length);
    if (NFL_NICK[rest]) return [a, rest];
  }
  return [null, null];
}

/** Leading team code of a suffix like "ATLBROBINSON7" or "CHI10". */
function leadTeam(s: string): [string | null, string] {
  for (const a of TEAM_CODES) if (s.startsWith(a)) return [a, s.slice(a.length)];
  return [null, s];
}

export function parseKalshiTicker(ticker: string): ParsedTicker | null {
  const parts = ticker.split('-');
  if (parts.length < 2 || !/^KX/.test(parts[0])) return null;
  const series = parts[0];
  const ev = /^\d{2}[A-Z]{3}\d{2}([A-Z]+)$/.exec(parts[1] ?? '');
  const [away, home] = ev ? splitTeams(ev[1]) : [null, null];
  const kind = SERIES_KIND.find(([re]) => re.test(series))?.[1] ?? 'unknown';
  const per = /^KXNFL(\d[HQ])/.exec(series)?.[1] ?? null;
  return { series, away, home, suffix: parts.slice(2), period: kind === 'period_winner' || per ? per : null, kind };
}

/** "BROBINSON7" → "B. Robinson" (ticker player codes: first initial, surname, jersey). */
function tickerPlayer(code: string): string {
  const m = /^([A-Z])([A-Z']+?)(\d+)?$/.exec(code);
  if (!m) return code;
  const sur = m[2].charAt(0) + m[2].slice(1).toLowerCase();
  return `${m[1]}. ${sur}`;
}

function fromTicker(ticker: string, ctx: LabelContext): MarketLabel | null {
  const p = parseKalshiTicker(ticker);
  if (!p) return null;
  const s0 = p.suffix[0] ?? '';
  const per = p.period;
  switch (p.kind) {
    case 'game_winner': {
      const n = nickOf(s0, ctx);
      return { title: `${n} moneyline`, short: `${s0} to win`, subject: n };
    }
    case 'spread': {
      const [team, rest] = leadTeam(s0);
      const v = Number(rest);
      if (!team || !Number.isFinite(v)) break;
      return build({ market_family: 'spread', period: per ?? 'FULL', threshold: v - 0.5, subjectAbbr: team }, ctx);
    }
    case 'total': {
      const v = Number(s0);
      if (!Number.isFinite(v)) break;
      return build({ market_family: 'total', period: per ?? 'FULL', threshold: v }, ctx);
    }
    case 'team_total': {
      const [team, rest] = leadTeam(s0);
      const v = Number(rest);
      if (!team || !Number.isFinite(v)) break;
      return build({ market_family: 'team_total', period: per ?? 'FULL', threshold: v, subjectAbbr: team }, ctx);
    }
    case 'player_stat': {
      const statKey = SERIES_STAT[p.series.replace(/^KXNFL/, '')];
      const [team, code] = leadTeam(s0);
      const fg = statKey === 'field_goals';
      const who = code === 'DST' || /DST$/.test(s0) ? `${nickOf(team, ctx)} D/ST` : fg ? nickOf(team, ctx) : tickerPlayer(code);
      const raw = (fg ? code : p.suffix[1] ?? '').replace('P', '.');
      const v = Number(raw);
      if (raw === '' || !Number.isFinite(v)) break;
      // Fantasy lines carry a decimal (16P6 = 16.6) and settle on "at least the next whole point" (17).
      const t = raw.includes('.') ? Math.ceil(v) : v;
      return build({ market_family: 'player_stat', period: 'FULL', threshold: t, stat: statKey, subjectName: who }, ctx);
    }
    case 'game_player_leader': {
      const stat = LEADER_STAT[p.series.replace(/^KXNFLMOST/, '')] ?? null;
      const [, code] = leadTeam(s0);
      return build({ market_family: 'game_player_leader', period: 'FULL', stat, subjectName: tickerPlayer(code) }, ctx);
    }
    case 'win_margin_bucket': case 'race_to_n': case 'half_full_result': case 'both_teams_score': case 'both_teams_score_n':
    case 'first_td_team': case 'first_td_scorer': case 'team_stat': case 'overtime': case 'safety': case 'defensive_st_td':
    case 'every_quarter_btts': case 'period_winner':
      return build({ market_family: p.kind, period: per ?? 'FULL', ticker, parsed: p }, ctx);
  }
  return null;
}

// ------------------------------------------------------------------ structured fields

interface Fields {
  market_family: string;
  period: string | null;
  threshold?: number | null;
  stat?: string | null;
  subjectAbbr?: string | null;
  subjectName?: string | null;
  ticker?: string;
  parsed?: ParsedTicker | null;
  description?: string | null;
}

function build(f: Fields, ctx: LabelContext): MarketLabel | null {
  const per = f.period && !isFullGame(f.period) ? f.period : null;
  const adj = per ? `${PERIOD_ADJ[per] ?? per} ` : '';
  const ps = per ? `${PERIOD_SHORT[per] ?? per} ` : '';
  const abbr = f.subjectAbbr ?? null;
  const nick = nickOf(abbr, ctx);
  const t = f.threshold ?? null;
  const p = f.parsed ?? (f.ticker ? parseKalshiTicker(f.ticker) : null);
  const s0 = p?.suffix[0] ?? '';
  switch (f.market_family) {
    case 'game_winner':
      if (!nick) return null;
      return { title: `${adj}${nick} moneyline`, short: `${ps}${abbr} to win`, subject: nick };
    case 'spread':
      if (!nick || t == null) return null;
      return { title: `${adj}${nick} ${minus(t)}`, short: `${ps}${abbr} ${minus(t)}`, subject: nick };
    case 'total':
      if (t == null) return null;
      return { title: per ? `${adj}total over ${overLine(t)}` : `Game total over ${overLine(t)}`, short: `${ps}O ${overLine(t)}`, subject: null };
    case 'team_total':
      if (!nick || t == null) return null;
      return { title: `${adj}${nick} team total over ${overLine(t)}`, short: `${ps}${abbr} O ${overLine(t)}`, subject: nick };
    case 'player_stat': {
      const who = f.subjectName ?? 'Player';
      const [words, shortWords] = STAT_WORDS[f.stat ?? ''] ?? [(f.stat ?? 'stat').replace(/_/g, ' '), (f.stat ?? '').replace(/_/g, ' ')];
      if (t == null) return { title: `${who} ${words}`, short: `${who} ${shortWords}`, subject: who };
      if (f.stat === 'touchdowns') {
        return t <= 1 ? { title: `${who} anytime touchdown`, short: `${who} anytime TD`, subject: who } : { title: `${who} ${t}+ touchdowns`, short: `${who} ${t}+ TD`, subject: who };
      }
      if (f.stat === 'longest_reception' || f.stat === 'longest_rush') {
        const what = f.stat === 'longest_reception' ? 'longest catch' : 'longest run';
        return { title: `${who} ${what} over ${overLine(t)} yards`, short: `${who} ${f.stat === 'longest_reception' ? 'long rec' : 'long rush'} O ${overLine(t)}`, subject: who };
      }
      if (f.stat === 'fantasy_points') return { title: `${who} ${t}+ fantasy points`, short: `${who} ${t}+ fpts`, subject: who };
      if (f.stat === 'interceptions' && t <= 1) return { title: `${who} throws an interception`, short: `${who} INT`, subject: who };
      return { title: `${who} over ${overLine(t)} ${words}`, short: `${who} O ${overLine(t)} ${shortWords}`, subject: who };
    }
    case 'game_player_leader': {
      const who = f.subjectName ?? (s0 ? tickerPlayer(leadTeam(s0)[1]) : 'Player');
      const stat = f.stat ?? (p ? LEADER_STAT[p.series.replace(/^KXNFLMOST/, '')] : null) ?? null;
      const w = LEADER_WORDS[stat ?? ''] ?? (stat ?? 'the stat').replace(/_/g, ' ');
      return { title: `${who} leads the game in ${w}`, short: `${who} most ${STAT_WORDS[stat ?? '']?.[1] ?? w}`, subject: who };
    }
    case 'first_td_scorer': {
      const who = f.subjectName ?? (s0 ? tickerPlayer(leadTeam(s0)[1]) : 'Player');
      return { title: `${who} scores the first touchdown`, short: `${who} first TD`, subject: who };
    }
    case 'first_td_team': {
      const team = abbr ?? (s0 && s0 !== 'NONE' ? s0 : null);
      if (!team) return { title: 'No touchdown in the game', short: 'No TD', subject: null };
      const n = nickOf(team, ctx);
      return { title: `${n} score the first touchdown`, short: `${team} first TD`, subject: n };
    }
    case 'race_to_n': {
      const target = t ?? Number(s0);
      const team = abbr ?? p?.suffix[1] ?? null;
      if (!team || team === 'NONE') return { title: `Neither team reaches ${target} points`, short: `Nobody to ${target}`, subject: null };
      const n = nickOf(team, ctx);
      return { title: `${n} first to ${target} points`, short: `${team} first to ${target}`, subject: n };
    }
    case 'win_margin_bucket': {
      const m = /^([A-Z]{2,3}?)(\d+)(?:TO(\d+)|PLUS)$/.exec(s0);
      if (s0 === 'TIE') return { title: 'Game ends in a tie', short: 'Tie', subject: null };
      const team = abbr ?? m?.[1] ?? null;
      if (!m || !team) return null;
      const n = nickOf(team, ctx);
      const range = m[3] ? `${m[2]}–${m[3]}` : `${m[2]}+`;
      return { title: `${n} win by ${range}`, short: `${team} by ${range}`, subject: n };
    }
    case 'half_full_result': {
      // Halftime result, then full-game result: CHINYJ = CHI lead at the half, NYJ win.
      const [a, rest] = s0.startsWith('TIE') ? ['TIE', s0.slice(3)] : leadTeam(s0);
      const b = rest;
      if (!a || !b) return null;
      const half = a === 'TIE' ? 'Tied at the half' : `${nickOf(a, ctx)} lead at the half`;
      const full = b === 'TIE' ? 'game ends tied' : `${nickOf(b, ctx)} win`;
      return { title: `${half}, ${full}`, short: `HT ${a} / FT ${b}`, subject: null };
    }
    case 'both_teams_score': {
      const noun = per ? PERIOD_NOUN[per] ?? per : 'game';
      return { title: `Both teams score in the ${noun}`, short: `${ps}both score`, subject: null };
    }
    case 'every_quarter_btts':
      return { title: 'Both teams score in every quarter', short: 'Both score each Q', subject: null };
    case 'both_teams_score_n': {
      const v = t ?? Number(s0);
      return { title: `Both teams score ${v}+ points`, short: `Both ${v}+`, subject: null };
    }
    case 'team_stat': {
      const [team, rest] = leadTeam(s0);
      const v = Number(rest);
      const kind = p?.series.endsWith('SACK') ? 'sacks' : 'total yards';
      if (!team || !Number.isFinite(v)) return null;
      const n = nickOf(team, ctx);
      return { title: `${n} ${v}+ ${kind}`, short: `${team} ${v}+ ${kind === 'sacks' ? 'sacks' : 'yds'}`, subject: n };
    }
    case 'period_winner': {
      const team = abbr ?? s0;
      if (!team) return null;
      const n = nickOf(team, ctx);
      return { title: `${n} win the ${per ? PERIOD_NOUN[per] ?? per : 'game'}`, short: `${ps}${team} win`, subject: n };
    }
    case 'overtime': return { title: 'Game goes to overtime', short: 'Overtime', subject: null };
    case 'safety': return { title: 'A safety is scored', short: 'Safety', subject: null };
    case 'defensive_st_td': return { title: 'Defensive or special-teams touchdown', short: 'D/ST TD', subject: null };
  }
  return null;
}

/** Strip the contract's machine phrasing from a published YES condition (last resort). */
export function cleanDescription(d: string | null | undefined): string {
  return (d ?? '')
    .replace(/^YES iff /, '')
    .replace(/\s*\((FULL|1H|2H|1Q|2Q|3Q|4Q)\)/g, '')
    .replace(/\s*\[subject: [^\]]+\]/g, '')
    .replace(/_/g, ' ')
    .replace(/>=/g, '≥')
    .trim();
}

type MarketLike = Partial<Pick<Market, 'market_family' | 'period' | 'participant_id' | 'player_id' | 'threshold' | 'yes_description' | 'extensions'>> & { kalshi_ticker: string; title?: string | null };

const NHL_PERIOD: Record<string, string> = { P1: '1st period', P2: '2nd period', P3: '3rd period' };

/**
 * NHL markets in plain hockey language, from the publication's own structured fields and YES wording
 * ("Carolina wins by over 1.5 goals" → "Carolina −1.5"). The NFL nickname table is never consulted: hockey
 * clubs share abbreviations (CAR, SEA, DAL …) with football teams.
 */
export function describeNhlMarket(m: MarketLike): MarketLabel | null {
  const d = cleanDescription(m.yes_description).replace(/^Full Game: /, '');
  if (!d) return null;
  const fam = m.market_family ?? '';
  const per = NHL_PERIOD[m.period ?? ''] ?? null;
  let mm: RegExpExecArray | null;
  const ret = (title: string, short = title, subject: string | null = null): MarketLabel => ({ title, short, subject });
  if (fam === 'game_winner' && (mm = /^(.+?) wins$/.exec(d))) return ret(`${mm[1]} to win`, `${mm[1]} ML`, mm[1]);
  if ((fam === 'game_spread' || fam === 'period_spread') && (mm = /^(.+?) wins(?: the \S+ period)? by over ([\d.]+) goals?/.exec(d))) {
    return ret(`${mm[1]} −${mm[2]}${per ? ` (${per})` : ''}`, `${mm[1]} −${mm[2]}`, mm[1]);
  }
  if ((fam === 'game_total' || fam === 'period_total') && (mm = /Over ([\d.]+) goals/i.exec(d))) {
    return ret(`${per ? `${per[0].toUpperCase()}${per.slice(1)}` : 'Game'} total over ${mm[1]} goals`, `${per ? per.slice(0, 3) : 'Total'} O ${mm[1]}`);
  }
  if (fam === 'team_total' && (mm = /^(.+?) over ([\d.]+) goals/.exec(d))) return ret(`${mm[1]} team total over ${mm[2]} goals`, `${mm[1]} O ${mm[2]}`, mm[1]);
  if (fam === 'period_winner' && (mm = /^(.+?) wins the (\S+) period/.exec(d))) return ret(`${mm[1]} wins the ${mm[2]} period`, `${mm[1]} ${mm[2]}`, mm[1]);
  if (fam === 'player_goals' && (mm = /^(.+?): (\d+)\+ goals?/.exec(d))) {
    return ret(mm[2] === '1' ? `${mm[1]} to score a goal` : `${mm[1]} ${mm[2]}+ goals`, `${mm[1]} ${mm[2]}+ G`, mm[1]);
  }
  if (fam === 'player_assists' && (mm = /^(.+?): (\d+)\+ assists?/.exec(d))) return ret(`${mm[1]} ${mm[2]}+ assist${mm[2] === '1' ? '' : 's'}`, `${mm[1]} ${mm[2]}+ A`, mm[1]);
  if (fam === 'player_points' && (mm = /^(.+?): (\d+)\+ points?/.exec(d))) return ret(`${mm[1]} ${mm[2]}+ point${mm[2] === '1' ? '' : 's'}`, `${mm[1]} ${mm[2]}+ P`, mm[1]);
  if (fam === 'goalie_saves' && (mm = /^(.+?): (\d+)\+ saves/.exec(d))) return ret(`${mm[1]} over ${Number(mm[2]) - 0.5} saves`, `${mm[1]} O ${Number(mm[2]) - 0.5} SV`, mm[1]);
  if (fam === 'first_goal' && (mm = /^(.+?): First Goalscorer/i.exec(d))) return ret(`${mm[1]} scores the first goal`, `${mm[1]} 1st G`, mm[1]);
  return ret(d);
}

/** The readable name of any market. Never returns a raw ticker unless nothing else is known about it. */
export function describeMarket(m: MarketLike, ctx: LabelContext = {}): MarketLabel {
  if (isMlbTicker(m.kalshi_ticker) || ctx.sport === 'MLB') return describeMlbMarket(m, ctx);
  if (/^KXNHL/.test(m.kalshi_ticker)) {
    const nhl = describeNhlMarket(m);
    if (nhl) return nhl;
    if (m.title) return { title: m.title, short: m.title, subject: null };
  }
  const ext = (m.extensions ?? {}) as { stat?: string; subject?: string };
  const p = parseKalshiTicker(m.kalshi_ticker);
  const abbr = ctx.abbrOf?.(m.participant_id ?? null) ?? (ext.subject && /^[A-Z]{2,3}$/.test(ext.subject) ? ext.subject : null);
  const player = ctx.playerName?.(m.player_id ?? null) ?? cleanSubject(ext.subject);
  const family = m.market_family === 'game_event' ? (ext.stat === 'btts' ? 'every_quarter_btts' : ext.stat ?? 'game_event') : m.market_family;
  let teamAbbr = abbr;
  // Team-anchored families whose participant isn't joined: read the team from the ticker suffix.
  if (!teamAbbr && p && ['spread', 'team_total', 'game_winner', 'period_winner'].includes(family ?? '')) teamAbbr = leadTeam(p.suffix[0] ?? '')[0];
  if (family) {
    const statKey = ext.stat ?? (p && p.kind === 'player_stat' ? SERIES_STAT[p.series.replace(/^KXNFL/, '')] : null);
    const subj = family === 'player_stat' && statKey === 'field_goals' ? nickOf(teamAbbr ?? leadTeam(p?.suffix[0] ?? '')[0], ctx) : player;
    const got = m.threshold != null || !['spread', 'total', 'team_total', 'player_stat'].includes(family)
      ? build({ market_family: family, period: m.period ?? p?.period ?? 'FULL', threshold: m.threshold ?? null, stat: statKey, subjectAbbr: teamAbbr, subjectName: subj, ticker: m.kalshi_ticker, parsed: p, description: m.yes_description }, ctx)
      : null;
    if (got) return got;
  }
  const fromT = fromTicker(m.kalshi_ticker, ctx);
  if (fromT) return fromT;
  if (m.title) return { title: m.title, short: m.title, subject: null };
  const clean = cleanDescription(m.yes_description);
  if (clean && !/^YES on KX/.test(m.yes_description ?? '') && !/^heterogeneous/.test(clean)) return { title: clean, short: clean, subject: null };
  return { title: 'Kalshi contract', short: 'Contract', subject: null };
}

/** A market's readable title when only its ticker is known (price-history rows, moves). */
export function tickerTitle(ticker: string, known?: Map<string, MarketLike>, ctx: LabelContext = {}): string {
  const m = known?.get(ticker);
  return describeMarket(m ?? { kalshi_ticker: ticker }, ctx).title;
}

/**
 * Publication prose (key questions, notes) with any Kalshi ticker written out as its market title, so a
 * sentence never shows a raw ID: "The model disagrees on KXNFLRSHATT-… (Bijan Robinson)" →
 * "The model disagrees on Bijan Robinson over 16.5 rushing attempts".
 */
export function readableNote(text: string, known?: Map<string, MarketLike>): string {
  return text.replace(/\bKX[A-Z0-9]+-[A-Z0-9-]*[A-Z0-9]/g, (t) => `“${tickerTitle(t, known)}”`).replace(/“([^”]+)” \(([^)]+)\)/g, (all, title: string, name: string) => (title.includes(name) ? `“${title}”` : all));
}

