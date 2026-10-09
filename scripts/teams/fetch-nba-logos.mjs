// NBA club logos, fetched ONCE and committed (run by .github/workflows/team-logos.yml, like the NFL/NHL/MLB/CFB/CBB
// logos): ESPN's public team-logo CDN (500 px PNG, the "-dark" variant when published), converted to 128 px WebP
// under public/teams/nba/<CODE>.webp, listed in src/lib/nba-team-logos.json. Codes are the NBA tricodes the
// publication uses (src/lib/nba.ts). The app never fetches a logo from a third party at runtime.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'nba');
const UA = { 'user-agent': 'SiftTeamLogos/1.0 (one-time fetch)' };
// Sift code -> ESPN logo slugs to try in order.
const CODES = {
  ATL: ['atl'], BOS: ['bos'], BKN: ['bkn'], CHA: ['cha'], CHI: ['chi'], CLE: ['cle'], DAL: ['dal'], DEN: ['den'], DET: ['det'], GSW: ['gs', 'gsw'],
  HOU: ['hou'], IND: ['ind'], LAC: ['lac'], LAL: ['lal'], MEM: ['mem'], MIA: ['mia'], MIL: ['mil'], MIN: ['min'], NOP: ['no', 'nop'], NYK: ['ny', 'nyk'],
  OKC: ['okc'], ORL: ['orl'], PHI: ['phi'], PHX: ['phx'], POR: ['por'], SAC: ['sac'], SAS: ['sa', 'sas'], TOR: ['tor'], UTA: ['utah', 'uta'], WAS: ['wsh', 'was'],
};
mkdirSync(OUT, { recursive: true });
const teams = {};
for (const [code, slugs] of Object.entries(CODES)) {
  const file = join(OUT, `${code}.webp`);
  for (const slug of slugs) {
    if (existsSync(file)) break;
    for (const variant of ['500-dark', '500']) {
      const url = `https://a.espncdn.com/i/teamlogos/nba/${variant}/${slug}.png`;
      const r = await fetch(url, { headers: UA }).catch(() => null);
      if (!r?.ok || !(r.headers.get('content-type') ?? '').includes('image')) continue;
      const tmp = join(OUT, `.${code}.png`);
      writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      execFileSync('convert', [tmp, '-trim', '+repage', '-resize', '128x128', '-background', 'none', '-gravity', 'center', '-extent', '128x128', '-quality', '88', file]);
      rmSync(tmp, { force: true });
      teams[code] = { source: url };
      break;
    }
  }
  if (existsSync(file) && !teams[code]) teams[code] = { source: 'previously committed' };
}
writeFileSync(join(ROOT, 'src', 'lib', 'nba-team-logos.json'), JSON.stringify({ generated_at: new Date().toISOString(), source: 'ESPN team-logo CDN (a.espncdn.com/i/teamlogos/nba)', teams }, null, 2) + '\n');
console.log(`NBA logos: ${Object.keys(teams).length}/30`);
