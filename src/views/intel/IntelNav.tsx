// The Intelligence destination's own sub-navigation: Terminal · Market board · Model Pulse · Model Lab.
import { Link, useLocation } from 'react-router';
import { Icon } from '../../components/Icon';
import { routes } from '../../lib/routes';

const TABS = [
  { to: routes.intelligence(), path: '/intelligence', label: 'Terminal', icon: 'layers' },
  { to: '/intelligence/markets', path: '/intelligence/markets', label: 'Market board', icon: 'chart' },
  { to: routes.pulse(), path: '/intelligence/pulse', label: 'Model Pulse', icon: 'bolt' },
  { to: routes.lab(), path: '/intelligence/lab', label: 'Model Lab', icon: 'sliders' },
];

export function IntelNav() {
  const loc = useLocation();
  return (
    <nav className="gtabs2 intelnav" aria-label="Intelligence">
      {TABS.map((t) => (
        <Link key={t.path} to={t.to} className={`gtab${loc.pathname === t.path ? ' is-on' : ''}`} aria-current={loc.pathname === t.path ? 'page' : undefined}>
          <Icon name={t.icon} size={15} />{t.label}
        </Link>
      ))}
    </nav>
  );
}
