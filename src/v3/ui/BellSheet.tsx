import { Link } from '../../routing';
import { useSlate } from '../data/useSlate';
import { useAlerts } from '../state/prefs';
import { Icon } from './Icon';
import { TeamLogo } from './TeamLogo';
import { gameHref } from './gamebits';

/** Every alert this device has turned on, one game at a time. (Opened from Home's header bell.) */
export function BellSheet() {
  const a = useAlerts();
  const { games } = useSlate();
  const ids = Object.keys(a);
  const rows = ids.map((id) => ({ id, g: games.find((x) => x.key === id) }));
  return (
    <div>
      {ids.length === 0 ? <p className="v3-note">No alerts are on. Alerts are off by default; tap the bell on a game or team to opt in, one at a time. Following something does not turn alerts on.</p> : (
        <ul className="v3-list">
          {rows.map(({ id, g }) => (
            <li key={id}>{g ? <Link to={gameHref(g)} className="v3-story"><TeamLogo team={g.home} size={36} /><span className="v3-story__t"><b>{g.away.nick} at {g.home.nick}</b><small>{(a[id] ?? []).join(', ')}</small></span><Icon name="chevR" size={20} /></Link> : <span className="v3-note">{id}</span>}</li>
          ))}
        </ul>
      )}
      <p className="v3-note v3-note--dim">This build records alert choices on this device only. It does not request notification permission or send anything.</p>
    </div>
  );
}
