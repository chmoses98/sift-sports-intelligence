// SCHEME MEETS PLAYERS — a defensive (or offensive) tendency connected to the player whose day it shapes, then to
// that player's published projection, the simulated game script that moves his volume, and the market on him.
//
//   MATCHUP → SCHEME → PLAYER PROJECTION → GAME SCRIPT → MARKET
//
// Each link is an OBSERVATION: a charted tendency with its sample (FTN via nflverse), placed next to the
// publication's own projection for the player (a model output, research only) and the market line. Sift does not
// claim the tendency moves the projection, and it never turns a link into a bet: whether a bet exists is the
// opportunity layer's call, shown separately (validated only when the publication itself flags the contract).
//
// Stacked boxes and RB results: across the league (2026 weeks 1–4), designed runs into 8+ man boxes gained about
// 2.9 yards against 4.3 into lighter boxes, but a defense's stacked-box RATE showed no relationship with the yards
// per carry it allowed (r ≈ 0.0 across 32 teams) and individual backs have a handful of stacked-box carries each.
// So the link states the facts with samples and never adjusts a projection.
import type { EventResearchDoc } from '../contract/types';
import { schemeFor, type SchemeValue } from '../history/team';
import type { PlayerHistoryDoc, TeamHistoryDoc, TeamWeek } from '../history/types';
import { extremeWord } from '../lib/rank';
import { nameKey } from './context';
import type { GameSides, Side } from './game';
import type { PropCard } from './props';

export type LinkKind = 'box' | 'blitz' | 'proe';

export interface LinkPlayer {
  pid: string;
  name: string;
  role: string | null;
}

export interface LinkProjection {
  label: string;
  mean: number;
  typical: [number, number] | null;
  unit: string;
  /** The prop stat key used by the props explorer (rushing_yards, passing_yards, receiving_yards). */
  stat: string;
}

