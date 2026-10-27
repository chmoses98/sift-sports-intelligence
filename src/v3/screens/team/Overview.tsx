// TR1 (football) and TR6 (hockey): what kind of team is this, and what is next. Next game, props today, the identity card (offense
// against defense, Adjusted or Raw, never mixed), the highest and lowest ranked statistics, and the last games as margin bars.
import { useMemo } from 'react';
import { NavRow, PropsLink, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import { LeagueTrack, TrackAxis, type TrackMark } from '../../ui/charts/LeagueTrack';
import { MarginBars, type MarginBar } from '../../ui/charts/MarginBars';
import { completedGames, extremesOf, identityOf, lastN, marginScale, oneDecimal, ordinal, rankText, resolveWindow, scoredAllowed, type NextGameVM, type StatObs } from '../../model/teamResearch';
import { LockedRow } from '../../ui/atoms';
import { Eyebrow, SegC, Skel, StatT, startWords, type ReadyCtx, type TeamPageCtx } from './parts';

export interface PropsInfo { props: number; players: number }

function NextStrip({ c, next, total, loading }: { c: TeamPageCtx; next: NextGameVM | null; total: string | null; loading: boolean }) {
  if (!next && loading) return <Skel h={72} label="Loading next game" />;
  if (!next) return <div className="tm-card tm-note-card" role="note">No upcoming game is on the published schedule.</div>;
  const opp = c.identity(next.oppCode ?? next.oppId ?? '—', next.oppName);
  const oppRef = next.oppCode ?? null;
  const away = next.home === false;
  const where = `${away ? 'at' : 'vs'} ${next.oppCode ?? next.oppName}`;
  const when = startWords(next.startUtc, c.now);
  return (
    <NavRow to={routes.game({ slug: c.slug, eventId: next.eventId })} kind="game" label={`Next game: ${where}, ${when}. Open game`} className="tm-card tm-gstrip">
      <TeamLogo team={c.team} size={34} />
      <div className="c"><b>{where} · {when}</b><span>{next.home == null ? 'Home or away not published' : away ? 'Away' : 'Home'}{total ? ` · ${total}` : ''}</span></div>
      {oppRef ? <TeamLink team={{ slug: c.slug, id: oppRef }} label={`${opp.name}, team page`}><TeamLogo team={opp} size={34} /></TeamLink> : <TeamLogo team={opp} size={34} />}
      <span className="go" aria-hidden="true"><Icon name="chevR" size={18} /></span>
    </NavRow>
  );
}

function PropsRow({ c, next, info }: { c: TeamPageCtx; next: NextGameVM | null; info: PropsInfo | null }) {
  const today = next ? new Date(next.startUtc).toDateString() === new Date(c.now).toDateString() : true;
  const title = today ? 'Props today' : 'Props';
  const day = next && !today ? ` · ${startWords(next.startUtc, c.now).split(' ')[0]}` : '';
  const sub = info
    ? `${info.props} ${info.props === 1 ? 'prop' : 'props'} across ${info.players} ${c.code} ${info.players === 1 ? 'player' : 'players'}${day}`
    : `${c.code} player props${day}`;
  return (
    <PropsLink state={{ team: c.code, sport: c.slug }} label={`${title}: ${sub}. Open Prop Discovery for ${c.code}`} className="tm-card tm-prow">
      <div><b>{title}</b><span>{sub}</span></div>
      <span className="seeall">Open <Icon name="chevR" size={14} /></span>
    </PropsLink>
  );
}

const markOf = (c: ReadyCtx, o: StatObs, cls: 'o' | 'd', letter: string, role: string): TrackMark => ({
  key: `${o.id}-${cls}`, cls, pct: o.pct ?? 0, letter,
  stat: o.rankingId ? { stat: { slug: c.slug, statId: o.rankingId }, state: { sel: c.code, win: o.window }, label: `${o.name}: ${rankText(o)}, ${role}. Open league ranking` } : undefined,
});

function Identity({ c }: { c: ReadyCtx }) {
  const v = useMemo(() => identityOf(c.slug, c.profile, { adj: c.state.adj, win: c.state.win }, c.look), [c.slug, c.profile, c.state.adj, c.state.win, c.look]);
  if (!v) return <div className="tm-card tm-idt"><Eyebrow>Identity</Eyebrow><LockedRow title="Identity">The publication has no unit rankings for this team yet.</LockedRow></div>;
  const h = v.head;
  const control = v.control === 'basis'
    ? <SegC options={[[true, 'Adjusted'], [false, 'Raw']] as const} value={c.state.adj} onChange={(adj) => c.set({ adj })} label="Statistic basis" />
    : <SegC options={v.options.map((o) => [o.key, o.label] as const)} value={v.window} onChange={(win) => c.set({ win })} label="Window" />;
  return (
    <section className="tm-card tm-idt" aria-label="Identity">
      <div className="idh"><div><Eyebrow>Identity</Eyebrow><b>{v.title}</b></div>{control}</div>
      <div className="idbig">
        <StatT c={c} obs={h.off} label={`${h.offLabel.toLowerCase()}: ${rankText(h.off)}. Open league ranking`} className="o"><small>{h.offLabel}</small><b className="num">{ordinal(h.off.rank!)}</b><span>of {h.off.n} · {h.offText}</span></StatT>
        <StatT c={c} obs={h.def} label={`${h.defLabel.toLowerCase()}: ${rankText(h.def)}. Open league ranking`} className="d"><small>{h.defLabel}</small><b className="num">{ordinal(h.def.rank!)}</b><span>of {h.def.n} · {h.defText}</span></StatT>
      </div>
      {v.rows.map((r) => (
        <div className="idr" key={r.label}>
          <StatT c={c} obs={r.off} label={`${r.label}: ${r.off.name}, ${rankText(r.off)}. Open league ranking`} className="lab">{r.label}</StatT>
          <LeagueTrack marks={[markOf(c, r.def, 'd', r.marks[1], 'defense'), markOf(c, r.off, 'o', r.marks[0], 'offense')]} />
          <span className="rr">
            <StatT c={c} obs={r.off} label={`${r.off.name}: ${rankText(r.off)}. Open league ranking`} className="o"><b className="num">{r.off.rank}</b></StatT>
            <StatT c={c} obs={r.def} label={`${r.def.name}: ${rankText(r.def)}. Open league ranking`} className="d"><b className="num">{r.def.rank}</b></StatT>
          </span>
        </div>
      ))}
      <div className="idax"><TrackAxis /></div>
      <p className="tm-note">{v.sentence}</p>
    </section>
  );
}

function ExtremeRow({ c, o }: { c: ReadyCtx; o: StatObs }) {
  const role = o.role;
  const inner = (
    <>
      <span className={`rl ${role === 'off' ? 'o' : 'd'}`}>{role === 'off' ? 'OFF' : 'DEF'}</span>
      <span className="nm">{o.name.replace(/ allowed$/, '')}</span>
      <b className="num">{rankText(o)}</b>
      <LeagueTrack marks={[{ key: o.id, cls: role === 'off' ? 'o' : 'd', pct: o.pct ?? 0 }]} height={20} />
    </>
  );
  return <StatT c={c} obs={o} label={`${o.name}: ${rankText(o)}. Open league ranking`} className="exr">{inner}</StatT>;
}

function Extremes({ c }: { c: ReadyCtx }) {
  const win = c.decl.identity.control === 'window' ? resolveWindow(c.state.win, c.decl.identity.windows ?? ['SEASON']) : 'SEASON';
  const e = useMemo(() => extremesOf(c.slug, c.profile, win, c.look), [c.slug, c.profile, win, c.look]);
  if (!e) return <div className="tm-card tm-exc"><Eyebrow>Highest ranked</Eyebrow><LockedRow title="Rankings">Not enough ranked statistics are published for this team.</LockedRow></div>;
  return (
    <section className="tm-card tm-exc" aria-label="Highest and lowest ranked statistics">
      <div className="exh"><Eyebrow>Highest ranked</Eyebrow></div>
      {e.best.map((o) => <ExtremeRow key={o.id} c={c} o={o} />)}
      <div className="exh exh--gap"><Eyebrow>Lowest ranked</Eyebrow></div>
      {e.worst.map((o) => <ExtremeRow key={o.id} c={c} o={o} />)}
      <p className="tm-note">Raw {e.windowText.toLowerCase()} values among {e.n} teams. Tap any row for its league ranking.</p>
    </section>
  );
}

export function RecentMargins({ c, n, height, id }: { c: ReadyCtx; n: number; height?: number; id: string }) {
  const games = useMemo(() => lastN(completedGames(c.slug, c.profile, c.codeOf), n), [c.slug, c.profile, c.codeOf, n]);
  const bars: MarginBar[] = games.map((g) => {
    const opp = c.identity(g.oppCode ?? g.oppId ?? '—', g.oppName);
    const word = g.margin > 0 ? 'Win' : g.margin < 0 ? 'Loss' : 'Tie';
    const where = `${g.home === false ? 'at' : 'vs'} ${g.oppCode ?? g.oppName}`;
    return {
      key: g.eventId, margin: g.margin, game: { slug: c.slug, eventId: g.eventId }, opp, away: g.home === false,
      label: `${word} ${g.for} to ${g.against} ${where}. Open game`, oppLabel: `${opp.name}, team page`,
    };
  });
  return games.length ? <MarginBars bars={bars} scale={marginScale(games)} height={height} id={id} /> : null;
}

function Last({ c }: { c: ReadyCtx }) {
  const n = c.decl.form.overview;
  const games = useMemo(() => lastN(completedGames(c.slug, c.profile, c.codeOf), n), [c.slug, c.profile, c.codeOf, n]);
  const sa = scoredAllowed(games);
  const rec = c.profile.record?.text;
  return (
    <section className="tm-card tm-lst" aria-label={`Last ${n} games`}>
      <div className="exh"><Eyebrow>Last {n} games</Eyebrow><button type="button" className="seeall" onClick={() => c.set({ tab: 'form', all: false, exp: [] })}>Form <Icon name="chevR" size={14} /></button></div>
      {games.length ? (
        <>
          <RecentMargins c={c} n={n} id={`ov${c.code}`} />
          <p className="tm-note">{rec ? `${rec} this season · ` : ''}scored {oneDecimal(sa!.scored)} and allowed {oneDecimal(sa!.allowed)} per game{games.length < n ? ` over ${games.length} games` : ''}. Bars are the final margin.</p>
        </>
      ) : <LockedRow title="Results">No completed games are published for this team yet.</LockedRow>}
    </section>
  );
}

export function Overview({ c, next, nextLoading, total, propsInfo }: { c: TeamPageCtx; next: NextGameVM | null; nextLoading: boolean; total: string | null; propsInfo: PropsInfo | null }) {
  const ready = c.profile && !c.defsLoading ? (c as ReadyCtx) : null;
  return (
    <div className="tm-body">
      <NextStrip c={c} next={next} total={total} loading={nextLoading} />
      <PropsRow c={c} next={next} info={propsInfo} />
      {ready ? (
        <>
          <Identity c={ready} />
          <Extremes c={ready} />
          <Last c={ready} />
        </>
      ) : (
        <>
          <Skel h={382} label="Loading statistics" />
          <Skel h={330} />
          <Skel h={212} />
        </>
      )}
    </div>
  );
}

