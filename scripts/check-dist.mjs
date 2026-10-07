// Post-build check: the production build is correct for GitHub Pages at /<repo>/ (CI runs this).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.SIFT_BASE ?? '/sift-sports-intelligence/';
const dist = new URL('../dist/', import.meta.url).pathname;
const fail = [];
const must = (cond, msg) => cond || fail.push(msg);

const html = readFileSync(join(dist, 'index.html'), 'utf-8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (/^(https?:)?\/\//.test(u) || u.startsWith('#')) continue;
  must(u.startsWith(base) || !u.startsWith('/'), `index.html references ${u} outside ${base}`);
  const local = u.startsWith(base) ? u.slice(base.length) : u;
  must(existsSync(join(dist, local.split('?')[0])), `index.html references missing file ${u}`);
}
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf-8'));
must(manifest.name === 'Sift Sports Intelligence' && manifest.short_name === 'Sift', 'manifest names');
must(manifest.start_url === `${base}#/`, `manifest start_url ${manifest.start_url}`);
must(manifest.scope === base, `manifest scope ${manifest.scope}`);
must(manifest.display === 'standalone', 'manifest display');
for (const i of manifest.icons) must(existsSync(join(dist, i.src)), `missing icon ${i.src}`);
must(manifest.icons.some((i) => i.purpose === 'maskable'), 'no maskable icon');
must(existsSync(join(dist, 'sw.js')), 'no service worker');
must(existsSync(join(dist, '404.html')), 'no 404.html deep-link fallback');
must(existsSync(join(dist, 'icons/apple-touch-icon.png')), 'no apple touch icon');
must(existsSync(join(dist, 'data/nfl/SNAPSHOT.json')), 'no NFL snapshot provenance');
must(existsSync(join(dist, 'data/nfl/app/latest/explorer/index.json')), 'no NFL snapshot explorer');
// Team identity: every CFB logo the committed map promises ships with the site (src/lib/cfb-teams.json).
const cfbTeams = JSON.parse(readFileSync(new URL('../src/lib/cfb-teams.json', import.meta.url), 'utf-8')).teams;
for (const [code, t] of Object.entries(cfbTeams)) if (t.l) must(existsSync(join(dist, 'teams', 'cfb', `${t.e}.webp`)), `CFB logo for ${code} (ESPN ${t.e}) is missing from dist`);
const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const main = js.map((f) => [f, readFileSync(join(dist, 'assets', f), 'utf-8')]).find(([, t]) => t.includes('createHashRouter') || t.includes('HashRouter'));
must(main, 'no hash router in the bundle (deep links would break on Pages)');
const sw = readFileSync(join(dist, 'sw.js'), 'utf-8');
must(!sw.includes('data/nfl/app/latest/event_detail'), 'service worker precaches research data (it must not)');
// Market clock: live quotes must never be answered from a service-worker cache.
must(/live-quotes[\s\S]{0,400}NetworkOnly|NetworkOnly[\s\S]{0,400}live-quotes/.test(sw), 'service worker does not route the live-quote feed NetworkOnly');
must(!/kalshi/i.test(sw), 'service worker references a Kalshi/relay host (live quotes must not be cached or intercepted)');
// No credential may ever ship in the bundle (this pass is read-only market observation).
for (const [f, t] of js.map((f) => [f, readFileSync(join(dist, 'assets', f), 'utf-8')])) {
  must(!/(KALSHI[_-]?(API[_-]?)?(KEY|SECRET|PRIVATE)|BEGIN (RSA |EC )?PRIVATE KEY|KALSHI-ACCESS-(KEY|SIGNATURE))/i.test(t), `${f} contains something that looks like a trading credential`);
  must(!/\/portfolio\/orders|\/portfolio\/balance|createOrder/i.test(t), `${f} references a Kalshi trading endpoint`);
}

if (fail.length) {
  console.error('dist check FAILED:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log(`dist check OK (base ${base}, ${js.length} js chunks)`);
