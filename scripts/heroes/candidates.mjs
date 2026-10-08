// CURATION AID (never shipped). For every home team of a sport, collect free-licence, high-resolution
// Wikimedia Commons photographs that are likely to show THAT TEAM'S home game at ITS home venue, and render
// them as numbered contact sheets under curation/heroes/<sport>/<team>.jpg (+ .json with the provenance).
//
// The search is identity-first, not venue-first: a venue-only search is how Sift ended up showing Super Bowl LIX
// for every Saints home game. Each candidate is scored on its text (team named, venue named, a game) minus
// other-event words (bowl games, championships, soccer, concerts …) and the venue's OTHER tenants (Celtics in TD
// Garden for the Bruins, Jets in MetLife for the Giants), then on a thumbnail measure (field visible, stadium light).
// A person then reviews each sheet and pins at most one frame per team in scripts/heroes/pins.json — or none, in
// which case the team keeps its designed identity fallback. Nothing here approves anything.
//
// Run by .github/workflows/hero-candidates.yml: node scripts/heroes/candidates.mjs <SPORT> [TEAM,TEAM…]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SPORT = (process.argv[2] ?? '').toUpperCase();
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const OUT = join(ROOT, 'curation', 'heroes', SPORT.toLowerCase());
const TMP = join(ROOT, '.curation-tmp', SPORT.toLowerCase());
const UA = 'SiftHeroCuration/1.0 (https://github.com/chmoses98/sift-sports-intelligence; curation contact sheets)';
const MAX = 12;
const MIN_W = 1600;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const FREE = /^(cc0|cc[- ]by(-sa)?( [\d.]+)?|cc[- ]by(-sa)? [\d.]+( [a-z-]+)?|public domain|pd.*)$/i;
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf-8'));
const { venues } = read('src/lib/hero/venues.json');
const NAMES = read('scripts/heroes/team-names.json');

const WORD = { NFL: 'football', CFB: 'football', MLB: 'baseball', NHL: 'hockey', NBA: 'basketball', CBB: 'basketball' };
const NEG = /super bowl|pro bowl|bowl game|fiesta bowl|sugar bowl|orange bowl|peach bowl|citrus bowl|cotton bowl classic|gator bowl|bowl (?:xx|l|lv|li)|championship|playoff game|cfp|final four|ncaa tournament|march madness|all[- ]star|concert|tour\b|wrestl|wwe|ufc|boxing|monster (?:jam|truck)|supercross|motocross|nascar|rodeo|soccer|\bfc\b|united|copa|world cup|concacaf|gold cup|\bmls\b|rugby|cricket|lacrosse|xfl|usfl|\bufl\b|graduation|commencement|construction|demolition|aerial|exterior|tailgat|parking|statue|museum|press box|empty|renovation|winter classic|stadium series|heritage classic|world baseball classic|olympic|figure skating|disney on ice|circus|tennis|volleyball|high school/i;

/** The home teams of a sport, with names and venues, from the hero venue registry (or the CBB/CFB identity tables). */
function targets() {
  const out = new Map();
  const nick = (full) => full.split(' ').slice(-1)[0];
  for (const v of venues) {
    for (const t of v.tenants) {
      if (t.sport !== SPORT || (t.to && t.to < '2023-06-01')) continue; // current-era venues only
      const o = out.get(t.team) ?? { team: t.team, venues: [], others: new Set() };
      o.venues.push(v);
      for (const u of v.tenants) if (u.team !== t.team || u.sport !== SPORT) o.others.add(`${u.sport}:${u.team}`);
      out.set(t.team, o);
    }
  }
  const cfb = SPORT === 'CFB' ? read('src/lib/cfb-teams.json').teams : null;
  const res = [];
  for (const o of out.values()) {
    let full, short;
    if (SPORT === 'CFB') { full = cfb[o.team]?.n ?? o.team; short = full; }
    else { full = NAMES[SPORT]?.[o.team] ?? o.team; short = SPORT === 'MLB' && o.team === 'ATH' ? 'Athletics' : nick(full); }
    // Two-word nicknames read better whole.
    for (const two of ['Red Sox', 'White Sox', 'Blue Jays', 'Maple Leafs', 'Red Wings', 'Blue Jackets', 'Golden Knights', 'Trail Blazers']) if (full.endsWith(two)) short = two;
    const others = [...o.others].map((k) => { const [s, t] = k.split(':'); return s === 'CFB' ? read('src/lib/cfb-teams.json').teams[t]?.n : NAMES[s]?.[t]; }).filter(Boolean);
    res.push({ team: o.team, full, short, venues: o.venues, others: others.map((x) => (x.split(' ').length > 1 ? x.split(' ').slice(-1)[0] : x)) });
  }
  if (SPORT === 'CBB') {
    const POWER = /Atlantic Coast|Big Ten|Big 12|Southeastern|Big East|West Coast|Mountain West|Atlantic 10|American/i;
    for (const t of Object.values(read('src/lib/cbb-teams.json').teams)) {
      if (!POWER.test(t.cf ?? '')) continue;
      res.push({ team: t.a, full: t.f, short: t.n, venues: [], others: [] });
    }
  }
  return res.sort((a, b) => a.team.localeCompare(b.team));
}

