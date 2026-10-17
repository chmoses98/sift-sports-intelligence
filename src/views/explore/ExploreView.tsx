// RESEARCH LAB (route /explore) — research without starting from a game. One sport at a time: a photo masthead with
// the sport selector, then the seven tool categories every research path starts from (src/views/explore/labTools.ts:
// Teams · Players · Props · Matchup compare · Season · Stats & rankings · Model Pulse; a tool the sport does not
// publish says why), then the tools that live here: the interactive team rankings table, key matchups this week,
// quick stats, the season timeline, Stats & rankings (every published ranking), the player finder and the team grid.
// ?tool=<key> scrolls to a tool, so Home and other screens can link straight to one.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from '../../routing';
import type { BoardItem } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { NAV_SPORTS, navSport } from '../../data/nav';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { sportBySlug } from '../../data/sports';
import { HubMast, hubPhoto } from '../../components/HubMast';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { Skeleton } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useVisit } from '../../state/trail';
import { PMark } from '../broadcast/parts';
import { cleanRank, KeyMatchups, QuickStats, RankingsTable, SeasonTimeline, teamRankings, type SearchItem } from './hub';
import { EXPLORE_PHOTO } from './photos';
import { LAB_TOOLS, labHref, type LabToolKey } from './labTools';
import '../../styles/lane-e-season.css';
import { ProjectionScorecard } from '../../components/ProjectionScorecard';

function useExplorer(slug: string) {
  return useAsync(`explore:v2:${slug}`, async () => {
    const sport = sportBySlug(slug);
    if (!sport) return null;
    const repo = new SportRepo(await resolveSource(sport));
    const publication = await repo.board().catch(() => null);
    const board = (publication?.items ?? []) as BoardItem[];
    const boardUnavailable = publication == null;
    if (!repo.hasExplorer) return { sport, repo, teams: [], items: [] as SearchItem[], available: false, board, boardUnavailable };
    const [idx, si] = await Promise.all([repo.index(), repo.searchIndex().catch(() => null)]);
    return { sport, repo, teams: idx.teams, items: ((si?.items ?? []) as unknown as SearchItem[]), available: true, board, boardUnavailable };
  });
}

