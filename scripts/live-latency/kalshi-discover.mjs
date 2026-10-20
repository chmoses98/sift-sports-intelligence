// ONE-COMMAND, READ-ONLY test of Kalshi's live sports data. No score tapping, no credentials, no purchase. It answers, from
// Kalshi's own API, in a few minutes:
//   1 coverage    which of SIFT's sports have Kalshi events that map to a live-data milestone (and how many)
//   2 identity    whether a SIFT/Kalshi event ticker finds its milestone (events?with_milestones, milestones?related_event_ticker)
//   3 fields      score / clock / period / status / timestamps / play-by-play / player stats actually present in the payloads
//   4 cadence     how often a milestone's data really changes, measured by polling every 3 s for a few minutes, plus the
//                 age of any provider timestamp against our receive time
//   5 reliability HTTP errors, 401/403 (is it public?), 429s, empty answers
// RIGHTS: Kalshi's Developer Agreement (§3, §3.1, §3.5) and Data Terms restrict collecting/caching API data, sharing it, and
// benchmarking the API. So it refuses to run without --ack-kalshi-terms, and skips the cadence stage without --ack-benchmark.
// See docs/LIVE_VENDOR_EVALUATION.md §5 and docs/outreach/kalshi.md. This script decides nothing about rights.
//
//   node scripts/live-latency/kalshi-discover.mjs --contact you@example.com --ack-kalshi-terms [--ack-benchmark]   (run during a live slate)
//   options: --minutes 4 (cadence, max 10)  --out kalshi-sample  --sports NFL,NBA,NHL,MLB,CFB,CBB,SOCCER,TENNIS
//            --tickers KXNFLGAME-26OCT12BUFLAR-LAR,…  (test specific SIFT/Kalshi tickers)  --base <api url>
//
// Politeness: GET only; discovery requests are 1.2 s apart, cadence polling is ONE batch request per 3 s; ≤ 500 requests in
// total; the first 429 (or 401/403 on live data) stops the run and says so. Kalshi's public limit is roughly a 14-request burst
// refilling ~3/s. The field/path names tested come from Kalshi's docs as summarised by search; a wrong name shows up as a 4xx.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cadence, capabilities, kalshiGate, eventTickerOf, fingerprints, gameEventTicker, flatten, mapEventsToMilestones, summarizeSchema, tagsOf, timestampLags } from './kalshi-lib.mjs';

