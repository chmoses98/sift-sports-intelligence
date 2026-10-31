// NHL: what the NHL-edge-finder publication states for one game, as Overview research.
//   extensions.sim                the research simulation (expected goals, win and overtime probability, total ladder)
//   extensions.family_calibration the settled record of that model against the market (a caveat on the number, never hidden)
//   matchup rows                  the season statistics (goals, expected goals, shot-attempt share, power play and penalty kill) with league ranks
//   context.lineups               the goalie status (projected or confirmed, source, confidence)
//   context.injuries              ESPN designations, named to a team only where the game's own roster says whose player he is
// Everything is RESEARCH_ONLY by the publication's own authority; the matchup findings and the scripts are read by the generic layer (lib/nhl.ts).
import type { SportInput, SportRead } from './types';
import type { Environment, EnvLine } from '../environment';
import type { ModelView } from '../projection';
import { noteItem, notesFrom, parseColon, teamByPlayer } from './notes';
import { arr, ext, matchupRow, num, one, pct, rec, seasonPairs, sideText, str, grp } from './shared';
import type { Comparison } from '../build';

const pct1 = (n: number) => `${(Math.round(n * 1000) / 10).toString()}%`;

function simModel(i: SportInput): ModelView | null {
  const e = ext(i.research);
  const sim = rec(e?.sim);
  const aw = num(sim?.p_away_win), hw = num(sim?.p_home_win), al = num(sim?.away_lambda), hl = num(sim?.home_lambda);
  if (!sim || aw == null || hw == null || aw < 0 || aw > 1 || hw < 0 || hw > 1) return null;
  const cal = rec(rec(e?.family_calibration)?.game_winner);
  const v1 = num(cal?.v1_brier), mk = num(cal?.market_brier), n = num(cal?.n_settled_pregame);
  const record = v1 != null && mk != null && n ? ` On ${grp(n)} settled pregame winner contracts the model’s Brier score was ${v1.toFixed(3)} against the market’s ${mk.toFixed(3)} (lower is better).` : '';
  const frozen = e?.sim_frozen === true ? ' Frozen before puck drop.' : e?.sim_frozen === false ? ' Not frozen: it can still change before puck drop.' : '';
  return {
    origin: 'research', version: str(sim.sim_version), asOf: str(i.research.generated_at), asOfKind: 'published',
    awayScore: al, homeScore: hl, awayWin: aw, homeWin: hw, total: num(sim.total_mean),
    caveat: `Research only: the publication’s authority for this model is ${String(e?.authority ?? 'RESEARCH_ONLY').replace(/_/g, ' ').toLowerCase()}. Scores are expected goals; win probability includes overtime and the shootout.${record}${frozen}`,
    kind: 'research simulation', range: null, unit: 'goals',
  };
}

/** The ladder rung closest to the simulation's mean: "58% of simulations go over 6.5". */
function ladderLine(sim: Record<string, unknown>): string | null {
  const mean = num(sim.total_mean);
  const lad = rec(sim.total_ladder);
  if (mean == null || !lad) return null;
  let best: { line: number; p: number } | null = null;
  for (const [k, v] of Object.entries(lad)) {
    const m = /^over_([\d.]+)$/.exec(k), p = num(v);
    if (!m || p == null) continue;
    const line = Number(m[1]);
    if (!best || Math.abs(line - mean) < Math.abs(best.line - mean)) best = { line, p };
  }
  return best ? `${pct(best.p)} of simulated games go over ${best.line} total goals.` : null;
}

