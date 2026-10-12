// SEASON NAVIGATOR — the season on one screen instead of an endless week-by-week list.
// NFL: an 18-week grid (games published per week, finals, the selected team's opponent), the selected week's
// games as tiles, the selected team's results from its own profile, and its weekly opponent-unadjusted EPA per play
// from the nflverse history layer. Weeks the publication has not listed yet say so; nothing is filled in.
// Other sports: a date strip over the publication's board (their calendars are daily, not weekly).
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem, ExplorerIndexDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { FxCard } from '../../components/fx';
import { HubMast, hubPhoto } from '../../components/HubMast';
import { Icon } from '../../components/Icon';
import { Skeleton, TeamMark } from '../../components/ui';
import { completedGames, recordOf } from '../../lib/gamedata';
import { PHOTOS } from '../../lib/hero/registry';
import { teamColors } from '../../lib/teams';
import type { SportRepo } from '../../data/repo';
import { PMark } from '../broadcast/parts';
import { EXPLORE_PHOTO } from './photos';
import { routes } from '../../lib/routes';
import { useTeamHistory } from '../../history/load';
import type { TeamWeek } from '../../history/types';
import { useSport } from '../../state/sport';
import { EXPLORE_STEP, useVisit } from '../../state/trail';
import { eventPhase } from '../../opportunity/lifecycle';
import { atsOf, atsRecordsFrom, currentLeagueWeek, easternDate, findLeagueGame, isFinal, LEAGUE_SOURCE, leagueWeekCells, recordsFrom, useLeagueSchedule, type LeagueScheduleDoc, type TeamRecord } from '../../history/league';
import { LeagueWeekTile, weekSummary } from './SeasonWeek';
import '../../styles/lane-e-season.css';

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

/**
 * The NFL season as weeks, shared by the Season navigator and the Research Lab hub's timeline: the publication's event
 * index and board merged, week numbers anchored on the history layer where it has a game (exact), else on the first
 * published September-or-later game. Weeks with nothing published stay empty; nothing is filled in.
 */
export function useNflWeeks(repo: SportRepo | null, sportCode = 'NFL') {
  const root = repo?.source.root ?? null;
  const idx = useAsync(repo && root ? `season:idx:${root}` : null, () => repo!.index());
  const board = useAsync(repo && root ? `season:board:${root}` : null, () => repo!.board().catch(() => null));
  const hist = useTeamHistory(sportCode);
  const data = idx.data;
  const teams = useMemo(() => [...(data?.teams ?? [])].sort((a, b) => (a.short_name ?? '').localeCompare(b.short_name ?? '')), [data]);
  const byId = useMemo(() => new Map(teams.map((t) => [t.participant_id, t])), [teams]);
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
  const currentWeek = anchor != null ? Math.max(1, Math.min(18, weekOf(new Date().toISOString(), anchor))) : 1;
  const nameOf = useCallback((pid: string | null) => (pid ? byId.get(pid)?.short_name ?? '?' : '?'), [byId]);
  return { idx, board, hist, data, teams, byId, season, events, anchor, byWeek, currentWeek, nameOf };
}

const at = (home: boolean | null) => (home == null ? 'vs' : home ? 'vs' : '@');

/** Today's date in US Eastern time (the schedule's own calendar), YYYY-MM-DD. */
const todayEt = () => easternDate(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);

