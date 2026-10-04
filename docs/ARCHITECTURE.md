# Sift — architecture

Sift is a static, client-rendered research app. It has no database and no API keys, and it runs on
**two clocks**:

```
RESEARCH CLOCK (hours)                                MARKET CLOCK (seconds to minutes)
sport repos (nfl-edge-finder, …)                      Kalshi public market data (GET /markets, read-only)
  └─ edge_finder.app.v1 + explorer/ JSON                ├─ quote feed: GitHub Actions every 5 min → live-quotes branch
       └─ raw.githubusercontent.com (CORS *)            └─ read-only relay: Vercel Function, 15–60 s (preferred)
            └─ src/data/  memoised, revalidated              └─ src/live/  one shared store: batching, cadence,
               every 10 min in the background                   visibility/offline pause, backoff, last-known-good
                         └──────────── overlay by Kalshi ticker ─────────────┘
                                 Sift on GitHub Pages (static files + service worker)
```

Research may age; prices may not age silently. A model price, a ranking or a simulation comes from the
sport publication and keeps that publication's freshness rules. A YES bid/ask, last trade, volume, open
interest or market status comes from the market clock whenever it has a newer observation, and is always
shown with its real age. The Pages deploy schedule (every 3 hours) is **not** the market refresh schedule:
the app is never rebuilt for a price move.

Monthly cost: $0 (GitHub Pages + GitHub Actions on a public repository; the relay fits Vercel's Hobby
tier at private / friends scale — limits in `relay/README.md`).

## Stack and why

| Choice | Why |
|---|---|
| **Vite 8 + React 19 + TypeScript** | Static output, no server runtime; mature ecosystem for an interactive, chart-heavy UI; strict typing over the contract's documents. |
| **React Router 7, hash routing** (`createHashRouter`) | GitHub Pages cannot rewrite unknown paths to `index.html`. With `#/nfl/game/evt_…` every deep link and refresh is served by the same `index.html`, so routing never depends on the host. `public/404.html` still turns a path-style link into the hash route. |
| **Hand-built SVG charts on `d3-scale` / `d3-shape`** | Charts are navigation surfaces (every point/bar/rung is a link) with Sift's own visual language; a chart library's defaults would fight both. Charts render at their measured pixel width so text stays legible on phones. |
| **Plain CSS with design tokens** (`src/styles/tokens.css`, `sift.css`) | A deliberate, documented visual system (docs/DESIGN_SYSTEM.md) rather than a component library's look. |
| **vite-plugin-pwa (Workbox)** | Installable PWA, precached app shell, network-first caching of research data. |
| **Self-hosted fonts** (`@fontsource-variable/*`) | Work offline, no third-party font requests. |
| **Vitest + Testing Library**, **Playwright**, **axe-core** | Unit/integration tests on real fixtures; the acceptance suite runs in Chromium (phone, desktop) and WebKit (iPhone 15 Pro, iPhone SE) against the production build, with axe accessibility scans and visual baselines. |
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
* **Fetch cache** (`fetcher.ts`, `hooks.ts`): in-flight de-duplication + memo, so going back through the
  research graph renders instantly. A memo older than 10 minutes (`RESEARCH_REVALIDATE_MS`) is shown at
  once and re-read in the background (stale-while-revalidate), so a PWA left open all afternoon picks up a
  newer publication without a reload; a failed re-read keeps what is on screen. **Executable quotes never
  go through this cache** (see *The market clock*). The service worker adds the cross-session cache.

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

## The market clock (`src/live/`)

### Direct browser access vs relay — the evidence

