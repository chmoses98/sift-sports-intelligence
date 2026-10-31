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
import { gameCapability, type Availability, type Section } from '../../model/capabilities';
import { readEnvironment, type Environment } from './environment';
import { readProjection, type ApprovedTeams, type ProjectionRead } from './projection';
import { readScriptIntel, type ScriptIntel } from './scriptIntel';
import { ranksFromResearch, unitsFromResearch } from './units';
import { readSport, type SportBlock } from './sports';
import { statsAge } from './sports/shared';

export type IntelSection = 'projection' | 'advantages' | 'comparison' | 'mismatches' | 'notes' | 'environment' | 'sport' | 'script';
/** The order sections appear in on a pregame Overview. `sport` is the sport's own research cards (starters and lineups, rotations, surface and form, attack against defence). */
export const SECTION_ORDER: readonly IntelSection[] = ['projection', 'advantages', 'comparison', 'mismatches', 'notes', 'environment', 'sport', 'script'];

/** `note`: a sentence under the table (how old the statistics are, what the publication does not state). */
export type Comparison =
  | { kind: 'units'; rowsAway: UnitRow[]; rowsHome: UnitRow[]; note?: string | null }
  | { kind: 'ranks'; pairs: StatPair[]; adjusted: boolean; note?: string | null }
  /** Published values for the two sides with no league rank (baseball, tennis ratings). */
  | { kind: 'values'; rows: { id: string; name: string; away: string; home: string; unit: string | null }[]; note?: string | null };

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
  /** The sport's own research cards for this game (data/intel/sports). */
  blocks: SportBlock[];
  /**
   * The Overview layers a sport publishes game by game, decided for THIS game: the sport's declaration (model/capabilities.ts) opened by what this game's own
   * document filled. Nothing is unlocked by a flag; a sport that declares a layer `none` stays `none` whatever the document holds.
   */
  layers: Record<'gameModel' | 'gameEnvironment' | 'gameAvailability', Availability>;
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

  let projection = readProjection(research, g, i.approved);
  // The sport's own readers (NHL, NBA, MLB, CBB, soccer, tennis): a published model view where the generic readers found none, never over an approved one.
  const sport = research ? readSport({ g, research, detail, now: i.now }) : null;
  if (!projection.model && sport?.model) projection = { ...projection, model: sport.model, absent: null };
  else if (!projection.model && sport?.modelAbsent) projection = { ...projection, absent: sport.modelAbsent };

  // Advantages and comparison: unit ranks for a sport that declares units (NFL), else the publication's own matchup rows or findings.
  const units = unitsFromResearch(g, research);
  const advantages = units ? topAdvantages(units.rowsAway, units.rowsHome, names, 3) : [];
  const findings = !units ? readFindings(research).whatMatters.slice(0, 3) : [];
  let comparison: Comparison | null = null;
  if (sport?.comparison) comparison = sport.comparison;
  else if (units) comparison = { kind: 'units', rowsAway: units.rowsAway, rowsHome: units.rowsHome };
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
  if (sport && sport.notes !== undefined) notes = sport.notes;
  else if (research?.context?.injuries?.length) {
    let all: NewsItem[];
    try { all = injuryNews(research).sort((a, b) => b.score - a.score || (b.asOf ?? '').localeCompare(a.asOf ?? '')); } catch { all = []; }
    const lead = all.filter((n) => n.level === 'critical' || n.level === 'high');
    const shown = (lead.length ? lead : all.filter((n) => n.level === 'medium')).slice(0, MAX_NOTES);
    if (shown.length) notes = { items: shown, more: Math.max(0, all.length - shown.length), source: injurySource(research.context.injuries, i.now, g.sport) };
  }

  let environment = readEnvironment(research, g) ?? sport?.environment ?? null;
  const script = owned ? null : readScriptIntel(research, detail) ?? sport?.script ?? null;
  const blocks = sport?.blocks ?? [];
  // Season statistics that are old are said to be old: a preseason game's rows are last season's, and a table of ranks must not read as current form.
  const age = statsAge(research, i.now);
  if (age && !age.current) {
    if (comparison && !comparison.note) comparison = { ...comparison, note: age.label };
    if (environment?.lines.some((l) => l.source === 'season')) environment = { ...environment, foot: [environment.foot, age.label].filter(Boolean).join(' ') };
  }

  const has: Record<IntelSection, boolean> = {
    projection: !owned, advantages: advantages.length > 0 || findings.length > 0, comparison: comparison != null, mismatches: mismatches.length > 0,
    notes: notes != null, environment: environment != null, sport: blocks.length > 0, script: script != null,
  };
  const reason = (s: IntelSection): string => {
    switch (s) {
      case 'advantages': return unitsFor(g.slug).length ? 'The publication carries no opponent-adjusted unit ranks for both teams.' : 'This sport publishes no opponent-adjusted unit ranks for games, and no written matchup findings for this game.';
      case 'comparison': return 'The publication carries no comparable team statistics for both teams in this game.';
      case 'mismatches': return unitsFor(g.slug).length ? 'No listed player prop maps to a unit with published ranks.' : 'No player-to-opposing-unit mapping is published for this sport.';
      case 'notes': return 'The publication lists no injuries or lineup changes for this game.';
      case 'environment': return 'The publication carries no scoring or pace simulation for this game.';
      case 'sport': return '';
      case 'script': return 'The publication states no game script for this game.';
      default: return '';
    }
  };
  // With no research document there is one reason for everything (the projection card already says it), not six copies of it.
  if (research) for (const s of SECTION_ORDER) if (s !== 'projection' && s !== 'sport' && !has[s] && !(owned && s === 'script')) gaps.push({ section: s, reason: sport?.reasons?.[s] ?? reason(s) });
  const filled: Section[] = [...(projection.model ? ['gameModel' as const] : []), ...(environment ? ['gameEnvironment' as const] : []), ...(notes || blocks.length ? ['gameAvailability' as const] : [])];
  const layers = { gameModel: gameCapability(g.slug, 'gameModel', { sections: filled }), gameEnvironment: gameCapability(g.slug, 'gameEnvironment', { sections: filled }), gameAvailability: gameCapability(g.slug, 'gameAvailability', { sections: filled }) };
  return { present: SECTION_ORDER.filter((s) => has[s]), projection, advantages, findings, comparison, mismatches, notes, environment, script, blocks, layers, gaps };
}
