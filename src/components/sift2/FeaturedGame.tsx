import { useMemo } from 'react';
import { Link } from 'react-router';
import { CinematicHero } from './CinematicHero';
import { PMark, useGameResearch } from '../../views/broadcast/parts';
import type { GameRow } from '../../views/broadcast/games';
import { phaseWord } from '../../views/broadcast/games';
import { heroInputFor } from '../../lib/hero/input';
import { resolveHero } from '../../lib/hero/resolve';
import { routes } from '../../lib/routes';

/** Reuse the production identity/venue resolver; no stand-in photo or assumed home team. */
export function Sift2FeaturedGame({ game }: { game: GameRow }) {
  const research = useGameResearch(game.slug, game.item.event_id);
  const spec = useMemo(() => resolveHero(heroInputFor(game.item, research.data, game.sport)), [game, research.data]);
  const title = spec.home && spec.away
    ? `${spec.away.name} ${spec.context === 'home' || spec.context === 'home-elsewhere' ? 'at' : 'vs'} ${spec.home.name}`
    : game.label;
  return <CinematicHero headingLevel={2} eyebrow={`${game.sport} / ${phaseWord(game)} · PUBLISHED MATCHUP`} title={title}
    homeColor={spec.home?.colors[0]} awayColor={spec.away?.colors[0]}
    imageUrl={spec.photo?.srcset[0]?.src} desktopFocus={spec.photo?.focus.desktop} mobileFocus={spec.photo?.focus.mobile}
    subtitle={spec.venue?.name ?? 'Explore the matchup, players and markets.'}>
    <div className="sift2-home__hero-card sift2-surface">
      <div className="sift2-home__marks" role="group" aria-label="Published participants"><PMark sport={game.sport} p={game.away} size="md" /><span aria-hidden="true">/</span><PMark sport={game.sport} p={game.home} size="md" /></div>
      <span className="sift2-home__eyebrow">GAME INTELLIGENCE</span>
      <strong>{game.candidates > 0 ? `${game.candidates} research candidate${game.candidates === 1 ? '' : 's'}` : 'Explore game research'}</strong>
      <p>Review the evidence, market freshness and research restrictions.</p>
      <Link to={routes.game(game.slug, game.item.event_id)}>Open game research →</Link>
      {spec.photo && <small className="sift2-home__credit">Photo: {spec.photo.credit.artist} · <a href={spec.photo.credit.licenseUrl ?? spec.photo.credit.source}>{spec.photo.credit.license}</a></small>}
    </div>
  </CinematicHero>;
}
