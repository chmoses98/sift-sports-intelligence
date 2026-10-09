// CFB market headings in plain English. The CFB publication names a market by its Kalshi series
// (KXNCAAF1HSPREAD), its family ('first_half_spread') and a lower-case period ('first_half'); none of those
// identifiers is shown to a reader. The heading is built from the series, the same token the upstream classifier
// reads (cfb-edge-finder catalog/classification.py: an optional period prefix, then a family suffix), so
// "KXNCAAF1HSPREAD" reads "First half spread" and "KXNCAAFTEAMRECYDS" reads "Team receiving yards".
// Display only: family, period and ticker stay on the market for parsing, pricing, provenance and settlement.
import { isFullGame } from './period';

const CFB_SERIES = /^KXNCAAF/;

/** Kalshi's period prefix → the period in words. No prefix is the full game. */
const PERIOD: Record<string, string> = {
  '1H': 'First half', '2H': 'Second half',
  '1Q': 'First quarter', '2Q': 'Second quarter', '3Q': 'Third quarter', '4Q': 'Fourth quarter',
};

/** Line markets: said with their period ("Full game spread", "First quarter total"). */
const LINE: Record<string, string> = { GAME: 'moneyline', SPREAD: 'spread', TOTAL: 'total', TEAMTOTAL: 'team total' };

/** Every other suffix the upstream classifier knows, by name. Unknown suffixes fall back to the family. */
const PROP: Record<string, string> = {
  FIRSTTDTEAM: 'First team to score a touchdown', FIRSTTD: 'First touchdown', FTTS: 'First team to score',
  BTTS: 'Both teams to score', MARGIN: 'Winning margin', OT: 'Overtime', MOSTOT: 'Overtime',
  TEAMSACK: 'Team sacks', TEAMTO: 'Team turnovers', TEAMFG: 'Team field goals', TEAMINT: 'Team interceptions',
  TEAMTD: 'Team touchdowns', TEAMREC: 'Team receptions', TEAMRECYDS: 'Team receiving yards', TEAMRECTD: 'Team receiving touchdowns',
  TEAMRSHTD: 'Team rushing touchdowns', TEAMRSHATT: 'Team rushing attempts', TEAMRSHYDS: 'Team rushing yards',
  TEAMPASSYDS: 'Team passing yards', TEAMPASSTD: 'Team passing touchdowns',
  TOTALFG: 'Total field goals', TOTALTD: 'Total touchdowns', '2PT': 'Two-point conversion', DSTTD: 'Defense or special teams touchdown',
  QHIGHSCORE: 'Highest-scoring quarter', DELAY: 'Weather delay',
};

/** Whole-series names that a prefix + suffix split would misread ("1HFT" is not a first-half "FT" market). */
const WHOLE: Record<string, string> = { '1HFT': 'First half and full game result' };

/** The publication's lower-case periods, for a market whose series says nothing. */
const PERIOD_WORDS: Record<string, string> = {
  first_half: 'First half', second_half: 'Second half', first_quarter: 'First quarter', second_quarter: 'Second quarter',
  third_quarter: 'Third quarter', fourth_quarter: 'Fourth quarter', overtime: 'Overtime',
};

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The plain-English heading of a CFB market, or null when the market is not a CFB market (other sports keep their
 * own labels). "First half moneyline", "First quarter spread", "Second half total", "Full game moneyline".
 */
export function cfbMarketHeading(m: { kalshi_ticker?: string | null; market_family: string; period?: string | null }): string | null {
  const series = (m.kalshi_ticker ?? '').split('-')[0];
  if (!CFB_SERIES.test(series)) return null;
  const rest = series.replace(CFB_SERIES, '');
  if (WHOLE[rest]) return WHOLE[rest];
  const pm = /^([12]H|[1-4]Q)(.*)$/.exec(rest);
  const per = pm ? PERIOD[pm[1]] : null;
  const suffix = pm ? pm[2] || 'GAME' : rest;
  if (LINE[suffix]) return `${per ?? 'Full game'} ${LINE[suffix]}`;
  if (PROP[suffix]) return per ? `${per} ${lc(PROP[suffix])}` : PROP[suffix];
  // A series this table does not know: the family, without its period words, plus the period once.
  const words = PERIOD_WORDS[m.period ?? ''] ?? null;
  const fam = m.market_family.replace(/^(game|first_half|second_half|quarter)_/, '').replace(/_/g, ' ');
  if (!fam || fam === 'unknown') return words ? `${words} market` : 'Other market';
  const base = fam.charAt(0).toUpperCase() + fam.slice(1);
  return words && !isFullGame(m.period) && words.toLowerCase() !== fam ? `${words} ${lc(base)}` : base;
}