async function api(params) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ format: 'json', formatversion: '2', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { headers: { 'user-agent': UA } }).catch(() => null);
    if (!r || r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}
const search = async (q) => ((await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '50', srsearch: q }))?.query?.search ?? []).map((x) => x.title);

async function info(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const d = await api({ action: 'query', prop: 'imageinfo|categories', cllimit: 'max', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '500', titles: titles.slice(i, i + 40).join('|') });
    for (const p of d?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      out.push({
        file: p.title, width: ii.width, height: ii.height, mime: ii.mime, thumb: ii.thumburl, url: ii.descriptionurl,
        license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 80), date: strip(m.DateTimeOriginal?.value).slice(0, 10),
        description: strip(m.ImageDescription?.value).slice(0, 400), categories: (p.categories ?? []).map((c) => c.title.replace(/^Category:/, '')),
      });
    }
    await sleep(250);
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function textScore(c, t) {
  const hay = `${c.file} ${c.description} ${c.categories.join(' ')}`;
  const venueNames = t.venues.flatMap((v) => [v.name, ...v.aliases]);
  let s = 0;
  if (new RegExp(`\\b${esc(t.short)}\\b`, 'i').test(hay) || new RegExp(esc(t.full), 'i').test(hay)) s += 3;
  if (venueNames.some((n) => n.length > 5 && hay.toLowerCase().includes(n.toLowerCase()))) s += 2;
  if (/\b(vs\.?|v\.|at|game|match|kickoff|opening day|home opener|faceoff|tip-off)\b/i.test(hay)) s += 1;
  const neg = hay.match(NEG)?.[0];
  if (neg && !venueNames.some((n) => n.toLowerCase().includes(neg.toLowerCase()))) s -= 4;
  for (const o of t.others) if (new RegExp(`\\b${esc(o)}\\b`, 'i').test(hay) && !new RegExp(`\\b${esc(t.short)}\\b`, 'i').test(hay)) s -= 4;
  return s;
}

/** Thumbnail measure, 0..~4: field visible low, dark sky/roof or stadium light up top, contrast (scripts/stadiums). */
function heroScore(f) {
  const raw = execFileSync('convert', [f, '-resize', '96x54!', '-colorspace', 'sRGB', 'txt:-']).toString();
  const px = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\d+),(\d+):\s*\(([\d.]+),([\d.]+),([\d.]+)/);
    if (m) px.push([+m[1], +m[2], +m[3], +m[4], +m[5]]);
  }
  if (!px.length) return 0;
  const scale = Math.max(...px.map((p) => Math.max(p[2], p[3], p[4]))) > 256 ? 65535 : 255;
  let fieldN = 0, fieldT = 0, topS = 0, topN = 0, sum = 0, sum2 = 0, iceN = 0;
  for (const [, y, r0, g0, b0] of px) {
    const r = r0 / scale, g = g0 / scale, b = b0 / scale;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += L; sum2 += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    if (y >= 54 * 0.45) { fieldT++; if (g >= r && g >= b && sat > 0.22 && mx > 0.18) fieldN++; if (L > 0.7 && sat < 0.15) iceN++; }
    if (y < 54 * 0.35) { topS += L; topN++; }
  }
  const n = px.length, mean = sum / n, spread = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const surface = SPORT === 'NHL' ? iceN / fieldT : SPORT === 'NBA' || SPORT === 'CBB' ? 0.3 : fieldN / fieldT;
  const top = topS / topN;
  return 1.4 * Math.min(surface, 0.4) / 0.4 + (1 - Math.min(1, Math.max(0, (top - 0.25) / 0.5))) + 0.6 * Math.min(spread, 0.24) / 0.24 + (mean < 0.08 ? -0.8 : 0);
}

