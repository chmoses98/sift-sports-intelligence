// @vitest-environment node
// LIVE verification, watch mode: poll the real feeds through the production adapters and matcher for N minutes and log every change
// (score, period, clock, phase) of every matched game, per source. Skipped unless LIVE_WATCH=1. Output: VERIFY_OUT/watch.jsonl (one line per
// change or heartbeat) and VERIFY_OUT/watch-summary.json (per-sport counts, monotonicity, cross-source agreement and update latency).
//
//   LIVE_WATCH=1 WATCH_MINUTES=180 WATCH_INTERVAL=20 VERIFY_OUT=./watch-out npx vitest run tests/live/liveWatch.test.ts
import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_SPORTS, eventsNear, loadBoard, mlbOfficial, nhlOfficial, pairReport, providers } from './support/liveVerify';
import type { LiveGame, LiveSport, ObservedEvent } from '../../src/live/scores/types';
import type { PublishedGame } from '../../src/v4/scoreState';

const RUN = process.env.LIVE_WATCH === '1';
const MINUTES = Number(process.env.WATCH_MINUTES ?? 30);
const INTERVAL = Math.max(15, Number(process.env.WATCH_INTERVAL ?? 20));
const OUT = process.env.VERIFY_OUT ?? 'watch-out';

interface Obs { t: number; provider: string; sport: LiveSport; event: string; phase: string; period: number | null; clock: string | null; score: string | null }

describe.skipIf(!RUN)('watch real feeds', () => {
  it('logs every change for the whole window', async () => {
    mkdirSync(OUT, { recursive: true });
    const log = join(OUT, 'watch.jsonl');
    const boards = new Map<LiveSport, PublishedGame[]>();
    const loadAll = async () => { for (const s of BOARD_SPORTS) { try { boards.set(s, (await loadBoard(s)).games); } catch { /* keep the last */ } } };
    await loadAll();
    const last = new Map<string, string>();
    const history: Obs[] = [];
    const end = Date.now() + MINUTES * 60_000;
    let nextBoards = Date.now() + 30 * 60_000;
    let cycles = 0;
    const live = new Map<LiveSport, ObservedEvent[]>();
    const ps = providers((s) => live.get(s) ?? []);
    while (Date.now() < end) {
      const started = Date.now();
      if (started > nextBoards) { await loadAll(); nextBoards = started + 30 * 60_000; }
      for (const s of BOARD_SPORTS) live.set(s, eventsNear(s, boards.get(s) ?? [], started, 9 * 3600_000, 45 * 60_000));
      const sources: { id: string; sport: LiveSport; games: LiveGame[] }[] = [];
      await Promise.all([
        ...Object.entries(ps).flatMap(([pid, p]) => p.sports.filter((s) => (live.get(s) ?? []).length).map(async (sport) => {
          try { sources.push({ id: pid, sport, games: (await p.fetchScoreboard(sport)).games }); }
          catch (e) { appendFileSync(log, JSON.stringify({ t: Date.now(), provider: pid, sport, error: String(e).slice(0, 160) }) + '\n'); }
        })),
        (async () => { if ((live.get('NHL') ?? []).length) { try { sources.push({ id: 'nhl-official', sport: 'NHL', games: await nhlOfficial([...new Set([started, started - 86400000].map((t) => new Date(t).toISOString().slice(0, 10)))]) }); } catch (e) { appendFileSync(log, JSON.stringify({ t: Date.now(), provider: 'nhl-official', error: String(e).slice(0, 160) }) + '\n'); } } })(),
        (async () => {
          if (!(live.get('MLB') ?? []).length) return;
          try { const d = (n: number) => new Date(started - n * 86400000).toISOString().slice(0, 10); sources.push({ id: 'mlb-official', sport: 'MLB', games: [...(await mlbOfficial(d(0))), ...(await mlbOfficial(d(1)))] }); }
          catch (e) { appendFileSync(log, JSON.stringify({ t: Date.now(), provider: 'mlb-official', error: String(e).slice(0, 160) }) + '\n'); }
        })(),
      ]);
      const t = Date.now();
      for (const src of sources) {
        const evs = live.get(src.sport) ?? [];
        const { report, pairs } = pairReport(src.sport, src.id, evs, src.games);
        if (cycles % 15 === 0) appendFileSync(log, JSON.stringify({ t, heartbeat: true, provider: src.id, sport: src.sport, events: report.events, offered: report.offered, matched: report.matched, refused: report.refused }) + '\n');
        for (const p of pairs) {
          const g = p.game; if (!g) continue;
          const o: Obs = { t, provider: src.id, sport: src.sport, event: p.event.eventId, phase: g.phase, period: g.clock?.period ?? null, clock: g.clock?.display ?? g.clock?.periodLabel ?? null, score: g.score ? `${g.score.away}-${g.score.home}` : null };
          const key = `${o.provider}|${o.event}`;
          const sig = `${o.phase}|${o.period}|${o.clock}|${o.score}`;
          if (last.get(key) === sig) continue;
          appendFileSync(log, JSON.stringify({ ...o, name: `${p.event.away.name} @ ${p.event.home.name}`, prev: last.get(key) ?? null, startUtc: p.event.startUtc }) + '\n');
          last.set(key, sig); history.push(o);
        }
      }
      cycles++;
      const wait = INTERVAL * 1000 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    // summary
    const sums: Record<string, unknown> = {};
    const groups = history.reduce<Record<string, Obs[]>>((m, o) => { (m[`${o.provider}|${o.sport}`] ??= []).push(o); return m; }, {});
    for (const [k, list] of Object.entries(groups)) {
      let violations = 0;
      const evs = list.reduce<Record<string, Obs[]>>((m, o) => { (m[o.event] ??= []).push(o); return m; }, {});
      for (const seq of Object.values(evs)) {
        let prev: number[] | null = null;
        for (const o of seq) {
          const cur = o.score ? o.score.split('-').map(Number) : null;
          if (prev && cur && (cur[0] < prev[0] || cur[1] < prev[1])) violations++;
          if (cur) prev = cur;
        }
      }
      sums[k] = { changes: list.length, games: Object.keys(evs).length, scoreDecreases: violations };
    }
    // update latency: for each (event, score) the time each source first showed it, relative to the earliest source
    const first = new Map<string, Map<string, number>>();
    for (const o of history) if (o.score && (o.phase === 'LIVE' || o.phase === 'BREAK')) { const k = `${o.sport}|${o.event}|${o.score}`; const m = first.get(k) ?? new Map(); if (!m.has(o.provider)) m.set(o.provider, o.t); first.set(k, m); }
    const lag: Record<string, number[]> = {};
    for (const m of first.values()) if (m.size > 1) { const t0 = Math.min(...m.values()); for (const [p, t] of m) (lag[p] ??= []).push((t - t0) / 1000); }
    const q = (a: number[], f: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
    const latency = Object.fromEntries(Object.entries(lag).map(([p, a]) => [p, { n: a.length, medianSecBehindFastest: q(a, 0.5), p90: q(a, 0.9) }]));
    writeFileSync(join(OUT, 'watch-summary.json'), JSON.stringify({ minutes: MINUTES, intervalSec: INTERVAL, cycles, sums, latency }, null, 1));
    expect(cycles).toBeGreaterThan(0);
  }, (MINUTES + 10) * 60_000);
});
