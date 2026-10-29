# Next-generation SIFT: architectural handoff

Prepared 2026-10-25 from the repositories as they are. Nothing here starts implementation: screens are approved one at a time first.
Constraints this plan respects: about 10 focused hours a week, a $100-250 monthly operating budget, minimal manual intervention.

**Principle: keep the intelligence, replace the experience.** The nine sport and router repositories already produce validated, public, schema-versioned documents on a schedule. The new app is a new reader of those documents.

## 1. Backend to reuse (all keep running; evidence as of 2026-10-25 01:13 UTC)

| Repository | Produces | Scheduled workflows | Latest publication |
|---|---|---|---|
| `nfl-edge-finder` | NFL board/health/explorer (`handicap-reports`), projections (`projection-data`), Kalshi capture, context (weather, injuries, availability), settlement, preflight | 28 of 35 | health 4.4 h old; projections 832 players, 13 games |
| `cfb-edge-finder` | board/explorer (`main`), CFB Script Engine, research signals (`research-signals`), projections, Kalshi catalog | 6 of 20 | health 0.2 h; projections 780 players, 14 games; signals 0.0 h |
| `nba-edge-finder` | board/explorer (`data-archive`), projections, point-in-time injury reports, capture worker, watchdog | 8 of 19 | health 0.0 h; projections 2,436 player rows, 10 games |
| `NHL-edge-finder` | board/explorer, projections, slate watch, capture worker | 7 of 18 | health 0.1 h; projections 292 players |
| `edge-finder-api` | MLB board/explorer plus EdgeLab: Kalshi snapshots, closing lines, CLV, settlement, daily reports and heartbeat | 27 of 55 | health 0.3 h; MLB projections empty (no slate) |
| `soccer-edge-finder`, `cbb-edge-finder`, `Tennis-Edge-Finder` | board/explorer per sport, Kalshi capture, settlement | 8, 9, 5 | health 0.1-0.2 h each |
| `kalshi-bet-router` | `sports_registry.json` (app-data), wager delivery/settlement, router health | 5 of 14 | registry is a static file dated 2026-10-02 |
| `sift-sports-intelligence` (this repo) | quote feed (`live-quotes` branch), read-only quote relay, team-logo workflow, projection feed monitor, Production check (runs after each deploy) | 4 of 15 | monitor green on its last 7 scheduled runs |

About 105 scheduled workflows in total. All ten repositories were pushed to within the hour. In the two repositories this session could query for run outcomes, `nba-edge-finder` had 72 successes, 24 concurrency-cancelled and 0 failures in its last 100 scheduled runs. Run outcomes for the other eight could not be sampled without attaching them with write credentials, so they were not; their publication ages above are the evidence.

All data is public (`raw.githubusercontent.com`, CORS `*`). Infrastructure cost today is $0: public repositories get free Actions minutes, Pages is free, the relay fits Vercel Hobby.

## 2. Data contracts the new frontend needs
* `edge_finder.app.v1`: `health.json`, `board.json`, `event_detail/<id>.json`, `explorer/index.json` (a file table; clients never guess a path), plus `recommendations`, `metrics`, `theses`, `model_prices`, `markets`, `manifest`. Documents with another `schema_version` are rejected. All eight sports now publish an explorer (HTTP 200 for each today).
* `sift.projections.v1` (+ `sift.projection_distributions.v1`, `sift.projection_foundation.sport_summary.v1`, `sift.prospective_scorecard.v1`, `sift.absolute_evidence.v1`, `sift.promotion_evidence.v1`): per player/stat mean, range, thresholds, gate, participation.
* Authority: `projectionApprovals.ts` decides which engine is authoritative per sport and family; `projectionAuthority.ts` resolves exactly one projection per player/stat, or a stated reason for none. **This is the "one authoritative projection" requirement, already implemented and tested.**
* `sift.live_quotes.v1` (quote feed) and the relay: Kalshi quotes with their real observation time.
* Identity: `scripts/teams/*`, `public/teams` (5.3 MB of logos), `cfb-teams.json`, `curation/players`.
* Not formal contracts yet: game scripts and thesis documents, the CFB signals file, the router registry. They are consumed by shape, not by schema.

## 3. What needs adaptation
* **Typed contract package.** Decoders live inside app code (`src/lib/projections.ts`, `src/data/*`, `src/contract`). Extract them with fixtures and contract tests so a publisher change fails a test, not a screen.
* **Live scores** (`src/live/scores`): sound architecture (providers, identity matching, freshness), but it is wired to the v4 opt-in and its licensing assumptions (section 7, risk 1).
* **Spreads and totals**: today they exist as Kalshi `SPREAD`/`TOTAL` contracts (`src/lib/marketKind.ts`), that is market-implied, not a sportsbook line. The requirement "visible game spreads and totals" needs a decision on source (risk 2).
* **Tray/Board storage** (`src/packet`, key `sift.researchTray.v1`): keep the format so saved items carry over.
* **Relay**: Vercel Hobby is a non-commercial tier. Fine now; move to Cloudflare Workers (about $5/month) or paid Vercel if the product becomes commercial.

