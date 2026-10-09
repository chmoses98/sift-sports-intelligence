// The sports Sift knows about, from the router's registry (kalshi-bet-router
// contract/edge_finder_contract/registry.json, also published as sports_registry.json on app-data).
import type { SportCode } from '../contract/types';

export type SportTier = 'primary' | 'secondary' | 'listed';

export interface SportConfig {
  code: SportCode;
  slug: string;
  label: string;
  fullName: string;
  repo: string;
  branch: string;
  rawBase: string;
  /** A bundled, same-run research snapshot used only while the live root publishes no explorer. */
  snapshotBase: string | null;
  /** primary/secondary sports get Sift explorer screens; listed sports show live health + capabilities. */
  tier: SportTier;
  entityNoun: { team: string; event: string };
  /** CFB: the research-signals contract (cfb_research_signals/1.x) the home and game pages read beside the board. */
  researchSignalsUrl?: string;
}

const BASE = import.meta.env.BASE_URL;

export const REGISTRY_URL =
  'https://raw.githubusercontent.com/chmoses98/kalshi-bet-router/app-data/app/latest/sports_registry.json';

/** The CFB research-signals contract, refreshed every few minutes by the cfb-edge-finder conductor. */
export const CFB_RESEARCH_SIGNALS_URL =
  'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/research-signals/signals/cfb_research_signals.json';

export const SPORTS: SportConfig[] = [
  {
    code: 'NFL', slug: 'nfl', label: 'NFL', fullName: 'National Football League',
    repo: 'chmoses98/nfl-edge-finder', branch: 'handicap-reports',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest',
    snapshotBase: `${BASE}data/nfl/app/latest`, tier: 'primary', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'MLB', slug: 'mlb', label: 'MLB', fullName: 'Major League Baseball',
    repo: 'chmoses98/edge-finder-api', branch: 'main',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/edge-finder-api/main/app/latest',
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'CFB', slug: 'cfb', label: 'CFB', fullName: 'College Football',
    repo: 'chmoses98/cfb-edge-finder', branch: 'main',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest',
    // Explorer screens through the generic views, plus the CFB Script Engine game page when an event carries
    // extensions.script_engine (docs/CFB_SCRIPT_ENGINE.md).
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'team', event: 'game' },
    researchSignalsUrl: CFB_RESEARCH_SIGNALS_URL,
  },
  {
    code: 'NBA', slug: 'nba', label: 'NBA', fullName: 'National Basketball Association',
    repo: 'chmoses98/nba-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/nba-edge-finder/data-archive/app/latest',
    // Explorable: the NBA home, game pages and the generic team/player/metric screens over its live explorer (views/nba).
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'NHL', slug: 'nhl', label: 'NHL', fullName: 'National Hockey League',
    repo: 'chmoses98/NHL-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/NHL-edge-finder/data-archive/app/latest',
    // First-class research vertical: the generic explorer views plus the NHL game, home, market and scorecard
    // screens driven by extensions.nhl_scripts_v1 / nhl_matchup_v1 and the learning scorecard (docs/NHL.md).
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'SOCCER', slug: 'soccer', label: 'Soccer', fullName: 'Soccer',
    repo: 'chmoses98/soccer-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/soccer-edge-finder/data-archive/app/latest',
    // Explorable: the Soccer home and match pages read the soccer script engine and model board (views/soccer, lib/soccer.ts).
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'club', event: 'match' },
  },
  {
    // NCAA Division I men's basketball: its own sport (never NBA, never CFB). The publication is the CBB
    // repo's app-data branch, built from its immutable pre-tip projection archive (prospectively frozen
    // research system; no recommendations, no wagers).
    code: 'CBB', slug: 'cbb', label: 'CBB', fullName: "NCAA Division I Men's Basketball",
    repo: 'chmoses98/cbb-edge-finder', branch: 'app-data',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/cbb-edge-finder/app-data/app/latest',
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'TENNIS', slug: 'tennis', label: 'Tennis', fullName: 'Tennis',
    repo: 'chmoses98/Tennis-Edge-Finder', branch: 'tennis-data',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/Tennis-Edge-Finder/tennis-data/tennis-edge-finder/data/app/latest',
    // Explorable: an individual sport (participants are players; no home/away) with its own home, match and player pages (views/tennis).
    snapshotBase: null, tier: 'secondary', entityNoun: { team: 'player', event: 'match' },
  },
];

export function sportBySlug(slug: string | undefined): SportConfig | undefined {
  return SPORTS.find((s) => s.slug === (slug ?? '').toLowerCase());
}

export function sportByCode(code: string | undefined): SportConfig | undefined {
  return SPORTS.find((s) => s.code === (code ?? '').toUpperCase());
}

export const explorable = (s: SportConfig) => s.tier !== 'listed';
