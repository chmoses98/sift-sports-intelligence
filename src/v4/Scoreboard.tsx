// The compact scoreboard shared by the featured card and the game header: crest and name each side, the published final
// score when there is one, otherwise the start time or the lifecycle word. No live score exists in the contract, so an
// in-play game says "Score unavailable" rather than showing zeroes.
import { Link } from '../routing';
import { Crest } from './base';
import { clock, isLiveGame } from './model';
import { teamName } from '../components/sift2/GameList';
import type { GameRow } from '../views/broadcast/games';
import type { FeaturedScores } from '../views/broadcast/lifecycle';

export function Scoreboard({ g, away, home, awayRec, homeRec, final, hosted, to, label }: {
  g: GameRow; away: string; home: string; awayRec?: string | null; homeRec?: string | null; final: FeaturedScores | null; hosted: boolean; to?: string; label?: string;
}) {
  const live = isLiveGame(g);
  const pre = g.phase === 'PREGAME' || g.phase === 'NO_START';
  const status = g.phase === 'POSTPONED' ? 'Postponed' : g.phase === 'CANCELLED' ? 'Cancelled' : g.phase === 'SUSPENDED' ? 'Suspended' : g.phase === 'STARTED' ? 'Awaiting result' : 'Final';
  const body = (
    <>
      <span className="v4-sb__team"><Crest sport={g.sport} p={g.away} size="lg" /><span className="v4-sb__name">{away}</span>{awayRec && <span className="v4-sb__rec">{awayRec}</span>}</span>
      {final && <span className={`v4-sb__score num${final.winner === 'home' ? ' v4-sb__score--lose' : ''}`}>{final.away}</span>}
      <span className="v4-sb__mid">
        {live ? <><b>Live</b><small>Score unavailable</small></>
          : final ? <><b>F</b><small>Final</small></>
          : g.phase === 'FINAL' ? <><b>Final</b><small>Score unavailable</small></>
          : pre ? <><b>{clock(g.startMs)}</b><small>{hosted ? 'at' : 'vs'}</small></>
          : <><b>{status}</b></>}
      </span>
      {final && <span className={`v4-sb__score num${final.winner === 'away' ? ' v4-sb__score--lose' : ''}`}>{final.home}</span>}
      <span className="v4-sb__team"><Crest sport={g.sport} p={g.home} size="lg" /><span className="v4-sb__name">{home}</span>{homeRec && <span className="v4-sb__rec">{homeRec}</span>}</span>
    </>
  );
  const cls = `v4-sb${final ? ' v4-sb--score' : ''}`;
  const aria = label ?? `${teamName(g.away)} ${hosted ? 'at' : 'versus'} ${teamName(g.home)}`;
  return to
    ? <Link to={to} aria-label={aria} className={cls} style={{ color: 'inherit' }}>{body}</Link>
    : <div className={cls} role="group" aria-label={aria}>{body}</div>;
}
