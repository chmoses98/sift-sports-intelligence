// The CFB Script Engine game page, as a story a new reader gets in seconds. Pure: every rule here is over the decoded payload (src/lib/scriptEngine.ts) and the
// existing script model (model/scriptRead.ts); nothing is added that the engine did not publish.
//   * The hero is the PRIMARY script: the payload's own headline, the way the payload ranks it (it publishes NO probability: `probability: null`), the historical
//     frequency the V2 claim states when one applies (a count of past games, never a chance), 2-3 short reasons (the script's own causal chain) and the one
//     expression the engine calls best for that script.
//   * Each scenario carries why it happens, what would break it and the contracts that express it, each tied to the matchup statistic that supports it.
//   * Scoring contracts (total, team total) are research only (band_authority UNCALIBRATED_DESCRIPTIVE): they are offered as research links with the descriptive
//     range the payload stored, never as supported or contradicted.
//   * "Havoc" is never an input and never displayed as evidence: metrics, findings and component edges that rest on it are filtered out here.
import type { Market } from '../../contract/types';
import {
  bandText, findingByCode, historicalWinsText, metricAt, seasonsText, signedPoints, winsWhenText, type Engine, type EngineScript, type Expression, type Finding, type HistoricalRange,
} from '../../lib/scriptEngine';
import { scriptMarketCards, type ScriptMarketCard } from '../../lib/scriptMarkets';
import { formatUnitValue, sportUnit } from '../../insights/sportUnits';
import { isHavoc, usableFinding, usableMetric } from './havoc';
import { findingLabel, scriptCards, whyBet, type ScriptCard } from './scriptRead';

// ------------------------------------------------------------------ havoc is not evidence

export { isHavoc, usableFinding, usableMetric };

// ------------------------------------------------------------------ likelihood language

export interface Likelihood {
  /** "Ranked 1 of 2 by matchup evidence": how the engine orders its scripts. */
  rank: string;
  /** The payload publishes no probability for a script; this says so in one sentence. */
  statement: string;
  /** The V2 claim's historical frequency when it applies to this script's side: a count of past games and the payload's own caveat. Null when none applies. */
  historical: { text: string; caveat: string; range: string | null } | null;
}

const NO_PROBABILITY = 'The engine publishes no probability for a game script, only this order.';

/** The control claim's history applies to a script whose archetype is the same side's CONTROL. */
function controlHistory(engine: Engine, s: EngineScript): { r: HistoricalRange; team: string; side: 'home' | 'away' } | null {
  const c = engine.claimsV2?.claims.control;
  const r = c?.historical_range;
  if (!c || !r || s.lead_side !== c.side || !/CONTROL$/.test(s.archetype)) return null;
  return { r, team: engine.teams[c.side].name, side: c.side };
}

export function likelihoodOf(engine: Engine, s: EngineScript): Likelihood {
  const h = controlHistory(engine, s);
  const rank = `Ranked ${s.rank} of ${engine.scripts.length} by matchup evidence`;
  if (!h) return { rank, statement: NO_PROBABILITY, historical: null };
  const { r, team } = h;
  const margin = r.central_50 ? `${team} margin ${signedPoints(r.central_50[0])} to ${signedPoints(r.central_50[1])} in the middle half of them` : null;
  return {
    rank, statement: NO_PROBABILITY,
    historical: { text: `Past games with the same claim: ${team} won ${historicalWinsText(r)} (${seasonsText(r.development_seasons)}).`, caveat: 'A historical frequency, not this game’s chance to win.', range: margin },
  };
}

// ------------------------------------------------------------------ evidence lines

export interface EvidenceLine {
  ref: string;
  team: string;
  unit: 'offense' | 'defense';
  name: string;
  value: string;
  /** "adjusted" (opponent-adjusted) or "raw" (not adjusted): never blended. */
  basis: 'adjusted' | 'raw';
  rank: string | null;
  games: number;
  quality: string;
  /** Stated as regression-prone or secondary in the metric registry: noted next to the number. */
  caution: string | null;
}

export function evidenceLine(engine: Engine, ref: string): EvidenceLine | null {
  const row = metricAt(engine, ref);
  if (!row || !usableMetric(row)) return null;
  const reg = engine.registry[row.metric_id];
  const u = sportUnit(row.metric_id, reg, 'CFB');
  const adj = row.adjusted_available;
  return {
    ref, team: row.team, unit: row.unit, name: reg?.name ?? row.metric_id.replace(/_/g, ' '), value: formatUnitValue(adj ? row.adjusted : row.raw, u), basis: adj ? 'adjusted' : 'raw',
    rank: row.rank ? `#${row.rank} of ${row.universe_size}` : null, games: row.games, quality: row.quality,
    caution: reg?.regression_prone ? 'regression-prone' : reg?.secondary_evidence ? 'secondary evidence' : null,
  };
}

