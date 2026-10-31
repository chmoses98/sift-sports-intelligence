// What a Script Engine payload says, shaped for the Game Detail screens. Pure: every rule here is over the decoded payload (src/lib/scriptEngine.ts) and the
// SIFT 2.0 logic it already has (survivor grouping, settlement words, per-script market cards); nothing is added that the engine did not publish.
//   * Matchup advantages are the engine's own MATCHUP findings (opponent-adjusted, strongest first) with the metric rows they cite, never a SIFT estimate.
//   * Scripts are RANKED, never given a likelihood: no function here returns or formats a probability, and a survival count stays a count.
//   * Total and team-total contracts arrive as RESEARCH_UNCALIBRATED ("Scoring: research only") and are never listed as surviving.
import type { Market } from '../../contract/types';
import {
  ARCHETYPE_WORD, DIMENSION_WORD, EDGE_DIMENSIONS, ROLE_INDEX, ROLE_WORD, findingByCode, findingLabel, groupedSurvivors, metricAt, scriptTitle, winsWhenText,
  type Compat, type DirectionEdge, type Engine, type EngineScript, type Expression, type Finding, type MetricRow,
} from '../../lib/scriptEngine';
import { splitSentence } from '../../lib/scriptNames';
import { formatUnitValue, sportUnit, unitText } from '../../insights/sportUnits';

export { ARCHETYPE_WORD, DIMENSION_WORD, ROLE_INDEX, ROLE_WORD, scriptTitle, findingLabel };

// ------------------------------------------------------------------ matchup advantages

/** Why a football dimension matters, in plain words. A definition of the dimension, not a claim about this game. */
export const DIMENSION_WHY: Record<string, string> = {
  sustained_efficiency: 'Offenses that gain yards efficiently on every snap stay on schedule, keep the ball longer and give the other offense fewer possessions.',
  rushing: 'A rushing mismatch lets one offense run for steady gains, shorten the game and lean on the ground game when it leads.',
  passing: 'A passing mismatch gives one offense a reliable way to move the ball, and forces the other defense to cover the whole field.',
  explosiveness: 'Explosive plays are big gains. A mismatch here means one side can score without a long drive.',
  disruption: 'Pressure, sacks and takeaways stop drives. A mismatch here means one offense is more exposed to negative plays.',
  finishing: 'Finishing is what a drive earns once it reaches scoring range: touchdowns rather than field goals or nothing.',
  scoring: 'Opponent-adjusted scoring puts both teams’ points for and against on one scale, accounting for who they played.',
};

/**
 * What each registry metric measures, in the engine's own published words (cfb-edge-finder metric_registry, as of the 1.3.0 payload). Used ONLY when a trimmed event
 * omits its metric descriptions and the research file that restores them is not on the page; the event's own description always wins.
 */
export const METRIC_WHAT: Record<string, string> = {
  early_down_success_rate: 'Success rate on 1st and 2nd down only.',
  explosive_pass_rate: 'Dropbacks gaining 16+ yards.',
  explosive_play_rate: 'Share of scrimmage plays gaining 12+ (rush) or 16+ (pass) yards.',
  explosive_rush_rate: 'Designed runs gaining 12+ yards.',
  explosive_yard_share: 'How much of the offense\u2019s yardage arrived in explosive chunks. Dependence, not quality.',
  first_down_rate: 'First downs (all methods) per offensive play. A box-score proxy for staying on schedule.',
  havoc_allowed: 'Tackles for loss plus passes defended by the opposing defense, per offensive play. Turnovers are excluded so repeatable disruption stays separate from turnover luck.',
  interception_rate: 'Interceptions thrown per pass attempt. Regression-prone; never carries a script alone.',
  net_yards_per_dropback: 'Passing yards minus sack yardage, per dropback (attempts plus sacks).',
  neutral_pass_rate: 'Dropbacks per play in quarters 1-3 with the score within 14. A tendency, not adjusted.',
  pass_rate: 'Pass attempts per play. A tendency; game state drives it, so it is not opponent-adjusted.',
  pass_success_rate: 'Success rate on dropbacks (sacks included as failures).',
  plays_per_game: 'Offensive plays per game. More plays means more possessions.',
  points_per_drive: 'Offensive points (touchdown 7, field goal 3) per offensive drive.',
  points_per_game: 'Points scored in all phases (includes defensive and special-teams scores).',
  points_per_opportunity: 'Offensive points per drive that reached the opponent\u2019s 40 (touchdown 7, field goal 3).',
  rush_success_rate: 'Success rate on designed runs (sacks excluded).',
  sack_rate_allowed: 'Sacks taken per (pass attempts plus sacks). Repeatable disruption.',
  seconds_per_play: 'Time of possession per offensive play. Lower is faster.',
  success_rate: 'Share of non-garbage scrimmage plays gaining 50%/70%/100% of the distance on 1st/2nd/3rd-4th down.',
  third_down_rate: 'Secondary evidence: small samples, heavily dependent on distance to go.',
  turnovers_per_game: 'Giveaways per game. Regression-prone; reported, never a script\u2019s sole cause.',
  yards_per_designed_rush: 'Rushing yards per designed run, sacks removed (play log).',
  yards_per_pass_attempt: 'Passing yards per pass attempt (box score). Not sack-adjusted.',
  yards_per_play: 'Total offensive yards per (rush attempts plus pass attempts). NCAA box score: sacks count as rushes.',
  yards_per_rush: 'NCAA box-score rushing yards per rush: sacks are counted as rushes with negative yardage.',
};

