// The sports Sift's navigation lists, in the order the product presents them. A sport's `status` says what
// Sift can honestly open for it today:
//   live     full research screens on the sport's own publication
//   beta     research screens through the generic views
//   health   the sport publishes; Sift shows its live health and capabilities only
//   planned  no Edge Finder publication exists yet — the sport home says so, nothing is invented
import { sportBySlug, type SportConfig } from './sports';

export type NavStatus = 'live' | 'beta' | 'health' | 'planned';

export interface NavSport {
  slug: string;
  label: string;
  fullName: string;
  icon: string;
  accent: string;
  status: NavStatus;
}

export const NAV_SPORTS: NavSport[] = [
  { slug: 'nfl', label: 'NFL', fullName: 'National Football League', icon: 'football', accent: '#6fa8c9', status: 'live' },
  { slug: 'cfb', label: 'CFB', fullName: 'College Football', icon: 'football', accent: '#c99a6a', status: 'health' },
  { slug: 'mlb', label: 'MLB', fullName: 'Major League Baseball', icon: 'baseball', accent: '#d08a7a', status: 'beta' },
  { slug: 'nba', label: 'NBA', fullName: 'National Basketball Association', icon: 'basketball', accent: '#d4a05a', status: 'health' },
  { slug: 'cbb', label: 'CBB', fullName: "NCAA Division I Men's Basketball", icon: 'basketball', accent: '#e07b39', status: 'live' },
  { slug: 'nhl', label: 'NHL', fullName: 'National Hockey League', icon: 'hockey', accent: '#9cc4dc', status: 'health' },
  { slug: 'soccer', label: 'Soccer', fullName: 'Soccer', icon: 'soccer', accent: '#8cc2a3', status: 'health' },
  { slug: 'tennis', label: 'Tennis', fullName: 'Tennis', icon: 'tennis', accent: '#c9c27a', status: 'health' },
  { slug: 'mma', label: 'MMA', fullName: 'Mixed Martial Arts', icon: 'mma', accent: '#c97a7a', status: 'planned' },
  { slug: 'pga', label: 'PGA', fullName: 'PGA Tour', icon: 'golf', accent: '#8cbf9a', status: 'planned' },
];

export const STATUS_WORD: Record<NavStatus, string> = { live: 'Live', beta: 'Beta', health: 'Health only', planned: 'Coming soon' };

export function navSport(slug: string | undefined): NavSport | undefined {
  return NAV_SPORTS.find((s) => s.slug === (slug ?? '').toLowerCase());
}

/** A sport in the navigation that has no Edge Finder publication (no SportConfig) yet. */
export function plannedSport(slug: string | undefined): NavSport | undefined {
  const n = navSport(slug);
  return n && n.status === 'planned' && !sportBySlug(slug) ? n : undefined;
}

export function navFor(sport: SportConfig): NavSport | undefined {
  return navSport(sport.slug);
}