const findingsOf = (engine: Engine, codes: string[]): Finding[] => [...new Set(codes)].map((c) => findingByCode(engine, c)).filter((f): f is Finding => !!f && usableFinding(f));

/**
 * The matchup statistics behind a script: the metrics its required, then supporting, findings cite, havoc excluded. They come in pairs, the leading team's offense and the
 * defense it faces on the same metric, so a reader sees the mismatch itself; the opposite direction (the underdog's offense) follows.
 */
export function supportLines(engine: Engine, s: EngineScript, limit = 4): EvidenceLine[] {
  const fs = findingsOf(engine, [...s.required_findings, ...s.supporting_findings]);
  const lead = s.lead_side;
  const refs = [...new Set(fs.flatMap((f) => f.metric_refs))];
  const metric = (ref: string) => ref.split('.').slice(2).join('.');
  const ordered: string[] = [];
  if (lead) {
    const other = lead === 'home' ? 'away' : 'home';
    for (const m of [...new Set(refs.map(metric))]) {
      for (const r of [`${lead}.offense.${m}`, `${other}.defense.${m}`]) if (refs.includes(r)) ordered.push(r);
    }
  }
  for (const r of refs) if (!ordered.includes(r)) ordered.push(r);
  return ordered.map((r) => evidenceLine(engine, r)).filter((l): l is EvidenceLine => !!l).slice(0, limit);
}

/** The one-line mismatch behind a script: its leading offense against the defense it faces, on the same metric. Null when the tables are not on the page. */
export function headStat(lines: EvidenceLine[]): string | null {
  const off = lines.find((l) => l.unit === 'offense');
  if (!off) return lines[0] ? `${lines[0].team} ${lines[0].unit}, ${lines[0].name}: ${lines[0].value} ${lines[0].basis}${lines[0].rank ? `, ${lines[0].rank}` : ''}` : null;
  const def = lines.find((l) => l.unit === 'defense' && l.name === off.name && l.team !== off.team);
  const part = (l: EvidenceLine) => `${l.value} ${l.basis === 'adjusted' ? 'adj.' : 'raw'}${l.rank ? ` (${l.rank})` : ''}`;
  return `${off.team} offense ${off.name.toLowerCase()} ${part(off)}${def ? ` against ${def.team} defense ${part(def)}` : ''}`;
}

// ------------------------------------------------------------------ why it happens, what breaks it

