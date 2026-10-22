// Shared helpers for the LIVE verification tests (tests/live/liveVerify.test.ts, liveWatch.test.ts). They run only where there is real
// internet (a GitHub runner, or your Mac with LIVE_VERIFY=1) and use the production adapters and the production matcher, so what they
// report is what the app would do. Reference parsers for the NHL and MLB official feeds exist only to cross-check scores; the app
// does not read those feeds.
import { SPORTS } from '../../../src/data/sports';
import { TeamDirectory, canonicalizeGame, pairGames, teamKey } from '../../../src/live/scores/identity';
import { espnProvider } from '../../../src/live/scores/providers/espn';
import { sportscoreProvider } from '../../../src/live/scores/providers/sportscore';
import { observedFromGames, type PublishedGame } from '../../../src/v4/scoreState';
import type { GamePhase, LiveGame, LiveScoreProvider, LiveSport, ObservedEvent } from '../../../src/live/scores/types';

export const BOARD_SPORTS: LiveSport[] = ['NFL', 'CFB', 'NBA', 'NHL', 'MLB', 'SOCCER', 'CBB', 'TENNIS'];

interface BoardItem { event_id: string; start_time_utc: string; league?: string; status: string; home_participant: string | null; away_participant: string | null; participants: { participant_id: string; display_name: string; short_name: string | null }[] }

/** The real published board for a sport, as the app reads it. */
export async function loadBoard(sport: LiveSport): Promise<{ games: PublishedGame[]; items: BoardItem[]; generatedAt: string | null }> {
  const cfg = SPORTS.find((s) => s.code === sport)!;
  const r = await fetch(`${cfg.rawBase}/board.json`);
  if (!r.ok) throw new Error(`board ${sport}: HTTP ${r.status}`);
  const j = (await r.json()) as { items: BoardItem[]; generated_at?: string };
  const games = j.items.map((i): PublishedGame => {
    const by = (id: string | null) => i.participants.find((p) => p.participant_id === id);
    const home = by(i.home_participant) ?? i.participants[0];
    const away = by(i.away_participant) ?? i.participants[1];
    return { eventId: i.event_id, startUtc: i.start_time_utc, league: i.league ?? null, home, away };
  });
  return { games, items: j.items, generatedAt: j.generated_at ?? null };
}

export function eventsNear(sport: LiveSport, games: PublishedGame[], now: number, beforeMs: number, afterMs: number): ObservedEvent[] {
  return observedFromGames(sport, games.filter((g) => { const t = Date.parse(g.startUtc); return t >= now - beforeMs && t <= now + afterMs; }));
}

export const providers = (events: (s: LiveSport) => ObservedEvent[]): Record<string, LiveScoreProvider> => ({
  sportscore: sportscoreProvider({ events }),
  espn: espnProvider({ events }),
});

export interface PairReport {
  sport: LiveSport; provider: string; events: number; offered: number; matched: number;
  refused: Record<string, number>;
  /** Board games the provider did not match, with the reason, and what the provider listed near that time (to see why). */
  unmatched: { event: string; start: string; reason: string; detail: string; nearby: string[] }[];
  /** Provider games that matched no board game: a different slate, or an alias to add. */
  providerOnly: string[];
}

export function pairReport(sport: LiveSport, provider: string, evs: ObservedEvent[], games: LiveGame[]): { report: PairReport; pairs: ReturnType<typeof pairGames> } {
  const dir = new TeamDirectory(sport, evs.flatMap((e) => [e.home, e.away]));
  const canon = games.map((g) => canonicalizeGame(g, dir));
  const pairs = pairGames(evs.map((e) => e.ref), canon);
  const refused: Record<string, number> = {};
  const used = new Set<LiveGame>();
  const unmatched: PairReport['unmatched'] = [];
  for (const p of pairs) {
    if (p.game) { used.add(p.game); continue; }
    const reason = p.result.ok ? 'NONE' : p.result.reason;
    refused[reason] = (refused[reason] ?? 0) + 1;
    const t = Date.parse(p.event.startUtc);
    const nearby = canon.filter((g) => Math.abs(Date.parse(g.startUtc) - t) < 3 * 3600_000).filter((g) => g.home.name.split(' ')[0] === p.event.home.name.split(' ')[0] || g.away.name.split(' ')[0] === p.event.away.name.split(' ')[0]).slice(0, 3).map((g) => `${g.away.name} @ ${g.home.name} ${g.startUtc}`);
    if (unmatched.length < 12) unmatched.push({ event: `${p.event.away.name} @ ${p.event.home.name}`, start: p.event.startUtc, reason, detail: p.result.ok ? '' : p.result.detail, nearby });
  }
  const providerOnly = canon.filter((g) => !used.has(g)).slice(0, 10).map((g) => `${g.away.name} @ ${g.home.name} ${g.startUtc} ${g.phase}`);
  return { report: { sport, provider, events: evs.length, offered: games.length, matched: used.size, refused, unmatched, providerOnly }, pairs };
}

// Provider JSON is untrusted; the reference parsers below read it loosely on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
// ---- reference parsers (cross-check only) -------------------------------------------------------------------------------------
const num = (x: unknown) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
const NHL_STATE: Record<string, GamePhase> = { FUT: 'SCHEDULED', PRE: 'SCHEDULED', LIVE: 'LIVE', CRIT: 'LIVE', FINAL: 'FINAL', OFF: 'FINAL', PPD: 'POSTPONED' };

