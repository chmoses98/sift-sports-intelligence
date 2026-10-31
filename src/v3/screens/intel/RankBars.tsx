// Two league-rank bars, side by side in meaning: the longer the bar, the better the rank (rank 1 is a full bar). The label and the rank are
// printed words, so the bar is decoration and nothing depends on colour. Offense is ice, defense amber (the matchup design language).
import type { RankBar } from '../../model/intel/advantages';
import './intel.css';

export function RankBars({ bars, ariaLabel }: { bars: readonly RankBar[]; ariaLabel?: string }) {
  return (
    <div className="mi-bars" role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
      {bars.map((b) => (
        <div key={b.label} className="mi-bar">
          <span className="mi-bar__l">{b.label}</span>
          <span className="mi-bar__t" aria-hidden="true"><i className={b.role} style={{ width: `${Math.max(4, Math.min(100, b.pct))}%` }} /></span>
          <b className="mi-bar__r">{b.rankText}</b>
        </div>
      ))}
    </div>
  );
}
