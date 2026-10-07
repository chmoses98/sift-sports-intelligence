// CBB team identity, fetched ONCE and committed (run by .github/workflows/team-logos.yml, like the NFL logos).
//
//   node scripts/teams/fetch-cbb-teams.mjs [--publication <dir|url>] [--colors <espn-id → colors json>] [--no-logos]
//
// 1. Who: every D-I team in the CBB publication (explorer/index.json → each team profile): its contract
//    participant id, ESPN team id, abbreviation, location and conference. Identity comes from the
//    publication, so the map always matches what Sift reads.
// 2. Colors: ESPN's public team list (color / alternateColor). When ESPN is unreachable, an optional seed
//    (--colors, ESPN's colors as carried by the SportsDataverse schedule) or the previously committed values.
// 3. Logos: ESPN's public team-logo CDN (500 px PNG, the "-dark" variant when ESPN publishes one), converted
//    to 128 px WebP under public/teams/cbb/<espn id>.webp. The app never fetches a logo from a third party
//    at runtime; a team without a committed logo shows a monogram in its own colors.
// Trademark/licensing review of school marks is an owner item before public or commercial launch.
//
// Presentation only: nothing here is research data, and nothing is invented. A team ESPN does not describe
// keeps a neutral color and a monogram.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'cbb');
const JSON_OUT = join(ROOT, 'src', 'lib', 'cbb-teams.json');
const LIVE = 'https://raw.githubusercontent.com/chmoses98/cbb-edge-finder/app-data/app/latest';
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const pub = arg('--publication') ?? LIVE;
const noLogos = process.argv.includes('--no-logos');
const UA = { 'user-agent': 'SiftTeamLogos/1.0 (one-time fetch)' };

async function read(rel) {
  if (/^https?:/.test(pub)) {
    const r = await fetch(`${pub.replace(/\/$/, '')}/${rel}`);
    if (!r.ok) throw new Error(`${r.status} ${rel}`);
    return r.json();
  }
  return JSON.parse(readFileSync(join(pub, rel), 'utf-8'));
}

const hex = (v) => (v && /^[0-9a-f]{6}$/i.test(v.replace('#', '')) ? `#${v.replace('#', '').toLowerCase()}` : null);
const previous = existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, 'utf-8')).teams ?? {} : {};
const seed = arg('--colors') ? JSON.parse(readFileSync(arg('--colors'), 'utf-8')) : {};

// 1. the publication's teams
const index = await read('explorer/index.json');
const teams = {};
for (const t of index.teams) {
  const p = await read(t.path);
  const e = p.entity;
  const espn = e.source_ids?.espn_team_id;
  teams[e.participant_id] = {
    e: espn ?? null,
    a: e.short_name ?? null,
    n: e.metadata?.location ?? e.display_name,
    f: e.display_name,
    cf: e.metadata?.conference ?? null,
  };
}

// 2. colors
let espnColors = {};
let colorSource = 'ESPN team colors';
try {
  const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000', { headers: UA });
  const d = await r.json();
  for (const { team } of d.sports[0].leagues[0].teams) espnColors[team.id] = { color: hex(team.color), alt: hex(team.alternateColor) };
} catch {
  colorSource = Object.keys(seed).length ? 'ESPN team colors as carried by the SportsDataverse schedule' : 'previously committed colors';
  espnColors = {};
}

// 3. logos
mkdirSync(OUT, { recursive: true });
let fetched = 0;
let failed = 0;
for (const t of Object.values(teams)) {
  if (t.e == null) continue;
  const prev = Object.values(previous).find((x) => x.e === t.e);
  const col = espnColors[t.e] ?? seed[String(t.e)] ?? (prev ? { color: prev.c, alt: prev.c2 } : null);
  t.c = col?.color ?? null;
  t.c2 = col?.alt ?? null;
  const file = join(OUT, `${t.e}.webp`);
  if (!noLogos && !existsSync(file)) {
    for (const variant of ['500-dark', '500']) {
      try {
        const r = await fetch(`https://a.espncdn.com/i/teamlogos/ncaa/${variant}/${t.e}.png`, { headers: UA });
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('image')) continue;
        const tmp = join(OUT, `.${t.e}.png`);
        writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
        execFileSync('convert', [tmp, '-trim', '+repage', '-resize', '128x128', '-background', 'none', '-gravity', 'center', '-extent', '128x128', '-quality', '88', file]);
        execFileSync('rm', ['-f', tmp]);
        fetched++;
        break;
      } catch {
        /* next variant */
      }
    }
    if (!existsSync(file)) failed++;
  }
  t.l = existsSync(file) ? 1 : 0;
}

const sorted = Object.fromEntries(Object.entries(teams).sort((a, b) => a[1].f.localeCompare(b[1].f)));
writeFileSync(JSON_OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  source: `CBB publication team profiles (identity); ${colorSource}; logos: ESPN team-logo CDN (a.espncdn.com/i/teamlogos/ncaa), committed as WebP`,
  teams: sorted,
}) + '\n');
console.log(`${Object.keys(teams).length} teams · logos fetched ${fetched}, unavailable ${failed}, committed ${Object.values(teams).filter((t) => t.l).length}`);
