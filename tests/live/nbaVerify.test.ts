// @vitest-environment node
// LIVE verification for NBA, through the production code path: what SIFT would DISPLAY for each published NBA game (SportScore's
// /api/v1/fixtures/ at the app's own 60-second cadence, the production parser, identity matcher and freshness view) against an independent
// authoritative reading of the same games (the NBA's own scoreboard), sampled every 30 s. Skipped unless LIVE_NBA=1.
//
//   LIVE_NBA=1 NBA_MINUTES=330 VERIFY_OUT=./nba-out ORACLE_OUT=./nba-oracle npx vitest run tests/live/nbaVerify.test.ts
//
// The oracle is for verification only: nothing it returns is shown in SIFT or committed. Its raw readings stay in ORACLE_OUT (not published);
// VERIFY_OUT gets only SportScore's own values plus verdicts (agree / differ by n), in nba-compare.jsonl and nba-summary.json.
//
// Alongside the production endpoint, SportScore's explicitly documented /api/widget/matches/ is read once a minute and compared with it,
// to learn whether the widget endpoint (named in the free-tier terms) could carry NBA on its own.
import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { eventsNear, loadBoard, pairReport } from './support/liveVerify';
import { sportscoreProvider, parseSportscore } from '../../src/live/scores/providers/sportscore';
import { scoreView } from '../../src/live/scores/freshness';
import type { LiveGame, ObservedEvent } from '../../src/live/scores/types';
import type { PublishedGame } from '../../src/v4/scoreState';

const RUN = process.env.LIVE_NBA === '1';
const MINUTES = Number(process.env.NBA_MINUTES ?? 60);
const OUT = process.env.VERIFY_OUT ?? 'nba-out';
const ORACLE_OUT = process.env.ORACLE_OUT ?? 'nba-oracle';
const TICK_MS = 30_000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ORACLE_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const WIDGET_URL = 'https://sportscore.com/api/widget/matches/?sport=basketball&limit=50&src=sift-personal-verify';

interface OracleGame { id: string; status: number; text: string; period: number; clock: string | null; startUtc: string; home: string; away: string; hs: number | null; as: number | null }
const n = (x: unknown) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
const norm = (s: string) => s.toLowerCase().replace(/\bla\b/g, 'los angeles').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
/** The oracle names a club by city + nickname; the board by its full name. Equal when one ends with the other's nickname and the cities agree. */
const sameClub = (boardName: string, oracleName: string) => { const a = norm(boardName); const b = norm(oracleName); return a === b || a.endsWith(b) || b.endsWith(a); };
const oraclePhase = (g: OracleGame) => (g.status === 3 ? 'FINAL' : g.status === 2 ? (/half|end of|intermission/i.test(g.text) ? 'BREAK' : 'LIVE') : 'SCHEDULED');
const liveish = (p: string) => p === 'LIVE' || p === 'BREAK';

