#!/usr/bin/env node
// sweep: the horizon part of a Prop Discovery capture. The specs discover the documents they read by running (V3_REAL_FEEDS=live), but a spec
// only reads the games whose rows it scrolls to, so which games end up priced, unpriced or unreadable would depend on what the specs happened to
// touch. The sweep makes the family's content a property of the capture instant instead: into the SAME scratch cache, at the same instant,
// it fetches
//   * every board (the publication bases are the ones the committed family already holds),
//   * for every game Prop Discovery would read (not started at the instant, at least one market listed, in a sport with prop prices): its
//     event_detail document (all horizons: 48 hours, 7 days, All upcoming),
//   * for every such game that starts within --research-days (default 7): its event research document (availability, ranks of the roster),
//   * for every such game the live-quote feed publishes a file for (matched by event id through the feed's index): that file. A game the feed
//     has no file for is simply not fetched: the app asks for it, gets a 404 and prints "—", exactly as in production.
//
//   node scripts/v3-fixtures/sweep.mjs --dir <scratch cache> [--family props] [--clock ISO] [--research-days 7] [--concurrency 4]
//
// The instant is --clock, else <dir>/captured_at.txt, else now (written there). Writes <dir>/sweep-urls.txt (every URL requested, to pass to
// `pack --requests`) and prints how many games each sport/horizon holds and how many have a quote file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, need } from './args.mjs';
import { fetchOne, journal } from './capture.mjs';
import { FAMILIES, PROP_SPORTS, TOOL_VERSION, cacheKey, gitSha, isoZ, openBundle } from './lib.mjs';

const QUOTES = 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes/';
const DAY = 86_400_000;

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const family = a.family ?? 'props';
  if (!FAMILIES.includes(family)) throw new Error(`family must be one of ${FAMILIES.join(', ')}`);
  const dir = need(a, 'dir');
  mkdirSync(dir, { recursive: true });
  const atFile = join(dir, 'captured_at.txt');
  if (a.clock) writeFileSync(atFile, isoZ(a.clock) + '\n');
  else if (!existsSync(atFile)) writeFileSync(atFile, isoZ(new Date()) + '\n');
  const clock = Date.parse(readFileSync(atFile, 'utf8').trim());
  const researchMs = Number(a['research-days'] ?? 7) * DAY;
  const conc = Number(a.concurrency ?? 4);
  const requested = new Set();
  const get = async (url) => {
    requested.add(url);
    const f = join(dir, cacheKey(url));
    if (!existsSync(f)) journal(dir, await fetchOne(url, f));
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  };

  const bases = openBundle(a.out).family(family).urls
    .map((u) => /^(https:\/\/raw\.githubusercontent\.com\/chmoses98\/([^/]+)\/.+\/)board\.json$/.exec(u))
    .filter((m) => m && PROP_SPORTS[m[2]]).map((m) => ({ base: m[1], sport: PROP_SPORTS[m[2]] }));
  if (!bases.length) throw new Error(`the committed ${family} family holds no board of a prop sport: pass --out to a bundle that does`);

  const quoteIndex = await get(`${QUOTES}index.json`);
  const quoteFile = new Map();
  for (const g of quoteIndex?.games ?? []) for (const e of g.event_ids ?? []) quoteFile.set(e, `${QUOTES}${g.file}`);

  const games = [];
  await pool(bases, conc, async ({ base, sport }) => {
    const board = await get(`${base}board.json`);
    for (const it of board?.items ?? []) {
      const t = Date.parse(it.start_time_utc);
      if (!(t > clock) || !((it.markets_available ?? 1) > 0)) continue;
      games.push({ sport, base, id: it.event_id, t, detail: it.detail_path, markets: it.markets_available ?? 0 });
    }
  });
  games.sort((x, y) => x.t - y.t);

  const urls = [];
  for (const g of games) {
    urls.push(`${g.base}${g.detail}`);
    if (g.t - clock <= researchMs) urls.push(`${g.base}explorer/events/${g.id}.json`);
    if (quoteFile.has(g.id)) urls.push(quoteFile.get(g.id));
  }
  await pool(urls, conc, async (u) => { await get(u); });

  const bySport = {};
  for (const g of games) {
    const h = g.t - clock <= 2 * DAY ? '48h' : g.t - clock <= 7 * DAY ? '7d' : 'later';
    const s = (bySport[g.sport] ??= { '48h': 0, '7d': 0, later: 0, withQuoteFile: 0 });
    s[h]++;
    if (quoteFile.has(g.id)) s.withQuoteFile++;
  }
  // The provenance `pack` records (the capture window ends with the last document any spec fetched into the cache afterwards: pack takes the later of the two).
  writeFileSync(join(dir, 'capture.json'), JSON.stringify({ family, started: isoZ(clock), finished: isoZ(new Date()), tool: { name: 'scripts/v3-fixtures sweep', version: TOOL_VERSION, git_sha: gitSha() }, urls: requested.size }, null, 1) + '\n');
  writeFileSync(join(dir, 'sweep-urls.txt'), [...requested].sort().join('\n') + '\n');
  console.log(`sweep at ${isoZ(clock)}: ${games.length} games, ${urls.length} documents requested`);
  console.table(bySport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
