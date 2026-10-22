import { useMemo } from 'react';
import { Icon } from './Icon';
import { Crest } from './base';
import { useSheet } from './sheet';
import { teamKey, useFollowing } from './follow';
import { teamName } from '../components/sift2/GameList';
import { dateKey } from './model';
import { useSlate } from './slate';
import type { GameRow } from '../views/broadcast/games';

/** Following: teams kept on this device. Teams offered are the ones playing in the slate you are looking at. */
export function FollowSheet({ day }: { day: string }) {
  const { close } = useSheet();
  const slate = useSlate();
  const rows = useMemo(() => slate.rows.filter((g) => Number.isFinite(g.startMs) && dateKey(g.startMs) === day), [slate.rows, day]);
  const f = useFollowing();
  const teams = useMemo(() => {
    const m = new Map<string, { key: string; sport: string; p: GameRow['home'] }>();
    for (const g of rows) for (const p of [g.away, g.home]) { const k = teamKey(g.sport, p?.short_name); if (k && !m.has(k)) m.set(k, { key: k, sport: g.sport, p }); }
    return [...m.values()].sort((a, b) => teamName(a.p).localeCompare(teamName(b.p)));
  }, [rows]);
  const followed = f.list.map((k) => ({ key: k, t: teams.find((x) => x.key === k) })).sort((a, b) => a.key.localeCompare(b.key));
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t"><h2 data-autofocus tabIndex={-1}>Following</h2><p className="v4-shead__m">Kept on this device only</p></div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close following"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody">
        <section className="v4-sblock" style={{ marginTop: 4 }}>
          <h3>Your teams</h3>
          {followed.length === 0 && <p>You are not following any teams. Add teams playing in this slate below.</p>}
          <ul>
            {followed.map(({ key, t }) => (
              <li key={key} className="v4-player" style={{ padding: '8px 0' }}>
                {t ? <Crest sport={t.sport} p={t.p} size="sm" /> : <span className="v4-crest v4-crest--sm" />}
                <span className="v4-player__t"><b>{t ? teamName(t.p) : key.split(':')[1]}</b><span>{key.split(':')[0]}</span></span>
                <button type="button" className="v4-btn v4-btn--sec" style={{ minHeight: 44 }} onClick={() => f.toggle(key)} aria-label={`Unfollow ${t ? teamName(t.p) : key}`}>Unfollow</button>
              </li>
            ))}
          </ul>
        </section>
        {teams.filter((t) => !f.has(t.key)).length > 0 && (
          <section className="v4-sblock">
            <h3>Playing in this slate</h3>
            <ul>
              {teams.filter((t) => !f.has(t.key)).slice(0, 40).map((t) => (
                <li key={t.key} className="v4-player" style={{ padding: '8px 0' }}>
                  <Crest sport={t.sport} p={t.p} size="sm" />
                  <span className="v4-player__t"><b>{teamName(t.p)}</b><span>{t.sport}</span></span>
                  <button type="button" className="v4-btn" style={{ minHeight: 44 }} onClick={() => f.toggle(t.key)} aria-label={`Follow ${teamName(t.p)}`}>Follow</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
