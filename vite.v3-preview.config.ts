import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const git = (c: string): string => { try { return execSync(`git ${c}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
// The build id names the exact commit (and says so when the tree had uncommitted changes), shown in Settings and on the start page.
const sha = process.env.SIFT_PREVIEW_SHA || git('rev-parse HEAD') || 'unknown';
const dirty = !process.env.SIFT_PREVIEW_SHA && git('status --porcelain -- src package.json') !== '';

// SIFT 3.0 stand-alone preview build (see src/v3/preview/main.tsx). Separate from the production build: its own entry, its own output
// folder (dist-v3-preview), no PWA, relative base. It changes nothing about `npm run build`.
export default defineConfig({
  base: './',
  define: { __SIFT_BUILD__: JSON.stringify(`v3-preview ${sha.slice(0, 7)}${dirty ? '+local' : ''}`) },
  plugins: [react()],
  publicDir: false,
  build: { outDir: 'dist-v3-preview', emptyOutDir: true, rollupOptions: { input: 'v3-preview.html' } },
});
