// The CBB slate: the real schedule (every D-I vs D-I game in the publication's window), grouped by the
// game's US Eastern date. A game outside the 30-hour capture window stays on the slate and says its
// projection is pending; nothing is hidden for lack of a projection.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EventDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { ErrorState, Notice, Skeleton, Stratum } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { etDate, eventExt, fmt1, marginWords, pct0, teamShort, tipLabel, type CbbEventExt } from './data';
import { CbbMark, ConfidenceChip, IntegrityBadge, StateLine } from './ui';

export function useCbbEvents() {
  const { sport, repo } = useSport();
  return useAsync(`events:${sport.code}:${repo.source.root}`, () => repo.events());
}

export function GameRow({ e, slug }: { e: EventDoc; slug: string }) {
  const c = eventExt(e) as CbbEventExt;
  const home = e.participants.find((p) => p.participant_id === e.home_participant);
  const away = e.participants.find((p) => p.participant_id === e.away_participant);
  const hn = teamShort(home);
  const an = teamShort(away);
  const p = c.primary;
  return (
    <li className="cgame">
      <Link to={routes.game(slug, e.event_id)} className="cgame__a" aria-label={`${an} ${c.neutral_site ? 'versus' : 'at'} ${hn}, ${tipLabel(e.start_time_utc, c)}`}>
        <span className="cgame__time">{c.tbd ? 'TBD' : new Date(e.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="cgame__teams">
          <span className="cgame__t"><CbbMark p={away} size="sm" /> {an}{c.result ? <b className="num cgame__sc">{c.result.away_score}</b> : null}</span>
          <span className="cgame__t"><CbbMark p={home} size="sm" /> {hn}{c.result ? <b className="num cgame__sc">{c.result.home_score}</b> : null}</span>
        </span>
        <span className="cgame__proj">
          {p ? (
            <>
              <span className="num cgame__score">{fmt1(p.away_score)}–{fmt1(p.home_score)}</span>
              <span className="cgame__line">{marginWords(p.margin, hn, an)} · total {fmt1(p.total)} · {hn} {pct0(p.home_win_prob)}</span>
            </>
          ) : (
            <StateLine state={c.projection_state} compact />
          )}
        </span>
        <span className="cgame__tags">
          {c.neutral_site && <span className="flag">neutral</span>}
          {c.event_name && <span className="flag flag--plain">{c.event_name}</span>}
          {c.schedule_source === 'ESPN_FALLBACK' && <span className="flag flag--plain" title="Listed by ESPN; SportsDataverse does not list it yet">ESPN listing</span>}
          {(c.roster_confidence.home !== 'CONFIRMED' || c.roster_confidence.away !== 'CONFIRMED') && (
            <ConfidenceChip c={c.roster_confidence.away !== 'CONFIRMED' ? c.roster_confidence.away : c.roster_confidence.home} team={c.roster_confidence.away !== 'CONFIRMED' ? an : hn} />
          )}
          {(c.integrity.status === 'UNSCORABLE' || c.integrity.status === 'INVALID' || c.integrity.status === 'VALID') && <IntegrityBadge i={c.integrity} />}
        </span>
      </Link>
    </li>
  );
}

export function CbbSlateView() {
  const { sport, slug } = useSport();
  const events = useCbbEvents();
  useVisit(`${sport.label} slate`, 'slate');
  const days = useMemo(() => {
    const out = new Map<string, EventDoc[]>();
    for (const e of [...(events.data?.items ?? [])].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))) {
      const d = eventExt(e)?.date_et ?? e.start_time_utc.slice(0, 10);
      out.set(d, [...(out.get(d) ?? []), e]);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events.data]);
  if (events.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!events.data) return <div className="page"><ErrorState error={events.error} what="the CBB schedule" /></div>;
  const all = events.data.items;
  const projected = all.filter((e) => eventExt(e)?.primary).length;
  return (
    <div className="page cslate">
      <header className="pagehead">
        <div className="eyebrow">{sport.fullName}</div>
        <h1 className="h-display">Slate</h1>
        <div className="pagehead__stats">
          <span><b className="num">{all.length}</b> D-I games</span>
          <span><b className="num">{projected}</b> with a pre-tip projection</span>
          <span><b className="num">{days.length}</b> days</span>
        </div>
        <p className="lede">The real schedule, Eastern dates. Projections appear when the frozen prospective pipeline archives them, within 30 hours of tip. Research evidence, never picks.</p>
      </header>
      {!all.length && <Notice title="No D-I games in this publication's window" />}
      {days.map(([d, es]) => (
        <Stratum key={d} title={etDate(d)} sub={`${es.length} ${es.length === 1 ? 'game' : 'games'}`}>
          <ul className="cgames">{es.map((e) => <GameRow key={e.event_id} e={e} slug={slug} />)}</ul>
        </Stratum>
      ))}
    </div>
  );
}
