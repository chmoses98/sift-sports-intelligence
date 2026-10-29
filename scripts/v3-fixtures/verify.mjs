#!/usr/bin/env node
// verify: hash, schema and hygiene checks of the committed bundle (fixtures/real). Exit 0 only when every check passes.
//   node scripts/v3-fixtures/verify.mjs [--dir fixtures/real] [--max-total-mb 15]
// Checks: file sizes (< 16 MB each), pack file hashes, every document's sha256 and length against its offset in the pack, no orphan or missing
// documents, index and MANIFEST.json agree entry by entry, URLs (https, allowed host, no credentials), documents are UTF-8 JSON of a known
// shape, clocks are valid instants, per-family counts and byte totals, and the sanitization scan of every document, URL and the manifest.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from './args.mjs';
import { FAMILIES, FILE_MAX, INDEX_SCHEMA, MANIFEST_SCHEMA, bundleDir, checkUrl, decodeUtf8, dirSize, loadAllow, scanText, sha256 } from './lib.mjs';

/** Shape checks for the document kinds the specs depend on. Everything else must still be a JSON object or array. */
export function checkShape(url, j) {
  if (j === null || typeof j !== 'object') return 'not a JSON object or array';
  if (url.includes('/live-quotes/')) {
    if (url.includes('/games/') && !(j.schema === 'sift.live_quotes.v1' && Array.isArray(j.markets))) return 'live-quote game file without schema sift.live_quotes.v1 and a markets array';
  }
  if (j.kind === 'event_detail' && !Array.isArray(j.markets)) return 'event_detail without a markets array';
  return null;
}

