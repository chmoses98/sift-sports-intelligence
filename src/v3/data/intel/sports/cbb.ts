// CBB: what the cbb-edge-finder publication states for one game, as Overview research. Everything comes from `extensions.cbb` (docs/SIFT_APP.md of the
// publisher), translated by the publisher from its immutable pre-tip projection archive and its roster truth.
//   models (primary version)   tempo (possessions), points per possession of each team, the total and margin ranges: ONLY when the game has been projected
//   roster                     each team's roster confidence, continuity and expected rotation: when the publisher has a roster for it
//   site, conference game      context the publisher states
// A game outside the prospective capture window carries no projection: tempo and efficiency are then absent with the publisher's own message, and
// nothing is estimated in their place. (The frozen projection itself is read by data/intel/projection.ts.)
import type { EventResearchDoc } from '../../../../contract/types';
import { researchExt, type ModelRow, type TeamRoster } from '../../../../views/cbb/data';
import type { Environment, EnvLine } from '../environment';
import type { SportBlock, SportInput, SportRead, SportRow } from './types';
import { dayClock } from '../../../model/time';
import { num, one, pct, two } from './shared';

const primaryRow = (r: EventResearchDoc): ModelRow | null => {
  const c = researchExt(r);
  if (!c || c.projection_state !== 'PROJECTED') return null;
  return c.models_detail.find((m) => m.version === c.primary_version) ?? c.models_detail[0] ?? null;
};

function environment(i: SportInput): Environment | null {
  const { g, research } = i;
  const m = primaryRow(research);
  if (!m) return null;
  const lines: EnvLine[] = [];
  const asOf = m.as_of ? Date.parse(m.as_of) : NaN;
  const poss = num(m.possessions), hp = num(m.home_ppp), ap = num(m.away_ppp), tot = num(m.total);
  if (tot != null) lines.push({ id: 'total', label: 'Scoring', text: `The projection has ${one(tot)} total points${m.total_range_80 ? `; an 80% range of ${Math.round(m.total_range_80[0])} to ${Math.round(m.total_range_80[1])}` : ''}.`, source: 'model' });
  if (poss != null) lines.push({ id: 'pace', label: 'Tempo', text: `${one(poss)} possessions projected.`, source: 'model' });
  if (hp != null && ap != null) lines.push({ id: 'eff', label: 'Efficiency', text: `Projected points per possession: ${g.away.nick} ${two(ap)}, ${g.home.nick} ${two(hp)}.`, source: 'model' });
  const mg = num(m.margin);
  if (mg != null) lines.push({ id: 'close', label: 'Margin', text: `${g.home.nick} by ${one(mg)} (home minus away)${m.margin_range_80 ? `, 80% range ${Math.round(m.margin_range_80[0])} to ${Math.round(m.margin_range_80[1])}` : ''}.`, source: 'model' });
  return lines.length ? { lines, notSimulated: [], foot: `Frozen pre-tip projection ${m.version}${asOf ? `, recorded ${dayClock(asOf, i.now, undefined, ', ')}` : ''}. Research, not a recommendation.` } : null;
}

const CONF_WORD: Record<string, string> = { CONFIRMED: 'confirmed', LIKELY: 'likely', CONFLICTED: 'conflicted', STALE: 'out of date', UNKNOWN: 'unknown' };

function rosterRows(t: { nick: string }, side: 'away' | 'home', r: TeamRoster | null | undefined): SportRow[] {
  if (!r) return [];
  if (!r.available) return [{ id: `ro-${side}`, label: `${t.nick} roster`, source: 'status', text: `Not available${r.reason_text ? `: ${r.reason_text}` : ''}.` }];
  const rows: SportRow[] = [];
  const cont = r.continuity;
  const ret = cont?.returning_minutes_share;
  rows.push({
    id: `ro-${side}`, label: `${t.nick} roster`, source: 'status',
    text: `Roster ${CONF_WORD[r.confidence] ?? r.confidence.toLowerCase()}${ret != null ? `; ${pct(ret)} of last season’s minutes return` : ''}${cont?.first_d1_expected_to_play ? `; ${Math.round(cont.first_d1_expected_to_play)} first-year Division I players expected to play` : ''}.`,
  });
  const rot = (r.expected_rotation ?? []).slice(0, 5);
  if (rot.length && r.rotation_valid !== false) {
    rows.push({ id: `rot-${side}`, label: `${t.nick} expected rotation`, source: 'status', text: rot.map((p) => `${p.name ?? 'Unnamed'}${p.position ? ` (${p.position})` : ''} ${p.minutes != null ? `${Math.round(p.minutes)} min` : ''}`.trim()).join('; ') + '.' });
  }
  return rows;
}

function blocks(i: SportInput): SportBlock[] {
  const c = researchExt(i.research);
  if (!c) return [];
  const out: SportBlock[] = [];
  const ctx: SportRow[] = [];
  const site = c.neutral_site ? 'Neutral site' : 'Home game for the listed home team';
  ctx.push({ id: 'site', label: 'Site', source: 'status', text: `${site}${c.venue?.name ? `: ${c.venue.name}${c.venue.city ? `, ${c.venue.city}` : ''}` : ''}.` });
  if (c.conference_game) ctx.push({ id: 'conf', label: 'Conference game', source: 'status', text: `Both teams are in ${c.conferences?.home ?? 'the same conference'}.` });
  out.push({ id: 'context', title: 'Game context', note: 'published by the CBB publication', rows: ctx });
  const roster = [...rosterRows(i.g.away, 'away', c.roster?.away), ...rosterRows(i.g.home, 'home', c.roster?.home)];
  if (roster.length) out.push({ id: 'roster', title: 'Rosters and rotation', note: 'published status', rows: roster, foot: `${c.roster?.basis_text ?? ''} The expected-rotation minutes are the publisher’s; a player among the five highest is not a confirmed starter.`.trim() });
  return out;
}

export function readCbbSport(i: SportInput): SportRead | null {
  const c = researchExt(i.research);
  if (!c) return null;
  const env = environment(i);
  return {
    environment: env, blocks: blocks(i),
    reasons: {
      environment: env ? undefined : `Tempo and efficiency are published only with the pre-tip projection. ${c.projection_message ?? ''}`.trim(),
      advantages: 'College basketball publishes no matchup statistics with ranks for games yet.', notes: 'The publication lists no injuries for college basketball; rosters are under Rosters and rotation.',
    },
  };
}
