// NHL team identity: one deterministic table for all 32 clubs, keyed by the official NHL tricode the NHL publication
// uses (participants[].short_name / source_ids.nhl_abbrev). Every NHL surface resolves a team through `nhlTeam()`, so
// a logo, a name and a colour can never disagree between the slate, the game page, a market or a player card.
// Logos are committed under public/teams/nhl/<TRICODE>.webp by scripts/teams/fetch-nhl-logos.mjs (never fetched from
// a third party at runtime); src/lib/nhl-team-logos.json records which ones exist.
import logos from './nhl-team-logos.json';

export interface NhlTeam {
  code: string;
  city: string;
  name: string;
  /** Short place name for tight rows ("Tampa Bay", "NY Rangers"). */
  short: string;
  conference: 'East' | 'West';
  division: 'Atlantic' | 'Metropolitan' | 'Central' | 'Pacific';
}

const T = (code: string, city: string, name: string, short: string, conference: NhlTeam['conference'], division: NhlTeam['division']): NhlTeam => ({ code, city, name, short, conference, division });

export const NHL_TEAMS: NhlTeam[] = [
  T('ANA', 'Anaheim', 'Ducks', 'Anaheim', 'West', 'Pacific'),
  T('BOS', 'Boston', 'Bruins', 'Boston', 'East', 'Atlantic'),
  T('BUF', 'Buffalo', 'Sabres', 'Buffalo', 'East', 'Atlantic'),
  T('CAR', 'Carolina', 'Hurricanes', 'Carolina', 'East', 'Metropolitan'),
  T('CBJ', 'Columbus', 'Blue Jackets', 'Columbus', 'East', 'Metropolitan'),
  T('CGY', 'Calgary', 'Flames', 'Calgary', 'West', 'Pacific'),
  T('CHI', 'Chicago', 'Blackhawks', 'Chicago', 'West', 'Central'),
  T('COL', 'Colorado', 'Avalanche', 'Colorado', 'West', 'Central'),
  T('DAL', 'Dallas', 'Stars', 'Dallas', 'West', 'Central'),
  T('DET', 'Detroit', 'Red Wings', 'Detroit', 'East', 'Atlantic'),
  T('EDM', 'Edmonton', 'Oilers', 'Edmonton', 'West', 'Pacific'),
  T('FLA', 'Florida', 'Panthers', 'Florida', 'East', 'Atlantic'),
  T('LAK', 'Los Angeles', 'Kings', 'Los Angeles', 'West', 'Pacific'),
  T('MIN', 'Minnesota', 'Wild', 'Minnesota', 'West', 'Central'),
  T('MTL', 'Montréal', 'Canadiens', 'Montréal', 'East', 'Atlantic'),
  T('NJD', 'New Jersey', 'Devils', 'New Jersey', 'East', 'Metropolitan'),
  T('NSH', 'Nashville', 'Predators', 'Nashville', 'West', 'Central'),
  T('NYI', 'New York', 'Islanders', 'NY Islanders', 'East', 'Metropolitan'),
  T('NYR', 'New York', 'Rangers', 'NY Rangers', 'East', 'Metropolitan'),
  T('OTT', 'Ottawa', 'Senators', 'Ottawa', 'East', 'Atlantic'),
  T('PHI', 'Philadelphia', 'Flyers', 'Philadelphia', 'East', 'Metropolitan'),
  T('PIT', 'Pittsburgh', 'Penguins', 'Pittsburgh', 'East', 'Metropolitan'),
  T('SEA', 'Seattle', 'Kraken', 'Seattle', 'West', 'Pacific'),
  T('SJS', 'San Jose', 'Sharks', 'San Jose', 'West', 'Pacific'),
  T('STL', 'St. Louis', 'Blues', 'St. Louis', 'West', 'Central'),
  T('TBL', 'Tampa Bay', 'Lightning', 'Tampa Bay', 'East', 'Atlantic'),
  T('TOR', 'Toronto', 'Maple Leafs', 'Toronto', 'East', 'Atlantic'),
  T('UTA', 'Utah', 'Mammoth', 'Utah', 'West', 'Central'),
  T('VAN', 'Vancouver', 'Canucks', 'Vancouver', 'West', 'Pacific'),
  T('VGK', 'Vegas', 'Golden Knights', 'Vegas', 'West', 'Pacific'),
  T('WPG', 'Winnipeg', 'Jets', 'Winnipeg', 'West', 'Central'),
  T('WSH', 'Washington', 'Capitals', 'Washington', 'East', 'Metropolitan'),
];

/** Abbreviations other feeds use for the same club (Kalshi tickers, ESPN, older NHL codes). */
const ALIASES: Record<string, string> = {
  LA: 'LAK', NJ: 'NJD', SJ: 'SJS', TB: 'TBL', UTAH: 'UTA', UTH: 'UTA', MON: 'MTL', WAS: 'WSH', VEG: 'VGK', CLB: 'CBJ', NAS: 'NSH', CAL: 'CGY',
};

const BY_CODE = new Map(NHL_TEAMS.map((t) => [t.code, t]));

/** The canonical tricode for any spelling of an NHL club, or null when it is not one of the 32. */
export function nhlCode(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const k = abbr.trim().toUpperCase();
  if (BY_CODE.has(k)) return k;
  return ALIASES[k] ?? null;
}

export function nhlTeam(abbr: string | null | undefined): NhlTeam | null {
  const c = nhlCode(abbr);
  return c ? BY_CODE.get(c) ?? null : null;
}

const LOGOS = (logos as { teams: Record<string, unknown> }).teams;

/** The committed logo for an NHL club, or null when none has been fetched (the caller shows a text mark). */
export function nhlLogo(abbr: string | null | undefined): string | null {
  const c = nhlCode(abbr);
  return c && LOGOS[c] ? `${import.meta.env.BASE_URL}teams/nhl/${c}.webp` : null;
}
