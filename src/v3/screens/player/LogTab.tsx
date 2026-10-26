// The Log tab (design inferred: the locked mockups name the tab but draw no state for it, so it is built from the same atoms as the rest of the
// screen). One row per logged game of the games the window and filters leave, newest first: the opponent (a team target), the venue, the week,
// the margin, the selected statistic with whether it cleared the line, and the player's other statistics in one quiet line. The row opens that
// game's Game Detail when the published schedule lists it; a game the schedule does not list (an earlier season) has no page and says so.
import { teamLogo } from '../../../lib/teams';
import { Icon } from '../../ui/Icon';
import { NavRow, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { otherStats } from '../../model/playerResearch';
import { resultOf, type Obs } from '../../model/research';
import { fmt1, shortDate, StatPills, FilterChips, WindowChips } from './Overview';
import type { PlayerView } from './view';

const FIRST = 20;

const margin = (m: number | null) => (m == null ? null : m > 0 ? `won by ${m}` : m < 0 ? `lost by ${-m}` : 'tied');

/** Rows for a list of games (newest first is the caller's order). Used by the Log and by SIFT Replay. */
export function GameRows({ v, rows }: { v: PlayerView; rows: Obs[] }) {
  const vm = v.vm!;
  const stat = v.stat!;
  return (
    <ul className="v3p-gl" aria-label="Games">
      {rows.map((o) => {
        const val = o.v[stat];
        const r = val != null && v.line != null ? resultOf(val, v.line) : null;
        const eventId = v.eventIdOf(o);
        const when = [o.week != null ? `Wk ${o.week}` : null, `${shortDate(o.date)}${o.season != null && vm.season != null && o.season !== vm.season ? ` ’${o.date.slice(2, 4)}` : ''}`, margin(o.margin)].filter(Boolean).join(' · ');
        const others = otherStats(o, vm.stats, stat);
        const inner = (
          <>
            <TeamLink team={{ slug: vm.team?.slug ?? v.slug, id: o.opp }} label={`${o.opp}, team page`} className="v3p-gl__logo">
              {teamLogo(vm.sport, o.opp) ? <img src={teamLogo(vm.sport, o.opp)!} alt="" width={30} height={30} /> : <span className="v3p-gl__code">{o.opp.slice(0, 3)}</span>}
            </TeamLink>
            <div className="v3p-gl__t"><b>{o.home === false ? '@' : 'vs'} {o.opp}</b><span>{when}</span></div>
            <div className="v3p-gl__v"><b className={`num${r ? ` is-${r}` : ''}`}>{fmt1(val)}</b><small>{r === 'over' ? 'Over' : r === 'under' ? 'Under' : r === 'push' ? 'Push' : ''}</small></div>
            {others && <span className="v3p-gl__o">{others}</span>}
            {eventId ? <Icon name="chevR" size={14} /> : <i className="v3p-gl__nopage" aria-hidden="true" />}
          </>
        );
        return (
          <li key={o.key} data-obs={o.key}>
            {eventId ? (
              <NavRow to={routes.game({ slug: vm.team?.slug ?? v.slug, eventId })} kind="game" label={`Game Detail: ${o.label}`} className="v3p-gl__r">{inner}</NavRow>
            ) : (
              <div className="v3p-gl__r is-nopage" title="No game page for this game">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function LogTab({ v, onFilters }: { v: PlayerView; onFilters: () => void }) {
  const games = [...v.cut.games].reverse();
  const shown = v.state.more ? games : games.slice(0, FIRST);
  return (
    <>
      <StatPills v={v} onFilters={onFilters} />
      <FilterChips v={v} />
      <section className="v3p-logc v3p-card" aria-label={`${v.statDef?.label} game log`}>
        <div className="v3p-top"><WindowChips v={v} /></div>
        {games.length === 0 ? (
          <div className="v3p-empty" role="status"><b>0 games match</b>No game fits the window and filters.
            {v.filterCount > 0 && <button type="button" className="v3p-link" onClick={() => v.set({ site: 'any', opp: null, tier: 'any', rest: 'any', script: 'any', role: 'any', min: null, obs: null })}>Remove all filters</button>}
          </div>
        ) : (
          <>
            <div className="v3p-logc__h"><b>{games.length} {games.length === 1 ? 'game' : 'games'}</b><span>{v.statDef?.label} · line {v.line ?? '—'}</span></div>
            <GameRows v={v} rows={shown} />
            {games.length > FIRST && !v.state.more && <button type="button" className="v3p-link v3p-logc__more" onClick={() => v.set({ more: true })}>Show all {games.length} games</button>}
            {games.some((o) => !v.eventIdOf(o)) && <p className="v3p-foot">Games without an arrow have no game page: the published schedule does not list them.</p>}
          </>
        )}
      </section>
    </>
  );
}

