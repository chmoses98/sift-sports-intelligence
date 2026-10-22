// The compact scoreboard shared by the featured card and the game header: crest and name each side, the published final
// score when there is one, otherwise the start time or the lifecycle word. The publication carries no live score, so an
// in-play game says "Score unavailable" rather than showing zeroes, unless a score feed has a verified read for the game.
import { Link } from '../routing';
import { Crest } from './base';
import { clock, isLiveGame } from './model';
import { teamName } from '../components/sift2/GameList';
import type { GameRow } from '../views/broadcast/games';
import type { FeaturedScores } from '../views/broadcast/lifecycle';
import type { ScoreRead } from '../live/scores/store';
import { chipLine, periodClock, shownState } from './scoreState';

export function Scoreboard({ g, away, home, awayRec, homeRec, final, hosted, to, label, read }: {
  g: GameRow; away: string; home: string; awayRec?: string | null; homeRec?: string | null; final: FeaturedScores | null; hosted: boolean; to?: string; label?: string; read?: ScoreRead | null;
}) {
  const shown = shownState(read);
  const feed = shown === 'live' || shown === 'over' ? read ?? null : null;
  const fs = feed?.game?.score ?? null;
  const live = shown ? shown === 'live' : isLiveGame(g);
  const pre = shown ? shown === 'upcoming' : g.phase === 'PREGAME' || g.phase === 'NO_START';
  const status = g.phase === 'POSTPONED' ? 'Postponed' : g.phase === 'CANCELLED' ? 'Cancelled' : g.phase === 'SUSPENDED' ? 'Suspended' : g.phase === 'STARTED' ? 'Awaiting result' : 'Final';
  const shownFinal: FeaturedScores | null = feed && shown === 'over' && fs ? { away: fs.away, home: fs.home, winner: fs.home > fs.away ? 'home' : fs.away > fs.home ? 'away' : null } : feed ? null : final;
  const liveScore = feed && shown === 'live' && fs ? fs : null;
  const left = liveScore?.away ?? shownFinal?.away;
  const right = liveScore?.home ?? shownFinal?.home;
  const body = (
    <>
      <span className="v4-sb__team"><Crest sport={g.sport} p={g.away} size="lg" /><span className="v4-sb__name">{away}</span>{awayRec && <span className="v4-sb__rec">{awayRec}</span>}</span>
      {left != null && <span className={`v4-sb__score num${shownFinal?.winner === 'home' ? ' v4-sb__score--lose' : ''}${feed && (feed.view.mode === 'LAST_KNOWN' || feed.view.mode === 'DELAYED') ? ' v4-sb__score--aged' : ''}`}>{left}</span>}
      <span className="v4-sb__mid">
        {feed && shown === 'live' ? <><b>{periodClock(feed) || 'Live'}</b><small>{fs ? chipLine(feed) : 'No score reported'}</small></>
          : feed && shown === 'over' ? <><b>{fs ? 'F' : 'Final'}</b><small>{fs ? 'Final' : 'No score reported'}</small></>
          : live ? <><b>Live</b><small>Score unavailable</small></>
          : shownFinal ? <><b>F</b><small>Final</small></>
          : g.phase === 'FINAL' && !shown ? <><b>Final</b><small>Score unavailable</small></>
          : pre ? <><b>{clock(g.startMs)}</b><small>{hosted ? 'at' : 'vs'}</small></>
          : <><b>{status}</b></>}
      </span>
      {right != null && <span className={`v4-sb__score num${shownFinal?.winner === 'away' ? ' v4-sb__score--lose' : ''}${feed && (feed.view.mode === 'LAST_KNOWN' || feed.view.mode === 'DELAYED') ? ' v4-sb__score--aged' : ''}`}>{right}</span>}
      <span className="v4-sb__team"><Crest sport={g.sport} p={g.home} size="lg" /><span className="v4-sb__name">{home}</span>{homeRec && <span className="v4-sb__rec">{homeRec}</span>}</span>
    </>
  );
  // Three-digit scores (basketball) tighten the numerals so team names keep their room.
  const wide = (left ?? 0) > 99 || (right ?? 0) > 99;
  const cls = `v4-sb${left != null ? ' v4-sb--score' : ''}${wide ? ' v4-sb--wide' : ''}`;
  const aria = label ?? `${teamName(g.away)} ${hosted ? 'at' : 'versus'} ${teamName(g.home)}`;
  return to
    ? <Link to={to} aria-label={aria} className={cls} style={{ color: 'inherit' }}>{body}</Link>
    : <div className={cls} role="group" aria-label={aria}>{body}</div>;
}
