# Service-worker precache: what it holds, what it costs, what could be narrower

Owner item: "Investigate narrowing the 267-file service-worker precache to the necessary app shell and on-demand content. Measure the impact before changing shared production PWA behavior."

**Status: investigation only.** Nothing here changes `vite.config.ts`, `src/main.tsx` or any shared PWA behaviour; every option below was measured on scratch copies of a production build (`scripts/v3-qa/pwa-variants.mjs`, `scripts/v3-qa/sw-perf.mjs`, both new, tooling only). Build: `npm run build:e2e` of `claude/sift3-impl` at 2b5e7f92 (the base of the `claude/sift3-w-fixtures` branch). Reproduce:

```bash
npm run build:e2e
node scripts/v3-qa/pwa-variants.mjs dist /tmp/var-shell shell --shell <shell.txt>          # shell.txt: the app files the first screens of #/v3 and #/ load (ASSETS_OUT of sw-perf.mjs)
node scripts/v3-qa/pwa-variants.mjs dist /tmp/var-v3 v3 --shell <shell.txt> --v3chunks <v3chunks.txt>
DIST="shipped=dist,optA=/tmp/var-shell,optB=/tmp/var-v3" RUNS=3 node --experimental-strip-types scripts/v3-qa/sw-perf.mjs
```

## What is configured (`vite.config.ts`, `VitePWA`)

