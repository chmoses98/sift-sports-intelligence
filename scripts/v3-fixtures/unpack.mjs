#!/usr/bin/env node
// unpack: debugging aid. Writes one family of the committed bundle back out as a scratch cache (files named by the SHA-1 of the URL, plus
// captured_at.txt, journal.jsonl and urls.tsv), or prints one document.
//   node scripts/v3-fixtures/unpack.mjs --family game --out /tmp/game-cache        (use it with V3_FEED_CACHE=/tmp/game-cache for the legacy cache mode)
//   node scripts/v3-fixtures/unpack.mjs --family game --url https://raw.githubusercontent.com/...    print one document to stdout
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, need } from './args.mjs';
import { cacheKey, loadBundle, sha256 } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const family = need(a, 'family');
const b = loadBundle(a.dir);
const fam = b.families[family];
if (!fam) { console.error(`no family ${family} in the bundle`); process.exit(1); }
if (a.url) {
  const e = fam.urls[a.url];
  if (!e?.sha256) { console.error('not in the family (a 404 at test time)'); process.exit(1); }
  process.stdout.write(b.docs.get(e.sha256));
} else {
  const out = need(a, 'out');
  mkdirSync(out, { recursive: true });
  const tsv = []; const jl = [];
  for (const [url, e] of Object.entries(fam.urls)) {
    if (e.sha256) writeFileSync(join(out, cacheKey(url)), b.docs.get(e.sha256));
    tsv.push([cacheKey(url), e.status, e.sha256 ?? '', url].join('\t'));
    jl.push(JSON.stringify({ url, status: e.status, contentType: e.contentType ?? null, sha256: e.sha256 ?? null, bytes: e.sha256 ? b.docs.get(e.sha256).length : 0, fetchedAt: e.fetchedAt ?? null }));
  }
  writeFileSync(join(out, 'urls.tsv'), tsv.join('\n') + '\n');
  writeFileSync(join(out, 'journal.jsonl'), jl.join('\n') + '\n');
  writeFileSync(join(out, 'captured_at.txt'), fam.meta.clock.captured_at + '\n');
  console.log(`unpacked ${family}: ${Object.keys(fam.urls).length} URLs to ${out} (sha256 of the first document: ${sha256(b.docs.get(Object.values(fam.urls).find((e) => e.sha256).sha256)).slice(0, 12)})`);
}
