import { Link, useLocation } from '../../routing';
import { Icon } from '../Icon';
import { destinationOf } from '../../lib/destinations';
import { workspacePath } from '../../lib/workspaceRoutes';
const ITEMS = [
  ['home','Home','home'],['games','Games','calendar'],['props','Player Props','target'],['lab','Research Lab','research'],['intelligence','Intelligence','bolt'],['board','My Board','bookmark'],
] as const;
export function Sift2Navigation() {
  const { pathname } = useLocation();
  const destination=destinationOf(workspacePath(pathname));
  const current=destination==='explore'?'lab':destination;
  const href = (key: string) => `/design/sift2/${key}`;
  return <>
    <aside className="s2-sidebar"><Link className="s2-brand" to="/design/sift2/home" aria-label="SIFT 2.0 home">SIFT<span>2.0</span></Link>
      <nav aria-label="SIFT 2.0 navigation">{ITEMS.map(([key,label,icon]) => <Link key={key} to={href(key)} aria-current={current === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{label}</span></Link>)}</nav>
      <div className="s2-sidebar__utilities"><Link to="/search"><Icon name="search" size={18}/>Search</Link><Link to="/sports"><Icon name="grid" size={18}/>Sports</Link><Link to="/status"><Icon name="info" size={18}/>Sources</Link><Link className="s2-sidebar__settings" to="/settings"><Icon name="settings" size={18}/>Settings</Link></div>
    </aside>
    <nav className="s2-bottomnav" aria-label="SIFT 2.0 navigation">{ITEMS.filter(([k]) => k !== 'lab').map(([key,label,icon]) => <Link key={key} to={href(key)} aria-current={current === key ? 'page' : undefined}><Icon name={icon} size={22} /><span>{key === 'props' ? 'Props' : label}</span></Link>)}</nav>
  </>;
}
