// The Season navigator's week view (issues 46, 50): every game of the week as a matchup tile from the league schedule,
// with logos, records before the game, opponent-adjusted ranks and the model / market read where the game's research
// is published, or the final score with the result against the closing spread and total. A week summary counts how
// favourites and totals have gone — published finals against published closing lines: history, not a forecast.
import { useMemo } from 'react';
import { Link } from '../../routing';
import { TeamMark } from '../../components/ui';
import { useInView } from '../../lib/useImage';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { atsOf, isFinal, LEAGUE_SOURCE, totalResultOf, type LeagueGame, type TeamRecord } from '../../history/league';
import { cardFacts, type SideFacts } from '../broadcast/cardFacts';
import { Rank } from '../broadcast/GameCard';
import { useGameResearch } from '../broadcast/parts';

function kickoffText(g: LeagueGame, startIso: string | null): string {
  if (startIso) return new Date(startIso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!g.date) return 'Date to be set';
  const d = new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return g.time_et ? `${d} · ${g.time_et} ET` : d;
}

function Side({ s, mine }: { s: SideFacts; mine: boolean }) {
  return (
    <span className={`gc-team${s.won === true ? ' is-win' : s.won === false ? ' is-loss' : ''}${mine ? ' is-mine' : ''}`}>
      <TeamMark sport="NFL" abbr={s.abbr} size="md" />
      <span className="gc-team__n">{s.abbr}</span>
      {s.record && <span className="gc-team__rec" title={`${s.abbr} record before this game (${LEAGUE_SOURCE})`}>{s.record}</span>}
      <span className="gc-team__rks"><Rank k="O" r={s.off} unit="offense" /><Rank k="D" r={s.def} unit="defense" /></span>
      {s.score != null && <b className="gc-team__sc bnum">{s.score}</b>}
    </span>
  );
}

/** One game of the week. `eventId` links the tile to the publication's game page when it lists the game. */
export function LeagueWeekTile({ g, eventId, startIso, records, slug, team }: { g: LeagueGame; eventId: string | null; startIso: string | null; records: Map<string, TeamRecord> | null; slug: string; team: string | null }) {
  const [ref, inView] = useInView<HTMLLIElement>('200px');
  const final = isFinal(g);
  const research = useGameResearch(inView && eventId && !final ? slug : null, inView && eventId && !final ? eventId : null);
  const f = useMemo(() => cardFacts({ sport: 'NFL', away: g.away, home: g.home, research: research.data ?? null, league: g, records }), [g, research.data, records]);
  const tot = totalResultOf(g);
  const mine = !!team && (g.home === team || g.away === team);
  const body = (
    <>
      <span className="swk__top">
        <span className="swk__when">{kickoffText(g, startIso)}</span>
        {f.tag ? <span className={`gc-tag gc-tag--${f.tag.kind}`} title={f.tag.title}>{f.tag.text}</span> : g.neutral ? <span className="gc-tag">Neutral site</span> : null}
      </span>
      <span className="gc-teams">
        <Side s={f.away} mine={g.away === team} />
        <Side s={f.home} mine={g.home === team} />
      </span>
      {f.final ? (
        <span className="gc-read gc-read--final">
          <span className="gc-read__res">{f.final.line}</span>
          {f.final.ats ? <span className={`gc-ats gc-ats--${f.final.ats.cover ?? 'pk'}`} title={`Against the closing spread (${LEAGUE_SOURCE})`}>{f.final.ats.text}</span> : <span className="gc-read__none">No closing spread published</span>}
          {tot && <span className={`gc-ats gc-ats--tot-${tot.result}`} title={`${tot.points} points against the closing total of ${tot.line} (${LEAGUE_SOURCE})`}>{tot.result === 'push' ? 'Total push' : `${tot.result === 'over' ? 'Over' : 'Under'} ${tot.line}`}</span>}
        </span>
      ) : f.model || f.market ? (
        <span className="gc-read">
          {f.model && <span className="gc-read__i" title={f.model.title}><i>Model</i>{f.model.text}</span>}
          {f.market && <span className="gc-read__i gc-read__i--mkt" title={f.market.title}><i>Market</i>{f.market.text}</span>}
        </span>
      ) : <span className="gc-read"><span className="gc-read__none">{!eventId ? 'Not on the publication’s board yet' : !inView || research.loading ? '\u00a0' : research.data ? 'No model or market read in this game’s research' : 'This game’s research could not be read'}</span></span>}
    </>
  );
  const style = { ['--ca' as string]: teamColors('NFL', g.away)[0], ['--ch' as string]: teamColors('NFL', g.home)[0] };
  return (
    <li ref={ref} className={`swk${mine ? ' is-mine' : ''}${final ? ' is-final' : ''}`} style={style}>
      {eventId ? <Link to={routes.game(slug, eventId)} className="swk__a">{body}</Link> : <div className="swk__a swk__a--static">{body}</div>}
    </li>
  );
}

/** Published finals against published closing lines this week, as counts. Null before any game is final. */
export function weekSummary(games: LeagueGame[]): { finals: number; favCovered: number; favGames: number; overs: number; totals: number } | null {
  const finals = games.filter(isFinal);
  if (!finals.length) return null;
  const ats = finals.map(atsOf).filter((a) => a && a.favourite && a.cover !== 'push');
  const tots = finals.map(totalResultOf).filter((t) => t && t.result !== 'push');
  return { finals: finals.length, favCovered: ats.filter((a) => a!.cover === 'covered').length, favGames: ats.length, overs: tots.filter((t) => t!.result === 'over').length, totals: tots.length };
}
