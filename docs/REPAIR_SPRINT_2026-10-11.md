# SIFT overnight repair sprint — 52-item tracker (2026-10-11)

Branch: `claude/sift-overnight-repair-sprint-2o8mmb` (all repositories). Baseline: `main` @ `558c592` (PR #54).
Baseline checks: lint clean, typecheck clean, `npm test` 793/793 passing, desktop smoke e2e 15/15.

The owner's brief numbered 52 issues and grouped them into six lanes, each with a deliverable list. The brief
does not include the issue text itself, so each row's *Issue* column is the lane deliverable that number is
matched to. That matching is an inference; correct any row that is wrong and the owner lane will follow up.

Statuses: **FIXED AND VERIFIED** (deployed, and its check in `scripts/sprint-production-check.mjs` passed against the live site) · **IMPLEMENTED, NOT DEPLOYED** · **PARTIAL** ·
**BLOCKED** · **NOT STARTED**.

Environment note: this session's network policy denies `chmoses98.github.io`, so production is checked by the
repository's own `production-check.yml` workflow (it runs after every Pages deploy, in real Chromium and WebKit
against the live site), plus real-data screenshots of the same production bundle rendered locally against the
live sport publications (`raw.githubusercontent.com`).

## Lane ownership (file boundaries)

| Lane | Owns | Issues |
|---|---|---|
| A · Visual system & navigation | `components/Shell.tsx`, `lib/destinations.ts`, `components/HeroArt.tsx`, `lib/hero/*`, `views/game/Hero.tsx` (outside the weather block), `broadcast/parts.tsx` `FeaturedHero`, `styles/tokens.css`, `hero.css`, `broadcast.css`, `shell.css`, `fidelity-game.css`, App `Root` scroll | 1, 9, 11, 12, 15, 27, 36 (+20 with E) |
| B · Player Prop Explorer | `views/explore/PropExplorerView.tsx`, `views/props/*` (new), `views/game/CompactProps.tsx`, `views/game/PropsBoard.tsx`, `views/player/*`, `views/Player.tsx`, `styles/props.css`, the `/props` route | 4, 17, 22, 30, 31, 32, 42, 48 |
| C · Matchups, statistics, schemes | `views/game/Dashboard.tsx`, `panels.tsx`, `matters.tsx`, `HeroStats.tsx`, `CfbDashboard.tsx`, `CfbOverview.tsx`, `views/Team.tsx`, `Compare.tsx`, `Metric.tsx`, `Ranking.tsx`, `components/AdjustmentCompare.tsx`, `components/insight.tsx`, `src/insights/*`, `styles/insight.css` | 5, 6, 7, 10, 23, 24, 25, 26, 34, 47, 49 |
| D · Game scripts & markets | `views/game/Script*.tsx`, `MarketIntel.tsx`, `GameOpportunities.tsx`, `lines.tsx`, `views/intel/MarketCompare.tsx`, `views/Markets.tsx`, `Market.tsx`, `Parlays.tsx`, `components/MarketBoard.tsx`, `lib/scripts*.ts`, `lib/scriptMarkets.ts`, `styles/engine.css`, `opportunity.css` | 8, 13, 14, 16, 28, 29, 37, 38, 39, 40, 41 |
| E · Home, Research Lab, Intelligence | `views/Home.tsx`, `broadcast/GamesView.tsx`, `broadcast/games.ts`, `broadcast/parts.tsx` (except `FeaturedHero`), `views/explore/ExploreView.tsx`, `hub.tsx`, `SeasonView.tsx`, `views/intel/*` (except `MarketCompare.tsx`), `views/HistoricalGame.tsx`, `src/intelligence/*`, `styles/fidelity-home.css`, `fidelity-hubs.css` | 2, 19, 20, 21, 44, 45, 46, 50, 51, 52 (+22 with B) |
| F · Data integrity & quality | weather/roof/venue data and its block in `game/Hero.tsx`, injuries surfaces, `components/SourceBanner.tsx`, `LiveDiagnostics.tsx`, `views/Status.tsx`, availability/empty states, user-facing jargon outside other lanes' files | 3, 18, 33, 35, 43 |

