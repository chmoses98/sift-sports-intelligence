// The game page's illuminated section tabs (approved reference 02): the visual kit's IconTabs with one icon per
// section. Every tab stays a link to its own URL (?tab=…), so the keys, routes and query parameters are unchanged;
// the accessible name of each link is its visible word (icons are decorative).
import { IconTabs } from '../../components/fx';

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

export function GameTabs<K extends string>({ tabs, current, href }: { tabs: readonly (readonly [K, string])[]; current: K | null; href: (k: K) => string }) {
  return (
    <IconTabs
      className="gtabs gtabs--fx"
      label="Game sections"
      items={tabs.map(([k, l]) => ({ to: href(k), label: l, icon: TAB_ICON[k] ?? 'layers', current: current === k }))}
    />
  );
}
