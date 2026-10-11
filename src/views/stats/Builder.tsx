// BUILD A MATCHUP — choose the unit and the sides: an offense against the other team's defense (either direction),
// both offenses, or both defenses, on any published measure or box-score basic. The picture is the two league ranks
// (each bar under its own team), both teams placed on one league strip, and — for opponent-adjusted ratings — each
// rating as a bar either side of league average. The sentence beneath compares ranks; it is an observation.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, MetricDef, Observation } from '../../contract/types';
import { BasisTag, DivergingBar, DuelRow, PercentileStrip } from '../../components/statviz';
import { TeamMark } from '../../components/ui';
import { basicText, type BasicKey, type BasicValue, type TeamBasics } from '../../insights/basics';
import { matchupObs, type GameSides, type Side } from '../../insights/game';
import { conclude, pick, type ObsPick } from '../../insights/unitAnalysis';
import { formatStat, unitLine } from '../../insights/units';
import { routes } from '../../lib/routes';
import { teamAccent } from '../../lib/teams';
import type { StatMode } from '../../state/statMode';

interface BuilderUnit {
  key: string;
  label: string;
  group: 'Ratings' | 'Box score';
  off?: [string | null, string | null];
  def?: [string | null, string | null];
  basic?: BasicKey;
  offWord: string;
  defWord: string;
}

const A = (s: string) => `met_nfl.${s}`;

export const BUILDER_UNITS: BuilderUnit[] = [
  { key: 'pass', label: 'Passing efficiency (per dropback)', group: 'Ratings', off: [A('adj_off_db_epa'), A('off_dropback_epa')], def: [A('adj_def_db_epa'), A('def_dropback_epa')], offWord: 'pass offense', defWord: 'pass defense' },
  { key: 'run', label: 'Rushing efficiency (per designed run)', group: 'Ratings', off: [A('adj_off_rush_epa'), A('off_rush_epa')], def: [A('adj_def_rush_epa'), A('def_rush_epa')], offWord: 'run offense', defWord: 'run defense' },
  { key: 'overall', label: 'Overall efficiency (per play)', group: 'Ratings', off: [A('adj_off_epa'), A('off_epa_play')], def: [A('adj_def_epa'), A('def_epa_play')], offWord: 'offense', defWord: 'defense' },
  { key: 'success', label: 'Success rate', group: 'Ratings', off: [A('adj_off_sr'), A('off_success_rate')], def: [A('adj_def_sr'), A('def_success_rate')], offWord: 'offense', defWord: 'defense' },
  { key: 'sack', label: 'Sack rate (protection vs pass rush)', group: 'Ratings', off: [A('adj_off_sack_rate'), A('off_sack_rate_allowed')], def: [A('adj_def_sack_rate'), A('def_sack_rate')], offWord: 'pass protection', defWord: 'pass rush' },
  { key: 'explosive', label: 'Explosive-play rate', group: 'Ratings', off: [A('adj_off_explosive'), A('off_explosive_rate')], def: [A('adj_def_explosive'), A('def_explosive_rate')], offWord: 'big-play offense', defWord: 'big-play defense' },
  { key: 'early', label: 'Early-down efficiency', group: 'Ratings', off: [A('adj_off_ed_epa'), A('off_early_down_epa')], def: [A('adj_def_ed_epa'), A('def_early_down_epa')], offWord: 'early-down offense', defWord: 'early-down defense' },
  { key: 'neutral', label: 'Neutral-script efficiency', group: 'Ratings', off: [A('adj_off_epa_ng'), A('off_epa_play_ng')], def: [A('adj_def_epa_ng'), A('def_epa_play_ng')], offWord: 'offense', defWord: 'defense' },
  { key: 'redzone', label: 'Red-zone efficiency', group: 'Ratings', off: [null, A('off_rz_epa')], def: [null, A('def_rz_epa')], offWord: 'red-zone offense', defWord: 'red-zone defense' },
  { key: 'turnovers', label: 'Turnover rate (per play)', group: 'Ratings', off: [A('adj_off_to_rate'), A('off_turnover_rate')], def: [A('adj_def_to_rate'), A('def_takeaway_rate')], offWord: 'ball security', defWord: 'takeaways' },
  { key: 'special', label: 'Special teams', group: 'Ratings', off: [A('adj_off_st_epa'), null], def: [A('adj_def_st_epa'), null], offWord: 'special teams', defWord: 'special-teams defense' },
  { key: 'b-points', label: 'Points per game', group: 'Box score', basic: 'points', offWord: 'scoring offense', defWord: 'scoring defense' },
  { key: 'b-yards', label: 'Yards per game', group: 'Box score', basic: 'yards', offWord: 'offense', defWord: 'defense' },
  { key: 'b-pass', label: 'Passing yards per game', group: 'Box score', basic: 'pass_yds', offWord: 'passing game', defWord: 'pass defense' },
  { key: 'b-rush', label: 'Rushing yards per game', group: 'Box score', basic: 'rush_yds', offWord: 'running game', defWord: 'run defense' },
  { key: 'b-ypp', label: 'Yards per play', group: 'Box score', basic: 'yds_play', offWord: 'offense', defWord: 'defense' },
  { key: 'b-to', label: 'Turnovers / takeaways per game', group: 'Box score', basic: 'turnovers', offWord: 'ball security', defWord: 'takeaways' },
  { key: 'b-sacks', label: 'Sacks per game', group: 'Box score', basic: 'sacks', offWord: 'protection', defWord: 'pass rush' },
  { key: 'b-third', label: 'Third-down rate', group: 'Box score', basic: 'third', offWord: 'third-down offense', defWord: 'third-down defense' },
  { key: 'b-rz', label: 'Red-zone touchdown rate', group: 'Box score', basic: 'redzone', offWord: 'red-zone offense', defWord: 'red-zone defense' },
];

