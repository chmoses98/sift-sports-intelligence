// Owner-run latency probe: polls the chosen score feeds at a LOW, rights-aware rate during live games and records the first
// moment each score change is seen, per feed. A mark page (open it on the phone that is running Real) lets a person tap which
// TEAM scored, in Real and at the venue/broadcast. analyze.mjs then reports the delays, missed events and uncertainty.
//
//   node scripts/live-latency/probe.mjs --plan  --feeds nhl-web,nba-cdn --ack-unlicensed          (what it WOULD do; no requests)
//   node scripts/live-latency/probe.mjs --feeds nhl-web,nba-cdn --contact you@example.com --ack-unlicensed [--interval 5000] [--minutes 150]
//
// Conditions it enforces itself (policy.mjs): per-feed minimum intervals; a feed with no licence or with a reported
// automation ban will not start without an explicit acknowledgement flag; one request in flight per feed; a 403/429 stops that
// feed for the rest of the run (no retry); 5xx backs off exponentially; the run is capped at 4 hours. This is a short
// measurement, never a service. Do not leave it running and do not raise the rate.
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { EXTRACTORS } from './feeds.mjs';
import { afterResponse, planRun } from './policy.mjs';

const argv = process.argv;
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const all = (k) => argv.flatMap((a, i) => (argv[i - 1] === `--${k}` ? [a] : []));
const feedIds = arg('feeds', '').split(',').filter(Boolean);
const out = arg('out', 'latency-run');
const interval = Number(arg('interval', 5000));
const port = Number(arg('port', 8787));
const minutes = Number(arg('minutes', 150));
const contact = arg('contact', '');
const overrides = Object.fromEntries(all('override').map((a) => a.split(/=(.*)/s).slice(0, 2))); // pipeline tests against a local simulator only

const plan = planRun(feedIds, EXTRACTORS, { interval, minutes, ackUnlicensed: argv.includes('--ack-unlicensed'), ackProhibited: all('ack-prohibited') });
const usage = `feeds: ${Object.keys(EXTRACTORS).join(', ')}`;
if (!feedIds.length) { console.error(`--feeds required. ${usage}`); process.exit(2); }
if (!plan.ok) { console.error(plan.errors.join('\n')); process.exit(2); }
console.log(`Plan: ${plan.feeds.map((f) => `${f.id} every ${f.intervalMs / 1000}s (${f.perMinute}/min${f.clamped ? ', raised to its floor' : ''}, ${f.status})`).join('; ')}; ≤ ${plan.totalRequests} requests in ${minutes} min.`);
if (argv.includes('--plan')) process.exit(0);
if (!contact) { console.error('--contact <email> is required (it goes in the User-Agent so a provider can reach you).'); process.exit(2); }

mkdirSync(out, { recursive: true });
const log = (file, rec) => appendFileSync(`${out}/${file}.jsonl`, JSON.stringify(rec) + '\n');
const UA = `sift-latency-probe/0.2 (owner-run measurement; contact ${contact})`;
const ymd = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

const last = new Map(); // `${src}|${game}` -> score string
const prevPoll = new Map(); // src -> time of the previous successful poll
const latest = new Map(); // game -> display row for the mark page
const stopped = new Set();

async function poll(src) {
  const ex = EXTRACTORS[src];
  const t0 = Date.now();
  const headers = { 'user-agent': UA, accept: 'application/json' };
  let url = overrides[src] ?? ex.url(ymd());
  if (ex.auth && process.env[ex.auth.env]) {
    if (ex.auth.header) headers[ex.auth.header] = process.env[ex.auth.env];
    else if (ex.auth.query) url += `${url.includes('?') ? '&' : '?'}${ex.auth.query}=${encodeURIComponent(process.env[ex.auth.env])}`;
  }
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    log('polls', { type: 'poll', src, at: t0, error: String(e) });
    return 'BACKOFF';
  }
  const rttMs = Date.now() - t0;
  const meta = { type: 'poll', src, at: t0, rttMs, http: res.status, age: res.headers.get('age'), httpDate: res.headers.get('date'), cache: res.headers.get('x-cache') ?? res.headers.get('cf-cache-status') };
  const verdict = afterResponse(res.status);
  if (verdict !== 'OK' || !res.ok) { log('polls', meta); return verdict === 'OK' ? 'BACKOFF' : verdict; }
  let rows = [];
  try { rows = ex.extract(await res.json()); } catch { /* an unreadable body logs zero rows */ }
  const seenAt = Date.now(); // the answer's arrival: the observation time
  log('polls', { ...meta, rows: rows.length });
  const prev = prevPoll.get(src) ?? null;
  prevPoll.set(src, seenAt);
  for (const r of rows) {
    const score = r.awayScore == null || r.homeScore == null ? null : `${r.awayScore}-${r.homeScore}`;
    latest.set(r.game, { game: r.game, away: r.away, home: r.home, score, status: r.status, src, at: seenAt, live: r.live });
    if (score == null) continue;
    const k = `${src}|${r.game}`;
    const was = last.get(k);
    last.set(k, score);
    if (was === undefined) log('changes', { type: 'baseline', src, game: r.game, score, seenAt, status: r.status });
    else if (was !== score) log('changes', { type: 'change', kind: 'score', src, game: r.game, score, was, status: r.status, period: r.period, clock: r.clock, seenAt, prevPollAt: prev ?? seenAt, httpDate: meta.httpDate, age: meta.age });
  }
  return 'OK';
}

