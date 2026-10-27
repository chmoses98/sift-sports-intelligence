// Build the captured-snapshot preview (real published documents, labelled) into dist-v3-snapshot/, ready to publish as a Claude Artifact:
//   V3_FEED_CACHE=<dir with the captured documents> node scripts/build-v3-snapshot.mjs [--player-history 00-0036358] [--team-assets DAL,PHI,...]
// The documents are the disk cache e2e/support/*Feeds.ts fills (V3_REAL_FEEDS=live); this only copies them next to the bundle under their
// URL hash. Nothing is generated; a document that was not captured is simply absent (404 in the page).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-v3-snapshot';
const cache = process.env.V3_FEED_CACHE ?? '.v3-feed-cache';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
execSync('npx vite build -c vite.v3-preview.config.ts', { stdio: 'inherit', env: { ...process.env, SIFT_PREVIEW_SHA: sha, SIFT_PREVIEW_SAMPLE_ONLY: '1', SIFT_PREVIEW_SNAPSHOT: '1' } });
if (!existsSync(cache)) throw new Error(`no captured documents at ${cache}`);
mkdirSync(`${out}/snapshot`, { recursive: true });
let n = 0;
for (const f of (await import('node:fs')).readdirSync(cache)) { cpSync(join(cache, f), `${out}/snapshot/${f}.json`); n++; }
const copy = (p) => { if (existsSync(`public/${p}`)) { mkdirSync(join(out, p, '..'), { recursive: true }); cpSync(`public/${p}`, `${out}/${p}`, { recursive: true }); } };
copy('teams/nfl'); copy('icons/sift.svg');
for (const f of (arg('assets', 'players/nfl/dal-ceedee-lamb.webp,data/nfl/history/players/00-0036358.json')).split(',')) copy(f);
const html = readFileSync(`${out}/v3-preview.html`, 'utf8');
const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>(?:<\/script>)?/g)].map((m) => m[0].replace(/ crossorigin/g, '').replace(/\.\/assets/, 'assets')).join('\n');
writeFileSync(`${out}/artifact-page.html`, `<title>SIFT 3.0 Preview</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n<meta name="theme-color" content="#080b10" />\n<style>html,body{background:#080b10;margin:0}</style>\n${tags}\n<div id="root"></div>\n`);
writeFileSync(`${out}/BUILD.txt`, `SIFT 3.0 captured-snapshot preview\ncommit ${sha}\nbuilt ${new Date().toISOString()}\n${n} captured documents\n`);
console.log(`snapshot preview ready in ${out}/ (${n} documents, commit ${sha.slice(0, 7)})`);
