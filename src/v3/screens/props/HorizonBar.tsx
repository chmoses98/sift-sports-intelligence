// The discovery horizon control (home and list): 48 hours (default), 7 days, All upcoming. The choice lives in the address (`hz=`, replace
// history) and every count on it comes from the board rows the app already holds, so printing them reads no game document. A longer
// horizon reads only the games it adds, soonest first; the line under the control states what that costs before it is chosen and shows
// the progress while it is read. Nothing is dropped silently: past the cap the line says how many games are left out.
import { costText, HORIZONS, HORIZON_LABEL, MAX_GAMES, type Horizon } from '../../data/props/horizon';
import type { UniverseState } from '../../data/props/hooks';

export function horizonStatus(s: Pick<UniverseState, 'horizon' | 'counts' | 'universe' | 'reading' | 'omitted'>): string {
  const { horizon: h, counts, universe: u, reading, omitted } = s;
  const extraGames = (x: Horizon) => counts[x].games - counts['48h'].games;
  const extraBytes = (x: Horizon) => counts[x].bytes - counts['48h'].bytes;
  const cap = omitted > 0 ? ` Showing the soonest ${MAX_GAMES} of ${MAX_GAMES + omitted} games.` : '';
  if (reading && u) {
    const cost = h === '48h' ? '' : ` The ${extraGames(h)} games beyond 48 hours are about ${costText(extraBytes(h))}, read soonest first.`;
    return `Reading games: ${u.gamesLoaded} of ${u.gamesTotal}. Counts and order cover the soonest ${u.gamesLoaded} for now.${cost}${cap}`;
  }
  if (reading) return `Reading the games starting within ${HORIZON_LABEL[h].toLowerCase()}…`;
  const withProps = u?.stats.games ?? 0;
  const read = `${counts[h].games} game${counts[h].games === 1 ? '' : 's'} starting within ${HORIZON_LABEL[h].toLowerCase()}, ${withProps} with player props.`;
  if (h === 'all') return `Every upcoming game: ${counts.all.games} read, ${withProps} with player props.${cap}`;
  const next: Horizon = h === '48h' ? '7d' : 'all';
  const more = counts[next].games - counts[h].games;
  return `${read}${more > 0 ? ` ${HORIZON_LABEL[next]} adds ${more} game${more === 1 ? '' : 's'} (about ${costText(extraBytes(next) - (h === '7d' ? extraBytes('7d') : 0))}).` : ''}${cap}`;
}

export function HorizonBar({ state, onChange }: { state: UniverseState; onChange: (h: Horizon) => void }) {
  const { horizon, counts, universe, reading } = state;
  const pct = universe && reading && universe.gamesTotal > 0 ? Math.round((100 * universe.gamesLoaded) / universe.gamesTotal) : null;
  return (
    <section className="pd-hz" aria-label="Time horizon">
      <div className="pd-hz__seg" role="group" aria-label="Show games starting within">
        {HORIZONS.map((h) => {
          const extra = counts[h].games - counts['48h'].games;
          return (
            <button key={h} type="button" aria-pressed={horizon === h} onClick={() => onChange(h)} data-hz={h}
              aria-label={`${HORIZON_LABEL[h]}, ${counts[h].games} games${h === '48h' || extra <= 0 ? '' : `, reads ${extra} more, about ${costText(counts[h].bytes - counts['48h'].bytes)}`}`}>
              <b>{HORIZON_LABEL[h]}</b><small>{counts[h].games} game{counts[h].games === 1 ? '' : 's'}</small>
            </button>
          );
        })}
      </div>
      <p className="pd-hz__st" role="status" aria-live="polite" aria-busy={reading}>{horizonStatus(state)}</p>
      {pct != null && <div className="pd-hz__bar" role="progressbar" aria-label="Games read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>}
    </section>
  );
}