export interface SchemeLink {
  id: string;
  kind: LinkKind;
  offense: Side;
  defense: Side;
  headline: string;
  /** The tendency itself: "TB put 8+ defenders in the box on 24% of runs — the NFL's highest rate". */
  scheme: string;
  sample: string;
  /** The facts that connect it to the player (team and player splits with samples). */
  evidence: string[];
  player: LinkPlayer | null;
  projection: LinkProjection | null;
  /** The simulated game script that moves the player's volume, in one sentence (published simulation). */
  script: string | null;
  /** The player's priced prop for the stat, when the game has one. */
  prop: PropCard | null;
  /** 0..1: how unusual the tendency is (extreme ranks first). */
  score: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const signed2 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
const volume = (r: EventResearchDoc, abbr: string) => (r.extensions as any)?.game_script_inputs?.team_volume?.[abbr] ?? null;

function lead(r: EventResearchDoc, team: Side, roles: string[], metric: string): { p: LinkPlayer; mean: number; typical: [number, number] | null } | null {
  const rows = r.players
    .filter((p) => p.team_id === team.pid && roles.includes(p.role ?? ''))
    .map((p) => ({ p, d: r.distributions.find((d) => d.entity_id === p.participant_id && d.metric_id === metric) }))
    .filter((x) => x.d?.mean != null)
    .sort((a, b) => (b.d!.mean as number) - (a.d!.mean as number));
  const x = rows[0];
  if (!x) return null;
  const q = x.d!.quantiles;
  return { p: { pid: x.p.participant_id, name: x.p.display_name, role: x.p.role ?? null }, mean: x.d!.mean as number, typical: q?.p25 != null && q?.p75 != null ? [q.p25, q.p75] : null };
}

const before = (doc: TeamHistoryDoc, team: string, week: number): TeamWeek[] => (doc.teams[team]?.weeks ?? []).filter((w) => w.week < week);

function boxSplit(weeks: TeamWeek[]) {
  let sn = 0; let sy = 0; let ln = 0; let ly = 0; let ok = weeks.length > 0;
  for (const w of weeks) {
    const u = w.off;
    if (u.stacked_box_rush_yds == null || u.light_box_rushes == null || u.light_box_rush_yds == null) ok = false;
    sn += u.stacked_box_rushes; sy += u.stacked_box_rush_yds ?? 0; ln += u.light_box_rushes ?? 0; ly += u.light_box_rush_yds ?? 0;
  }
  return ok ? { sn, sy, ln, ly } : null;
}

const findProp = (props: PropCard[], pid: string | undefined, stat: string) => props.find((c) => c.playerId === pid && c.stat === stat) ?? null;
const histFor = (hist: Map<string, PlayerHistoryDoc | null> | undefined, name: string, team: string) => hist?.get(`${nameKey(name)}|${team}`) ?? null;
const rateRank = (v: SchemeValue) => (v.rank != null ? `the NFL's ${extremeWord(v.rank, v.of).toLowerCase()} rate (#${v.rank} of ${v.of})` : 'not ranked');

/** Stacked boxes against the offense's lead back. */
export function boxLink(r: EventResearchDoc, g: GameSides, doc: TeamHistoryDoc, offense: Side, props: PropCard[], hist?: Map<string, PlayerHistoryDoc | null>): SchemeLink | null {
  if (g.week == null) return null;
  const defense = g.opp(offense.abbr);
  const box = schemeFor(doc, 'stacked_box_rate', defense.abbr, g.week);
  if (!box || box.rank == null || box.value == null) return null;
  const rb = lead(r, offense, ['RB'], 'met_nfl.sim_carries');
  const rbYds = rb ? r.distributions.find((d) => d.entity_id === rb.p.pid && d.metric_id === 'met_nfl.sim_rushing_yards') : null;
  const heavy = box.rank <= 6;
  const light = box.rank > box.of - 6;
  const evidence: string[] = [];
  const own = boxSplit(before(doc, offense.abbr, g.week));
  if (own && own.sn + own.ln > 0) {
    evidence.push(`${offense.nick} designed runs this season: ${own.sn ? `${r1(own.sy / own.sn)} yards a carry into 8+ man boxes (${own.sn} runs)` : 'no runs charted into 8+ man boxes'}, ${own.ln ? `${r1(own.ly / own.ln)} into lighter boxes (${own.ln} runs)` : 'none into lighter boxes'}.`);
  }
  const league = Object.keys(doc.teams).map((t) => boxSplit(before(doc, t, g.week!))).filter((x): x is NonNullable<typeof x> => !!x);
  const L = league.reduce((a, x) => ({ sn: a.sn + x.sn, sy: a.sy + x.sy, ln: a.ln + x.ln, ly: a.ly + x.ly }), { sn: 0, sy: 0, ln: 0, ly: 0 });
  if (L.sn >= 50 && L.ln >= 50) evidence.push(`League-wide: ${r1(L.sy / L.sn)} yards a carry into 8+ man boxes against ${r1(L.ly / L.ln)} into lighter ones (${L.sn} and ${L.ln} charted runs).`);
  const h = rb ? histFor(hist, rb.p.name, offense.abbr) : null;
  const vb = h?.vs_box;
  if (rb && vb) {
    evidence.push(vb.car_stacked >= 15
      ? `${rb.p.name}: ${r1(vb.yds_stacked / vb.car_stacked)} yards a carry into 8+ man boxes (${vb.car_stacked} carries), ${vb.car_light ? r1(vb.yds_light / vb.car_light) : '—'} otherwise (${vb.car_light}).`
      : `${rb.p.name} has only ${vb.car_stacked} charted carries into 8+ man boxes — too few to read on his own.`);
  }
  const tv = volume(r, offense.abbr);
  const lead14 = tv?.by_final_margin?.['lead14+']?.rush_att_mean;
  const trail14 = tv?.by_final_margin?.['trail14+']?.rush_att_mean;
  const script = lead14 != null && trail14 != null
    ? `In the simulation the ${offense.nick} run ${Math.round(lead14)} times in games they win by 14+, ${Math.round(trail14)} when they trail by 14+ — game script moves his carries more than the box does.`
    : null;
  return {
    id: `box:${offense.abbr}`,
    kind: 'box',
    offense, defense,
    headline: heavy ? `${defense.nick} load the box${rb ? ` — ${rb.p.name}'s carries` : ''}` : light ? `${defense.nick} rarely stack the box${rb ? ` — room for ${rb.p.name}` : ''}` : `${defense.nick} box counts are league-typical`,
    scheme: `${defense.nick} put 8+ defenders in the box on ${pct(box.value)} of designed runs — ${rateRank(box)}.`,
    sample: `${box.n} charted runs faced`,
    evidence,
    player: rb?.p ?? null,
    projection: rb ? { label: rbYds ? 'Rushing yards' : 'Carries', mean: rbYds?.mean ?? rb.mean, typical: rbYds?.quantiles?.p25 != null && rbYds.quantiles.p75 != null ? [rbYds.quantiles.p25, rbYds.quantiles.p75] : null, unit: rbYds ? 'yds' : 'carries', stat: 'rushing_yards' } : null,
    script,
    prop: findProp(props, rb?.p.pid, 'rushing_yards'),
    score: heavy ? 0.5 + (7 - box.rank) / 12 : light ? 0.35 + (box.rank - (box.of - 6)) / 14 : 0.1,
  };
}

/** Blitz frequency against the offense's quarterback (and his backs, when they catch more against the blitz). */
export function blitzLink(r: EventResearchDoc, g: GameSides, doc: TeamHistoryDoc, offense: Side, props: PropCard[], hist?: Map<string, PlayerHistoryDoc | null>): SchemeLink | null {
  if (g.week == null) return null;
  const defense = g.opp(offense.abbr);
  const blitz = schemeFor(doc, 'blitz_rate', defense.abbr, g.week);
  if (!blitz || blitz.rank == null || blitz.value == null) return null;
  const qb = lead(r, offense, ['QB'], 'met_nfl.sim_passing_yards');
  const heavy = blitz.rank <= 6;
  const shy = blitz.rank > blitz.of - 6;
  const evidence: string[] = [];
  const team = schemeFor(doc, 'epa_vs_blitz', offense.abbr, g.week);
  if (team?.value != null && team.rank != null) evidence.push(`${offense.nick} against the blitz: ${signed2(team.value)} EPA per dropback (#${team.rank} of ${team.of}, ${team.n} blitzed dropbacks).`);
  const h = qb ? histFor(hist, qb.p.name, offense.abbr) : null;
  const vb = h?.vs_blitz;
  if (qb && vb && vb.dropbacks_blitz >= 20 && vb.epa_per_db_blitz != null && vb.epa_per_db_no_blitz != null) {
    evidence.push(`${qb.p.name}: ${signed2(vb.epa_per_db_blitz)} EPA per dropback when blitzed (${vb.dropbacks_blitz}), ${signed2(vb.epa_per_db_no_blitz)} when not (${vb.dropbacks_no_blitz}).`);
  }
  const q = ((r.extensions as any)?.quarterbacks?.[offense.abbr] ?? []).find((x: any) => qb && nameKey(x.player) === nameKey(qb.p.name));
  const up = q?.profile?.under_pressure?.epa_per_dropback;
  const clean = q?.profile?.clean_pocket?.epa_per_dropback;
  if (up != null && clean != null && !q.profile.insufficient_sample) evidence.push(`${q.player} under pressure: ${signed2(up)} EPA per dropback, ${signed2(clean)} from a clean pocket (publication profile).`);
  const tv = volume(r, offense.abbr);
  const db = tv?.dropbacks?.mean;
  const trail = tv?.by_final_margin?.['trail7-13']?.pass_att_mean;
  const lead7 = tv?.by_final_margin?.['lead7-13']?.pass_att_mean;
  const script = db != null && trail != null && lead7 != null
    ? `Projected for ${Math.round(db)} dropbacks; in simulated games they trail by 7–13 the ${offense.nick} throw ${Math.round(trail)} passes, ${Math.round(lead7)} when they lead by 7–13.`
    : null;
  return {
    id: `blitz:${offense.abbr}`,
    kind: 'blitz',
    offense, defense,
    headline: heavy ? `${defense.nick} blitz often${qb ? ` — ${qb.p.name} under fire` : ''}` : shy ? `${defense.nick} rarely blitz${qb ? ` — ${qb.p.name} gets clean looks` : ''}` : `${defense.nick} blitz at a league-typical rate`,
    scheme: `${defense.nick} send a blitz on ${pct(blitz.value)} of dropbacks — ${rateRank(blitz)}.`,
    sample: `${blitz.n} charted dropbacks faced`,
    evidence,
    player: qb?.p ?? null,
    projection: qb ? { label: 'Passing yards', mean: qb.mean, typical: qb.typical, unit: 'yds', stat: 'passing_yards' } : null,
    script,
    prop: findProp(props, qb?.p.pid, 'passing_yards'),
    score: heavy ? 0.55 + (7 - blitz.rank) / 12 : shy ? 0.3 + (blitz.rank - (blitz.of - 6)) / 14 : 0.1,
  };
}

/** A pass-heavy (or run-heavy) offense, by the publication's own pass rate over expected, and its lead receiver. */
export function proeLink(r: EventResearchDoc, g: GameSides, offense: Side, offProfile: { metrics: { metric_id: string; value: number | null; split?: unknown; context?: { rank: number | null; universe_size: number | null } | null }[] } | null | undefined, defProfile: typeof offProfile, props: PropCard[]): SchemeLink | null {
  const defense = g.opp(offense.abbr);
  const o = offProfile?.metrics.find((m) => m.metric_id === 'met_nfl.adj_off_proe' && !m.split);
  if (!o?.context?.rank || !o.context.universe_size || o.value == null) return null;
  const n = o.context.universe_size;
  const passy = o.context.rank <= 6;
  const runny = o.context.rank > n - 6;
  if (!passy && !runny) return null;
  const d = defProfile?.metrics.find((m) => m.metric_id === 'met_nfl.adj_def_proe' && !m.split);
  const wr = lead(r, offense, ['WR', 'TE'], 'met_nfl.sim_receiving_yards');
  const evidence: string[] = [];
  if (d?.context?.rank != null && d.value != null) evidence.push(`Opponents throw ${d.value >= 0 ? 'more' : 'less'} than expected against the ${defense.nick} (opponent-adjusted, #${d.context.rank} of ${d.context.universe_size}, #1 = most passing against).`);
  const tv = volume(r, offense.abbr);
  const rate = tv?.pass_rate?.mean;
  const script = rate != null ? `The simulation has the ${offense.nick} passing on ${pct(rate)} of plays; it rises when they trail and falls when they lead.` : null;
  return {
    id: `proe:${offense.abbr}`,
    kind: 'proe',
    offense, defense,
    headline: passy ? `${offense.nick} throw more than expected${wr ? ` — ${wr.p.name}'s volume` : ''}` : `${offense.nick} run more than expected${wr ? ` — fewer targets to go round` : ''}`,
    scheme: `${offense.nick} pass rate over expected on early downs: ${o.value >= 0 ? '+' : '−'}${Math.abs(o.value).toFixed(1)} pts vs league average (opponent-adjusted, #${o.context.rank} of ${n}, #1 = most pass-heavy).`,
    sample: 'Publication rating · opponent-adjusted',
    evidence,
    player: wr?.p ?? null,
    projection: wr ? { label: 'Receiving yards', mean: wr.mean, typical: wr.typical, unit: 'yds', stat: 'receiving_yards' } : null,
    script,
    prop: findProp(props, wr?.p.pid, 'receiving_yards'),
    score: passy ? 0.3 + (7 - o.context.rank) / 20 : 0.25,
  };
}

/** Every link for a game, most unusual first; league-typical tendencies sink to the end. */
export function schemePlayerLinks(
  r: EventResearchDoc, g: GameSides, doc: TeamHistoryDoc | null, props: PropCard[],
  profiles: { home?: Parameters<typeof proeLink>[3]; away?: Parameters<typeof proeLink>[3] },
  hist?: Map<string, PlayerHistoryDoc | null>,
): SchemeLink[] {
  const out: SchemeLink[] = [];
  for (const off of [g.away, g.home]) {
    const def = g.opp(off.abbr);
    if (doc) {
      const b = boxLink(r, g, doc, off, props, hist);
      if (b) out.push(b);
      const z = blitzLink(r, g, doc, off, props, hist);
      if (z) out.push(z);
    }
    const p = proeLink(r, g, off, off.home ? profiles.home : profiles.away, def.home ? profiles.home : profiles.away, props);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.score - a.score);
}
