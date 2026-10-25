import { tierOf, tierWord } from '../../lib/rank';
import { ordinal } from '../data/lens';

/** A league rank as text a reader can interpret without colour: "22nd", with the tier word available to assistive tech and on request. */
export function Rank({ rank, n, word = false }: { rank: number | null; n: number | null; word?: boolean }) {
  if (rank == null || !n) return <span className="v3-rk v3-rk--none">—</span>;
  const t = tierOf(rank, n);
  return (
    <span className={`v3-rk v3-rk--${t}`} aria-label={`${ordinal(rank)} of ${n}, ${tierWord(rank, n)}`}>
      {ordinal(rank)}{word && <small>of {n}</small>}
    </span>
  );
}
