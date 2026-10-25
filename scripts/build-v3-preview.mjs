// Build the stand-alone SIFT 3.0 preview and copy only the assets it needs: the committed team logos (no photographs, no history layer).
//   node scripts/build-v3-preview.mjs        -> dist-v3-preview/
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync } from 'node:fs';

execSync('npx vite build -c vite.v3-preview.config.ts', { stdio: 'inherit' });
for (const sport of ['nfl', 'nba', 'nhl', 'mlb', 'cfb']) {
  mkdirSync(`dist-v3-preview/teams/${sport}`, { recursive: true });
  cpSync(`public/teams/${sport}`, `dist-v3-preview/teams/${sport}`, { recursive: true });
}
if (existsSync('dist-v3-preview/v3-preview.html')) renameSync('dist-v3-preview/v3-preview.html', 'dist-v3-preview/index.html');
console.log('v3 preview ready in dist-v3-preview/ (open index.html through any static host)');