export interface RankLine { team: string; unit: 'offense' | 'defense'; rank: number | null; of: number | null; value: string | null; adjusted: boolean }

export interface Advantage {
  code: string;
  /** 'finding': the engine states it (a MATCHUP finding). 'gap': the engine states no finding for the dimension; this is one of its largest published opponent-adjusted gaps, labelled as such. */
  kind: 'finding' | 'gap';
  dimension: string;
  dimensionWord: string;
  side: 'home' | 'away';
  team: string;
  opponent: string;
  strength: 'MODERATE' | 'STRONG' | null;
  /** The engine's own sentence for the finding (it names the numbers); null for a gap the engine states no finding for. */
  statement: string | null;
  /** The metric the comparison rests on, in the registry's words. */
  metric: { name: string; what: string | null; unit: string } | null;
  /** The two units compared: the team's offense and the defense it faces (null when the detailed tables are not on the page). */
  offense: RankLine | null;
  defense: RankLine | null;
  /** Opponent-adjusted gap in standard deviations across FBS: this team's offense vs the defense it faces, and the reverse. */
  edge: { forward: number | null; reverse: number | null };
  why: string;
}

const dirOf = (engine: Engine, dimension: string, side: 'home' | 'away'): DirectionEdge | undefined => {
  const d = engine.dimensions[dimension];
  return side === 'home' ? d?.home_offense_vs_away_defense : d?.away_offense_vs_home_defense;
};

function rankLine(engine: Engine, ref: string): RankLine | null {
  const row: (MetricRow & { team: string }) | null = metricAt(engine, ref);
  if (!row) return null;
  const u = sportUnit(row.metric_id, engine.registry[row.metric_id], 'CFB');
  return { team: row.team, unit: row.unit, rank: row.rank, of: row.rank != null ? row.universe_size : null, value: formatUnitValue(row.adjusted_available ? row.adjusted : row.raw, u), adjusted: row.adjusted_available };
}

function advantageOf(engine: Engine, dimension: string, side: 'home' | 'away', f: Finding | null): Advantage {
  const other = side === 'home' ? 'away' : 'home';
  const fwd = dirOf(engine, dimension, side);
  const rev = dirOf(engine, dimension, other);
  const core = fwd?.components?.find((c) => c.tier === 'CORE') ?? fwd?.components?.[0];
  const reg = core ? engine.registry[core.metric_id] : undefined;
  return {
    code: f?.code ?? `gap:${dimension}:${side}`, kind: f ? 'finding' : 'gap', dimension, dimensionWord: DIMENSION_WORD[dimension] ?? dimension.replace(/_/g, ' '),
    side, team: engine.teams[side].name, opponent: engine.teams[other].name, strength: f?.strength ?? null, statement: f?.statement ?? null,
    metric: core ? { name: reg?.name ?? core.metric_id.replace(/_/g, ' '), what: reg?.description ?? METRIC_WHAT[core.metric_id] ?? null, unit: reg ? unitText(sportUnit(core.metric_id, reg, 'CFB')) : '' } : null,
    offense: core ? rankLine(engine, core.offense_ref) : null, defense: core ? rankLine(engine, core.defense_ref) : null,
    edge: { forward: fwd?.edge ?? null, reverse: rev?.edge ?? null },
    why: DIMENSION_WHY[dimension] ?? (engine.dimensions[dimension]?.definition ?? ''),
  };
}

/**
 * The engine's strongest opponent-adjusted matchup advantages: its MATCHUP findings, STRONG before MODERATE, then by the size of the gap, one per dimension and side.
 * When the engine states fewer than `limit` (an even matchup states none), the rest are its largest published positive gaps between an offense and the defense it
 * faces, marked `kind: 'gap'` and carrying no sentence of their own. Each carries the comparison behind it when the detailed tables are on the page (a trimmed
 * event without its sidecar keeps the sentence alone).
 */
