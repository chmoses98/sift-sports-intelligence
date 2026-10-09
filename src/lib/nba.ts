// NBA on Sift: team identity (one deterministic table for all 30 clubs, keyed by the NBA tricode the publication uses
// as participants[].short_name) and decoders over the nba-edge-finder publication. The NBA model is RESEARCH authority
// in every family and, by the publication's own out-of-sample study, the raw Kalshi price beats it in 8 of 8 families:
// Sift shows that study and never turns an NBA model number into a recommendation.
import type { EventResearchDoc, Market, ResearchMarket } from '../contract/types';
import { cleanDescription } from './marketLabel';
import logos from './nba-team-logos.json';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NbaTeam {
  code: string;
  city: string;
  name: string;
  short: string;
  conference: 'East' | 'West';
  colors: [string, string];
}

const T = (code: string, city: string, name: string, short: string, conference: NbaTeam['conference'], c1: string, c2: string): NbaTeam => ({ code, city, name, short, conference, colors: [c1, c2] });

export const NBA_TEAMS: NbaTeam[] = [
  T('ATL', 'Atlanta', 'Hawks', 'Atlanta', 'East', '#C8102E', '#FDB927'),
  T('BOS', 'Boston', 'Celtics', 'Boston', 'East', '#007A33', '#BA9653'),
  T('BKN', 'Brooklyn', 'Nets', 'Brooklyn', 'East', '#000000', '#FFFFFF'),
  T('CHA', 'Charlotte', 'Hornets', 'Charlotte', 'East', '#1D1160', '#00788C'),
  T('CHI', 'Chicago', 'Bulls', 'Chicago', 'East', '#CE1141', '#000000'),
  T('CLE', 'Cleveland', 'Cavaliers', 'Cleveland', 'East', '#860038', '#FDBB30'),
  T('DAL', 'Dallas', 'Mavericks', 'Dallas', 'West', '#00538C', '#002B5E'),
  T('DEN', 'Denver', 'Nuggets', 'Denver', 'West', '#0E2240', '#FEC524'),
  T('DET', 'Detroit', 'Pistons', 'Detroit', 'East', '#C8102E', '#1D42BA'),
  T('GSW', 'Golden State', 'Warriors', 'Golden State', 'West', '#1D428A', '#FFC72C'),
  T('HOU', 'Houston', 'Rockets', 'Houston', 'West', '#CE1141', '#000000'),
  T('IND', 'Indiana', 'Pacers', 'Indiana', 'East', '#002D62', '#FDBB30'),
  T('LAC', 'Los Angeles', 'Clippers', 'LA Clippers', 'West', '#C8102E', '#1D428A'),
  T('LAL', 'Los Angeles', 'Lakers', 'LA Lakers', 'West', '#552583', '#FDB927'),
  T('MEM', 'Memphis', 'Grizzlies', 'Memphis', 'West', '#5D76A9', '#12173F'),
  T('MIA', 'Miami', 'Heat', 'Miami', 'East', '#98002E', '#F9A01B'),
  T('MIL', 'Milwaukee', 'Bucks', 'Milwaukee', 'East', '#00471B', '#EEE1C6'),
  T('MIN', 'Minnesota', 'Timberwolves', 'Minnesota', 'West', '#0C2340', '#236192'),
  T('NOP', 'New Orleans', 'Pelicans', 'New Orleans', 'West', '#0C2340', '#C8102E'),
  T('NYK', 'New York', 'Knicks', 'New York', 'East', '#006BB6', '#F58426'),
  T('OKC', 'Oklahoma City', 'Thunder', 'Oklahoma City', 'West', '#007AC1', '#EF3B24'),
  T('ORL', 'Orlando', 'Magic', 'Orlando', 'East', '#0077C0', '#C4CED4'),
  T('PHI', 'Philadelphia', '76ers', 'Philadelphia', 'East', '#006BB6', '#ED174C'),
  T('PHX', 'Phoenix', 'Suns', 'Phoenix', 'West', '#1D1160', '#E56020'),
  T('POR', 'Portland', 'Trail Blazers', 'Portland', 'West', '#E03A3E', '#000000'),
  T('SAC', 'Sacramento', 'Kings', 'Sacramento', 'West', '#5A2D81', '#63727A'),
  T('SAS', 'San Antonio', 'Spurs', 'San Antonio', 'West', '#C4CED4', '#000000'),
  T('TOR', 'Toronto', 'Raptors', 'Toronto', 'East', '#CE1141', '#000000'),
  T('UTA', 'Utah', 'Jazz', 'Utah', 'West', '#002B5C', '#00471B'),
  T('WAS', 'Washington', 'Wizards', 'Washington', 'East', '#002B5C', '#E31837'),
];

