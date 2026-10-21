import { Link } from '../routing';
import { Icon } from './Icon';

const COPY: Record<string, { title: string; body: string; target?: string }> = {
  props: { title: 'Props', body: 'The v4 player-props explorer is the next milestone. Until it ships, the current SIFT 2.0 Props screen has the full published research.', target: '/design/sift2/props' },
  signals: { title: 'Signals', body: 'The v4 signals feed is the next milestone. Research signals are already reachable from Home and every game (the pulse chip); the full ranked list lives in SIFT 2.0 for now.', target: '/design/sift2/intelligence' },
  board: { title: 'Board', body: 'The v4 board (saved research) is the next milestone. Your current board is in SIFT 2.0.', target: '/design/sift2/board' },
  missing: { title: 'Not found', body: 'That v4 address does not exist.' },
};

/** Tabs that are not part of milestone 1: said plainly, with the way to the current screen. Nothing is faked. */
export function V4Handoff({ tab }: { tab: 'props' | 'signals' | 'board' | 'missing' }) {
  const c = COPY[tab];
  return (
    <section className="v4-hand" aria-labelledby="v4-hand-h">
      <span className="v4-pill" style={{ alignSelf: 'flex-start' }}>{tab === 'missing' ? '404' : 'Coming in v4'}</span>
      <h1 id="v4-hand-h">{c.title}</h1>
      <p>{c.body}</p>
      {c.target
        ? <a className="v4-btn" href={`#${c.target}`}>Open in SIFT 2.0 <Icon name="arrow-up-right" size="s" /></a>
        : <Link className="v4-btn" to="/v4">Back to Home</Link>}
      {c.target && <p className="meta">This leaves the v4 preview. Return with <b>#/v4</b>.</p>}
    </section>
  );
}