/** Three plain sentences: the script's causal chain, each step once (steps repeat the same finding, so repeated sentences are dropped). */
export function whyHappens(card: ScriptCard, limit = 3): string[] {
  return [...new Set(card.steps.map((s) => s.step.trim()).filter(Boolean))].slice(0, limit);
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The first sentence of a script's summary. */
const lead = (s: EngineScript) => s.summary.split(/(?<=[.!?])\s/)[0];

/**
 * What could invalidate a script, only from the payload: the findings that cut against it, the other scripts that take the game elsewhere (the Danger path first),
 * regression-prone or secondary statistics its evidence rests on, and the evidence limits the engine itself lists. Never empty: it falls back to what the engine says it does not know.
 */
export function whatBreaks(engine: Engine, card: ScriptCard, limit = 4): string[] {
  const s = card.script;
  const out: string[] = [];
  for (const f of s.contradicting_findings.map((c) => findingByCode(engine, c)).filter((f): f is Finding => !!f && usableFinding(f))) out.push(f.statement);
  const others = engine.scripts.filter((x) => x.script_id !== s.script_id);
  const danger = others.find((x) => x.role === 'DANGER');
  if (s.role === 'DANGER') {
    const primary = engine.scripts.find((x) => x.role === 'PRIMARY');
    if (primary) out.push(`The primary script holds instead: ${lead(primary)}`);
  } else if (danger) out.push(`The danger path: ${lead(danger)}`);
  const alt = others.find((x) => x.role === 'ALTERNATE' || x.role === 'SECONDARY');
  if (alt && s.role === 'PRIMARY') out.push(`The ${alt.role === 'ALTERNATE' ? 'alternate' : 'secondary'} path: ${lead(alt)}`);
  const cautious = supportLines(engine, s, 8).filter((l) => l.caution);
  if (cautious.length) out.push(`Part of its evidence is ${cautious[0].caution}: ${cautious[0].team} ${cautious[0].unit}, ${cautious[0].name}.`);
  if (s.data_confidence !== 'HIGH') out.push(`The football data behind this script is ${s.data_confidence.toLowerCase()} confidence.`);
  for (const r of engine.confidence.reasons) if (out.length < limit) out.push(r);
  if (!out.length) out.push(engine.confidence.unknown[0] ?? 'Nothing published cuts against it.');
  return out.slice(0, limit).map(cap);
}

// ------------------------------------------------------------------ scenarios

export interface Scenario {
  card: ScriptCard;
  likelihood: Likelihood;
  why: string[];
  support: EvidenceLine[];
  /** The leading offense against the defense it faces, in one line. */
  head: string | null;
  breaks: string[];
}

export function scenarios(engine: Engine): Scenario[] {
  return scriptCards(engine).map((card) => ({
    card, likelihood: likelihoodOf(engine, card.script), why: whyHappens(card), support: supportLines(engine, card.script, 4), head: headStat(supportLines(engine, card.script, 4)), breaks: whatBreaks(engine, card),
  }));
}

// ------------------------------------------------------------------ markets for a scenario

/** A total or team-total contract and what the payload's DESCRIPTIVE band for this script says about it (research only). */
export interface ScoringPick {
  e: Expression;
  market: Market | undefined;
  /** "Illinois points ≥ 11": the settlement in team names. */
  label: string;
  /** What the descriptive band would say, never a support claim. */
  relation: 'covers' | 'partly' | 'against';
  band: string | null;
  /** The scoring matchup behind the line: the team's offense points per game against the defense it faces (null when the tables are not on the page). */
  stat: string | null;
}

const THRESHOLD = /(>=|<=|between)\s*(-?\d+(?:\.\d+)?)/;
const thresholdOf = (e: Expression): number => Number(e.wins_when?.match(THRESHOLD)?.[2] ?? NaN);

/**
 * The scoring contracts the script's descriptive point ranges relate to, as research links. Per thesis (a team's over, a team's under) it keeps the rung nearest the
 * edge of the range (the highest "over" line the range still covers, the lowest "under"), so the list names the boundary, not a ladder. The relation is the
 * payload's `research` code for that script ("what an uncalibrated band would have said"); it is labelled research only and never a support claim.
 */
export function scoringPicks(engine: Engine, s: EngineScript, markets: Map<string, Market>, limit = 3): ScoringPick[] {
  const i = engine.scripts.indexOf(s);
  if (i < 0) return [];
  const cands = engine.expressions.filter((e) => e.authority === 'RESEARCH_UNCALIBRATED' && (e.research[i] === 'SUPPORTED' || e.research[i] === 'PARTIAL') && markets.has(e.ticker));
  const byThesis = new Map<string, Expression[]>();
  for (const e of cands) byThesis.set(e.thesis, [...(byThesis.get(e.thesis) ?? []), e]);
  const out: ScoringPick[] = [];
  for (const [thesis, list] of byThesis) {
    const over = /over/.test(thesis);
    const full = list.filter((e) => e.research[i] === 'SUPPORTED');
    const sorted = (full.length ? full : list).filter((e) => Number.isFinite(thresholdOf(e))).sort((a, b) => (over ? thresholdOf(b) - thresholdOf(a) : thresholdOf(a) - thresholdOf(b)));
    const e = sorted[0] ?? (full.length ? full : list)[0];
    const m = markets.get(e.ticker);
    const side = /home/.test(thesis) ? 'home_points' : /away/.test(thesis) ? 'away_points' : 'total_points';
    const own = /home/.test(thesis) ? 'home' : /away/.test(thesis) ? 'away' : null;
    const ppg = own ? [evidenceLine(engine, `${own}.offense.points_per_game`), evidenceLine(engine, `${own === 'home' ? 'away' : 'home'}.defense.points_per_game`)].filter((l): l is EvidenceLine => !!l) : [];
    out.push({ e, market: m, stat: ppg.length ? headStat(ppg) : null, label: (e.wins_when ?? e.ticker).replace(/full game home points/, `${engine.teams.home.name} points`).replace(/full game away points/, `${engine.teams.away.name} points`).replace(/full game total points/, 'Total points').replace(/>=/, '≥').replace(/<=/, '≤'), relation: e.research[i] === 'SUPPORTED' ? 'covers' : 'partly', band: bandText(s.outcome_shape.bands[side as 'home_points']) });
  }
  return out.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === 'covers' ? -1 : 1)).slice(0, limit);
}