const ALIAS: Record<string, string> = { BRK: 'BKN', NJN: 'BKN', CHO: 'CHA', GS: 'GSW', NO: 'NOP', NY: 'NYK', PHO: 'PHX', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
const BY_CODE = new Map(NBA_TEAMS.map((t) => [t.code, t]));

export function nbaCode(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const u = abbr.toUpperCase();
  return BY_CODE.has(u) ? u : ALIAS[u] ?? null;
}

export function nbaTeam(abbr: string | null | undefined): NbaTeam | null {
  const c = nbaCode(abbr);
  return c ? BY_CODE.get(c) ?? null : null;
}

const LOGOS = (logos as { teams: Record<string, unknown> }).teams;

/** The committed logo for a club (public/teams/nba/<CODE>.webp, scripts/teams/fetch-nba-logos.mjs), or null. */
export function nbaLogo(abbr: string | null | undefined): string | null {
  const c = nbaCode(abbr);
  return c && LOGOS[c] ? `${import.meta.env.BASE_URL}teams/nba/${c}.webp` : null;
}

// ------------------------------------------------------------------ research decoders

export interface NbaFamilyStudy {
  family: string;
  nOos: number;
  marketLogLoss: number | null;
  modelLogLoss: number | null;
  hybridLogLoss: number | null;
  hybridBeatsMarket: boolean;
}

/** The publication's out-of-sample model-vs-market study (log loss, lower is better), per market family. */
export function nbaModelVsMarket(r: EventResearchDoc): NbaFamilyStudy[] {
  const f = ((r.extensions as any)?.model_vs_market?.families ?? {}) as Record<string, any>;
  return Object.entries(f).map(([family, v]) => ({
    family, nOos: Number(v.n_oos ?? 0), marketLogLoss: v.market_log_loss ?? null, modelLogLoss: v.data_only_log_loss ?? null, hybridLogLoss: v.hybrid_log_loss ?? null,
    hybridBeatsMarket: Boolean(v.hybrid_beats_calibrated_market),
  })).sort((a, b) => b.nOos - a.nOos);
}

export interface NbaInjury {
  player: string;
  detail: string | null;
  status: string;
  team: string | null;
  asOf: string | null;
  source: string | null;
}

/** "Dereck Lively II (Foot)" rows, with the team when the publication's roster lists the player. */
export function nbaInjuries(r: EventResearchDoc): NbaInjury[] {
  const byName = new Map(r.players.map((p) => [p.display_name, p.team_id ?? null]));
  const short = (pid: string | null) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? null;
  return (r.context?.injuries ?? []).map((i) => {
    const m = /^(.+?)(?:\s*\((.+)\))?$/.exec(i.detail ?? '');
    const player = m?.[1]?.trim() ?? (i.detail ?? '');
    return { player, detail: m?.[2] ?? null, status: i.status, team: short(byName.get(player) ?? null), asOf: i.as_of, source: i.source };
  });
}

/** Lines the publication draws under its own numbers (gates, defects, preseason caveats): shown, never hidden. */
export function nbaCaveats(r: EventResearchDoc): string[] {
  return (r.context?.notes ?? []).filter((x) => !/^Model-vs-market/.test(x));
}

export function nbaVenue(r: EventResearchDoc): { arena: string | null; neutral: boolean } {
  const v = (r.context?.venue ?? {}) as any;
  return { arena: v.arena ?? v.name ?? null, neutral: Boolean(v.neutral_site) };
}

type MarketLike = Partial<Pick<Market, 'market_family' | 'period' | 'participant_id' | 'threshold' | 'line' | 'yes_description' | 'extensions'>> & { kalshi_ticker: string };

const PERIOD_NOUN: Record<string, string> = { '1H': '1st half', '2H': '2nd half', '1Q': '1st quarter', '2Q': '2nd quarter', '3Q': '3rd quarter', '4Q': '4th quarter' };

/** Basketball markets in basketball language, from the publication's structured fields and YES wording. */
export function nbaMarketTitle(m: MarketLike, abbrOf?: (pid: string | null) => string | null): string {
  const d = cleanDescription(m.yes_description).replace(/^Full Game:\s*/i, '');
  const fam = m.market_family ?? '';
  const code = abbrOf?.(m.participant_id ?? null) ?? null;
  const team = nbaTeam(code);
  const who = team ? `${team.city} ${team.name}` : /^(.+?) wins/.exec(d)?.[1] ?? null;
  const t = m.threshold ?? m.line;
  const per = PERIOD_NOUN[m.period ?? ''] ?? null;
  if (fam === 'game_winner' && who) return `${who} to win`;
  if (fam === 'period_winner') return /^Tie/i.test(d) ? `Tie in the ${per ?? 'period'}` : `${who ?? 'Team'} wins the ${per ?? 'period'}`;
  if (fam === 'game_spread' && who && t != null) return `${who} −${t}`;
  if (fam === 'game_total' && t != null) return `${per ? `${per[0].toUpperCase()}${per.slice(1)} total` : 'Game total'} over ${t}`;
  if (fam === 'team_total' && who && t != null) return `${who} team total over ${t}`;
  return d || m.kalshi_ticker;
}

export const NBA_FAMILY_LABEL: Record<string, string> = {
  game_winner: 'Moneyline', game_spread: 'Spread', game_total: 'Game total', team_total: 'Team totals', period_winner: 'Halves & quarters',
  player_points: 'Player points', player_rebounds: 'Player rebounds', player_assists: 'Player assists', player_threes: 'Player threes',
};
export const nbaFamilyLabel = (f: string) => NBA_FAMILY_LABEL[f] ?? f.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export type NbaMarketLike = ResearchMarket | Market;
