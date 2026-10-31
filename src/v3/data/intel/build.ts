// Matchup Intelligence for one game, as one pure function over the documents already on screen (the event's research document and its
// contract list). It decides WHICH sections exist: a section is present only when the data behind it exists for this sport and game, so
// nothing is unlocked by a flag and nothing is faked; what is absent is listed with the reason (`gaps`), and the screen words it.
//
// Order (pregame): projection, top advantages, comparison, player and positional mismatches, lineup/injury notes, scoring environment, script.
// The Kalshi markets and player-prop summaries that follow are the existing Overview cards (screens/GameOverview.tsx), unchanged.
import type { EventDetailDoc, EventResearchDoc } from '../../../contract/types';
import { injurySource, type InjurySourceInfo } from '../../../lib/injurySource';
import { injuryNews, type NewsItem } from '../../../insights/news';
import { readFindings, type NhlFinding } from '../../../lib/nhl';
import { topAdvantages, type Advantage, type Names } from '../../model/intel/advantages';
import type { V3Game } from '../../model/types';
import { deriveProps } from '../adapt';
import { keyMatchups, NFL_PROP_UNITS, type KeyMatchup, type RosterPlayer } from '../research/keyMatchups';
import { sideOf, unitsFor, type UnitRow } from '../research/matchup';
import { pairsFromResearch, type StatPair } from '../matchup';
import { readEnvironment, type Environment } from './environment';
import { readProjection, type ApprovedTeams, type ProjectionRead } from './projection';
import { readScriptIntel, type ScriptIntel } from './scriptIntel';
import { ranksFromResearch, unitsFromResearch } from './units';

export type IntelSection = 'projection' | 'advantages' | 'comparison' | 'mismatches' | 'notes' | 'environment' | 'script';
/** The order sections appear in on a pregame Overview. */
export const SECTION_ORDER: readonly IntelSection[] = ['projection', 'advantages', 'comparison', 'mismatches', 'notes', 'environment', 'script'];

export type Comparison =
  | { kind: 'units'; rowsAway: UnitRow[]; rowsHome: UnitRow[] }
  | { kind: 'ranks'; pairs: StatPair[]; adjusted: boolean };

export interface IntelNotes {
  items: NewsItem[];
  /** How many designations the publication lists beyond the ones shown. */
  more: number;
  source: InjurySourceInfo | null;
}

export interface GameIntel {
  present: IntelSection[];
  projection: ProjectionRead;
  advantages: Advantage[];
  /** Matchup findings the publication wrote itself (NHL), for a sport with no unit ranks. */
  findings: NhlFinding[];
  comparison: Comparison | null;
  mismatches: KeyMatchup[];
  notes: IntelNotes | null;
  environment: Environment | null;
  script: ScriptIntel | null;
  /** Sections that have no data for this game, with the reason in words (the screen's absent notes). */
  gaps: { section: IntelSection; reason: string }[];
}

export interface IntelInput {
  g: V3Game;
  research: EventResearchDoc | null;
  detail: EventDetailDoc | null;
  /** The projection authority's answer for this game's team points, when the sport has an approved family and it resolved. */
  approved?: ApprovedTeams | null;
  now: number;
}

export const nicknames = (g: Pick<V3Game, 'away' | 'home'>): Names => ({ nick: (code) => (code === g.away.id ? g.away.nick : code === g.home.id ? g.home.nick : code) });

/** The roster the research document names with each player's team code (the same rule as gameHooks.useRoster, pure). */
export function rosterOf(g: Pick<V3Game, 'away' | 'home'>, research: EventResearchDoc | null | undefined): RosterPlayer[] {
  if (!research) return [];
  const code = new Map<string, string>();
  for (const p of research.participants ?? []) code.set(p.participant_id, p.home_away === 'AWAY' ? g.away.id : p.home_away === 'HOME' ? g.home.id : p.short_name ?? '');
  return (research.players ?? []).flatMap((p) => { const t = p.team_id ? code.get(p.team_id) : null; return t ? [{ id: p.participant_id, name: p.display_name, role: p.role ?? null, team: t }] : []; });
}

const GENERIC_ADJUSTED = /(^|[._])(adj|oa)_|adjusted/i;

/** True when the event carries the CFB Script Engine: those games are presented by the script-engine view, which owns the projection and script. */
export const hasScriptEngine = (research: EventResearchDoc | null | undefined): boolean => !!(research?.extensions as Record<string, unknown> | null | undefined)?.script_engine;

