import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Preload the two Barlow files every first paint needs (latin 400 body, latin 600 headings), by their hashed
 * build names, so text renders in Barlow without waiting for CSS discovery. Other weights and subsets load
 * on demand through their @font-face unicode-range.
 */
function preloadBarlow(): Plugin {
  return {
    name: 'sift-preload-barlow',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => /barlow-latin-(400|600)-normal-[\w-]+\.woff2$/.test(f)).sort();
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${ctx.server ? '/' : base}${f}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

// GitHub Pages serves the site at https://<owner>.github.io/<repo>/, so every asset URL is built under
// that base. Routing is hash-based (#/nfl/game/…), so deep links never hit the static server.
const base = process.env.SIFT_BASE ?? '/sift-sports-intelligence/';

/** The commit a build was made from, short ("dev" outside CI): v4's early-access sheet shows it so a phone can say which copy it runs. */
const build = (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev';

/**
 * v4's own Home Screen identity: a second manifest, "SIFT v4", that launches #/v4. index.html and src/lib/installIdentity.ts select it
 * when the page is opened on v4; SIFT's own manifest (above, from VitePWA) is untouched and stays the default for every other address.
 */
function v4Manifest(): Plugin {
  return {
    name: 'sift-v4-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest-v4.webmanifest',
        source: JSON.stringify({
          id: `${base}v4/`,
          name: 'SIFT v4 (early access)',
          short_name: 'SIFT v4',
          description: 'SIFT v4 early access: a phone-first view of the published research. Research only, not betting advice.',
          start_url: `${base}v4/`,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#07080b',
          theme_color: '#07080b',
          lang: 'en',
          categories: ['sports', 'news', 'productivity'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/sift.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        }),
      });
    },
  };
}


/**
 * iOS can ignore a manifest's start_url and drop a hash fragment when creating a Home Screen app.
 * Give v4 a real, distinct address with a complete HTML app shell: /v4/ (not /#/v4).
 * Copy Vite's *built* index to keep exactly the same hashed scripts/styles, then give this page
 * its own manifest and bootstrap #/v4 before the React hash router starts.
 *
 * Do this in writeBundle, after Vite writes index.html but before Workbox builds the service worker,
 * so /v4/index.html is precached and an installed app works without falling back to SIFT 2.0.
 * The existing SIFT root HTML/manifest and SIFT 2.0 default remain entirely unchanged.
 */
function v4InstallPage(): Plugin {
  let outputDirectory: string;
  return {
    name: 'sift-v4-install-page',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const appHtml = readFileSync(resolve(outputDirectory, 'index.html'), 'utf8');
      if (!/<link rel="manifest" href="[^"]*manifest\.webmanifest"/.test(appHtml)) {
        throw new Error('Cannot build the v4 install page: default manifest link was not found');
      }
      const bootstrap = `<script>
      // Even if iOS drops the fragment on launch, this actual /v4/ path must open v4.
      if (!/^#\/v4(?:[/?]|$)/.test(location.hash)) {
        history.replaceState(null, '', location.pathname + location.search + '#/v4');
      }
    </script>`;
      const html = appHtml
        .replace('<head>', `<head>\n    ${bootstrap}`)
        .replace(/<title>[^<]*<\/title>/, '<title>SIFT v4 · early access</title>')
        .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, '$1SIFT v4$2')
        .replace(/<link rel="manifest" href="[^"]*"[^>]*>/, `<link rel="manifest" href="${base}manifest-v4.webmanifest">`)
        .replace(/(href|src)="icons\//g, `$1="${base}icons/`);
      const v4Directory = resolve(outputDirectory, 'v4');
      mkdirSync(v4Directory, { recursive: true });
      writeFileSync(resolve(v4Directory, 'index.html'), html);
    },
  };
}

export default defineConfig({
  base,
  define: { __SIFT_BUILD__: JSON.stringify(build) },
  plugins: [
    react(),
    preloadBarlow(),
    v4Manifest(),
    v4InstallPage(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        id: base,
        name: 'Sift Sports Intelligence',
        short_name: 'Sift',
        description: 'Explore sports data as a connected research web. Projections are evidence, not bets.',
        start_url: base + '#/',
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#05070d',
        theme_color: '#05070d',
        categories: ['sports', 'news', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/sift.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // A new deploy must take over at once. Without these the new worker installs and then waits for every open
        // tab to close, so a returning visitor keeps the previous app shell (and the previous hero) after a deploy.
        skipWaiting: true,
        clientsClaim: true,
        // The app shell is precached; research data is NOT (it is large and changes every run).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['data/**'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // MARKET CLOCK: the live-quote feed is never cached by the service worker. A quote served
            // from cached bytes could look current; previously seen quotes are kept by the app itself
            // (src/live/store.ts, local storage) with their real observation time instead. The relay
            // (a different host) has no route at all, so the service worker never intercepts it.
            urlPattern: ({ url }) => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/live-quotes/'),
            handler: 'NetworkOnly',
          },
          {
            // Live sport publications: network first so freshness is real; the cache answers offline.
            urlPattern: ({ url }) => url.hostname === 'raw.githubusercontent.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sift-live-data',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 400, maxAgeSeconds: 3 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Game hero photos: fixed files, credited, large — cached as they are viewed, never precached.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/heroes/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sift-heroes',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The bundled NFL research snapshot: content is fixed per deploy.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sift-snapshot-data',
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
  },
});
