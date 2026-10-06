import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { isFrozen } from '../lib/lifecycle';
import { routes } from '../lib/routes';
import { useNow } from '../live/hooks';
import { useTray } from '../state/tray';
import { Icon } from './Icon';
import { FINDING_WORD, type FindingKind } from '../research/findings';

export const REF_WORD: Record<string, string> = {
  TEAM: 'Team', PLAYER: 'Player', EVENT: 'Game', METRIC: 'Metric', RANKING: 'Ranking', SERIES: 'Trend',
  CHART_POINT: 'Chart point', MARKET: 'Market', PROJECTION: 'Projection',
};

export function TrayList({ dense }: { dense?: boolean }) {
  const tray = useTray();
  const now = useNow(30_000);
  const items = [...tray.tray.items].reverse();
  if (!items.length) {
    return (
      <div className="tray__empty">
        <p><b>Nothing saved yet.</b></p>
        <p>Tap <span className="kbdish">+ Dig deeper</span> on anything specific you want to investigate — a matchup edge, a prop projection, a game script, a context note, a player's trend. Sift keeps each finding (with its numbers) on this device and hands exactly those to ChatGPT when you build a packet.</p>
      </div>
    );
  }
  return (
    <ol className={`tray__list${dense ? ' tray__list--dense' : ''}`}>
      {items.map((it) => {
        const l = tray.labels[it.item_id];
        return (
          <li key={it.item_id} className="tray__item">
            <span className={`tray__kind tray__kind--${l?.finding ?? it.ref_kind.toLowerCase()}`}>{l?.finding ? FINDING_WORD[l.finding as FindingKind] ?? l.finding : REF_WORD[it.ref_kind]}</span>
            <div className="tray__body">
              {l ? <Link to={l.href} className="tray__label">{l.label}</Link> : <span className="tray__label">{it.id}</span>}
              {l?.sub && <span className="tray__sub">{l.sub}</span>}
              {l?.kickoff && isFrozen(l.kickoff, now) && (
                <span className="tray__pregame" title="Saved before kickoff. It stays pregame research: Sift does not turn it into a live view.">Pregame · saved before kickoff</span>
              )}
              {!dense && (
                <input
                  className="tray__note"
                  defaultValue={it.note ?? ''}
                  placeholder="Add a note for the packet (optional)"
                  aria-label={`Note for ${l?.label ?? it.id}`}
                  onBlur={(e) => tray.setNote(it.item_id, e.target.value)}
                />
              )}
            </div>
            <span className="tray__sport">{it.sport}</span>
            <button type="button" className="iconbtn" onClick={() => tray.remove(it.item_id)} aria-label={`Remove ${l?.label ?? it.id}`}>
              <Icon name="close" size={16} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function TrayDrawer() {
  const tray = useTray();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tray.open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && tray.setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tray.open, tray]);
  const n = tray.tray.items.length;
  const sports = [...new Set(tray.tray.items.map((i) => i.sport))];
  return (
    <>
      <div className={`scrim${tray.open ? ' is-open' : ''}`} onClick={() => tray.setOpen(false)} aria-hidden="true" />
      <aside id="tray-drawer" className={`drawer${tray.open ? ' is-open' : ''}`} aria-label="Research tray" aria-hidden={!tray.open} ref={ref} tabIndex={-1} inert={!tray.open}>
        <header className="drawer__head">
          <div>
            <div className="eyebrow">Research</div>
            <div className="drawer__title">{n} saved {n === 1 ? 'finding' : 'findings'}</div>
          </div>
          <button type="button" className="iconbtn" onClick={() => tray.setOpen(false)} aria-label="Close research tray">
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer__body">
          <TrayList dense />
        </div>
        <footer className="drawer__foot">
          {sports.map((s) => (
            <Link key={s} className="btn btn--primary btn--block" to={routes.packet({ sport: s.toLowerCase(), scope: 'CUSTOM' })} onClick={() => tray.setOpen(false)}>
              <Icon name="bolt" size={16} /> Dig deeper with ChatGPT ({s})
            </Link>
          ))}
          <div className="drawer__row">
            <Link className="btn btn--ghost" to={routes.tray()} onClick={() => tray.setOpen(false)}>Open tray</Link>
            {n > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => window.confirm('Clear every item from the research tray?') && tray.clear()}>
                Clear
              </button>
            )}
          </div>
        </footer>
      </aside>
    </>
  );
}
