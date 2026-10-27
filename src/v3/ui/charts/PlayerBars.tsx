// A player's recent game-log values as bars (SD5): green at or above the threshold, coral below, a dashed rule at the threshold.
// History, observed: the colour says whether the value reached the line, nothing is projected.
export function PlayerBars({ values, thr, max, label }: { values: number[]; thr: number; max: number; label: string }) {
  const h = (v: number) => Math.max(4, Math.round(4 + (62 * Math.max(0, v)) / Math.max(1, max)));
  return (
    <div className="st-pbars" role="img" aria-label={label}>
      {values.map((v, i) => <i key={i} className={v >= thr ? 'h' : 'm'} style={{ height: h(v) }}><b>{v}</b></i>)}
      <u className="st-thr" style={{ bottom: Math.round(4 + (62 * (thr - 0.5)) / Math.max(1, max)) }} />
    </div>
  );
}