`scripts/kalshi-probe.mjs` (run by `.github/workflows/live-provider-smoke.yml` on a GitHub runner and in
real Chromium and WebKit pages on https://chmoses98.github.io, 2026-10-04) measured Kalshi's public
market-data API (`https://api.elections.kalshi.com/trade-api/v2`):

| Request | Result |
|---|---|
| `GET /markets?…` with **no** `Origin` (a server) | **200**, `cache-control: public, max-age=15`, no auth needed |
| same with `Origin: https://chmoses98.github.io` | **403**, empty body, no CORS headers |
| same with `Origin: http://localhost:4173` | **403** |
| same with `Origin: https://kalshi.com` | 200, `access-control-allow-origin: https://kalshi.com` (an allowlist) |
| `fetch()` from a real Chromium page on the Pages origin | `TypeError: Failed to fetch` |
| `fetch()` from a real WebKit page on the Pages origin | `TypeError: Load failed` |
| `GET /markets?tickers=` 100 tickers | 200, all 100 returned; 250 tickers → **414** (URL too long) |
| `GET /markets?event_ticker=A,B` (comma list) | 200 with **0** markets — one event per request |
| `GET /markets?series_ticker=S&status=open` | every open market of the series, all games, cursor-paged |
| 20 sequential reads | 0 × HTTP 429 |
| market object | prices as dollar strings (`yes_bid_dollars "0.5400"`), sizes fixed-point (`volume_fp`), `status` (`active`…), `updated_time` = metadata time (**not** a quote time) |

Kalshi enforces an Origin allowlist server-side, and a browser always sends `Origin`, so **direct browser
access is impossible** from GitHub Pages. No credential is involved anywhere (the data is public), so none
can leak. Two read-only paths remain, and Sift uses both behind one provider abstraction:

1. **Quote feed** (`scripts/publish-live-quotes.mjs`, `.github/workflows/live-quotes.yml`, no setup, $0):
   every 3 minutes a runner reads the publication's upcoming games, sweeps Kalshi's open markets for the
   publication's series (inventory) plus the publication's own tickers that are no longer open (closed /
   suspended), and force-pushes one small JSON per game (`games/<event-suffix>.json`, ~800 markets) to the
   `live-quotes` branch, read from raw.githubusercontent.com. Each market carries `observed_at` = Kalshi's
   `Date` minus `Age`. Near-live only: publication every 3 minutes plus raw.githubusercontent.com's cache of
   up to 5 minutes (a query string does not bypass it — measured), so quotes are typically 3–8 minutes old.
   GitHub's scheduler proved undependable here (the 15:17 deploy cron never fired; a new cron did not
   start for 40+ minutes), so each feed run loops for ~55 minutes and dispatches its successor; the cron
   only restarts a broken chain. First real run: 15 games, 79
   requests, 0 errors, 28 contracts listed after the research run.
2. **Relay** (`relay/`, deployed by the owner once — see `relay/README.md`): forwards only `GET /markets`
   with allow-listed parameters (≤ 100 tickers, one event or series, status/limit/cursor) without an
   Origin, answers CORS for Sift's origins only (not an open proxy), stamps `X-Sift-Observed-At` (Kalshi's
   `Date` minus `Age`), passes 429 + `Retry-After` through (exposed to the browser), answers 502/504 with
   CORS when Kalshi is malformed, unreachable or slow, and shares identical reads for 5 s. With it, Sift
   meets the 15–60 s targets. The behaviour lives in `relay/core.ts`; hosts are thin adapters:
   * **Vercel Function** (`relay/api/markets.ts`, current host): runs on AWS (region `iad1`), so its
     upstream calls leave from a different network than Cloudflare's.
   * **Cloudflare Worker** (`relay/kalshi-quote-relay.ts`, legacy): Kalshi answered HTTP 429 to 16 of 17
     production requests from it on 2026-10-04 (Cloudflare's shared egress), so Sift ran on the feed.
     Kept deployable; unused once the Vercel relay is configured.

   Kalshi's unauthenticated limit, measured from a clean IP (`scripts/kalshi-rate-probe.mjs`), is a
   per-IP token bucket of ~14 requests refilling ~3/s; details and what it means for inventory sweeps
   in `relay/README.md`.

   When the relay fails and the feed answers, `FallbackProvider` keeps the relay's failure (kind, HTTP
   status, time) and *Data & provenance* shows it as **Fallback reason**; the mode reads FEED. Nothing
   hides a 429.

`src/live/config.ts` builds the provider chain: relay (if `VITE_SIFT_QUOTE_RELAY_URL` is set at build
time, from the repository variable `SIFT_QUOTE_RELAY_URL`) then feed (`FallbackProvider`). Screens never
call a provider.

### Quote normalisation

`src/live/normalize.ts` maps a Kalshi market object to a `LiveQuote`: dollar strings → numbers (legacy
integer cents accepted), `*_fp` sizes, bid 0 / ask 1.00 → "no quote", status words → availability
(`active/open` OPEN · `initialized/unopened` UNOPENED · `inactive/paused` SUSPENDED · `closed/determined/
disputed/amended` CLOSED · `settled/finalized` SETTLED · else UNKNOWN). `observedAt` is the provider's
response time, rounded **down** to the second (a quote is never stamped younger than it is).

### Freshness (market quotes only)

`src/live/freshness.ts`, measured from the quote's observation time, never from Sift's last attempt:

| State | Rule |
|---|---|
| FRESH | age < 15:00 |
| AGING | 15:00 ≤ age ≤ 30:00 (exactly 30:00 is still AGING) |
| STALE | age > 30:00 |
| UNKNOWN | no trustworthy timestamp |

