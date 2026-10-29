// The seven-segment unit meter and its count line: one segment per unit shown (ice = the offense's unit leads, amber = the defense's,
// slate = Even), then "[offense logo] 5 · 1 even · [defense logo] 1". The counts are the same rule as the rows (data/research/matchup.ts)
// and always add up to the number of segments.
import type { TiltCounts, UnitRow } from '../../data/research/matchup';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../TeamLogo';

export function UnitMeter({ rows, counts, off, def }: { rows: UnitRow[]; counts: TiltCounts; off: V3Team; def: V3Team }) {
  return (
    <>
      <div className="mx-gb" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, 1fr)` }}>{rows.map((r) => <i key={r.unit.id} className={r.tilt} />)}</div>
      <div className="mx-lgn" aria-hidden="true">
        <span><i className="mx-ring mx-ring--off"><TeamLogo team={off} size={11} /></i>{counts.off}</span>
        <span className="ev"><i className="mx-dotev" />{counts.even} even</span>
        <span><i className="mx-ring mx-ring--def"><TeamLogo team={def} size={11} /></i>{counts.def}</span>
      </div>
    </>
  );
}

/** The words a screen reader gets for a direction tile (the meter itself is decorative). */
export const meterLabel = (off: string, def: string, c: TiltCounts) => `${off} offense vs ${def} defense: ${c.off} favour ${off} offense, ${c.even} even, ${c.def} favour ${def} defense, of ${c.total} units`;
