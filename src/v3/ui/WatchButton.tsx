// Watch / Unwatch one Kalshi contract. A watched contract is listed in My SIFT with its current price (read through the quote gate there).
// Watching sends nothing: SIFT has no alert delivery.
import { contractRoute, isTicker, isWatched } from '../model/workspace';
import { unwatchContract, useWatchlist, watchContract } from '../state/prefs';
import { Icon } from './Icon';
import './WatchButton.css';

export function WatchButton({ ticker, title, subtitle, startMs, pathname, search, className }: {
  ticker: string; title: string; subtitle: string; startMs: number | null; pathname: string; search: string; className?: string;
}) {
  const list = useWatchlist();
  if (!isTicker(ticker)) return null;
  const on = isWatched(list, ticker);
  const toggle = () => {
    if (on) unwatchContract(ticker);
    else watchContract({ ticker, title, subtitle, startMs, route: contractRoute(pathname, search, ticker) });
  };
  return (
    <button type="button" className={`v3-watch${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`} aria-pressed={on} aria-label={on ? `Stop watching ${title}` : `Watch ${title}`} onClick={toggle}>
      <Icon name="star" size={16} fill={on} />{on ? 'Watching' : 'Watch'}
    </button>
  );
}