Boundaries are tested to the millisecond (`tests/quote-freshness.test.ts`). Research documents, model
prices and health keep the contract's per-component thresholds (`src/contract/freshness.ts`); the test
also proves the two policies stay separate. **Availability is separate from freshness**: a chip reads
`OPEN · FRESH · 2m`, `SUSPENDED · quote 3m old`, `CLOSED · final quote 40m ago`, always with `live` or
`published`. A publication capture is never labelled live.

### The shared store and polling policy

`src/live/store.ts` is one scheduler for the whole app. Screens register scopes (`useLiveQuotes(tickers,
cadence, events)`); a ticker shown by five components is requested once, at the fastest cadence any scope
asked for, in batches of 100.

| Scope | Cadence | Used by |
|---|---|---|
| detail | 20 s | the market screen's contract |
| game | 45 s | game board, player ladders, market-screen ladder |
| slate | 90 s | game-winner contracts of slate cards on screen |
| background | 180 s | inventory (new / closed contracts); finished games |

A provider may declare a minimum interval (feed: 60 s — it cannot change faster). Polling pauses while the
page is hidden or offline and when no scope is mounted; becoming visible or online refreshes the current
scope immediately. Failures back off exponentially (4 s → 5 min, jittered) and honour `Retry-After` on
429; each request times out after 8 s. Failures never erase a quote: the last-known-good observation
stays with its real time and ages honestly. Previously seen quotes persist in local storage (≤ 2,000) and
come back after a reload or an offline start with their original timestamps. An older observation never
overwrites a newer one.

Measured (e2e, fixture relay, 3 minutes on a 796-market game): 24 ticker batches (8 × 100 per 45 s poll;
the first poll is served by the inventory sweep) and 114 series listings (57 series × 2 sweeps).

### Market inventory

Four things are kept apart: the research record of a market (publication), its current quote, its current
availability, and the current inventory. Inventory is read per game from the provider (relay: one
`series_ticker=…&status=open` listing per series — a game spans ~157 event tickers but ~57 series, and a
series listing is shared by every game and user; feed: one file per game). Contracts the provider lists
under the game's own Kalshi events but the publication lacks appear under **Listed on Kalshi after this
research run** with Kalshi's wording and live quote only: no family, subject, model price or history is
invented, they link nowhere, and they are not put into packets. Only markets whose Kalshi event belongs to
a publication game are ever shown (the canonical mapping comes from the publication).

### Overlay rule