type Compare = 'od' | 'oo' | 'dd';

interface SidePick {
  team: Side;
  side: 'off' | 'def';
  obs: ObsPick | null;
  basic: BasicValue | null;
}

function profileObs(p: EntityProfileDoc | null | undefined, id: string | null) {
  return id ? p?.metrics.find((m) => m.metric_id === id && !m.split) ?? null : null;
}

export function MatchupBuilder({ r, profiles, g, mode, basics, metrics, slug }: { r: EventResearchDoc | null; profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null }; g: GameSides; mode: StatMode; basics: Map<string, TeamBasics> | null; metrics: Map<string, MetricDef>; slug: string }) {
  const [unitKey, setUnit] = useState('pass');
  const [cmp, setCmp] = useState<Compare>('od');
  const [first, setFirst] = useState<string>(g.away.abbr);
  const u = BUILDER_UNITS.find((x) => x.key === unitKey) ?? BUILDER_UNITS[0];
  const getter = (t: Side) => (id: string | null): Observation | null => (id ? (r ? matchupObs(r, id, t) : null) ?? profileObs(t.home ? profiles.home : profiles.away, id) : null);
  const a = g.byAbbr(first);
  const b = g.opp(first);
  const sides: [SidePick, SidePick] = useMemo(() => {
    const mk = (team: Side, side: 'off' | 'def'): SidePick => ({
      team, side,
      obs: u.basic ? null : pick((side === 'off' ? u.off : u.def) ?? [null, null], getter(team), mode),
      basic: u.basic ? basics?.get(team.abbr)?.[side].find((v) => v.def.key === u.basic) ?? null : null,
    });
    if (cmp === 'od') return [mk(a, 'off'), mk(b, 'def')];
    if (cmp === 'oo') return [mk(g.away, 'off'), mk(g.home, 'off')];
    return [mk(g.away, 'def'), mk(g.home, 'def')];
  }, [u, cmp, a, b, g, mode, basics, r, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = (p: SidePick) => `${p.team.abbr} ${p.side === 'off' ? u.offWord : u.defWord}`;
  const rankOf = (p: SidePick) => (p.obs ? { rank: p.obs.obs.context?.rank ?? null, of: p.obs.obs.context?.universe_size ?? null } : p.basic ? { rank: p.basic.rank, of: p.basic.of } : { rank: null, of: null });
  const valueOf = (p: SidePick) => (p.obs ? formatStat(p.obs.obs.metric_id, p.obs.obs.value, metrics.get(p.obs.obs.metric_id)) : p.basic ? basicText(p.basic) : '—');
  const tag = (p: SidePick) => (p.obs ? <BasisTag basis={p.obs.basis} fallback={p.obs.fallback} /> : p.basic ? <BasisTag basis="box" /> : null);
  const unitText = sides[0].obs ? unitLine(sides[0].obs.obs.metric_id, metrics.get(sides[0].obs.obs.metric_id)) : sides[0].basic?.def.per ?? sides[1].basic?.def.per ?? '';
  const [L, R] = sides;
  const lr = rankOf(L);
  const rr = rankOf(R);
  const conclusion = cmp === 'od' && L.obs && R.obs ? conclude(L.team, R.team, u.offWord, u.defWord, L.obs.obs, R.obs.obs) : null;
  const plain = (() => {
    if (conclusion) return conclusion.text;
    if (lr.rank == null || rr.rank == null) return 'One side has no ranked value for this measure, so they are not compared.';
    if (lr.rank === rr.rank) return `Level: both rank #${lr.rank}.`;
    const better = lr.rank < rr.rank ? L : R;
    const worse = better === L ? R : L;
    return `${better.team.nick} ${better.side === 'off' ? u.offWord : u.defWord} ranks higher: #${rankOf(better).rank} against #${rankOf(worse).rank}${cmp === 'od' ? '' : ` (the ${worse.team.nick})`}.`;
  })();
  const pos = (p: SidePick) => {
    const x = rankOf(p);
    return x.rank != null && x.of && x.of > 1 ? (x.of - x.rank) / (x.of - 1) : null;
  };
  const marks = sides.filter((p) => pos(p) != null).map((p) => ({ abbr: `${p.team.abbr} ${p.side === 'off' ? 'O' : 'D'}`, color: teamAccent('NFL', p.team.abbr), pos: pos(p)!, text: `${who(p)} #${rankOf(p).rank}` }));
  const adjusted = sides.filter((p) => p.obs?.basis === 'adjusted');
  const max = Math.max(...adjusted.map((p) => Math.abs(p.obs!.obs.value ?? 0)), ...adjusted.map((p) => Math.max(Math.abs(p.obs!.obs.context?.best_value ?? 0), Math.abs(p.obs!.obs.context?.worst_value ?? 0))), 1e-9);

  return (
    <div className="bld lc-card">
      <div className="bld__ctl">
        <label className="bld__f">
          <span className="bld__fl">Measure</span>
          <select value={unitKey} onChange={(e) => setUnit(e.target.value)}>
            {(['Ratings', 'Box score'] as const).map((grp) => (
              <optgroup key={grp} label={grp === 'Ratings' ? 'Efficiency ratings' : 'Box-score basics'}>
                {BUILDER_UNITS.filter((x) => x.group === grp).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="bld__f">
          <span className="bld__fl" id="bld-cmp">Compare</span>
          <div className="seg seg--sm bld__seg" role="group" aria-labelledby="bld-cmp">
            {([['od', 'Offense vs defense'], ['oo', 'Both offenses'], ['dd', 'Both defenses']] as [Compare, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`seg__b${cmp === k ? ' is-on' : ''}`} aria-pressed={cmp === k} onClick={() => setCmp(k)}>{l}</button>
            ))}
          </div>
        </div>
        {cmp === 'od' && (
          <div className="bld__f">
            <span className="bld__fl" id="bld-off">Offense</span>
            <div className="seg seg--sm bld__seg" role="group" aria-labelledby="bld-off">
              {[g.away, g.home].map((t) => (
                <button key={t.abbr} type="button" className={`seg__b bld__tb${first === t.abbr ? ' is-on' : ''}`} aria-pressed={first === t.abbr} onClick={() => setFirst(t.abbr)}>
                  <TeamMark sport="NFL" abbr={t.abbr} size="sm" /> {t.abbr} offense vs {g.opp(t.abbr).abbr} D
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <h3 className="bld__t">
        <span style={{ color: teamAccent('NFL', L.team.abbr) }}>{who(L)}</span> <span className="bld__vs">vs</span> <span style={{ color: teamAccent('NFL', R.team.abbr) }}>{who(R)}</span>
      </h3>
      <DuelRow
        label={u.label}
        unit={unitText}
        left={{ abbr: L.team.abbr, color: teamAccent('NFL', L.team.abbr), ...lr, value: valueOf(L), who: who(L), tag: tag(L) }}
        right={{ abbr: R.team.abbr, color: teamAccent('NFL', R.team.abbr), ...rr, value: valueOf(R), who: who(R), tag: tag(R) }}
      />
      {marks.length > 0 && <PercentileStrip marks={marks} low="League worst" high="League best" label={`${u.label}: where each unit sits among ${lr.of ?? rr.of ?? 32} teams`} />}
      {adjusted.length > 0 && (
        <div className="bld__dv">
          {adjusted.map((p) => (
            <div key={p.team.abbr + p.side} className="bld__dvr">
              <span className="bld__dvk">{who(p)}</span>
              <DivergingBar value={p.obs!.obs.value} max={max} betterUp={p.obs!.obs.context?.higher_is_better ?? null} text={formatStat(p.obs!.obs.metric_id, p.obs!.obs.value)} label={who(p)} />
            </div>
          ))}
          <p className="lc-fine">Bars run from league average (the centre line); green is the better side for that unit, red the worse.</p>
        </div>
      )}
      <p className="bld__c"><span className="lc-tier lc-tier--obs">Observation</span> {plain}</p>
      {sides.some((p) => p.obs) && (
        <p className="bld__x">
          {sides.filter((p) => p.obs).map((p) => (
            <Link key={p.team.abbr + p.side} to={routes.metric(slug, p.obs!.obs.metric_id, { team: p.team.pid, opp: g.opp(p.team.abbr).pid, event: r?.event.event_id })}>{who(p)}: every team →</Link>
          ))}
        </p>
      )}
    </div>
  );
}
