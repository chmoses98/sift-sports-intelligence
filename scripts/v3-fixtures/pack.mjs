#!/usr/bin/env node
// pack: turn a scratch cache (files named by the SHA-1 of the request URL, optionally with journal.jsonl / capture.json / captured_at.txt from
// `capture`) into ONE family of the committed bundle (fixtures/real). Documents are sanitized-scanned, deduplicated across families by sha256 and
// stored byte-exact in gzip packs; a document no spec requested is dropped. Other families in the bundle are kept as they are.
//
//   node scripts/v3-fixtures/pack.mjs --family game --cache .v3-feed-cache --requests rec/game.txt --clock 2026-10-26T23:25:00Z --clock-basis "..."
//
// URL set (the cache keys are hashes, so URLs must come from somewhere): --requests (request logs written by the e2e helpers with V3_FEED_RECORD,
// lines `HIT <url>` / `MISS <url>`, or plain URLs), --urls (one per line) or, when neither is given, every URL in the cache's journal.jsonl.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, need } from './args.mjs';
import { FAMILIES, TOOL_VERSION, bundleDir, cacheKey, checkUrl, decodeUtf8, gitSha, isoZ, loadAllow, loadBundle, scanText, sha256, writeBundle } from './lib.mjs';

const lines = (f) => readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

function main() {
  const a = parseArgs(process.argv.slice(2), ['dry-run']);
  const family = need(a, 'family');
  if (!FAMILIES.includes(family)) throw new Error(`family must be one of ${FAMILIES.join(', ')}`);
  const cache = need(a, 'cache');
  const out = bundleDir(a.out);

  const jf = join(cache, 'journal.jsonl');
  const journal = new Map();
  if (existsSync(jf)) for (const l of lines(jf)) { const r = JSON.parse(l); journal.set(r.url, r); }
  const capture = existsSync(join(cache, 'capture.json')) ? JSON.parse(readFileSync(join(cache, 'capture.json'), 'utf8')) : null;

  const wanted = new Set();
  for (const f of (a.requests ?? '').split(',').filter(Boolean)) for (const l of lines(f)) { const m = /^(?:HIT|MISS)\s+(\S+)$/.exec(l); wanted.add(m ? m[1] : l); }
  if (a.urls) for (const l of lines(a.urls)) wanted.add(l);
  if (!wanted.size) for (const u of journal.keys()) wanted.add(u);
  if (!wanted.size) throw new Error('no URLs: give --requests, --urls or a cache with a journal.jsonl');

  const clock = a.clock ?? (existsSync(join(cache, 'captured_at.txt')) ? readFileSync(join(cache, 'captured_at.txt'), 'utf8').trim() : null);
  if (!clock || !Number.isFinite(Date.parse(clock))) throw new Error('the family needs a clock pin: --clock <ISO instant> or <cache>/captured_at.txt');

  const allow = loadAllow();
  const problems = [];
  const urls = {}; const docs = new Map(); let notInCache = 0;
  for (const url of [...wanted].sort()) {
    const bad = checkUrl(url); if (bad.length) { problems.push(...bad); continue; }
    const f = join(cache, cacheKey(url));
    const j = journal.get(url);
    if (!existsSync(f)) {
      if (j && j.status && j.status !== 200) urls[url] = { status: j.status, contentType: j.contentType ?? undefined, fetchedAt: j.fetchedAt };
      else notInCache++;
      continue;
    }
    const body = readFileSync(f);
    const text = decodeUtf8(body);
    if (text === null) { problems.push(`not UTF-8 text: ${url}`); continue; }
    for (const h of scanText(text, allow)) problems.push(`${h.rule} in ${url} @${h.at}: ${h.match}`);
    try { JSON.parse(text); } catch { problems.push(`not JSON: ${url}`); continue; }
    const sha = sha256(body);
    if (j?.sha256 && j.sha256 !== sha) problems.push(`journal sha256 differs from the cached bytes: ${url}`);
    docs.set(sha, body);
    urls[url] = { status: 200, sha256: sha, contentType: j?.contentType ?? 'application/json', fetchedAt: j?.fetchedAt ?? isoZ(statSync(f).mtime) };
  }
  const cacheFiles = readdirSync(cache).filter((f) => /^[0-9a-f]{40}$/.test(f)).length;
  const unrequested = cacheFiles - [...wanted].filter((u) => existsSync(join(cache, cacheKey(u)))).length;
  if (problems.length) { console.error(`PACK FAILED for ${family}: ${problems.length} problem(s)`); for (const p of problems.slice(0, 40)) console.error('  ' + p); process.exit(2); }

  const times = Object.values(urls).map((e) => Date.parse(e.fetchedAt)).filter(Number.isFinite);
  const fromJournal = journal.size > 0;
  const sources = new Map();
  for (const url of Object.keys(urls)) { const p = new URL(url).pathname.split('/'); const k = `${p[1]}/${p[2]}@${p[3]}`; sources.set(k, (sources.get(k) ?? 0) + 1); }
  const bundle = loadBundle(out);
  bundle.families[family] = {
    meta: {
      captured_start: capture?.started ?? (times.length ? isoZ(Math.min(...times)) : null),
      captured_end: capture?.finished ?? (times.length ? isoZ(Math.max(...times)) : null),
      capture_method: fromJournal
        ? 'scripts/v3-fixtures capture (curl; per-document fetch time, status and content type from journal.jsonl)'
        : 'a scratch cache filled by the e2e helpers\' live mode (curl) before the journal existed; per-document fetch time is the cached file\'s modification time and status 200 / application/json are those the helpers answered with',
      clock: { captured_at: isoZ(clock), basis: a['clock-basis'] ?? 'the instant the family\'s documents were captured' },
      specs: (a.specs ?? '').split(',').filter(Boolean),
      sources: [...sources].sort().map(([k, n]) => { const [repo, branch] = k.split('@'); return { repo, branch, documents: n }; }),
      capture_tool: capture?.tool ?? null,
      pack_tool: { name: 'scripts/v3-fixtures pack', version: TOOL_VERSION, git_sha: gitSha() },
      requested_urls: wanted.size,
      cache_files_dropped_unrequested: unrequested,
      not_in_cache: notInCache,
    },
    urls,
  };
  for (const [s, b] of docs) bundle.docs.set(s, b);
  // drop documents no family references any more (e.g. replaced by a refill)
  const live = new Set(); for (const f of Object.values(bundle.families)) for (const e of Object.values(f.urls)) if (e.sha256) live.add(e.sha256);
  for (const s of [...bundle.docs.keys()]) if (!live.has(s)) bundle.docs.delete(s);
  if (a['dry-run']) { console.log(`dry run: ${family}: ${Object.keys(urls).length} URLs, ${docs.size} documents`); return; }
  const { manifest } = writeBundle(out, bundle, { tool: { name: 'scripts/v3-fixtures', version: TOOL_VERSION, git_sha: gitSha() } });
  const m = manifest.families[family];
  console.log(`packed ${family}: ${m.entries.length} URLs (${m.documents} documents, ${m.bytes} bytes); ${unrequested} cached files no spec requested were dropped; ${notInCache} requested but not in the cache; bundle: ${manifest.totals.unique_documents} unique documents, ${manifest.totals.pack_compressed_bytes} compressed bytes`);
}

main();
