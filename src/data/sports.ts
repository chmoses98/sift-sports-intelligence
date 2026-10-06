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
}

const BASE = import.meta.env.BASE_URL;

export const REGISTRY_URL =
  'https://raw.githubusercontent.com/chmoses98/kalshi-bet-router/app-data/app/latest/sports_registry.json';

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
    snapshotBase: null, tier: 'listed', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'NBA', slug: 'nba', label: 'NBA', fullName: 'National Basketball Association',
    repo: 'chmoses98/nba-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/nba-edge-finder/data-archive/app/latest',
    snapshotBase: null, tier: 'listed', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'NHL', slug: 'nhl', label: 'NHL', fullName: 'National Hockey League',
    repo: 'chmoses98/NHL-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/NHL-edge-finder/data-archive/app/latest',
    snapshotBase: null, tier: 'listed', entityNoun: { team: 'team', event: 'game' },
  },
  {
    code: 'SOCCER', slug: 'soccer', label: 'Soccer', fullName: 'Soccer',
    repo: 'chmoses98/soccer-edge-finder', branch: 'data-archive',
    rawBase: 'https://raw.githubusercontent.com/chmoses98/soccer-edge-finder/data-archive/app/latest',
    snapshotBase: null, tier: 'listed', entityNoun: { team: 'club', event: 'match' },
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
    snapshotBase: null, tier: 'listed', entityNoun: { team: 'player', event: 'match' },
  },
];

export function sportBySlug(slug: string | undefined): SportConfig | undefined {
  return SPORTS.find((s) => s.slug === (slug ?? '').toLowerCase());
}

export function sportByCode(code: string | undefined): SportConfig | undefined {
  return SPORTS.find((s) => s.code === (code ?? '').toUpperCase());
}

export const explorable = (s: SportConfig) => s.tier !== 'listed';
