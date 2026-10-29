// Fill the captured preview's gaps: published STATIC RESEARCH documents (rankings, series, profiles, metric definitions) that a crawled route asked
// for and no cache holds. Live-quote, slate, board, event and model documents are never fetched (they would not belong to the capture instant).
//
//   node scripts/v3-preview/fetch-gaps.mjs [--missed docs/sift3/qa/impl/preview/missed-documents.json] [--into .v3-feed-cache-gaps] [--dry]
//
// A fetched document is accepted only if it belongs to the SAME PUBLICATION RUN as documents already in the capture (its `run_id` appears on a
// document of the same kind already captured): a ranking republished after the capture would otherwise disagree with the team profile that links
// to it. Everything is recorded in <into>/gaps.json (url, fetched time, kind, run_id, verdict). curl honours the environment proxy and CA bundle.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, readCache, sha1 } from './capture-lib.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };
const missedFile = arg('missed', 'docs/sift3/qa/impl/preview/missed-documents.json');
const into = arg('into', '.v3-feed-cache-gaps');
const dry = argv.includes('--dry');
const fam = '.v3-feed-cache-families';

const ALLOW = [/\/explorer\/(rankings|series|teams|players)\/[^/]+\.json$/, /\/explorer\/metrics\.json$/];
const DENY = [/live-quotes/, /\/explorer\/events\//, /\/explorer\/(boards?|slate|recommendations)\b/, /projection-data/, /intelligence/];
const allowed = (u) => ALLOW.some((r) => r.test(u)) && !DENY.some((r) => r.test(u));

const urls = JSON.parse(readFileSync(missedFile, 'utf8')).urls;
mkdirSync(into, { recursive: true });
const log = existsSync(join(into, 'gaps.json')) ? JSON.parse(readFileSync(join(into, 'gaps.json'), 'utf8')) : {};

// the publication runs already in the capture, by document kind
const runs = new Map();
const noteRuns = (dir) => { if (!existsSync(dir)) return; for (const [, b] of readCache(dir)) { try { const j = JSON.parse(b.toString('utf8')); if (j?.run_id) { const k = kindOf(b); (runs.get(k) ?? runs.set(k, new Set()).get(k)).add(j.run_id); } } catch { /* not json */ } } };
noteRuns('.v3-feed-cache');
for (const f of ['player', 'team', 'stat', 'game']) noteRuns(`${fam}/${f}`);

let ok = 0; let rejected = 0; let skipped = 0; let failed = 0;
for (const u of urls) {
  const h = sha1(u);
  if (log[h]?.verdict === 'accepted' && existsSync(join(into, h))) { ok++; continue; }
  if (!allowed(u)) { log[h] = { url: u, verdict: 'not fetched: not a static research document' }; skipped++; continue; }
  if (dry) { console.log('would fetch', u); continue; }
  const f = join(into, h);
  try { execFileSync('curl', ['-sS', '--fail', '-m', '40', '-o', f, u], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { log[h] = { url: u, verdict: `not fetched: ${String(e.stderr ?? e.message).trim().slice(0, 120)}` }; failed++; rmSync(f, { force: true }); continue; }
  const bytes = readFileSync(f);
  const kind = kindOf(bytes);
  let j = null; try { j = JSON.parse(bytes.toString('utf8')); } catch { /* checked below */ }
  const rid = j?.run_id ?? null;
  const same = rid == null ? true : (runs.get(kind)?.has(rid) ?? false);
  const rec = { url: u, fetchedAt: new Date().toISOString(), kind, run_id: rid, generated_at: j?.generated_at ?? null, bytes: bytes.length };
  if (j == null) { log[h] = { ...rec, verdict: 'rejected: not JSON' }; rmSync(f); rejected++; }
  else if (!same) { log[h] = { ...rec, verdict: `rejected: run ${rid} is not a publication run of any ${kind} already in the capture (republished since)` }; rmSync(f); rejected++; }
  else { log[h] = { ...rec, verdict: 'accepted' }; ok++; }
}
writeFileSync(join(into, 'gaps.json'), JSON.stringify(log, null, 1) + '\n');
console.log(`gap fill: ${ok} accepted, ${rejected} rejected (different publication run), ${failed} not available at the source, ${skipped} never fetched (not static research documents)`);
