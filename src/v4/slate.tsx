// The slate behind Home, Games and the game screen: every published game from the app's own opportunity layer,
// plus the shared list group and the loading / unavailable / empty states.
import { useMemo, useState } from 'react';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { gameRows, slateOrder, type GameRow } from '../views/broadcast/games';
import { Icon } from './Icon';
import { GameRowV4 } from './parts';

const CAP = 12;

/** The slate behind Home and Games: every published game, the selected day, league and filter applied. */
export function useSlate() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now).sort(slateOrder), [all.bundles, all.opportunities, now]);
  const failed = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failed.length === all.bundles.length);
  return { now, rows, loading: all.loading, unavailable, failed };
}

/** Said wherever games in play are listed: "in play" is the publication's status, never a score feed. */
export const LIVE_SCORES_NOTE = 'Live scores are not available yet. In play is each game’s published status; no score, clock or play is shown or estimated.';

export function Group({ title, rows, live = false, note }: { title: string; rows: GameRow[]; live?: boolean; note?: string }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, CAP);
  return (
    <section className="v4-sec" aria-label={title}>
      <header className="v4-sechead"><h2>{live && <i className="v4-livedot" aria-hidden="true" />}{title}</h2><span className="v4-sechead__n">{rows.length}</span></header>
      {(note || live) && <p className="meta" style={{ padding: '0 16px 8px' }}>{note ?? LIVE_SCORES_NOTE}</p>}
      <ul className="v4-grp">{shown.map((g) => <GameRowV4 key={`${g.slug}:${g.item.event_id}`} g={g} />)}</ul>
      {rows.length > CAP && !all && <div style={{ padding: '10px 16px 0' }}><button type="button" className="v4-btn v4-btn--sec" style={{ width: '100%' }} onClick={() => setAll(true)}>Show all {rows.length}</button></div>}
    </section>
  );
}

export function SlateStates({ loading, unavailable, failed, empty, emptyText }: { loading: boolean; unavailable: boolean; failed: { sport: { label: string } }[]; empty: boolean; emptyText: string }) {
  if (unavailable) return <div className="v4-note v4-note--risk" role="alert"><Icon name="cloud-slash" /><div><b>Published games are unavailable</b>A failed publication does not mean there are no games. Try again in a moment.</div></div>;
  if (loading) return <div role="status" aria-label="Loading published games"><div className="v4-skel v4-skelfeat" /><div className="v4-grp" style={{ marginTop: 24 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="v4-skel v4-skelrow" />)}</div></div>;
  return (
    <>
      {failed.length > 0 && <div className="v4-note" style={{ marginBottom: 16 }}><Icon name="info" /><div><b>{failed.length} feed{failed.length === 1 ? '' : 's'} unavailable</b>{failed.map((f) => f.sport.label).join(', ')} could not be read; showing the publications that loaded.</div></div>}
      {empty && <div className="v4-note"><Icon name="calendar-dots" /><div><b>Nothing here</b>{emptyText}</div></div>}
    </>
  );
}