## 4. Obsolete frontend-only code (identify now, delete later, never during the freeze)
* `src/views` classic interface and the SIFT 2.0 design views: 135 files, 25,682 lines. v4: `src/v4`, 4,600 lines.
* `public/heroes` (74 MB) and the hero workflows; `public/data/nfl` (49 MB NFL snapshot) and `scripts/refresh-nfl-snapshot.sh`: obsolete because NFL now publishes its own explorer (HTTP 200 today).
* The 3-hourly deploy rebuild (largely there to refresh that snapshot), the visual baselines, and the Playwright suites tied to old screens (43 + 3 specs). The Production check and the projection monitor are *operational* checks and stay with the backend.
* Reusable, not obsolete: `src/lib` projection/market/script modules (9,781 lines), `src/live` (2,901), `src/opportunity`, `src/insights`, `src/history`, `src/contract`, `src/packet` and their unit tests (125 test files, many of which test exactly these modules).

## 5. Building it separately, without disturbing v4
1. New repository (suggest `chmoses98/sift`) with its own Pages site or Cloudflare Pages project and URL. v4 stays where it is, frozen. Nothing in this repository changes.
2. First commit: a `packages/core` extracted from the reusable modules above with their tests copied alongside (history preserved with `git subtree split`), so the new app starts with the validated logic and its test suite.
3. The app reads only published documents; it never reaches into a sport repository's code. Cutover is a link or DNS change when the new app is accepted.
4. Keep the stack unless a screen spec forces otherwise (Vite, React, TypeScript; Geist and Sora fonts are already dependencies): this is what lets `packages/core` carry over without a rewrite.
5. Carry over the interaction rule learned from v4: **no content may be inserted above something tappable after first paint**, with the tap telemetry harness (`e2e/fixtures.ts`) in CI from day one; and cache Playwright browsers in CI (the runner image's apt mirror once took 45 minutes).

## 6. Practical screen-by-screen order (proposed; each needs a spec and your approval before code)
0. **Foundations (no screen):** repo, tokens (midnight palette), `packages/core`, contract tests, tap-telemetry CI.
1. **Slate / Games:** live scores, followed games, spreads and totals. It is the anchor and exposes both data risks first.
2. **Game page:** concise SIFT intelligence on top, game script and matchup research one tap down, Kalshi markets inline.
3. **Player page:** the authoritative projection, availability, opponent-adjusted context.
4. **Props explorer:** filters over the same projection authority.
5. **Followed / Board:** migrates the existing tray.
6. **Search, Settings, Status:** the reliability and source-freshness pages.
Ordering reason: screens 1 and 2 carry the two unresolved data decisions; the rest reuse their plumbing.

## 7. Genuine risks and dependencies
1. **Live-score licensing (blocking for "live scores as a core experience").** Per `docs/LIVE_SCORES_REAL.md`, only NBA (SportScore, attribution badge) and finished tennis matches are covered by a feed's own terms for the current personal, non-commercial use. NFL, CFB, NHL and MLB have no feed a browser may use; ESPN, MLB and NHL terms are personal/non-commercial only. A premium app needs a licensed feed. This is a budget line to price now, within $100-250/month.
2. **Spreads and totals source.** Decide whether Kalshi-implied lines are acceptable and how they are labelled, or whether a licensed odds feed is wanted (and affordable).
3. **Public-hosting limits.** Raw GitHub reads have no SLA and cache for minutes. Fine for research; revisit with a CDN mirror if scale or reliability needs grow.
4. **Schema drift** across eight publishers is guarded only by `schema_version`; section 3's contract package mitigates it.
5. **Projection state.** Only approved engines are authoritative; NBA's seven-family promotion is deliberately postponed (#143), so NBA remains research-preview. The established-model fallback has no data source for NBA players today.
6. **Maintainer time.** About 105 scheduled workflows is a lot to watch at 10 hours a week; the existing watchdogs, heartbeats and the Production check are what make that sustainable, and are why they must not be disturbed.
7. **iOS reality.** Native feel comes from an installed PWA; reliable push alerts for followed games need web push on installed PWAs (iOS 16.4+). A native wrapper is a later decision, not a Foundations item.
8. **Kalshi data terms for a premium product** have not been re-read here; verify before launch.

## Recommended first step
Not code: **resolve the two data decisions** (a licensed live-score source for the sports that matter first, and the spread/total source), because they determine Screen 1. In parallel, write the Screen 1 specification for your approval; Foundations (section 6, item 0) starts when that spec is approved.
