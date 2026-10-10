// Home's My Board preview: up to three saved games with their item counts and the first change since saved;
// an elegant empty state for a new viewer.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { navSport } from '../../data/nav';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { kickoff } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useTray } from '../../state/tray';
import { boardGroups, gameChanges, GROUP_WORD } from '../../board/model';
import { useBoardIndex } from './BoardView';

export function BoardPreview() {
  const tray = useTray();
  const idx = useBoardIndex();
  const groups = useMemo(() => boardGroups(tray.tray.items, tray.labels, idx.boards, idx.now), [tray.tray.items, tray.labels, idx.boards, idx.now]);
  if (!groups.length) {
    return (
      <div className="bempty bempty--row">
        <div>
          <h3>Save research as you go</h3>
          <p>Games, players, props, markets and scripts land here, organised by game, with what changed since you saved them.</p>
        </div>
        <Link to={routes.board()} className="btn btn--glass">How My Board works</Link>
      </div>
    );
  }
  return (
    <ul className="bprev">
      {groups.slice(0, 3).map((g) => {
        const nav = navSport(g.sport.toLowerCase());
        const oldest = g.entries.reduce((m, e) => (e.savedAt < m ? e.savedAt : m), g.entries[0].savedAt);
        const ch = gameChanges(g, g.eventId ? idx.boards.get(g.eventId) : undefined, oldest)[0];
        const kinds = [...new Set(g.entries.map((e) => GROUP_WORD[e.group]))].slice(0, 3).join(' · ');
        return (
          <li key={g.key}>
            <Link to={routes.board()} className="glass bprev__card">
              <span className="bgame__sport">{nav && <SportMark slug={nav.slug} icon={nav.icon} size={13} />}{nav?.label ?? g.sport}{g.start ? ` · ${kickoff(g.start)}` : ''}</span>
              <span className="bprev__t">{g.title}</span>
              <span className="bprev__s"><b className="bnum">{g.entries.length}</b> saved · {kinds}</span>
              {ch && <span className={`bprev__chg${ch.reassess ? ' is-alert' : ''}`}><Icon name="clock" size={12} /> {ch.text}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