function NflSeason() {
  const { repo, slug, sport } = useSport();
  const [sp, setSp] = useSearchParams();
  const wk = useNflWeeks(repo, sport.code);
  const league = useLeagueSchedule('NFL');
  const L = league.data ?? null;
  const { data, teams, byWeek, nameOf, season, hist } = wk;
  const teamAbbr = sp.get('team') ?? teams[0]?.short_name ?? null;
  const team = teams.find((t) => t.short_name === teamAbbr) ?? null;
  const profile = useAsync(team ? `season:prof:${team.participant_id}` : null, () => repo.profile(team!.participant_id));
  const leagueWeek = useMemo(() => (L ? currentLeagueWeek(L.games, todayEt()) : null), [L]);
  const currentWeek = leagueWeek ?? wk.currentWeek;
  const week = Math.max(1, Math.min(18, Number(sp.get('week') ?? currentWeek) || currentWeek));
  const results = useMemo(() => new Map(completedGames(profile.data).map((g) => [g.eventId, g])), [profile.data]);
  const leagueRecords = useMemo(() => (L ? recordsFrom(L.games) : null), [L]);
  const atsRecords = useMemo(() => (L ? atsRecordsFrom(L.games) : null), [L]);
  const record = (teamAbbr && leagueRecords?.get(teamAbbr)?.text) || recordOf(profile.data)?.text || null;
  const atsRec = teamAbbr ? atsRecords?.get(teamAbbr) ?? null : null;
  const teamWeeks = (team?.short_name && hist.data?.teams[team.short_name]?.weeks) || [];
  const lcells = useMemo(() => (L && teamAbbr ? leagueWeekCells(L.games, teamAbbr) : null), [L, teamAbbr]);
  // The publication's game page for each schedule row (same teams, same date), so a tile opens its research.
  const evFor = useMemo(() => {
    const m = new Map<string, { id: string; start: string }>();
    if (!L) return m;
    for (const e of wk.events) {
      const lg = findLeagueGame(L.games, nameOf(e.away_participant), nameOf(e.home_participant), e.start_time_utc);
      if (lg) m.set(lg.id, { id: e.event_id, start: e.start_time_utc });
    }
    return m;
  }, [L, wk.events, nameOf]);
  const weekGames = useMemo(() => (L ? L.games.filter((g) => g.week === week && (g.type == null || g.type === 'REG')) : []), [L, week]);
  const summary = useMemo(() => weekSummary(weekGames), [weekGames]);
  const set = (k: string, v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  if (wk.idx.loading || league.loading) return <Skeleton lines={10} tall />;
  if (!data && !L) return <div className="bempty"><h3>The NFL season is not available</h3><p>Neither the publication’s list of games nor the league schedule could be read.</p></div>;
  const pubGames = byWeek.get(week) ?? [];
  const cells = WEEKS.map((w) => ({ w, gs: byWeek.get(w) ?? [], lc: lcells?.[w - 1] ?? null, cell: weekCell(byWeek.get(w) ?? [], team, nameOf, teamWeeks.find((x) => x.week === w)) }));
  const played = lcells ? lcells.filter((c) => c.kind === 'game' && isFinal(c.game)).length : cells.filter((c) => c.cell.kind === 'played' || (c.cell.kind === 'game' && results.has(c.cell.ev.event_id))).length;
  const teamOptions = teams.length ? teams.map((t) => ({ abbr: t.short_name ?? '', name: t.display_name })) : [...new Set((L?.games ?? []).flatMap((g) => [g.home, g.away]))].sort().map((a) => ({ abbr: a, name: a }));
  return (
    <>
      <section className="fx-card sn-team" aria-labelledby="sgrid-h" style={teamAbbr ? { ['--tc' as string]: teamColors('NFL', teamAbbr)[0] } : undefined}>
        <div className="sn-team__id">
          {teamAbbr && <TeamMark sport="NFL" abbr={teamAbbr} size="xl" />}
          <div className="sn-team__nm">
            <span className="fx-eyebrow">{L?.season ?? season} season · {sport.label}</span>
            <h2 className="sn-team__t" id="sgrid-h">{team?.display_name ?? teamAbbr ?? 'Pick a team'}</h2>
            <span className="sn-team__rec">
              {record ? <><b className="fx-num fx-num--md">{record}</b> record</> : 'No record published'}
              {atsRec && <> · <b className="fx-num fx-num--md">{atsRec.text}</b> against the spread</>}
              {' · '}{played} {played === 1 ? 'game' : 'games'} played
            </span>
          </div>
        </div>
        <div className="sn-team__ctl">
          <label className="hubm__select season__team"><span>Team</span>
            <select value={teamAbbr ?? ''} onChange={(e) => set('team', e.target.value || null)}>
              {teamOptions.map((t) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}
            </select>
          </label>
          {team && <Link to={routes.team(slug, team.participant_id)} className="btn btn--sm btn--glass">Team page <Icon name="arrowRight" size={14} /></Link>}
        </div>
      </section>
      <section className="fx-card sn-weeks" aria-labelledby="sweeks-h">
        <header className="fx-card__h"><h2 className="fx-card__t" id="sweeks-h"><Icon name="grid" size={17} /><span>Season timeline</span></h2><span className="muted small">Week {currentWeek} is the current week</span></header>
        <ol className="wgrid sn-grid" aria-label="Weeks">
          {cells.map(({ w, gs, lc, cell }) => {
            const finals = gs.filter((g) => /FINAL/i.test(g.status)).length;
            const current = w === currentWeek;
            if (lc) {
              const g = lc.kind === 'game' ? lc.game : null;
              const fin = g && isFinal(g);
              const won = fin ? (g!.home === teamAbbr ? g!.home_score! > g!.away_score! : g!.away_score! > g!.home_score!) : null;
              const tie = fin && g!.home_score === g!.away_score;
              const mine = fin ? (g!.home === teamAbbr ? `${g!.home_score}–${g!.away_score}` : `${g!.away_score}–${g!.home_score}`) : '';
              const ats = g ? atsOf(g) : null;
              const atsWord = ats && teamAbbr ? (ats.atsWinner == null ? (ats.cover === 'push' ? 'ATS push' : null) : ats.atsWinner === teamAbbr ? 'Covered' : 'Did not cover') : null;
              const label = lc.kind === 'game' ? `Week ${w}: ${teamAbbr} ${lc.home ? 'vs' : '@'} ${lc.opp}${fin ? `, ${tie ? 'tied' : won ? 'won' : 'lost'} ${mine}${atsWord ? `, ${atsWord.toLowerCase()} against the spread` : ''}` : ''}` : lc.kind === 'bye' ? `Week ${w}: ${teamAbbr} bye week` : `Week ${w}: not scheduled`;
              return (
                <li key={w}>
                  <button type="button" className={`wcell${w === week ? ' is-on' : ''}${current ? ' is-now' : ''}${lc.kind === 'game' ? '' : ' is-empty'}`} aria-pressed={w === week} onClick={() => set('week', String(w))} aria-label={label} data-cell={lc.kind === 'game' ? (fin ? 'final' : 'game') : lc.kind}>
                    <span className="wcell__w">W{w}</span>
                    {lc.kind === 'game' ? (
                      <span className="wcell__opp"><i className="wcell__at">{lc.home ? 'vs' : '@'}</i><TeamMark sport="NFL" abbr={lc.opp} size="sm" /><span className="wcell__ab">{lc.opp}</span></span>
                    ) : <span className="wcell__opp wcell__opp--none">{lc.kind === 'bye' ? 'Bye' : '—'}</span>}
                    {fin ? (
                      <span className="wcell__resline">
                        <span className={`wcell__res wcell__res--${tie ? 'T' : won ? 'W' : 'L'}`}>{tie ? 'T' : won ? 'W' : 'L'} {mine}</span>
                        {atsWord && <span className={`wcell__ats wcell__ats--${atsWord === 'Covered' ? 'w' : atsWord === 'Did not cover' ? 'l' : 'p'}`}>{atsWord === 'Covered' ? 'ATS ✓' : atsWord === 'Did not cover' ? 'ATS ✗' : 'Push'}</span>}
                      </span>
                    ) : lc.kind === 'game' ? <span className="wcell__st">{g?.date ? new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Upcoming'}</span>
                      : <span className="wcell__st">{lc.kind === 'bye' ? 'No game' : 'Not scheduled'}</span>}
                  </button>
                </li>
              );
            }
            const res = cell.kind === 'game' ? results.get(cell.ev.event_id) : undefined;
            const teamText =
              cell.kind === 'game' ? `; ${teamAbbr} ${at(cell.home)} ${cell.opp}` :
              cell.kind === 'played' ? `; ${teamAbbr} ${at(cell.home)} ${cell.opp}, completed (play-by-play record)` :
              cell.kind === 'conflict' ? `; ${teamAbbr}: identity conflict, ${cell.reason}` :
              cell.kind === 'unpublished' ? `; ${teamAbbr}'s game is not in the publication` : '';
            return (
              <li key={w}>
                <button type="button" className={`wcell${w === week ? ' is-on' : ''}${current ? ' is-now' : ''}${gs.length || cell.kind === 'played' ? '' : ' is-empty'}`} aria-pressed={w === week} onClick={() => set('week', String(w))} aria-label={`Week ${w}: ${gs.length ? `${gs.length} games published, ${finals} final` : 'not published yet'}${teamText}`} data-cell={cell.kind}>
                  <span className="wcell__w">W{w}</span>
                  {cell.kind === 'game' || cell.kind === 'played' ? (
                    <span className="wcell__opp"><i className="wcell__at">{at(cell.home)}</i><TeamMark sport="NFL" abbr={cell.opp} size="sm" /><span className="wcell__ab">{cell.opp}</span></span>
                  ) : cell.kind === 'conflict' ? (
                    <span className="wcell__opp wcell__opp--none">Conflict</span>
                  ) : cell.kind === 'unpublished' ? (
                    <span className="wcell__opp wcell__opp--none">Not published</span>
                  ) : (
                    <span className="wcell__opp wcell__opp--none">—</span>
                  )}
                  {res ? <span className={`wcell__res wcell__res--${res.outcome}`}>{res.outcome} {res.for}–{res.against}</span>
                    : cell.kind === 'game' ? <span className="wcell__st">{phaseText(cell.ev)}</span>
                    : cell.kind === 'played' ? <span className="wcell__st">Completed</span>
                    : cell.kind === 'unpublished' ? <span className="wcell__st">{gs.length} other games</span>
                    : cell.kind === 'conflict' ? <span className="wcell__st" title={cell.reason}>Check source</span>
                    : <span className="wcell__st">Not listed</span>}
                </button>
              </li>
            );
          })}
        </ol>
        {lcells ? (
          <p className="tm-note">Every week from the league schedule ({LEAGUE_SOURCE}). Results are final scores; “ATS” compares the final margin with the closing spread nflverse publishes, so it appears only once a game is final. A bye is shown only because the schedule lists every regular-season game.</p>
        ) : (
          <>
            <ul className="sn-key" aria-label="Legend">
              <li><i className="k k--game" /> Published game</li>
              <li><i className="k k--played" /> Completed (play-by-play record)</li>
              <li><i className="k k--unpub" /> Not published</li>
              <li><i className="k k--none" /> Not listed</li>
            </ul>
            <p className="tm-note">The league schedule could not be read, so weeks come from the publication’s own list of games. Sift never marks a bye without a complete schedule. Results are the selected team’s, from its own profile.</p>
          </>
        )}
      </section>
      <section className="fx-card sn-week" aria-labelledby="wk-h">
        <header className="fx-card__h">
          <h2 className="fx-card__t" id="wk-h"><Icon name="clock" size={17} /><span>Week {week} matchups</span></h2>
          <span className="sn-week__nav">
            <button type="button" className="btn btn--sm btn--glass" onClick={() => set('week', String(Math.max(1, week - 1)))} disabled={week <= 1} aria-label="Previous week"><Icon name="arrowLeft" size={14} /></button>
            <span className="muted small">{L ? `${weekGames.length} games` : `${pubGames.length} games published`}</span>
            <button type="button" className="btn btn--sm btn--glass" onClick={() => set('week', String(Math.min(18, week + 1)))} disabled={week >= 18} aria-label="Next week"><Icon name="arrowRight" size={14} /></button>
          </span>
        </header>
        {summary && (
          <p className="sn-week__sum">
            <b className="bnum">{summary.finals}</b> of {weekGames.length} final
            {summary.favGames > 0 && <> · favourites covered <b className="bnum">{summary.favCovered}</b> of {summary.favGames}</>}
            {summary.totals > 0 && <> · <b className="bnum">{summary.overs}</b> of {summary.totals} went over the closing total</>}
            <span className="muted"> · results, not a forecast</span>
          </p>
        )}
        {L ? (weekGames.length ? (
          <ul className="swk-grid">
            {weekGames.map((g) => {
              const ev = evFor.get(g.id) ?? null;
              return <LeagueWeekTile key={g.id} g={g} eventId={ev?.id ?? null} startIso={ev?.start ?? null} records={recordsFor(L, g.date)} slug={slug} team={teamAbbr} />;
            })}
          </ul>
        ) : <div className="bempty"><h3>Week {week} has no games</h3><p>The league schedule lists no regular-season games this week.</p></div>)
        : pubGames.length ? (
          <ul className="wgames sn-games">
            {pubGames.map((g) => {
              const a = nameOf(g.away_participant), h = nameOf(g.home_participant);
              const res = results.get(g.event_id);
              const teamHome = team && g.home_participant === team.participant_id;
              const score = res ? (teamHome ? `${a} ${res.against} – ${res.for} ${h}` : `${a} ${res.for} – ${res.against} ${h}`) : null;
              return (
                <li key={g.event_id}>
                  <Link to={routes.game(slug, g.event_id)} className={`wgame sn-game${team && g.participants.includes(team.participant_id) ? ' is-mine' : ''}`}>
                    <span className="wgame__when">{new Date(g.start_time_utc).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="wgame__m"><TeamMark sport="NFL" abbr={a} size="lg" /><b>{a}</b><i>@</i><b>{h}</b><TeamMark sport="NFL" abbr={h} size="lg" /></span>
                    <span className="wgame__st">{score ?? phaseText(g)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <div className="bempty"><h3>Week {week} is not listed yet</h3><p>The publication lists games as its schedule window reaches them.</p></div>}
        {L && <p className="tm-note">Records count published finals before each game. O and D are opponent-adjusted league ranks from each game’s published research (#1 best); the model is research-only and the market line is implied from contract midpoints, not an executable price. Scores and closing lines: {LEAGUE_SOURCE}.</p>}
      </section>
      {team && (
        <FxCard title={`${team.display_name} by week`} icon="chart" id="perf" action={{ to: routes.team(slug, team.participant_id), label: 'Team page' }}>
          {hist.loading ? <Skeleton lines={4} /> : <TrendChart weeks={teamWeeks} abbr={team.short_name ?? ''} />}
        </FxCard>
      )}
    </>
  );
}

const recCache = new WeakMap<object, Map<string, Map<string, TeamRecord>>>();
/** Records before a date, memoised per schedule document. */
function recordsFor(L: LeagueScheduleDoc, date: string | null): Map<string, TeamRecord> {
  let m = recCache.get(L);
  if (!m) recCache.set(L, (m = new Map()));
  const k = date ?? '';
  if (!m.has(k)) m.set(k, recordsFrom(L.games, date));
  return m.get(k)!;
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
    <section className="fx-card" aria-labelledby="days-h">
      <header className="fx-card__h"><h2 className="fx-card__t" id="days-h"><Icon name="clock" size={17} /><span>{sport.label} calendar</span></h2></header>
      {!days.length ? <div className="bempty"><h3>No games listed</h3><p>The publication’s board is empty right now.</p></div> : (
        <>
          <ol className="dstrip" aria-label="Days">
            {days.map(([d, gs]) => {
              const dt = new Date(`${d}T12:00:00`);
              return <li key={d}><button type="button" className={`dcell${d === sel ? ' is-on' : ''}${d === today ? ' is-now' : ''}`} aria-pressed={d === sel} onClick={() => setSp({ day: d }, { replace: true })}><span>{dt.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{dt.getDate()}</b><small>{gs.length}</small></button></li>;
            })}
          </ol>
          <ul className="wgames sn-games">
            {items.map((g) => {
              const away = g.participants.find((p) => p.participant_id === g.away_participant) ?? g.participants[1];
              const home = g.participants.find((p) => p.participant_id === g.home_participant) ?? g.participants[0];
              return (
                <li key={g.event_id}>
                  <Link to={routes.game(slug, g.event_id)} className="wgame sn-game">
                    <span className="wgame__when">{g.competition ?? sport.label} · {new Date(g.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="wgame__m"><PMark sport={sport.code} p={away} size="md" /><b>{away?.short_name ?? away?.display_name}</b><i>{sport.code === 'SOCCER' || sport.code === 'TENNIS' ? 'v' : '@'}</i><b>{home?.short_name ?? home?.display_name}</b><PMark sport={sport.code} p={home} size="md" /></span>
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

/** The team's own home stadium photograph when the registry has one, else the Research Lab's NFL photograph. */
function seasonPhoto(code: string, abbr: string | null) {
  const own = PHOTOS.find((p) => p.sport === code && p.team === abbr && !p.to);
  return own ? hubPhoto(own.id) : hubPhoto(EXPLORE_PHOTO[code.toLowerCase()] ?? null);
}

export function SeasonView() {
  const { sport } = useSport();
  const [sp] = useSearchParams();
  useVisit('Season', 'season', EXPLORE_STEP);
  return (
    <div className="page season">
      <HubMast title="Season navigator" eyebrow={`Research Lab · ${sport.label}`} sub={sport.code === 'NFL' ? 'Every week’s matchups, scores and results against the spread' : 'Day by day, from the publication’s board'} photo={seasonPhoto(sport.code, sport.code === 'NFL' ? sp.get('team') : null)} />
      <div className="sn-stack">{sport.code === 'NFL' ? <NflSeason /> : <DailySeason />}</div>
    </div>
  );
}