const argv = process.argv;
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const contact = arg('contact', '');
if (!contact) { console.error('--contact <email> is required (it goes in the User-Agent).'); process.exit(2); }
const gate = kalshiGate({ ackTerms: argv.includes('--ack-kalshi-terms'), ackBenchmark: argv.includes('--ack-benchmark') });
if (!gate.ok) { console.error(gate.errors.join('\n\n')); process.exit(2); }
const out = arg('out', 'kalshi-sample');
const minutes = Math.min(10, Number(arg('minutes', 4)));
const BASES = [arg('base', 'https://api.elections.kalshi.com/trade-api/v2'), 'https://external-api.kalshi.com/trade-api/v2'];
const SERIES = {
  NFL: ['KXNFLGAME'], CFB: ['KXNCAAFGAME'], NBA: ['KXNBAGAME'], NHL: ['KXNHLGAME'], MLB: ['KXMLBGAME'],
  SOCCER: ['KXEPLGAME', 'KXBUNDESLIGAGAME'], CBB: ['KXNCAAMBGAME'], TENNIS: ['KXATPMATCH', 'KXWTAMATCH'],
};
const want = arg('sports', Object.keys(SERIES).join(',')).split(',').filter((s) => SERIES[s]);
mkdirSync(`${out}/raw`, { recursive: true });
const UA = `sift-kalshi-livetest/0.2 (owner-run, read-only; contact ${contact})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const say = (s = '') => { console.log(s); report.push(s); };

let base = BASES[0];
let n = 0;
let stopped = null;
async function get(path, label, { save = true, gap = 1200 } = {}) {
  if (stopped) return { status: 0, body: null };
  if (++n > 500) { stopped = 'request budget (500) spent'; return { status: 0, body: null }; }
  await sleep(gap);
  const t0 = Date.now();
  let res;
  try { res = await fetch(base + path, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(10_000) }); }
  catch (e) {
    if (base === BASES[0] && n <= 2) { base = BASES[1]; say(`(host ${BASES[0]} unreachable: ${e.cause?.code ?? e.message}; trying ${base})`); n--; return get(path, label, { save, gap: 0 }); }
    say(`✗ ${label}: ${e.cause?.code ?? e.message} — blocked by a firewall/DNS, or offline`); stopped = 'network'; return { status: 0, body: null };
  }
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* keep null */ }
  if (save) writeFileSync(`${out}/raw/${String(n).padStart(3, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.json`, text.slice(0, 400_000));
  if (res.status === 429) { stopped = `HTTP 429 (retry-after ${res.headers.get('retry-after') ?? '?'}) on ${label}: stopped; do not retry soon`; }
  return { status: res.status, body, recvAt: Date.now(), rtt: Date.now() - t0, age: res.headers.get('age'), date: res.headers.get('date'), cache: res.headers.get('x-cache') ?? res.headers.get('cf-cache-status'), text };
}

say(`# Kalshi live-data test — ${new Date().toISOString()}  (host ${base})`);

// ---------- 1+2: coverage and identity ----------
const eventsBySport = {};
const milestoneIds = new Map(); // id -> { sport, type, event }
for (const sport of want) {
  const found = [];
  for (const series of SERIES[sport]) {
    const r = await get(`/events?series_ticker=${series}&status=open&with_milestones=true&limit=40`, `events-${series}`);
    if (stopped) break;
    if (r.status !== 200) { say(`  ${sport} ${series}: HTTP ${r.status}`); continue; }
    const evs = r.body?.events ?? [];
    const { map, meta } = mapEventsToMilestones(r.body);
    found.push(...evs.map((e) => ({ series, event: e.event_ticker, title: e.title, mapped: map.get(e.event_ticker) ? [...map.get(e.event_ticker)] : [] })));
    for (const [event, ids] of map) for (const id of ids) milestoneIds.set(id, { sport, type: meta.get(id)?.type ?? null, event });
  }
  // Fallback identity route for a few events the first route did not map.
  for (const e of found.filter((x) => !x.mapped.length).slice(0, 3)) {
    const r = await get(`/milestones?related_event_ticker=${encodeURIComponent(e.event)}&limit=5`, `milestones-for-${e.event}`);
    const { map, meta } = mapEventsToMilestones(r.body);
    const ids = [...(map.get(e.event) ?? [])].concat((r.body?.milestones ?? []).map((m) => m.id ?? m.milestone_id).filter(Boolean));
    for (const id of new Set(ids)) { milestoneIds.set(id, { sport, type: meta.get(id)?.type ?? null, event: e.event }); e.mapped.push(id); e.via = 'milestones?related_event_ticker'; }
  }
  eventsBySport[sport] = found;
  const withM = found.filter((e) => e.mapped.length).length;
  say(`${sport.padEnd(7)} events listed ${String(found.length).padStart(3)}   mapped to a milestone ${String(withM).padStart(3)}${found.length ? ` (${Math.round((100 * withM) / found.length)}%)` : ''}${found[0] ? `   e.g. ${found[0].event}${found[0].mapped[0] ? ` → ${found[0].mapped[0]}` : ' → (none)'}` : ''}`);
  if (stopped) break;
}
// SIFT's own market tickers → event tickers → milestone (the identity chain the app would use).
const tickers = arg('tickers', '').split(',').filter(Boolean);
for (const t of tickers.slice(0, 10)) {
  const ev = eventTickerOf(t);
  const r = ev ? await get(`/milestones?related_event_ticker=${encodeURIComponent(ev)}&limit=5`, `identity-${ev}`) : { status: 0, body: null };
  const ids = (r.body?.milestones ?? []).map((m) => m.id ?? m.milestone_id).filter(Boolean);
  say(`identity: ${t} → event ${ev ?? '(unparseable)'} → ${ids.length ? `milestone ${ids.join(', ')}` : `NO milestone (HTTP ${r.status})`}`);
  ids.forEach((id) => milestoneIds.set(id, { sport: 'TICKER', type: null, event: ev }));
}
// SIFT's real identities: the live-quote feed lists the games the publications map to Kalshi tickers (event_id -> market tickers).
// Run each through the same chain the app would use (market ticker -> event ticker -> milestone).
if (!argv.includes('--no-sift-feed') && !stopped) {
  const FEED = 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes';
  try {
    const idx = await (await fetch(`${FEED}/index.json`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) })).json();
    const games = (idx.games ?? []).filter((g) => g.markets > 0).slice(0, 8);
    let mapped = 0;
    say(`\nSIFT identity chain (live-quote feed ${idx.generated_at ?? '?'}, ${games.length} game(s) tested):`);
    for (const g of games) {
      // SIFT's game key + the sport's game-winner series IS the Kalshi event ticker (verified on the live feed 2026-10-20).
      const ev = gameEventTicker(g.sport, g.key);
      const r = ev ? await get(`/milestones?related_event_ticker=${encodeURIComponent(ev)}&limit=5`, `sift-${ev}`) : { status: 0, body: null };
      const mids = (r.body?.milestones ?? []).map((m) => m.id ?? m.milestone_id).filter(Boolean);
      mids.forEach((id) => milestoneIds.set(id, { sport: g.sport ?? 'SIFT', type: null, event: ev }));
      if (mids.length) mapped++;
      say(`  ${(g.sport ?? '?').padEnd(4)} ${(g.event_ids ?? [])[0] ?? g.key} (${g.key}) → ${ev ?? '(no game series for this sport)'} → ${mids.length ? 'milestone ' + mids[0] : `NO milestone (HTTP ${r.status})`}`);
    }
    if (games.length) say(`  mapped ${mapped}/${games.length}`);
  } catch (e) { say(`(SIFT feed not readable: ${e.cause?.code ?? e.message}; pass --tickers instead)`); }
}
say(`milestones collected: ${milestoneIds.size}`);