export interface ScenarioMarkets {
  /** Margin and winner contracts the engine supports for this script (calibrated: moneyline, spread). */
  core: ScriptMarketCard[];
  /** Total and team-total contracts, research only. */
  scoring: ScoringPick[];
  /** True when the script states a total range or environment; a game total is offered only then, as research. */
  statesTotal: boolean;
}

export function scenarioMarkets(engine: Engine, s: EngineScript, markets: Map<string, Market>): ScenarioMarkets {
  const core = scriptMarketCards(engine, s.script_id, markets, 3).filter((c) => !c.researchOnly);
  return { core, scoring: scoringPicks(engine, s, markets), statesTotal: s.outcome_shape.bands.total_points != null || s.outcome_shape.total_environment !== 'NOT_STATED' };
}

/** The one expression the hero shows: the engine's Best expression among those that support the primary, else its first supported one. */
export function heroExpression(engine: Engine, markets: Map<string, Market>): ScriptMarketCard | null {
  const p = engine.scripts[0];
  if (!p) return null;
  const cards = scriptMarketCards(engine, p.script_id, markets, 8).filter((c) => !c.researchOnly && c.compat === 'SUPPORTED');
  return cards.find((c) => c.labels.includes('BEST_EXPRESSION')) ?? cards[0] ?? null;
}

// ------------------------------------------------------------------ the hero

export interface Hero {
  headline: string;
  script: Scenario | null;
  /** 2-3 key reasons: the primary script's own steps. */
  reasons: string[];
  /** The engine states a scoring environment or pace claim worth a chip beside the hero. */
  chips: string[];
}

export function heroOf(engine: Engine): Hero {
  const all = scenarios(engine);
  const primary = all.find((x) => x.card.script.role === 'PRIMARY') ?? null;
  const cl = engine.claimsV2?.claims;
  const chips: string[] = [];
  if (cl?.pace) chips.push(cl.pace.level === 'HIGH' ? 'Faster pace claim' : 'Slower pace claim');
  if (cl?.scoring_environment) chips.push(cl.scoring_environment.level === 'ELEVATED' ? 'Elevated scoring claim' : 'Lower scoring claim');
  return { headline: engine.read.headline, script: primary, reasons: primary ? primary.why : [], chips };
}

// ------------------------------------------------------------------ pace & efficiency strip

/**
 * The settlement of a winner or margin contract in plain words, from the engine's own `wins_when`: "full game home margin >= -24" reads "Illinois wins, or loses by 24 or fewer"
 * rather than a signed margin. Anything the pattern does not cover falls back to the engine's text with team names (winsWhenText).
 */
export function paysWhenPlain(e: Expression, engine: Engine): string | null {
  const home = engine.teams.home.name, away = engine.teams.away.name;
  const w = e.wins_when;
  if (!w) return null;
  const m = w.match(/^full game home margin (>=|<=) (-?\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === '>=') return n >= 1 ? `${home} wins by ${n} or more` : n === 0 ? `${home} wins or the game ties` : `${home} wins, or loses by ${-n} or fewer`;
    return n <= -1 ? `${away} wins by ${-n} or more` : n === 0 ? `${away} wins or the game ties` : `${away} wins, or loses by ${n} or fewer`;
  }
  const b = w.match(/^full game home margin between (-?\d+) and (-?\d+)$/);
  if (b) {
    const lo = Number(b[1]), hi = Number(b[2]);
    return lo >= 1 ? `${home} wins by ${lo} to ${hi}` : hi <= -1 ? `${away} wins by ${-hi} to ${-lo}` : `${home} margin between ${lo} and ${hi}`;
  }
  return winsWhenText(e, engine);
}

export interface StripRow {
  id: string;
  name: string;
  /** Plain words for what the number means and which direction is better. */
  hint: string;
  away: StripCell | null;
  home: StripCell | null;
}
export interface StripCell { value: string; basis: 'adjusted' | 'raw'; rank: number | null }

const STRIP: [string, string][] = [
  ['plays_per_game', 'More plays means more possessions.'],
  ['seconds_per_play', 'Lower is faster.'],
  ['success_rate', 'Share of plays that keep the offense on schedule.'],
  ['yards_per_play', 'Total offensive yards per play.'],
  ['points_per_game', 'Points scored, all phases.'],
];

