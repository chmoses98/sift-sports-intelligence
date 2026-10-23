#!/usr/bin/env node
// Probe the candidate free score feeds and their terms pages, from whatever machine runs it (a GitHub runner, or your Mac).
// Needs Node 20+ and nothing else. Read-only GETs, an identifying User-Agent, one request per URL (more only in `watch` mode, at >= 15 s).
//
//   node scripts/live-scores/probe.mjs once  --out probe-out            one pass: status, headers, CORS, payload shape, terms text
//   node scripts/live-scores/probe.mjs watch --out probe-out --minutes 60 --interval 20     poll the scoreboards and log every change
//
// It writes: report.json (every request: status, timing, headers, CORS answer, body size), payloads/ (full bodies), terms/ (verbatim
// pages and their stripped text), and for `watch`, watch.jsonl (one line per observed change). Nothing is interpreted here.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedTargets, TERMS } from './targets.mjs';

const args = process.argv.slice(2);
const mode = args[0] === 'watch' ? 'watch' : 'once';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'probe-out');
const MINUTES = Number(opt('minutes', '60'));
const INTERVAL = Math.max(15, Number(opt('interval', '20')));
const ORIGIN = 'https://chmoses98.github.io'; // the page SIFT is served from: what a browser would send
const UA = 'SIFT-personal-feed-probe/1.0 (+https://github.com/chmoses98/sift-sports-intelligence; read-only evaluation)';
const KEEP = ['content-type', 'cache-control', 'age', 'date', 'expires', 'last-modified', 'etag', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-allow-methods', 'vary', 'x-cache', 'server', 'via', 'x-amz-cf-pop', 'cf-cache-status', 'x-served-by', 'retry-after', 'x-ratelimit-remaining', 'x-ratelimit-limit'];

mkdirSync(join(OUT, 'payloads'), { recursive: true });
mkdirSync(join(OUT, 'terms'), { recursive: true });
mkdirSync(join(OUT, 'samples'), { recursive: true });

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

async function get(url, { text = false, timeout = 20000, browserUa = false } = {}) {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  try {
    const r = await fetch(url, { headers: { 'user-agent': browserUa ? BROWSER_UA : UA, accept: text ? 'text/html,text/plain,*/*' : 'application/json,*/*', origin: ORIGIN }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    const buf = Buffer.from(await r.arrayBuffer());
    const headers = {};
    for (const k of KEEP) { const v = r.headers.get(k); if (v != null) headers[k] = v; }
    return { ok: r.ok, status: r.status, finalUrl: r.url, ms: Date.now() - t0, startedAt, endedAt: new Date().toISOString(), bytes: buf.length, headers, buf };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.cause?.code ?? e?.message ?? e), ms: Date.now() - t0, startedAt, bytes: 0, headers: {}, buf: Buffer.alloc(0) };
  }
}

const stripHtml = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** The payload with every array cut to its first `n` items and long strings cut: enough to read the real field names and values. */
const trim = (v, n = 2) => (Array.isArray(v) ? v.slice(0, n).map((x) => trim(x, n)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, n)])) : typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : v);

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return depth > 3 ? '[…]' : [v.length ? shape(v[0], depth + 1) : 'empty', `(${v.length})`];
  if (v && typeof v === 'object') return depth > 3 ? '{…}' : Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v;
};

