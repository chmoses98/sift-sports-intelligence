// READ-ONLY sampler for Kalshi's live-data endpoints, to find out what a free, first-party, already-integrated feed carries.
// Kalshi documents `GET /live_data/batch` and `GET /live_data/milestone/{id}` (incl. player stats for pro football, pro and
// college basketball) and `GET /milestones`. I could not read the response schemas, and the QUERY PARAMETER NAMES BELOW ARE
// UNVERIFIED — the script prints the HTTP status and a body excerpt for every call and saves the raw JSON, so a wrong name
// shows up as a 4xx rather than silently. Send me the saved folder and I will write the extractor from it.
// At most 8 requests, 1.5 s apart (Kalshi's public per-IP limit is roughly a 14-request burst refilling ~3/s).
//
//   node scripts/live-latency/kalshi-discover.mjs --contact you@example.com [--base https://api.elections.kalshi.com/trade-api/v2] [--out kalshi-sample]
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv;
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const base = arg('base', 'https://api.elections.kalshi.com/trade-api/v2');
const out = arg('out', 'kalshi-sample');
const contact = arg('contact', '');
if (!contact) { console.error('--contact <email> is required'); process.exit(2); }
mkdirSync(out, { recursive: true });
let n = 0;
async function get(label, path) {
  if (++n > 8) throw new Error('request budget (8) spent');
  const res = await fetch(base + path, { headers: { accept: 'application/json', 'user-agent': `sift-kalshi-discover/0.1 (owner-run, read-only; contact ${contact})` }, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  writeFileSync(`${out}/${String(n).padStart(2, '0')}-${label}.json`, text);
  console.log(`${res.status} ${path}\n   ${text.slice(0, 220).replace(/\s+/g, ' ')}`);
  await new Promise((r) => setTimeout(r, 1500));
  try { return res.ok ? JSON.parse(text) : null; } catch { return null; }
}
const ms = await get('milestones', '/milestones?limit=50');
const list = ms?.milestones ?? [];
console.log(`milestones returned: ${list.length}; categories: ${[...new Set(list.map((m) => m.category))].join(', ')}`);
const sports = list.filter((m) => /sport|football|basketball|hockey|baseball|soccer|tennis/i.test(`${m.category} ${m.type}`)).slice(0, 5);
if (sports.length) {
  await get('live-data-batch', `/live_data/batch?${sports.map((m) => `milestone_ids=${encodeURIComponent(m.id ?? m.milestone_id)}`).join('&')}`);
  await get('live-data-single', `/live_data/milestone/${encodeURIComponent(sports[0].id ?? sports[0].milestone_id)}`);
} else console.log('no sports milestones in the first page; try again during a live slate');
console.log(`Saved to ${out}/. Send that folder back (it contains public market metadata only; no credentials are used).`);
