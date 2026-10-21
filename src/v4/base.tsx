import { PMark } from '../views/broadcast/parts';
import type { GameRow } from '../views/broadcast/games';

export const gameHref = (g: Pick<GameRow, 'slug' | 'item'>, tab?: string) => `/v4/game/${g.slug}/${encodeURIComponent(g.item.event_id)}${tab ? `?tab=${tab}` : ''}`;

export function Crest({ sport, p, size = 'md' }: { sport: string; p: GameRow['home']; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`v4-crest${size === 'md' ? '' : ` v4-crest--${size}`}`}><PMark sport={sport} p={p} size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} /></span>;
}
