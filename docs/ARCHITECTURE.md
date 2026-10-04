# Sift — architecture

Sift is a static, client-rendered research app. It has no server, no database and no API keys:

```
sport repos (nfl-edge-finder, edge-finder-api, …)
   └─ publish edge_finder.app.v1 + explorer/ JSON on a branch (unchanged by Sift)
        └─ raw.githubusercontent.com (CORS *, 5-minute cache)
             └─ Sift on GitHub Pages (static files + service worker)
                  └─ your browser: fetches one document at a time, keeps the tray in local storage
```

Monthly cost: $0 (GitHub Pages + GitHub Actions on a public repository).

## Stack and why

| Choice | Why |
|---|---|
| **Vite 8 + React 19 + TypeScript** | Static output, no server runtime; mature ecosystem for an interactive, chart-heavy UI; strict typing over the contract's documents. |
| **React Router 7, hash routing** (`createHashRouter`) | GitHub Pages cannot rewrite unknown paths to `index.html`. With `#/nfl/game/evt_…` every deep link and refresh is served by the same `index.html`, so routing never depends on the host. `public/404.html` still turns a path-style link into the hash route. |
| **Hand-built SVG charts on `d3-scale` / `d3-shape`** | Charts are navigation surfaces (every point/bar/rung is a link) with Sift's own visual language; a chart library's defaults would fight both. Charts render at their measured pixel width so text stays legible on phones. |
| **Plain CSS with design tokens** (`src/styles/tokens.css`, `sift.css`) | A deliberate, documented visual system (docs/DESIGN_SYSTEM.md) rather than a component library's look. |
| **vite-plugin-pwa (Workbox)** | Installable PWA, precached app shell, network-first caching of research data. |
| **Self-hosted fonts** (`@fontsource-variable/*`) | Work offline, no third-party font requests. |
| **Vitest + Testing Library**, **Playwright** | Unit/integration tests on real fixtures; the acceptance journey runs in Chromium at phone and desktop sizes against the production build. |
| **@noble/hashes** | sha256 for the contract's deterministic ids (packet ids, tray item ids) synchronously in the browser. |

## Data access (`src/data/`)

* **Registry** (`sports.ts`): each sport's raw root, from the router's `registry.json`. NFL is primary, MLB a
  beta through the same generic screens; CFB/NBA/NHL/Soccer/Tennis show real live health and capability manifests only.
* **Source resolution** (`source.ts`): for each sport Sift reads `health.json` and probes
  `explorer/index.json` on the live root.
  * `live` — the live root has an explorer: everything comes from it.
  * `snapshot` — the live root publishes v1 but no explorer. NFL is in this state today because NFL's
    explorer exporter crashes (see DATA_GAPS.md). Sift then serves a **same-run** research snapshot built by
    NFL's own exporter from NFL's own committed data (`public/data/nfl/`, provenance in `SNAPSHOT.json`,
    verified by the contract's `verify-explorer`). The deploy workflow rebuilds it from the live publication
    every 3 hours (`scripts/refresh-nfl-snapshot.sh`), so it follows the live run. Freshness chips describe
    the data on screen; the banner says when the live root has moved to a newer run.
  * `live-v1` / `unavailable` — no research screens.
* **Reader** (`repo.ts`): paths come only from `explorer/index.json`'s file table and documents' own paths
  ("a client never guesses a path"). Any document whose `schema_version` is not `edge_finder.app.v1` is rejected.
* **Fetch cache** (`fetcher.ts`, `hooks.ts`): in-flight de-duplication + session memo, so going back through
  the research graph renders instantly. The service worker adds the cross-session cache.

### Performance budget

| Screen | What it downloads (gzipped, approx.) |
|---|---|
| Home | app shell (~125 KB JS + 16 KB CSS), board (5 KB), health of 7 sports |
| Slate | board + one event-research document per card **as it scrolls into view** |
| Game | event research (~20 KB) + event detail with all ~800 markets (~85 KB) + 2 team profiles |
| Team / metric / ranking / player | one profile (≤ 20 KB) + the one ranking or series it shows |
| Search | the search index (~25 KB) once per session |

Whole-sport files (`markets.json` 14 MB, `model_prices.json` 6 MB) are never downloaded; per-event
`event_detail` carries exactly the same rows (checked for all 51 NFL events). Every screen is its own
code chunk.

## The handicap packet (`src/packet/`)

A line-for-line TypeScript port of `kalshi-bet-router/contract/edge_finder_contract/packet.py`
(packet 1.0.0): same scopes (GAME, SLATE, CUSTOM tray), same evidence order, same trim order, same
clipboard text, same deterministic `packet_id`. `tests/packet.golden.test.ts` compares it byte for byte
with packets the Python builder produced from the same publication (`scripts/make_golden_packets.py`).
The protocols are vendored unchanged in `src/contract/protocols/`. The packet is built with
`generated_at = now`, so market/model freshness in the packet is the freshness at copy time.

COPY FOR CHATGPT is a separate tap after the build, because iOS only allows clipboard writes inside a user
gesture. Fallbacks: text selection, the share sheet, or a `.txt` download.

## PWA

`manifest.webmanifest` (name *Sift Sports Intelligence*, short name *Sift*, standalone, dark theme, 192/512/
maskable/apple-touch icons). The service worker precaches the app shell (JS, CSS, fonts, icons) and caches
research data network-first (live roots) or stale-while-revalidate (bundled snapshot). Research data is never
precached. Offline, every document you already opened still renders, with an offline banner.

## Deployment

* `.github/workflows/ci.yml` — on every PR/branch push: install, lint, typecheck, unit/integration tests,
  production build, Pages build check (`scripts/check-dist.mjs`), Playwright acceptance journey.
* `.github/workflows/deploy.yml` — on push to `main`, every 3 hours and on demand: runs the full CI suite,
  rebuilds the NFL snapshot (no-op once NFL publishes its own explorer), builds with base
  `/sift-sports-intelligence/`, deploys with `actions/deploy-pages`. A red suite never deploys.

## Accessibility

Semantic landmarks and headings; every interactive element is a link or button with a label; visible focus
rings; 44 px touch targets; charts have `role="img"` summaries, keyboard navigation (trend: ←/→), and a table
view; identity is never color-only (glyphs ●◐◌○ for states, labels on every chip, legends on every chart);
`prefers-reduced-motion` and `forced-colors` are respected.
