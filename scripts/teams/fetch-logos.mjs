// Fetch every NFL team logo ONCE and commit it (run by .github/workflows/team-logos.yml).
// Source: ESPN's public team-logo CDN (500 px PNG; the "-dark" variant, drawn for dark backgrounds,
// when ESPN publishes one). Converted to 256 px WebP with transparency under public/teams/nfl/.
// Trademark/licensing review is an owner item before public or commercial launch (docs/ARCHITECTURE.md).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'nfl');
mkdirSync(OUT, { recursive: true });
// Sift abbreviation -> ESPN abbreviation
const TEAMS = {
  ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf', CAR: 'car', CHI: 'chi', CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den',
  DET: 'det', GB: 'gb', HOU: 'hou', IND: 'ind', JAX: 'jax', KC: 'kc', LV: 'lv', LAC: 'lac', LA: 'lar', LAR: 'lar', MIA: 'mia',
  MIN: 'min', NE: 'ne', NO: 'no', NYG: 'nyg', NYJ: 'nyj', PHI: 'phi', PIT: 'pit', SF: 'sf', SEA: 'sea', TB: 'tb', TEN: 'ten', WAS: 'wsh',
};
const manifest = {};
const failed = [];
for (const [abbr, espn] of Object.entries(TEAMS)) {
  let src = null;
  for (const variant of ['500-dark', '500']) {
    const url = `https://a.espncdn.com/i/teamlogos/nfl/${variant}/${espn}.png`;
    const r = await fetch(url, { headers: { 'user-agent': 'SiftTeamLogos/1.0 (one-time fetch)' } });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('image')) {
      const tmp = join(OUT, `.${abbr}.png`);
      writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      execFileSync('convert', [tmp, '-trim', '+repage', '-resize', '256x256', '-background', 'none', '-gravity', 'center', '-extent', '256x256', '-quality', '90', '-define', 'webp:lossless=false', join(OUT, `${abbr}.webp`)]);
      execFileSync('rm', ['-f', tmp]);
      src = url;
      break;
    }
  }
  if (src) manifest[abbr] = { source: src };
  else failed.push(abbr);
  console.log(`${src ? 'ok  ' : 'FAIL'} ${abbr} ${src ?? ''}`);
}
writeFileSync(join(ROOT, 'src', 'lib', 'team-logos.json'), JSON.stringify({ generated_at: new Date().toISOString(), source: 'ESPN team-logo CDN (a.espncdn.com/i/teamlogos/nfl)', teams: manifest }, null, 2) + '\n');
if (failed.length) console.log(`failed: ${failed.join(', ')}`);
if (!existsSync(join(OUT, 'BUF.webp'))) process.exit(1);
