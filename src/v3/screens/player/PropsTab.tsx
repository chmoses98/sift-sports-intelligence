// The Props tab: every contract listed for this player in the coming game, one row per statistic with the three lanes at its main line and its
// price. The row opens the chart for that statistic; the price opens the exact contract. Prices are shown only through the display gate ("—").
import { Icon } from '../../ui/Icon';
import { PriceTap, PropsLink } from '../../nav/Targets';
import { LaneMark } from '../../ui/atoms';
import { hitCount, rungOf, siftLaneFor } from '../../model/playerResearch';
import type { PlayerView } from './view';

/** `priceOnly`: no game log is shown (baseball, or a player with no history): the rows carry the market lane and the price, nothing observed. */
export function PropsTab({ v, priceOnly }: { v: PlayerView; priceOnly?: boolean }) {
  const vm = v.vm!;
  // Charted statistics first (in pill order), then contracts the log has no column for (listed, priced, not chartable).
  const keys = [...vm.stats.map((s) => s.key).filter((k) => vm.props.has(k)), ...[...vm.props.keys()].filter((k) => !vm.stats.some((s) => s.key === k))];
  if (!keys.length) {
    return <div className="v3p-empty" role="status"><b>No props listed for the coming game</b>{vm.next ? 'Kalshi lists no contracts for this player in that game.' : 'There is no coming game on the published slate.'}{priceOnly ? '' : ' The chart still shows the player’s history.'}</div>;
  }
  return (
    <div className="v3p-props">
      <ul>
        {keys.map((key) => {
          const p = vm.props.get(key)!;
          const s = vm.stats.find((x) => x.key === key);
          const label = s?.label ?? p.statLabel;
          const k = rungOf(p.line);
          const ask = v.askOf(p.price);
          const h = hitCount(v.cut.games, key, p.line);
          const sift = siftLaneFor(v.modelReady.resolve(key), vm.sport, key, k);
          return (
            <li key={key} className="v3p-prow" data-stat={key}>
              {s && !priceOnly && <button type="button" className="v3p-prow__main" aria-label={`Chart ${label}, over ${p.line}`} onClick={() => v.set({ tab: 'overview', stat: key, line: null, obs: null })} />}
              <div className="v3p-prow__b">
                <b>{label}</b>
                <span className="o">Over {p.line} · <span className="num">{k}+</span></span>
                <span className="ln">
                  <span className="m"><LaneMark lane="market" />{ask != null ? `${ask}%` : '—'}</span>
                  {!priceOnly && s && <span className="h"><LaneMark lane="history" />{h.n ? `${h.over}/${h.n}` : '—'}</span>}
                  {!priceOnly && s && <span className={`z${sift.p == null ? ' off' : ''}`}><LaneMark lane="sift" />{sift.p != null ? `${Math.round(sift.p * 100)}%` : '—'}</span>}
                </span>
              </div>
              <PriceTap ticker={p.price.ticker} label={`Exact contract for ${label} over ${p.line}`} className="v3p-px"><b className="num">{ask != null ? `${ask}¢` : '—'}</b><small>ask</small></PriceTap>
            </li>
          );
        })}
      </ul>
      <PropsLink state={{ player: vm.name }} label={`Open ${vm.name}'s props in Prop Discovery`} className="v3p-showall">Open in Prop Discovery<Icon name="chevR" size={14} /></PropsLink>
    </div>
  );
}