async function once() {
  const report = { generatedAt: new Date().toISOString(), node: process.version, origin: ORIGIN, feeds: [], terms: [] };
  for (const t of feedTargets()) {
    const r = await get(t.url, { text: t.expect === 'text', browserUa: !!t.browserUa });
    const file = `payloads/${t.id}.${t.expect === 'text' ? 'txt' : 'json'}`;
    writeFileSync(join(OUT, file), r.buf);
    let summary = null;
    if (r.ok && t.expect === 'json') { try { const j = JSON.parse(r.buf.toString('utf8')); writeFileSync(join(OUT, 'samples', `${t.id}.json`), JSON.stringify(trim(j), null, 1)); summary = shape(j); } catch (e) { summary = `not JSON: ${String(e.message).slice(0, 80)}`; } }
    const { buf, ...meta } = r;
    report.feeds.push({ id: t.id, group: t.group, url: t.url, ...meta, file, summary });
    console.log(`${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms ${String(r.bytes).padStart(8)}B  acao=${r.headers['access-control-allow-origin'] ?? '-'}  ${t.id}`);
    await new Promise((s) => setTimeout(s, 400));
  }
  for (const [id, url, o] of TERMS) {
    const r = await get(url, { text: true, timeout: 25000, browserUa: !!o?.browserUa });
    const html = r.buf.toString('utf8');
    writeFileSync(join(OUT, 'terms', `${id}.html`), html.slice(0, 600_000));
    const text = /html/i.test(r.headers['content-type'] ?? '') || /^\s*</.test(html) ? stripHtml(html) : html;
    writeFileSync(join(OUT, 'terms', `${id}.txt`), text.slice(0, 400_000));
    const { buf, ...meta } = r;
    report.terms.push({ id, url, ...meta, textChars: text.length });
    console.log(`${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms ${String(text.length).padStart(8)}ch  terms ${id}`);
    await new Promise((s) => setTimeout(s, 400));
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
}

// ---- watch: poll the scoreboards and log what changes -------------------------------------------------------------
const num = (x) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
const NORMALISE = {
  espn(j) {
    return (j?.events ?? []).map((e) => {
      const c = e.competitions?.[0] ?? {};
      const side = (ha) => c.competitors?.find((x) => x.homeAway === ha);
      return { id: e.id, start: e.date, state: e.status?.type?.state, name: e.status?.type?.name, detail: e.status?.type?.shortDetail, period: e.status?.period, clock: e.status?.displayClock, clockSec: e.status?.clock,
        home: side('home')?.team?.abbreviation, away: side('away')?.team?.abbreviation, hs: num(side('home')?.score), as: num(side('away')?.score) };
    });
  },
  nhl(j) {
    const games = j?.games ?? [];
    return games.map((g) => ({ id: String(g.id), start: g.startTimeUTC, state: g.gameState, period: g.periodDescriptor?.number ?? null, clock: g.clock?.timeRemaining ?? null, running: g.clock?.running ?? null,
      home: g.homeTeam?.abbrev, away: g.awayTeam?.abbrev, hs: num(g.homeTeam?.score), as: num(g.awayTeam?.score) }));
  },
  nba(j) {
    return (j?.scoreboard?.games ?? []).map((g) => ({ id: g.gameId, start: g.gameTimeUTC, state: g.gameStatus, name: g.gameStatusText, period: g.period, clock: g.gameClock,
      home: g.homeTeam?.teamTricode, away: g.awayTeam?.teamTricode, hs: num(g.homeTeam?.score), as: num(g.awayTeam?.score) }));
  },
  mlb(j) {
    return (j?.dates ?? []).flatMap((d) => d.games ?? []).map((g) => ({ id: String(g.gamePk), start: g.gameDate, state: g.status?.abstractGameState, name: g.status?.detailedState, period: g.linescore?.currentInning ?? null, clock: g.linescore?.inningHalf ?? null,
      home: g.teams?.home?.team?.abbreviation, away: g.teams?.away?.team?.abbreviation, hs: num(g.teams?.home?.score), as: num(g.teams?.away?.score) }));
  },
};

async function watch() {
  const set = feedTargets().filter((t) => ['espn', 'nhl', 'nba', 'mlb'].includes(t.group) && !t.id.includes('nodate') && t.id !== 'espn-web-header' && t.id !== 'espn-cdn-nfl' && t.id !== 'nhl-scoreboard-now' && t.id !== 'nhl-schedule-now' && !/^espn-(epl|ucl|atp|wta|cbb)$/.test(t.id));
  const last = new Map();
  const end = Date.now() + MINUTES * 60_000;
  const log = join(OUT, 'watch.jsonl');
  let polls = 0;
  console.log(`watching ${set.map((t) => t.id).join(', ')} every ${INTERVAL}s for ${MINUTES} min`);
  while (Date.now() < end) {
    const cycle = Date.now();
    const rs = await Promise.all(set.map(async (t) => {
      const r = await get(t.url);
      return [t, r];
    }));
    polls++;
    for (const [t, r] of rs) {
      const rec = { t: r.endedAt ?? new Date().toISOString(), src: t.id, status: r.status, ms: r.ms, date: r.headers.date, age: r.headers.age, lm: r.headers['last-modified'], etag: r.headers.etag };
      let games = null;
      if (r.ok) { try { games = NORMALISE[t.group](JSON.parse(r.buf.toString('utf8'))); } catch (e) { rec.parseError = String(e.message).slice(0, 80); } }
      if (!r.ok) { appendFileSync(log, JSON.stringify({ ...rec, error: r.error ?? `HTTP ${r.status}` }) + '\n'); continue; }
      if (!games) { appendFileSync(log, JSON.stringify(rec) + '\n'); continue; }
      const prevMap = last.get(t.id) ?? new Map();
      const next = new Map();
      for (const g of games) {
        const key = `${g.state}|${g.period}|${g.clock}|${g.hs}|${g.as}|${g.name}`;
        next.set(g.id, key);
        if (prevMap.get(g.id) !== key) appendFileSync(log, JSON.stringify({ ...rec, game: g, prev: prevMap.get(g.id) ?? null }) + '\n');
      }
      last.set(t.id, next);
      // a heartbeat line per source every 5th poll proves it answered (with its freshness headers) even when nothing changed
      if (polls % 5 === 1) appendFileSync(log, JSON.stringify({ ...rec, heartbeat: true, games: games.length, live: games.filter((g) => ['in', 'LIVE', 'CRIT', 'Live', 2].includes(g.state)).length }) + '\n');
    }
    const wait = INTERVAL * 1000 - (Date.now() - cycle);
    if (wait > 0) await new Promise((s) => setTimeout(s, wait));
  }
  console.log(`done: ${polls} polls`);
}

if (mode === 'watch') await watch(); else await once();