function cell(engine: Engine, side: 'home' | 'away', unit: 'offense' | 'defense', id: string): StripCell | null {
  const row = engine.teams[side].metrics[`${unit}.${id}`];
  if (!row || !usableMetric(row)) return null;
  const u = sportUnit(id, engine.registry[id], 'CFB');
  const adj = row.adjusted_available;
  const v = adj ? row.adjusted : row.raw;
  if (v == null) return null;
  return { value: formatUnitValue(v, u), basis: adj ? 'adjusted' : 'raw', rank: row.rank ?? null };
}

/** How many FBS teams the strip's ranks are among (the engine's own universe size), or null when no table is on the page. */
export function stripUniverse(engine: Engine): number | null {
  const r = Object.values(engine.teams.home.metrics)[0];
  return r?.universe_size ?? null;
}

/** The pace-and-efficiency strip: a handful of metrics for both teams, each labelled opponent-adjusted or raw. Empty when the metric tables are not on the page. */
export function paceStrip(engine: Engine, unit: 'offense' | 'defense' = 'offense'): StripRow[] {
  return STRIP.filter(([id]) => engine.registry[id]).map(([id, hint]) => ({ id, name: engine.registry[id].name, hint, away: cell(engine, 'away', unit, id), home: cell(engine, 'home', unit, id) })).filter((r) => r.away || r.home);
}

/** Pace and scoring claims in the engine's own sentences (claims_v2), for the strip's caption when the engine states them. */
export function paceClaims(engine: Engine): string[] {
  const cl = engine.claimsV2?.claims;
  return [cl?.pace?.statement, cl?.scoring_environment?.statement, cl?.defensive_suppression?.statement].filter((x): x is string => !!x && !isHavoc(x));
}

export interface Personnel { team: string; line: string }

/** Quarterback and availability context the engine published, in words. A team with no quarterback stated says so. */
export function personnel(engine: Engine): Personnel[] {
  return (['away', 'home'] as const).map((side) => {
    const t = engine.teams[side];
    const q = t.quarterback;
    const status = engine.confidence.availability_status[side];
    const name = q?.season_primary ?? q?.last_game_primary;
    const parts = [name ? `QB ${name}${q.changed ? ` (changed from ${q.last_game_primary ?? 'last game'})` : ''}` : 'Quarterback not stated', `${t.record_in_window.wins}-${t.record_in_window.losses} in the window`];
    if (status && status !== 'OBSERVED') parts.push(`availability ${status.toLowerCase().replace(/_/g, ' ')}`);
    return { team: t.name, line: parts.join(' · ') };
  });
}

// ------------------------------------------------------------------ matchup tug rows (havoc excluded)

export interface TugDim {
  dimension: string;
  /** Net advantage published for the dimension (home minus away, standard deviations), or null. */
  net: number | null;
  /** The two directions: each team's offense against the defense it faces. */
  away: number | null;
  home: number | null;
  /** Both within the engine's own uncertainty: shown muted. */
  noise: boolean;
  /** The published dimension edge rests partly on havoc, so the aggregate is replaced by the non-havoc components. */
  components: { name: string; away: number | null; home: number | null }[] | null;
}

/**
 * Each dimension's two published directional edges (a team's offense vs the defense it faces). A dimension whose components include a havoc metric is shown through its
 * other components only (published per component), never through the aggregate that blends havoc in.
 */
export function tugDims(engine: Engine, dimensions: string[]): TugDim[] {
  const out: TugDim[] = [];
  for (const d of dimensions) {
    const dim = engine.dimensions[d];
    if (!dim) continue;
    const a = dim.away_offense_vs_home_defense, h = dim.home_offense_vs_away_defense;
    const havoc = [...(a?.components ?? []), ...(h?.components ?? [])].some((c) => isHavoc(c.metric_id));
    const noisy = (x: typeof a) => x?.edge != null && x.uncertainty != null && Math.abs(x.edge) < x.uncertainty;
    if (!havoc) {
      out.push({ dimension: d, net: dim.net_home_advantage ?? null, away: a?.edge ?? null, home: h?.edge ?? null, noise: !!(noisy(a) || a?.edge == null) && !!(noisy(h) || h?.edge == null), components: null });
      continue;
    }
    const names = new Map<string, { name: string; away: number | null; home: number | null }>();
    for (const [side, x] of [['away', a], ['home', h]] as const) for (const c of x?.components ?? []) {
      if (isHavoc(c.metric_id)) continue;
      const cur = names.get(c.metric_id) ?? { name: engine.registry[c.metric_id]?.name ?? c.metric_id.replace(/_/g, ' '), away: null, home: null };
      cur[side] = c.edge;
      names.set(c.metric_id, cur);
    }
    const comps = [...names.values()];
    if (comps.length) out.push({ dimension: d, net: null, away: null, home: null, noise: false, components: comps });
  }
  return out;
}

