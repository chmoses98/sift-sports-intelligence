// A league track (TR1 to TR4): the rail is the league, left is worst and right is best, with one marker per unit. Offense is ice,
// defense amber (cyan is for selection only), a ghost ring is the long-window baseline. A marker that has a statistic opens that
// statistic's ranking with the team highlighted; without one it is a plain mark. Presentational: callers pass percentiles already derived.
import type { ComponentProps } from 'react';
import { StatLink } from '../../nav/Targets';

export interface TrackMark {
  key: string;
  /** off: ice, def: amber, g: ghost baseline, n: neutral (style and results statistics). */
  cls: 'o' | 'd' | 'g' | 'n';
  /** 0 worst to 100 best. */
  pct: number;
  letter?: string;
  /** Where the marker goes when tapped. */
  stat?: Pick<ComponentProps<typeof StatLink>, 'stat' | 'state'> & { label: string };
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function LeagueTrack({ marks, height = 34 }: { marks: TrackMark[]; height?: number }) {
  return (
    <div className="tm-ptr" style={{ height }}>
      <i className="rail" />
      <i className="tick" />
      {marks.map((m) => (
        <span key={m.key} className="mkw" style={{ left: `${clamp(m.pct)}%` }}>
          {m.stat
            ? <StatLink stat={m.stat.stat} state={m.stat.state} label={m.stat.label} className={`mk ${m.cls}`}>{m.letter ?? null}</StatLink>
            : <span className={`mk ${m.cls}`} aria-hidden="true">{m.letter ?? null}</span>}
        </span>
      ))}
    </div>
  );
}

/** "Worst · Middle · Best" under a group of tracks. */
export const TrackAxis = () => <span className="tm-ax" aria-hidden="true"><i>Worst</i><i>Middle</i><i>Best</i></span>;
