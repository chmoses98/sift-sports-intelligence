// SEASON NAVIGATOR — the season on one screen instead of an endless week-by-week list.
// NFL: an 18-week grid (games published per week, finals, the selected team's opponent), the selected week's
// games as tiles, the selected team's results from its own profile, and its weekly opponent-unadjusted EPA per play
// from the nflverse history layer. Weeks the publication has not listed yet say so; nothing is filled in.
// Other sports: a date strip over the publication's board (their calendars are daily, not weekly).
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem, ExplorerIndexDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { Skeleton, TeamMark } from '../../components/ui';
import { completedGames } from '../../lib/gamedata';
import { routes } from '../../lib/routes';
import { useTeamHistory } from '../../history/load';
import type { TeamWeek } from '../../history/types';
import { useSport } from '../../state/sport';
import { EXPLORE_STEP, useVisit } from '../../state/trail';
import { eventPhase } from '../../opportunity/lifecycle';

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const DAY = 86_400_000;

/** The Tuesday that opens week 1: the Tuesday on or before the season's first published game. */
export function weekAnchor(firstGameIso: string): number {
  const d = new Date(firstGameIso);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(utc).getUTCDay(); // 0 Sun … 2 Tue
  return utc - ((dow - 2 + 7) % 7) * DAY;
}

/** NFL week of a kickoff: weeks run Tuesday to Monday from the anchor (kickoffs are UTC; late Monday games stay in week). */
export function weekOf(iso: string, anchor: number): number {
  return Math.floor((Date.parse(iso) - 6 * 3600_000 - anchor) / (7 * DAY)) + 1;
}

type Ev = ExplorerIndexDoc['events'][number];

/**
 * Week 1's anchor from the history layer: a completed game's own nflverse week and local date name the week
 * exactly, so the grid does not depend on how far back the publication's window reaches. Null when there is none.
 */
export function anchorFromHistory(weeks: Pick<TeamWeek, 'week' | 'date'>[]): number | null {
  const w = weeks.find((x) => x.date && x.week >= 1);
  if (!w?.date) return null;
  return weekAnchor(new Date(Date.parse(`${w.date}T12:00:00Z`) - (w.week - 1) * 7 * DAY).toISOString());
}

/**
 * What one week says about one team. Sift has no authoritative complete league schedule, so it never infers a
 * bye: a week without the team's game is either a completed game the history layer recorded, or "not published".
 *  - game: the publication lists the team's game (home/away from the event itself);
 *  - played: no published event, but the play-by-play history recorded the team's game that week;
 *  - conflict: the published event names the team on both sides, or its opponent is the team itself;
 *  - unpublished: the publication lists other games that week but not this team's (partial window);
 *  - unlisted: the publication lists nothing that week.
 */
export type WeekCell =
  | { kind: 'game'; ev: Ev; opp: string; home: boolean }
  | { kind: 'played'; opp: string; home: boolean | null; gameId: string }
  | { kind: 'conflict'; ev: Ev; reason: string }
  | { kind: 'unpublished'; games: number }
  | { kind: 'unlisted' };

export function weekCell(
  games: Ev[],
  team: { participant_id: string; short_name: string | null } | null,
  nameOf: (pid: string | null) => string,
  history: Pick<TeamWeek, 'week' | 'opp' | 'home' | 'game_id'> | undefined,
): WeekCell {
  const mine = team ? games.find((e) => e.participants.includes(team.participant_id) || e.home_participant === team.participant_id || e.away_participant === team.participant_id) : undefined;
  if (mine && team) {
    const isHome = mine.home_participant === team.participant_id;
    const isAway = mine.away_participant === team.participant_id;
    if (mine.home_participant && mine.home_participant === mine.away_participant) return { kind: 'conflict', ev: mine, reason: 'the event names the same team home and away' };
    if (isHome === isAway) return { kind: 'conflict', ev: mine, reason: 'the event does not say which side this team is' };
    const opp = nameOf(isHome ? mine.away_participant : mine.home_participant);
    if (opp === '?' || opp === team.short_name) return { kind: 'conflict', ev: mine, reason: 'the opponent cannot be identified' };
    return { kind: 'game', ev: mine, opp, home: isHome };
  }
  if (history?.opp && history.opp !== team?.short_name) return { kind: 'played', opp: history.opp, home: history.home, gameId: history.game_id };
  return games.length ? { kind: 'unpublished', games: games.length } : { kind: 'unlisted' };
}

