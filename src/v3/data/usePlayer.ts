// Player research data: real game logs (the NFL history layer, or a box-score log carried on the sport's player profile) joined with
// the player's own Kalshi contracts on the coming game; or a labelled deterministic sample. One view-model for both.
import { useMemo } from 'react';
import { useAsync, useRepo } from '../../data/hooks';
import { useLiveQuotes } from '../../live/hooks';
import { overlayLive } from './liveMarket';
import { sportBySlug } from '../../data/sports';
import { heroTeam } from '../../lib/hero/input';
import { broadcastPlayerPhoto } from '../../components/sift2/playerArt';
import { usePlayerHistory } from '../../history/load';
import { NFL_STATS, statsForPosition } from '../../history/stats';
import { skipReason } from '../../history/hitRate';
import { readBoxLog, num, type BoxRow } from '../../history/boxLog';
import { nbaPlayed } from '../../history/nbaLog';
import type { GameLogRow } from '../../history/types';
import { demoOn } from '../state/prefs';
import { failureKind, whyUnavailable } from './failure';
import { deriveLines, deriveProps, type PropRow } from './adapt';
import { useEventDetail } from './useGameExtras';
import { useGameStart } from './research/gameHooks';
import { useSlate } from './useSlate';
import { withRest, type Obs } from '../model/research';
import type { MarketLine, V3Game, V3Team } from '../model/types';

export interface PlayerStat { key: string; label: string; short: string }
export interface PlayerVM {
  id: string;
  name: string;
  position: string | null;
  /** The player's id in the history and projection publications (NFL: gsis), when the profile carries one. */
  extId: string | null;
  team: V3Team | null;
  photo: { src: string; focus: string; credit: string } | null;
  sport: string;
  stats: PlayerStat[];
  obs: Obs[];
  season: string | null;
  props: Map<string, PropRow>;
  next: V3Game | null;
  /** The coming game's Kalshi spread and total (lines, not prices), for the game strip. */
  gameLines: MarketLine[];
  /** The coming game's league week (football), from its event's competition label. */
  nextWeek: number | null;
  /** The coming game's start from the league schedule carried on the event document; the slate's own time otherwise. */
  nextStartMs: number | null;
  opp: V3Team | null;
  nextHome: boolean | null;
  provenance: 'publication' | 'demo' | 'none';
  asOf: string | null;
  /** Why the chart is empty, in words. */
  why: string | null;
  hasMinutes: boolean;
  hasScore: boolean;
}

const NFL_SHORT: Record<string, string> = { passing_yards: 'PASS YDS', attempts: 'ATT', completions: 'CMP', passing_tds: 'PASS TD', interceptions: 'INT', rushing_yards: 'RUSH YDS', carries: 'CAR', longest_rush: 'LNG RUSH', receiving_yards: 'REC YDS', receptions: 'REC', targets: 'TGT', longest_reception: 'LNG REC', rush_rec_yards: 'RUSH+REC', touchdowns: 'TD' };

const BOX: Record<string, PlayerStat[]> = {
  NBA: [{ key: 'pts', label: 'Points', short: 'PTS' }, { key: 'ast', label: 'Assists', short: 'AST' }, { key: 'reb', label: 'Rebounds', short: 'REB' }, { key: 'fg3m', label: '3-pointers made', short: '3PM' }, { key: 'pra', label: 'Points + rebounds + assists', short: 'PRA' }],
  NHL: [{ key: 'g', label: 'Goals', short: 'G' }, { key: 'a', label: 'Assists', short: 'A' }, { key: 'p', label: 'Points', short: 'PTS' }],
};

