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
  { slug: 'nfl', label: 'NFL', fullName: 'National Football League', icon: 'football', accent: '#4f86ff', status: 'live' },
  { slug: 'cfb', label: 'CFB', fullName: 'College Football', icon: 'football', accent: '#f08a3c', status: 'health' },
  { slug: 'mlb', label: 'MLB', fullName: 'Major League Baseball', icon: 'baseball', accent: '#ef5a5a', status: 'beta' },
  { slug: 'nba', label: 'NBA', fullName: 'National Basketball Association', icon: 'basketball', accent: '#f29b38', status: 'health' },
  { slug: 'nhl', label: 'NHL', fullName: 'National Hockey League', icon: 'hockey', accent: '#9cc7e8', status: 'health' },
  { slug: 'soccer', label: 'Soccer', fullName: 'Soccer', icon: 'soccer', accent: '#3fcf9c', status: 'health' },
  { slug: 'tennis', label: 'Tennis', fullName: 'Tennis', icon: 'tennis', accent: '#d4e157', status: 'health' },
  { slug: 'mma', label: 'MMA', fullName: 'Mixed Martial Arts', icon: 'mma', accent: '#e5484d', status: 'planned' },
  { slug: 'pga', label: 'PGA', fullName: 'PGA Tour', icon: 'golf', accent: '#4cc38a', status: 'planned' },
];

export const STATUS_WORD: Record<NavStatus, string> = { live: 'Live', beta: 'Beta', health: 'Health only', planned: 'Not published yet' };

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