`registerType: 'autoUpdate'`, `injectRegister: false` (the worker is registered by `src/main.tsx`: at start-up for every address, **6 s after `load` on a `#/v3` address**, PR #149), `skipWaiting` and `clientsClaim` (a new deploy takes over at once), `globPatterns: ['**/*.{js,css,html,svg,png,woff2}']`, `globIgnores: ['data/**']`, `navigateFallback: 'index.html'` (every navigation is answered with the cached shell), `maximumFileSizeToCacheInBytes: 4 MB`. Runtime routes: live quotes and `sportscore.com` NetworkOnly; `raw.githubusercontent.com` NetworkFirst (6 s timeout, 400 entries, 3 days, cache `sift-live-data`); `/heroes/` CacheFirst (80 entries); same-origin `/data/` StaleWhileRevalidate. One worker serves the whole scope `/sift-sports-intelligence/`: classic, v3 and v4 are one document with hash routes, so **a worker cannot be scoped to v3**; only what it precaches and when it starts can differ.

## Inventory of the 267 entries (all of it is app code and fonts)

| Kind | Entries | Raw KB | Wire KB (gzip 6; fonts as stored) | Who uses it |
| --- | --- | --- | --- | --- |
| JS chunks, classic (routes of the classic app: Game, Player, Team, NHL, CBB, MLB, soccer, intel, packets, explore, home) | 136 | 2,306 | 731 | classic only |
| JS chunks, SIFT 3.0 (`src/v3`: Props, Team, Player, GameDetail, Stat, useSlate, V3Root and their parts) | 32 | 506 | 167 | v3 only |
| JS chunks, v4 (`src/v4`) | 23 | 206 | 71 | v4 only |
| JS chunks, vendor and misc (react-router, chart hooks) | 9 | 143 | 52 | all |
| of which the entry chunk (`index-*.js`) | 1 | 609 | 188 | all (it carries about 250 KB of classic views) |
| CSS, classic (23 files; the entry stylesheet alone is 506 KB raw, 95 KB gz, imported by `main.tsx` for every address) | 23 | 673 | 137 | classic (loaded by v3 too) |
| CSS, SIFT 3.0 | 9 | 130 | 29 | v3 |
| CSS, v4 | 2 | 68 | 14 | v4 |
| Fonts: Barlow (14 files: latin, latin-ext, vietnamese, condensed, weights 400 to 700) | 14 | 219 | 219 | classic (v3 draws Geist and Sora) |
| Fonts: Geist (4) and Sora (2) | 6 | 184 | 184 | v3 |
| Icons (10), `index.html`, `404.html`, manifest | 13 | 41 | 28 | all |
| **Total** | **267** | **4,474 (4.37 MiB)** | **1,631 (1.67 MB)** | |

Not in the precache (so not in the 267): the 756 team-logo `.webp` files (5.3 MB; the brief's "142 team logos" are among them), league logos, player images, hero photos (75 MB, runtime CacheFirst), the history JSON (`data/**`, 49 MB, ignored, runtime SWR when read), venue art: `webp` is not in `globPatterns`, so **team and league logos are never cached by the worker at all** (every view is a network request or an HTTP-cache hit, and offline they are blank).

What a first screen actually needs: `#/v3` Home loads 118 app files (92 of them in the precache, 785 KB gz) and the classic Home 83 (78 in the precache, 642 KB gz); together 140 files, 109 precached, **883 KB gz**. The entry chunk statically pulls about 80 chunks (modulepreload), so the "app shell" is not small: it is 109 of 267 entries and 54% of the bytes. Everything else (route chunks of screens you have not opened: 147 entries, 761 KB gz) is on-demand content.

## First-visit install: what it costs (9 Mbit/s, 170 ms, one shared link; `sw-perf.mjs`, service worker allowed)

The worker's own fetches are not covered by a page's DevTools throttle, so the throttle was put in the servers (one link for everything the phone downloads, 170 ms before each response). Median of 2 to 3 runs; the machine was shared (load average 7 to 12), so read the bytes and requests exactly and the times to about 0.5 s.

| Build | Worker requests | Worker bytes (wire) | Time until the worker is active and controls the page | Home first content (worker registered 6 s after load) | Repeat visit, Home first content, app bytes |
| --- | --- | --- | --- | --- | --- |
| Shipped (267 entries) | 264 | 1.74 MB | 52 to 67 s | 3.1 to 3.6 s | 2.5 s, 0 KB |
| Option A: shell only | 117 | 0.94 MB | 25 to 31 s | 3.3 to 3.9 s | 3.1 to 4.0 s, 175 KB |
| Option B: shell + SIFT 3.0 chunks (144 entries) | 141 | 1.10 MB | 35 to 36 s | 3.6 to 3.7 s | 3.1 to 3.3 s, 175 KB |
| Control: no worker (blocked) | 0 | 0 | never | 3.1 to 3.4 s | 3.2 to 3.6 s, 0.8 to 1.0 MB (the harness's HTTP cache only partly engaged) |

Findings:

1. **The install is slow, not heavy.** Workbox fetches the entries one after another, so 264 requests at 170 ms each take about a minute at an average of 0.3 Mbit/s (1.74 MB over 52 to 67 s). It therefore **barely competes with the first screen for bandwidth**.
2. **First screen of SIFT 3.0.** With the worker registered at load (what start-up registration would do) on Prop Discovery, the heaviest first screen: first content shipped 5.4 s, shell-only 5.6 s, a worker that precaches nothing 5.6 s (3 runs each; the 0.3 s spread is noise). With the shipped 6 s delay Home is unaffected (3.1 to 3.9 s in every build: the install starts after first content). PR #149 is a safe, sufficient mitigation for v3; its cost is that the first visit is controlled and offline-ready a minute later.
3. **Repeat visit** gains from the precache about 0.7 to 1 s on Home (2.5 s with all app code from the worker, against 3.2 to 3.6 s with 0.8 to 1.0 MB re-downloaded) and nothing measurable on Prop Discovery (5.3 to 5.6 s: its time is documents and CPU, not code).
4. **Update cost per deploy.** A small source change in this branch (a stylesheet rule, one new module, one edited entry helper) changed the content hash of **110 of the 267 entries, 784 KB gz (47% of the precache)**: the bundler re-hashes every importer of a changed chunk. A returning visitor downloads that much after each deploy (`autoUpdate` + `skipWaiting`). The same change would cost 18 entries / 242 KB (27% of Option A's set) or 33 entries / 374 KB (35% of Option B's).
5. Cost of the shipped precache beyond bytes: 267 cache entries to write and 264 requests, a minute of low-rate activity on a first visit (battery, data plan on a metered connection), and `navigateFallback` answers every address with the cached shell.

## Offline (after the install, network cut; `sw-perf.mjs` drops every connection of both servers, because a page's offline emulation does not reach the worker's own fetches)

| Build | `#/v3` Home | Prop Discovery (a lazy chunk not opened before) | Classic Home | A classic route nobody opened (CBB Home and Game chunks) |
| --- | --- | --- | --- | --- |
| Shipped | loads | loads | loads | available (every chunk is precached; read from the manifest, not driven) |
| Option A (shell) | loads | **fails** (its chunk is not in the shell) | loads | not cached until opened once under the worker |
| Option B (shell + SIFT 3.0) | loads | loads | loads | not cached until opened once under the worker (checked in the manifests: `Home-CwHtaO-N.js`, `Game-DNVqNhEj.js` are in the shipped precache and in neither variant) |

Research documents are not affected by any option (they use `NetworkFirst` into `sift-live-data`, which holds what was read online). A first version of Option B missed two small shared chunks and one stylesheet and failed Prop Discovery offline until the variant maker followed the imports and the lazy chunk's stylesheet: whoever implements 2 must derive the SIFT 3.0 set from the chunk graph, not from file names.

## Options

Estimates are from the scratch variants above; "saves" is against the shipped 267 entries / 1.67 MB gz.

| | What it is | Install | Saves | Offline and repeat | Risk to the classic app | v3-scoped? |
| --- | --- | --- | --- | --- | --- | --- |
| **1. Trim, keep behaviour** | `globIgnores` the v4 chunks and styles (`V4Root*`, `src/v4` chunks: 25 files, 87 KB gz) and the Barlow subsets no first screen draws (latin-ext, vietnamese, condensed: 9 fonts, about 112 KB), cache fonts at first use (`CacheFirst`, hashed and immutable); add `CacheFirst` for `/teams/`, `/leagues/` (logos are tiny, immutable, never cached today) | about 34 files fewer, 0.2 MB gz less (12%) | 12% of the install; logos gain a repeat and offline path they do not have | v4 and rare scripts load on demand, so v4 offline needs a prior visit; the other precached routes unchanged; logos cached from the first view | low: classic precache unchanged apart from v4 and rare font subsets; a font that is not cached yet falls back for the first offline view | no (shared), but only touches v4 and fonts |
| **2. Shell + SIFT 3.0, the rest on demand** (measured as Option B) | precache `index.html`, the entry and the chunks both Homes load, the icons and every SIFT 3.0 chunk (144 entries); every other hashed asset `CacheFirst` the first time it is used (a worker that controls the page caches what passes through it) | 141 requests, 1.10 MB (-37%); active after 35 s instead of 52 to 67 s | 0.61 MB gz and 123 files; 52% fewer updated bytes per deploy | SIFT 3.0 fully offline after the first visit; a classic or v4 screen is offline only after it has been opened once while the worker controlled the page (chunks loaded before the worker took control are not cached: a visitor's first screens are) | **medium**: classic offline behaviour changes (an installed classic PWA user who opens a never-seen route offline now fails with a chunk error instead of working); needs the offline matrix of `ci.yml` re-run, and the owner's say on whether classic offline for unvisited screens is a promise | partly: v3 is whole, classic degrades |
| **3. Shell only** (measured as Option A) | as 2 without the SIFT 3.0 chunks that no first screen loads (120 entries) | 117 requests, 0.94 MB (-46%); active after 25 to 31 s | 0.76 MB gz and 147 files; 69% fewer updated bytes per deploy | SIFT 3.0 screens other than Home and Prop Discovery's entry are offline only after a visit | **medium to high**: same as 2 for classic, and v3 loses the offline guarantee for screens not yet opened | no |
| 4. Install later, same set | keep all 267 but start the install after the first screen has been used (idle, an interaction, or 60 s) and not on `saveData` or a 2g/3g connection; or `injectManifest` with a shell install and the rest warmed by a message from the app | unchanged bytes, moved out of the first minute | 0 | identical once installed | medium (a custom worker replaces the generated one for classic too) | yes, by address (already so, 6 s, for v3) |

Not an option, measured: a v3-only service worker. Classic, v3 and v4 share one document and one scope, so a v3-only worker would have to be registered under another path, which hash routing does not allow.

## Recommendation

1. **Keep PR #149's 6 s delay; it is enough for v3's first screens.** The install does not slow the first screen even when it starts at load (finding 2), and Home is untouched.
2. **Do Option 1 now, it is cheap and safe**: drop the v4 chunks and the unused Barlow subsets from the precache and cache team and league logos at first use. It narrows the install by about 12%, removes bytes nobody has asked for, and gives logos an offline and repeat path they lack today.
3. **Do not do Options 2 or 3 until the owner decides what classic offline promises.** They save 37% to 46% of the install and 52% to 69% of every update, but they trade classic's "every route works offline after install" for "every route you have opened works offline". If classic's offline guarantee is not a product requirement, Option 2 (shell + SIFT 3.0) is the right shape: it keeps v3 fully offline and halves the cost of an update.
4. **The bigger lever is the code split, not the glob.** The shell is 109 files because the entry preloads about 80 chunks and imports 23 classic stylesheets (97 KB gz) for every address; a v3-only entry (listed under mobile performance, owner decision 4) would shrink the shell the same way it shrinks the first screen. Do that before narrowing further.
5. Whichever is chosen, re-measure with `sw-perf.mjs` on the real build: it is the only measurement of the install (the other harnesses block workers).

## What was and was not measured

Measured: bytes and requests of the install, time until the worker is active, Home and Prop Discovery first content with the worker registered at load and after 6 s, repeat visit, update cost of one real change, and (below) offline behaviour of each variant. Not measured: a real phone and a real network (this is Chromium under an emulated link on a shared machine: bytes and counts are exact, times are within about 0.5 s); the classic first screen's own load with a start-up registration (classic registers at start-up; its first visit is not delayed); iOS Safari's cache eviction of an unused PWA; the user-visible effect of a metered connection.
