import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SIFT 3.0 stand-alone preview build (see src/v3/preview/main.tsx). Separate from the production build: its own entry, its own output
// folder (dist-v3-preview), no PWA, relative base. It changes nothing about `npm run build`.
export default defineConfig({
  base: './',
  define: { __SIFT_BUILD__: JSON.stringify('v3-preview') },
  plugins: [react()],
  publicDir: false,
  build: { outDir: 'dist-v3-preview', emptyOutDir: true, rollupOptions: { input: 'v3-preview.html' } },
});
