// One tug-of-war unit row (locked G1): the offense and the opposing defense on one 0-100 league-percentile rail (right = better), the gap
// filled between them in the advantaged role's colour with an arrow ending at the advantaged marker (the one further right), the tilt
// pill, and each side's value and rank underneath. Every part is its own target: the row body opens the unit, a logo or the pill opens
// that team, a value or rank opens its statistic's ranking with the team highlighted (the next opponent dashed).
import { NavRow, StatLink, TeamLink } from '../../nav/Targets';
import { fmtUnitValue, MATCHUP_WINDOW, ordinal, type UnitRow } from '../../data/research/matchup';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../TeamLogo';
import { TiltPill } from './TiltPill';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function TugRow({ row, team, slug, open = false, unitTo }: { row: UnitRow; team: (code: string) => V3Team; slug: string; open?: boolean; unitTo?: string }) {
  const { unit, o, d } = row;
  const lo = clamp(Math.min(o.pct, d.pct)), hi = clamp(Math.max(o.pct, d.pct));
  const even = row.tilt === 'even', offWins = row.tilt === 'off';
  const win = even ? 'var(--even)' : offWins ? 'var(--off)' : 'var(--def)';
  const offT = team(row.offTeam), defT = team(row.defTeam);
  const body = (
    <>
      <div className="mx-th">{open ? <span>Percentile gap · tilt</span> : <><b>{unit.title}</b><span>{unit.unit}</span></>}<TiltPill row={row} team={team} /></div>
      {/* The track holds the team links, so it cannot be role="img" (an image has no interactive children): its words are read beside it. */}
      <span className="sr">{`${unit.title}: ${row.offTeam} offense ${ordinal(o.rank)}, ${row.defTeam} defense ${ordinal(d.rank)}, ${even ? 'even' : `${row.favours} ${offWins ? 'offense' : 'defense'} +${Math.abs(row.gap)}`}`}</span>
      <div className="mx-trk">
        <div className="mx-rail" />
        <div className={`mx-gapf${even ? ' ev' : ''}`} style={{ left: `${lo}%`, width: `${hi - lo}%`, background: win, color: win }} />
        <span className={`mx-mkr mx-mkr--o${!even && offWins ? ' win' : ''}${!even && !offWins ? ' lose' : ''}`} style={{ left: `${clamp(o.pct)}%` }}>
          <TeamLink team={{ slug, id: row.offTeam }} className="mx-mk" label={`${row.offTeam}: team page`}><TeamLogo team={offT} size={17} /></TeamLink>
        </span>
        <span className={`mx-mkr mx-mkr--d${!even && !offWins ? ' win' : ''}${!even && offWins ? ' lose' : ''}`} style={{ left: `${clamp(d.pct)}%` }}>
          <TeamLink team={{ slug, id: row.defTeam }} className="mx-mk" label={`${row.defTeam}: team page`}><TeamLogo team={defT} size={17} /></TeamLink>
        </span>
      </div>
      <div className="mx-tv">
        <StatLink stat={{ slug, statId: unit.off }} state={{ win: MATCHUP_WINDOW, sel: row.offTeam, opp: row.defTeam }} className="mx-tv__c" label={`${row.offTeam} offense ${unit.unit}, ${ordinal(o.rank)} of ${o.n}: league ranking`}>
          <span className="off">{row.offTeam} offense <em>· {ordinal(o.rank)}</em></span><b>{fmtUnitValue(unit, o.value)}</b>
        </StatLink>
        <StatLink stat={{ slug, statId: unit.def }} state={{ win: MATCHUP_WINDOW, sel: row.defTeam, opp: row.offTeam }} className="mx-tv__c mx-tv__c--r" label={`${row.defTeam} defense ${unit.unit}, ${ordinal(d.rank)} of ${d.n}: league ranking`}>
          <span className="def">{row.defTeam} defense <em>· {ordinal(d.rank)}</em></span><b>{fmtUnitValue(unit, d.value)}{unit.defWord ? ` ${unit.defWord}` : ''}</b>
        </StatLink>
      </div>
    </>
  );
  if (open || !unitTo) return <div className="mx-tug mx-tug--open" data-unit={unit.id}>{body}</div>;
  return <NavRow to={unitTo} kind="game" label={`${unit.title}: open the unit`} className="mx-tug"><div className="mx-tug__in" data-unit={unit.id}>{body}</div></NavRow>;
}