/** A contract's stat word to the log's stat key, where the two publications spell it differently (hockey and basketball box logs). */
const PROP_STAT_ALIAS: Record<string, Record<string, string>> = {
  NBA: { points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m', three_pointers: 'fg3m' },
  NHL: { goals: 'g', assists: 'a', points: 'p' },
};
export const propStatKey = (sport: string, stat: string) => PROP_STAT_ALIAS[sport]?.[stat] ?? stat;

/** Pill order: the statistics people research first lead (the locked design opens a receiver on receptions), the rest keep their order. */
const STAT_LEAD: Record<string, string[]> = { NFL: ['receptions', 'targets', 'receiving_yards', 'touchdowns'] };
export function orderStats(sport: string, stats: PlayerStat[]): PlayerStat[] {
  const lead = STAT_LEAD[sport] ?? [];
  const rank = (k: string) => { const i = lead.indexOf(k); return i < 0 ? lead.length : i; };
  return [...stats].sort((a, b) => rank(a.key) - rank(b.key));
}

const mkTeam = (sport: string, slug: string, code: string, name: string): V3Team => {
  const h = heroTeam(sport, code, name);
  return { id: code, slug, sport, name: h?.name ?? name, nick: h?.short ?? name, abbr: code, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
};

export function nflObs(rows: GameLogRow[], stats: PlayerStat[], defaultSeason: number): Omit<Obs, 'rest'>[] {
  return rows.filter((r) => r.date).map((r) => {
    const v: Record<string, number | null> = {};
    for (const s of stats) { const d = NFL_STATS.find((x) => x.key === s.key)!; v[s.key] = skipReason(r, d) ? null : d.get(r); }
    const season = String(r.season ?? defaultSeason);
    return { key: r.game_id, date: r.date!, opp: r.opp, home: r.home, v, min: null, margin: r.score ? r.score.for - r.score.against : null, season, eventId: null, label: `${r.home === false ? '@' : 'vs'} ${r.opp}${r.week ? ` · wk ${r.week}` : ''}`, week: r.week ?? null, snap: r.snaps?.pct ?? null, tgtShare: r.receiving.target_share ?? null };
  });
}

export function boxObs(rows: BoxRow[], stats: PlayerStat[]): Omit<Obs, 'rest'>[] {
  return nbaPlayed(rows).map((r) => {
    const v: Record<string, number | null> = {};
    for (const s of stats) v[s.key] = s.key === 'pra' ? ((num(r.pts) ?? 0) + (num(r.reb) ?? 0) + (num(r.ast) ?? 0)) : num(r[s.key]);
    const date = String(r.date_et ?? r.date ?? '');
    return { key: String(r.event_id ?? date), date, opp: String(r.opp ?? ''), home: typeof r.home === 'boolean' ? r.home : null, v, min: num(r.min), margin: null, season: r.season ? String(r.season) : null, eventId: r.event_id ? String(r.event_id) : null, label: `${r.home === false ? '@' : 'vs'} ${r.opp}`, week: null };
  }).filter((r) => r.date);
}

// ---------------------------------------------------------------- sample player (clearly labelled)

const hash = (s: string) => { let h = 3; for (const c of s) h = (h * 37 + c.charCodeAt(0)) >>> 0; return h; };

export const DEMO_PLAYER_ID = 'sample-guard';
function demoVM(slug: string, games: V3Game[]): PlayerVM {
  const g = games.find((x) => x.slug === 'nba' && x.phase !== 'final') ?? games.find((x) => x.slug === slug) ?? games[0];
  const team = g?.home ?? mkTeam('NBA', 'nba', 'NYK', 'New York Knicks');
  const opp = g ? (g.home.id === team.id ? g.away : g.home) : mkTeam('NBA', 'nba', 'BOS', 'Boston Celtics');
  const opps = ['CLE', 'BOS', 'DET', 'CHA', 'MIA', 'ORL', 'BKN', 'TOR', 'CLE', 'BOS', 'PHI', 'IND', 'ATL', 'CHI', 'MIL', 'WAS', 'NOP', 'MEM', 'DEN', 'LAL'];
  const rows: Omit<Obs, 'rest'>[] = opps.map((o, i) => {
    const d = new Date(2026, 9, 28 - (opps.length - i) * 2);
    const pts = 17 + (hash(`${o}${i}`) % 22), ast = 3 + (hash(`a${i}`) % 8), reb = 2 + (hash(`r${i}`) % 6), tp = hash(`t${i}`) % 5;
    return { key: `s${i}`, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, opp: o, home: i % 2 === 0, v: { pts, ast, reb, fg3m: tp, pra: pts + ast + reb }, min: 28 + (hash(`m${i}`) % 11), margin: ((hash(`g${i}`) % 31) - 12), season: '2026-27', eventId: null, label: `${i % 2 ? '@' : 'vs'} ${o}` };
  });
  const mk = (stat: string, line: number, ask: number): [string, PropRow] => [stat, { key: `demo|${stat}`, player: 'Sample Guard', playerId: DEMO_PLAYER_ID, stat, statLabel: stat, line, price: { ask, bid: ask - 1, implied: ask - 0.5, ticker: `SAMPLE-${stat.toUpperCase()}-${line}`, side: 'YES', description: `SAMPLE: Sample Guard over ${line} ${stat}`, observedAt: new Date().toISOString(), source: 'Sample', tradable: true, marketStatus: 'open' as const }, ladder: [line - 2, line, line + 2].map((l, i) => ({ ask: ask + (1 - i) * 7, bid: ask + (1 - i) * 7 - 1, implied: ask + (1 - i) * 7 - 0.5, ticker: `SAMPLE-${stat.toUpperCase()}-${l}`, side: 'YES' as const, description: `SAMPLE: Sample Guard over ${l} ${stat}`, observedAt: new Date().toISOString(), source: 'Sample' as const, tradable: true, marketStatus: 'open' as const })), rungs: [line - 2, line, line + 2].map((l, i) => ({ line: l, price: { ask: ask + (1 - i) * 7, bid: ask + (1 - i) * 7 - 1, implied: ask + (1 - i) * 7 - 0.5, ticker: `SAMPLE-${stat.toUpperCase()}-${l}`, side: 'YES' as const, description: `SAMPLE: Sample Guard over ${l} ${stat}`, observedAt: new Date().toISOString(), source: 'Sample' as const, tradable: true, marketStatus: 'open' as const } })), teamAbbr: team.abbr }];
  return {
    id: DEMO_PLAYER_ID, name: 'Sample Guard', position: 'G', extId: null, team, photo: null, sport: 'NBA', stats: BOX.NBA, obs: withRest(rows), season: '2026-27',
    props: new Map([mk('pts', 27.5, 52), mk('ast', 6.5, 49), mk('reb', 4.5, 51), mk('fg3m', 2.5, 48), mk('pra', 38.5, 50)]),
    next: g ?? null, gameLines: [], nextWeek: null, nextStartMs: g?.startMs ?? null, opp, nextHome: g ? g.home.id === team.id : null, provenance: 'demo', asOf: null, why: null, hasMinutes: true, hasScore: true,
  };
}

// ---------------------------------------------------------------- real

export function usePlayerVM(slug: string, pid: string) {
  const slate = useSlate();
  const demo = demoOn();
  const sport = sportBySlug(slug);
  const repo = useRepo(demo ? undefined : sport);
  const explorer = !!repo.data?.hasExplorer;
  const prof = useAsync(explorer ? `v3:pprof:${slug}:${pid}` : null, () => repo.data!.profile(pid));
  const idx = useAsync(explorer ? `v3:si:${slug}` : null, () => repo.data!.searchIndex());
  const gsis = ((prof.data?.entity.source_ids?.gsis_id as string | undefined) ?? ((prof.data?.extensions as { gsis_id?: string } | null)?.gsis_id)) ?? null;
  const hist = usePlayerHistory(sport?.code ?? slug.toUpperCase(), gsis);
  const entry = idx.data?.items.find((x) => x.id === pid);
  const teamCode = prof.data?.team?.short_name ?? entry?.context.team ?? null;
  const next = useMemo(() => (teamCode ? slate.games.filter((g) => g.slug === slug && (g.away.id === teamCode || g.home.id === teamCode) && (g.phase === 'pregame' || g.phase === 'live')).sort((a, b) => a.startMs - b.startMs)[0] ?? null : null), [slate.games, slug, teamCode]);
  const detail = useEventDetail(next?.slug ?? '', next?.eventId ?? '', !!next && !demo);
  // His game's start is the league schedule's (the schedule authority: data/research/scheduleStarts.ts), never the event document's own field or Kalshi's.
  const nextStart = useGameStart(demo ? null : next);
  // His contracts on the coming game, kept current by the shared live-quote store (the same overlay the game screens use).
  const mine = useMemo(() => (detail.data?.markets ?? []).filter((m) => m.player_id === pid), [detail.data, pid]);
  const liveQ = useLiveQuotes(!demo && mine.length ? mine.map((m) => m.kalshi_ticker) : undefined, 'detail');

  const vm = useMemo<PlayerVM | null>(() => {
    if (demo) return demoVM(slug, slate.games);
    const p = prof.data;
    if (!p) return null;
    const code = sport?.code ?? slug.toUpperCase();
    const position = hist.data?.position ?? (p.entity.metadata?.position as string | undefined) ?? entry?.context.position ?? null;
    const team = teamCode ? slate.games.flatMap((g) => [g.away, g.home]).find((t) => t.slug === slug && t.id === teamCode) ?? mkTeam(code, slug, teamCode, teamCode) : null;
    let stats: PlayerStat[];
    let rows: Omit<Obs, 'rest'>[] = [];
    let why: string | null = null;
    let hasMinutes = false, hasScore = false, season: string | null = null;
    if (code === 'NFL') {
      const posStats = statsForPosition(position ?? '');
      stats = orderStats('NFL', (posStats.length ? posStats : NFL_STATS.slice(0, 4)).map((s) => ({ key: s.key, label: s.label, short: NFL_SHORT[s.key] ?? s.key })));
      if (hist.data) {
        const all = [...(hist.data.prior?.games ?? []).map((g) => ({ ...g, season: g.season ?? hist.data!.prior!.season })), ...hist.data.games.map((g) => ({ ...g, season: g.season ?? hist.data!.season }))];
        rows = nflObs(all, stats, hist.data.season); hasScore = true; season = String(hist.data.season);
      } else if (!hist.loading) why = hist.error ? `The game log could not be shown: ${whyUnavailable(hist.error)}.` : 'No game log is published for this player (a rookie, or no offensive snaps yet).';
    } else {
      const box = readBoxLog((p.extensions as { game_log?: unknown } | null)?.game_log);
      stats = (BOX[code] ?? []).filter((s) => s.key === 'pra' || (box ?? []).some((r) => r[s.key] != null));
      if (box?.length && stats.length) { rows = boxObs(box, stats); hasMinutes = rows.some((r) => r.min != null); season = rows.at(-1)?.season ?? null; }
      else why = `The publication carries no game log for this ${code === 'NBA' ? 'player' : 'player yet'}.`;
    }
    const sorted = withRest(rows.sort((a, b) => a.date.localeCompare(b.date)));
    // His contracts on the coming game, by stat key.
    const props = new Map<string, PropRow>();
    for (const r of deriveProps(mine.map((m) => overlayLive(m, liveQ.quote(m.kalshi_ticker))))) {
      const key = propStatKey(code, r.stat);
      if (r.playerId === pid && !props.has(key)) props.set(key, { ...r, stat: key });
    }
    const opp = next ? (next.home.id === teamCode ? next.away : next.home) : null;
    return {
      id: pid, name: p.entity.display_name, position, extId: gsis, team, photo: broadcastPlayerPhoto(pid, p.entity.display_name, teamCode ?? '', 'portrait'), sport: code, stats, obs: sorted, season,
      props, next, gameLines: next && detail.data ? deriveLines(detail.data.markets, next.away, next.home, { away: detail.data.event.away_participant ?? null, home: detail.data.event.home_participant ?? null }) : [], nextWeek: (() => { const w = /\bweek\s+(\d+)/i.exec(detail.data?.event?.competition ?? ''); return w ? Number(w[1]) : null; })(), nextStartMs: nextStart ?? next?.startMs ?? null, opp, nextHome: next ? next.home.id === teamCode : null, provenance: 'publication', asOf: p.generated_at ?? null, why, hasMinutes, hasScore,
    };
    // liveQ.version: the store's quotes change under a stable lookup function
  }, [demo, slug, slate.games, prof.data, hist.data, hist.loading, hist.error, sport, entry, teamCode, detail.data, mine, liveQ.version, next, nextStart, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !demo && (repo.loading || (explorer && (prof.loading || hist.loading)));
  // Why there is no player when a document failed (so the screen says "could not be read" and offers Retry, not "not in the publication").
  // (A 404 for the profile is an answer, not a failure: the player is not in the publication.)
  const hard = (e: unknown) => (e != null && failureKind(e) !== 'not-published' ? e : undefined);
  const failure = !demo ? hard(prof.error) ?? hard(idx.error) ?? hard(repo.error) : undefined;
  const retry = () => { repo.retry?.(); prof.retry?.(); idx.retry?.(); };
  return { vm, loading, notFound: !demo && !loading && !vm && !failure, noExplorer: !demo && !repo.loading && !explorer && !failure, marketsLoading: !demo && !!next && detail.loading, error: !vm ? failure : undefined, retry, marketsError: !demo && next ? detail.error : undefined, marketsRetry: detail.retry, histError: !demo ? hist.error : undefined, histRetry: hist.retry };
}