function environment(i: SportInput): Environment | null {
  const { g, research } = i;
  const lines: EnvLine[] = [];
  const sim = rec(ext(research)?.sim);
  if (sim) {
    const mean = num(sim.total_mean);
    if (mean != null) lines.push({ id: 'total', label: 'Scoring', text: `The simulation averages ${one(mean)} total goals. ${ladderLine(sim) ?? ''}`.trim(), source: 'simulation' });
    const al = num(sim.away_lambda), hl = num(sim.home_lambda);
    if (al != null && hl != null) lines.push({ id: 'points', label: 'Expected goals', text: `${g.away.nick} ${one(al)}, ${g.home.nick} ${one(hl)} on average.`, source: 'simulation' });
    const ot = num(sim.p_overtime), so = num(sim.p_shootout), btts = num(sim.p_btts);
    if (ot != null) lines.push({ id: 'close', label: 'Overtime', text: `${pct(ot)} of simulated games go to overtime${so != null ? `, ${pct(so)} to a shootout` : ''}.${btts != null ? ` Both teams score in ${pct(btts)}.` : ''}`, source: 'simulation' });
  }
  const both = (_label: string, id: string, fmt: (n: number) => string, suffix = '') => {
    const m = matchupRow(research, id);
    const a = sideText(m?.away, fmt, suffix), h = sideText(m?.home, fmt, suffix);
    return a && h ? `${g.away.nick} ${a}; ${g.home.nick} ${h}` : null;
  };
  const gf = both('', 'gf_per_game', one, ' goals per game'), ga = both('', 'ga_per_game', one, ' allowed per game');
  if (gf) lines.push({ id: 'pf', label: 'Season scoring', text: `${gf}.`, source: 'season' });
  if (ga) lines.push({ id: 'pa', label: 'Season defense', text: `${ga}.`, source: 'season' });
  const xgf = both('', 'xgf_per60', one, ' xGF/60'), xga = both('', 'xga_per60', one, ' xGA/60');
  if (xgf) lines.push({ id: 'xgf', label: 'Chance creation', text: `${xgf}.`, source: 'season' });
  if (xga) lines.push({ id: 'xga', label: 'Chance prevention', text: `${xga}.`, source: 'season' });
  const corsi = both('', 'corsi_pct', pct1);
  if (corsi) lines.push({ id: 'pace', label: 'Play control', text: `Shot-attempt share, a measure of who has the puck rather than of pace: ${corsi}.`, source: 'season' });
  const pp = both('', 'pp_pct', pct1), pk = both('', 'pk_pct', pct1);
  if (pp) lines.push({ id: 'pp', label: 'Power play', text: `${pp}.`, source: 'season' });
  if (pk) lines.push({ id: 'pk', label: 'Penalty kill', text: `${pk}.`, source: 'season' });
  const rest = (research.context?.notes ?? []).map((n) => /^(home|away) rest days (\d+)/.exec(n)).filter((m): m is RegExpExecArray => !!m);
  const ra = rest.find((m) => m[1] === 'away'), rh = rest.find((m) => m[1] === 'home');
  if (ra && rh) lines.push({ id: 'rest', label: 'Rest', text: `${g.away.nick} ${ra[2]} days, ${g.home.nick} ${rh[2]} days since their last game, per the publication.`, source: 'season' });
  return lines.length ? { lines, notSimulated: [] } : null;
}

function goalieItems(i: SportInput) {
  const out = [];
  for (const l of arr(i.research.context?.lineups)) {
    const x = rec(l);
    if (!x || x.kind !== 'goalie_status') continue;
    const cur = rec(x.current);
    const name = str(cur?.player_name), status = str(cur?.status), team = str(x.team);
    if (!name || !status || (team !== i.g.away.id && team !== i.g.home.id)) continue;
    const conf = num(cur?.confidence);
    const src = str(cur?.source);
    out.push(noteItem(i.research, `goalie-${team}`, team, `${team} starter ${status.toLowerCase()}: ${name}`,
      `${status === 'CONFIRMED' ? 'Confirmed starter.' : 'Not confirmed: the model prices a mix of plausible starters.'}${conf != null ? ` Confidence ${pct(conf)}.` : ''}${src ? ` Source: ${src === 'dailyfaceoff' ? 'DailyFaceoff' : src}.` : ''}`, null));
  }
  return out;
}

export function readNhlSport(i: SportInput): SportRead | null {
  const { g, research } = i;
  const model = simModel(i);
  const env = environment(i);
  const pairs = seasonPairs(research, g, ['xgf_pct', 'gf_per_game', 'ga_per_game', 'xgf_per60', 'xga_per60', 'corsi_pct', 'pp_pct', 'pk_pct', 'points_pct'], 8);
  const comparison: Comparison | null = pairs.length >= 2 ? { kind: 'ranks', pairs, adjusted: false } : null;
  const notes = notesFrom(g, research, i.now, parseColon(research, teamByPlayer(g, research)), goalieItems(i));
  return {
    model, modelAbsent: model ? null : 'The publication carries no simulation for this game.', environment: env, comparison, notes, blocks: [],
    reasons: { environment: 'The publication carries no simulation or season scoring statistics for this game.' },
  };
}
