// Fetch every NHL team logo ONCE and commit it (run by .github/workflows/team-logos.yml).
// Source: the NHL's own logo CDN (assets.nhle.com, SVG, the "_dark" variant drawn for dark backgrounds), keyed by the
// official tricode the NHL publication uses (ANA … WSH, LAK, NJD, SJS, TBL, UTA, VGK). ESPN's 500 px PNG is the
// fallback when an SVG cannot be fetched or rasterized. Each logo becomes a 256 px WebP with transparency under
// public/teams/nhl/<TRICODE>.webp; src/lib/nhl-team-logos.json records the source of each one.
// Trademark/licensing review is an owner item before public or commercial launch (docs/ARCHITECTURE.md).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'teams', 'nhl');
mkdirSync(OUT, { recursive: true });
// NHL tricode -> ESPN abbreviation (fallback source only)
const TEAMS = {
  ANA: 'ana', BOS: 'bos', BUF: 'buf', CAR: 'car', CBJ: 'cbj', CGY: 'cgy', CHI: 'chi', COL: 'col', DAL: 'dal', DET: 'det', EDM: 'edm',
  FLA: 'fla', LAK: 'la', MIN: 'min', MTL: 'mtl', NJD: 'nj', NSH: 'nsh', NYI: 'nyi', NYR: 'nyr', OTT: 'ott', PHI: 'phi', PIT: 'pit',
  SEA: 'sea', SJS: 'sj', STL: 'stl', TBL: 'tb', TOR: 'tor', UTA: 'utah', VAN: 'van', VGK: 'vgk', WPG: 'wpg', WSH: 'wsh',
};
const UA = { 'user-agent': 'SiftTeamLogos/1.0 (one-time fetch)' };
const toWebp = (src, dest) =>
  execFileSync('convert', [src, '-trim', '+repage', '-resize', '256x256', '-background', 'none', '-gravity', 'center', '-extent', '256x256', '-quality', '90', dest]);

async function fromNhl(code, dest) {
  for (const variant of ['dark', 'light']) {
    const url = `https://assets.nhle.com/logos/nhl/svg/${code}_${variant}.svg`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('svg')) continue;
    const svg = join(OUT, `.${code}.svg`);
    const png = join(OUT, `.${code}.png`);
    writeFileSync(svg, Buffer.from(await r.arrayBuffer()));
    try {
      execFileSync('rsvg-convert', ['-w', '512', '-h', '512', '--keep-aspect-ratio', '-o', png, svg]);
      toWebp(png, dest);
      return url;
    } catch (e) {
      console.log(`  rasterize failed for ${url}: ${e.message.split('\n')[0]}`);
    } finally {
      rmSync(svg, { force: true });
      rmSync(png, { force: true });
    }
  }
  return null;
}

async function fromEspn(code, dest) {
  for (const variant of ['500-dark', '500']) {
    const url = `https://a.espncdn.com/i/teamlogos/nhl/${variant}/${TEAMS[code]}.png`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('image')) continue;
    const png = join(OUT, `.${code}.png`);
    writeFileSync(png, Buffer.from(await r.arrayBuffer()));
    try {
      toWebp(png, dest);
      return url;
    } finally {
      rmSync(png, { force: true });
    }
  }
  return null;
}

const manifest = {};
const failed = [];
for (const code of Object.keys(TEAMS)) {
  const dest = join(OUT, `${code}.webp`);
  const src = (await fromNhl(code, dest)) ?? (await fromEspn(code, dest));
  if (src) manifest[code] = { source: src };
  else failed.push(code);
  console.log(`${src ? 'ok  ' : 'FAIL'} ${code} ${src ?? ''}`);
}
writeFileSync(join(ROOT, 'src', 'lib', 'nhl-team-logos.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  source: 'NHL logo CDN (assets.nhle.com/logos/nhl/svg, _dark variant); ESPN team-logo CDN fallback',
  teams: manifest,
}, null, 2) + '\n');
if (failed.length) console.log(`failed: ${failed.join(', ')}`);
// All 32 clubs or the run fails: a partial set would leave some teams on a text fallback.
if (failed.length || !existsSync(join(OUT, 'TOR.webp'))) process.exit(1);
