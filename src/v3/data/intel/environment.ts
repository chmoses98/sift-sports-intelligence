// Scoring environment, pace and efficiency for one game, as the publication's simulation states them
// (`extensions.game_script_inputs`: game_environment and team_volume) plus the league ranks of scoring from the matchup rows. Pure.
// Every figure is a published simulation or season statistic and is labelled as such by the screen; the simulation's own caveats
// (what it does not model) travel with it. A figure the document does not carry is not a line.
import type { EventResearchDoc } from '../../../contract/types';
import type { V3Game } from '../../model/types';
import { ordinal } from '../research/matchup';
import { shortMetricId } from '../research/normalize';

export interface EnvLine {
  id: string;
  label: string;
  /** Plain-English value ("about 45.6 total points; half of simulated games land between 36 and 54"). */
  text: string;
  /** What kind of number this is: the simulation, a season statistic, or a published model projection that is not a simulation (baseball runs, college tempo). */
  source: 'simulation' | 'season' | 'model';
}

export interface Environment {
  lines: EnvLine[];
  /** What the simulation does not model, from the publication. */
  notSimulated: string[];
  /** A closing sentence that belongs to this sport's section (what the publication does not state, where a projection comes from). */
  foot?: string | null;
}

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const dist = (x: unknown): { mean: number; lo: number | null; hi: number | null } | null => {
  const d = rec(x);
  const mean = num(d?.mean);
  if (!d || mean == null) return null;
  const r = Array.isArray(d.range_50) && d.range_50.length === 2 ? d.range_50.map(num) : null;
  return { mean, lo: r?.[0] ?? null, hi: r?.[1] ?? null };
};
const pct = (p: number) => `${Math.round(p * 100)}%`;
const one = (n: number) => (Math.round(n * 10) / 10).toString();
const range = (d: { lo: number | null; hi: number | null }) => (d.lo != null && d.hi != null ? `; half of simulated games land between ${Math.round(d.lo)} and ${Math.round(d.hi)}` : '');

export function readEnvironment(research: EventResearchDoc | null | undefined, g: Pick<V3Game, 'away' | 'home'>): Environment | null {
  const gsi = rec((research?.extensions as Record<string, unknown> | null)?.game_script_inputs);
  const lines: EnvLine[] = [];
  const env = rec(gsi?.game_environment);
  if (gsi && gsi.state === 'OK' && env) {
    const total = dist(env.total);
    if (total) lines.push({ id: 'total', label: 'Scoring', text: `The simulation averages ${one(total.mean)} total points${range(total)}.`, source: 'simulation' });
    const ap = dist(env.away_points), hp = dist(env.home_points);
    if (ap && hp) lines.push({ id: 'points', label: 'Team points', text: `${g.away.nick} ${one(ap.mean)}, ${g.home.nick} ${one(hp.mean)} on average.`, source: 'simulation' });
    const oneScore = num(env.p_one_score), blow = num(env.p_blowout_17plus);
    if (oneScore != null) lines.push({ id: 'close', label: 'Closeness', text: `${pct(oneScore)} of simulated games end within one score.${blow != null ? ` ${pct(blow)} end in a blowout of 17 or more.` : ''}`, source: 'simulation' });
    const tv = rec(gsi.team_volume);
    const plays = [g.away, g.home].map((t) => ({ t, p: num(rec(rec(tv?.[t.id])?.plays)?.mean), r: num(rec(rec(tv?.[t.id])?.pass_rate)?.mean) }));
    if (plays.every((x) => x.p != null)) lines.push({ id: 'pace', label: 'Pace', text: `Simulated plays: ${plays.map((x) => `${x.t.nick} ${one(x.p!)}`).join(', ')}.`, source: 'simulation' });
    if (plays.every((x) => x.r != null)) lines.push({ id: 'pass', label: 'Pass rate', text: `Simulated share of plays that are passes: ${plays.map((x) => `${x.t.nick} ${pct(x.r!)}`).join(', ')}.`, source: 'simulation' });
  }
  // Season scoring ranks (points per game and points allowed), straight from the matchup rows.
  const rows = new Map((research?.matchup ?? []).map((m) => [shortMetricId(m.metric_id), m]));
  const pf = rows.get('points_for'), pa = rows.get('points_against');
  const side = (m: typeof pf, t: V3Game['away'], s: 'away' | 'home', verb: string) => {
    const o = m?.[s];
    return o && o.value != null ? `${t.nick} ${verb} ${one(o.value)} per game${o.context?.rank && o.context.universe_size ? ` (${ordinal(o.context.rank)} of ${o.context.universe_size})` : ''}` : null;
  };
  const scored = [side(pf, g.away, 'away', 'score'), side(pf, g.home, 'home', 'score')].filter((x): x is string => !!x);
  const allowed = [side(pa, g.away, 'away', 'allow'), side(pa, g.home, 'home', 'allow')].filter((x): x is string => !!x);
  if (scored.length === 2) lines.push({ id: 'pf', label: 'Season offense', text: `${scored.join('; ')}.`, source: 'season' });
  if (allowed.length === 2) lines.push({ id: 'pa', label: 'Season defense', text: `${allowed.join('; ')}.`, source: 'season' });
  if (!lines.length) return null;
  const ns = Array.isArray(gsi?.not_simulated) ? (gsi!.not_simulated as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return { lines, notSimulated: ns };
}
