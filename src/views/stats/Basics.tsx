// THE BASICS on screen: points, yards, turnovers, sacks, third downs and the red zone, number first, each with its
// unit ("per game", "% of third downs") and its league rank of N. Two teams side by side (a game, a comparison) or
// one team against the league (a team page). Box-score numbers are raw results — the table says so.
import type { ReactNode } from 'react';
import { TeamMark } from '../../components/ui';
import { basicText, type BasicValue, type TeamBasics } from '../../insights/basics';
import { teamAccent } from '../../lib/teams';
import '../../styles/lane-c-stats.css';
import '../../styles/lane-c-views.css';

export interface BasicsTeam { abbr: string; nick: string }

const strength = (v: BasicValue) => (v.rank == null || v.of < 2 ? 0 : (v.of - v.rank) / (v.of - 1));

function Cell({ v, side, color }: { v: BasicValue | undefined; side: 'l' | 'r'; color: string }) {
  if (!v) return <span className={`bx__c bx__c--${side} muted`}>—</span>;
  return (
    <span className={`bx__c bx__c--${side}`} style={{ ['--tc' as string]: color }}>
      <span className="bx__v num">{basicText(v)}</span>
      <span className="bx__rk">{v.rank != null ? `#${v.rank} of ${v.of}` : 'unranked'}</span>
      <span className="bx__bar" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round(strength(v) * 100))}%` }} /></span>
    </span>
  );
}

function rowsFor(b: TeamBasics | null | undefined, side: 'off' | 'def') {
  return b ? b[side] : [];
}

/** Two teams, offense block then defense block. */
export function BasicsDuel({ basics, left, right, sport = 'NFL', foot }: { basics: Map<string, TeamBasics> | null | undefined; left: BasicsTeam; right: BasicsTeam; sport?: string; foot?: ReactNode }) {
  const L = basics?.get(left.abbr);
  const R = basics?.get(right.abbr);
  if (!L && !R) return <p className="muted small">No box-score history is available for these teams yet.</p>;
  const lc = teamAccent(sport, left.abbr);
  const rc = teamAccent(sport, right.abbr);
  const table = (side: 'off' | 'def', title: string) => {
    const keys = [...new Set([...rowsFor(L, side), ...rowsFor(R, side)].map((v) => v.def.key))];
    return (
      <table className="bx__t">
        <caption className="bx__cap">{title}</caption>
        <thead>
          <tr>
            <th scope="col" className="bx__team bx__team--l"><TeamMark sport={sport} abbr={left.abbr} size="sm" /> {left.abbr}</th>
            <th scope="col" className="bx__mid">{side === 'off' ? 'Offense' : 'Defense'} · rank of {L?.[side][0]?.of ?? R?.[side][0]?.of ?? 32}</th>
            <th scope="col" className="bx__team bx__team--r">{right.abbr} <TeamMark sport={sport} abbr={right.abbr} size="sm" /></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const l = L?.[side].find((v) => v.def.key === k);
            const r = R?.[side].find((v) => v.def.key === k);
            const d = (l ?? r)!.def;
            const lead = l?.rank != null && r?.rank != null ? (l.rank < r.rank ? 'l' : r.rank < l.rank ? 'r' : 'even') : 'none';
            return (
              <tr key={k} className={`bx__row bx__row--${lead}`}>
                <td><Cell v={l} side="l" color={lc} /></td>
                <th scope="row" className="bx__k">
                  <span className="bx__label">{d.label[side]}</span>
                  {d.note && <span className="bx__per">{d.note}</span>}
                  {(l?.sample || r?.sample) && <span className="bx__smp">{[l?.sample ? `${left.abbr} ${l.sample}` : null, r?.sample ? `${right.abbr} ${r.sample}` : null].filter(Boolean).join(' · ')}</span>}
                </th>
                <td><Cell v={r} side="r" color={rc} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };
  return (
    <div className="bx">
      <div className="bx__grid">
        {table('off', `${left.nick} and ${right.nick} offense, per game unless stated`)}
        {table('def', `${left.nick} and ${right.nick} defense, per game unless stated`)}
      </div>
      {foot && <p className="lc-fine">{foot}</p>}
    </div>
  );
}

/** One team against the league: number first, rank of N, a bar for where it sits. */
export function BasicsSolo({ basics, team, sport = 'NFL' }: { basics: TeamBasics | null | undefined; team: BasicsTeam; sport?: string }) {
  if (!basics) return <p className="muted small">No box-score history is available for {team.nick} yet.</p>;
  const c = teamAccent(sport, team.abbr);
  const group = (side: 'off' | 'def', title: string) => (
    <div className="bxs__g">
      <h3 className="bxs__h">{title}</h3>
      <ul className="bxs__l">
        {basics[side].map((v) => (
          <li key={v.def.key} className="bxs__i" style={{ ['--tc' as string]: c }}>
            <span className="bxs__k"><b>{v.def.label[side]}</b><small>{[v.def.note, v.sample].filter(Boolean).join(' · ') || v.def.per}</small></span>
            <span className="bxs__v num">{basicText(v)}</span>
            <span className="bxs__rk">{v.rank != null ? `#${v.rank} of ${v.of}` : 'unranked'}</span>
            <span className="bx__bar bxs__bar" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round(strength(v) * 100))}%` }} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="bxs">
      {group('off', 'Offense')}
      {group('def', 'Defense')}
    </div>
  );
}

/** "Weeks 1–4 · 4 games · nflverse play-by-play" */
export function basicsSpan(b: TeamBasics | null | undefined): string | null {
  if (!b || !b.weeks.length) return null;
  const w = [...b.weeks].sort((x, y) => x - y);
  return `${w.length === 1 ? `Week ${w[0]}` : `Weeks ${w[0]}–${w[w.length - 1]}`} · ${b.games} ${b.games === 1 ? 'game' : 'games'}`;
}
