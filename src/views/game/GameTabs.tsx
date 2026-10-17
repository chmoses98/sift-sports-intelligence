// The game page's illuminated section tabs (approved reference 02): the visual kit's IconTabs with one icon per
// section. Every tab stays a link to its own URL (?tab=…), so the keys, routes and query parameters are unchanged;
// the accessible name of each link is its visible word (icons are decorative).
import { IconTabs } from '../../components/fx';
import '../../styles/sift2-game-nav.css';

const TAB_ICON: Record<string, string> = {
  overview: 'grid',
  matchup: 'compare',
  script: 'play',
  scripts: 'play',
  props: 'target',
  players: 'users',
  markets: 'chart',
  trends: 'trend',
  injuries: 'medic',
  lineups: 'users',
  pitching: 'baseball',
  goalies: 'hockey',
};

/** `followCurrent`: SIFT 2.0's sticky tab strip keeps its current tab in view (see IconTabs). */
export function GameTabs<K extends string>({ tabs, current, href, followCurrent = false }: { tabs: readonly (readonly [K, string])[]; current: K | null; href: (k: K) => string; followCurrent?: boolean }) {
  return (
    <IconTabs
      className="gtabs gtabs--fx"
      label="Game sections"
      followCurrent={followCurrent}
      items={tabs.map(([k, l]) => ({ to: href(k), label: l, icon: TAB_ICON[k] ?? 'layers', current: current === k }))}
    />
  );
}
