// The CBB slate: the real schedule (every D-I vs D-I game in the publication's window), grouped by the
// game's US Eastern date, as dense scannable rows — logos, tip (TBD stays TBD), the pre-tip projection or
// its status, and the honest flags (neutral site, named event, roster confidence, schedule source). A game
// outside the 30-hour capture window stays on the slate and says its projection is pending; filters are
// the reader's choice (kept in the URL) and never hide a game by default.
import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { ErrorState, Notice, Skeleton } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { etDate, eventExt, fmt1, marginWords, teamShort, tipLabel, type CbbEventExt } from './data';
import { confShort, identity, matchupAccents } from './identity';
import { CbbMark, ConfidenceChip, IntegrityBadge, StateLine } from './ui';

export function useCbbEvents() {
  const { sport, repo } = useSport();
  return useAsync(`events:${sport.code}:${repo.source.root}`, () => repo.events());
}

export const teamConf = (pid: string | null | undefined) => confShort(identity(pid)?.conference);

/** Games worth surfacing first, by a stated rule only: named events and neutral-site showcases, then
 *  conference games, then the earliest tip. No team-strength judgment is involved. */
export function marquee(events: EventDoc[], n: number): EventDoc[] {
  const score = (e: EventDoc) => {
    const c = eventExt(e);
    return (c?.event_name ? 2 : 0) + (c?.neutral_site ? 1 : 0) + (c?.conference_game ? 0.5 : 0);
  };
  return [...events].sort((a, b) => score(b) - score(a) || a.start_time_utc.localeCompare(b.start_time_utc)).slice(0, n);
}

