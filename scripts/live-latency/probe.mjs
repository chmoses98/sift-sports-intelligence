// Owner-run latency probe: polls the chosen score feeds at a low, fixed rate during live games and records the FIRST
// moment each score change is seen, per feed. A small mark page (open it on the phone that is running Real) lets a
// person tap "Real updated" / "Play happened" at the moment it happens. analyze.mjs then reports the delays.
//
//   node scripts/live-latency/probe.mjs --feeds nhl-web,espn-nhl,nba-cdn,espn-nba --out latency-run --interval 3000 \
//        --contact you@example.com [--port 8787] [--minutes 180]
//
// Polite by construction: one request per feed per interval (floor 2 s), a descriptive User-Agent with a contact, exponential
// backoff on 429/5xx, no concurrency per feed, no scraping beyond the one documented scoreboard URL per feed. It is a
// short measurement, not a service: do not leave it running, and do not point it at a vendor whose terms forbid it.
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { EXTRACTORS } from './feeds.mjs';

const arg = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d);
const feeds = arg('feeds', '').split(',').filter(Boolean);
const out = arg('out', 'latency-run');
const interval = Math.max(2000, Number(arg('interval', 3000)));
const port = Number(arg('port', 8787));
const minutes = Number(arg('minutes', 180));
const contact = arg('contact', '');
// --override espn-nhl=http://127.0.0.1:9000/x  points one feed at a local simulator (pipeline tests); never a real measurement.
const overrides = Object.fromEntries(process.argv.flatMap((a, i) => (process.argv[i - 1] === '--override' ? [a.split(/=(.*)/s).slice(0, 2)] : [])));
if (!feeds.length || !contact || feeds.some((f) => !EXTRACTORS[f])) {
  console.error(`usage: --feeds <${Object.keys(EXTRACTORS).join('|')}>,… --contact <email> [--out dir] [--interval ms>=2000] [--port 8787] [--minutes 180]`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const log = (file, rec) => appendFileSync(`${out}/${file}.jsonl`, JSON.stringify(rec) + '\n');
const UA = `sift-latency-probe/0.1 (owner-run measurement; contact ${contact})`;
const ymd = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

const last = new Map(); // `${src}|${game}` -> { sig, score }
const prevPoll = new Map(); // src -> time of the previous successful poll
const latest = new Map(); // game -> { game, score, status, src, at }

async function poll(src) {
  const ex = EXTRACTORS[src];
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(overrides[src] ?? ex.url(ymd()), { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    log('polls', { type: 'poll', src, at: t0, error: String(e) });
    return { ok: false };
  }
  const rtt = Date.now() - t0;
  const meta = { type: 'poll', src, at: t0, rttMs: rtt, http: res.status, age: res.headers.get('age'), httpDate: res.headers.get('date'), cache: res.headers.get('x-cache') ?? res.headers.get('cf-cache-status') };
  if (res.status === 429 || res.status >= 500) { log('polls', meta); return { ok: false, retryAfter: Number(res.headers.get('retry-after')) * 1000 || 0 }; }
  let rows = [];
  try { rows = ex.extract(await res.json()); } catch { /* an unreadable body is logged as zero rows */ }
  // The response is a snapshot taken between the request and the answer; use the answer time as the observation time.
  const seenAt = Date.now();
  log('polls', { ...meta, rows: rows.length });
  const prev = prevPoll.get(src) ?? null;
  prevPoll.set(src, seenAt);
  for (const r of rows) {
    const k = `${src}|${r.game}`;
    const score = r.awayScore == null || r.homeScore == null ? null : `${r.awayScore}-${r.homeScore}`;
    const sig = `${score}|${r.status}|${r.period}`;
    const was = last.get(k);
    last.set(k, { sig, score });
    latest.set(r.game, { game: r.game, score, status: r.status, src, at: seenAt, live: r.live });
    if (!was || prev == null) continue; // first sight of a game is a baseline, not a change
    if (was.score !== score && score != null) log('changes', { type: 'change', kind: 'score', src, game: r.game, score, was: was.score, status: r.status, period: r.period, clock: r.clock, seenAt, prevPollAt: prev, httpDate: meta.httpDate, age: meta.age });
    else if (was.sig !== sig) log('changes', { type: 'change', kind: 'status', src, game: r.game, status: r.status, period: r.period, seenAt, prevPollAt: prev });
  }
  return { ok: true };
}

const stop = Date.now() + minutes * 60_000;
for (const src of feeds) {
  (async () => {
    let wait = 0;
    let bad = 0;
    await new Promise((r) => setTimeout(r, Math.random() * interval)); // de-synchronise feeds
    while (Date.now() < stop) {
      const t = Date.now();
      const r = await poll(src);
      bad = r.ok ? 0 : Math.min(bad + 1, 6);
      wait = r.ok ? interval : Math.max(r.retryAfter ?? 0, interval * 2 ** bad);
      await new Promise((res) => setTimeout(res, Math.max(0, wait - (Date.now() - t))));
    }
  })();
}

const PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>latency marks</title>
<style>body{font:16px system-ui;margin:12px}button{font-size:18px;padding:14px;margin:4px;border-radius:10px;border:1px solid #888}.g{border-top:1px solid #ccc;padding:8px 0}</style>
<h3>Tap the instant it happens</h3><p>Real = the score changed in Real on this phone. Play = you saw the scoring play (venue / fastest source).</p><div id=l></div>
<script>
const mark=(game,kind)=>fetch('/mark',{method:'POST',body:JSON.stringify({game,kind})}).then(()=>{document.getElementById('t').textContent=kind+' '+game+' '+new Date().toLocaleTimeString()});
async function load(){const g=await (await fetch('/games')).json();document.getElementById('l').innerHTML='<p id=t></p>'+g.map(x=>'<div class=g><b>'+x.game+'</b> '+(x.score||'–')+' <small>'+(x.status||'')+'</small><br><button onclick="mark(\\''+x.game+'\\',\\'real\\')">Real updated</button><button onclick="mark(\\''+x.game+'\\',\\'truth\\')">Play happened</button></div>').join('')}
load();setInterval(()=>{if(!document.querySelector('button:active'))load()},15000);
</script>`;
createServer((req, res) => {
  const at = Date.now(); // stamped on receipt, on the same clock as the probe
  if (req.method === 'POST' && req.url === '/mark') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { const m = JSON.parse(b); if (['real', 'truth'].includes(m.kind) && typeof m.game === 'string') log('marks', { kind: m.kind, game: m.game, at }); } catch { /* ignore */ } res.end('ok'); });
  } else if (req.url === '/games') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([...latest.values()].sort((a, b) => Number(b.live) - Number(a.live) || a.game.localeCompare(b.game))));
  } else { res.setHeader('content-type', 'text/html'); res.end(PAGE); }
}).listen(port, () => console.log(`probing ${feeds.join(', ')} every ${interval} ms for ${minutes} min; mark page on :${port}; records in ${out}/`));
setTimeout(() => process.exit(0), minutes * 60_000 + 2000);
