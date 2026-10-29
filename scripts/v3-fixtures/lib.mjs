// Shared code of the real-document fixture tooling (capture, pack, verify, unpack) and of the offline loader used by the e2e helpers.
// Format reference: fixtures/real/README.md. Plain ESM with no dependencies, so the same module runs in Node (the CLI tools and Playwright's
// test process); the browser-side reader is webLoader.mjs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const TOOL_VERSION = '1.0.0';
export const INDEX_SCHEMA = 'sift.v3.fixtures.index.v1';
export const MANIFEST_SCHEMA = 'sift.v3.fixtures.manifest.v1';
/** Families are never merged (their capture instants differ). This order also decides which pack stores a document two families share. */
export const FAMILIES = ['stat', 'team', 'game', 'player', 'props'];

/** Publication repositories whose sport has prop prices (src/v3/model/capabilities.ts `propPrices: ready`) and the route slug of each; the other repositories publish boards but no player ladders. */
export const PROP_SPORTS = { 'NHL-edge-finder': 'nhl', 'nba-edge-finder': 'nba', 'nfl-edge-finder': 'nfl', 'edge-finder-api': 'mlb', 'cfb-edge-finder': 'cfb', 'cbb-edge-finder': 'cbb' };
/** The only hosts a fixture URL may name. */
export const ALLOWED_HOSTS = ['raw.githubusercontent.com'];
/** A pack is closed when its uncompressed size would pass this; every committed file must stay far below 16 MB. */
export const PACK_RAW_MAX = 48 * 1024 * 1024;
export const FILE_MAX = 16 * 1024 * 1024;

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const bundleDir = (dir) => resolve(dir ?? process.env.V3_FIXTURES_DIR ?? join(repoRoot, 'fixtures', 'real'));

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/** The scratch-cache key (e2e/support/realFeeds.ts used it from the start): SHA-1 of the request URL. */
export const cacheKey = (url) => createHash('sha1').update(url).digest('hex');
export const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
export const isoZ = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function gitSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------------------
// Sanitization: every document body, every URL and the manifest are scanned; a hit fails packing and verification.
// ---------------------------------------------------------------------------------------------------------------------
export const SCAN_RULES = [
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: 'aws-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: 'payment-key', re: /\b(?:sk|rk|pk)_live_[0-9A-Za-z]{16,}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { id: 'authorization-header', re: /\bauthorization["']?\s*[:=]/i },
  { id: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/ },
  { id: 'basic-auth', re: /\bBasic\s+[A-Za-z0-9+/=]{16,}/ },
  { id: 'api-header', re: /\b(?:x-api-key|kalshi-access-(?:key|signature)|x-auth-token)\b/i },
  { id: 'secret-field', re: /"(?:api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd|private[_-]?key)"\s*:\s*"[^"]{4,}"/i },
  { id: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  { id: 'phone', re: /(?<![\d.-])(?:\+?1[-. ])?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?![\d-])/ },
  { id: 'ssn', re: /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/ },
  { id: 'url-userinfo', re: /https?:\/\/[^/\s"'@]+:[^/\s"'@]+@/ },
  { id: 'url-secret-query', re: /[?&](?:token|key|api_?key|apikey|access_token|auth|signature|sig|password)=[^&\s"']{6,}/i },
  { id: 'private-url', re: /\b(?:https?|ftp|file):\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[^/\s"']+\.(?:local|internal|corp|lan|intranet))\b|\bfile:\/\//i },
];

/** Findings in one text: `[{ rule, match, at }]` (match is shortened). `allow` is `[{ rule, match, reason }]` with an exact, reasoned exemption. */
export function scanText(text, allow = []) {
  const out = [];
  for (const { id, re } of SCAN_RULES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (let m = g.exec(text); m; m = g.exec(text)) {
      if (allow.some((a) => a.rule === id && a.match === m[0])) continue;
      out.push({ rule: id, match: m[0].length > 60 ? m[0].slice(0, 57) + '...' : m[0], at: m.index });
      if (out.length > 50) return out;
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  return out;
}

/** Problems with a fixture URL itself (host allow-list, no credentials, no query string with secrets). */
export function checkUrl(url) {
  const bad = [];
  let u;
  try { u = new URL(url); } catch { return [`not a URL: ${url}`]; }
  if (u.protocol !== 'https:') bad.push(`not https: ${url}`);
  if (!ALLOWED_HOSTS.includes(u.hostname)) bad.push(`host not allowed (${u.hostname}): ${url}`);
  if (u.username || u.password) bad.push(`credentials in URL: ${url}`);
  for (const f of scanText(url)) bad.push(`${f.rule} in URL: ${url}`);
  return bad;
}

export function loadAllow(dir = join(repoRoot, 'scripts', 'v3-fixtures')) {
  const f = join(dir, 'sanitize-allow.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).allow ?? [] : [];
}

/** A document must be UTF-8 text (the packs keep exact bytes; the loader answers them as they are). */
export function decodeUtf8(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------------------
// Bundle model:  { families: { name: { meta, urls: { url: { status, sha256?, contentType?, fetchedAt?, bytes? } } } }, docs: Map<sha256, Buffer> }
// ---------------------------------------------------------------------------------------------------------------------
export const emptyBundle = () => ({ families: {}, docs: new Map(), tool: null });

export function readBundleFiles(dir) {
  const d = bundleDir(dir);
  const index = JSON.parse(readFileSync(join(d, 'index.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(d, 'MANIFEST.json'), 'utf8'));
  return { dir: d, index, manifest };
}

/** Decompressed bytes of one pack (as a Buffer), checked against the index. */
export function readPack(dir, index, packName) {
  const p = index.packs[packName];
  if (!p) throw new Error(`index names no pack ${packName}`);
  const gz = readFileSync(join(bundleDir(dir), p.file));
  return { gz, raw: gunzipSync(gz), meta: p };
}

/** Loads a whole bundle into memory (packing, verification, unpacking). Returns an empty bundle when the directory has none. */
export function loadBundle(dir) {
  const d = bundleDir(dir);
  if (!existsSync(join(d, 'index.json'))) return emptyBundle();
  const { index, manifest } = readBundleFiles(d);
  const b = emptyBundle();
  b.tool = manifest.tool ?? null;
  const packs = new Map();
  for (const [sha, loc] of Object.entries(index.documents)) {
    if (!packs.has(loc.pack)) packs.set(loc.pack, readPack(d, index, loc.pack).raw);
    b.docs.set(sha, Buffer.from(packs.get(loc.pack).subarray(loc.offset, loc.offset + loc.length)));
  }
  for (const [name, fam] of Object.entries(index.families)) {
    const mf = manifest.families?.[name] ?? {};
    const urls = {};
    for (const [url, e] of Object.entries(fam.urls)) urls[url] = { ...e };
    for (const e of mf.entries ?? []) if (urls[e.url]) { urls[e.url].fetchedAt = e.fetched_at; urls[e.url].bytes = e.bytes; urls[e.url].contentType = e.content_type; }
    const meta = Object.fromEntries(Object.entries(mf).filter(([k]) => k !== 'entries'));
    b.families[name] = { meta: { ...meta, clock: fam.clock }, urls };
  }
  return b;
}

/** Which family's pack stores each document: the first family (in FAMILIES order) that references it. */
function owners(bundle) {
  const own = new Map();
  for (const name of FAMILIES) {
    const fam = bundle.families[name];
    if (!fam) continue;
    for (const e of Object.values(fam.urls)) if (e.sha256 && !own.has(e.sha256)) own.set(e.sha256, name);
  }
  return own;
}

const sourcesFromSports = () => {
  // src/data/sports.ts: `repo: 'owner/repo', branch: 'branch',` and `rawBase: '...'` per sport (parsed, not imported: the file reads import.meta.env).
  const f = join(repoRoot, 'src', 'data', 'sports.ts');
  if (!existsSync(f)) return [];
  const src = readFileSync(f, 'utf8');
  const out = [];
  for (const m of src.matchAll(/slug: '([^']+)'[\s\S]*?repo: '([^']+)', branch: '([^']+)',\s*rawBase: '([^']+)'/g)) out.push({ sport: m[1], repo: m[2], branch: m[3], raw_base: m[4], declared_in: 'src/data/sports.ts' });
  return out;
};

const ADDITIONAL_SOURCES = [
  { name: 'live-quotes', repo: 'chmoses98/sift-sports-intelligence', branch: 'live-quotes', path: 'games/<game key>.json', note: 'the live-quote feed (src/live), published by this repository\'s own job; per-game files and an index' },
  { name: 'router registry', repo: 'chmoses98/kalshi-bet-router', branch: 'app-data', path: 'app/latest/sports_registry.json', declared_in: 'src/data/sports.ts (REGISTRY_URL)' },
  { name: 'CFB research signals', repo: 'chmoses98/cfb-edge-finder', branch: 'research-signals', path: 'signals/cfb_research_signals.json', declared_in: 'src/data/sports.ts (CFB_RESEARCH_SIGNALS_URL)' },
];

export const PROVENANCE_NOTE =
  'Every document is a byte-exact copy of a file that its publisher serves publicly from raw.githubusercontent.com, in the repositories and branches named under "sources" '
  + '(research and board publications of the Sift data pipeline, plus the live-quote feed branch of this repository). They are kept here only so that the SIFT 3.0 test suite can '
  + 'reproduce real-document behaviour offline on a fixed clock; no document is modified (the only test-time transformations are the documented re-stamps in e2e/support). '
  + 'Prices and probabilities inside them describe the instants named in this manifest and are neither current nor a recommendation. '
  + 'Use of the data stays subject to the publishers\' own terms and the terms of the third-party sources they cite; inclusion here implies no endorsement by, or affiliation with, any league, team, '
  + 'player, data provider or exchange named in them.';

/** Deterministically writes a bundle (packs, index.json, MANIFEST.json). Returns the sizes. */
export function writeBundle(dir, bundle, o = {}) {
  const d = bundleDir(dir);
  mkdirSync(join(d, 'packs'), { recursive: true });
  const own = owners(bundle);
  // referenced documents only; a document nobody references is dropped
  const refs = new Set(); for (const f of Object.values(bundle.families)) for (const e of Object.values(f.urls)) if (e.sha256) refs.add(e.sha256);
  const packsOut = {}; const documents = {};
  const keep = new Set();
  for (const name of FAMILIES) {
    const shas = [...own].filter(([, f]) => f === name).map(([s]) => s).sort();
    let n = 0; let parts = []; let size = 0;
    const flush = () => {
      if (!parts.length) return;
      n += 1;
      const pname = `${name}-${n}`;
      const raw = Buffer.concat(parts.map((p) => p.buf));
      const gz = gzipSync(raw, { level: 9 });
      const file = `packs/${pname}.bin.gz`;
      writeFileSync(join(d, file), gz); keep.add(file);
      let off = 0;
      for (const p of parts) { documents[p.sha] = { pack: pname, offset: off, length: p.buf.length }; off += p.buf.length; }
      packsOut[pname] = { file, sha256: sha256(gz), compressed_bytes: gz.length, raw_bytes: raw.length, documents: parts.length };
      parts = []; size = 0;
    };
    for (const sha of shas) {
      const buf = bundle.docs.get(sha); if (!buf) throw new Error(`document ${sha} is referenced but missing`);
      if (size + buf.length > PACK_RAW_MAX && parts.length) flush();
      parts.push({ sha, buf }); size += buf.length;
    }
    flush();
  }
  // remove packs that are no longer written
  for (const f of readdirSync(join(d, 'packs'))) if (!keep.has(`packs/${f}`)) rmSync(join(d, 'packs', f), { force: true });

  const famIndex = {}; const famManifest = {};
  for (const name of FAMILIES) {
    const fam = bundle.families[name]; if (!fam) continue;
    const urls = {}; const entries = [];
    for (const url of Object.keys(fam.urls).sort()) {
      const e = fam.urls[url];
      urls[url] = e.sha256 ? { status: e.status, sha256: e.sha256 } : { status: e.status };
      entries.push({ url, status: e.status, sha256: e.sha256 ?? null, bytes: e.sha256 ? bundle.docs.get(e.sha256).length : 0, content_type: e.contentType ?? null, fetched_at: e.fetchedAt ?? null });
    }
    const docs = entries.filter((e) => e.sha256);
    const meta = fam.meta ?? {};
    famIndex[name] = { clock: meta.clock, urls };
    famManifest[name] = {
      ...Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'clock')),
      clock: meta.clock,
      documents: docs.length,
      bytes: docs.reduce((a, e) => a + e.bytes, 0),
      entries,
    };
  }
  const usedPacks = new Set(Object.values(documents).map((x) => x.pack));
  for (const p of Object.keys(packsOut)) if (!usedPacks.has(p)) delete packsOut[p];
  const index = { schema: INDEX_SCHEMA, packs: sortKeys(packsOut), documents: sortKeys(documents), families: famIndex };
  const files = [...Object.values(packsOut)];
  const manifest = {
    schema: MANIFEST_SCHEMA,
    tool: o.tool ?? bundle.tool ?? { name: 'scripts/v3-fixtures', version: TOOL_VERSION, git_sha: gitSha() },
    provenance: PROVENANCE_NOTE,
    sources: [...sourcesFromSports(), ...ADDITIONAL_SOURCES],
    families: famManifest,
    totals: {
      families: Object.keys(famManifest).length,
      urls: Object.values(famManifest).reduce((a, f) => a + f.entries.length, 0),
      unique_documents: Object.keys(documents).length,
      unique_bytes: [...refs].reduce((a, s) => a + bundle.docs.get(s).length, 0),
      pack_compressed_bytes: files.reduce((a, p) => a + p.compressed_bytes, 0),
    },
  };
  writeFileSync(join(d, 'index.json'), JSON.stringify(index) + '\n');
  writeFileSync(join(d, 'MANIFEST.json'), JSON.stringify(manifest, null, 1) + '\n');
  return { index, manifest };
}

export const dirSize = (dir) => { let n = 0; for (const f of readdirSync(dir, { withFileTypes: true })) n += f.isDirectory() ? dirSize(join(dir, f.name)) : statSync(join(dir, f.name)).size; return n; };

// ---------------------------------------------------------------------------------------------------------------------
// Offline reader for the e2e helpers (lazy: packs are decompressed on first use and kept for the life of the process).
// ---------------------------------------------------------------------------------------------------------------------
const loaded = new Map();
export function openBundle(dir) {
  const d = bundleDir(dir);
  if (loaded.has(d)) return loaded.get(d);
  const { index, manifest } = readBundleFiles(d);
  const raw = new Map();
  const reader = {
    dir: d, index, manifest,
    families: () => Object.keys(index.families),
    family(name) {
      const fam = index.families[name];
      if (!fam) throw new Error(`fixture family "${name}" is not in ${d} (has: ${Object.keys(index.families).join(', ')})`);
      return {
        name, clock: fam.clock, urls: Object.keys(fam.urls),
        /** `{ status, body, contentType }` for a stored URL, or null (the caller answers 404). */
        get(url) {
          const e = fam.urls[url]; if (!e) return null;
          if (!e.sha256) return { status: e.status, body: Buffer.alloc(0), contentType: 'text/plain' };
          const loc = index.documents[e.sha256];
          if (!raw.has(loc.pack)) raw.set(loc.pack, readPack(d, index, loc.pack).raw);
          return { status: e.status, body: raw.get(loc.pack).subarray(loc.offset, loc.offset + loc.length), contentType: 'application/json' };
        },
      };
    },
  };
  loaded.set(d, reader);
  return reader;
}

/** The clock pin of a family from the committed bundle (an ISO instant). */
export const familyClock = (name, dir) => openBundle(dir).family(name).clock.captured_at;