describe.skipIf(!RUN)('NBA: what SIFT displays against the NBA scoreboard', () => {
  it('compares every 30 s for the whole window', async () => {
    mkdirSync(OUT, { recursive: true }); mkdirSync(ORACLE_OUT, { recursive: true });
    const compareLog = join(OUT, 'nba-compare.jsonl');
    const oracleLog = join(ORACLE_OUT, 'nba-oracle.jsonl');
    const api = await request.newContext({ userAgent: UA, extraHTTPHeaders: { Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com' } });
    const readOracle = async (): Promise<{ ok: boolean; status?: number; games: OracleGame[] }> => {
      try {
        const r = await api.get(ORACLE_URL, { timeout: 20_000 });
        if (!r.ok()) return { ok: false, status: r.status(), games: [] };
        const j = await r.json();
        const games = (j.scoreboard?.games ?? []).map((g: Record<string, any>): OracleGame => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          id: g.gameId, status: g.gameStatus, text: String(g.gameStatusText ?? '').trim(), period: g.period ?? 0, clock: g.gameClock ?? null, startUtc: g.gameTimeUTC,
          home: `${g.homeTeam?.teamCity ?? ''} ${g.homeTeam?.teamName ?? ''}`.trim(), away: `${g.awayTeam?.teamCity ?? ''} ${g.awayTeam?.teamName ?? ''}`.trim(),
          hs: n(g.homeTeam?.score), as: n(g.awayTeam?.score),
        }));
        return { ok: true, status: r.status(), games };
      } catch { return { ok: false, games: [] }; }
    };

    let board: PublishedGame[] = (await loadBoard('NBA')).games;
    let nextBoard = Date.now() + 20 * 60_000;
    let events: ObservedEvent[] = [];
    const provider = sportscoreProvider({ events: () => events });
    let held: LiveGame[] = []; let heldAt = 0; let heldErr: string | null = null;
    let widget: LiveGame[] = [];
    let lastFetch = 0;
    const lastSig = new Map<string, string>();
    const lastLogged = new Map<string, number>();
    interface Tick { t: number; sift: string | null; oracle: string | null; siftPhase: string | null; oraclePhase: string | null; mode: string | null; ageSec: number | null; label: string | null }
    const ticks = new Map<string, Tick[]>();
    const names = new Map<string, string>();
    let wrongMatches = 0; let oracleFailures = 0; let cycles = 0; let sportscoreErrors = 0; let widgetMisses = 0; let widgetChecks = 0; let widgetDiffers = 0;
    const end = Date.now() + MINUTES * 60_000;

    const summarise = () => {
      const games: Record<string, unknown> = {};
      for (const [ev, list] of ticks) {
        const bothLive = list.filter((x) => x.sift && x.oracle);
        const scoreOk = bothLive.filter((x) => x.sift === x.oracle);
        const phaseTicks = list.filter((x) => x.siftPhase && x.oraclePhase);
        const phaseOk = phaseTicks.filter((x) => x.siftPhase === x.oraclePhase || (liveish(x.siftPhase!) && liveish(x.oraclePhase!)));
        // score lag: the first moment the oracle showed a score vs the first moment SIFT showed it
        const firstO = new Map<string, number>(); const firstS = new Map<string, number>();
        for (const x of list) { if (x.oracle && !firstO.has(x.oracle)) firstO.set(x.oracle, x.t); if (x.sift && !firstS.has(x.sift)) firstS.set(x.sift, x.t); }
        const lags: number[] = [];
        for (const [s, to] of firstO) { const ts = firstS.get(s); if (ts != null && s !== '0-0') lags.push((ts - to) / 1000); }
        lags.sort((a, b) => a - b);
        const q = (f: number) => (lags.length ? lags[Math.min(lags.length - 1, Math.floor(f * lags.length))] : null);
        let decreases = 0; let prev: number[] | null = null;
        for (const x of list) { if (!x.sift) continue; const cur = x.sift.split('-').map(Number); if (prev && (cur[0] < prev[0] || cur[1] < prev[1])) decreases++; prev = cur; }
        const last = list[list.length - 1];
        const transitions: string[] = []; let lp = '';
        for (const x of list) { const p = x.siftPhase ?? '-'; if (p !== lp) { transitions.push(`${new Date(x.t).toISOString().slice(11, 19)}Z ${p}`); lp = p; } }
        const ages = list.map((x) => x.ageSec).filter((a): a is number => a != null).sort((a, b) => a - b);
        const modes = list.reduce<Record<string, number>>((m, x) => { if (x.mode) m[x.mode] = (m[x.mode] ?? 0) + 1; return m; }, {});
        games[names.get(ev) ?? ev] = {
          ticks: list.length, comparedWithScore: bothLive.length, scoreAgree: scoreOk.length, scoreDiffer: bothLive.length - scoreOk.length,
          phaseCompared: phaseTicks.length, phaseAgree: phaseOk.length,
          siftScoreDecreases: decreases, siftPhaseTransitions: transitions, displayModes: modes,
          scoreLagSec: { n: lags.length, median: q(0.5), p90: q(0.9), max: lags.length ? lags[lags.length - 1] : null },
          ageSecAtSampling: { median: ages.length ? ages[Math.floor(ages.length / 2)] : null, max: ages.length ? ages[ages.length - 1] : null },
          lastSample: last ? { siftPhase: last.siftPhase, oraclePhase: last.oraclePhase, finalScoresAgree: last.sift != null && last.sift === last.oracle } : null,
        };
      }
      writeFileSync(join(OUT, 'nba-summary.json'), JSON.stringify({ at: new Date().toISOString(), minutes: MINUTES, tickSec: TICK_MS / 1000, cycles, oracleFailures, sportscoreErrors, wrongMatches, widget: { checks: widgetChecks, notListed: widgetMisses, differsFromV1: widgetDiffers }, games }, null, 1));
    };

    while (Date.now() < end) {
      const started = Date.now();
      if (started > nextBoard) { try { board = (await loadBoard('NBA')).games; } catch { /* keep the last */ } nextBoard = started + 20 * 60_000; }
      events = eventsNear('NBA', board, started, 9 * 3600_000, 45 * 60_000);
      // SportScore: only at the app's own cadence (once a minute); between polls SIFT shows what it last read, ageing.
      if (events.length && started - lastFetch >= 60_000) {
        lastFetch = started;
        try { held = (await provider.fetchScoreboard('NBA')).games; heldAt = Date.now(); heldErr = null; } catch (e) { heldErr = String(e).slice(0, 120); sportscoreErrors++; }
        try {
          const r = await fetch(WIDGET_URL); widget = r.ok ? parseSportscore('NBA', await r.json(), new Date().toISOString()) : [];
        } catch { widget = []; }
      }
      const oracle = events.length ? await readOracle() : { ok: true, games: [] as OracleGame[] };
      if (!oracle.ok) oracleFailures++;
      appendFileSync(oracleLog, JSON.stringify({ t: started, ok: oracle.ok, status: oracle.status, games: oracle.games }) + '\n');
      const { pairs } = pairReport('NBA', 'sportscore', events, held);
      const wpairs = pairReport('NBA', 'widget', events, widget).pairs;
      const now = Date.now();
      for (const p of pairs) {
        const ev = p.event; const label = `${ev.away.name} @ ${ev.home.name}`; names.set(ev.eventId, label);
        const g = p.game ?? null;
        const view = g ? scoreView(g, now, { providerDown: heldErr != null && now - heldAt > 5 * 60_000 }) : null;
        const og = oracle.games.find((o) => sameClub(ev.home.name, o.home) && sameClub(ev.away.name, o.away) && Math.abs(Date.parse(o.startUtc) - Date.parse(ev.startUtc)) < 6 * 3600_000);
        // A game SportScore matched to a SIFT game must be the same two clubs as the oracle's: otherwise it is a wrong match.
        const wrong = !!(g && og && !(sameClub(g.home.name, og.home) && sameClub(g.away.name, og.away)));
        if (wrong) wrongMatches++;
        const siftScore = view?.game?.score ? `${view.game.score.home}-${view.game.score.away}` : null; // home-away
        const oScore = og && og.hs != null && og.as != null && og.status >= 2 ? `${og.hs}-${og.as}` : null;
        const siftPhase = g ? g.phase : null; const oPhase = og ? oraclePhase(og) : null;
        const wg = wpairs.find((w) => w.event.eventId === ev.eventId)?.game ?? null;
        if (g && liveish(g.phase) || (og && og.status >= 2)) {
          widgetChecks++;
          if (!wg) widgetMisses++; else if (wg.phase !== g?.phase || `${wg.score?.home}-${wg.score?.away}` !== `${g?.score?.home}-${g?.score?.away}`) widgetDiffers++;
        }
        const arr = ticks.get(ev.eventId) ?? []; ticks.set(ev.eventId, arr);
        if (g || og) arr.push({ t: now, sift: siftScore, oracle: oScore, siftPhase, oraclePhase: oPhase, mode: view?.mode ?? null, ageSec: view?.ageMs != null ? Math.round(view.ageMs / 1000) : null, label: view?.label ?? null });
        const sig = `${siftPhase}|${g?.clock?.periodLabel}|${siftScore}|${oPhase}|${og?.period}|${oScore}|${view?.mode}`;
        const due = now - (lastLogged.get(ev.eventId) ?? 0) > 5 * 60_000;
        if (sig !== lastSig.get(ev.eventId) || due) {
          lastSig.set(ev.eventId, sig); lastLogged.set(ev.eventId, now);
          // Verdicts only: SportScore's own values, and whether the NBA scoreboard agrees (or by how much it differs). The NBA's numbers are not written here.
          const s = view?.game?.score; const dh = og?.hs != null && s ? s.home - og.hs : null; const da = og?.as != null && s ? s.away - og.as : null;
          appendFileSync(compareLog, JSON.stringify({
            t: now, at: new Date(now).toISOString(), game: label, matched: !!g, wrongMatch: wrong,
            sift: g ? { phase: g.phase, periodLabel: g.clock?.periodLabel ?? null, score: s ? { home: s.home, away: s.away } : null, mode: view?.mode, label: view?.label, ageSec: view?.ageMs != null ? Math.round(view.ageMs / 1000) : null, providerUpdatedAt: g.provenance.providerUpdatedAt, fetchedAt: g.provenance.fetchedAt } : null,
            oracle: og ? { phase: oPhase, period: og.period, periodMatches: g?.clock?.periodLabel ? periodMatches(g.clock.periodLabel, og.period) : null, scoreAgrees: oScore != null && siftScore != null ? siftScore === oScore : null, differBy: dh != null && da != null && (dh !== 0 || da !== 0) ? { home: dh, away: da } : null, phaseAgrees: siftPhase && oPhase ? siftPhase === oPhase || (liveish(siftPhase) && liveish(oPhase)) : null } : { found: false },
            widget: wg ? { phase: wg.phase, score: wg.score } : null,
            sportscoreError: heldErr,
          }) + '\n');
        }
      }
      cycles++;
      if (cycles % 20 === 0) summarise();
      const wait = TICK_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    summarise();
    await api.dispose();
    expect(cycles).toBeGreaterThan(0);
  }, (MINUTES + 15) * 60_000);
});

/** "1st quarter" / "2nd quarter" / "Overtime" / "OT2" against the oracle's period number (1-4, 5+ = overtime). */
function periodMatches(label: string, period: number): boolean | null {
  const l = label.toLowerCase();
  const q = /(\d)(?:st|nd|rd|th)\s*quarter|q(\d)/.exec(l);
  if (q) return Number(q[1] ?? q[2]) === period;
  if (/overtime|\bot\b|ot\d/.test(l)) return period >= 5;
  if (/half/.test(l)) return period === 2 || period === 4;
  return null;
}