`src/live/overlay.ts`: per Kalshi ticker, the live observation replaces yes/no bid/ask, last, volume, open
interest, status and `captured_at` **only if it is at least as new as** the publication's capture. Model
prices, price history, market_probability and provenance stay from the publication; the research row is
kept (the market screen shows both the quote source and the research row's capture time).

### Cache behaviour and the service worker

* Research documents: in-memory memo + 10-minute background revalidation; service worker NetworkFirst
  (live roots) / StaleWhileRevalidate (bundled snapshot) — unchanged.
* Live-quote feed: service worker **NetworkOnly** (never answered from cached bytes); requests use
  `cache: 'no-cache'` (CDN revalidation).
* Relay: no service-worker route at all (never intercepted); requests use `cache: 'no-store'`.
* `scripts/check-dist.mjs` fails the build if the service worker routes the feed any other way, mentions a
  Kalshi host, or the bundle contains anything resembling a trading credential or order/portfolio endpoint.

Offline: research already opened still renders; previously seen quotes stay visible, marked by their true
age; the offline banner says quotes are not refreshing; nothing claims freshness because bytes are cached.
Returning online refreshes the current scope immediately (tested).

### Diagnostics

*Data & provenance → Live market quotes* shows mode, provider, which provider answered, online/visible,
last request / success / error, latency, backoff, request/batch counts, tickers requested / refreshed /
failed / missing, scopes on screen, quotes held and the oldest, and the cadences. The source banner carries
a compact live-quote status chip. No header or credential is ever shown (none exists).

## The handicap packet (`src/packet/`)

A line-for-line TypeScript port of `kalshi-bet-router/contract/edge_finder_contract/packet.py`
(packet 1.0.0): same scopes (GAME, SLATE, CUSTOM tray), same evidence order, same trim order, same
clipboard text, same deterministic `packet_id`. `tests/packet.golden.test.ts` compares it byte for byte
with packets the Python builder produced from the same publication (`scripts/make_golden_packets.py`).
The protocols are vendored unchanged in `src/contract/protocols/`. The packet is built with
`generated_at = now`, so market/model freshness in the packet is the freshness at build time.

### Packet preflight

Before a packet is built (`src/views/Packet.tsx`, `src/live/preflight.ts`):

1. `packetScopeMarkets()` returns exactly the markets the packet will carry (same scope code as
   `buildPacket`: GAME, SLATE window, or CUSTOM tray including focused markets from other games);
2. one forced, de-duplicated refresh of those tickers, bounded at 8 s (never hangs; whatever arrived counts);
3. per market, the newest trustworthy quote (overlay rule);
4. counts by freshness and availability, oldest relevant quote, failures, not-listed tickers;
5. `buildPacket(…, { live })` with `generatedAt = now`.

The Packet screen shows **Market refresh: PASS / PARTIAL / FAIL / UNAVAILABLE**, refreshed time, markets
refreshed, oldest relevant quote, fresh/aging/stale/unknown, not open, not listed, and a *Refresh &
rebuild* control (and a warning if the packet was built more than 5 minutes ago).

**Compatibility.** The live inputs change values, never the format: market rows carry the refreshed
`yes_bid/yes_ask/last/captured_at/market_status`; their `freshness` uses the market-quote policy (the
contract's freshness module explicitly allows per-consumer thresholds); preflight findings (refresh
failures, stale/unknown quotes, contracts not open, not listed) go into the existing `quality.missing`
list (rendered on the existing `MISSING:` line) and the live source into `quality.sources`. Without live
inputs the builder is byte-identical to `packet.py` — the golden tests are unchanged and still pass. The
contract's text has no per-market status column, so availability can only be expressed through the
MISSING line; a packet-level preflight block would need a contract change and is deliberately not invented.

COPY FOR CHATGPT is a separate tap after the build, because iOS only allows clipboard writes inside a user
gesture. Fallbacks: text selection, the share sheet, or a `.txt` download.

## PWA

`manifest.webmanifest` (name *Sift Sports Intelligence*, short name *Sift*, standalone, dark theme, 192/512/
maskable/apple-touch icons). The service worker precaches the app shell (JS, CSS, fonts, icons) and caches
research data network-first (live roots) or stale-while-revalidate (bundled snapshot). Research data is never
precached. Offline, every document you already opened still renders, with an offline banner.

## QA — Sift tests itself

| Layer | What | Where |
|---|---|---|
| Unit / integration (Vitest) | contract, golden packets, freshness boundaries, store (cadence, sharing, batching, visibility, offline, backoff, Retry-After, timeouts, LKG, persistence), providers on a real Kalshi payload, relay, feed publisher end to end, packet preflight K.1–8, screens on the market clock, research revalidation | `tests/` |
| Acceptance journey | HOME → … → COPY FOR CHATGPT, preflight PASS, copy button never under the bottom bar | `e2e/journey.spec.ts` |
| Market gates 1–10 | 46¢ → 51¢ without redeploy, away/back, background/foreground, outage LKG + aging, status, packet preflight, request budget, offline → online, inventory | `e2e/live-market.spec.ts` |
| Degraded states | provider down, feed fallback, one missing, unknown timestamp, partial refresh, closed/suspended, research unavailable, bad schema, live vs snapshot, offline research, slow provider | `e2e/degraded.spec.ts` |
| Accessibility | axe-core WCAG 2.0/2.1 A+AA on 11 screens; gate: zero critical/serious; moderate findings attached to the report; exceptions list (empty) in the spec | `e2e/a11y.spec.ts` |
| Responsive smoke | 8 screens: no horizontal overflow, bottom bar on screen, footer reachable, chart labels inside the screen, touch targets, packet controls not covered, tray sheet on screen, safe area, clipboard fallback | `e2e/smoke.spec.ts` |
| Visual regression | 11 screens (home, slate, game, game markets, team, metric, ranking, player, market, tray, packet) | `e2e/visual.spec.ts` |

**Matrix** (`playwright.config.ts`): Chromium phone 390×844 and desktop 1280×900 run everything; WebKit
iPhone 15 Pro (393×852, touch) runs the journey, market gates tagged `@live`, visual and smoke; WebKit
iPhone SE 3rd gen (375×667) runs smoke. Chromium success is not taken as Safari success. Known
harness limit: Playwright's Linux WebKit build crashes on `page.reload()` late in the long journey (isolated
reloads after the same screens pass — the deep-link test reloads on WebKit), so the WebKit journey checks
tray persistence with a fresh page load instead. 320 px (first-generation SE) is outside the matrix; it
overflows by 2–12 px on slate/game/metric.

