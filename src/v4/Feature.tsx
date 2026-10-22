// The featured game: the venue's verified photograph (or the team-branded graphic) behind a compact scoreboard.
// Only published facts appear: a start time, the lifecycle word, a final score the publication reports, records where
// a verified source has them. In play there is no score in the contract, and the card says so.
import { useMemo, type CSSProperties } from 'react';
import { Link } from '../routing';
import { Icon } from './Icon';
import { gameHref } from './base';
import { propsExplorerHref } from './propsModel';
import { SignalChip, useFinal } from './parts';
import { Scoreboard } from './Scoreboard';
import { isLiveGame } from './model';
import { heroInputFor } from '../lib/hero/input';
import { resolveHero } from '../lib/hero/resolve';
import { broadcastHeroSpec } from '../components/sift2/heroArt';
import { VenueArt } from '../components/sift2/VenueArt';
import { teamName } from '../components/sift2/GameList';
import { useGameResearch } from '../views/broadcast/parts';
import { useCardFacts } from '../views/broadcast/GameCard';
import { competitionWord, type GameRow } from '../views/broadcast/games';
import { NAV_SPORTS } from '../data/nav';
import type { ScoreRead } from '../live/scores/store';
import { liveWord, periodClock, shownState } from './scoreState';

/** The two team colours the stage and card are lit with: the hero's own, else graphite. */
export function useStageColours(g: GameRow | null, research: unknown) {
  return useMemo(() => {
    if (!g) return {} as CSSProperties;
    try {
      const spec = resolveHero(heroInputFor(g.item, research as never, g.sport));
      const [a] = spec.away?.colors ?? [];
      const [h] = spec.home?.colors ?? [];
      return { ['--c1' as string]: a ?? '#3A4252', ['--c2' as string]: h ?? '#232A36' } as CSSProperties;
    } catch {
      return {} as CSSProperties;
    }
  }, [g, research]);
}

export function Feature({ g, read }: { g: GameRow; read?: ScoreRead | null }) {
  const research = useGameResearch(g.slug, g.item.event_id);
  const { facts } = useCardFacts(g, true);
  const shown = shownState(read);
  const feed = shown === 'live' || shown === 'over' ? read ?? null : null;
  const final = useFinal(g, !feed);
  const spec = useMemo(() => {
    try { return resolveHero(heroInputFor(g.item, research.data ?? null, g.sport)); } catch { return null; }
  }, [g, research.data]);
  const art = useMemo(() => (spec ? broadcastHeroSpec(spec, 'card') : null), [spec]);
  const live = shown ? shown === 'live' : isLiveGame(g);
  const word = feed ? liveWord(feed) : 'LIVE';
  const sport = NAV_SPORTS.find((s) => s.slug === g.slug)?.label ?? g.sport;
  const hosted = spec?.context === 'home' || spec?.context === 'home-elsewhere';
  const away = spec?.away?.short ?? teamName(g.away);
  const home = spec?.home?.short ?? teamName(g.home);
  const colours = useStageColours(g, research.data);
  const status = live ? 'In play' : shown === 'over' ? 'Final' : shown === 'upcoming' ? 'Upcoming' : g.phase === 'FINAL' ? 'Final' : g.phase === 'STARTED' ? 'Awaiting result' : g.phase === 'PREGAME' || g.phase === 'NO_START' ? 'Upcoming' : g.phase === 'POSTPONED' ? 'Postponed' : g.phase === 'CANCELLED' ? 'Cancelled' : 'Suspended';
  const fsc = feed?.game?.score ?? null;
  const aria = `${teamName(g.away)} ${hosted ? 'at' : 'versus'} ${teamName(g.home)}. ${status}${feed ? ' (demo)' : ''}${fsc ? `, ${shown === 'over' ? 'final' : periodClock(feed) || 'score'} ${fsc.away} to ${fsc.home}` : final ? `, final ${final.away} to ${final.home}` : ''}. Open game`;
  return (
    <div className="v4-feature" style={colours} data-featured={g.item.event_id} data-art={art?.kind ?? 'none'}>
      {art && <div className="v4-feature__art" aria-hidden="true"><VenueArt key={art.photo?.id ?? art.reason} spec={art} surface="card" /></div>}
      <div className="v4-feature__shade" aria-hidden="true" />
      <div className="v4-feature__in">
        <div className="v4-feature__top">
          <span className="meta">{competitionWord(g.item.competition, sport)}</span>
          <span className={`v4-badge${live && word === 'LIVE' ? ' v4-badge--live' : ''}`}>{live ? word : status.toUpperCase()}{feed?.demo ? ' · DEMO' : ''}</span>
        </div>
        <Scoreboard g={g} away={away} home={home} awayRec={facts.away.record} homeRec={facts.home.record} final={final} hosted={hosted} to={gameHref(g)} label={aria} read={read} />
        <div className="v4-feature__bot">
          <p>
            {g.candidates > 0
              ? <><b>{g.candidates}</b> published research signal{g.candidates === 1 ? '' : 's'}{g.phase !== 'PREGAME' && g.phase !== 'NO_START' ? ' · frozen at kickoff' : ''}</>
              : <>{spec?.venue?.name ?? 'Game research'}</>}
          </p>
          {g.candidates > 0 ? <SignalChip g={g} /> : <Link to={gameHref(g)} className="v4-sig" aria-label={`Open ${teamName(g.away)} ${hosted ? 'at' : 'versus'} ${teamName(g.home)}`}><Icon name="caret-right" size="s" /></Link>}
        </div>
        {['nfl', 'mlb', 'nhl'].includes(g.slug) && (
          <Link to={propsExplorerHref({ sport: g.slug, game: g.slug === 'nfl' && (g.phase === 'PREGAME' || g.phase === 'NO_START') ? g.item.event_id : null })} className="v4-textlink v4-feature__props">
            <Icon name="target" size="s" />Player props{g.slug === 'nfl' && (g.phase === 'PREGAME' || g.phase === 'NO_START') ? ' for this game' : ''}<Icon name="caret-right" size="xs" />
          </Link>
        )}
      </div>
    </div>
  );
}