New styles go in new lane-scoped CSS files to keep merges clean. Copy changes inside another lane's files are
handed to that lane (or applied at integration), never edited concurrently.

## Tracker

Per-lane detail (what changed, tests, screenshots, limitations): `docs/sprint/lane-a.md` … `lane-f.md`.

| # | Issue (matched lane deliverable) | Owner | Files / components | Status | Test evidence | Deploy | Remaining limitations |
|---|---|---|---|---|---|---|---|
| 1 | Improved hero presentations | A | broadcast/parts.tsx FeaturedHero, game/Hero.tsx, lib/hero/copy.ts, styles/lane-a-*.css | FIXED AND VERIFIED | lane-a e2e hero/nfl-home; vitest; shots lane-a/after-home-hero_* | live `e191d47` · production check run 38161043189: PASS | One-phrase model/market tags; caveats behind info buttons. |
| 2 | More informative game cards | E | broadcast/cardFacts.ts, GameCard.tsx, rail.tsx, games.ts | FIXED AND VERIFIED | tests/laneE.test.ts; e2e/lane-e.spec.ts; shots lane-e/home_*, games_* | live `e191d47` · production check run 38161043189: PASS | Records/ranks only where published (NFL, NHL). |
| 3 | Indoor/outdoor weather handling | F | lib/venue.ts venueWeather(), game/Hero.tsx weather fns, HeroStats weather tile, soccer weather line | FIXED AND VERIFIED | tests/venue.test.ts (21); dataIntegrity.test.tsx; shots lane-f/*retractable*, *london* | live `e191d47` · production check run 38161043189: PASS | Retractable roof status is never assumed; upstream NFL roof field empty for retractables (reported). |
| 4 | Dedicated Player Prop Explorer navigation | B (+A nav) | views/props/PropsHub.tsx, App.tsx /props, Shell/destinations Props tab, trail PROPS_STEP | FIXED AND VERIFIED | e2e/props-hub.spec.ts; rebuild.spec.ts six destinations; a11y /props | live `e191d47` · production check run 38161043189: PASS | MLB/NHL are entry points to game pages (no simulated player distributions published). |
| 5 | Accessible basic statistics | C | insights/basics.ts, MatchupTab, BasicsCard, Team page, TeamCompare; history builder box-score counts | FIXED AND VERIFIED | tests/laneC.stats.test.ts; shots lane-c/desktop-matchups-basics | live `e191d47` · production check run 38161043189: PASS | NFL only (other publications carry no box-score counts). |
| 6 | Units and denominators | C + wave 2 | insights/units.ts (NFL), insights/sportUnits.ts + components/StatUnit.tsx (NHL, soccer, CBB, CFB) | FIXED AND VERIFIED | laneC tests; tests/wave2.units.test.tsx (13); shots lane-c, wave2 | live `e191d47` · production check run 38161043189: PASS | NBA/tennis show the registry unit as published; non-NFL Metric/Ranking pages use the generic formatter. |
| 7 | Adjusted / raw toggle | C | state/statMode.ts, components/statviz.tsx | FIXED AND VERIFIED | laneC tests; shots lane-c | live `e191d47` · production check run 38161043189: PASS | Only where both values are published; otherwise "Raw only"/"Adjusted only". |
| 8 | Team-specific game scripts | D | lib/scriptNames.ts, lib/scripts.ts, nhl.ts, soccer.ts hooks, ScriptTab | FIXED AND VERIFIED | tests/scriptNames.test.ts, scripts.test.ts | live `e191d47` · production check run 38161043189: PASS | Kalshi one-letter club names spelled out everywhere contract titles render (wave 2). |
| 9 | Team-color-responsive design | A | lib/hero/accent.ts, heroes, script cards | FIXED AND VERIFIED | vitest accent; shots lane-a | live `e191d47` · production check run 38161043189: PASS | Team pages can adopt the same helper (not yet). |
| 10 | Flexible offense-vs-defense comparisons | C | views/stats/Builder.tsx | FIXED AND VERIFIED | laneC tests; shots lane-c/phone-build-a-matchup | live `e191d47` · production check run 38161043189: PASS | NFL. |
| 11 | Relevant game imagery | A | lib/player-image-blocklist.json, players.ts, scripts/players/fetch.mjs | FIXED AND VERIFIED | tests/playerImages.test.ts; shots lane-a/after-script-cards-branded-fallback | live `e191d47` · production check run 38161043189: PASS | 30 of 55 player photos removed (press conferences, draft, camp, old uniforms); 30 players need a game-day photo pinned. |
| 12 | Typography and visual hierarchy | A | styles/tokens.css, lane-a-type.css, DESIGN_SYSTEM.md | FIXED AND VERIFIED | e2e heading checks; shots lane-a/after-games-typography | live `e191d47` · production check run 38161043189: PASS |  |
| 13 | Concise script descriptions | D | lib/scripts.ts (line + detail) | FIXED AND VERIFIED | scripts.test.ts, screens.test.tsx | live `e191d47` · production check run 38161043189: PASS |  |
| 14 | Multiple market expressions per script | D | lib/scriptExpressions.ts, ScriptSurvivors.tsx | FIXED AND VERIFIED | tests/scriptExpressions.test.ts; shots lane-d/after-phone-ways-to-bet | live `e191d47` · production check run 38161043189: PASS | NFL; CFB already had it; totals cannot be linked until points-by-script are published. |
| 15 | Reduced unnecessary copy | A (+F) | Shell footer, hero caveats, plain labels | FIXED AND VERIFIED | shots lane-a | live `e191d47` · production check run 38161043189: PASS | Older sport screens still carry some long notes. |
| 16 | Prominent multi-script survivors | D | ScriptSurvivors.tsx (NFL/CFB/NHL) | FIXED AND VERIFIED | scriptExpressions tests; shots lane-d/*survivors* | live `e191d47` · production check run 38161043189: PASS | No soccer survivor board. |
| 17 | Player-grouped prop markets | B | views/props/model.ts groupByPlayer, PropExplorerView | FIXED AND VERIFIED | tests/propsModel.test.ts | live `e191d47` · production check run 38161043189: PASS |  |
| 18 | Accurate roof and venue information | F | lib/venueFacts.ts, views/status/DataFacts.tsx | FIXED AND VERIFIED | tests/venue.test.ts; shots lane-f/status-venues-roofs | live `e191d47` · production check run 38161043189: PASS | International surfaces marked "Not confirmed". |
| 19 | Rankings on game cards | E | cardFacts.ts | FIXED AND VERIFIED | laneE tests | live `e191d47` · production check run 38161043189: PASS | NFL and NHL; CFB publishes no rankings or polls. |
| 20 | Home structure and continuity | E + A | Home.tsx, FeaturedHero | FIXED AND VERIFIED | e2e rebuild/lane-e; shots lane-e/home_* | live `e191d47` · production check run 38161043189: PASS |  |
| 21 | Contextual best-market indicators (validated only) | E | cardFacts.ts indicator | FIXED AND VERIFIED | laneE tests | live `e191d47` · production check run 38161043189: PASS | "Back" only for ACTIONABLE; otherwise research tier word or "No edge". |
| 22 | Horizontal prop market carousel | B (+E link) | views/props/MarketCarousel.tsx | FIXED AND VERIFIED | tests/propsUi.test.tsx; e2e props-hub | live `e191d47` · production check run 38161043189: PASS |  |
| 23 | Readable unit-by-unit analysis | C | MatchupTab unit cards | FIXED AND VERIFIED | shots lane-c/desktop-matchups-unit-by-unit | live `e191d47` · production check run 38161043189: PASS | States what is not measured (OL grades, coverage). |
| 24 | Prominent scheme tendencies | C | scheme tendency board | FIXED AND VERIFIED | laneC tests | live `e191d47` · production check run 38161043189: PASS | Coverage shells not published for 2026. |
| 25 | Scheme-to-player matchup intelligence | C | scheme→player chain cards | FIXED AND VERIFIED | shots lane-c/desktop-matchups-scheme-players | live `e191d47` · production check run 38161043189: PASS | Observation only unless the publication flags ACTIONABLE. |
| 26 | Improved team comparisons | C | views/TeamCompare.tsx | FIXED AND VERIFIED | shots lane-c/desktop-team-compare* | live `e191d47` · production check run 38161043189: PASS |  |
| 27 | Scroll and navigation behavior | A | components/ScrollManager.tsx, lib/scroll.ts | FIXED AND VERIFIED | e2e/game-scroll.spec.ts 10/10 (new checks fail with the old ScrollRestoration) | live `e191d47` · production check run 38161043189: PASS |  |
| 28 | Team logos in script-survival visuals | D | ScriptSurvivors chips/bars | FIXED AND VERIFIED | shots lane-d | live `e191d47` · production check run 38161043189: PASS |  |
| 29 | Interactive simulation graphics | D | script split chart | FIXED AND VERIFIED | shots lane-d/after-phone-script-chart | live `e191d47` · production check run 38161043189: PASS | NFL, NHL (CFB scripts are ranked, not shared). |
| 30 | Interactive performance charts | B | views/props/PerfChart.tsx | FIXED AND VERIFIED | propsUi tests; shots lane-b/player-game-by-game | live `e191d47` · production check run 38161043189: PASS |  |
| 31 | Last 5 / 10 / season / historical filters | B | history/hitRate.ts windows | FIXED AND VERIFIED | tests/hitRate.test.ts (20) | live `e191d47` · production check run 38161043189: PASS |  |
| 32 | Hit-rate and over/under indicators | B | history/hitRate.ts; overview prop cards (integration) | FIXED AND VERIFIED | hitRate tests: half-point, pushes, zero-snap rows, cross-season | live `e191d47` · production check run 38161043189: PASS | History wording, never a probability. |
| 33 | Injury-source freshness and provenance | F | lib/injurySource.ts, components/InjurySource.tsx | FIXED AND VERIFIED | dataIntegrity tests; shots lane-f/injuries-provenance_* | live `e191d47` · production check run 38161043189: PASS | Age thresholds (6 h / 24 h) are a product choice. |
| 34 | Depth-chart player presentation | C | views/stats/DepthChart.tsx | FIXED AND VERIFIED | shots lane-c/desktop-depth-chart | live `e191d47` · production check run 38161043189: PASS | NFL. |
| 35 | Remove developer jargon | F (+integration) | lib/plainLabels.ts; copy across sport screens | FIXED AND VERIFIED | dataIntegrity tests | live `e191d47` · production check run 38161043189: PASS | Technical names kept on Data & provenance only. |
| 36 | Imagery quality / branded fallback | A | HeroArt branded graphic, CastLayer branded frame | FIXED AND VERIFIED | shots lane-a/after-game-hero-branded_* | live `e191d47` · production check run 38161043189: PASS |  |
| 37 | Better market navigation | D | MarketIntel sticky nav, search across sections | FIXED AND VERIFIED | tests/marketFilters.test.tsx | live `e191d47` · production check run 38161043189: PASS |  |
| 38 | Functional market-category filters | D | TopMarkets | FIXED AND VERIFIED | marketFilters tests (7) click every filter | live `e191d47` · production check run 38161043189: PASS | Fixed chips that counted contracts they did not list. |
| 39 | Redesigned Market Comparison Studio | D | views/intel/MarketCompare.tsx | FIXED AND VERIFIED | shots lane-d/after-compare-studio_* | live `e191d47` · production check run 38161043189: PASS |  |
| 40 | Kalshi-style browsing; discoverable Wong teasers | D | Markets.tsx Browse, Parlays.tsx | FIXED AND VERIFIED | e2e soccer/verdict; shots lane-d/after-market-board-browse | live `e191d47` · production check run 38161043189: PASS | Teaser legs never multiplied into a price. |
| 41 | Price movements and open questions | D | lib/priceMoves.ts, PriceMovesPanel | FIXED AND VERIFIED | tests/priceMoves.test.ts | live `e191d47` · production check run 38161043189: PASS |  |
| 42 | Supporting prop metrics and matchup explanation | B | Usage & role panel | FIXED AND VERIFIED | propsModel tests | live `e191d47` · production check run 38161043189: PASS | Routes run / YAC / per-play air yards not published (stated). |
| 43 | Meaningful data-availability states | F + wave 2 | QualityBadge, SourceBanner, DataState.tsx, LiveDiagnostics; soccer/NHL/CBB/CFB/tennis/NBA/MLB screens | FIXED AND VERIFIED | dataIntegrity tests; wave2 tests; shots wave2 | live `e191d47` · production check run 38161043189: PASS | Verbatim publication notes inside provenance disclosures stay as published. |
| 44 | Research Lab replaces Explore | E + A | destinations, ExploreView, trail | FIXED AND VERIFIED | e2e rebuild (h1 Research Lab) | live `e191d47` · production check run 38161043189: PASS |  |
| 45 | Redesigned research navigation | E | views/explore/labTools.ts | FIXED AND VERIFIED | laneE tests | live `e191d47` · production check run 38161043189: PASS |  |
| 46 | Weekly matchup presentation | E | SeasonView week tiles | FIXED AND VERIFIED | shots lane-e/season-week_* | live `e191d47` · production check run 38161043189: PASS | NFL. |
| 47 | Better statistical visualizations | C | components/statviz.tsx | FIXED AND VERIFIED | shots lane-c | live `e191d47` · production check run 38161043189: PASS |  |
| 48 | Top-props board with multi-select | B | views/props/TopProps.tsx | FIXED AND VERIFIED | propsUi tests; shots lane-b/props-hub-phone-multiselect | live `e191d47` · production check run 38161043189: PASS | Lines outside the 5th–95th sim range are set aside, never ranked. |
| 49 | Per-game stat correctness; box stacking vs RB | C | insights/basics.ts, label audit | FIXED AND VERIFIED | laneC tests | live `e191d47` · production check run 38161043189: PASS | Box-stacking relationship found weak (r≈0.01): shown as observation only. |
| 50 | Historical scores, winners, spread results | E | scripts/history/build-nfl-schedule.mjs, history/league.ts | FIXED AND VERIFIED | laneE tests; shots lane-e/historical-game-ats | live `e191d47` · production check run 38161043189: PASS | NFL only; closing lines only for finals; other sports publish no scores/lines. |
| 51 | Intelligence cards lead to research | E | intelligence/discoveries.ts meaning/leads | FIXED AND VERIFIED | laneE tests; shots lane-e/home-discovery-open | live `e191d47` · production check run 38161043189: PASS |  |
| 52 | Full Intelligence-page audit | E | intel/* | FIXED AND VERIFIED | e2e lane-e, a11y | live `e191d47` · production check run 38161043189: PASS | Nine defects found and fixed (see docs/sprint/lane-e.md). |

## Production verification (final)

- Production: `main` @ `e191d47` (PRs #56–#59), deployed by run 38159541698.
- Production check run 38161043189 (after that deploy, against the live site):
  - `production-check.mjs`: passed (slate CURRENT; market clock, relay fallback, NHL, MLB, destinations).
  - `sprint-production-check.mjs`: 223 PASS · 0 N/A · 1 FAIL. Every item's checks passed on Chromium desktop
    (93) and Chromium phone (110); the WebKit iPhone pass (nav, Home, hero, roof, overflow) passed 20. The one FAIL was
    WebKit reporting a failed request to raw.githubusercontent.com ("due to access control checks") as a page error;
    the app catches that rejection, and the check now excludes exactly that network message (PR #60).
  - `cfb-production-check.mjs`: 546 ok, 3 FAIL. All three are one stale pattern: the check counted CFB ranks written
    "#12/130", and wave 2 writes them "#12 of 130". The same game shows all 104 ranks (checked on the deployed build
    with live data). The pattern now accepts both forms (PR #60).

## Progress log

- 06:45Z — baseline verified; lanes defined; Playwright port made configurable (`SIFT_E2E_PORT`) so lanes can
  run e2e in parallel; `scripts/dev-shot.mjs` renders real-data screenshots through the session proxy.