/** The clock decides, not a stale status word: a past kickoff without a final reads "Awaiting result". */
function phaseText(g: Pick<Ev, 'status' | 'start_time_utc'>): string {
  const p = eventPhase(g, Date.now()).phase;
  return p === 'FINAL' ? 'Final' : p === 'STARTED' ? 'Awaiting result' : p === 'PREGAME' ? 'Upcoming' : p.charAt(0) + p.slice(1).toLowerCase();
}

function epaPerPlay(u: TeamWeek['off']): number | null {
  const n = (u.dropbacks ?? 0) + (u.rushes ?? 0);
  if (!n) return null;
  return ((u.db_epa ?? 0) + (u.rush_epa ?? 0)) / n;
}

/** Weekly offense and defense EPA per play for one team: two labelled lines, zero marked. */
function TrendChart({ weeks, abbr }: { weeks: TeamWeek[]; abbr: string }) {
  const pts = weeks.map((w) => ({ w: w.week, off: epaPerPlay(w.off), def: epaPerPlay(w.def) })).filter((p) => p.off != null || p.def != null);
  if (pts.length < 2) return <p className="muted">Not enough completed weeks to draw a trend yet.</p>;
  const W = 520, H = 200, P = 34;
  const vals = pts.flatMap((p) => [p.off, p.def]).filter((v): v is number => v != null);
  const lo = Math.min(-0.2, ...vals), hi = Math.max(0.2, ...vals);
  const x = (wk: number) => P + ((wk - 1) / 17) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const line = (k: 'off' | 'def') => pts.filter((p) => p[k] != null).map((p) => `${x(p.w)},${y(p[k] as number)}`).join(' ');
  return (
    <figure className="strend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${abbr} EPA per play by week: ${pts.map((p) => `week ${p.w} offense ${p.off?.toFixed(2)} defense allowed ${p.def?.toFixed(2)}`).join('; ')}`}>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="strend__zero" />
        {WEEKS.filter((w) => w % 3 === 1 || w === 18).map((w) => <text key={w} x={x(w)} y={H - 10} className="strend__t" textAnchor="middle">W{w}</text>)}
        <text x={6} y={y(0) + 4} className="strend__t">0</text>
        <polyline points={line('off')} className="strend__off" />
        <polyline points={line('def')} className="strend__def" />
        {pts.map((p) => p.off != null && <circle key={`o${p.w}`} cx={x(p.w)} cy={y(p.off)} r={4} className="strend__dot strend__dot--off" />)}
        {pts.map((p) => p.def != null && <circle key={`d${p.w}`} cx={x(p.w)} cy={y(p.def)} r={4} className="strend__dot strend__dot--def" />)}
      </svg>
      <figcaption><span className="lg lg--focus">Offense EPA/play (higher is better)</span> <span className="lg lg--opp">Defense EPA/play allowed (lower is better)</span> · raw nflverse play-by-play, not opponent-adjusted</figcaption>
    </figure>
  );
}