const list = targets().filter((t) => !ONLY || ONLY.has(t.team));
console.log(`${SPORT}: ${list.length} teams`);
const W = `filetype:bitmap filew:>${MIN_W - 1}`;
const summary = [];
for (const t of list) {
  const venueNames = [...new Set(t.venues.flatMap((v) => [v.name, ...v.aliases.filter((a) => !/memorial stadium$/i.test(a) || t.venues.length === 0)]))].slice(0, 4);
  const w = WORD[SPORT];
  const qs = [`"${t.full}" ${w} ${W}`, `"${t.short}" ${w} game ${W}`];
  for (const n of venueNames) qs.push(`"${t.short}" "${n}" ${W}`, `incategory:"${n}" ${t.short} ${W}`, `"${n}" ${w} ${W}`);
  if (SPORT === 'CFB' || SPORT === 'CBB') qs.push(`"${t.full}" ${w} stadium ${W}`, `"${t.full}" ${w} arena ${W}`);
  const seen = new Set(), titles = [];
  for (const q of qs) {
    for (const x of await search(q)) if (!seen.has(x)) { seen.add(x); titles.push(x); }
    await sleep(200);
  }
  const cand = (await info(titles))
    .filter((c) => /jpeg|png|webp|tiff/.test(c.mime) && c.width >= MIN_W && c.width >= c.height * 1.2 && c.width <= c.height * 3.6 && FREE.test(c.license))
    .map((c) => ({ ...c, text: textScore(c, t) }))
    .filter((c) => c.text >= 2)
    .sort((a, b) => b.text - a.text)
    .slice(0, 30);
  const scored = [];
  for (const [i, c] of cand.entries()) {
    const f = join(TMP, `${t.team}-${String(i + 1).padStart(3, '0')}.jpg`);
    try {
      const r = await fetch(c.thumb, { headers: { 'user-agent': UA } });
      if (!r.ok) continue;
      writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      scored.push({ f, c: { ...c, look: Math.round(heroScore(f) * 100) / 100 } });
    } catch { /* skip */ }
    await sleep(150);
  }
  scored.sort((a, b) => b.c.text + b.c.look - (a.c.text + a.c.look));
  const files = scored.slice(0, MAX).map((x, i) => {
    execFileSync('convert', [x.f, '-resize', '500x333^', '-gravity', 'center', '-extent', '500x333', x.f]);
    return { n: i + 1, ...x };
  });
  writeFileSync(join(OUT, `${t.team}.json`), JSON.stringify({ team: t.team, full: t.full, venues: t.venues.map((v) => v.id), candidates: files.map(({ n, c }) => ({ n, ...c })) }, null, 1) + '\n');
  if (files.length) {
    const args = [];
    for (const { n, f, c } of files) args.push('-label', `#${n} ${c.width}x${c.height} ${c.date || ''} ${c.license}\n${c.file.replace(/^File:/, '').slice(0, 58)}`, f);
    execFileSync('montage', [...args, '-font', 'DejaVu-Sans', '-pointsize', '13', '-fill', '#eeeeee', '-background', '#111318', '-tile', '3x', '-geometry', '500x333+5+5', '-title', `${SPORT} ${t.team} — ${t.full}`, '-quality', '70', join(OUT, `${t.team}.jpg`)]);
  }
  summary.push(`${t.team}\t${titles.length} found\t${cand.length} eligible\t${files.length} on sheet`);
  console.log(summary[summary.length - 1]);
}
writeFileSync(join(OUT, '_summary.tsv'), summary.join('\n') + '\n');
