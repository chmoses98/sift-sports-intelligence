// v4 Games: the whole slate for a day, grouped by league, with a status filter. Home previews; this lists everything.
import { useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from '../routing';
import { NAV_SPORTS } from '../data/nav';
import { groupGames } from '../components/sift2/GameList';
import { GameRowV4 } from './parts';
import { LIVE_SCORES_NOTE, SlateStates, useSlate } from './slate';
import { dateKey, dayStrip, isLiveGame, isOver, isUpcoming } from './model';

type Status = 'all' | 'live' | 'upcoming' | 'final';

export function V4Games() {
  const { now, rows, loading, unavailable, failed } = useSlate();
  const [sp, setSp] = useSearchParams();
  const today = dateKey(now);
  const day = sp.get('date') ?? today;
  const status = (['live', 'upcoming', 'final'].includes(sp.get('status') ?? '') ? sp.get('status') : 'all') as Status;
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const inDay = useMemo(() => rows.filter((g) => Number.isFinite(g.startMs) && dateKey(g.startMs) === day), [rows, day]);
  const shown = useMemo(() => inDay.filter((g) => status === 'all' || (status === 'live' ? isLiveGame(g) : status === 'upcoming' ? isUpcoming(g) : isOver(g))), [inDay, status]);
  const groups = useMemo(() => groupGames(shown), [shown]);
  const days = useMemo(() => dayStrip(now), [now]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2;
  }, [day]);
  const counts = { all: inDay.length, live: inDay.filter(isLiveGame).length, upcoming: inDay.filter(isUpcoming).length, final: inDay.filter(isOver).length };
  const empty = !loading && !unavailable && shown.length === 0;
  return (
    <div>
      <div className="v4-stage" style={{ paddingBottom: 4 }}>
        <header className="v4-top"><h1 className="h2" style={{ font: '700 28px/32px var(--f-num)', letterSpacing: '-0.03em' }}>Games</h1></header>
        <div className="v4-days" role="group" aria-label="Date" ref={strip}>
          {days.map((d) => (
            <button key={d.key} type="button" className={`v4-day${d.today ? ' v4-day--today' : ''}`} aria-pressed={d.key === day} aria-label={`${d.weekday === 'Today' ? 'Today, ' : ''}${d.label}`} onClick={() => set('date', d.today ? null : d.key)}>
              {d.weekday}<b>{d.label}</b>
            </button>
          ))}
        </div>
        <div className="v4-chips" role="group" aria-label="Status">
          {(['all', 'live', 'upcoming', 'final'] as Status[]).map((s) => <button key={s} type="button" className="v4-chip" aria-pressed={status === s} onClick={() => set('status', s === 'all' ? null : s)}>{s[0].toUpperCase() + s.slice(1)} <i>{counts[s]}</i></button>)}
        </div>
      </div>
      <div style={{ paddingTop: 8 }} aria-live="polite">
        <SlateStates loading={loading} unavailable={unavailable} failed={failed} empty={empty} emptyText={status === 'all' ? `No published games ${day === today ? 'today' : 'on this day'}.` : `No ${status} games ${day === today ? 'today' : 'on this day'}.`} />
        {!loading && !unavailable && shown.some(isLiveGame) && <p className="meta" style={{ padding: '0 16px 12px' }}>{LIVE_SCORES_NOTE}</p>}
        {!loading && !unavailable && groups.map((gr) => (
          <section key={gr.slug} className="v4-sec" aria-label={NAV_SPORTS.find((s) => s.slug === gr.slug)?.fullName ?? gr.sport}>
            <header className="v4-sechead"><h2>{NAV_SPORTS.find((s) => s.slug === gr.slug)?.label ?? gr.sport}</h2><span className="v4-sechead__n">{gr.games.length}</span></header>
            <ul className="v4-grp">{gr.games.map((g) => <GameRowV4 key={g.item.event_id} g={g} />)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
