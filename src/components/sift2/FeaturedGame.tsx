import type { GameRow } from '../../views/broadcast/games';
import { FeaturedMatchup } from '../../views/Sift2Games';

/** Home and Games share the same evidence-backed broadcast matchup. */
export function Sift2FeaturedGame({ game }: { game: GameRow }) {
  return <FeaturedMatchup game={game} />;
}
