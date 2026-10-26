// A league strip (locked G2): every team in the ranking as a dot on one line, worst on the left and best on the right whatever the
// statistic's direction, the league average ticked in amber, and the selected team as a logo marker ringed in its role's colour (ice
// offense, amber defense). Positions come from the published ranking's own values; nothing is estimated.
import type { RankingEntryVM } from '../../data/research/types';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../TeamLogo';

const x0 = 2.4, span = 95.2; // percent of the strip: keeps the end dots and the marker inside the card

/** Percent positions (0 worst to 100 best, by the statistic's own direction) for every entry; null values are left out. */
export function stripPositions(entries: Pick<RankingEntryVM, 'code' | 'value' | 'adjusted'>[], higherIsBetter: boolean | null, mean: number | null) {
  const val = (e: Pick<RankingEntryVM, 'value' | 'adjusted'>) => e.adjusted ?? e.value;
  const vs = entries.map(val).filter((v): v is number => v != null);
  if (vs.length < 2) return null;
  const mn = Math.min(...vs), mx = Math.max(...vs), rng = mx - mn || 1;
  const t = (v: number) => { const u = (v - mn) / rng; return x0 + (higherIsBetter === false ? 1 - u : u) * span; };
  return { at: (e: Pick<RankingEntryVM, 'value' | 'adjusted'>) => { const v = val(e); return v == null ? null : t(v); }, mean: mean == null ? null : t(Math.max(mn, Math.min(mx, mean))) };
}

export function LeagueStrip({ entries, higherIsBetter, mean, selected, role, team, label }: {
  entries: RankingEntryVM[]; higherIsBetter: boolean | null; mean: number | null; selected: string; role: 'off' | 'def'; team: V3Team; label: string;
}) {
  const pos = stripPositions(entries, higherIsBetter, mean);
  if (!pos) return null;
  const me = entries.find((e) => e.code === selected);
  const meX = me ? pos.at(me) : null;
  const others = entries.filter((e) => e.code !== selected).map((e) => ({ e, x: pos.at(e) })).filter((d): d is { e: RankingEntryVM; x: number } => d.x != null).sort((a, b) => a.x - b.x);
  let last = -99, flip = 1;
  const dots = others.map(({ e, x }) => { flip = x - last < 2.1 ? -flip : 1; last = x; return { code: e.code, x, down: flip === -1 }; });
  return (
    <div className="mx-strip" role="img" aria-label={label}>
      <i className="mx-strip__line" />
      {dots.map((d) => <i key={d.code} className={`mx-strip__dot${d.down ? ' is-down' : ''}`} style={{ left: `${d.x}%` }} />)}
      {pos.mean != null && <><i className="mx-strip__avg" style={{ left: `${pos.mean}%` }} /><b className="mx-strip__avgl" style={{ left: `${pos.mean}%` }}>league avg</b></>}
      {meX != null && <span className={`mx-strip__me mx-strip__me--${role}`} style={{ left: `${meX}%` }}><TeamLogo team={team} size={18} /></span>}
      <small className="mx-strip__w">Worst</small><small className="mx-strip__b">Best</small>
    </div>
  );
}
