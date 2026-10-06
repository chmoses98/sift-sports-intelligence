import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The stadium manifest and photo registry are imported by the app, but most of what they hold (provenance
 * detail, hashes, review notes, crop-validation rectangles, comments) is for the repository, not the
 * browser. Ship only the fields src/lib/venues.ts reads, and only APPROVED photos.
 */
function stadiumData(): Plugin {
  const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
  return {
    name: 'sift-stadium-data',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/scripts/stadiums/venues.json')) {
        const venues = JSON.parse(code).venues.map((v: any) => pick(v, ['slug', 'name', 'aliases', 'city', 'lat', 'lon', 'roof', 'kind', 'in_service', 'tenancies']));
        return { code: JSON.stringify({ venues }), map: null };
      }
      if (id.endsWith('/scripts/stadiums/photos.json')) {
        const photos = Object.fromEntries(Object.entries(JSON.parse(code).photos as Record<string, any>).filter(([, p]) => p.status === 'approved').map(([id, p]) => [id, {
          venue: p.venue, status: p.status, captured: pick(p.captured, ['light', 'sky', 'event']),
          source: pick(p.source, ['kind', 'file', 'url', 'author', 'license', 'license_url']),
          crop: pick(p.crop, ['focus', 'mobile_focus']),
          files: Object.fromEntries(Object.entries(p.files ?? {}).map(([k, f]: [string, any]) => [k, { path: f.path }])),
        }]));
        return { code: JSON.stringify({ photos }), map: null };
      }
      return null;
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// GitHub Pages serves the site at https://<owner>.github.io/<repo>/, so every asset URL is built under
// that base. Routing is hash-based (#/nfl/game/…), so deep links never hit the static server.
const base = process.env.SIFT_BASE ?? '/sift-sports-intelligence/';

export default defineConfig({
  base,
  plugins: [
    stadiumData(),
    react(),
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
            // Stadium photos: fixed files, credited, large — cached as they are viewed, never precached.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/stadiums/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sift-stadiums',
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