function timeOf(e: EventDoc, c: CbbEventExt) {
  return c.tbd ? 'TBD' : new Date(e.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function GameRow({ e, slug, showDate }: { e: EventDoc; slug: string; showDate?: boolean }) {
  const c = eventExt(e) as CbbEventExt;
  const home = e.participants.find((p) => p.participant_id === e.home_participant);
  const away = e.participants.find((p) => p.participant_id === e.away_participant);
  const hn = teamShort(home);
  const an = teamShort(away);
  const p = c.primary;
  const [ca, ch] = matchupAccents(identity(away?.participant_id), identity(home?.participant_id));
  const weak = (['away', 'home'] as const).filter((s) => c.roster_confidence[s] !== 'CONFIRMED');
  const side = (pp: typeof home, s: 'home' | 'away', name: string) => (
    <span className="cgame__t">
      <CbbMark p={pp} size="sm" />
      <span className="cgame__nm">{name}</span>
      <span className="cgame__cf">{teamConf(pp?.participant_id)}</span>
      {c.result ? <b className="num cgame__sc">{s === 'home' ? c.result.home_score : c.result.away_score}</b> : p ? <span className="num cgame__ps">{fmt1(s === 'home' ? p.home_score : p.away_score)}</span> : null}
    </span>
  );
  return (
    <li className="cgame">
      <Link to={routes.game(slug, e.event_id)} className="cgame__a" aria-label={`${an} ${c.neutral_site ? 'versus' : 'at'} ${hn}, ${tipLabel(e.start_time_utc, c)}`}>
        <span className={`cgame__time${c.tbd ? ' is-tbd' : ''}`}>
          {showDate && <span className="cgame__day">{etDate(c.date_et)}</span>}
          {timeOf(e, c)}
        </span>
        <span className="cgame__teams">
          {side(away, 'away', an)}
          {side(home, 'home', hn)}
        </span>
        <span className="cgame__proj">
          {p ? (
            <>
              <span className="cgame__score num" aria-label={`Projected ${an} ${fmt1(p.away_score)}, ${hn} ${fmt1(p.home_score)}`}>{marginWords(p.margin, hn, an)}</span>
              {p.home_win_prob != null && (
                <span className="cgame__wp" style={{ '--ca': ca, '--ch': ch } as CSSProperties}>
                  <span className="cgame__wpb" aria-hidden="true"><i style={{ width: `${100 - Math.round(p.home_win_prob * 100)}%` }} /><i /></span>
                  <span className="num">{Math.round(p.home_win_prob * 100)}% {hn}</span>
                </span>
              )}
              <span className="cgame__line num">total {fmt1(p.total)}</span>
            </>
          ) : (
            <span className={`cgame__st cgame__st--${c.projection_state.toLowerCase()}`}><Icon name="clock" size={12} /> <StateLine state={c.projection_state} compact /></span>
          )}
        </span>
        <span className="cgame__tags">
          {c.event_name && <span className="flag flag--event">{c.event_name}</span>}
          {c.neutral_site && <span className="flag flag--plain"><Icon name="pin" size={11} /> neutral</span>}
          {c.schedule_source === 'ESPN_FALLBACK' && <span className="flag flag--plain" title="Listed by ESPN; SportsDataverse does not list it yet">ESPN listing</span>}
          {weak.length > 0 && <span className="cgame__warn"><Icon name="info" size={12} /><ConfidenceChip c={c.roster_confidence[weak[0]]} team={weak[0] === 'away' ? an : hn} /></span>}
          {(c.integrity.status === 'UNSCORABLE' || c.integrity.status === 'INVALID' || c.integrity.status === 'VALID') && <IntegrityBadge i={c.integrity} />}
        </span>
      </Link>
    </li>
  );
}

const SHOW = [
  { k: 'all', label: 'All games' },
  { k: 'projected', label: 'Projected' },
  { k: 'events', label: 'Events & neutral' },
] as const;

export function CbbSlateView() {
  const { sport, slug } = useSport();
  const events = useCbbEvents();
  const [sp, setSp] = useSearchParams();
  const conf = sp.get('conf');
  const show = (sp.get('show') ?? 'all') as (typeof SHOW)[number]['k'];
  useVisit(`${sport.label} slate`, 'slate');
  const all = useMemo(() => [...(events.data?.items ?? [])].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [events.data]);
  const confs = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of all) for (const pid of new Set([e.home_participant, e.away_participant])) {
      const k = teamConf(pid);
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const shown = useMemo(() => all.filter((e) => {
    const c = eventExt(e);
    if (conf && teamConf(e.home_participant) !== conf && teamConf(e.away_participant) !== conf) return false;
    if (show === 'projected' && !c?.primary) return false;
    if (show === 'events' && !c?.event_name && !c?.neutral_site) return false;
    return true;
  }), [all, conf, show]);
  const days = useMemo(() => {
    const out = new Map<string, EventDoc[]>();
    for (const e of shown) {
      const d = eventExt(e)?.date_et ?? e.start_time_utc.slice(0, 10);
      out.set(d, [...(out.get(d) ?? []), e]);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);
  if (events.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!events.data) return <div className="page"><ErrorState error={events.error} what="the CBB schedule" /></div>;
  const projected = all.filter((e) => eventExt(e)?.primary).length;
  const set = (k: string, v: string | null) => setSp((prev) => {
    const q = new URLSearchParams(prev);
    if (v && v !== 'all') q.set(k, v);
    else q.delete(k);
    return q;
  }, { replace: true });
  return (
    <div className="page cslate">
      <header className="pagehead">
        <div className="eyebrow">{sport.fullName}</div>
        <h1 className="h-display">Slate</h1>
        <div className="pagehead__stats">
          <span><b className="num">{all.length}</b> D-I games</span>
          <span><b className="num">{projected}</b> with a pre-tip projection</span>
          <span><b className="num">{new Set(all.map((e) => eventExt(e)?.date_et)).size}</b> days</span>
        </div>
        <p className="lede">The real schedule, Eastern dates. Projections appear when the frozen prospective pipeline archives them, within 30 hours of tip. Research evidence, never picks.</p>
      </header>
      <div className="cfilt" role="group" aria-label="Filter games">
        <div className="seg" role="radiogroup" aria-label="Show">
          {SHOW.map((s) => (
            <button key={s.k} type="button" role="radio" aria-checked={show === s.k} className={`seg__b${show === s.k ? ' is-on' : ''}`} onClick={() => set('show', s.k)}>{s.label}</button>
          ))}
        </div>
        <label className="cfilt__conf">
          <span className="sr-only">Conference</span>
          <select value={conf ?? ''} onChange={(ev) => set('conf', ev.target.value || null)}>
            <option value="">All conferences</option>
            {confs.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
        </label>
        {(conf || show !== 'all') && <span className="muted small">{shown.length} of {all.length} games shown</span>}
      </div>
      {!all.length && <Notice title="No D-I games in this publication's window" />}
      {all.length > 0 && !shown.length && <Notice title="No game matches these filters">Clear a filter to see the full slate.</Notice>}
      {days.map(([d, es]) => (
        <section key={d} className="cday" aria-labelledby={`cday-${d}`}>
          <h2 className="cday__h" id={`cday-${d}`}>{etDate(d)} <span className="cday__n">{es.length} {es.length === 1 ? 'game' : 'games'}</span></h2>
          <ul className="cgames">{es.map((e) => <GameRow key={e.event_id} e={e} slug={slug} />)}</ul>
        </section>
      ))}
    </div>
  );
}
