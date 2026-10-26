// Build the stand-alone SIFT 3.0 preview into dist-v3-preview/ (isolated from the production build and deploy):
//   node scripts/build-v3-preview.mjs
//   index.html  start page: explicit "sample data" / "real data" links, feed check, commit id
//   app.html    the app (hash routes, relative asset URLs, so any static host or sub-path works)
// Only committed, verified assets are copied: team logos, venue/player photographs the app's own resolvers already vet, league
// identities, and the NFL research/history files the real-data screens read. Nothing is generated or invented here.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const out = 'dist-v3-preview';
const git = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const sha = process.env.SIFT_PREVIEW_SHA || git('rev-parse HEAD') || 'unknown';
const dirty = !process.env.SIFT_PREVIEW_SHA && git('status --porcelain -- src package.json scripts') !== '';

execSync('npx vite build -c vite.v3-preview.config.ts', { stdio: 'inherit', env: { ...process.env, SIFT_PREVIEW_SHA: sha } });

const copy = (from, to = from) => { if (existsSync(`public/${from}`)) { mkdirSync(`${out}/${to}`, { recursive: true }); cpSync(`public/${from}`, `${out}/${to}`, { recursive: true }); } };
for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'cfb']) copy(`teams/${sport}`);
for (const d of ['heroes', 'players', 'leagues', 'data/league', 'data/nfl']) copy(d);

renameSync(`${out}/v3-preview.html`, `${out}/app.html`);
const start = readFileSync('scripts/v3-preview/start.html', 'utf8')
  .replace('__SHA__', sha).replace('__DIRTY__', dirty ? ' (built with uncommitted local changes)' : '')
  .replace('__BUILT__', new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
writeFileSync(`${out}/index.html`, start);
writeFileSync(`${out}/.nojekyll`, '');
writeFileSync(`${out}/BUILD.txt`, `SIFT 3.0 preview\ncommit ${sha}${dirty ? ' (+uncommitted local changes)' : ''}\nbuilt ${new Date().toISOString()}\n`);
console.log(`v3 preview ready in ${out}/ (commit ${sha}${dirty ? ' + local changes' : ''}); open index.html through any static host`);