export function topAdvantages(engine: Engine, limit = 3): Advantage[] {
  const seen = new Set<string>();
  const ranked = engine.findings
    .filter((f): f is Finding & { side: 'home' | 'away' } => f.category === 'MATCHUP' && (f.side === 'home' || f.side === 'away'))
    .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'STRONG' ? -1 : 1) || Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));
  const out: Advantage[] = [];
  for (const f of ranked) {
    const k = `${f.dimension}|${f.side}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(advantageOf(engine, f.dimension, f.side, f));
    if (out.length >= limit) return out;
  }
  const gaps = EDGE_DIMENSIONS.flatMap((d) => (['home', 'away'] as const).map((side) => ({ d, side, edge: dirOf(engine, d, side)?.edge ?? null })))
    .filter((x): x is { d: string; side: 'home' | 'away'; edge: number } => x.edge != null && x.edge > 0 && !seen.has(`${x.d}|${x.side}`))
    .sort((a, b) => b.edge - a.edge);
  for (const x of gaps) {
    out.push(advantageOf(engine, x.d, x.side, null));
    if (out.length >= limit) break;
  }
  return out;
}

/** "+1.13" / "−1.78": the engine's opponent-adjusted gap, a standard-deviation score (positive favours the offense named). */
export const gapText = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`);

// ------------------------------------------------------------------ scripts

export interface ChainStep { step: string; findings: { code: string; label: string; statement: string; strength: 'MODERATE' | 'STRONG' }[] }
export interface ScriptCard {
  script: EngineScript;
  role: string;
  title: string;
  tone: 1 | 2 | 3 | 4;
  /** The first sentence of the engine's summary, and the rest (kept for the expansion). */
  lead: string;
  rest: string | null;
  archetype: string;
  steps: ChainStep[];
  /** Findings that cut against this script. */
  against: { code: string; label: string; statement: string }[];
}

const stepOf = (engine: Engine, c: EngineScript['causal_chain'][number]): ChainStep => ({
  step: c.step,
  findings: c.findings.flatMap((code) => {
    const f = findingByCode(engine, code);
    return f ? [{ code, label: findingLabel(engine, code), statement: f.statement, strength: f.strength }] : [];
  }),
});

/** Primary, Secondary, Alternate, Danger, in the engine's rank order, each with its causal chain and the findings behind every step. */
export function scriptCards(engine: Engine): ScriptCard[] {
  return engine.scripts.map((s) => {
    const sp = splitSentence(s.summary);
    return {
      script: s, role: ROLE_WORD[s.role], title: scriptTitle(s), tone: ROLE_INDEX[s.role], lead: sp.lead, rest: sp.rest,
      archetype: ARCHETYPE_WORD[s.archetype] ?? s.archetype,
      steps: s.causal_chain.map((c) => stepOf(engine, c)),
      against: s.contradicting_findings.flatMap((code) => { const f = findingByCode(engine, code); return f ? [{ code, label: findingLabel(engine, code), statement: f.statement }] : []; }),
    };
  });
}

// ------------------------------------------------------------------ bets that survive multiple scripts

export const COMPAT_WORD: Record<Compat, string> = {
  SUPPORTED: 'supports', PARTIAL: 'partly supports', CONTRADICTED: 'contradicts', NEUTRAL: 'makes no claim about', UNMAPPABLE: 'cannot be mapped to', RESEARCH_UNCALIBRATED: 'makes no calibrated claim about',
};

/** The featured expressions (ladder rungs with identical script support folded into one row), scoring contracts excluded: they are research only. */
export function survivorRows(engine: Engine, limit = 8): (Expression & { similar: number })[] {
  return groupedSurvivors(engine).filter((e) => e.authority !== 'RESEARCH_UNCALIBRATED').slice(0, limit);
}

/** How many featured expressions the engine published that are scoring contracts, hidden because their bands are not calibrated. */
export function scoringHidden(engine: Engine): number {
  return groupedSurvivors(engine).filter((e) => e.authority === 'RESEARCH_UNCALIBRATED').length;
}

export interface ScriptFit { script: EngineScript; role: string; title: string; tone: 1 | 2 | 3 | 4; compat: Compat; word: string; coverage: number | null }

/** Per script, how it relates to this contract side: supports, partly supports, contradicts, or makes no claim. */
export function scriptFits(engine: Engine, e: Expression): ScriptFit[] {
  return engine.scripts.map((s, i) => ({ script: s, role: ROLE_WORD[s.role], title: scriptTitle(s), tone: ROLE_INDEX[s.role], compat: e.compat[i], word: COMPAT_WORD[e.compat[i]], coverage: e.coverage[i] ?? null }));
}

