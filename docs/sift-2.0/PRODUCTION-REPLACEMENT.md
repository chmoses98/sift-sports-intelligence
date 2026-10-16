# SIFT 2.0 — production replacement readiness (October 16)

Status: **prepared, not merged, not deployed.** Production is `main` at `c0b6df69` (PR #85), served by the Pages workflow `deploy.yml`. This branch is a pure fast-forward of it (40 commits ahead, 0 behind), so replacing production is one merge with no conflicts.

## What "replacement" means in this build

- SIFT 2.0 stays under `/design/sift2/…`. **Classic addresses answer with SIFT 2.0**: `src/App.tsx` wraps every classic route in `UiGate`, which redirects `#/`, `#/games`, `#/props`, `#/explore`, `#/intelligence`, `#/board`, `#/status`, `#/<sport>`, `#/<sport>/game/<id>` and the rest to their SIFT 2.0 equivalents (query strings kept). Old bookmarks, the PWA `start_url` and shared links therefore keep working.
- **Escape hatch:** `#/?ui=classic` keeps the classic interface in that browser (remembered in `localStorage`); `#/?ui=default` returns to SIFT 2.0. The classic code remains in the bundle. The post-deploy monitors use it (below).
- The deploy workflow is **unchanged**. The default comes from code (`src/lib/uiMode.ts`); the legacy acceptance suite builds with `VITE_SIFT_UI=classic` (`npm run build:e2e`). CI gained one step that builds and tests the release configuration (`npm run build:e2e:default`, `playwright.default.config.ts`, `e2e-default/`).

## Feature parity (production `c0b6df69` vs this branch)

Method: diff of every changed production source file (138 files; about 120 differ by the routing-adapter import only), the shared data/quote/relay code (`src/data`, `src/live`, `src/opportunity`, `relay/`: unchanged apart from a `useAsync` stale-key race fix), the route tables, the per-sport browser journeys (CI), and a read of every replaced screen. Legend: **Full** = same component and logic as production; **Changed** = replaced screen, capability kept; **Partial** = something from the old screen is no longer on it (where reachable, said); **Research-only** = by design, calibration-gated, unchanged.

| Capability | Result | Notes |
|---|---|---|
| All eight sports, their homes and game pages | Full | NFL, NHL, CFB, MLB, NBA, CBB, Soccer, Tennis route to the same specialist views; 32 journey checks (home, game, deep research on desktop, phone, iPhone, iPhone SE) pass in CI. |
| Team, player, metric, ranking, compare, season, slate, parlays, scorecard, market pages | Full | Same components under `/design/sift2/<sport>/…`; every route in the old table has a SIFT 2.0 counterpart. |
| Opponent-adjusted research and matchup analysis | Full / Changed | Matchup, Unit-by-unit, scheme and stats tabs unchanged. NFL overview now leads with a plain-English Game Read plus the full "What Matters" evidence behind a disclosure. |
| Game scripts and scenario analysis | Full, Research-only | Script tab, compare, survivors and markets unchanged. Script shares stay "simulation shares, not calibrated probabilities"; the close-win split stays withheld unless the publication authorises it (PR #85 is in the base). |
| Player props, projections, history | Full | Prop Explorer, top-props board (now with the opponent-adjusted context line), alt ladders, game logs and hit rates are the production components. NFL has the full explorer; MLB and NHL props remain on game pages, exactly as in production. Projection-vs-line stays labelled research, never EV. |
| Kalshi markets, prices, research integration | Full | Markets tab, market pages, packet and market board are unchanged. NFL overview: the old Markets card became a compact snapshot; the live-quote chip is restored, a Handicap packet link is restored. |
| Live quote handling and relay | Full | No changes to `src/live`, the relay, feed or freshness logic. CI proves LIVE, FEED fallback, stale and failed states against fixtures. |
| Sport-specific statistical tools | Full | NHL/MLB/CBB/Soccer/Tennis/CFB specialist views reused unchanged. |
| Intelligence and discovery | Changed | Terminal, Market board, Model Pulse, Model Lab reused. Data-quality notices now sort after research and read "Data quality"; rows show the evidence instead of a repeated caveat. |
| Research Lab | Full | The same `ExploreView`. |
| My Board, search, settings, sources/status, news, tray | Full | Same views, SIFT 2.0 shell. Saved research is not migrated or discarded (same storage keys). |
| Home | Partial | Restored in this pass: sport filter on today's games, Tomorrow link, validated-market indicator on game cards (same wording rules: only an actionable row or the publication's top research candidate, "No edge" for judged games, nothing otherwise). **Not on SIFT 2.0 Home**: the model's and market's read lines on cards (on the game page), the NFL "Matchup edges" bars, the Lab tool tiles, the My Board preview, and the flagged-opportunities count. All remain one tap away through navigation. |
| Games page | Changed | Date strip, sport and status filters replace the classic day tabs; legacy `?day=tomorrow` links are mapped. |
| Mobile | Changed | Bottom bar: Home, Games, Props, Intelligence, My Board; search, sports and board in the header. Research Lab is **not** on the phone bottom bar (the classic phone bar had it); it is reachable from the Home card and, added in this pass, from the header Sports sheet next to Model Pulse, News, Data & provenance and Settings. CI passes phone, iPhone and iPhone SE with overflow and accessibility checks. |

**No important capability is missing.** The Home items above are the only partial ones and I judge them acceptable for first use; restoring them is a follow-up, not a precondition.

## Verification (this tree)

- Lint, typecheck: clean. Unit/integration: 100 files, **1,112 tests passed** (new: UI gate routing, discovery ordering).
- Production-style `npm run build` and `scripts/check-dist.mjs` (base path, manifest, service worker, 404 fallback, hash routing, assets): **OK**.
- Release configuration (`e2e-default`): **31 passed** (1 phone-only test skipped on desktop) on desktop and phone Chromium: root opens SIFT 2.0 Home; ten classic addresses incl. deep game links redirect, survive refresh, keep query strings; `?ui=classic` and `?ui=default`; legacy `?day=tomorrow` opens tomorrow; unknown address renders without error; on phone, Research Lab, Settings and Sources open from the Sports sheet. CI additionally runs it on WebKit iPhone.
- SIFT 2.0 browser specs (workspace, reference, release, props hub, smoke, time) and the classic journey/live-market/degraded specs on the classic build: passed locally on Chromium (desktop and phone) before the final push; **full four-project CI is the reference** (local screenshot comparisons differ from the CI-rendered baselines identically on the untouched production commit, so they are not used).
- Data contracts and feeds: no contract code changed; `pure-contract` and golden-packet tests pass. From the repo's own automation on production today (October 15, GitHub runners): Kalshi's API answers directly (53 requests, median quote age 0.5 s; 429 only in the deliberate 20-request burst) and the quote relay smoke job passed.

## Not verified, and why

- **Nothing was exercised on the deployed Pages origin.** This environment cannot open `github.io`, the Vercel relay or the Pages site. Live feed loading and relay CORS from the real origin are inherited from production (same origin, same code) but not re-observed for this build.
- **The existing post-deploy "Production check" is already red on production** (three consecutive runs on `c0b6df69`): its sprint step expects the close-win split that PR #85 intentionally withholds (4 failures of 251), plus a failure in the main step whose log I did not read. This predates and is independent of this change. After cutover it still runs the classic screens through `?ui=classic`, so it keeps proving the shared quote/relay layer; it does not test SIFT 2.0 screens. A SIFT 2.0 live smoke is a follow-up.
- Today's scheduled deploy (run 115) **failed on one flaky iPhone WebKit live-market test** (1 of 744) on `main`'s own commit; the earlier deploy kept serving. The deploy gate runs the full suite, so a deploy, including a rollback deploy, may need a re-run of failed jobs.
- WebKit/iPhone for the new release-configuration spec runs for the first time in CI.

## Rollback plan

Restore point: **`main` @ `c0b6df69`** (immutable history; the last successful production deploys are runs 112–114).

1. **Per-browser, instant:** `…/sift-sports-intelligence/#/?ui=classic` shows the classic interface in that browser (no deploy).
2. **Site-wide (about 40 to 45 minutes, gated by CI):** open a PR on `main` that reverts the merge commit (`git revert -m 1 <merge sha>`) and merge it. `deploy.yml` redeploys the previous interface. If its CI gate trips on the known live-market flake, re-run failed jobs.
3. **Proven restorable:** I rebuilt exactly `c0b6df69` from a clean checkout (`npm ci`, `npm run build`) and `scripts/check-dist.mjs` passed (base path, manifest, service worker, 404 fallback), i.e. the old version reproduces and passes the same release gate.
4. After any cutover or rollback, the PWA service worker (`registerType: autoUpdate`) replaces cached assets on the next load; an installed iPhone web app picks up the new version after one relaunch.

## Cutover steps (after your approval)

1. Retarget or open one PR from `sift-2.0-research-workspace` into `main` (fast-forward; the stacked PRs #86 to #92 are subsumed). Required: CI green on that PR.
2. Merge. `deploy.yml` builds and deploys; **Production check** runs afterwards.
3. Open `https://chmoses98.github.io/sift-sports-intelligence/` on iPhone and desktop and confirm Home, a game, Props, Intelligence and Lab load with live data.
4. If anything important is wrong: rollback step 2.
