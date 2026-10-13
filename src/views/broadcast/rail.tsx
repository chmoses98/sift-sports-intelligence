// Home's today's-games rail: sport groups (richest research first, deep slates capped with a "more" tile), each game
// a broadcast card with records, ranks, the model's and market's read or the final against the closing spread, one
// contextual tag and the validated-market indicator (GameCard.tsx). Scroll buttons on wide screens.
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { navSport } from '../../data/nav';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { useInView } from '../../lib/useImage';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { CardBody, CardFoot, factsLabel, useCardFacts } from './GameCard';
import { phaseWord, type GameRow, type RailGroup } from './games';

const TEAM_COLOR_SPORTS = new Set(['NFL', 'CFB', 'NHL', 'NBA', 'MLB']);

/** One game in the rail. */
export function RailTile({ g }: { g: GameRow }) {
  const [ref, inView] = useInView<HTMLAnchorElement>('200px');
  const { facts } = useCardFacts(g, inView);
  const nav = navSport(g.slug);
  const homeCol = TEAM_COLOR_SPORTS.has(g.sport) ? teamColors(g.sport, g.home?.short_name)[0] : nav?.accent;
  const awayCol = TEAM_COLOR_SPORTS.has(g.sport) ? teamColors(g.sport, g.away?.short_name)[0] : nav?.accent;
  const comp = g.sport === 'SOCCER' || g.sport === 'TENNIS' ? (g.item.competition ?? nav?.label) : g.sport === 'NFL' ? [nav?.label, (g.item.competition ?? '').replace(/^\d{4}\s+(REG\s+|POST\s+)?week\s+/i, 'Week ')].filter(Boolean).join(' · ') : nav?.label;
  const live = g.phase === 'STARTED' && !g.stale;
  const fallback = g.candidates > 0 ? null : g.item.markets_available ? `${g.item.markets_available} markets` : 'Research';
  return (
    <Link ref={ref} to={routes.game(g.slug, g.item.event_id)} className={`rtile gc rtile--${g.phase.toLowerCase()}`} style={{ ['--ca' as string]: awayCol, ['--ch' as string]: homeCol }} aria-label={`${g.label}, ${nav?.label ?? g.sport}, ${phaseWord(g)}. ${factsLabel(facts)}`}>
      <span className="rtile__top">
        <span className="rtile__sport">{nav && <SportMark slug={g.slug} icon={nav.icon} size={13} />}<span>{comp}</span></span>
        <span className={`rtile__clock${live ? ' is-live' : ''}`}>{phaseWord(g)}</span>
      </span>
      <CardBody g={g} f={facts} />
      <CardFoot f={facts} fallback={fallback} />
    </Link>
  );
}

/** Today's games as one horizontal rail of sport groups, with scroll buttons on wide screens and a View all link. */
export function GameRail({ groups, viewAll, empty, day, dayWord = 'today' }: { groups: RailGroup[]; viewAll: string; empty?: ReactNode; day?: 'tomorrow' | 'week'; dayWord?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.8), behavior: 'smooth' });
  const total = groups.reduce((n, x) => n + x.total, 0);
  if (!total) return <>{empty ?? null}</>;
  return (
    <div className="rail rail--groups">
      <button type="button" className="rail__btn rail__btn--l" onClick={() => scroll(-1)} aria-label="Scroll games left"><Icon name="arrowLeft" size={18} /></button>
      <ul className="rail__list" ref={ref}>
        {groups.map((x) => {
          const nav = navSport(x.slug);
          return [
            <li key={`h:${x.slug}`} className="rail__grp">
              <Link to={routes.games({ sport: x.slug, day })} className="rail__grpa" aria-label={`${nav?.label ?? x.sport}: ${x.total} games ${dayWord}`}>
                {nav && <SportMark slug={x.slug} icon={nav.icon} size={20} />}<b>{nav?.label ?? x.sport}</b><small className="bnum">{x.total}</small>
              </Link>
            </li>,
            ...x.games.map((g) => <li key={`${g.slug}:${g.item.event_id}`}><RailTile g={g} /></li>),
            ...(x.total > x.games.length ? [
              <li key={`m:${x.slug}`} className="rail__end"><Link to={routes.games({ sport: x.slug, day })} className="rail__all rail__all--more"><Icon name="grid" size={18} /><span>{x.total - x.games.length} more {nav?.label ?? x.sport}</span></Link></li>,
            ] : []),
          ];
        })}
        <li className="rail__end"><Link to={viewAll} className="rail__all"><Icon name="grid" size={20} /><span>All games</span><b className="bnum">{total}</b></Link></li>
      </ul>
      <button type="button" className="rail__btn rail__btn--r" onClick={() => scroll(1)} aria-label="Scroll games right"><Icon name="arrowRight" size={18} /></button>
    </div>
  );
}
