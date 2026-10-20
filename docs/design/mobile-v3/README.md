# SIFT mobile design direction, concept v3

Status: **design phase, for approval.** Nothing under `src/`, `public/` or any workflow was changed. No merge, no deploy.

> **Refinement (October 20):** Home and Game were redesigned around a sports-companion-first brief. See [`refinement/README.md`](refinement/README.md) for the current direction and [`LIVE_DATA_AUDIT.md`](LIVE_DATA_AUDIT.md) for the missing live data. Sections 3 and 8 below describe the first concept and are superseded where they differ (Intel is now Signals; the game tabs are Live, Matchups, Players, Markets).

Live, interactive canvas (Claude Design, private to the owner): https://claude.ai/artifact/HhTd3AprDr8CtBV8V3dvE4
Press Play on a phone board to use it. Rendered phone captures are in `screenshots/` (390 by 844, 2x). The artboard sources are in `source/` for reference.

## 1. Audit of the current phone experience

Captured in Chromium at iPhone 15 Pro size (393 by 852) on the SIFT 2.0 build and the classic build, with the repository's own fixtures.

| Area | Finding (measured) | v3 response |
|---|---|---|
| Layout | Featured Players is a panel holding two-column tiles holding chips. Same 1 px blue border and large radius on every layer. | One full-width grouped list per section. Hairlines and space carry structure. |
| Information density | The run-game mismatch (#1 vs #21) is stated in the Game Read, the Key Matchup Drivers and the Matchup Advantages on one Overview. Classic build tiles truncate their own text ("NE-BUF · researc…"). | Each fact once, as a rank duel. |
| Navigation | Seven or more game tabs scroll sideways (eight in the classic build). 3.5 are visible and "Game Scripts" is cut mid-word. Sport is chosen from a menu and again from chips. | Four text tabs that always fit. One sport filter, in the content. |
| Typography | 134 distinct `font-size` values across 55 stylesheets. Wide-tracked blue eyebrows on every block. | Ten sizes. Condensed capitals for names and numerals, Barlow for reading. |
| Spacing | In Featured Players the panel sits 9 px from the screen edge and the player name 32 px in. | One 16 px gutter. 44 px minimum targets. |
| Hierarchy | Everything is outlined in the same blue. About three quarters of the Home screen passes before one game row. The game hero takes about 40% of the screen before any research. | Model is ice, market is gold, risk is coral. Home hero 284 px. Game hero 318 px, then research. |

Player names set over crowd photographs also make legibility depend on the picture. The v3 Players tab uses a round crop and puts text on ink.

## 2. The direction

* **Color means source.** Model `#62C9FF`, market `#F2BE45`, risk `#FF9170`, live `#FF4D5E`, fresh and pass `#4BE0A0`. Ink `#06090F`, lists `#0B121B`, sheets `#111B28`. Text `#F4F7FB`, `#A9B9CA`, `#8497AB`. Team colors appear only inside rank duels and the script spectrum.
* **Type.** Barlow and Barlow Condensed, already shipped. Scale: 56, 44, 28, 24, 20, 16, 15, 13, 12, 11 px. Condensed capitals for names and tabular numerals. No third face.
* **Surfaces.** Ink ground, one full-width grouped list per section, one raised surface (the research sheet). The hero is edge to edge, lit by team identity. No stadium photo is used for a game it does not belong to.
* **Motion.** Sheet height, header collapse and selection dimming only. Reduced-motion should disable all three in production.

## 3. The three concepts

1. **Home** (`Main.dc.html`). Title and date, one sport filter, a game-of-the-day hero (model and market side by side), three SIFT Signals with the gauge, an honest NFL pass row, and a slate grouped by start time. In-play games show their start time and a red group label. They never show a score. Tapping the hero opens the game, a signal opens its sheet, chips filter the slate.
2. **Game Command Center** (`Game.dc.html`, NE @ BUF, real fixture data). Hero collapses into a sticky header. Four tabs: **Read** (headline, model vs Kalshi table, script spectrum with selectable scripts, three biggest mismatches, availability, links), **Matchups** (five duels, filter by which team has the edge), **Players** (Allen, Maye, Cook, Moore with the Kalshi ladder beside the research-only shadow price, projection against line), **Markets** (to win, spread, total, with a price-format switch: cents, implied, US, decimal).
3. **SIFT Signal and research sheet** (`Signal.dc.html`). A compact signal row (title, model %, break-even, gauge). The sheet has half and full stops (tap or drag the handle), the gauge at large size, the fee equation (`29¢ ask + 1.4¢ fee = 30.4¢`), three figures (model minus break-even, worst-case edge, share of draws positive), a research-only warning, and three tabs: **Why** (what could make it lose, then plain English), **Price**, **Sources**. **Copy for ChatGPT** and **Add to My Board** stay pinned.

## 4. Research integrity carried over

* A gap is never called an edge. The model figure, its range, the worst case and the research-only warning sit beside the price. The warning adds one derived sentence: whether the low end of the model range clears break-even.
* Simulation shares are labelled "Share of simulated games. Not calibrated probabilities."
* Quote, model, lineup and reference freshness are listed separately (Sources tab). Lineup "stale" and "unavailable" are different states.
* No score, clock or period is shown. The publication contract has none.
* Missing values explain themselves ("SIFT publishes no model price for spreads or totals on this game").
* A pass is a designed state: Home row, NFL filter on Signals, "NO EDGE" verdict wording on the Game Read.
* The provider's native price stays in cents underneath the format switch. Fees are never folded into the ask.

## 5. Path into the React/PWA app (proposal, not started)

| Concept piece | Likely home in the repo | Change needed |
|---|---|---|
| Tab bar (Home, Games, Props, Intel, Board) | `src/components/sift2/Navigation.tsx`, `src/lib/destinations.ts` | Visual only. Labels and routes unchanged. |
| Home hero, slate | `components/sift2/FeaturedGame.tsx`, `GameList.tsx`, `CommandOverview.tsx`, `views/Sift2Workspace.tsx` | Restyle, move to one grouped list, group by start time. |
| Signal row and sheet | `src/opportunity/*` (`Opportunity`, `PriceIntel`, `Confidence`, `lifecycle.ts`, `live.ts`), `components/BottomSheet.tsx`, `src/packet/*` | Sheet needs a half/full stop. Everything it shows exists on `Opportunity`: `price.ask/fee/breakEven/fair/fairLow/fairHigh/betUpTo/availableSize/state/observedAt`, `rank.worstCaseEdge`, `confidence.edgeShare/calibration`, `risk`, `evidence`, `status/authority/statusReason`, `phase`. Per-source freshness list needs the freshness map the soccer recommendations already carry. |
| Game hero, tabs | `src/views/game/Hero.tsx`, `GameTabs.tsx`, `GameReadV2.tsx` | Four-tab group; Scripts, Props, Injuries and Trends become sections or links inside the four. |
| Script spectrum | `src/lib/scripts.ts` | Presentation only. Order for the bar is by margin, list stays most likely first. |
| Duels | `MatchupTab.tsx`, `src/lib/rank.ts` | Presentation only: strength is `33 - rank`. |
| Players ladder | `PropsBoard.tsx`, `CompactProps.tsx` | Ladder rung shows ask and `shadow_v2_p_yes`. Show it only for research-only rows already published. |
| Price format switch | none exists | New preference (cents, implied, US, decimal). Planned in `docs/sift-2.0/BLUEPRINT.md`. |
| Tokens | `src/styles/sift2-tokens.css` | Adds model, market and risk roles and re-bases the canvas from `#07111f` to `#06090F`. Opt-in per screen, like the existing SIFT 2.0 tokens. |

Suggested sequence, one small PR each, all behind the existing SIFT 2.0 route: tokens and tab bar, Home, Signals list and sheet, Game hero and tabs, Players and Markets. Each PR carries the existing Playwright mobile, accessibility and visual suites.

## 6. What in the concept is real and what is not

Real, from repository fixtures: NE @ BUF (teams, records, kickoff, venue, weather, projection 22 to 29, model win probability 74%, Kalshi asks, script shares 13/36/24/26, five unit ranks, A.J. Brown status, prop lines, projections, ladders and shadow prices); the three soccer signals (asks, fees, break-evens, model probabilities and ranges, worst-case edges, draw shares, freshness, opposing factors, ticker, size, thesis numbers).

Not real: non-NFL slate rows (MLB, NHL, NBA, CFB) are examples that match the counts in the repository's slate fixtures. Soccer crests are monogram discs. Soccer dates (Oct 9 and 10) sit beside an Oct 4 slate. Cook and Moore show initials because the repository has no photo of them.

## 7. Limits of this phase

* Checked in Chromium at 390 by 844 (the audit captures used the iPhone 15 Pro profile). WebKit and iPhone SE (375) were not run. The 375 layout needs a pass.
* No accessibility scan was run on the prototype. Production `BottomSheet` already handles focus and Escape. The prototype sheet does not.
* Dark theme only.
* The official Frontend Design skill was not available in this session. The work used the Claude Design canvas and the Artifact design guidance.

## 8. Decisions needed

1. Accept the color-means-source rule (ice, gold, coral) as the new visual spine.
2. Accept four game tabs and where Scripts, Props, Injuries and Trends move.
3. Name for the signals destination. The concept keeps "Intel" in the tab bar and uses "Signals" as the page title.
4. Price format switch: approve as a new preference.
5. Approve moving to the implementation sequence above.
