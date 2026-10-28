// Makes SCRATCH variants of a production build whose service worker precaches less, so the options in docs/sift3/PWA_PRECACHE.md can be MEASURED
// (scripts/v3-qa/sw-perf.mjs) before anyone changes vite.config.ts. Nothing in the repository's build is touched: the variant directory holds symbolic links
// to every file of the build except sw.js, which is a copy with its precache manifest filtered and (optionally) a runtime route for hashed assets.
//
//   node scripts/v3-qa/pwa-variants.mjs <dist> <out-dir> <variant> [--shell <file>] [--v3chunks <file>]
//
//   shell file    app files (one per line, "bytes<TAB>/path" lines as ASSETS_OUT writes them, or plain paths) that the first screens of #/v3 and #/ load
//   v3chunks file one chunk name per line: the JS chunks whose sources are src/v3 (and their CSS siblings) -- chunk-classes.json from the inventory
//
//   none   no precache at all (runtime routes only)
//   shell  precache = index.html, 404.html, manifest, icons and the shell files; hashed assets are cached when first used (CacheFirst, immutable)
//   v3     shell + every SIFT 3.0 chunk; classic and v4 route chunks cached when first used
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dist0, out0, variant] = process.argv.slice(2);
const flag = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
if (!dist0 || !out0 || !variant) { console.error('usage: pwa-variants.mjs <dist> <out-dir> <none|shell|v3> [--shell file] [--v3chunks file]'); process.exit(64); }
const dist = resolve(dist0), out = resolve(out0);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(dist)) if (f !== 'sw.js') symlinkSync(join(dist, f), join(out, f));

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const m = /precacheAndRoute\((\[[\s\S]*?\]),\{\}\)/.exec(sw);
if (!m) throw new Error('no precacheAndRoute manifest in sw.js');
const entries = [...m[1].matchAll(/\{url:"([^"]+)",revision:(null|"[^"]*")\}/g)].map((x) => ({ url: x[1], rev: x[2] }));
const lines = (f) => (f && existsSync(f) ? readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
const shell = new Set(lines(flag('shell')).map((l) => l.split('\t').pop().replace(/^\/+/, '').replace(/^sift-sports-intelligence\//, '').split('?')[0]));
const v3 = new Set(lines(flag('v3chunks')).map((l) => l.replace(/^\/+/, '')));
const always = (u) => u === 'index.html' || u === '404.html' || u === 'manifest.webmanifest' || /^icons\//.test(u);
const stem = (u) => u.replace(/\.(js|css)$/, '');
const v3stems = new Set([...v3].map(stem));

let keep;
if (variant === 'none') keep = () => false;
else if (variant === 'shell') keep = (u) => always(u) || shell.has(u);
else if (variant === 'v3') keep = (u) => always(u) || shell.has(u) || v3stems.has(stem(u));
else throw new Error(`unknown variant ${variant}`);

const kept = entries.filter((e) => keep(e.url));
const list = kept.map((e) => `{url:"${e.url}",revision:${e.rev}}`).join(',');
let js = sw.replace(m[0], `precacheAndRoute([${list}],{})`);
// hashed build files are immutable: cache them the first time they are used
const route = 's.registerRoute(({url:u,sameOrigin:o})=>o&&/\\/assets\\//.test(u.pathname),new s.CacheFirst({cacheName:"sift-assets",plugins:[new s.ExpirationPlugin({maxEntries:400,maxAgeSeconds:2592e3}),new s.CacheableResponsePlugin({statuses:[200]})]}),"GET"),';
js = js.replace('s.cleanupOutdatedCaches(),', `s.cleanupOutdatedCaches(),${route}`);
if (!js.includes('"sift-assets"')) throw new Error('could not add the runtime route (the sw.js layout changed)');
writeFileSync(join(out, 'sw.js'), js);
console.log(`${variant}: ${kept.length} of ${entries.length} entries precached`);
