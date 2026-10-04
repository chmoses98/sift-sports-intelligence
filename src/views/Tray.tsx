import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { TrayList } from '../components/TrayDrawer';
import { Notice, Stratum } from '../components/ui';
import { routes } from '../lib/routes';
import { useTray } from '../state/tray';
import { useVisit } from '../state/trail';

export function TrayView() {
  const tray = useTray();
  useVisit('Research tray', 'tray');
  const sports = [...new Set(tray.tray.items.map((i) => i.sport))];
  return (
    <div className="page trayview">
      <header className="pagehead">
        <div className="eyebrow">Research tray</div>
        <h1 className="h-display">What you are investigating</h1>
        <p className="lede">
          References, not copies: each item is a contract <code>research_tray</code> entry (kind + id) stored on this device. Building a packet
          resolves every item against the latest publication and tells ChatGPT you are specifically investigating them — and not to assume they are good bets.
        </p>
      </header>
      <Stratum title={`${tray.tray.items.length} items`} sub={`Last changed ${new Date(tray.tray.updated_at).toLocaleString()}`}
        actions={tray.tray.items.length > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.confirm('Clear every item from the research tray?') && tray.clear()}><Icon name="trash" size={14} /> Clear</button>}
      >
        <TrayList />
      </Stratum>
      {sports.length > 0 ? (
        <div className="cta-row">
          {sports.map((s) => (
            <Link key={s} className="btn btn--primary" to={routes.packet({ sport: s.toLowerCase(), scope: 'CUSTOM' })}>
              <Icon name="bolt" size={16} /> Build {s} handicap packet
            </Link>
          ))}
        </div>
      ) : (
        <Notice title="Start from a slate">
          <Link to={routes.sport('nfl')}>Open the NFL slate</Link> and save what catches your eye.
        </Notice>
      )}
    </div>
  );
}
