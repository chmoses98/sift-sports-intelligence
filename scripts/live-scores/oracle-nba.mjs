#!/usr/bin/env node
// Verification only. An independent, authoritative reading of NBA games (the NBA's own scoreboard) to compare SportScore against.
// Nothing here ships in SIFT, nothing is displayed, and the readings are not published: they stay on the runner and only the
// verdicts (match / differ by n) are committed. Read at a low rate (one request a minute) with a normal browser, like a person with the page open.
//   node scripts/live-scores/oracle-nba.mjs <out-dir> [--once | --minutes N]
import { chromium } from '@playwright/test';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out, ...rest] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const once = rest.includes('--once');
const minutes = Number(rest[rest.indexOf('--minutes') + 1] || 1);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', extraHTTPHeaders: { Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com' } });

const clockSeconds = (c) => { const m = /^PT(\d+)M([\d.]+)S$/.exec(c ?? ''); return m ? Number(m[1]) * 60 + Math.floor(Number(m[2])) : null; };
async function read() {
  const t = Date.now();
  let r;
  try { r = await ctx.request.get(URL, { timeout: 20000 }); } catch (e) { return { t, ok: false, error: String(e).slice(0, 200) }; }
  if (!r.ok()) return { t, ok: false, status: r.status() };
  const j = await r.json();
  const games = (j.scoreboard?.games ?? []).map((g) => ({
    id: g.gameId, status: g.gameStatus, text: g.gameStatusText?.trim(), period: g.period, clock: g.gameClock, clockSeconds: clockSeconds(g.gameClock),
    startUtc: g.gameTimeUTC, home: `${g.homeTeam?.teamCity} ${g.homeTeam?.teamName}`.trim(), away: `${g.awayTeam?.teamCity} ${g.awayTeam?.teamName}`.trim(),
    homeScore: g.homeTeam?.score, awayScore: g.awayTeam?.score,
  }));
  return { t, ok: true, status: r.status(), gameDate: j.scoreboard?.gameDate, games };
}

const end = Date.now() + (once ? 0 : minutes * 60000);
let first = true;
do {
  const rec = await read();
  appendFileSync(join(out, 'oracle.jsonl'), JSON.stringify(rec) + '\n');
  if (first) { writeFileSync(join(out, 'oracle-first.json'), JSON.stringify({ ok: rec.ok, status: rec.status, error: rec.error, gameDate: rec.gameDate, games: rec.games?.length }, null, 1)); first = false; }
  if (!once) await new Promise((r) => setTimeout(r, 60000));
} while (Date.now() < end);
await browser.close();