const rankGroup = (label: string) => (/\(ADJ/i.test(label) ? 'Opponent-adjusted' : /\(L\d+\)/.test(label) ? 'Recent form' : /\(SEASON\)|season/i.test(label) ? 'This season' : 'Other rankings');

interface Tool { key: LabToolKey; title: string; sub: string; icon: string; tone: string; to?: string; off?: string; art?: React.ReactNode }

/** The hub section each in-page tool scrolls to. */
const SECTION: Partial<Record<LabToolKey, string>> = { teams: 'teams', players: 'players', stats: 'stats' };

export function ExploreView() {
  useVisit('Research Lab', 'explore');
  const [sp, setSp] = useSearchParams();
  const slug = sp.get('sport') ?? 'nfl';
  const ex = useExplorer(slug);
  const [rq, setRq] = useState('');
  const [pq, setPq] = useState('');
  const [allRk, setAllRk] = useState(false);
  const nav = navSport(slug);
  const items = useMemo(() => ex.data?.items ?? [], [ex.data]);
  const rankings = useMemo(() => items.filter((i) => i.kind === 'RANKING' && (!rq || i.label.toLowerCase().includes(rq.toLowerCase()))), [items, rq]);
  const groups = useMemo(() => {
    const m = new Map<string, SearchItem[]>();
    for (const r of rankings) m.set(rankGroup(r.label), [...(m.get(rankGroup(r.label)) ?? []), r]);
    return ['Opponent-adjusted', 'This season', 'Recent form', 'Other rankings'].filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [rankings]);
  const players = useMemo(() => items.filter((i) => i.kind === 'PLAYER' && (!pq || `${i.label} ${i.secondary ?? ''} ${i.context?.team ?? ''}`.toLowerCase().includes(pq.toLowerCase()))).slice(0, 24), [items, pq]);
  const nPlayers = useMemo(() => items.filter((i) => i.kind === 'PLAYER').length, [items]);
  const teamRk = useMemo(() => teamRankings(items), [items]);
  const teams = ex.data?.teams ?? [];
  const code = ex.data?.sport.code ?? slug.toUpperCase();
  const avail = !!ex.data?.available;
  const lead = teams.slice(0, 2);
  const nRankings = items.filter((i) => i.kind === 'RANKING').length;
  const art = lead.length === 2 ? <span className="ex-tool__marks">{lead.map((t) => <PMark key={t.participant_id} sport={code} p={{ participant_id: t.participant_id, display_name: t.display_name, short_name: t.short_name, participant_type: 'TEAM' } as never} size="md" />)}</span> : undefined;
  // What each category says for this sport: a count from the publication, or why the tool is not here.
  const detail: Record<LabToolKey, Pick<Tool, 'sub' | 'off' | 'art'>> = {
    teams: teams.length ? { sub: `${teams.length} ${code === 'TENNIS' ? 'players' : 'teams'}${teamRk.length ? `, ${teamRk.length} team rankings` : ''}` } : { sub: 'No team research published', off: 'Not published' },
    players: nPlayers ? { sub: `Find any of ${nPlayers.toLocaleString()} players` } : { sub: 'No player index published', off: 'Not published' },
    props: { sub: 'Every published prop: projection, range, line, price' },
    compare: avail ? { sub: 'Two teams side by side, rank by rank', art } : { sub: 'Needs the sport’s research explorer', off: 'Not published' },
    season: { sub: slug === 'nfl' ? 'Week by week: matchups, scores, results against the spread' : 'The calendar, day by day' },
    stats: nRankings ? { sub: `${nRankings} published rankings, opponent-adjusted first` } : { sub: 'No rankings published', off: 'Not published' },
    pulse: { sub: `How the ${nav?.label ?? code} model has done against the market` },
  };
  const tools: Tool[] = LAB_TOOLS.map((t) => {
    const d = detail[t.key];
    const sec = SECTION[t.key];
    return { ...t, ...d, title: t.key === 'season' && slug !== 'nfl' ? 'Schedule' : t.title, to: d.off ? undefined : sec ? `#${sec}` : labHref(t.key, slug) };
  });
  // ?tool=<key>: scroll to the tool's section once the sport's research has loaded.
  const toolParam = sp.get('tool') as LabToolKey | null;
  const loaded = !!ex.data;
  useEffect(() => {
    const id = toolParam ? SECTION[toolParam] : null;
    if (!id || !loaded) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [toolParam, loaded]);
  return (
    <div className="page explore exh">
      <HubMast title="Research Lab" eyebrow="SIFT research" sub="Teams, players, props, matchups and seasons, from each sport’s publication." photo={hubPhoto(EXPLORE_PHOTO[slug])}>
        <div className="tm-chips exh__sports" role="group" aria-label="Sport">
          {NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => (
            <button key={s.slug} type="button" className={`tm-chip${slug === s.slug ? ' is-on' : ''}`} aria-pressed={slug === s.slug} onClick={() => setSp({ sport: s.slug }, { replace: true })}><SportMark slug={s.slug} icon={s.icon} size={15} />{s.label}</button>
          ))}
        </div>
      </HubMast>
      <section aria-labelledby="tools-h" className="exh__tools">
        <h2 className="sr-only" id="tools-h">{nav?.label} research tools</h2>
        <ul className="ex-toolgrid">
          {tools.map((t) => {
            const body = (
              <>
                <span className="ex-tool__ic" aria-hidden="true"><Icon name={t.icon} size={22} /></span>
                <span className="ex-tool__t">{t.title}</span>
                <span className="ex-tool__s">{t.sub}</span>
                {t.art && <span className="ex-tool__art" aria-hidden="true">{t.art}</span>}
                {t.off ? <span className="ex-tool__off">{t.off}</span> : <Icon name="chevronRight" size={16} className="ex-tool__go" />}
              </>
            );
            return <li key={t.key}>{t.to ? (t.to.startsWith('#') ? <button type="button" className={`ex-tool ex-tool--${t.tone}`} onClick={() => { setSp((prev) => { const n = new URLSearchParams(prev); n.set('tool', t.key); return n; }, { replace: true }); document.getElementById(t.to!.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{body}</button> : <Link to={t.to} className={`ex-tool ex-tool--${t.tone}`}>{body}</Link>) : <div className={`ex-tool ex-tool--${t.tone} is-off`} aria-disabled="true">{body}</div>}</li>;
          })}
        </ul>
      </section>
      {ex.loading && <Skeleton lines={8} tall />}
      {ex.error && <p role="alert" className="fr-note">Research is unavailable. The publication could not be read; missing research is not a no-opportunity verdict.</p>}
      {ex.data?.boardUnavailable && <p role="alert" className="fr-note">Schedule and matchup publication unavailable. Other published research remains accessible; this is not evidence of an empty slate or no opportunities.</p>}
      {ex.data && !avail && <div className="bempty"><h3>{nav?.label} has no research explorer yet</h3><p>Its publication carries the board and markets but not team and player research documents. Open <Link to={routes.sport(slug)}>{nav?.label}</Link> for what it does publish.</p></div>}
      {ex.data && (
        <div className="fx-bento exh__bento">
          {avail && teamRk.length > 0 && <div className="fx-span-5"><RankingsTable key={`rk:${slug}`} slug={slug} code={code} repo={ex.data.repo} items={items} /></div>}
          {!ex.data.boardUnavailable && <div className={avail && teamRk.length > 0 ? 'fx-span-4' : 'fx-span-6'}><KeyMatchups key={`km:${slug}`} slug={slug} code={code} repo={ex.data.repo} board={ex.data.board} available={avail} /></div>}
          {avail && teamRk.length > 0 && <div className="fx-span-3"><QuickStats key={`qs:${slug}`} code={code} repo={ex.data.repo} items={items} /></div>}
          {!ex.data.boardUnavailable && <div className={avail && teamRk.length > 0 ? 'fx-span-12' : 'fx-span-6'}><SeasonTimeline key={`tl:${slug}`} slug={slug} code={code} repo={ex.data.repo} board={ex.data.board} /></div>}
        </div>
      )}
      {ex.data && <ProjectionScorecard sport={code} />}
      {avail && (
        <div className="explore__cols exh__cols">
          <section className="fx-card" aria-labelledby="stats-h" id="stats">
            <header className="fx-card__h"><h2 className="fx-card__t" id="stats-h"><Icon name="chart" size={17} /><span>Stats &amp; rankings</span></h2><small className="muted">{rankings.length}</small></header>
            <label className="explore__q"><Icon name="search" size={15} /><input type="search" value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Filter rankings (EPA, rush, sack…)" aria-label="Filter rankings" /></label>
            {groups.map(([g, rs]) => (
              <div key={g} className="explore__grp">
                <h3 className="bgame__gh">{g} <small>{rs.length}</small></h3>
                <ul className="rklist">{rs.slice(0, allRk || rq ? 60 : 9).map((r) => <li key={r.id}><Link to={routes.ranking(slug, r.id)}>{cleanRank(r.label)}<Icon name="chevronRight" size={14} className="chev" /></Link></li>)}</ul>
              </div>
            ))}
            {!groups.length && <p className="muted">No ranking matches.</p>}
            {groups.some(([, rs]) => rs.length > 9) && !rq && <button type="button" className="btn btn--sm btn--glass" aria-expanded={allRk} onClick={() => setAllRk((x) => !x)}>{allRk ? 'Show fewer' : `Show all ${rankings.length} rankings`}</button>}
          </section>
          <section className="fx-card" aria-labelledby="players-h" id="players">
            <header className="fx-card__h"><h2 className="fx-card__t" id="players-h"><Icon name="star" size={17} /><span>Players</span></h2></header>
            <label className="explore__q"><Icon name="search" size={15} /><input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Find a player or team" aria-label="Find a player" /></label>
            {players.length ? <ul className="rklist">{players.map((p) => <li key={p.id}><Link to={routes.player(slug, p.id)}>{p.label}<span className="muted"> · {p.secondary ?? p.context?.team ?? ''}</span><Icon name="chevronRight" size={14} className="chev" /></Link></li>)}</ul> : <p className="muted">{pq ? 'No player matches.' : 'This publication lists no players.'}</p>}
          </section>
        </div>
      )}
      {teams.length > 0 && (
        <section className="fx-card exh__teams" aria-labelledby="teams-h" id="teams">
          <header className="fx-card__h"><h2 className="fx-card__t" id="teams-h"><Icon name="shield" size={17} /><span>{code === 'TENNIS' ? 'Players' : 'Teams'}</span></h2><small className="muted">{teams.length}</small></header>
          <ul className="tgrid">
            {teams.slice(0, 400).map((t) => (
              <li key={t.participant_id}>
                <Link to={routes.team(slug, t.participant_id)} className="tcell" title={t.display_name}>
                  <PMark sport={code} p={{ participant_id: t.participant_id, display_name: t.display_name, short_name: t.short_name, participant_type: 'TEAM' } as never} size="md" />
                  <span>{code === 'NFL' || code === 'NHL' || code === 'NBA' || code === 'MLB' ? t.short_name : t.display_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
