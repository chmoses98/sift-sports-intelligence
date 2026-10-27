// SIFT 3.0 captured-data preview: merge the captured real-document caches into ONE capture and pack it (build-time code, never in the app).
//
// A "cache" is a directory of files named by the SHA-1 of the request URL (e2e/support/realFeeds.ts), each the published document's bytes.
// The unified capture is: the BASE cache, plus (from the other families, in the order given) only the documents the base does not have;
// a document the base has is never replaced. Static research documents the routes need and no cache has can be added as GAP FILLS from a
// separate directory (scripts/v3-preview/fetch-gaps.mjs fills it); they are merged last and never replace anything.
//
// Pack format `sift3.captured-pack.v1` (read in the page by src/v3/preview/capture.ts):
//   packs/pNN.bin      the gzip member of each document, back to back (a doc is independently decompressible)
//   snapshot/index.json  { format, capturedAt, clockAt, ..., packs: [{ file, bytes }], docs: { "<sha1 of url>": [pack, offset, length] } }
// With --pack-encoding b64 each pack is written as base64 text (packs/pNN.txt) for hosts that refuse binary files; the offsets are those
// of the DECODED pack. Nothing is generated or edited: the bytes of every document are exactly the published ones.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const FORMAT = 'sift3.captured-pack.v1';
export const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const isKey = (f) => /^[0-9a-f]{40}$/.test(f);

/** What a document is, from its own fields (used for grouping packs and for the manifest; never to alter it). */
export function kindOf(bytes) {
  let j;
  try { j = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return 'non-json'; }
  if (Array.isArray(j)) return 'list';
  if (j && typeof j === 'object') return String(j.kind ?? j.schema ?? 'object');
  return 'scalar';
}

/** Read one cache directory: hash -> bytes. */
export function readCache(dir) {
  const out = new Map();
  if (!existsSync(dir)) throw new Error(`no captured documents at ${dir}`);
  for (const f of readdirSync(dir)) if (isKey(f)) out.set(f, readFileSync(join(dir, f)));
  return out;
}

export function readCapturedAt(dir) {
  const f = join(dir, 'captured_at.txt');
  if (!existsSync(f)) throw new Error(`${dir}/captured_at.txt is missing: the base capture must say when it was captured`);
  const t = Date.parse(readFileSync(f, 'utf8').trim());
  if (!Number.isFinite(t)) throw new Error(`${f} does not hold a time`);
  return new Date(t).toISOString().replace('.000Z', 'Z');
}

/**
 * @param {{ name: string, dir: string }} base
 * @param {{ name: string, dir: string }[]} others  families in priority order
 * @param {{ name: string, dir: string } | null} gaps
 * @returns {{ docs: Map<string, { bytes: Buffer, family: string, kind: string }>, additions: { hash: string, family: string, kind: string }[], skipped: Record<string, { absent: number, sameUrlDifferentBytes: number }>, counts: Record<string, number> }}
 */
export function mergeCaches(base, others, gaps = null) {
  const docs = new Map();
  const additions = [];
  const skipped = {};
  const counts = { [base.name]: 0 };
  for (const [h, b] of readCache(base.dir)) { docs.set(h, { bytes: b, family: base.name, kind: kindOf(b) }); counts[base.name]++; }
  for (const fam of [...others, ...(gaps ? [gaps] : [])]) {
    counts[fam.name] = 0;
    skipped[fam.name] = { absent: 0, sameUrlDifferentBytes: 0 };
    for (const [h, b] of readCache(fam.dir)) {
      const have = docs.get(h);
      if (have) { if (!have.bytes.equals(b)) skipped[fam.name].sameUrlDifferentBytes++; continue; }
      const kind = kindOf(b);
      docs.set(h, { bytes: b, family: fam.name, kind });
      additions.push({ hash: h, family: fam.name, kind });
      counts[fam.name]++;
    }
  }
  return { docs, additions, skipped, counts };
}

/**
 * Plan which pack each document goes in. `groups` is the route-by-route first-use order from a crawl ([{ group, hashes }]): each group
 * starts a new pack, so the documents one screen needs sit together and a screen loads few packs. Documents no group names follow, grouped by
 * kind. A pack closes when its gzip size would pass `cap` bytes (a single larger document gets its own pack).
 */
export function planPacks(docs, groups, cap) {
  const placed = new Set();
  const runs = [];
  for (const g of groups) {
    const hs = g.hashes.filter((h) => docs.has(h) && !placed.has(h));
    hs.forEach((h) => placed.add(h));
    if (hs.length) runs.push({ name: g.group, hashes: hs });
  }
  const rest = new Map();
  for (const [h, d] of [...docs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (!placed.has(h)) (rest.get(d.kind) ?? rest.set(d.kind, []).get(d.kind)).push(h);
  for (const [kind, hs] of [...rest].sort((a, b) => (a[0] < b[0] ? -1 : 1))) runs.push({ name: `other:${kind}`, hashes: hs });
  return runs.map((r) => ({ ...r, cap }));
}

/** Gzip + concatenate: returns the pack buffers and the index entries. */
export function buildPacks(docs, runs, cap, min = 0) {
  const packs = [];
  const entries = {};
  const members = new Map();
  const gz = (h) => members.get(h) ?? members.set(h, gzipSync(docs.get(h).bytes, { level: 9 })).get(h);
  let cur = null;
  const open = (name) => { cur = { name, parts: [], size: 0, docs: 0 }; packs.push(cur); };
  for (const r of runs) {
    // a screen's group starts a new pack only once the current one is worth fetching on its own (`min`); smaller neighbours share a pack
    if (cur && cur.size > 0 && cur.size < min) cur.name += `+${r.name}`; else open(r.name);
    for (const h of r.hashes) {
      const g = gz(h);
      if (cur.size > 0 && cur.size + g.length > cap) open(r.name);
      entries[h] = [packs.length - 1, cur.size, g.length];
      cur.parts.push(g); cur.size += g.length; cur.docs++;
    }
  }
  return { packs: packs.map((p) => ({ name: p.name, docs: p.docs, bytes: p.size, buf: Buffer.concat(p.parts) })), entries };
}

export function writePacks(out, { packs, entries }, encoding = 'bin') {
  mkdirSync(join(out, 'packs'), { recursive: true });
  const meta = packs.map((p, i) => {
    const file = `packs/p${String(i).padStart(2, '0')}.${encoding === 'b64' ? 'txt' : 'bin'}`;
    writeFileSync(join(out, file), encoding === 'b64' ? p.buf.toString('base64') : p.buf);
    return { file, name: p.name.slice(0, 80), docs: p.docs, bytes: p.bytes };
  });
  return { meta, entries };
}

/** Read a document back through an index and its packs (tests, and the build's self-check). */
export function readDoc(index, packBytes, hash) {
  const e = index.docs[hash];
  if (!e) return null;
  const [p, off, len] = e;
  const buf = packBytes(p);
  return Buffer.from(gunzipSync(buf.subarray(off, off + len)));
}
