// Team Research (TR1 to TR6, locked): `/v3/team/:slug/:teamId` where `teamId` is the team code ("DAL"). One published team document
// (the explorer team profile) answers every statistic, window, rank, universe size, availability, player and game; the league schedule
// is the authority for the next game's start time. Raw and opponent-adjusted statistics are never mixed. Team pages carry no SIFT
// model lane. State (tab, Adjusted or Raw, window, expanded rows) is the address, so Back and saved research restore it exactly.
import './team.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from '../../routing';
import { useMetricDefs, useResearchRepo, useSchedule, useTeamIndex, useTeamProfile } from '../data/research/hooks';
import { identityFor, useTeamProps } from '../data/research/teamHooks';
import { useSlate } from '../data/useSlate';
import { teamPhoto } from '../data/adapt';
import { capability, isReady, lockedReason, type Section } from '../model/capabilities';
import { findSaved } from '../model/saved';
import { metricLookup, nextGameOf } from '../model/teamResearch';
import { sampleLookup, sampleProfile, type SampleOpp, type SampleUpcoming } from '../model/teamSample';
import { teamSport } from '../model/teamSports';
import { routes } from '../nav/routes';
import { teamSchema, TEAM_TABS } from '../nav/schemas';
import { demoOn, pushVisit, removeSaved, saveResearch, useSaved } from '../state/prefs';
import { useRouteState } from '../state/url';
import { sampleTeamName } from '../data/useStat';
import { AlertBell, FollowStar } from '../ui/Controls';
import { HeroBg } from '../ui/HeroBg';
import { DataState } from '../ui/DataState';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { LockedRow, Tabs } from '../ui/atoms';
import { leagueLabel } from '../ui/gamebits';
import type { V3Team } from '../model/types';
import { TeamLegacy } from './TeamLegacy';
import { Form } from './team/Form';
import { Overview } from './team/Overview';
import { Players } from './team/Players';
import { Profile } from './team/Profile';
import { Schedule } from './team/Schedule';
import type { TeamPageCtx } from './team/parts';

type Tab = (typeof TEAM_TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', profile: 'Profile', form: 'Form', players: 'Players', schedule: 'Schedule' };
const SECTION: Record<Tab, Section> = { overview: 'teamOverview', profile: 'teamProfile', form: 'teamForm', players: 'teamPlayers', schedule: 'teamSchedule' };
const SAMPLE_POOL: Record<string, string[]> = {
  nfl: 'PHI NYG WAS KC SF BUF DEN CIN ATL CLE'.split(' '),
  nhl: 'TOR CGY VAN EDM TBL BOS NYR MTL OTT DET'.split(' '),
};

/** The back arrow: the previous entry when there is one, else the explorer (a deep link has nowhere to go back to). */
function useBack() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => { if (loc.key !== 'default') nav(-1); else nav('/v3/explore', { replace: true }); };
}

const splitName = (full: string) => {
  const w = full.split(' ');
  return w.length > 1 ? { first: w.slice(0, -1).join(' '), last: w[w.length - 1] } : { first: '', last: full };
};
const glowOf = (t: V3Team) => {
  const c = t.colors[0].toLowerCase();
  return c === '#000000' || c === '#ffffff' ? t.colors[1] : t.colors[0];
};

function SaveButton({ team, tab, c, record }: { team: V3Team; tab: Tab; c: Pick<TeamPageCtx, 'slug' | 'code' | 'state' | 'decl' | 'profile'>; record: string | null }) {
  const saved = useSaved();
  const route = routes.team({ slug: c.slug, id: c.code }, { tab: c.state.tab, adj: c.state.adj, win: c.state.win });
  const item = findSaved(saved, route);
  const basis = tab === 'profile' || (tab === 'overview' && c.decl.identity.control === 'basis') ? (c.state.adj ? 'Opponent-adjusted' : 'Raw') : null;
  const win = tab === 'profile' && !c.state.adj ? c.state.win : tab === 'overview' && c.decl.identity.control === 'window' ? c.state.win : null;
  const winWord = win ? (c.decl.windowWords[win] ?? win) : null;
  const chips = [TAB_LABEL[tab], basis, winWord].filter((x): x is string => !!x);
  return (
    <button type="button" className={`v3-iconbtn v3-star${item ? ' is-on' : ''}`} aria-pressed={!!item} aria-label={item ? `Remove saved ${team.name} research` : `Save ${team.name} research`}
      onClick={() => {
        if (item) { removeSaved(item.id); return; }
        saveResearch({
          title: team.name, subtitle: `${leagueLabel({ sport: team.sport })} · ${chips.join(' · ')}`, route, chips, kind: 'team', sport: c.slug,
          snapshot: record ? [{ label: 'Record', value: record, asOf: c.profile?.asOf ?? null }] : undefined,
        });
      }}>
      <Icon name="bookmark" size={22} fill={!!item} />
    </button>
  );
}

