// CURATION AID (not used by the app). For every venue in venues.json, collect high-resolution,
// free-licence photo candidates from Wikimedia Commons — the venue's category tree first (night /
// interior / crowd searches, then everything), then name searches — and render one numbered contact
// sheet per venue under curation/stadiums/<slug>.jpg with <slug>.json (number -> Commons file,
// size, licence, author). A human picks the best frame and pins it in venues.json (`commons_file`,
// `focus`); fetch.mjs then downloads only pinned files. Run by .github/workflows/stadium-candidates.yml.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'curation', 'stadiums');
const TMP = join(ROOT, '.curation-tmp');
const UA = 'SiftStadiumCuration/1.0 (https://github.com/chmoses98/sift-sports-intelligence; curation contact sheets)';
const MAX = 20;
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

for (const v of venues) {
  if (ONLY && !ONLY.has(v.slug)) continue;
  const cats = [...new Set([...(v.wiki ?? []), v.name])];
  const names = [...new Set([v.name, ...(v.aliases ?? [])])];
  const queries = [];
  for (const c of cats) for (const k of ['night', 'interior', 'crowd', 'game', '']) queries.push(`deepcat:"${c}" ${k} filetype:bitmap filew:>1599`.replace(/\s+/g, ' '));
  for (const n of names) queries.push(`"${n}" filetype:bitmap filew:>1599`, `"${n}" night filetype:bitmap filew:>1599`);
  const seen = new Set();
  const titles = [];
  for (const q of queries) {
    for (const t of await search(q)) if (!seen.has(t)) { seen.add(t); titles.push(t); }
    await sleep(250);
    if (titles.length >= 90) break;
  }
  const cand = (await info(titles))
    .filter((c) => /jpeg|png|webp|tiff/.test(c.mime) && c.width >= 1600 && c.width >= c.height * 1.2 && FREE.test(c.license))
    .slice(0, MAX);
  const files = [];
  for (const [i, c] of cand.entries()) {
    const f = join(TMP, `${v.slug}-${String(i + 1).padStart(2, '0')}.jpg`);
    try {
      const r = await fetch(c.thumb, { headers: { 'user-agent': UA } });
      if (!r.ok) continue;
      writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      execFileSync('convert', [f, '-resize', '420x240^', '-gravity', 'center', '-extent', '420x240', f]);
      files.push({ n: i + 1, f, c });
    } catch { /* skip */ }
    await sleep(150);
  }
  writeFileSync(join(OUT, `${v.slug}.json`), JSON.stringify(files.map(({ n, c }) => ({ n, ...c })), null, 1) + '\n');
  if (files.length) {
    const args = [];
    for (const { n, f, c } of files) args.push('-label', `#${n}  ${c.width}x${c.height}`, f);
    execFileSync('montage', [...args, '-font', 'DejaVu-Sans', '-pointsize', '15', '-fill', '#eeeeee', '-background', '#111318', '-tile', '4x', '-geometry', '420x240+6+6', '-title', `${v.name} (${v.slug})`, '-quality', '62', join(OUT, `${v.slug}.jpg`)]);
  }
  console.log(`${v.slug}: ${titles.length} found, ${files.length} candidates`);
}
