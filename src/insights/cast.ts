// WHO CARRIES EACH SCRIPT — the player whose role is the script's thesis.
//
// The simulation publishes, for every final-margin bucket, each team's conditional play volume and pass
// rate. A script where the leading team runs more than it does on average is a run script: its face is
// that team's lead back (most projected carries). One where it throws more is a pass script: its face is
// the quarterback (or, when the team's targets are concentrated, its lead receiver). A one-score game is
// carried by both quarterbacks. The player is chosen from the publication's own projections, never by
// hand, and the reason is written next to the photo.
import type { EventResearchDoc } from '../contract/types';
import type { GameScript, ScriptSet } from '../lib/scripts';
import { playerPhoto, type PlayerPhoto } from '../lib/players';

export type Lean = 'run' | 'pass' | 'balanced';

export interface CastMember {
  team: string;
  playerId: string | null;
  name: string | null;
  role: string | null;
  lean: Lean;
  /** "Runs 36 times in these games (28 on average)" */
  why: string;
  photo: PlayerPhoto | null;
}

const proj = (r: EventResearchDoc, pid: string, metric: string) => r.distributions.find((d) => d.entity_id === pid && d.metric_id === metric)?.mean ?? null;

function lead(r: EventResearchDoc, teamPid: string, role: string, metric: string) {
  return r.players
    .filter((p) => p.team_id === teamPid && p.role === role)
    .map((p) => ({ p, v: proj(r, p.participant_id, metric) ?? -1 }))
    .sort((a, b) => b.v - a.v)[0] ?? null;
}

/** How a team plays in a script compared with its average game. */
export function leanOf(set: ScriptSet, s: GameScript, side: 'home' | 'away'): { lean: Lean; rush: number | null; rushAvg: number | null; passRate: number | null; passAvg: number | null } {
  const v = s.volume[side];
  const o = set.overall[side];
  const d = v.passRate != null && o.passRate != null ? v.passRate - o.passRate : 0;
  return { lean: d <= -0.03 ? 'run' : d >= 0.03 ? 'pass' : 'balanced', rush: v.rushAtt, rushAvg: o.rushAtt, passRate: v.passRate, passAvg: o.passRate };
}

function member(r: EventResearchDoc, set: ScriptSet, s: GameScript, side: 'home' | 'away'): CastMember {
  const teamPid = r.participants.find((p) => p.home_away === (side === 'home' ? 'HOME' : 'AWAY'))?.participant_id ?? '';
  const abbr = side === 'home' ? set.homeAbbr : set.awayAbbr;
  const l = leanOf(set, s, side);
  const rb = lead(r, teamPid, 'RB', 'met_nfl.sim_carries');
  const qb = lead(r, teamPid, 'QB', 'met_nfl.sim_passing_yards');
  const wr = [lead(r, teamPid, 'WR', 'met_nfl.sim_receiving_yards'), lead(r, teamPid, 'TE', 'met_nfl.sim_receiving_yards')].filter(Boolean).sort((a, b) => b!.v - a!.v)[0] ?? null;
  const n = (v: number | null) => (v == null ? '—' : String(Math.round(v)));
  let pick = l.lean === 'run' ? rb : qb ?? wr;
  let why: string;
  if (l.lean === 'run' && rb) {
    why = `${abbr} run ${n(l.rush)} times in these games (${n(l.rushAvg)} on average) — ${rb.p.display_name} projects for ${Math.round(rb.v)} carries.`;
  } else if (l.lean === 'pass') {
    // A concentrated passing game is about its lead receiver; otherwise the quarterback carries it.
    const hhi = ((r.extensions as Record<string, any> | null)?.game_script_inputs?.team_volume?.[abbr]?.target_concentration_hhi ?? 0) as number; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (hhi >= 0.18 && wr) pick = wr;
    why = `${abbr} throw on ${Math.round((l.passRate ?? 0) * 100)}% of plays in these games (${Math.round((l.passAvg ?? 0) * 100)}% on average)${pick ? ` — it runs through ${pick.p.display_name}` : ''}.`;
  } else {
    pick = qb ?? rb;
    why = `${abbr} play to their usual mix here${pick ? `; ${pick.p.display_name} is the centerpiece` : ''}.`;
  }
  return {
    team: abbr,
    playerId: pick?.p.participant_id ?? null,
    name: pick?.p.display_name ?? null,
    role: pick?.p.role ?? null,
    lean: l.lean,
    why,
    photo: pick ? playerPhoto(pick.p.participant_id, pick.p.display_name, abbr, [s.id === 'fav-big' ? 'pull-away' : s.id === 'fav' ? 'control' : 'lead']) : null,
  };
}

/** The face(s) of one script: the leading team's centerpiece, or both teams for a one-score game. */
export function scriptCast(r: EventResearchDoc, set: ScriptSet, s: GameScript): CastMember[] {
  if (!s.leader) return [member(r, set, s, 'away'), member(r, set, s, 'home')];
  return [member(r, set, s, s.leader)];
}
