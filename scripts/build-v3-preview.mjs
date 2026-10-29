// Build the stand-alone SIFT 3.0 preview into dist-v3-preview/ (isolated from the production build and deploy):
//   node scripts/build-v3-preview.mjs                 full preview (needs a host that allows fetches to raw.githubusercontent.com)
//   node scripts/build-v3-preview.mjs --sample-only   dist-v3-artifact/: sample data only, logos only, plus artifact-page.html (the
//                                                    body-less page the Claude Artifact viewer wraps; its sandbox blocks the feeds)
//   index.html  start page: explicit "sample data" / "real data" links, feed check, commit id
//   app.html    the app (hash routes, relative asset URLs, so any static host or sub-path works)
// Only committed, verified assets are copied: team logos, venue/player photographs the app's own resolvers already vet, league
// identities, and the NFL research/history files the real-data screens read. Nothing is generated or invented here.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const sampleOnly = process.argv.includes('--sample-only');
const out = sampleOnly ? 'dist-v3-artifact' : 'dist-v3-preview';
const git = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const sha = process.env.SIFT_PREVIEW_SHA || git('rev-parse HEAD') || 'unknown';
const dirty = !process.env.SIFT_PREVIEW_SHA && git('status --porcelain -- src package.json scripts') !== '';

execSync('npx vite build -c vite.v3-preview.config.ts', { stdio: 'inherit', env: { ...process.env, SIFT_PREVIEW_SHA: sha, ...(sampleOnly ? { SIFT_PREVIEW_SAMPLE_ONLY: '1' } : {}) } });

const copy = (from, to = from) => { if (existsSync(`public/${from}`)) { mkdirSync(`${out}/${to}`, { recursive: true }); cpSync(`public/${from}`, `${out}/${to}`, { recursive: true }); } };
for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'cfb']) copy(`teams/${sport}`);
if (!sampleOnly) for (const d of ['heroes', 'players', 'leagues', 'data/league', 'data/nfl']) copy(d);

if (sampleOnly) {
  const html = readFileSync(`${out}/v3-preview.html`, 'utf8');
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>(?:<\/script>)?/g)].map((m) => m[0].replace(/ crossorigin/g, '').replace(/\.\/assets/, 'assets')).join('\n');
  writeFileSync(`${out}/artifact-page.html`, `<title>SIFT 3.0 Preview</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n<meta name="theme-color" content="#080b10" />\n<style>html,body{background:#080b10;margin:0}</style>\n${tags}\n<div id="root"></div>\n`);
  writeFileSync(`${out}/BUILD.txt`, `SIFT 3.0 preview (sample data only)\ncommit ${sha}${dirty ? ' (+uncommitted local changes)' : ''}\nbuilt ${new Date().toISOString()}\n`);
  console.log(`v3 sample-only preview ready in ${out}/ (commit ${sha}); publish artifact-page.html with its assets/ and teams/ files`);
  process.exit(0);
}
renameSync(`${out}/v3-preview.html`, `${out}/app.html`);
const start = readFileSync('scripts/v3-preview/start.html', 'utf8')
  .replace('__SHA__', sha).replace('__DIRTY__', dirty ? ' (built with uncommitted local changes)' : '')
  .replace('__BUILT__', new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
writeFileSync(`${out}/index.html`, start);
writeFileSync(`${out}/.nojekyll`, '');
writeFileSync(`${out}/BUILD.txt`, `SIFT 3.0 preview\ncommit ${sha}${dirty ? ' (+uncommitted local changes)' : ''}\nbuilt ${new Date().toISOString()}\n`);
console.log(`v3 preview ready in ${out}/ (commit ${sha}${dirty ? ' + local changes' : ''}); open index.html through any static host`);