/** The NHL's own scoreboard for each day asked (`score/now` is the last completed day, so the days of the games on screen are asked for by date). */
export async function nhlOfficial(days: string[] = []): Promise<LiveGame[]> {
  const urls = days.length ? days.map((d) => `https://api-web.nhle.com/v1/score/${d}`) : ['https://api-web.nhle.com/v1/score/now'];
  const lists: Record<string, any>[][] = [];
  for (const u of urls) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`nhl official HTTP ${r.status}`);
    lists.push(((await r.json()) as { games?: Record<string, any>[] }).games ?? []);
  }
  const at = new Date().toISOString();
  return lists.flat().map((g): LiveGame => ({
    schema: 'sift.live_game/1', sport: 'NHL', league: 'NHL', startUtc: g.startTimeUTC,
    home: { key: teamKey('NHL', g.homeTeam.abbrev), name: g.homeTeam.name?.default ?? g.homeTeam.abbrev, abbr: g.homeTeam.abbrev, providerTeamId: null },
    away: { key: teamKey('NHL', g.awayTeam.abbrev), name: g.awayTeam.name?.default ?? g.awayTeam.abbrev, abbr: g.awayTeam.abbrev, providerTeamId: null },
    phase: NHL_STATE[g.gameState] ?? 'UNKNOWN', rawStatus: g.gameState,
    score: num(g.homeTeam.score) != null && num(g.awayTeam.score) != null ? { home: num(g.homeTeam.score)!, away: num(g.awayTeam.score)! } : null,
    clock: g.periodDescriptor ? { period: g.periodDescriptor.number ?? null, periodLabel: g.periodDescriptor.periodType ?? null, display: g.clock?.timeRemaining ?? null, seconds: g.clock?.secondsRemaining ?? null, direction: 'down', running: g.clock?.running ?? null } : null,
    situation: null, provenance: { provider: 'nhl-official', providerGameId: String(g.id), providerUpdatedAt: null, fetchedAt: at, attribution: null },
  }));
}

export async function mlbOfficial(day: string): Promise<LiveGame[]> {
  const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=linescore,team`);
  if (!r.ok) throw new Error(`mlb official HTTP ${r.status}`);
  const j = (await r.json()) as { dates?: { games?: Record<string, any>[] }[] };
  const at = new Date().toISOString();
  const phase = (s: string): GamePhase => (s === 'Live' ? 'LIVE' : s === 'Final' ? 'FINAL' : s === 'Preview' ? 'SCHEDULED' : 'UNKNOWN');
  return (j.dates ?? []).flatMap((d) => d.games ?? []).map((g): LiveGame => ({
    schema: 'sift.live_game/1', sport: 'MLB', league: 'MLB', startUtc: g.gameDate,
    home: { key: teamKey('MLB', g.teams.home.team.abbreviation ?? g.teams.home.team.name), name: g.teams.home.team.name, abbr: g.teams.home.team.abbreviation ?? null, providerTeamId: null },
    away: { key: teamKey('MLB', g.teams.away.team.abbreviation ?? g.teams.away.team.name), name: g.teams.away.team.name, abbr: g.teams.away.team.abbreviation ?? null, providerTeamId: null },
    phase: phase(g.status?.abstractGameState), rawStatus: g.status?.detailedState ?? null,
    score: num(g.teams.home.score) != null && num(g.teams.away.score) != null ? { home: num(g.teams.home.score)!, away: num(g.teams.away.score)! } : null,
    clock: g.linescore ? { period: g.linescore.currentInning ?? null, periodLabel: `${g.linescore.inningHalf ?? ''} ${g.linescore.currentInningOrdinal ?? ''}`.trim() || null, display: null, seconds: null, direction: null, running: null } : null,
    situation: null, provenance: { provider: 'mlb-official', providerGameId: String(g.gamePk), providerUpdatedAt: null, fetchedAt: at, attribution: null },
  }));
}

/**
 * Compare two feeds' view of the same SIFT games: only events BOTH matched with certainty (through the production matcher) are compared,
 * so a disagreement is a real difference between the feeds, never a naming artefact.
 */
export function compareByEvent(a: ReturnType<typeof pairGames>, b: ReturnType<typeof pairGames>) {
  const rows: { game: string; a: string; b: string; agree: boolean; why?: string }[] = [];
  const byB = new Map(b.map((p) => [p.event.eventId, p.game]));
  for (const pa of a) {
    const x = pa.game; const y = byB.get(pa.event.eventId);
    if (!x || !y) continue;
    const sa = x.score ? `${x.score.away}-${x.score.home}` : '-';
    const sb = y.score ? `${y.score.away}-${y.score.home}` : '-';
    const samePhase = x.phase === y.phase;
    const sameScore = sa === sb;
    rows.push({ game: `${pa.event.away.name} @ ${pa.event.home.name}`, a: `${x.phase} ${sa}`, b: `${y.phase} ${sb}`, agree: samePhase && sameScore, ...(samePhase && sameScore ? {} : { why: [!samePhase && 'phase', !sameScore && 'score'].filter(Boolean).join('+') }) });
  }
  return { compared: rows.length, agree: rows.filter((r) => r.agree).length, rows };
}
