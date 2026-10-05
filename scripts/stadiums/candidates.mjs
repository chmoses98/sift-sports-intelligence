// CURATION AID (not used by the app). For every venue in venues.json, collect high-resolution
// (>= 2400 px wide), landscape, free-licence photo candidates from Wikimedia Commons — a wide pool of
// category and name searches biased to night / sunset / game-day atmosphere — then SCORE each one for
// hero suitability from its thumbnail (field visible in the lower frame, a dark night or roof sky,
// floodlight highlights, contrast; washed-out daylight and dark snapshots score low) and render the
// best 16 per venue as a numbered contact sheet under curation/stadiums/<slug>.jpg (+ <slug>.json).
// A person then applies the real quality bar (composition, atmosphere, venue identity) and pins at most
// one frame per venue in venues.json — or none, so the venue keeps the designed fallback.
// Run by .github/workflows/stadium-candidates.yml.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'curation', 'stadiums');
const TMP = join(ROOT, '.curation-tmp');
const UA = 'SiftStadiumCuration/1.0 (https://github.com/chmoses98/sift-sports-intelligence; curation contact sheets)';
const MAX = 16;
const MIN_W = 2400;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const { venues } = JSON.parse(readFileSync(join(ROOT, 'scripts', 'stadiums', 'venues.json'), 'utf-8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(cc0|cc[- ]by(-sa)?( [\d.]+)?|cc[- ]by(-sa)? [\d.]+( [a-z-]+)?|public domain|pd.*)$/i;

async function api(params) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ format: 'json', formatversion: '2', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'user-agent': UA } });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}

async function search(q) {
  const d = await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '40', srsearch: q });
  return (d?.query?.search ?? []).map((x) => x.title);
}

async function info(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const d = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '500', titles: titles.slice(i, i + 40).join('|') });
    for (const p of d?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      out.push({ file: p.title, width: ii.width, height: ii.height, mime: ii.mime, thumb: ii.thumburl, license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 80), date: strip(m.DateTimeOriginal?.value).slice(0, 10) });
    }
    await sleep(300);
  }
  return out;
}

/**
 * Hero suitability from a thumbnail, 0..~4. Measured on a 96x54 resample:
 * field  = share of green, saturated pixels in the lower 55% (the field is visible)
 * top    = mean brightness of the upper 35% (night or a roof reads dark; flat daylight sky reads bright)
 * lights = share of near-white highlights in the upper 45% (floodlights, scoreboards)
 * spread = luminance standard deviation (contrast; flat haze scores low)
 */
function heroScore(f) {
  const raw = execFileSync('convert', [f, '-resize', '96x54!', '-colorspace', 'sRGB', 'txt:-']).toString();
  const px = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\d+),(\d+):\s*\(([\d.]+),([\d.]+),([\d.]+)/);
    if (m) px.push([+m[1], +m[2], +m[3] / 255, +m[4] / 255, +m[5] / 255]);
  }
  if (!px.length) return { score: 0, field: 0, top: 0, lights: 0 };
  const scale = Math.max(...px.map((p) => Math.max(p[2], p[3], p[4]))) > 1.01 ? 257 : 1; // 16-bit txt output
  let fieldN = 0, fieldT = 0, topS = 0, topN = 0, litN = 0, litT = 0, sum = 0, sum2 = 0;
  for (const [x, y, r0, g0, b0] of px) {
    const r = r0 / scale, g = g0 / scale, b = b0 / scale;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += L; sum2 += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    if (y >= 54 * 0.45) { fieldT++; if (g >= r && g >= b && sat > 0.22 && mx > 0.18) fieldN++; }
    if (y < 54 * 0.35) { topS += L; topN++; }
    if (y < 54 * 0.45) { litT++; if (L > 0.86) litN++; }
  }
  const n = px.length, mean = sum / n, spread = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const field = fieldN / fieldT, top = topS / topN, lights = litN / litT;
  const fieldS = Math.min(field, 0.45) / 0.45;                // up to 1 when a third+ of the lower frame is pitch
  const nightS = top < 0.06 ? 0.4 : 1 - Math.min(1, Math.max(0, (top - 0.18) / 0.5)); // dark sky good, pitch-black meh
  const lightS = Math.min(lights, 0.04) / 0.04;
  const spreadS = Math.min(spread, 0.24) / 0.24;
  const tooDark = mean < 0.09 ? -0.8 : 0;
  return { score: 1.2 * fieldS + 1.5 * nightS + 0.8 * lightS + 0.6 * spreadS + tooDark, field: +field.toFixed(2), top: +top.toFixed(2), lights: +lights.toFixed(3) };
}

for (const v of venues) {
  if (ONLY && !ONLY.has(v.slug)) continue;
  const cats = [...new Set([...(v.wiki ?? []), v.name])];
  const names = [...new Set([v.name, ...(v.aliases ?? [])])];
  const queries = [];
  const W = `filetype:bitmap filew:>${MIN_W - 1}`;
  for (const c of cats) for (const k of ['night', 'sunset', 'lights', 'panorama', 'football', 'game', 'crowd', 'interior', '']) queries.push(`deepcat:"${c}" ${k} ${W}`.replace(/\s+/g, ' '));
  for (const n of names) for (const k of ['night', 'sunset', 'Sunday Night Football', 'Monday Night Football', 'Thursday Night Football', 'playoff', 'kickoff', 'panorama', 'inside', '']) queries.push(`"${n}" ${k} ${W}`.replace(/\s+/g, ' '));
  const seen = new Set();
  const titles = [];
  for (const q of queries) {
    for (const t of await search(q)) if (!seen.has(t)) { seen.add(t); titles.push(t); }
    await sleep(250);
    if (titles.length >= 260) break;
  }
  const cand = (await info(titles))
    .filter((c) => /jpeg|png|webp|tiff/.test(c.mime) && c.width >= MIN_W && c.width >= c.height * 1.3 && c.width <= c.height * 3.4 && FREE.test(c.license));
  const scored = [];
  for (const [i, c] of cand.entries()) {
    const f = join(TMP, `${v.slug}-${String(i + 1).padStart(3, '0')}.jpg`);
    try {
      const r = await fetch(c.thumb, { headers: { 'user-agent': UA } });
      if (!r.ok) continue;
      writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      scored.push({ f, c, ...heroScore(f) });
    } catch { /* skip */ }
    await sleep(120);
  }
  scored.sort((a, b) => b.score - a.score);
  const files = scored.slice(0, MAX).map((x, i) => {
    execFileSync('convert', [x.f, '-resize', '480x270^', '-gravity', 'center', '-extent', '480x270', x.f]);
    return { n: i + 1, f: x.f, c: { ...x.c, score: Math.round(x.score * 100) / 100, field: x.field, top: x.top, lights: x.lights } };
  });
  writeFileSync(join(OUT, `${v.slug}.json`), JSON.stringify(files.map(({ n, c }) => ({ n, ...c })), null, 1) + '\n');
  if (files.length) {
    const args = [];
    for (const { n, f, c } of files) args.push('-label', `#${n}  ${c.width}x${c.height}  s${c.score}`, f);
    execFileSync('montage', [...args, '-font', 'DejaVu-Sans', '-pointsize', '15', '-fill', '#eeeeee', '-background', '#111318', '-tile', '4x', '-geometry', '480x270+6+6', '-title', `${v.name} (${v.slug})`, '-quality', '62', join(OUT, `${v.slug}.jpg`)]);
  }
  console.log(`${v.slug}: ${titles.length} found, ${cand.length} eligible, ${files.length} on the sheet`);
}