// ---------- 3: fields ----------
const ids = [...milestoneIds.keys()];
const liveItems = new Map(); // id -> latest {type, details}
let schemas = {};
async function batch(idList, label, opts) {
  const q = idList.map((i) => `milestone_ids=${encodeURIComponent(i)}`).join('&');
  let r = await get(`/live_data/batch?${q}`, label, opts);
  if (r.status === 400 && idList.length > 1) r = await get(`/live_data/batch?milestone_ids=${idList.map(encodeURIComponent).join(',')}`, `${label}-csv`, opts);
  const body = r.body;
  const items = Array.isArray(body) ? body : body?.live_data ?? body?.live_datas ?? body?.data ?? [];
  return { r, items: Array.isArray(items) ? items : [] };
}
if (ids.length && !stopped) {
  say('\n## Fields present');
  const { r, items } = await batch(ids.slice(0, 100), 'live-batch-1');
  if (r.status === 401 || r.status === 403) { say(`✗ live data answers HTTP ${r.status}: it needs authentication/permission. SIFT has no credential by design: this is a BLOCKER until Kalshi says otherwise.`); stopped = 'live data not public'; }
  else if (r.status !== 200) say(`✗ /live_data/batch → HTTP ${r.status}: ${String(r.text).slice(0, 160)}`);
  else {
    const byType = {};
    for (const it of items) { if (!it) continue; liveItems.set(it.milestone_id ?? it.id, it); (byType[it.type ?? '(no type)'] ??= []).push(it.details ?? it); }
    say(`live_data returned ${items.length} item(s) for ${Math.min(ids.length, 100)} milestone(s); null/empty: ${Math.min(ids.length, 100) - items.filter(Boolean).length}`);
    for (const [type, payloads] of Object.entries(byType)) {
      const schema = summarizeSchema(payloads);
      schemas[type] = schema;
      writeFileSync(`${out}/schema-${type.replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(schema, null, 1));
      const c = capabilities(schema);
      say(`- type "${type}" (${payloads.length} sample(s), ${schema.length} fields): score ${c.score.length ? '✓ ' + c.score.slice(0, 3).join(', ') : '✗'} | clock ${c.clock.length ? '✓ ' + c.clock.slice(0, 3).join(', ') : '✗'} | period ${c.period.length ? '✓ ' + c.period.slice(0, 3).join(', ') : '✗'} | status ${c.status.length ? '✓' : '✗'} | timestamp ${c.timestamp.length ? '✓ ' + c.timestamp.slice(0, 3).join(', ') : '✗'} | player ${c.player.length ? '✓' : '✗'} | plays ${c.play.length ? '✓' : '✗'}`);
    }
  }
  // Play-by-play and player stats for up to 2 milestones per sport that returned live data.
  const seenSport = {};
  for (const id of ids) {
    const info = milestoneIds.get(id);
    if (stopped || !liveItems.has(id) || (seenSport[info.sport] ?? 0) >= 2) continue;
    seenSport[info.sport] = (seenSport[info.sport] ?? 0) + 1;
    const g = await get(`/live_data/milestone/${encodeURIComponent(id)}/game_stats`, `gamestats-${info.sport}`);
    const pbp = g.body?.pbp ?? null;
    const leaves = pbp ? flatten(pbp) : [];
    const ts = pbp ? timestampLags(pbp, g.recvAt) : [];
    say(`  ${info.sport} ${id} game_stats: HTTP ${g.status}, pbp ${pbp ? `present, ${leaves.length} leaf fields${ts.length ? `, timestamp fields: ${[...new Set(ts.map((x) => x.path))].slice(0, 3).join(', ')}` : ', no timestamp fields'}` : 'null (unsupported type, or no Sportradar id)'}`);
    if (/^(NFL|CFB|NBA|CBB)$/.test(info.sport)) {
      const p = await get(`/live_data/milestone/${encodeURIComponent(id)}?include_player_stats=true`, `players-${info.sport}`);
      const base0 = liveItems.get(id);
      const more = flatten(p.body ?? {}).length - flatten({ live_data: base0 }).length;
      say(`  ${info.sport} ${id} include_player_stats: HTTP ${p.status}, ${more > 0 ? `+${more} fields (player stats present)` : 'no additional fields (no player mapping, or not live)'}`);
    }
  }
}

// ---------- 4: cadence ----------
if (liveItems.size && !stopped && !gate.cadence) say('\n(cadence stage skipped: it is a performance measurement of Kalshi\'s API, which Developer Agreement §3.5 prohibits; add --ack-benchmark only if Kalshi has agreed or you accept that risk)');
if (liveItems.size && !stopped && gate.cadence) {
  say(`\n## Update cadence (${minutes} min, one batch request per 3 s)`);
  // Which milestones move at all? Compare two snapshots a few seconds apart; poll those (else the first 40).
  const h = (str) => createHash('sha1').update(str).digest('hex').slice(0, 12);
  const fp = (it) => fingerprints(it.details ?? it, h);
  const first = new Map([...liveItems].map(([id, it]) => [id, fp(it).hash]));
  await sleep(3000);
  const { items: second } = await batch([...liveItems.keys()].slice(0, 100), 'live-batch-2', { save: false, gap: 0 });
  const moving = second.filter((it) => it && first.get(it.milestone_id ?? it.id) !== fp(it).hash).map((it) => it.milestone_id ?? it.id);
  const watch = (moving.length ? moving : [...liveItems.keys()].slice(0, 40)).slice(0, 100);
  say(`watching ${watch.length} milestone(s) (${moving.length} moved between the first two snapshots${moving.length ? '' : ' — nothing live moving: run again during a live slate'})`);
  const obs = Object.fromEntries(watch.map((id) => [id, []]));
  const lags = [];
  const stop = Date.now() + minutes * 60_000;
  let polls = 0;
  let errors = 0;
  const statuses = {};
  while (Date.now() < stop && !stopped) {
    const t = Date.now();
    const { r, items } = await batch(watch, 'cadence', { save: false, gap: 0 });
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (r.status !== 200) { errors++; if (r.status === 401 || r.status === 403) stopped = `HTTP ${r.status}`; await sleep(5000); continue; }
    polls++;
    for (const it of items) {
      if (!it) continue;
      const id = it.milestone_id ?? it.id;
      if (!obs[id]) continue;
      const d = it.details ?? it;
      obs[id].push({ t: r.recvAt, ...fp(it), age: r.age });
      for (const l of timestampLags(d, r.recvAt)) lags.push(l);
      if (obs[id].length > 1 && obs[id].at(-1).hash !== obs[id].at(-2).hash) {
        appendFileSync(`${out}/cadence.jsonl`, JSON.stringify({ id, t: r.recvAt, prevPollAt: obs[id].at(-2).t, fields: flatten(d).filter((l) => tagsOf(l.path, l.value).some((x) => ['score', 'clock', 'period', 'status'].includes(x))).slice(0, 12) }) + '\n');
      }
    }
    await sleep(Math.max(0, 3000 - (Date.now() - t)));
  }
  const c = cadence(obs);
  const cs = cadence(obs, 'scoreHash');
  const cc = cadence(obs, 'clockHash');
  writeFileSync(`${out}/cadence.json`, JSON.stringify({ polls, errors, statuses, any: c, score: cs, clock: cc }, null, 1));
  const gap = (x) => (x.medianGapMs == null ? 'n/a' : `${(x.medianGapMs / 1000).toFixed(1)}s`);
  say(`${polls} polls, HTTP ${JSON.stringify(statuses)}`);
  say(`score-like fields changed ${cs.changes} time(s) (median gap ${gap(cs)}); clock/period fields changed ${cc.changes} time(s) (median gap ${gap(cc)}); any non-timestamp change ${c.changes}`);
  say(cs.changes === 0 && cc.changes === 0 ? 'nothing changed: no live game moving, or the fields are not tagged as score/clock (check schema-*.json). Run again during a live slate.' : 'all gaps are ± the 3 s poll; score gaps depend on how often teams score, so the clock gap is the better refresh-rate indicator.');
  const byPath = {};
  for (const l of lags) (byPath[l.path] ??= []).push(l.lagMs);
  for (const [p, xs] of Object.entries(byPath).slice(0, 4)) { const s = [...xs].sort((a, b) => a - b); say(`provider timestamp "${p}": our receive time minus it = median ${(s[Math.floor(s.length / 2)] / 1000).toFixed(1)}s (n=${s.length}); an UPPER bound on staleness, not the true delay`); }
}

if (stopped) say(`\nStopped: ${stopped}`);
say(`\n${n} request(s) made. Files in ${out}/ (raw responses are public market metadata; no credentials were used). Send that folder back.`);
writeFileSync(`${out}/report.md`, report.join('\n'));
