// Fetch league / governing-body marks ONCE for the sports navigation (run by .github/workflows/team-logos.yml).
// Source: ESPN's public league-logo CDN; the "-dark" variant when ESPN publishes one. 128 px WebP under
// public/leagues/ + src/lib/league-logos.json. Sports without one universal mark (soccer, tennis, MMA) use
// Sift's own sport symbols instead. Trademark/licensing review is an owner item before public launch.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'leagues');
mkdirSync(OUT, { recursive: true });
// nav slug -> ESPN league-logo names to try in order
const LEAGUES = { nfl: ['nfl'], mlb: ['mlb'], nba: ['nba'], nhl: ['nhl'], cfb: ['ncaa', 'ncaaf'], pga: ['pga'] };
const manifest = {};
for (const [slug, names] of Object.entries(LEAGUES)) {
  let src = null;
  outer: for (const name of names) {
    for (const variant of ['500-dark', '500']) {
      const url = `https://a.espncdn.com/i/teamlogos/leagues/${variant}/${name}.png`;
      const r = await fetch(url, { headers: { 'user-agent': 'SiftLeagueLogos/1.0 (one-time fetch)' } });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('image')) {
        const tmp = join(OUT, `.${slug}.png`);
        writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
        execFileSync('convert', [tmp, '-trim', '+repage', '-resize', '128x128', '-background', 'none', '-gravity', 'center', '-extent', '128x128', '-quality', '90', join(OUT, `${slug}.webp`)]);
        execFileSync('rm', ['-f', tmp]);
        src = url;
        break outer;
      }
    }
  }
  if (src) manifest[slug] = { source: src };
  console.log(`${src ? 'ok  ' : 'none'} ${slug} ${src ?? ''}`);
}
writeFileSync(join(ROOT, 'src', 'lib', 'league-logos.json'), JSON.stringify({ generated_at: new Date().toISOString(), source: 'ESPN league-logo CDN (a.espncdn.com/i/teamlogos/leagues)', leagues: manifest }, null, 2) + '\n');
