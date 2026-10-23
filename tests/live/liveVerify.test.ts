// @vitest-environment node
// LIVE verification, one pass: real boards, real feeds, the production adapters and matcher. Skipped unless LIVE_VERIFY=1 (it needs real
// internet: a GitHub runner or your Mac). Writes a JSON report to VERIFY_OUT (default ./live-verify.json).
//
//   LIVE_VERIFY=1 npx vitest run tests/live/liveVerify.test.ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { BOARD_SPORTS, compareByEvent, eventsNear, loadBoard, mlbOfficial, nhlOfficial, pairReport, providers, type PairReport } from './support/liveVerify';
import type { LiveGame, LiveSport, ObservedEvent } from '../../src/live/scores/types';

const RUN = process.env.LIVE_VERIFY === '1';
const OUT = process.env.VERIFY_OUT ?? 'live-verify.json';

describe.skipIf(!RUN)('real feeds against real boards (one pass)', () => {
  it('fetches, parses, matches and cross-checks', async () => {
    const now = Date.now();
    const report: { at: string; boards: Record<string, { items: number; generatedAt: string | null; near: number }>; pairing: PairReport[]; errors: string[]; crossCheck: Record<string, unknown> } = { at: new Date(now).toISOString(), boards: {}, pairing: [], errors: [], crossCheck: {} };
    const nearEvents = new Map<LiveSport, ObservedEvent[]>();
    for (const sport of BOARD_SPORTS) {
      try {
        const b = await loadBoard(sport);
        // Games that can matter now: the last 10 hours to the next 30.
        const evs = eventsNear(sport, b.games, now, 10 * 3600_000, 30 * 3600_000);
        nearEvents.set(sport, evs);
        report.boards[sport] = { items: b.items.length, generatedAt: b.generatedAt, near: evs.length };
      } catch (e) { report.errors.push(`board ${sport}: ${String(e)}`); }
    }
    const ps = providers((s) => nearEvents.get(s) ?? []);
    const fetched = new Map<string, LiveGame[]>();
    for (const [pid, p] of Object.entries(ps)) {
      for (const sport of p.sports) {
        const evs = nearEvents.get(sport) ?? [];
        if (!evs.length) continue;
        try {
          const batch = await p.fetchScoreboard(sport);
          fetched.set(`${pid}|${sport}`, batch.games);
          report.pairing.push(pairReport(sport, pid, evs, batch.games).report);
        } catch (e) { report.errors.push(`${pid} ${sport}: ${String(e)}`); }
      }
    }
    // Accuracy: the same SIFT games from a second, independent feed, compared only where both were matched with certainty.
    const pairsOf = (provider: string, sport: LiveSport, games: LiveGame[]) => pairReport(sport, provider, nearEvents.get(sport) ?? [], games).pairs;
    const etDays = (sport: LiveSport) => [...new Set((nearEvents.get(sport) ?? []).flatMap((e) => { const t = Date.parse(e.ref.startUtc); return [new Date(t - 5 * 3600_000).toISOString().slice(0, 10), new Date(t).toISOString().slice(0, 10)]; }))];
    const cross = (name: string, a: string, b: string, sport: LiveSport, other?: LiveGame[]) => {
      const ga = fetched.get(`${a}|${sport}`); const gb = other ?? fetched.get(`${b}|${sport}`);
      if (ga && gb) report.crossCheck[name] = compareByEvent(pairsOf(a, sport, ga), pairsOf(b, sport, gb));
    };
    try { cross('NBA espn vs sportscore', 'espn', 'sportscore', 'NBA'); } catch (e) { report.errors.push(`nba cross-check: ${String(e)}`); }
    try { if (fetched.get('espn|NHL')) cross('NHL espn vs official', 'espn', 'nhl-official', 'NHL', await nhlOfficial(etDays('NHL'))); } catch (e) { report.errors.push(`nhl cross-check: ${String(e)}`); }
    try { if (fetched.get('espn|MLB')) cross('MLB espn vs official', 'espn', 'mlb-official', 'MLB', (await Promise.all(etDays('MLB').map(mlbOfficial))).flat()); } catch (e) { report.errors.push(`mlb cross-check: ${String(e)}`); }
    writeFileSync(OUT, JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ boards: report.boards, pairing: report.pairing.map((p) => `${p.provider}/${p.sport}: ${p.matched}/${p.events} matched, offered ${p.offered}, refused ${JSON.stringify(p.refused)}`), errors: report.errors, cross: Object.fromEntries(Object.entries(report.crossCheck).map(([k, v]) => [k, `${(v as { agree: number }).agree}/${(v as { compared: number }).compared} agree`])) }, null, 1));
    expect(report.boards).not.toEqual({});
  }, 180_000);
});
