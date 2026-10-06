// Player imagery for the Game Script cards — REVIEW ASSETS (run by .github/workflows/player-images.yml).
//
// For every player in scripts/players/players.json:
//  * with a pinned `commons_file`: download that exact Wikimedia Commons file (free licence only), convert it
//    to a 600 px-wide WebP under public/players/nfl/<id>.webp and record author, licence,
//    source and modification in src/lib/player-images.json;
//  * without one: search the player's Commons category and name for free-licence photos >= 1200 px and render a
//    numbered contact sheet under curation/players/<slug>.jpg (+ .json) so a person can pin the best frame.
// Images are never fetched at runtime.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'players', 'nfl');
const CUR = join(ROOT, 'curation', 'players');
const TMP = join(ROOT, '.curation-tmp');
const MANIFEST = join(ROOT, 'src', 'lib', 'player-images.json');
const UA = 'SiftPlayerImages/1.0 (https://github.com/chmoses98/sift-sports-intelligence; review assets)';
const FREE = /^(cc0|cc[- ]by(-sa)?( [\d.]+)?|cc[- ]by(-sa)? [\d.]+( [a-z-]+)?|public domain|pd.*)$/i;
const { players } = JSON.parse(readFileSync(join(ROOT, 'scripts', 'players', 'players.json'), 'utf-8'));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf-8')) : { players: {} };
for (const d of [OUT, CUR, TMP]) mkdirSync(d, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function api(params) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ format: 'json', formatversion: '2', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'user-agent': UA } });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    return r.ok ? r.json() : null;
  }
  return null;
}
async function info(titles, width) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const d = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: String(width), titles: titles.slice(i, i + 40).join('|') });
    for (const p of d?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const m = ii.extmetadata ?? {};
      out.push({ file: p.title, width: ii.width, height: ii.height, mime: ii.mime, thumb: ii.thumburl, source: ii.descriptionurl, license: strip(m.LicenseShortName?.value), license_url: m.LicenseUrl?.value ?? null, artist: strip(m.Artist?.value).slice(0, 80) || 'unknown' });
    }
    await sleep(300);
  }
  return out;
}

