// CFB team identity and logos, fetched ONCE and committed (run by .github/workflows/team-logos.yml, like the NFL
// and CBB logos).
//
//   node scripts/teams/fetch-cfb-teams.mjs [--publication <dir|url>] [--no-logos]
//
// 1. Who. Sift names a CFB team by its contract short_name (Kalshi's team code, "ISU"); logos are keyed by the
//    ESPN team id ("66"). The CFB publication links the two itself: every event whose Script Engine identity check
//    passed (PASS, or RESOLVED with the orientation it states) carries both contract participants and the football
//    schedule's teams on the same home/away sides. That verified pairing is the only source of the map: no name
//    or abbreviation is guessed. Every pair must agree with every other event and with the committed map (one
//    code <-> one ESPN id); a disagreement stops the run instead of picking one. Teams whose only games failed
//    identity have no ESPN id and keep their text mark.
// 2. Colors: ESPN's public college-football team list (color / alternateColor), else the committed values.
// 3. Logos: ESPN's public team-logo CDN (500 px PNG, the "-dark" variant when ESPN publishes one), converted to
//    128 px WebP under public/teams/cfb/<espn id>.webp. The app never fetches a logo from a third party at runtime.
// Trademark/licensing review of school marks is an owner item before public or commercial launch.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePairs, pairsOf } from './cfb-identity.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'cfb');
const JSON_OUT = join(ROOT, 'src', 'lib', 'cfb-teams.json');
const LIVE = 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest';
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

async function main() {
  // 1. identity from the publication's verified pairs
  const index = await read('explorer/index.json');
  const paths = Object.entries(index.files).filter(([, f]) => f.kind === 'event_research').map(([rel]) => `explorer/${rel}`);
  const pairs = [];
  for (const p of paths) pairs.push(...pairsOf(await read(p)));
  // Reviewed supplement (scripts/teams/cfb-supplement.json) first: verified pairs then confirm it or conflict loudly.
  const supplement = JSON.parse(readFileSync(join(ROOT, 'scripts', 'teams', 'cfb-supplement.json'), 'utf-8')).teams;
  const base = { ...previous };
  for (const [code, t] of Object.entries(supplement)) if (!base[code]) base[code] = { e: t.e, n: t.n };
  const { teams, conflicts } = mergePairs(base, pairs);
  if (conflicts.length) {
    console.error(`CFB team identity conflicts (nothing written):\n- ${[...new Set(conflicts)].join('\n- ')}`);
    process.exit(1);
  }

  // 2. colors
  let espnColors = {};
  let colorSource = 'ESPN team colors';
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000', { headers: UA });
    const d = await r.json();
    for (const { team } of d.sports[0].leagues[0].teams) espnColors[team.id] = { color: hex(team.color), alt: hex(team.alternateColor) };
  } catch {
    colorSource = 'previously committed colors';
    espnColors = {};
  }
  // The list endpoint can fail or omit teams (it did: every CFB team ended up colourless, so every CFB surface fell
  // back to Sift's navy). Any team still without colours is asked for individually.
  let single = 0;
  for (const t of Object.values(teams)) {
    if (espnColors[t.e]?.color) continue;
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${t.e}`, { headers: UA });
      if (!r.ok) continue;
      const team = (await r.json()).team ?? {};
      if (hex(team.color)) { espnColors[t.e] = { color: hex(team.color), alt: hex(team.alternateColor) }; single++; }
    } catch { /* keep previous */ }
  }
  if (single) colorSource = `ESPN team colors (${single} fetched per team)`;
  // Still none (ESPN's site API does not answer every runner): the school's colours from the committed CBB identity.
  // ESPN uses one team id per university across sports (Alabama is 333 in football and basketball).
  const cbb = JSON.parse(readFileSync(join(ROOT, 'src', 'lib', 'cbb-teams.json'), 'utf-8')).teams;
  let seeded = 0;
  for (const t of Object.values(cbb)) {
    const id = String(t.e);
    if (!espnColors[id]?.color && hex(t.c)) { espnColors[id] = { color: hex(t.c), alt: hex(t.c2) }; seeded++; }
  }
  if (seeded) colorSource += `; ${seeded} schools' colours from the committed CBB identity (same ESPN team id)`;

  // 3. logos
  mkdirSync(OUT, { recursive: true });
  let fetched = 0;
  let failed = 0;
  for (const t of Object.values(teams)) {
    const col = espnColors[t.e];
    if (col?.color) {
      t.c = col.color ?? null;
      t.c2 = col.alt ?? null;
    }
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

  const sorted = Object.fromEntries(Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(JSON_OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: `CFB publication (Script Engine identity-verified game pairs: contract short_name -> ESPN team id); ${colorSource}; logos: ESPN team-logo CDN (a.espncdn.com/i/teamlogos/ncaa), committed as WebP`,
    teams: sorted,
  }, null, 0).replace(/\},"/g, '},\n"') + '\n');
  console.log(`${Object.keys(teams).length} teams from ${pairs.length / 2} verified games · logos fetched ${fetched}, unavailable ${failed}, committed ${Object.values(teams).filter((t) => t.l).length}`);
}

await main();
