// TR4: who is next and how strong are they. The next opponents with rest days and each opponent's offense and defense rank
// (opponent-adjusted where the sport publishes it). Opponent profiles are fetched only for the opponents shown, lazily, and cached.
// A row opens the game, the logo the opponent's team page, and a pill the opponent's statistic ranking with that opponent highlighted.
import { useMemo } from 'react';
import { NavRow, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { LockedRow } from '../../ui/atoms';
import { TeamLogo } from '../../ui/TeamLogo';
import { useProfilesByCode } from '../../data/research/teamHooks';
import type { ScheduleEvent, TeamProfile } from '../../data/research/types';
import { ordinal, opponentUnits, rankText, scheduleSummary, upcomingOf, type OppUnits, type StatObs, type UpcomingVM } from '../../model/teamResearch';
import { Eyebrow, shortDate, Skel, StatT, weekday, type ReadyCtx, type TeamPageCtx } from './parts';

const COUNT = 6;

function Pill({ c, kind, u, loading, opp }: { c: ReadyCtx; kind: 'o' | 'd'; u: StatObs | null; loading: boolean; opp: UpcomingVM }) {
  if (loading) return <span className="op load" aria-label="Loading">…</span>;
  if (!u || u.rank == null) return <span className="op none" aria-label={`${opp.oppCode ?? opp.oppName} ${kind === 'o' ? 'offense' : 'defense'}: not ranked`}>—</span>;
  return (
    <StatT c={c} obs={u} sel={{ sel: opp.oppCode ?? undefined, opp: c.code }} className={`op ${kind}`}
      label={`${opp.oppCode ?? opp.oppName} ${kind === 'o' ? 'offense' : 'defense'}: ${rankText(u)}. Open the ${u.name.toLowerCase()} ranking`}>
      <b className="num">{ordinal(u.rank)}</b>
    </StatT>
  );
}

export function Schedule({ c, schedule, sampleOpp }: { c: TeamPageCtx; schedule: ScheduleEvent[]; sampleOpp: ((code: string, name: string | null) => TeamProfile | null) | null }) {
  const up = useMemo(() => (c.profile ? upcomingOf(c.profile, schedule, c.codeOf, c.now, COUNT) : []), [c.profile, schedule, c.codeOf, c.now]);
  const codes = useMemo(() => up.map((u) => u.oppCode).filter((x): x is string => !!x), [up]);
  const real = useProfilesByCode(c.slug, c.demo ? [] : codes);
  const units = useMemo(() => up.map((u): OppUnits => {
    if (!u.oppCode) return { off: null, def: null };
    const p = c.demo ? sampleOpp?.(u.oppCode, u.oppName) ?? null : real.byCode.get(u.oppCode) ?? null;
    return opponentUnits(c.slug, p, c.look);
  }), [up, c.demo, c.slug, c.look, real.byCode, sampleOpp]);
  const sum = useMemo(() => scheduleSummary(units), [units]);
  if (!c.profile || c.defsLoading) return <div className="tm-body"><Skel h={170} label="Loading schedule" /><Skel h={360} /></div>;
  const ready = c as ReadyCtx;
  if (!up.length) return <div className="tm-body"><LockedRow title="Schedule">No upcoming games are on the published schedule.</LockedRow></div>;
  const adjusted = !!c.decl.identity.adjusted;
  const basis = adjusted ? 'opponent-adjusted' : 'raw';
  return (
    <div className="tm-body">
      <section className="tm-card tm-sum6" aria-label="Opponent strength">
        <Eyebrow>Next {up.length} opponents</Eyebrow>
        <div className="s2g">
          <div className="o"><small>Opponent offenses, {basis}</small><b className="num">{sum.off ?? '—'}</b><span>average percentile</span></div>
          <div className="d"><small>Opponent defenses, {basis}</small><b className="num">{sum.def ?? '—'}</b><span>average percentile</span></div>
        </div>
        <p className="tm-note">Descriptive: season-long {basis} EPA per play, {sum.ranked} of {sum.total} opponents ranked. Higher is stronger; it is not a prediction.</p>
      </section>
      <section className="tm-card tm-schl" aria-label="Schedule">
        <div className="schh"><span /><span /><span /><span className="o">Opp. offense</span><span className="d">Opp. defense</span></div>
        {up.map((u, i) => {
          const opp = c.identity(u.oppCode ?? u.oppId ?? '—', u.oppName);
          const where = `${u.home === false ? '@' : 'vs'} ${u.oppCode ?? u.oppName}`;
          const waiting = real.pending && !!u.oppCode && !c.demo && !real.byCode.has(u.oppCode);
          return (
            <NavRow key={u.eventId} to={routes.game({ slug: c.slug, eventId: u.eventId })} kind="game" label={`${where}, ${shortDate(u.startUtc)}. Open game`} className={`sch${i === 0 ? ' now' : ''}`}>
              <div className="dt"><b>{shortDate(u.startUtc)}</b><span>{weekday(u.startUtc)}</span></div>
              {u.oppCode ? <TeamLink team={{ slug: c.slug, id: u.oppCode }} label={`${opp.name}, team page`}><TeamLogo team={opp} size={32} /></TeamLink> : <TeamLogo team={opp} size={32} />}
              <div className="nm"><b>{where}</b>{u.restDays != null && <span>{u.restDays} {u.restDays === 1 ? 'day' : 'days'} rest</span>}</div>
              <div className="ops"><Pill c={ready} kind="o" u={units[i].off} loading={waiting} opp={u} /></div>
              <div className="ops"><Pill c={ready} kind="d" u={units[i].def} loading={waiting} opp={u} /></div>
            </NavRow>
          );
        })}
      </section>
    </div>
  );
}
