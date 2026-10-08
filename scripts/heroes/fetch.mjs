// Turns the reviewed pins (scripts/heroes/pins.json) into the served hero files and the app's photo registry:
//   public/heroes/<sport>/<id>-2400.webp, -1200.webp (hero, chosen by viewport) and -720.webp (cards, tiles)
//   src/lib/hero/photos.json (team, venue, era, focus, identity and the credit read from Commons itself)
// A pin whose files already exist from the same Commons file is reused (its focus/identity/era are refreshed).
// Nothing is approved here: only pinned files are fetched, and a non-free licence fails the run.
// Run by .github/workflows/hero-images.yml (Commons is reachable from Actions, not from every dev container).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const UA = 'SiftHeroImages/1.0 (https://github.com/chmoses98/sift-sports-intelligence; game hero photographs)';
const WIDTHS = [2400, 1200, 720];
const QUALITY = { 2400: 66, 1200: 64, 720: 60 };
const FREE = /^(cc0|cc[- ]by(-sa)?( [\d.]+)?|cc[- ]by(-sa)? [\d.]+( [a-z-]+)?|public domain|pd.*)$/i;
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf-8'));

const { pins } = read('scripts/heroes/pins.json');
const blocked = new Set(read('scripts/heroes/blocklist.json').files.map((f) => f.file));
const prev = new Map(read('src/lib/hero/photos.json').photos.map((p) => [p.id, p]));
const TMP = join(ROOT, '.hero-tmp');
mkdirSync(TMP, { recursive: true });

async function commons(file) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|extmetadata', titles: file }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { headers: { 'user-agent': UA } }).catch(() => null);
    if (r?.ok) return (await r.json()).query?.pages?.[0]?.imageinfo?.[0] ?? null;
    await sleep(2000 * 2 ** i);
  }
  return null;
}

const out = [];
const failed = [];
for (const pin of pins) {
  if (blocked.has(pin.file)) { failed.push(`${pin.id}: ${pin.file} is on the blocklist`); continue; }
  const dir = join(ROOT, 'public', 'heroes', pin.sport.toLowerCase());
  mkdirSync(dir, { recursive: true });
  const files = WIDTHS.map((w) => join(dir, `${pin.id}-${w}.webp`));
  const old = prev.get(pin.id);
  const meta = { id: pin.id, sport: pin.sport, team: pin.team, venue: pin.venue, from: pin.from ?? null, to: pin.to ?? null, neutralOk: !!pin.neutralOk, identity: pin.identity, focus: pin.focus };
  if (old && old.credit.file === pin.file && (old.crop ?? null) === (pin.crop ?? null) && files.every(existsSync)) {
    out.push({ ...old, ...meta });
    continue;
  }
  const info = await commons(pin.file);
  if (!info) { failed.push(`${pin.id}: Commons has no ${pin.file}`); continue; }
  const m = info.extmetadata ?? {};
  const license = strip(m.LicenseShortName?.value);
  if (!FREE.test(license)) { failed.push(`${pin.id}: licence "${license}" is not free`); continue; }
  const src = join(TMP, `${pin.id}.orig`);
  const r = await fetch(info.url, { headers: { 'user-agent': UA } });
  if (!r.ok) { failed.push(`${pin.id}: download ${r.status}`); continue; }
  writeFileSync(src, Buffer.from(await r.arrayBuffer()));
  const base = join(TMP, `${pin.id}.png`);
  // Crop (optional, original pixels), auto-orient, a restrained grade: a touch of contrast and colour, never relit.
  execFileSync('convert', [src, '-auto-orient', ...(pin.crop ? ['-crop', pin.crop, '+repage'] : []), '-resize', '2400x>', '-sigmoidal-contrast', '2x50%', '-modulate', '100,104', '-strip', base]);
  for (const [i, w] of WIDTHS.entries()) execFileSync('convert', [base, '-resize', `${w}x>`, '-quality', String(QUALITY[w]), '-define', 'webp:method=6', files[i]]);
  const [W, H] = execFileSync('identify', ['-format', '%w %h', files[0]]).toString().trim().split(' ').map(Number);
  out.push({
    ...meta, w: W, h: H, widths: [2400, 1200], crop: pin.crop ?? null,
    credit: {
      artist: strip(m.Artist?.value).slice(0, 120) || 'Unknown', license, licenseUrl: strip(m.LicenseUrl?.value) || null,
      source: info.descriptionurl, file: pin.file,
      modifications: `${pin.crop ? 'Cropped, ' : ''}resized and colour graded by Sift`,
    },
  });
  console.log(`${pin.id}: ${W}x${H} from ${pin.file} (${license})`);
  await sleep(400);
}

// Files no pin owns any more are removed (a retired or replaced photo is never served by accident).
const keep = new Set(out.flatMap((p) => WIDTHS.map((w) => `${p.id}-${w}.webp`)));
for (const sport of existsSync(join(ROOT, 'public', 'heroes')) ? readdirSync(join(ROOT, 'public', 'heroes')) : []) {
  for (const f of readdirSync(join(ROOT, 'public', 'heroes', sport))) if (!keep.has(f)) rmSync(join(ROOT, 'public', 'heroes', sport, f));
}
out.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, 'src', 'lib', 'hero', 'photos.json'), JSON.stringify({ $comment: 'GENERATED by scripts/heroes/fetch.mjs from scripts/heroes/pins.json — do not edit by hand.', photos: out }, null, 1) + '\n');
console.log(`\n${out.length}/${pins.length} pins served${failed.length ? `; FAILED:\n- ${failed.join('\n- ')}` : ''}`);
if (failed.length) process.exit(1);
