import { useMemo } from 'react';
import { Link } from '../../routing';
import { injuryNews } from '../../insights/news';
import { useGameResearch } from '../../views/broadcast/parts';
import { ago } from '../model/format';
import type { V3Game } from '../model/types';
import { Icon } from './Icon';
import { TeamLogo } from './TeamLogo';
import { gameHref, leagueLabel } from './gamebits';

/** The publication's own most important injury items for one game (real research only; sports without a research document render nothing). */
export function GameStories({ g, max = 1 }: { g: V3Game; max?: number }) {
  const r = useGameResearch(g.slug, g.eventId);
  const items = useMemo(() => {
    if (!r.data) return [];
    try { return injuryNews(r.data).filter((n) => n.level === 'critical' || n.level === 'high').sort((a, b) => b.score - a.score).slice(0, max); } catch { return []; }
  }, [r.data, max]);
  return (
    <>
      {items.map((n) => {
        const team = n.team === g.away.abbr ? g.away : n.team === g.home.abbr ? g.home : g.home;
        return (
          <li key={n.id}>
            <Link to={`${gameHref(g)}?tab=matchup`} className="v3-story" aria-label={`${n.headline}. Open ${g.away.nick} at ${g.home.nick}`}>
              <TeamLogo team={team} size={44} />
              <span className="v3-story__t"><b>{n.headline}</b><small>{n.asOf ? ago(n.asOf) : 'Publication'} · {leagueLabel(g)}</small></span>
              <Icon name="chevR" size={20} />
            </Link>
          </li>
        );
      })}
    </>
  );
}
