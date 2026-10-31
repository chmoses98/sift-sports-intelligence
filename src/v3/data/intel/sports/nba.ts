// NBA: what the nba-edge-finder publication states for one game, as Overview research.
//   extensions.raw_projection   the research simulation (points, win probability, pace, offensive and defensive rating of each team, rest, overtime rate)
//   extensions.model_vs_market  the publication's own out-of-sample verdict on that model against the Kalshi price (carried with the number, never dropped)
//   matchup rows                last season's team statistics with league ranks (the table says how old they are)
//   context.injuries            ESPN designations: no team is stated, so a team is named only where the game's own projected players say whose player he is
// Everything is RESEARCH authority by the publication's own words; the market beat the model in the publication's out-of-sample test.
import type { Comparison } from '../build';
import type { Environment, EnvLine } from '../environment';
import type { ModelView } from '../projection';
import { notesFrom, parseParenthetical, teamByPlayer } from './notes';
import type { SportInput, SportRead } from './types';
import { ext, matchupRow, num, one, pct, rec, seasonPairs, sideText, str } from './shared';

const verdictText = (e: Record<string, unknown> | null): string | null => {
  const v = str(rec(e?.model_vs_market)?.verdict);
  // "Model-vs-market (docs/research/market_vs_model.json, out-of-sample walk-forward): the raw Kalshi price has ..." -> the sentence after the colon
  return v ? v.replace(/^[^:]*:\s*/, '').replace(/^./, (c) => c.toUpperCase()).replace(/\s*--\s*/g, '; ') : null;
};

function rawModel(i: SportInput): ModelView | null {
  const e = ext(i.research);
  const rp = rec(e?.raw_projection);
  const ap = num(rp?.away_pts_mean), hp = num(rp?.home_pts_mean), hw = num(rp?.p_home_win);
  // A simulation that did not converge, or whose own inputs are flagged untrusted, is not shown as a view.
  if (!rp || ap == null || hp == null || hw == null || hw < 0 || hw > 1 || rp.converged === false || rp.inputs_trusted === false) return null;
  const verdict = verdictText(e);
  return {
    origin: 'research', version: str(rp.model_version), asOf: str(rp.generated_at) ?? str(i.research.generated_at), asOfKind: 'published',
    awayScore: ap, homeScore: hp, awayWin: 1 - hw, homeWin: hw, total: num(rp.total_mean),
    caveat: `Research only: authority ${String(rp.quality_status ?? 'RESEARCH').toLowerCase()}.${verdict ? ` ${verdict.replace(/\.?$/, '.')}` : ''}`,
    kind: 'research simulation', range: null,
  };
}

function environment(i: SportInput): Environment | null {
  const { g, research } = i;
  const lines: EnvLine[] = [];
  const rp = rec(ext(research)?.raw_projection);
  const sides = (key: string): { a: Record<string, unknown> | null; h: Record<string, unknown> | null } => ({ a: rec(rp?.[`away_${key}`]), h: rec(rp?.[`home_${key}`]) });
  if (rp) {
    const total = num(rp.total_mean), sd = num(rp.total_sd);
    if (total != null) lines.push({ id: 'total', label: 'Scoring', text: `The simulation averages ${one(total)} total points${sd != null ? ` (standard deviation ${one(sd)})` : ''}.`, source: 'simulation' });
    const { a, h } = sides('params');
    const pa = num(a?.pace), ph = num(h?.pace);
    if (pa != null && ph != null) lines.push({ id: 'pace', label: 'Pace', text: `Simulated possessions per game: ${g.away.nick} ${one(pa)}, ${g.home.nick} ${one(ph)}.`, source: 'simulation' });
    const oa = num(a?.off_ppp), da = num(a?.def_ppp), oh = num(h?.off_ppp), dh = num(h?.def_ppp);
    if (oa != null && da != null && oh != null && dh != null) {
      lines.push({ id: 'eff', label: 'Efficiency', text: `Simulated points per 100 possessions, scoring and allowing: ${g.away.nick} ${one(oa * 100)} and ${one(da * 100)}; ${g.home.nick} ${one(oh * 100)} and ${one(dh * 100)}.`, source: 'simulation' });
    }
    const ra = num(a?.rest_days), rh = num(h?.rest_days);
    if (ra != null && rh != null) lines.push({ id: 'rest', label: 'Rest', text: `${g.away.nick} ${ra} days since their last game${a?.b2b === true ? ' (back-to-back)' : ''}, ${g.home.nick} ${rh}${h?.b2b === true ? ' (back-to-back)' : ''}.`, source: 'simulation' });
    const ot = num(rp.ot_rate);
    if (ot != null) lines.push({ id: 'close', label: 'Overtime', text: `${pct(ot)} of simulated games go to overtime.`, source: 'simulation' });
  }
  const both = (id: string, suffix = '') => {
    const m = matchupRow(research, id);
    const a = sideText(m?.away, one, suffix), h = sideText(m?.home, one, suffix);
    return a && h ? `${g.away.nick} ${a}; ${g.home.nick} ${h}` : null;
  };
  const poss = both('team_possessions', ' possessions per game'), tot = both('team_total', ' points per game');
  const off = both('team_off_rtg', ' points per 100'), def = both('team_def_rtg', ' allowed per 100'), net = both('team_net_rtg', ' net per 100');
  const pts = both('team_pts', ' per game'), opp = both('team_opp_pts', ' allowed per game');
  if (poss) lines.push({ id: 'space', label: 'Season pace', text: `${poss}.`, source: 'season' });
  if (off) lines.push({ id: 'soff', label: 'Offensive rating', text: `${off}.`, source: 'season' });
  if (def) lines.push({ id: 'sdef', label: 'Defensive rating', text: `${def}.`, source: 'season' });
  if (net) lines.push({ id: 'snet', label: 'Net rating', text: `${net}.`, source: 'season' });
  if (pts) lines.push({ id: 'pf', label: 'Season scoring', text: `${pts}.`, source: 'season' });
  if (opp) lines.push({ id: 'pa', label: 'Season defense', text: `${opp}.`, source: 'season' });
  if (tot) lines.push({ id: 'tot', label: 'Game environment', text: `Average combined score of their games: ${tot}.`, source: 'season' });
  return lines.length ? { lines, notSimulated: [] } : null;
}

export function readNbaSport(i: SportInput): SportRead | null {
  const { g, research } = i;
  const model = rawModel(i);
  const pairs = seasonPairs(research, g, ['team_net_rtg', 'team_off_rtg', 'team_def_rtg', 'team_possessions', 'team_pts', 'team_opp_pts', 'team_total'], 7);
  const comparison: Comparison | null = pairs.length >= 2 ? { kind: 'ranks', pairs, adjusted: false } : null;
  const designations = parseParenthetical(research, teamByPlayer(g, research));
  const notes = notesFrom(g, research, i.now, designations);
  const placedNone = designations.length > 0 && !notes;
  return {
    model, modelAbsent: model ? null : 'The publication carries no usable simulation for this game (it did not converge, its inputs are flagged untrusted, or none was run).',
    environment: environment(i), comparison, notes, blocks: [],
    reasons: placedNone ? { notes: 'The publication lists injury designations without naming a team, and none of them are among the players it projects for this game, so none are placed on a team.' } : undefined,
  };
}