function NflSeason() {
  const { repo, slug, sport } = useSport();
  const [sp, setSp] = useSearchParams();
  const idx = useAsync(`season:idx:${repo.source.root}`, () => repo.index());
  const board = useAsync(`season:board:${repo.source.root}`, () => repo.board().catch(() => null));
  const hist = useTeamHistory(sport.code);
  const data = idx.data;
  const teams = useMemo(() => [...(data?.teams ?? [])].sort((a, b) => (a.short_name ?? '').localeCompare(b.short_name ?? '')), [data]);
  const byId = useMemo(() => new Map(teams.map((t) => [t.participant_id, t])), [teams]);
  const teamAbbr = sp.get('team') ?? teams[0]?.short_name ?? null;
  const team = teams.find((t) => t.short_name === teamAbbr) ?? null;
  const profile = useAsync(team ? `season:prof:${team.participant_id}` : null, () => repo.profile(team!.participant_id));
  const season = String(new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0));
  const events: Ev[] = useMemo(() => {
    const m = new Map<string, Ev>();
    for (const e of data?.events ?? []) m.set(e.event_id, e);
    for (const b of (board.data?.items ?? []) as BoardItem[]) if (!m.has(b.event_id)) m.set(b.event_id, { event_id: b.event_id, path: '', start_time_utc: b.start_time_utc, status: b.status, home_participant: b.home_participant, away_participant: b.away_participant, participants: b.participants.map((p) => p.participant_id) });
    return [...m.values()].filter((e) => e.start_time_utc.startsWith(season) || e.start_time_utc.startsWith(String(Number(season) + 1)));
  }, [data, board.data, season]);
  // Week numbering: from the history layer's own week/date when it has one (exact), else the Tuesday before the
  // first September-or-later game the publication lists (exact only when its window reaches week 1).
  const histAnchor = useMemo(() => {
    for (const t of Object.values(hist.data?.teams ?? {})) {
      const a = anchorFromHistory(t.weeks);
      if (a != null) return a;
    }
    return null;
  }, [hist.data]);
  const anchor = useMemo(() => {
    if (histAnchor != null) return histAnchor;
    const first = events.map((e) => e.start_time_utc).filter((t) => t.slice(5, 7) >= '09' || t.startsWith(String(Number(season) + 1))).sort()[0];
    return first ? weekAnchor(first) : null;
  }, [events, season, histAnchor]);
  const byWeek = useMemo(() => {
    const m = new Map<number, Ev[]>();
    if (anchor == null) return m;
    for (const e of events) { const w = weekOf(e.start_time_utc, anchor); if (w >= 1 && w <= 18) m.set(w, [...(m.get(w) ?? []), e]); }
    for (const v of m.values()) v.sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
    return m;
  }, [events, anchor]);
  const now = Date.now();
  const currentWeek = anchor != null ? Math.max(1, Math.min(18, weekOf(new Date(now).toISOString(), anchor))) : 1;
  const week = Number(sp.get('week') ?? currentWeek);
  const results = useMemo(() => new Map(completedGames(profile.data).map((g) => [g.eventId, g])), [profile.data]);
  const teamWeeks = (team?.short_name && hist.data?.teams[team.short_name]?.weeks) || [];
  const set = (k: string, v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  if (idx.loading) return <Skeleton lines={10} tall />;
  if (!data) return <div className="bempty"><h3>The NFL explorer is not available</h3><p>The season navigator needs the publication’s event index.</p></div>;
  const games = byWeek.get(week) ?? [];
  const nameOf = (pid: string | null) => (pid ? byId.get(pid)?.short_name ?? '?' : '?');
  return (
    <>
      <section className="bsec" aria-labelledby="sgrid-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="sgrid-h"><Icon name="grid" size={20} /> {season} season</h2>
          <label className="term__sel season__team"><span>Team</span>
            <select value={teamAbbr ?? ''} onChange={(e) => set('team', e.target.value || null)}>
              {teams.map((t) => <option key={t.participant_id} value={t.short_name ?? ''}>{t.display_name}</option>)}
            </select>
          </label>
        </div>
        <ol className="wgrid" aria-label="Weeks">
          {WEEKS.map((w) => {
            const gs = byWeek.get(w) ?? [];
            const finals = gs.filter((g) => /FINAL/i.test(g.status)).length;
            const cell = weekCell(gs, team, nameOf, teamWeeks.find((x) => x.week === w));
            const res = cell.kind === 'game' ? results.get(cell.ev.event_id) : undefined;
            const at = (home: boolean | null) => (home == null ? 'vs' : home ? 'vs' : '@');
            const teamText =
              cell.kind === 'game' ? `; ${teamAbbr} ${at(cell.home)} ${cell.opp}` :
              cell.kind === 'played' ? `; ${teamAbbr} ${at(cell.home)} ${cell.opp}, completed (play-by-play record)` :
              cell.kind === 'conflict' ? `; ${teamAbbr}: identity conflict, ${cell.reason}` :
              cell.kind === 'unpublished' ? `; ${teamAbbr}'s game is not in the publication` : '';
            return (
              <li key={w}>
                <button type="button" className={`wcell${w === week ? ' is-on' : ''}${w === currentWeek ? ' is-now' : ''}${gs.length || cell.kind === 'played' ? '' : ' is-empty'}`} aria-pressed={w === week} onClick={() => set('week', String(w))} aria-label={`Week ${w}: ${gs.length ? `${gs.length} games published, ${finals} final` : 'not published yet'}${teamText}`} data-cell={cell.kind}>
                  <span className="wcell__w">W{w}</span>
                  {cell.kind === 'game' || cell.kind === 'played' ? (
                    <span className="wcell__opp"><i className="wcell__at">{at(cell.home)}</i><TeamMark sport="NFL" abbr={cell.opp} size="sm" />{cell.opp}</span>
                  ) : cell.kind === 'conflict' ? (
                    <span className="wcell__opp wcell__opp--none">Identity conflict</span>
                  ) : cell.kind === 'unpublished' ? (
                    <span className="wcell__opp wcell__opp--none">Not published</span>
                  ) : (
                    <span className="wcell__opp wcell__opp--none">—</span>
                  )}
                  {res ? <span className={`wcell__res wcell__res--${res.outcome}`}>{res.outcome} {res.for}–{res.against}</span>
                    : cell.kind === 'game' ? <span className="wcell__st">{phaseText(cell.ev)}</span>
                    : cell.kind === 'played' ? <span className="wcell__st">Completed</span>
                    : cell.kind === 'unpublished' ? <span className="wcell__st">{gs.length} other games listed</span>
                    : cell.kind === 'conflict' ? <span className="wcell__st">{cell.reason}</span>
                    : <span className="wcell__st">Not listed</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="tpanel__note">Weeks come from the publication’s event index and board. A game the publication does not list but the play-by-play history recorded shows as Completed; anything else is “Not published” or “—”. Sift has no complete league schedule, so it never marks a bye. Results are the selected team’s, from its own profile.</p>
      </section>
      <section className="bsec" aria-labelledby="wk-h">
        <div className="bsec__h"><h2 className="bsec__t" id="wk-h">Week {week}</h2><span className="muted">{games.length} games</span></div>
        {games.length ? (
          <ul className="wgames">
            {games.map((g) => {
              const a = nameOf(g.away_participant), h = nameOf(g.home_participant);
              const res = results.get(g.event_id);
              const teamHome = team && g.home_participant === team.participant_id;
              const score = res ? (teamHome ? `${a} ${res.against} – ${res.for} ${h}` : `${a} ${res.for} – ${res.against} ${h}`) : null;
              return (
                <li key={g.event_id}>
                  <Link to={routes.game(slug, g.event_id)} className={`glass wgame${team && g.participants.includes(team.participant_id) ? ' is-mine' : ''}`}>
                    <span className="wgame__when">{new Date(g.start_time_utc).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="wgame__m"><TeamMark sport="NFL" abbr={a} size="md" /><b>{a}</b><i>@</i><b>{h}</b><TeamMark sport="NFL" abbr={h} size="md" /></span>
                    <span className="wgame__st">{score ?? phaseText(g)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <div className="bempty"><h3>Week {week} is not listed yet</h3><p>The publication lists games as its schedule window reaches them.</p></div>}
      </section>
      {team && (
        <section className="bsec" aria-labelledby="perf-h">
          <div className="bsec__h"><h2 className="bsec__t" id="perf-h"><TeamMark sport="NFL" abbr={team.short_name} size="md" /> {team.display_name} by week</h2><Link to={routes.team(slug, team.participant_id)} className="bsec__more">Team page <Icon name="arrowRight" size={14} /></Link></div>
          <div className="glass season__perf">{hist.loading ? <Skeleton lines={4} /> : <TrendChart weeks={teamWeeks} abbr={team.short_name ?? ''} />}</div>
        </section>
      )}
    </>
  );
}

function DailySeason() {
  const { repo, slug, sport } = useSport();
  const [sp, setSp] = useSearchParams();
  const board = useAsync(`season:board:${repo.source.root}`, () => repo.board());
  const days = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const b of board.data?.items ?? []) { const k = new Date(b.start_time_utc).toLocaleDateString('en-CA'); m.set(k, [...(m.get(k) ?? []), b]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [board.data]);
  const today = new Date().toLocaleDateString('en-CA');
  const sel = sp.get('day') ?? days.find(([d]) => d >= today)?.[0] ?? days[days.length - 1]?.[0];
  const items = days.find(([d]) => d === sel)?.[1] ?? [];
  if (board.loading) return <Skeleton lines={8} tall />;
  return (
    <section className="bsec" aria-labelledby="days-h">
      <div className="bsec__h"><h2 className="bsec__t" id="days-h"><Icon name="clock" size={20} /> {sport.label} calendar</h2></div>
      {!days.length ? <div className="bempty"><h3>No games listed</h3><p>The publication’s board is empty right now.</p></div> : (
        <>
          <ol className="dstrip" aria-label="Days">
            {days.map(([d, gs]) => {
              const dt = new Date(`${d}T12:00:00`);
              return <li key={d}><button type="button" className={`dcell${d === sel ? ' is-on' : ''}${d === today ? ' is-now' : ''}`} aria-pressed={d === sel} onClick={() => setSp({ day: d }, { replace: true })}><span>{dt.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{dt.getDate()}</b><small>{gs.length}</small></button></li>;
            })}
          </ol>
          <ul className="wgames">
            {items.map((g) => {
              const away = g.participants.find((p) => p.participant_id === g.away_participant) ?? g.participants[1];
              const home = g.participants.find((p) => p.participant_id === g.home_participant) ?? g.participants[0];
              return (
                <li key={g.event_id}>
                  <Link to={routes.game(slug, g.event_id)} className="glass wgame">
                    <span className="wgame__when">{g.competition ?? sport.label} · {new Date(g.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="wgame__m"><b>{away?.short_name ?? away?.display_name}</b><i>{sport.code === 'SOCCER' || sport.code === 'TENNIS' ? 'v' : '@'}</i><b>{home?.short_name ?? home?.display_name}</b></span>
                    <span className="wgame__st">{/FINAL/i.test(g.status) ? 'Final' : g.status === 'SCHEDULED' ? 'Upcoming' : g.status.toLowerCase().replace(/_/g, ' ')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function SeasonView() {
  const { sport } = useSport();
  useVisit('Season', 'season', EXPLORE_STEP);
  return (
    <div className="page season">
      <header className="bhome__mast">
        <div><span className="eyebrow2">Explore · {sport.label}</span><h1 className="bhome__h">Season navigator</h1></div>
        <p className="bhome__sum">{sport.code === 'NFL' ? 'Every week on one grid: pick a week, pick a team' : 'Day by day, from the publication’s board'}</p>
      </header>
      {sport.code === 'NFL' ? <NflSeason /> : <DailySeason />}
    </div>
  );
}
