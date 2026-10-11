# SIFT overnight repair sprint — 52-item tracker (2026-10-11)

Branch: `claude/sift-overnight-repair-sprint-2o8mmb` (all repositories). Baseline: `main` @ `558c592` (PR #54).
Baseline checks: lint clean, typecheck clean, `npm test` 793/793 passing, desktop smoke e2e 15/15.

The owner's brief numbered 52 issues and grouped them into six lanes, each with a deliverable list. The brief
does not include the issue text itself, so each row's *Issue* column is the lane deliverable that number is
matched to. That matching is an inference; correct any row that is wrong and the owner lane will follow up.

Statuses: **FIXED AND VERIFIED** (in production, checked) · **IMPLEMENTED, NOT DEPLOYED** · **PARTIAL** ·
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

| # | Issue (matched lane deliverable) | Owner | Files | Status | Test evidence | Deploy | Remaining limitations |
|---|---|---|---|---|---|---|---|
| 1 | Improved hero presentations | A | | NOT STARTED | | | |
| 2 | More informative game cards | E | | NOT STARTED | | | |
| 3 | Correct indoor/outdoor weather handling (e.g. weather shown for a roofed stadium) | F | | NOT STARTED | | | |
| 4 | Dedicated Player Prop Explorer navigation | B | | NOT STARTED | | | |
| 5 | Accessible basic statistics | C | | NOT STARTED | | | |
| 6 | Clearly labeled units and denominators | C | | NOT STARTED | | | |
| 7 | Opponent-adjusted / raw toggle | C | | NOT STARTED | | | |
| 8 | Team-specific game scripts | D | | NOT STARTED | | | |
| 9 | Team-color-responsive design | A | | NOT STARTED | | | |
| 10 | Flexible offense-versus-defense comparisons | C | | NOT STARTED | | | |
| 11 | Relevant game imagery (no unrelated photos) | A | | NOT STARTED | | | |
| 12 | Cleaner typography and visual hierarchy | A | | NOT STARTED | | | |
| 13 | More concise script descriptions | D | | NOT STARTED | | | |
| 14 | Multiple relevant market expressions per script | D | | NOT STARTED | | | |
| 15 | Reduced unnecessary copy | A | | NOT STARTED | | | |
| 16 | Prominent multi-script survivors | D | | NOT STARTED | | | |
| 17 | Player-grouped prop market presentation | B | | NOT STARTED | | | |
| 18 | Accurate roof and venue information | F | | NOT STARTED | | | |
| 19 | Rankings on game cards where applicable | E | | NOT STARTED | | | |
| 20 | Improved home-page structure and continuity | E (+A) | | NOT STARTED | | | |
| 21 | Contextual best-market indicators where validated | E | | NOT STARTED | | | |
| 22 | Horizontal prop market carousel / discovery | B (+E) | | NOT STARTED | | | |
| 23 | Readable unit-by-unit analysis | C | | NOT STARTED | | | |
| 24 | More prominent scheme tendencies | C | | NOT STARTED | | | |
| 25 | Scheme-to-player matchup intelligence | C | | NOT STARTED | | | |
| 26 | Improved team comparisons | C | | NOT STARTED | | | |
| 27 | Correct scroll and navigation behavior | A | | NOT STARTED | | | |
| 28 | Team logos in script-survival visualizations | D | | NOT STARTED | | | |
| 29 | Improved interactive simulation graphics | D | | NOT STARTED | | | |
| 30 | Interactive player performance charts | B | | NOT STARTED | | | |
| 31 | Last 5 / Last 10 / Season / historical filters | B | | NOT STARTED | | | |
| 32 | Hit-rate and over/under indicators (correct threshold, eligible games) | B | | NOT STARTED | | | |
| 33 | Injury-source freshness and provenance | F | | NOT STARTED | | | |
| 34 | Depth-chart-style player presentation | C | | NOT STARTED | | | |
| 35 | Remove developer-facing repository jargon | F | | NOT STARTED | | | |
| 36 | Team identity / imagery quality (branded graphics when no photo) | A | | NOT STARTED | | | |
| 37 | Better market navigation | D | | NOT STARTED | | | |
| 38 | Functional market-category filters | D | | NOT STARTED | | | |
| 39 | Redesigned Market Comparison Studio | D | | NOT STARTED | | | |
| 40 | Kalshi-inspired browsing; discoverable Wong teaser/parlay research | D | | NOT STARTED | | | |
| 41 | Useful price movements and unresolved questions | D | | NOT STARTED | | | |
| 42 | Supporting prop metrics and prominent matchup explanations | B | | NOT STARTED | | | |
| 43 | Meaningful data-availability states (replace "partial") | F | | NOT STARTED | | | |
| 44 | Research Lab replaces ambiguous Explore labeling | E | | NOT STARTED | | | |
| 45 | Redesigned research navigation | E | | NOT STARTED | | | |
| 46 | Better weekly matchup presentation | E | | NOT STARTED | | | |
| 47 | Better statistical visualizations | C | | NOT STARTED | | | |
| 48 | Top-props board with multi-select and add-to-board | B | | NOT STARTED | | | |
| 49 | Correct per-game statistics (no relabelled percentages); box-stacking vs RB opportunity | C | | NOT STARTED | | | |
| 50 | Historical scores, winners and spread results | E | | NOT STARTED | | | |
| 51 | Intelligence cards connect observations to research, in-place summaries | E | | NOT STARTED | | | |
| 52 | Full Intelligence-page audit and fixes | E | | NOT STARTED | | | |

## Progress log

- 06:45Z — baseline verified; lanes defined; Playwright port made configurable (`SIFT_E2E_PORT`) so lanes can
  run e2e in parallel; `scripts/dev-shot.mjs` renders real-data screenshots through the session proxy.
