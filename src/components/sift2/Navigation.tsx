import { Link, useLocation } from 'react-router';
import { Icon } from '../Icon';
const ITEMS = [
  ['home','Home','home'],['games','Games','calendar'],['props','Player Props','target'],['lab','Research Lab','research'],['intelligence','Intelligence','bolt'],['board','My Board','bookmark'],
] as const;
export function Sift2Navigation() {
  const { pathname } = useLocation();
  const current = pathname.includes('/game/') ? 'games' : pathname.split('/')[3] ?? 'home';
  const href = (key: string) => key === 'board' ? '/board' : `/design/sift2/${key}`;
  return <>
    <aside className="s2-sidebar"><Link className="s2-brand" to="/design/sift2/home" aria-label="SIFT 2.0 home">SIFT<span>2.0</span></Link>
      <nav aria-label="SIFT 2.0 navigation">{ITEMS.map(([key,label,icon]) => <Link key={key} to={href(key)} aria-current={current === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{label}</span></Link>)}</nav>
      <Link className="s2-sidebar__settings" to="/settings"><Icon name="settings" size={20} />Settings</Link>
    </aside>
    <nav className="s2-bottomnav" aria-label="SIFT 2.0 navigation">{ITEMS.filter(([k]) => k !== 'lab').map(([key,label,icon]) => <Link key={key} to={href(key)} aria-current={current === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{key === 'props' ? 'Props' : label}</span></Link>)}</nav>
  </>;
}
