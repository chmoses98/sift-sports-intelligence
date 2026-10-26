// The alt-line sheet (⌄ on the decision card): every rung of the ladder with its three lanes. Choosing one sets the line and closes the sheet; the
// price beside it opens the exact contract. No rung is scored, ranked or coloured good or bad.
import { Legend, LadderRows } from './Overview';
import { useSharedView } from './shared';

export function LadderSheet() {
  const v = useSharedView();
  if (!v || !v.rungs.length) return <p className="v3p-fnote">No market is listed for this statistic in the coming game. The line on the chart is a reference line (the median of the games shown), not a price.</p>;
  return (
    <div className="v3p-ls">
      <div className="v3p-ladder__h"><span className="v3p-fnote">Choose a line: the chart, hit rate and averages move with it.</span><Legend /></div>
      <LadderRows v={v} rows={v.rungs} onPick={(r) => v.set({ line: r.line, obs: null })} />
      <p className="v3p-foot">Market is the pre-fee Kalshi ask. History counts the games the chart shows. The SIFT model shows only approved estimates; “—” is never filled in.</p>
    </div>
  );
}
