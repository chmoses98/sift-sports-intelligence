import logos from './team-logos.json';
import { mlbClub, mlbCode } from './mlb';
import mlbLogos from './mlb-team-logos.json';
import { cfbTeam } from './cfbTeams';
import { nhlCode, nhlLogo } from './nhlTeams';
import { nbaLogo, nbaTeam } from './nba';

// Team identity colors: brand presentation only (never data). Sift uses them as a thin accent —
// a stripe, a monogram tile — so Sift's own palette stays in charge.
const NFL: Record<string, [string, string]> = {
  ARI: ['#97233F', '#FFB612'], ATL: ['#A71930', '#A5ACAF'], BAL: ['#241773', '#9E7C0C'], BUF: ['#00338D', '#C60C30'],
  CAR: ['#0085CA', '#BFC0BF'], CHI: ['#0B162A', '#C83803'], CIN: ['#FB4F14', '#000000'], CLE: ['#311D00', '#FF3C00'],
  DAL: ['#003594', '#869397'], DEN: ['#FB4F14', '#002244'], DET: ['#0076B6', '#B0B7BC'], GB: ['#203731', '#FFB612'],
  HOU: ['#03202F', '#A71930'], IND: ['#002C5F', '#A2AAAD'], JAX: ['#006778', '#D7A22A'], KC: ['#E31837', '#FFB81C'],
  LV: ['#000000', '#A5ACAF'], LAC: ['#0080C6', '#FFC20E'], LA: ['#003594', '#FFA300'], LAR: ['#003594', '#FFA300'],
  MIA: ['#008E97', '#FC4C02'], MIN: ['#4F2683', '#FFC62F'], NE: ['#002244', '#C60C30'], NO: ['#D3BC8D', '#101820'],
  NYG: ['#0B2265', '#A71930'], NYJ: ['#125740', '#FFFFFF'], PHI: ['#004C54', '#A5ACAF'], PIT: ['#FFB612', '#101820'],
  SF: ['#AA0000', '#B3995D'], SEA: ['#002244', '#69BE28'], TB: ['#D50A0A', '#34302B'], TEN: ['#0C2340', '#4B92DB'],
  WAS: ['#5A1414', '#FFB612'],
};

const NHL: Record<string, [string, string]> = {
  ANA: ['#F47A38', '#B9975B'], BOS: ['#FFB81C', '#000000'], BUF: ['#003087', '#FFB81C'], CAR: ['#CE1126', '#000000'],
  CBJ: ['#002654', '#CE1126'], CGY: ['#C8102E', '#F1BE48'], CHI: ['#CF0A2C', '#000000'], COL: ['#6F263D', '#236192'],
  DAL: ['#006847', '#8F8F8C'], DET: ['#CE1126', '#FFFFFF'], EDM: ['#041E42', '#FF4C00'], FLA: ['#C8102E', '#041E42'],
  LAK: ['#111111', '#A2AAAD'], MIN: ['#154734', '#A6192E'], MTL: ['#AF1E2D', '#192168'], NJD: ['#CE1126', '#000000'],
  NSH: ['#FFB81C', '#041E42'], NYI: ['#00539B', '#F47D30'], NYR: ['#0038A8', '#CE1126'], OTT: ['#C52032', '#C2912C'],
  PHI: ['#F74902', '#000000'], PIT: ['#FCB514', '#000000'], SEA: ['#001628', '#99D9D9'], SJS: ['#006D75', '#EA7200'],
  STL: ['#002F87', '#FCB514'], TBL: ['#002868', '#FFFFFF'], TOR: ['#00205B', '#FFFFFF'], UTA: ['#71AFE5', '#090909'],
  VAN: ['#00205B', '#00843D'], VGK: ['#B4975A', '#333F42'], WPG: ['#041E42', '#004C97'], WSH: ['#041E42', '#C8102E'],
};

export function teamColors(sport: string, abbr: string | null | undefined): [string, string] {
  if (sport === 'NFL' && abbr && NFL[abbr]) return NFL[abbr];
  if (sport === 'NHL' && nhlCode(abbr)) return NHL[nhlCode(abbr)!];
  if (sport === 'MLB') return mlbClub(abbr)?.colors ?? ['#1d2d52', '#3f5079'];
  if (sport === 'NBA') return nbaTeam(abbr)?.colors ?? ['#1d2d52', '#3f5079'];
  if (sport === 'CFB') {
    const t = cfbTeam(abbr);
    if (t?.c) return [t.c, t.c2 ?? t.c];
  }
  return ['#1d2d52', '#3f5079'];
}

/** A team color that stays visible as a stripe on the near-black surface. */
export function teamAccent(sport: string, abbr: string | null | undefined): string {
  const [a, b] = teamColors(sport, abbr);
  return luminance(a) < 0.04 ? b : a;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}


const LOGOS = (logos as { teams: Record<string, unknown> }).teams;

/** The committed logo for a team, or null when Sift has none for that sport/team. */
export function teamLogo(sport: string, abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  if (sport === 'NFL') return LOGOS[abbr] ? `${import.meta.env.BASE_URL}teams/nfl/${abbr}.webp` : null;
  if (sport === 'CFB') {
    // CFB contract team code -> ESPN team id through the committed identity map (src/lib/cfbTeams.ts).
    const t = cfbTeam(abbr);
    return t?.l ? `${import.meta.env.BASE_URL}teams/cfb/${t.e}.webp` : null;
  }
  // NHL tricode (or any alias) -> the club's committed logo (src/lib/nhlTeams.ts).
  if (sport === 'NHL') return nhlLogo(abbr);
  // NBA tricode -> the club's committed logo (scripts/teams/fetch-nba-logos.mjs); none committed yet reads as the tricode.
  if (sport === 'NBA') return nbaLogo(abbr);
  // MLB club code (or alias) -> the club's committed logo (scripts/teams/fetch-mlb-logos.mjs).
  if (sport === 'MLB') {
    const c = mlbCode(abbr);
    return c && (mlbLogos as { teams: Record<string, unknown> }).teams[c] ? `${import.meta.env.BASE_URL}teams/mlb/${c}.webp` : null;
  }
  return null;
}
