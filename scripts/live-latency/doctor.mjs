// Preflight for the latency probe. Makes AT MOST ONE request per feed (and applies the same rights gating as the probe), then
// reports: Node version, the exact hosts contacted, whether each feed answered, how many games the extractor read from it, a
// sample row, and what the server clock says. This is also the first real test of each extractor against a live payload.
//
//   node scripts/live-latency/doctor.mjs --feeds nhl-web,nba-cdn,mlb-statsapi --ack-unlicensed [--domains]
import { EXTRACTORS } from './feeds.mjs';
import { planRun } from './policy.mjs';

const argv = process.argv;
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const all = (k) => argv.flatMap((a, i) => (argv[i - 1] === `--${k}` ? [a] : []));
const feeds = arg('feeds', Object.keys(EXTRACTORS).filter((id) => !id.startsWith('espn-'))).toString().split(',').filter(Boolean);
const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const hostOf = (id) => new URL(EXTRACTORS[id].url(ymd)).host;

if (argv.includes('--domains')) {
  console.log([...new Set(feeds.filter((f) => EXTRACTORS[f]).map(hostOf))].sort().join('\n'));
  process.exit(0);
}

const major = Number(process.versions.node.split('.')[0]);
console.log(`Node ${process.versions.node} ${major >= 20 ? 'OK' : 'TOO OLD (need 20+)'}`);
if (major < 20) process.exit(1);
const plan = planRun(feeds, EXTRACTORS, { interval: 5000, minutes: 1, ackUnlicensed: argv.includes('--ack-unlicensed'), ackProhibited: all('ack-prohibited') });
if (!plan.ok) { console.error(plan.errors.join('\n')); process.exit(2); }
console.log(`Hosts: ${[...new Set(feeds.map(hostOf))].join(', ')}`);

let bad = 0;
for (const id of feeds) {
  const ex = EXTRACTORS[id];
  const t0 = Date.now();
  try {
    const res = await fetch(ex.url(ymd), { headers: { 'user-agent': 'sift-latency-doctor/0.2 (one request; owner-run preflight)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    if (!res.ok) { bad++; console.log(`✗ ${id}: HTTP ${res.status} in ${ms} ms${res.status === 403 || res.status === 429 ? ' — the provider is refusing; do not retry or raise the rate' : ''}`); continue; }
    const rows = ex.extract(await res.json());
    const live = rows.filter((r) => r.live).length;
    const skew = res.headers.get('date') ? `, server clock − local ≈ ${((Date.parse(res.headers.get('date')) + 500 - (t0 + ms / 2)) / 1000).toFixed(1)}s` : '';
    console.log(`${rows.length ? '✓' : '?'} ${id}: HTTP 200 in ${ms} ms, ${rows.length} game(s) read (${live} live)${skew}${rows.length ? '' : ' — zero rows: no games on today, or the payload shape differs from the extractor (send me one saved response)'}`);
    if (rows[0]) console.log(`    sample: ${JSON.stringify(rows[0])}`);
  } catch (e) { bad++; console.log(`✗ ${id}: ${e.cause?.code ?? e.message} — blocked by a firewall/DNS, or offline`); }
  await new Promise((r) => setTimeout(r, 1500));
}
process.exit(bad ? 1 : 0);
