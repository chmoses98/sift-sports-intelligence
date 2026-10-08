// MLB club logos, fetched ONCE and committed (run by .github/workflows/team-logos.yml, like the NFL/NHL/CFB/CBB
// logos): ESPN's public team-logo CDN (500 px PNG, the "-dark" variant when published), converted to 128 px WebP
// under public/teams/mlb/<CODE>.webp, listed in src/lib/mlb-team-logos.json. Codes are Sift's MLB club codes
// (src/lib/mlb.ts). The app never fetches a logo from a third party at runtime.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'mlb');
const UA = { 'user-agent': 'SiftTeamLogos/1.0 (one-time fetch)' };
// Sift code -> ESPN logo slugs to try in order.
const CODES = {
  AZ: ['ari'], ATL: ['atl'], BAL: ['bal'], BOS: ['bos'], CHC: ['chc'], CWS: ['chw', 'cws'], CIN: ['cin'], CLE: ['cle'], COL: ['col'], DET: ['det'],
  HOU: ['hou'], KC: ['kc'], LAA: ['laa'], LAD: ['lad'], MIA: ['mia'], MIL: ['mil'], MIN: ['min'], NYM: ['nym'], NYY: ['nyy'], ATH: ['ath', 'oak'],
  PHI: ['phi'], PIT: ['pit'], SD: ['sd'], SF: ['sf'], SEA: ['sea'], STL: ['stl'], TB: ['tb'], TEX: ['tex'], TOR: ['tor'], WSH: ['wsh'],
};
mkdirSync(OUT, { recursive: true });
const teams = {};
for (const [code, slugs] of Object.entries(CODES)) {
  const file = join(OUT, `${code}.webp`);
  for (const slug of slugs) {
    if (existsSync(file)) break;
    for (const variant of ['500-dark', '500']) {
      const url = `https://a.espncdn.com/i/teamlogos/mlb/${variant}/${slug}.png`;
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
writeFileSync(join(ROOT, 'src', 'lib', 'mlb-team-logos.json'), JSON.stringify({ generated_at: new Date().toISOString(), source: 'ESPN team-logo CDN (a.espncdn.com/i/teamlogos/mlb)', teams }, null, 2) + '\n');
console.log(`MLB logos: ${Object.keys(teams).length}/30`);
