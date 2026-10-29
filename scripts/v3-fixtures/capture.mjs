#!/usr/bin/env node
// capture: fill a scratch cache for ONE family from live fetches (curl, so the environment's proxy and CA bundle apply) and record, per URL,
// the status, content type, sha256, byte count and fetch time in <dir>/journal.jsonl. Then `pack` turns the scratch cache into the committed bundle.
//
//   node scripts/v3-fixtures/capture.mjs --family game --dir .v3-feed-cache --from-bundle       refetch every URL the committed family holds
//   node scripts/v3-fixtures/capture.mjs --family game --dir .v3-feed-cache --urls urls.txt     fetch the listed URLs (one per line)
//   V3_REAL_FEEDS=live npx playwright test ...                                                   the specs discover the URLs they need and fill the same cache and journal
//
// A family is captured in one session so that its documents describe one instant; the instant the specs' clock is pinned to is written to
// <dir>/captured_at.txt (the capture start, unless --clock says otherwise).
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parseArgs, need } from './args.mjs';
import { FAMILIES, TOOL_VERSION, cacheKey, checkUrl, gitSha, isoZ, openBundle, sha256 } from './lib.mjs';

const run = promisify(execFile);

/** One live fetch. Returns the journal record; the body is written to `file` only on HTTP 200. */
export async function fetchOne(url, file, o = {}) {
  const bad = checkUrl(url);
  if (bad.length) throw new Error(bad.join('; '));
  let last = { status: 0, contentType: null };
  for (let attempt = 1; attempt <= (o.attempts ?? 3); attempt++) {
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.part`;
    const fetchedAt = new Date();
    try {
      const { stdout } = await run('curl', ['-sS', '-m', String(o.timeout ?? 40), '-o', tmp, '-w', '%{http_code}\t%{content_type}', url], { maxBuffer: 1 << 20 });
      const [code, ct] = stdout.split('\t');
      last = { status: Number(code), contentType: (ct || '').split(';')[0] || null, fetchedAt: isoZ(fetchedAt) };
      if (last.status === 200) {
        const body = readFileSync(tmp);
        renameSync(tmp, file);
        return { url, ...last, sha256: sha256(body), bytes: body.length, tool: `scripts/v3-fixtures ${TOOL_VERSION}` };
      }
      rmSync(tmp, { force: true });
      if (last.status === 404 || last.status === 403) break; // a definite answer: record it, do not retry
    } catch (e) {
      rmSync(tmp, { force: true });
      last = { status: 0, contentType: null, fetchedAt: isoZ(fetchedAt), error: String(e.message).split('\n')[0] };
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return { url, ...last, sha256: null, bytes: 0, tool: `scripts/v3-fixtures ${TOOL_VERSION}` };
}

/** Appends a record to the journal of a scratch cache (also used by the e2e helpers in live mode). */
export const journal = (dir, rec) => appendFileSync(join(dir, 'journal.jsonl'), JSON.stringify(rec) + '\n');

async function main() {
  const a = parseArgs(process.argv.slice(2), ['from-bundle']);
  const family = need(a, 'family');
  if (!FAMILIES.includes(family)) throw new Error(`family must be one of ${FAMILIES.join(', ')}`);
  const dir = need(a, 'dir');
  mkdirSync(dir, { recursive: true });
  let urls = [];
  if (a.urls) urls.push(...readFileSync(a.urls, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  if (a['from-bundle']) urls.push(...openBundle(a.out).family(family).urls);
  urls = [...new Set(urls)];
  if (!urls.length) throw new Error('no URLs: give --urls <file> and/or --from-bundle');
  const started = new Date();
  const conc = Number(a.concurrency ?? 4);
  let next = 0;
  const stats = { ok: 0, notFound: 0, failed: 0 };
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const rec = await fetchOne(url, join(dir, cacheKey(url)), { timeout: a.timeout });
      journal(dir, rec);
      if (rec.status === 200) stats.ok++;
      else if (rec.status === 404) stats.notFound++;
      else {
        stats.failed++;
        console.error(`  ${rec.status} ${url} ${rec.error ?? ''}`);
      }
    }
  }));
  const finished = new Date();
  writeFileSync(join(dir, 'capture.json'), JSON.stringify({ family, started: isoZ(started), finished: isoZ(finished), tool: { name: 'scripts/v3-fixtures capture', version: TOOL_VERSION, git_sha: gitSha() }, urls: urls.length }, null, 1) + '\n');
  if (a.clock || !existsSync(join(dir, 'captured_at.txt'))) writeFileSync(join(dir, 'captured_at.txt'), (a.clock ? isoZ(a.clock) : isoZ(started)) + '\n');
  console.log(`captured ${family}: ${stats.ok} ok, ${stats.notFound} not found, ${stats.failed} failed of ${urls.length}; ${isoZ(started)} to ${isoZ(finished)}`);
  if (stats.failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