const MAX_NOTES = 5;

export function buildGameIntel(i: IntelInput): GameIntel {
  const { g, research, detail } = i;
  const gaps: GameIntel['gaps'] = [];
  const names = nicknames(g);
  const owned = hasScriptEngine(research);

  const projection = readProjection(research, g, i.approved);

  // Advantages and comparison: unit ranks for a sport that declares units (NFL), else the publication's own matchup rows or findings.
  const units = unitsFromResearch(g, research);
  const advantages = units ? topAdvantages(units.rowsAway, units.rowsHome, names, 3) : [];
  const findings = !units ? readFindings(research).whatMatters.slice(0, 3) : [];
  let comparison: Comparison | null = null;
  if (units) comparison = { kind: 'units', rowsAway: units.rowsAway, rowsHome: units.rowsHome };
  else if (research && !unitsFor(g.slug).length) {
    const pairs = pairsFromResearch(research, g).filter((p) => p.away.rank != null && p.home.rank != null && p.away.n && p.home.n).slice(0, 6);
    if (pairs.length >= 2) comparison = { kind: 'ranks', pairs, adjusted: research.matchup.some((m) => GENERIC_ADJUSTED.test(m.metric_id) || GENERIC_ADJUSTED.test(m.name)) };
  }

  // Player and positional mismatches: listed players whose prop meets a unit with a published defense rank.
  let mismatches: KeyMatchup[] = [];
  if (units && detail) {
    const ranks = ranksFromResearch(research)!;
    const defSide = (team: string, u: { def: string }) => sideOf(team === g.away.id ? ranks.away : ranks.home, u.def);
    const opponent = (team: string) => (team === g.away.id ? g.home.id : team === g.home.id ? g.away.id : null);
    mismatches = keyMatchups({ props: deriveProps(detail.markets ?? []), roster: rosterOf(g, research), units: unitsFor(g.slug), statUnits: g.slug === 'nfl' ? NFL_PROP_UNITS : {}, defSide, opponent, max: 3 });
  }

  // Lineup, injury and roster notes: the publication's own injury news (the source the Home stories use), with its source and age.
  let notes: IntelNotes | null = null;
  if (research?.context?.injuries?.length) {
    let all: NewsItem[];
    try { all = injuryNews(research).sort((a, b) => b.score - a.score || (b.asOf ?? '').localeCompare(a.asOf ?? '')); } catch { all = []; }
    const lead = all.filter((n) => n.level === 'critical' || n.level === 'high');
    const shown = (lead.length ? lead : all.filter((n) => n.level === 'medium')).slice(0, MAX_NOTES);
    if (shown.length) notes = { items: shown, more: Math.max(0, all.length - shown.length), source: injurySource(research.context.injuries, i.now, g.sport) };
  }

  const environment = readEnvironment(research, g);
  const script = owned ? null : readScriptIntel(research, detail);

  const has: Record<IntelSection, boolean> = {
    projection: !owned, advantages: advantages.length > 0 || findings.length > 0, comparison: comparison != null, mismatches: mismatches.length > 0,
    notes: notes != null, environment: environment != null, script: script != null,
  };
  const reason = (s: IntelSection): string => {
    switch (s) {
      case 'advantages': return unitsFor(g.slug).length ? 'The publication carries no opponent-adjusted unit ranks for both teams.' : 'This sport publishes no opponent-adjusted unit ranks for games, and no written matchup findings for this game.';
      case 'comparison': return 'The publication carries no comparable team statistics for both teams in this game.';
      case 'mismatches': return unitsFor(g.slug).length ? 'No listed player prop maps to a unit with published ranks.' : 'No player-to-opposing-unit mapping is published for this sport.';
      case 'notes': return 'The publication lists no injuries or lineup changes for this game.';
      case 'environment': return 'The publication carries no scoring or pace simulation for this game.';
      case 'script': return 'The publication states no game script for this game.';
      default: return '';
    }
  };
  // With no research document there is one reason for everything (the projection card already says it), not six copies of it.
  if (research) for (const s of SECTION_ORDER) if (s !== 'projection' && !has[s] && !(owned && s === 'script')) gaps.push({ section: s, reason: reason(s) });
  return { present: SECTION_ORDER.filter((s) => has[s]), projection, advantages, findings, comparison, mismatches, notes, environment, script, gaps };
}