/** Compare two teams' strength words for a net value: "Nebraska +0.86" with the team named by the sign. */
export function netWinner(engine: Engine, net: number | null): { team: string; side: 'home' | 'away' } | null {
  if (net == null || net === 0) return null;
  const side = net > 0 ? 'home' : 'away';
  return { team: engine.teams[side].name, side };
}

// ------------------------------------------------------------------ other prices: totals, team totals, halves, quarters

export interface PriceOption { ticker: string; side: 'YES' | 'NO'; label: string }
export interface MarketGroup {
  key: string;
  title: string;
  /** What the group is, in one line, including that the engine states no calibrated fit for it. */
  note: string;
  options: PriceOption[];
}

const mid = (m: Market): number | null => {
  const a = m.yes_ask, b = m.yes_bid;
  if (a != null && b != null && a > 0 && a < 1 && b > 0) return (a + b) / 2;
  return a != null && a > 0 && a < 1 ? a : null;
};

/** The ladder rung whose own market sits nearest an even price (bid and ask averaged): the line the market itself treats as central. Null when none is quoted. */
export function centralRung(ms: Market[]): Market | null {
  let best: Market | null = null, d = Infinity;
  for (const m of ms) { const v = mid(m); if (v != null && Math.abs(v - 0.5) < d) { best = m; d = Math.abs(v - 0.5); } }
  return best;
}

const lineOf = (m: Market): string => String(m.threshold ?? m.line ?? '').replace(/^$/, '');
const teamOfTotal = (m: Market): string => m.yes_description.replace(/\s+(over|under)\b.*$/i, '').trim();

/**
 * Kalshi's totals and period markets for this game as a short list of price groups: the game total and each team total at the market's central line (Over is the
 * YES side, Under the NO side of the same contract), the first-half winner, and any quarter markets. The engine maps none of these to a script with calibrated authority
 * (totals are research only; period contracts are unmappable), so each group says that instead of claiming a fit.
 */
export function marketGroups(markets: Market[] | undefined): MarketGroup[] {
  const ms = markets ?? [];
  const out: MarketGroup[] = [];
  const total = centralRung(ms.filter((m) => m.market_family === 'game_total'));
  if (total) out.push({ key: 'game_total', title: `Game total ${lineOf(total)}`, note: 'Full game, the market’s central line. Research only: the engine’s point ranges are not calibrated for totals.', options: [{ ticker: total.kalshi_ticker, side: 'YES', label: `Over ${lineOf(total)}` }, { ticker: total.kalshi_ticker, side: 'NO', label: `Under ${lineOf(total)}` }] });
  const byTeam = new Map<string, Market[]>();
  for (const m of ms.filter((x) => x.market_family === 'team_total')) byTeam.set(teamOfTotal(m), [...(byTeam.get(teamOfTotal(m)) ?? []), m]);
  for (const [team, list] of byTeam) {
    const c = centralRung(list);
    if (c) out.push({ key: `tt:${team}`, title: `${team} team total ${lineOf(c)}`, note: 'Full game, the market’s central line. Research only.', options: [{ ticker: c.kalshi_ticker, side: 'YES', label: `Over ${lineOf(c)}` }, { ticker: c.kalshi_ticker, side: 'NO', label: `Under ${lineOf(c)}` }] });
  }
  const half = ms.filter((m) => m.market_family === 'first_half_moneyline');
  if (half.length) out.push({ key: 'h1', title: 'First-half winner', note: 'The engine publishes no first-half script, so no script fit is stated.', options: half.map((m) => ({ ticker: m.kalshi_ticker, side: 'YES' as const, label: m.yes_description })) });
  for (const m of ms.filter((x) => /quarter|first_q|1q/i.test(x.market_family) || /quarter/i.test(x.period ?? ''))) {
    out.push({ key: m.kalshi_ticker, title: m.yes_description, note: 'The engine publishes no quarter script, so no script fit is stated.', options: [{ ticker: m.kalshi_ticker, side: 'YES', label: 'Yes' }, { ticker: m.kalshi_ticker, side: 'NO', label: 'No' }] });
  }
  return out;
}

export { findingLabel, whyBet };