**Determinism.** External hosts are blocked; the e2e build points the relay at
`https://relay.sift.invalid/kalshi` (a reserved TLD) which `e2e/fixtures.ts` answers from the bundled NFL
publication with prices/status/failures each test sets. Time is Playwright's clock.

**Console / page errors.** An auto fixture fails any test on an unexpected `console.error`, uncaught page
error, failed same-origin asset load or HTTP ≥ 400 asset. The only allowlisted noise is a network error
for a host the test deliberately blocks or fails (raw.githubusercontent.com, relay.sift.invalid,
chatgpt.com); one test additionally allows the 404 it injects itself, at the call site.

**Visual baselines.** Rendered on GitHub's Linux runners (`.github/workflows/visual-baselines.yml`, run by
a commit message containing `[update-visual-baselines]` or manually) and committed under
`e2e/__screenshots__/<project>/`; review them in the PR diff. Fixed clock, fixture quotes, fonts loaded,
animations off; threshold `maxDiffPixelRatio 0.01`. Phones compare viewport shots (a full-page capture
would include fixed layers mid-page).

**Real provider.** `live-provider-smoke.yml` (every 6 hours + manual, non-blocking: a third-party outage
must never block a Sift change) probes Kalshi from a runner and from real Chromium/WebKit pages on the
Pages origin. The live-quote feed workflow is itself a real read every 5 minutes.

## Deployment

* `.github/workflows/ci.yml` — on every PR/branch push: install, lint, typecheck, unit/integration tests,
  production build (`build:e2e`), Pages build check (`scripts/check-dist.mjs`), the Playwright suite in
  Chromium and WebKit.
* `.github/workflows/live-quotes.yml` — the market clock's quote feed: a ~55-minute loop publishing every
  3 minutes that dispatches its successor (cron every 10 minutes restarts a broken chain). No deploy.
* `.github/workflows/live-provider-smoke.yml` — every 6 hours: non-blocking real-provider probe.
* `.github/workflows/visual-baselines.yml` — on demand: render visual baselines on CI runners.
* `.github/workflows/production-check.yml` — after every deploy (and on demand): the **live** site in real
  Chromium (phone) and WebKit (iPhone) with live quotes from the feed, no fixtures: game prices live and
  FRESH/AGING, live-quote status running, packet preflight PASS/PARTIAL, no page or console errors
  (`scripts/production-check.mjs`). With `SIFT_QUOTE_RELAY_URL` set it also requires: relay first and
  feed second in the chain, answered by `kalshi-relay`, mode LIVE, FRESH prices, every relay request 200,
  no feed request on the main path, preflight PASS; then a forced relay 429 (in that browser only) must
  give FEED with honest freshness, the 429 named in Status, a completed preflight and no errors, and LIVE
  must return once the relay answers. A second job runs `scripts/relay-smoke.mjs` against the relay and,
  as a control, against Kalshi directly from the same runner.
* `.github/workflows/relay-smoke.yml` — on demand: the measured rate-limit smoke (1 · 10 sequential ·
  20 burst · 100-ticker batches · a 3-game refresh cycle) for any relay URL, or Kalshi directly.
* `.github/workflows/deploy.yml` — on push to `main`, every 3 hours and on demand: runs the full CI suite,
  rebuilds the NFL snapshot (no-op once NFL publishes its own explorer), builds with base
  `/sift-sports-intelligence/` (and `VITE_SIFT_QUOTE_RELAY_URL` from the optional repository variable),
  deploys with `actions/deploy-pages`. A red suite never deploys.

## Security (read-only)

Sift observes markets; it never trades. No Kalshi credential exists in the app, the relay or the feed
(all three use public, unauthenticated GETs of `/markets`), the relay refuses every path but `/markets`,
and the dist check rejects credential-like strings and order/portfolio endpoints in the bundle. No order,
wager, bankroll or betting-authority path is read or written.

## Accessibility

Semantic landmarks and headings; every interactive element is a link or button with a label; visible focus
rings; 44 px touch targets; charts have `role="img"` summaries, keyboard navigation (trend: ←/→), and a table
view; identity is never color-only (glyphs ●◐◌○ for states, labels on every chip, legends on every chart);
`prefers-reduced-motion` and `forced-colors` are respected. `--text-3` (labels) is ≥ 4.5:1 on every
surface it sits on (it measured 3.85:1 before the axe gate), and charts whose marks are links use
`role="group"`, not `role="img"`. Every quote chip says its state in words, never by color alone.
