// Fetch the curated stadium hero images ONCE and commit them (run by .github/workflows/stadium-images.yml).
//
// For every venue in scripts/stadiums/venues.json: the venue's Wikipedia lead image restricted to FREE
// licences (or the exact Commons file pinned in `commons_file`), at a standard Wikimedia thumbnail width,
// converted to WebP (a 1920 px hero and a 800 px card) under public/stadiums/, with its author, licence and
// source page recorded in src/lib/stadium-credits.json. Images are never fetched at runtime and never
// change between loads; a venue that already has an image is skipped unless FORCE=1.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'stadiums');
const CREDITS = join(ROOT, 'src', 'lib', 'stadium-credits.json');
const UA = 'SiftStadiumImages/1.0 (https://github.com/chmoses98/sift-sports-intelligence; one-time curated fetch)';
const FORCE = process.env.FORCE === '1';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
/** Bump when the output format changes: venues fetched with an older variant are re-fetched. */
const VARIANT = 'hero1600q60-card720q58';

const { venues } = JSON.parse(readFileSync(join(ROOT, 'scripts', 'stadiums', 'venues.json'), 'utf-8'));
const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, 'utf-8')) : { venues: {} };
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) {
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`gave up on ${url}`);
}
const strip = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function leadImage(title) {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageimages', piprop: 'name', pilicense: 'free', titles: title }).forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await json(u);
  const p = d.query?.pages?.[0];
  return p && !p.missing && p.pageimage ? { file: `File:${p.pageimage}`, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` } : null;
}

async function commonsInfo(file) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1920', titles: file }).forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await json(u);
  const p = d.query?.pages?.[0];
  const ii = p?.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  return {
    url: ii.thumburl ?? ii.url,
    width: ii.width,
    height: ii.height,
    description_url: ii.descriptionurl,
    artist: strip(m.Artist?.value) || strip(m.Credit?.value) || 'unknown',
    license: strip(m.LicenseShortName?.value) || 'unknown',
    license_url: m.LicenseUrl?.value ?? null,
  };
}

let ok = 0;
const failed = [];
for (const v of venues) {
  if (ONLY && !ONLY.has(v.slug)) continue;
  const hero = join(OUT, `${v.slug}.webp`);
  if (!FORCE && existsSync(hero) && credits.venues[v.slug]?.variant === VARIANT) {
    ok++;
    continue;
  }
  try {
    let pick = v.commons_file ? { file: v.commons_file, page: null } : null;
    for (const t of v.wiki ?? []) {
      if (pick) break;
      pick = await leadImage(t);
      await sleep(300);
    }
    if (!pick) throw new Error('no free lead image');
    const info = await commonsInfo(pick.file);
    if (!info) throw new Error(`${pick.file} is not on Wikimedia Commons`);
    const r = await fetch(info.url, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`download ${r.status}`);
    const tmp = join(OUT, `.${v.slug}.src`);
    writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    execFileSync('convert', [tmp, '-auto-orient', '-strip', '-resize', '1600x1067>', '-quality', '60', hero]);
    execFileSync('convert', [tmp, '-auto-orient', '-strip', '-resize', '720x480^', '-gravity', 'center', '-extent', '720x480', '-quality', '58', join(OUT, `${v.slug}-sm.webp`)]);
    execFileSync('rm', ['-f', tmp]);
    credits.venues[v.slug] = { variant: VARIANT, file: pick.file, page: pick.page, source: info.description_url, artist: info.artist, license: info.license, license_url: info.license_url, original_width: info.width, original_height: info.height };
    ok++;
    console.log(`ok   ${v.slug}  ${pick.file}  (${info.license}, ${info.artist})`);
  } catch (e) {
    failed.push(`${v.slug}: ${e.message}`);
    console.log(`FAIL ${v.slug}: ${e.message}`);
  }
  await sleep(500);
}
credits.generated_at = new Date().toISOString();
credits.source = 'Wikipedia lead image (free licence) via Wikimedia Commons; scripts/stadiums/fetch.mjs';
writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');
console.log(`\n${ok}/${ONLY ? ONLY.size : venues.length} venues have an image${failed.length ? `; failed:\n- ${failed.join('\n- ')}` : ''}`);
