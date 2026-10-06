// Fetch Wikimedia Commons photographs PROPOSED for review (run by .github/workflows/stadium-images.yml;
// the dev container cannot reach Commons).
//
// A proposal is an entry in scripts/stadiums/photos.json with status "candidate", source.kind
// "wikimedia-commons", source.file (the exact Commons file), captured and crop, and no files yet. This
// script downloads that file, records its author, licence, page and original size from the Commons API,
// and makes the desktop / mobile / card derivatives under curation/stadiums/candidates/ — where they are
// reviewed, never served. It NEVER approves anything and NEVER touches an approved photo: approval is the
// owner's (npm run stadiums -- approve <id> ...), and an approved photo's files are fixed by sha256.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, ROOT, deriveAll, load, loadJson } from './lib.mjs';

const UA = 'SiftStadiumImages/2.0 (https://github.com/chmoses98/sift-sports-intelligence; owner-reviewed curation)';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const { photos, targets } = load();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function json(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`gave up on ${url}`);
}

async function commonsInfo(file) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|sha1|extmetadata', titles: file }).forEach(([k, v]) => u.searchParams.set(k, v));
  const ii = (await json(u)).query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  return {
    url: ii.url, width: ii.width, height: ii.height, sha1: ii.sha1, page: ii.descriptionurl,
    author: strip(m.Artist?.value) || strip(m.Credit?.value) || null,
    license: strip(m.LicenseShortName?.value) || null,
    license_url: m.LicenseUrl?.value ?? null,
    date: strip(m.DateTimeOriginal?.value).slice(0, 10) || null,
  };
}

const todo = Object.entries(photos).filter(([id, p]) => p.status === 'candidate' && p.source?.kind === 'wikimedia-commons' && !p.files && (!ONLY || ONLY.has(id) || ONLY.has(p.venue)));
const tmp = join(ROOT, '.curation-tmp');
mkdirSync(tmp, { recursive: true });
mkdirSync(PATHS.candidates, { recursive: true });
const failed = [];
for (const [id, p] of todo) {
  try {
    const info = await commonsInfo(p.source.file);
    if (!info) throw new Error(`${p.source.file} is not on Wikimedia Commons`);
    if (!info.author || !info.license || !info.license_url) throw new Error(`${p.source.file}: Commons does not state author, licence and licence URL`);
    const r = await fetch(info.url, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`download ${r.status}`);
    const src = join(tmp, `${id}.src`);
    writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    const d = deriveAll(src, { id, crop: p.crop, grade: p.grade ?? null, outDir: PATHS.candidates, relDir: 'curation/stadiums/candidates', targets });
    rmSync(src, { force: true });
    photos[id] = {
      ...p,
      source: { ...p.source, url: info.page, author: info.author, license: info.license, license_url: info.license_url, original: { width: info.width, height: info.height, sha1: info.sha1, retained_by: 'Wikimedia Commons (not committed)' }, retrieved: new Date().toISOString().slice(0, 10) },
      captured: { ...p.captured, date: p.captured?.date ?? info.date },
      transformations: d.transformations,
      files: d.files,
    };
    console.log(`candidate ${id}  ${p.source.file}  (${info.license}, ${info.author}) — OWNER REVIEW REQUIRED`);
  } catch (e) {
    failed.push(`${id}: ${e.message}`);
    console.log(`FAIL ${id}: ${e.message}`);
  }
  await sleep(500);
}
if (todo.length) {
  const doc = loadJson(PATHS.photos);
  doc.photos = photos;
  writeFileSync(PATHS.photos, JSON.stringify(doc, null, 1) + '\n');
}
console.log(`${todo.length - failed.length}/${todo.length} proposed Commons photos fetched as candidates${failed.length ? `; failed:\n- ${failed.join('\n- ')}` : ''}`);
if (failed.length) process.exitCode = 1;
