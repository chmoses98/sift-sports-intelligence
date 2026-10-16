// The Research Lab's tool categories (issues 44, 45), shared by the Research Lab hub (/explore — the route keeps its
// address) and Home's Research Lab strip, so both name the same seven tools the same way:
//   Teams · Players · Props · Matchup compare · Season · Stats & rankings · Model Pulse
// A tool that lives on the hub itself is reached with ?tool=<key>, which the hub scrolls to.
import { routes } from '../../lib/routes';

export type LabToolKey = 'teams' | 'players' | 'props' | 'compare' | 'season' | 'stats' | 'pulse';

export interface LabTool {
  key: LabToolKey;
  title: string;
  /** One short line: what the tool answers. */
  sub: string;
  icon: string;
  tone: 'blue' | 'cyan' | 'gold' | 'violet' | 'green' | 'red';
}

/** The top-level Player Prop Explorer (lane B's /props route): every sport's props, not one game's. */
export const PROPS_ROUTE = '/props';

export const LAB_TOOLS: LabTool[] = [
  { key: 'teams', title: 'Teams', sub: 'Every team, its profile and opponent-adjusted ranks', icon: 'shield', tone: 'blue' },
  { key: 'players', title: 'Players', sub: 'Profiles, usage and game logs', icon: 'star', tone: 'violet' },
  { key: 'props', title: 'Props', sub: 'Projections, ranges and prices by player', icon: 'sliders', tone: 'gold' },
  { key: 'compare', title: 'Matchup compare', sub: 'Two teams side by side, rank by rank', icon: 'compare', tone: 'cyan' },
  { key: 'season', title: 'Season', sub: 'Week by week: matchups, scores, results against the spread', icon: 'grid', tone: 'green' },
  { key: 'stats', title: 'Stats & rankings', sub: 'Every published ranking, opponent-adjusted first', icon: 'chart', tone: 'cyan' },
  { key: 'pulse', title: 'Model Pulse', sub: 'How each model has done against the market', icon: 'bolt', tone: 'red' },
];

/** Where a tool opens for a sport. Hub sections are addressed with ?tool= so a link from anywhere lands on them. */
export function labHref(key: LabToolKey, slug = 'nfl'): string {
  switch (key) {
    case 'props': return slug==='nfl'?PROPS_ROUTE:['nhl','mlb'].includes(slug)?`${PROPS_ROUTE}?sport=${slug}`:routes.props(slug);
    case 'compare': return routes.compare(slug, '');
    case 'season': return routes.season(slug);
    case 'pulse': return routes.pulse(slug);
    default: return `${routes.explore()}?sport=${slug}&tool=${key}`;
  }
}