/** Football and hockey get the locked Team Research design; MLB is held with its reason; sports the design does not cover yet keep the earlier page. */
export function Team() {
  const { slug = '' } = useParams();
  return capability(slug, 'teamOverview').status === 'none' ? <TeamLegacy /> : <TeamResearch />;
}

function TeamResearch() {
  const { slug = '', teamId = '' } = useParams();
  const raw = decodeURIComponent(teamId);
  const back = useBack();
  const [state, set] = useRouteState(teamSchema);
  const demo = demoOn();
  const slate = useSlate();
  const capOk = isReady(slug, 'teamOverview');
  const decl = teamSport(slug);
  const [now] = useState(() => Date.now());

  const rr = useResearchRepo(slug);
  const ti = useTeamIndex(slug);
  const code = raw.startsWith('prt_') ? ti.byId.get(raw)?.short_name ?? raw : raw;
  const research = useTeamProfile(slug, capOk && !demo ? code : null);
  const defs = useMetricDefs(slug);
  const sch = useSchedule(slug);

  const defsLoading = !demo && capOk && !defs.data && !defs.error && (rr.loading || !!rr.repo);
  const look = useMemo(() => (demo ? sampleLookup(slug) : metricLookup(defs.data, slug)), [demo, slug, defs.data]);
  const codeOf = useCallback((id: string | null) => (id == null ? null : demo ? id : ti.byId.get(id)?.short_name ?? null), [demo, ti.byId]);
  const nameOf = useCallback((id: string | null) => (id == null ? null : demo ? sampleTeamName(slug, id) : ti.byId.get(id)?.display_name ?? null), [demo, slug, ti.byId]);
  const identity = useCallback((c: string, name: string | null) => identityFor(slug, c, demo ? sampleTeamName(slug, c) : ti.byCode.get(c)?.display_name ?? name, slate.games), [slug, demo, ti.byCode, slate.games]);

  // sample mode: a deterministic labelled profile from the sport's declaration, with the slate's own games for this team
  const sample = useMemo(() => {
    if (!demo || !capOk || !decl) return null;
    const seen = new Map<string, SampleOpp>();
    for (const g of slate.games) for (const t of [g.away, g.home]) if (t.slug === slug && !seen.has(t.id)) seen.set(t.id, { id: t.id, name: t.name });
    for (const c of SAMPLE_POOL[slug] ?? []) if (!seen.has(c)) seen.set(c, { id: c, name: sampleTeamName(slug, c) });
    const pool = [...seen.values()];
    const mine: SampleUpcoming[] = slate.games
      .filter((g) => g.slug === slug && (g.phase === 'pregame' || g.phase === 'live') && (g.away.id === code || g.home.id === code))
      .sort((a, b) => a.startMs - b.startMs)
      .map((g) => { const home = g.home.id === code; const o = home ? g.away : g.home; return { eventId: g.eventId, startUtc: new Date(g.startMs).toISOString(), oppCode: o.id, oppName: o.name, home }; });
    const extra: SampleUpcoming[] = [];
    const teams = pool.filter((p) => p.id !== code);
    for (let i = mine.length; i < 6 && teams.length; i++) extra.push({ eventId: `sample-${code}-u${i}`, startUtc: new Date(now + (i + 1) * 7 * 86_400_000).toISOString(), oppCode: teams[i % teams.length].id, oppName: teams[i % teams.length].name, home: i % 2 === 0 });
    return { pool, build: (c: string, n: string | null, up: SampleUpcoming[]) => sampleProfile(slug, c, n ?? sampleTeamName(slug, c), pool, up, now), upcoming: [...mine, ...extra] };
  }, [demo, capOk, decl, slate.games, slug, code, now]);
  const sampleMine = useMemo(() => (sample ? sample.build(code, null, sample.upcoming) : null), [sample, code]);
  const sampleOpp = useMemo(() => (sample ? (c: string, n: string | null) => sample.build(c, n, []) : null), [sample]);

  const profile = demo ? sampleMine : research.profile;
  const pid = demo ? code : ti.byCode.get(code)?.participant_id ?? null;
  const team = useMemo(() => identityFor(slug, code, profile?.name ?? (demo ? sampleTeamName(slug, code) : ti.byCode.get(code)?.display_name ?? null), slate.games), [slug, code, profile?.name, demo, ti.byCode, slate.games]);

  const nextEv = pid && !demo ? sch.next(pid, now) : null;
  const next = useMemo(() => nextGameOf(profile, pid, demo ? [] : sch.schedule, nextEv, codeOf, nameOf, now), [profile, pid, demo, sch.schedule, nextEv, codeOf, nameOf, now]);
  const nextLoading = !next && (!demo && (ti.loading || sch.loading || (!profile && !research.error)));
  const total = useMemo(() => (next ? slate.games.find((g) => g.slug === slug && g.eventId === next.eventId)?.lines.find((l) => l.kind === 'total')?.label ?? null : null), [next, slate.games, slug]);
  const props = useTeamProps(slug, next, useMemo(() => profile?.players.map((p) => p.participantId) ?? [], [profile]));

  const c: TeamPageCtx | null = decl ? { slug, code, team, decl, profile, defsLoading, look, state, set, now, demo, codeOf, nameOf, identity } : null;

  // the hero collapses into the compact bar once it has scrolled away
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const tab = state.tab as Tab;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-56px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, capOk]);
  useEffect(() => { if (team.name && team.name !== code) pushVisit({ route: `/v3/team/${slug}/${encodeURIComponent(code)}`, title: team.name, subtitle: `${leagueLabel({ sport: team.sport })} · team`, kind: 'team', slug, logo: team.logo }); }, [team.name, team.logo, code, slug, team.sport]);

  const photo = useMemo(() => (demo || !capOk ? null : teamPhoto(team.sport, code, team.name, new Date().toISOString())), [demo, capOk, team.sport, team.name, code]);
  const tabs = TEAM_TABS.filter((t) => isReady(slug, SECTION[t]));
  const tabOk = isReady(slug, SECTION[tab]);
  const key = `${team.slug}:${team.id}`;
  const record = profile?.record?.text ?? null;
  const { first, last } = splitName(team.name);
  const unknownTeam = !demo && capOk && !ti.loading && ti.teams.length > 0 && !ti.byCode.has(code);
  // A document that could not be read is not a missing team or an empty record: the screen says which, and offers Retry.
  // No explorer at all for the sport (the publication lists none, or the index could not be read): say so rather than keep a skeleton.
  const noResearch = !demo && capOk && !rr.loading && !rr.explorer;
  const failed = !demo && capOk && !research.profile && !research.loading && (research.failure != null || noResearch);

  const bar = (
    <>
      <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={24} /></button>
      <TeamLogo team={team} size={30} />
      <b className="tm-bar__n">{team.name}</b>
      {record ? <span className="tm-rec" aria-label={`Record ${record}`}><b className="num">{record}</b></span> : capOk && !unknownTeam && !failed && (research.loading || ti.loading) ? <span className="tm-rec tm-rec--skel" aria-hidden="true" /> : null}
      <span className="tm-bar__r">
        <FollowStar kind="teams" id={key} label={team.name} />
        {c && <SaveButton team={team} tab={tab} c={c} record={record} />}
      </span>
    </>
  );

  if (!capOk || !decl) {
    const reason = lockedReason(slug, 'teamOverview') ?? 'This sport is not part of the research screens.';
    return (
      <div className="tm" data-screen="team">
        <div className="tm-bar tm-bar--sticky"><button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={24} /></button><TeamLogo team={team} size={30} /><b className="tm-bar__n">{team.name}</b></div>
        <div className="tm-body"><div className="v3-state v3-state--warn" role="note"><Icon name="info" size={20} /><div><b>Team research is not shown for {leagueLabel({ sport: team.sport })}</b>{reason}</div></div></div>
      </div>
    );
  }

  return (
    <div className="tm" data-screen="team" data-tab={tab}>
      {tab === 'overview' ? (
        <>
          <header className="tm-hero" style={{ ['--tc' as string]: glowOf(team) }}>
            {photo ? <HeroBg g={{ away: team, home: team, photo }} cover /> : <i className="tm-hero__glow" aria-hidden="true" />}
            <i className="tm-hero__shade" aria-hidden="true" />
            <div className="tm-hero__bar">
              <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
              <span className="tm-hero__act"><AlertBell id={key} label={team.name} /><FollowStar kind="teams" id={key} label={team.name} />{c && <SaveButton team={team} tab={tab} c={c} record={record} />}</span>
            </div>
            <div className="tm-hero__who">
              <div className="wl"><TeamLogo team={team} size={54} /><h1 className="wn">{first && <span className="f">{first}</span>}<span className="l">{last}</span></h1></div>
              <span className="m">{leagueLabel({ sport: team.sport })}{profile?.season ? ` · ${profile.season.replace('-', '–')} season` : ''}{demo ? ' · sample data' : ''}
                {record ? <span className="tm-rec" aria-label={`Record ${record}`}><b className="num">{record}</b></span> : !unknownTeam && !failed && (research.loading || ti.loading) ? <span className="tm-rec tm-rec--skel" aria-hidden="true" /> : null}
              </span>
            </div>
          </header>
          <div ref={sentinel} className="tm-sentinel" aria-hidden="true" />
          <div className={`tm-bar tm-bar--fixed${collapsed ? ' is-on' : ''}`} aria-hidden={!collapsed}>{bar}</div>
        </>
      ) : (
        <div className="tm-bar tm-bar--sticky">{bar}</div>
      )}
      <div className="tm-tabs"><Tabs tabs={tabs.map((t) => ({ key: t, label: TAB_LABEL[t] }))} value={tab} onChange={(k) => set({ tab: k, all: false, exp: [] })} label="Team sections" /></div>
      {failed ? (
        <div className="tm-body"><DataState title="Team statistics unavailable" err={research.failure ?? new Error('not published')} retry={research.retry} alert>This team's research</DataState></div>
      ) : unknownTeam ? (
        <div className="tm-body"><div className="v3-state" role="note"><Icon name="info" size={20} /><div><b>Team not found</b>The publication has no team with the code {code} for {leagueLabel({ sport: team.sport })}.</div></div></div>
      ) : !tabOk ? (
        <div className="tm-body"><LockedRow title={TAB_LABEL[tab]}>{lockedReason(slug, SECTION[tab])}</LockedRow></div>
      ) : research.error && !profile && !demo ? (
        <div className="tm-body"><DataState title="Team statistics unavailable" err={research.failure ?? new Error('not published')} retry={research.retry} alert>This team's research</DataState></div>
      ) : c && tab === 'overview' ? (
        <Overview c={c} next={next} nextLoading={nextLoading} total={total} propsInfo={props && next ? { props: props.props, players: props.players } : null} />
      ) : c && tab === 'profile' ? <Profile c={c} />
      : c && tab === 'form' ? <Form c={c} />
      : c && tab === 'players' ? <Players c={c} propCounts={props?.byPlayer ?? null} />
      : c && tab === 'schedule' ? <Schedule c={c} schedule={demo ? [] : sch.schedule} sampleOpp={sampleOpp} />
      : null}
      {demo && <p className="tm-note tm-note--pad">Sample data: the statistics, results and ranks on this page are invented to show the design.</p>}
    </div>
  );
}

