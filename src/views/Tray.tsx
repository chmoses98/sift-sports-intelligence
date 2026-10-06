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
        <div className="eyebrow">Research</div>
        <h1 className="h-display">What you are digging into</h1>
        <p className="lede">
          Specific findings, not whole games: a matchup edge, a prop projection, a script, a context note. Each is saved with its numbers on this device;
          building a packet resolves them against the latest publication and asks ChatGPT to dig into exactly these — not to assume they are good bets.
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
              <Icon name="bolt" size={16} /> Dig deeper with ChatGPT ({s})
            </Link>
          ))}
        </div>
      ) : (
        <Notice title="Start from a game">
          <Link to={routes.sport('nfl')}>Open an NFL game</Link> and tap Dig deeper on what catches your eye.
        </Notice>
      )}
    </div>
  );
}