for (const pl of players) {
  if (pl.commons_file) {
    const dest = join(OUT, `${pl.id}.webp`);
    if (existsSync(dest) && manifest.players[pl.id]?.file === pl.commons_file) continue;
    const [c] = await info([pl.commons_file], 1400);
    if (!c || !FREE.test(c.license)) { console.log(`FAIL ${pl.name}: not found or not free (${c?.license})`); continue; }
    const tmp = join(TMP, `${pl.id}.src`);
    writeFileSync(tmp, Buffer.from(await (await fetch(c.thumb, { headers: { 'user-agent': UA } })).arrayBuffer()));
    execFileSync('convert', [tmp, '-auto-orient', '-strip', '-resize', '600x>', '-quality', '64', dest]);
    rmSync(tmp, { force: true });
    manifest.players[pl.id] = { name: pl.name, team: pl.team, slot: pl.slot, participant_id: pl.participant_id, focus: pl.focus ?? 'center 22%', file: pl.commons_file, source: c.source, artist: c.artist, license: c.license, license_url: c.license_url, modifications: 'Cropped, resized and darkened by Sift', review_asset: true };
    console.log(`ok   ${pl.name}  ${pl.commons_file} (${c.license}, ${c.artist})`);
    continue;
  }
  if (pl.auto && !pl.commons_file) {
    // Conservative automatic pick (review asset): a free-licence photo whose FILE NAME names the player,
    // from his own Commons category or a name search; recent seasons and his current team preferred.
    // Every auto pick is listed in the manifest with auto_selected: true for human review, and a person can
    // pin a different frame with `commons_file` at any time.
    const dest = join(OUT, `${pl.id}.webp`);
    if (existsSync(dest) && manifest.players[pl.id]) continue;
    const seen = new Set(); const titles = [];
    for (const q of [`incategory:"${pl.category ?? pl.name}" filetype:bitmap`, `deepcat:"${pl.category ?? pl.name}" filetype:bitmap`, `intitle:"${pl.name}" filetype:bitmap`]) {
      const d = await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '50', srsearch: q });
      for (const t of (d?.query?.search ?? []).map((x) => x.title)) if (!seen.has(t)) { seen.add(t); titles.push(t); }
      await sleep(300);
    }
    const surname = pl.name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, '').trim().split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
    const first = pl.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    const bad = /(signing|autograph|card|statue|mural|family|wedding|logo|jersey only|draft board|meets|visit|with president|cropped\)?.*group)/i;
    const cand = (await info(titles, 1400))
      .filter((c) => /jpeg|png|webp/.test(c.mime) && c.width >= 700 && c.height >= 700 && FREE.test(c.license))
      .filter((c) => { const t = c.file.toLowerCase().replace(/[^a-z0-9]/g, ''); return t.includes(surname) && t.includes(first); })
      .filter((c) => !bad.test(c.file))
      .map((c) => {
        const year = Number((/\b(20\d\d)\b/.exec(c.file) ?? [])[1] ?? 2010);
        const team = new RegExp(pl.team_name ?? '#none#', 'i').test(c.file) ? 6 : 0;
        const portrait = c.height >= c.width ? 2 : 0;
        const cropped = /cropped/i.test(c.file) ? 2 : 0;
        return { ...c, score: (year - 2015) + team + portrait + cropped };
      })
      .sort((a, b) => b.score - a.score);
    writeFileSync(join(CUR, `${slug(pl.name)}.json`), JSON.stringify(cand.slice(0, 12), null, 1) + '\n');
    const c = cand[0];
    if (!c) { console.log(`none ${pl.name}: no free-licence photo naming him`); continue; }
    const tmp = join(TMP, `${pl.id}.src`);
    writeFileSync(tmp, Buffer.from(await (await fetch(c.thumb, { headers: { 'user-agent': UA } })).arrayBuffer()));
    execFileSync('convert', [tmp, '-auto-orient', '-strip', '-resize', '600x>', '-quality', '64', dest]);
    rmSync(tmp, { force: true });
    manifest.players[pl.id] = { name: pl.name, team: pl.team, slot: pl.slot ?? 'portrait', participant_id: pl.participant_id, focus: pl.focus ?? 'center 22%', file: c.file, source: c.source, artist: c.artist, license: c.license, license_url: c.license_url, modifications: 'Resized and cropped by Sift', review_asset: true, auto_selected: true };
    console.log(`auto ${pl.name}  ${c.file} (${c.license}, ${c.artist})`);
    await sleep(200);
    continue;
  }
  if (!pl.category) continue;
  const queries = [`deepcat:"${pl.category}" filetype:bitmap filew:>1199`, `"${pl.name}" filetype:bitmap filew:>1199`, `intitle:"${pl.name}" filetype:bitmap`];
  const seen = new Set(); const titles = [];
  for (const q of queries) {
    const d = await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '50', srsearch: q });
    for (const t of (d?.query?.search ?? []).map((x) => x.title)) if (!seen.has(t)) { seen.add(t); titles.push(t); }
    await sleep(300);
  }
  const cand = (await info(titles, 400)).filter((c) => /jpeg|png|webp/.test(c.mime) && c.width >= 1200 && FREE.test(c.license)).slice(0, 16);
  const files = [];
  for (const [i, c] of cand.entries()) {
    const f = join(TMP, `${slug(pl.name)}-${i + 1}.jpg`);
    try {
      writeFileSync(f, Buffer.from(await (await fetch(c.thumb, { headers: { 'user-agent': UA } })).arrayBuffer()));
      execFileSync('convert', [f, '-resize', '300x360^', '-gravity', 'north', '-extent', '300x360', f]);
      files.push({ n: i + 1, f, c });
    } catch { /* skip */ }
    await sleep(150);
  }
  writeFileSync(join(CUR, `${slug(pl.name)}.json`), JSON.stringify(files.map(({ n, c }) => ({ n, ...c })), null, 1) + '\n');
  if (files.length) {
    const args = []; for (const { n, f, c } of files) args.push('-label', `#${n} ${c.width}x${c.height}`, f);
    execFileSync('montage', [...args, '-font', 'DejaVu-Sans', '-pointsize', '14', '-fill', '#eee', '-background', '#111318', '-tile', '6x', '-geometry', '300x360+5+5', '-title', pl.name, '-quality', '70', join(CUR, `${slug(pl.name)}.jpg`)]);
  }
  console.log(`${pl.name}: ${titles.length} found, ${files.length} candidates`);
}
manifest.generated_at = new Date().toISOString();
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