export function verifyBundle(dir, o = {}) {
  const d = bundleDir(dir);
  const errs = []; const notes = [];
  const err = (m) => errs.push(m);
  if (!existsSync(join(d, 'index.json')) || !existsSync(join(d, 'MANIFEST.json'))) return { errs: [`no index.json / MANIFEST.json in ${d}`], notes };
  const index = JSON.parse(readFileSync(join(d, 'index.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(d, 'MANIFEST.json'), 'utf8'));
  if (index.schema !== INDEX_SCHEMA) err(`index schema ${index.schema}`);
  if (manifest.schema !== MANIFEST_SCHEMA) err(`manifest schema ${manifest.schema}`);
  const allow = loadAllow();

  // files and sizes
  const files = []; const walk = (p) => { for (const f of readdirSync(p, { withFileTypes: true })) (f.isDirectory() ? walk(join(p, f.name)) : files.push(join(p, f.name))); }; walk(d);
  for (const f of files) if (statSync(f).size >= FILE_MAX) err(`file over 16 MB: ${f}`);
  const referencedPackFiles = new Set(Object.values(index.packs).map((p) => join(d, p.file)));
  for (const f of files) if (f.includes(`${join(d, 'packs')}/`) && !referencedPackFiles.has(f)) err(`pack file not in the index: ${f}`);

  // packs and documents
  const raws = new Map();
  for (const [name, p] of Object.entries(index.packs)) {
    const f = join(d, p.file);
    if (!existsSync(f)) { err(`pack file missing: ${p.file}`); continue; }
    const gz = readFileSync(f);
    if (sha256(gz) !== p.sha256) err(`pack ${name}: file hash differs from the index`);
    if (gz.length !== p.compressed_bytes) err(`pack ${name}: compressed size differs`);
    let raw; try { raw = gunzipSync(gz); } catch (e) { err(`pack ${name}: cannot gunzip (${e.message})`); continue; }
    if (raw.length !== p.raw_bytes) err(`pack ${name}: uncompressed size differs`);
    raws.set(name, raw);
  }
  const texts = new Map(); let covered = new Map();
  for (const [sha, loc] of Object.entries(index.documents)) {
    const raw = raws.get(loc.pack); if (!raw) { err(`document ${sha}: pack ${loc.pack} unreadable`); continue; }
    if (loc.offset + loc.length > raw.length) { err(`document ${sha}: outside its pack`); continue; }
    const body = raw.subarray(loc.offset, loc.offset + loc.length);
    if (sha256(body) !== sha) err(`document ${sha}: bytes do not hash to the key`);
    const text = decodeUtf8(body); if (text === null) { err(`document ${sha}: not UTF-8`); continue; }
    texts.set(sha, text);
    covered.set(loc.pack, (covered.get(loc.pack) ?? 0) + loc.length);
  }
  for (const [name, p] of Object.entries(index.packs)) if ((covered.get(name) ?? 0) !== p.raw_bytes) err(`pack ${name}: documents do not tile the pack (${covered.get(name) ?? 0} of ${p.raw_bytes} bytes)`);
  for (const [name, p] of Object.entries(index.packs)) if (Object.values(index.documents).filter((x) => x.pack === name).length !== p.documents) err(`pack ${name}: document count differs`);

  // families
  const referenced = new Set(); let urlCount = 0;
  for (const name of Object.keys(index.families)) {
    if (!FAMILIES.includes(name)) err(`unknown family ${name}`);
    const fam = index.families[name]; const mf = manifest.families?.[name];
    if (!mf) { err(`family ${name}: not in MANIFEST.json`); continue; }
    if (!Number.isFinite(Date.parse(fam.clock?.captured_at))) err(`family ${name}: clock.captured_at is not an instant`);
    if (JSON.stringify(fam.clock) !== JSON.stringify(mf.clock)) err(`family ${name}: clock differs between index and manifest`);
    for (const k of ['captured_start', 'captured_end']) if (!Number.isFinite(Date.parse(mf[k]))) err(`family ${name}: manifest ${k} is not an instant`);
    if (!Array.isArray(mf.specs) || !mf.specs.length) err(`family ${name}: manifest names no specs`);
    const urls = Object.keys(fam.urls);
    if (mf.entries.length !== urls.length) err(`family ${name}: ${urls.length} URLs in the index, ${mf.entries.length} in the manifest`);
    let bytes = 0; let docs = 0;
    for (const e of mf.entries) {
      const ie = fam.urls[e.url];
      if (!ie) { err(`family ${name}: manifest URL not in the index: ${e.url}`); continue; }
      if (ie.status !== e.status || (ie.sha256 ?? null) !== e.sha256) err(`family ${name}: index and manifest disagree on ${e.url}`);
      for (const b of checkUrl(e.url)) err(`family ${name}: ${b}`);
      if (e.sha256) {
        docs++; referenced.add(e.sha256);
        const loc = index.documents[e.sha256];
        if (!loc) { err(`family ${name}: document missing for ${e.url}`); continue; }
        if (loc.length !== e.bytes) err(`family ${name}: byte count differs for ${e.url}`);
        bytes += e.bytes;
        let j; try { j = JSON.parse(texts.get(e.sha256) ?? ''); } catch { err(`family ${name}: not JSON: ${e.url}`); continue; }
        const shape = checkShape(e.url, j); if (shape) err(`family ${name}: ${e.url}: ${shape}`);
      }
      if (!Number.isFinite(Date.parse(e.fetched_at))) err(`family ${name}: no fetch time for ${e.url}`);
      for (const f of scanText(e.url, allow)) err(`family ${name}: ${f.rule} in URL ${e.url}`);
    }
    if (mf.documents !== docs) err(`family ${name}: manifest says ${mf.documents} documents, entries have ${docs}`);
    if (mf.bytes !== bytes) err(`family ${name}: manifest says ${mf.bytes} bytes, entries have ${bytes}`);
    urlCount += urls.length;
  }
  for (const sha of Object.keys(index.documents)) if (!referenced.has(sha)) err(`orphan document (no family references it): ${sha}`);
  if (manifest.totals?.unique_documents !== Object.keys(index.documents).length) err('manifest totals.unique_documents is wrong');
  if (manifest.totals?.urls !== urlCount) err('manifest totals.urls is wrong');

  // sanitization of everything stored
  if (o.scan !== false) for (const [sha, text] of texts) for (const h of scanText(text, allow).slice(0, 3)) err(`sanitize: ${h.rule} in document ${sha}: ${h.match}`);
  for (const h of scanText(readFileSync(join(d, 'MANIFEST.json'), 'utf8'), allow)) err(`sanitize: ${h.rule} in MANIFEST.json: ${h.match}`);
  for (const h of scanText(readFileSync(join(d, 'index.json'), 'utf8'), allow)) err(`sanitize: ${h.rule} in index.json: ${h.match}`);

  const total = dirSize(d);
  const packBytes = Object.values(index.packs).reduce((a, p) => a + p.compressed_bytes, 0);
  notes.push(`${Object.keys(index.families).length} families, ${urlCount} URLs, ${Object.keys(index.documents).length} unique documents in ${Object.keys(index.packs).length} packs`);
  notes.push(`packs ${packBytes} bytes gzip; directory ${total} bytes`);
  if (o.maxTotalMb && total > o.maxTotalMb * 1024 * 1024) err(`directory is ${(total / 1048576).toFixed(1)} MB, over the ${o.maxTotalMb} MB budget`);
  return { errs, notes, total };
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = parseArgs(process.argv.slice(2));
  const { errs, notes } = verifyBundle(a.dir, { maxTotalMb: a['max-total-mb'] ? Number(a['max-total-mb']) : undefined });
  for (const n of notes) console.log(n);
  if (errs.length) { console.error(`VERIFY FAILED: ${errs.length} problem(s)`); for (const e of errs.slice(0, 60)) console.error('  ' + e); process.exit(1); }
  console.log('verify ok');
}
