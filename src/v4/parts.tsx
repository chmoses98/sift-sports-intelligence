// Shared v4 building blocks: crests, the signal chip, the compact game row, and the lazy "is this on screen" hook.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../routing';
import { Icon } from './Icon';
import { Crest, gameHref } from './base';
import { useGameResearch } from '../views/broadcast/parts';
import { phaseWord, type GameRow } from '../views/broadcast/games';
import { finalScores } from '../views/broadcast/lifecycle';
import { teamName } from '../components/sift2/GameList';
import { clock, isLiveGame } from './model';
import { useResearch } from './ResearchSheet';
import { ageChip, liveWord, periodClock, shownState, wideScore } from './scoreState';
import type { ScoreRead } from '../live/scores/store';

/** True once the element has been on screen (stays true): rows only fetch their extras when they are actually seen. */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** The published final score for a finished game, or null (no score is ever estimated; in-play games have none in the contract). */
export function useFinal(g: GameRow, load: boolean) {
  const r = useGameResearch(load && g.phase === 'FINAL' ? g.slug : null, load && g.phase === 'FINAL' ? g.item.event_id : null);
  if (g.phase !== 'FINAL') return null;
  // The published final: the research document's `extensions.result`, or the event's own published `home_score` / `away_score`
  // (the NHL publication states it there). Both numbers or nothing.
  return finalScores(r.data?.extensions?.result) ?? finalScores(r.data?.event?.extensions);
}

/** The research entry: how many published signals this game carries, one tap from the best one. A frozen chip is pregame research. */
export function SignalChip({ g }: { g: GameRow }) {
  const open = useResearch();
  if (!g.best || g.candidates === 0) return null;
  const frozen = g.phase !== 'PREGAME' && g.phase !== 'NO_START';
  const label = `${g.candidates} published research signal${g.candidates === 1 ? '' : 's'} on ${teamName(g.away)} ${frozen ? 'versus' : 'at'} ${teamName(g.home)}${frozen ? ', frozen at kickoff' : ''}. Open`;
  return (
    <button type="button" className={`v4-sig${frozen ? ' v4-sig--frozen' : ''}`} aria-label={label} onClick={() => open(g.best!, g)}>
      <span className="v4-sig__p"><Icon name="pulse" />{g.candidates}</span>
    </button>
  );
}

/** One game as a compact row: away, middle (time, live word or final score), home, then the signal chip or a chevron. */
export function GameRowV4({ g, read }: { g: GameRow; read?: ScoreRead | null }) {
  const [ref, seen] = useSeen<HTMLLIElement>();
  // A score feed's read changes what is SHOWN; the publication's status is untouched.
  const shown = shownState(read);
  const feed = shown === 'live' || shown === 'over' ? read : null;
  const final = useFinal(g, seen && !feed);
  const live = shown ? shown === 'live' : isLiveGame(g);
  const a = g.away?.short_name ?? teamName(g.away);
  const h = g.home?.short_name ?? teamName(g.home);
  const when = phaseWord(g);
  const sc = feed?.game?.score ?? null;
  let mid: ReactNode;
  if (feed && sc) {
    const over = shown === 'over';
    const line = [over ? 'Final' : periodClock(feed) || 'Live', ageChip(feed)].filter(Boolean).join(' · ');
    mid = (
      <>
        <span className={`v4-row__sc${wideScore(feed) ? ' v4-row__sc--tight' : ''}${feed.view.mode === 'LAST_KNOWN' || feed.view.mode === 'DELAYED' ? ' v4-row__sc--aged' : ''}`}>
          <span className={over && sc.home > sc.away ? 'lose' : ''}>{sc.away}</span><small className="over" style={{ font: '600 12px/16px var(--f-ui)' }}>{over ? 'F' : '–'}</small><span className={over && sc.away > sc.home ? 'lose' : ''}>{sc.home}</span>
        </span>
        <small>{line}</small>
      </>
    );
  } else if (feed) {
    mid = <>{shown === 'over' ? 'Final' : 'Live'}<small>No score reported</small></>;
  } else if (final) {
    mid = <span className="v4-row__sc"><span className={final.winner === 'home' ? 'lose' : ''}>{final.away}</span><small className="over" style={{ font: '600 12px/16px var(--f-ui)' }}>F</small><span className={final.winner === 'away' ? 'lose' : ''}>{final.home}</span></span>;
  } else if (live) {
    mid = <>In play<small>Score n/a</small></>;
  } else if (shown === 'upcoming' || (!shown && (g.phase === 'PREGAME' || g.phase === 'NO_START'))) {
    mid = <>{clock(g.startMs)}</>;
  } else if (!shown && g.phase === 'FINAL') {
    mid = <>Final<small>Score n/a</small></>;
  } else {
    mid = <>{when}</>;
  }
  const spoken = feed && sc
    ? `${shown === 'over' ? 'final' : `${periodClock(feed) || 'in play'}`}, score ${sc.away} to ${sc.home}${ageChip(feed) ? `, ${ageChip(feed)}` : ''}`
    : final ? `final ${final.away} to ${final.home}` : when;
  const label = `${teamName(g.away)} at ${teamName(g.home)}, ${spoken}. Open game`;
  return (
    <li ref={ref} className={`v4-row${live && liveWord(feed) === 'LIVE' ? ' v4-row--live' : ''}`}>
      <Link to={gameHref(g)} className="v4-row__link" aria-label={label}>
        <span className="v4-row__team"><Crest sport={g.sport} p={g.away} size="sm" /><span className="nm">{a}</span></span>
        <span className={`v4-row__mid${live && liveWord(feed) === 'LIVE' ? ' v4-row__mid--live' : ''}`}>{mid}</span>
        <span className="v4-row__team v4-row__team--home"><span className="nm">{h}</span><Crest sport={g.sport} p={g.home} size="sm" /></span>
      </Link>
      <span className="v4-row__end">{g.candidates > 0 ? <SignalChip g={g} /> : <Icon name="caret-right" size="s" />}</span>
    </li>
  );
}