const stopAt = Date.now() + minutes * 60_000;
const floors = new Map(plan.feeds.map((f) => [f.id, f.intervalMs]));
for (const src of feedIds) {
  (async () => {
    let bad = 0;
    await new Promise((r) => setTimeout(r, Math.random() * floors.get(src))); // de-synchronise feeds
    while (Date.now() < stopAt && !stopped.has(src)) {
      const t = Date.now();
      const v = await poll(src);
      if (v === 'STOP') { stopped.add(src); console.error(`${src}: the provider answered 403/429, so this feed is STOPPED for the rest of the run (no retry).`); log('polls', { type: 'stopped', src, at: Date.now() }); break; }
      bad = v === 'OK' ? 0 : Math.min(bad + 1, 6);
      const wait = v === 'OK' ? floors.get(src) : floors.get(src) * 2 ** bad;
      await new Promise((r) => setTimeout(r, Math.max(0, wait - (Date.now() - t))));
    }
  })();
}

const PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>latency marks</title>
<style>body{font:16px system-ui;margin:12px}button{font-size:18px;padding:12px 16px;margin:3px;border-radius:10px;border:1px solid #888;background:#fff}
.g{border-top:1px solid #ccc;padding:8px 0}.r{margin:2px 0}small{color:#666}#t{color:#060;min-height:1.4em}.u{font-size:13px;padding:4px 8px}</style>
<h3>Tap the TEAM that scored, the instant it shows</h3>
<p><b>Real</b> = the score changed in Real on this phone. <b>Play</b> = you saw the scoring play (venue / OTA broadcast).
Tap once per score change. Mis-tap? Use undo.</p><div id=t></div><div id=l></div>
<script>
const mark=(game,kind,team)=>fetch('/mark',{method:'POST',body:JSON.stringify({game,kind,team})}).then(()=>{document.getElementById('t').textContent=kind+' '+team+' '+game+' '+new Date().toLocaleTimeString()});
const undo=(game,of)=>fetch('/mark',{method:'POST',body:JSON.stringify({game,kind:'undo',of})}).then(()=>{document.getElementById('t').textContent='undid last '+of+' '+game});
function row(x,kind,label){return '<div class=r><b>'+label+'</b> <button onclick="mark(\\''+x.game+'\\',\\''+kind+'\\',\\'away\\')">'+x.away+'</button><button onclick="mark(\\''+x.game+'\\',\\''+kind+'\\',\\'home\\')">'+x.home+'</button><button class=u onclick="undo(\\''+x.game+'\\',\\''+kind+'\\')">undo</button></div>'}
async function load(){const g=await (await fetch('/games')).json();document.getElementById('l').innerHTML=g.map(x=>'<div class=g><b>'+x.game+'</b> '+(x.score||'–')+' <small>'+(x.status||'')+'</small>'+row(x,'real','Real')+row(x,'truth','Play')+'</div>').join('')}
load();setInterval(()=>{if(!document.querySelector('button:active'))load()},20000);
</script>`;
createServer((req, res) => {
  const at = Date.now(); // stamped on receipt, on the same clock as the probe
  if (req.method === 'POST' && req.url === '/mark') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try {
        const m = JSON.parse(b);
        if (m.kind === 'undo' && ['real', 'truth'].includes(m.of) && typeof m.game === 'string') log('marks', { kind: 'undo', of: m.of, game: m.game, at });
        else if (['real', 'truth'].includes(m.kind) && ['away', 'home'].includes(m.team) && typeof m.game === 'string') log('marks', { kind: m.kind, game: m.game, team: m.team, at });
      } catch { /* ignore */ }
      res.end('ok');
    });
  } else if (req.url === '/games') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([...latest.values()].sort((a, b) => Number(b.live) - Number(a.live) || a.game.localeCompare(b.game))));
  } else { res.setHeader('content-type', 'text/html'); res.end(PAGE); }
}).listen(port, () => console.log(`Running. Mark page: http://localhost:${port}  (phone: http://<this-mac's-LAN-IP>:${port}). Records in ${out}/`));
setTimeout(() => process.exit(0), minutes * 60_000 + 2000);
