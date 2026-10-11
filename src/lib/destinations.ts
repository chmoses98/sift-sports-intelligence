// SIFT's primary destinations and which one a screen belongs to. One rule for the desktop header, the
// phone tab bar and the breadcrumb root, so the highlighted destination always agrees with the address.
import { routes } from './routes';
import { navSport } from '../data/nav';

export type Destination = 'home' | 'games' | 'props' | 'explore' | 'intelligence' | 'board';

export interface DestinationDef {
  id: Destination;
  label: string;
  /** The phone tab bar's word (five fit at 320 px). */
  short: string;
  icon: string;
  to: string;
  /** One line for menus and the hub cards. */
  sub: string;
}

/** The top-level Player Prop Explorer (the `/props` route). */
export const PROPS_PATH = '/props';

export const DESTINATIONS: DestinationDef[] = [
  { id: 'home', label: 'Home', short: 'Home', icon: 'home', to: routes.home(), sub: 'Today across every sport' },
  { id: 'games', label: 'Games', short: 'Games', icon: 'grid', to: routes.games(), sub: 'Slates, matchups, scripts and markets' },
  { id: 'props', label: 'Props', short: 'Props', icon: 'target', to: PROPS_PATH, sub: 'Player prop explorer: lines, projections and game logs' },
  { id: 'explore', label: 'Research Lab', short: 'Lab', icon: 'compare', to: routes.explore(), sub: 'Teams, players, seasons and stats' },
  { id: 'intelligence', label: 'Intelligence', short: 'Intel', icon: 'bolt', to: routes.intelligence(), sub: 'Terminal, discoveries and model evidence' },
  { id: 'board', label: 'My Board', short: 'Board', icon: 'bookmark', to: routes.board(), sub: 'Your saved research, by game' },
];

/** The phone tab bar: five tabs. My Board moves to the phone header (a bookmark with its count). */
export const PHONE_TABS: Destination[] = ['home', 'games', 'props', 'explore', 'intelligence'];

const GAME_SEGMENTS = new Set(['', 'slate', 'game', 'market', 'parlays']);
const PROP_SEGMENTS = new Set(['props']);
const EXPLORE_SEGMENTS = new Set(['team', 'player', 'metric', 'ranking', 'compare', 'season']);
const INTEL_SEGMENTS = new Set(['scorecard']);

/** The destination a pathname (no query) belongs to, or null for utility screens (settings, design, sports list). */
export function destinationOf(pathname: string): Destination | null {
  const parts = pathname.split('?')[0].split('/').filter(Boolean);
  const head = parts[0] ?? '';
  if (!head) return 'home';
  if (head === 'games') return 'games';
  if (head === 'props') return 'props';
  if (head === 'explore' || head === 'search') return 'explore';
  if (head === 'intelligence' || head === 'status' || head === 'news') return 'intelligence';
  if (head === 'board' || head === 'tray' || head === 'packet') return 'board';
  if (navSport(head)) {
    const seg = parts[1] ?? '';
    if (GAME_SEGMENTS.has(seg)) return 'games';
    if (PROP_SEGMENTS.has(seg)) return 'props';
    if (EXPLORE_SEGMENTS.has(seg)) return 'explore';
    if (INTEL_SEGMENTS.has(seg)) return 'intelligence';
    return 'games';
  }
  return null;
}

export const destination = (id: Destination): DestinationDef => DESTINATIONS.find((d) => d.id === id)!;