/** "Supported by Primary, Secondary · contradicted by Danger": the count stays a count, never a percentage. */
export function fitSentence(engine: Engine, e: Expression): string {
  const by = (c: Compat) => engine.scripts.filter((_, i) => e.compat[i] === c).map((s) => ROLE_WORD[s.role]);
  const parts: string[] = [];
  if (by('SUPPORTED').length) parts.push(`Supported by ${by('SUPPORTED').join(', ')}`);
  if (by('PARTIAL').length) parts.push(`${parts.length ? 'partly' : 'Partly'} by ${by('PARTIAL').join(', ')}`);
  if (by('CONTRADICTED').length) parts.push(`${parts.length ? 'contradicted' : 'Contradicted'} by ${by('CONTRADICTED').join(', ')}`);
  return parts.join(' · ') || 'No script makes a claim about it';
}

/** "Survives 3 of 4 scripts, partly 1, 1 contradicts": a count of scripts, never a percentage. */
export function survivalWords(e: Expression): string {
  const v = e.survival;
  return `Survives ${v.supported} of ${v.total_scripts} scripts${v.partial ? `, partly ${v.partial}` : ''}${v.contradicted ? `, ${v.contradicted} contradict${v.contradicted === 1 ? 's' : ''}` : ''}`;
}

export interface WhyBet {
  fits: ScriptFit[];
  /** What the supporting scripts require (findings for the bet) and what cuts against them (findings against), plus the scripts that contradict it. */
  forFindings: { code: string; label: string; statement: string }[];
  againstFindings: { code: string; label: string; statement: string }[];
  contradictedBy: ScriptFit[];
  paysWhen: string | null;
  metrics: { ref: string; text: string }[];
  correlation: { label: string; relation: string; bothLoseWhen: string | null }[];
}

const asFinding = (engine: Engine, code: string) => { const f = findingByCode(engine, code); return f ? { code, label: findingLabel(engine, code), statement: f.statement } : null; };
const nn = <T,>(x: T | null | undefined): x is T => x != null;

/** The evidence behind one row: findings for and against, the scripts that contradict it, and the metrics those findings cite. */
export function whyBet(engine: Engine, e: Expression, labelOf: (id: string) => string): WhyBet {
  const fits = scriptFits(engine, e);
  const supporting = fits.filter((f) => f.compat === 'SUPPORTED' || f.compat === 'PARTIAL').map((f) => f.script);
  const forCodes = [...new Set(supporting.flatMap((s) => s.required_findings))];
  const againstCodes = [...new Set(supporting.flatMap((s) => s.contradicting_findings))];
  const refs = [...new Set(forCodes.flatMap((c) => findingByCode(engine, c)?.metric_refs ?? []))].slice(0, 4);
  return {
    fits,
    forFindings: forCodes.map((c) => asFinding(engine, c)).filter(nn),
    againstFindings: againstCodes.map((c) => asFinding(engine, c)).filter(nn),
    contradictedBy: fits.filter((f) => f.compat === 'CONTRADICTED'),
    paysWhen: winsWhenText(e, engine),
    metrics: refs.flatMap((ref) => {
      const row = metricAt(engine, ref);
      if (!row) return [];
      const reg = engine.registry[row.metric_id];
      const u = sportUnit(row.metric_id, reg, 'CFB');
      const v = row.adjusted_available ? `${formatUnitValue(row.adjusted, u)} adjusted` : `${formatUnitValue(row.raw, u)} raw, not adjusted`;
      return [{ ref, text: `${row.team} ${row.unit}, ${reg?.name ?? row.metric_id}: ${v} (${row.rank ? `#${row.rank} of ${row.universe_size}` : 'unranked'}, ${row.games} games)` }];
    }),
    correlation: e.correlation.slice(0, 3).map((c) => ({ label: labelOf(c.with), relation: c.relation.replace(/_/g, ' '), bothLoseWhen: c.both_lose_when })),
  };
}

/** The market row a ticker names, for the label of an expression. */
export const marketMap = (markets: Market[] | undefined): Map<string, Market> => new Map((markets ?? []).map((m) => [m.kalshi_ticker, m]));

// ------------------------------------------------------------------ data confidence

/** The engine's evidence gates, in words (the engine publishes their keys). */
export const GATE_WORD: Record<string, string> = {
  adjusted_inputs: 'Opponent-adjusted inputs exist',
  sample_size: 'Sample-size gate (3 or more games each)',
  identity: 'Teams and home and away identified',
  freshness: 'Game log current and complete',
  availability: 'No quarterback listed uncertain',
  market_blind: 'Built before any market data',
};

export const CONFIDENCE_WORD: Record<string, string> = { HIGH: 'High data confidence', MEDIUM: 'Medium data confidence', LOW: 'Low data confidence' };

/** What the engine's status says when it published no script, in words. */
export const STATUS_WORD: Record<string, string> = {
  NO_SCRIPT_CLEARED_EVIDENCE: 'No script cleared its evidence requirement for this game.',
  SINGLE_SCRIPT: 'Only one script cleared its evidence requirement.',
  SCRIPTS_GENERATED: 'Scripts generated.',
};
