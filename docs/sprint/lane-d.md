# Lane D: game scripts and betting markets (repair sprint, 2026-10-11)

Branch `sprint/lane-d`, worktree `/home/user/lanes/d`. Base `66aad3f`. Screenshots are real-data renders of the
production bundle against the live publications, in `docs/screenshots/2026-10-11/lane-d/`.

## Issues

| # | Issue | Status | What changed | Files |
|---|---|---|---|---|
| 8 | Team-specific game scripts | IMPLEMENTED | **NFL:** every title names a team. "Close Game Either Way" is now "<underdog> Keep It Close". CFB names use singular verbs ("Iowa State Wins Big"). The canonical bucket is unchanged. **NHL:** the control scripts read "Blues control and pull away". Tricodes in sentences become place names ("St. Louis holds…"). "One team" names both clubs. Mid-sentence lowercasing keeps team names. **Soccer:** "Home control / Away chase" now reads "Arsenal in control / Leeds United fight back". Definitions say the club names. **CFB:** engine titles already named teams, and the survivor and expression labels now read in team words ("UAB to win"). Script-tab range text uses nicknames. | `lib/scripts.ts`, new `lib/scriptNames.ts`, `lib/nhl.ts` (decode hook), `lib/soccer.ts` (decode hook), `lib/nhlStory.ts`, `views/nhl/parts.tsx`, `views/nhl/story.tsx`, `views/soccer/SoccerMatch.tsx`, `views/game/ScriptTab.tsx` |
| 13 | Concise script descriptions | IMPLEMENTED | NFL `GameScript.line` is one short sentence that names the team ("Bears by 14 or more."). The conditional-volume clause moved to the new `GameScript.detail`, which opens one tap down ("How it plays"). CFB script cards show the first sentence of the summary, and the selected script puts the rest under "More" (`splitSentence`). The publication's open questions are one line each, with "Why it matters" one tap down. | `lib/scripts.ts`, `lib/scriptNames.ts`, `ScriptTab.tsx`, `ScriptEngine.tsx`, `lines.tsx` |
| 14 | Multiple market expressions per script | IMPLEMENTED (NFL; CFB already had it; NHL keeps its per-script lifts) | NFL "Ways to bet <script>" lists, by family: the moneyline that always wins in the script, and two spreads that always win (the line nearest even money and the longest line that still always wins). It also lists up to 4 player props (one per player) that lean with the script's **team** volume (attempts move ±5% or more). The YES side is shown when volume goes up, and the NO side at its NO ask when it goes down. Props are labelled "Volume lean: a direction, not a script price". Every row shows the side's executable price and its age. Families with nothing linked are named; for example, totals have no points-by-script output. | new `lib/scriptExpressions.ts`, `views/game/ScriptSurvivors.tsx` (`ExpressionList`), `ScriptTab.tsx` |
| 16 | Prominent multi-script survivors | IMPLEMENTED | A survivor board sits at the **top** of the NFL, CFB and NHL script tabs, the NFL Markets tab (as the best-supported fallback) and the NHL Markets tab. Each row reads "Survives N of M scripts" with the share those scripts hold (where shares are published). Script chips show which scripts each contract survives (✓ / ◐ / ✕), along with the side's ask and its age. Ladder rungs with the same pattern are folded. Every board carries a same-game-is-one-exposure note. NFL survivors are exact margin fits, CFB uses the engine's published compatibility (counts, never %), and NHL uses the publication's survival bits (goal scorers excluded). | `lib/scriptExpressions.ts` (`multiScriptSurvivors`), `ScriptSurvivors.tsx` (`SurvivorBoard`), `ScriptTab.tsx`, `ScriptEngine.tsx`, `nhl/story.tsx` (`NhlSurvivors`), `nhl/NhlGame.tsx`, `MarketIntel.tsx` |
| 28 | Team logos in script-survival visuals | IMPLEMENTED | Each survivor chip and each bar in the script chart carries the leading team's logo (NFL, CFB and NHL logos through `TeamMark`). Neutral scripts get a colour dot. | `ScriptSurvivors.tsx` |
| 29 | Interactive simulation graphics | IMPLEMENTED (NFL, NHL) | "How the simulations split": one bar per script, with the logo, share and most-likely tag. Hovering, focusing or tapping a bar shows a readout: the tight line, the margin range, the volume lean and how many priced contracts always win in that script. Choosing a bar selects that script (deep link). The selected script lights up its chips in the survivor board and drives "Ways to bet". The bars stack on phones. CFB has no chart: its scripts are ranked, not shared. | `ScriptSurvivors.tsx` (`ScriptShareChart`), `ScriptTab.tsx`, `nhl/story.tsx` (`NhlScriptChart`) |
| 37 | Better market navigation | IMPLEMENTED | **Game Markets board:** a sticky section nav (tabs plus search), a second row of kind chips per section (Moneyline / Spread / Total…, or a stat for props), and one search across every section, grouped by section. **Markets tab:** the rail is sticky on wide screens and gains Price moves and a teaser link. **Intelligence → Market board:** market-type chips and a Browse / Full cards view toggle. | `components/MarketBoard.tsx`, `MarketIntel.tsx`, `views/Markets.tsx`, `styles/lane-d-markets.css` |
| 38 | Functional market-category filters | IMPLEMENTED + TESTED | Every filter was checked. The old "Top Markets by Script Fit" chips counted every contract but listed only model-priced ones, so props and other chips opened empty tables. The new `TopMarkets` has chip counts equal to exactly what each chip shows. The board search used to search only the current tab; it now spans every section. Unit tests cover section tabs, kind chips, search, Top Markets chips (each chip shows only its family and never opens empty) and market-board category chips. | `MarketIntel.tsx` (`TopMarkets`, `topMarketRows`), `MarketBoard.tsx` (`filterGroups`, `kindOf`), `lib/marketBrowse.ts`, `tests/marketFilters.test.tsx` |
| 39 | Redesigned Market Comparison Studio | IMPLEMENTED | The studio is one side-by-side table with a sticky row header and a replaceable column picker. Rows: price; freshness (age and price state); break-even after fee (with the fee); model probability (or "Not published"); edge after fee; bet-up-to; authority (decision word, authority word and basis); model record; strongest counterargument; and a correlation warning ("Cannot win together with …" from `correlation.ts`, or "Same game: one exposure, not diversification"). The game verdict-strip studio uses the same component. | `views/intel/MarketCompare.tsx`, new `styles/lane-d-compare.css` |
| 40 | Kalshi-inspired browsing; discoverable teaser research | IMPLEMENTED | **Market board (Browse, the default):** one card per game in the documented ranking order. Contracts are shown in betting words with a Yes/No price button, break-even, model probability where published and freshness. "+N related" is shown, and the same-game exposure is noted. The board shows 12 games, with "Show all". Category chips filter it. "Full cards" keeps the original research cards. **Game board:** each row shows YES and NO asks beside the exact YES bid/ask. **Teasers discoverable:** links on the Market board, the game Markets rail and the Parlays page header. **Parlays:** "Stanford Wong" spelling fixed. Each leg shows the real Kalshi contract that settles the teased line on its own: YES on "fav by more than 1.5", or NO on "fav by more than 8.5" for an underdog. Only an exact rung is used, the quote is overlaid live with its age, and legs are never multiplied together. Same-game legs are flagged as correlated, and the existing correlation logic is untouched. | `views/Markets.tsx` (`BrowseBoard`), `lib/marketBrowse.ts`, `MarketBoard.tsx`, `Parlays.tsx`, `MarketIntel.tsx`, `SportHome.tsx` (typo only) |
| 41 | Price movements; unresolved questions | IMPLEMENTED | "How prices moved" on the Markets tab covers the publication's biggest movers plus the main moneyline, spread and total. Each line reads like "Opened 51¢ Sep 29 · now 53¢ · up 2¢ in 12 days", with a sparkline (open point and current point) and the change. Empty-book captures (0¢ bid / $1 ask) are skipped, so nothing ever "opens at 0¢". A newer live midpoint extends the series. "What would change the read" lists the publication's open questions, one line each. The market page gains the same plain-words sentence and the range above its price chart. This replaced the old "Open questions & price moves" stratum. | new `lib/priceMoves.ts`, `views/game/lines.tsx` (`PriceMovesPanel`, `Spark`), `views/Market.tsx`, `views/Game.tsx` |

## Integrity

- No probability, projection, price, stake or edge was invented. Script fit stays exact only for margin-settled markets. Props are labelled as direction only.
- CFB scripts remain ranked and are never priced (counts, not %).
- NHL survival is the publication's own survival bit.
- Unchanged: `src/opportunity/*`, `src/live/*`, freshness gates, executable-price checks, authority levels and the correlation logic. Opportunity cards and the studio read their fields as before.
- No minimum number of bets is forced. Empty states say what is missing ("No priced margin contract wins in every game of two or more scripts").

## Tests

- New: `tests/scriptNames.test.ts` (5), `tests/scriptExpressions.test.ts` (5), `tests/marketFilters.test.tsx` (7), `tests/priceMoves.test.ts` (4). `tests/scripts.test.ts` gained a team-naming / tight-line test. Updated `tests/scripts.test.ts` and `tests/screens.test.tsx` for the "Keep It Close" title.
- e2e: `e2e/soccer.spec.ts` now asserts the Browse view first (event card with break-even, integrity lede), then opens "Full cards" for the research-card checks.
- Results:
  - `npm run lint` and `npm run typecheck` are clean (typecheck also ran through `tsc -b` in `build:e2e`).
  - `npx vitest run`: 71 files, 815/815 passed. Under heavy machine load (load average around 30 from the parallel lanes), `tests/scriptEngine.test.tsx › a game without a read…` sometimes hits its own 4 s `findByText` timeout. It passes alone and is unrelated to this lane.
- Playwright (`--project=desktop --project=phone --grep-invert @visual`, port 4204):
  - Run 1: soccer, live-market, smoke, cfb, nhl, football, verdict, rebuild, degraded and journey specs.
  - Run 2: nhl, verdict, journey, a11y, closure, closure2, tennis, mlb, nba, cbb, context, game-scroll, hero and nfl-home specs.
  - The first runs found a real regression: the new compare table pushed phone pages sideways (an absolutely positioned screen-reader span escaped the scroll box). It is fixed (`.lsc__scroll { position: relative }`).
  - The re-run of every affected spec (nhl, verdict, hero, mlb, tennis) passed 94/94.
  - Only remaining failure: `e2e/journey.spec.ts` "…packet on the clipboard" on both projects, with "clipboard Read permission denied". The spec grants clipboard permission only to origin `http://localhost:4173`, so any `SIFT_E2E_PORT` other than 4173 fails. This is an environment issue from the parallel-port change, not this lane's code; the integrator should make the origin follow the port.

## Screenshots (`docs/screenshots/2026-10-11/lane-d/`)

before-nfl-script-tab-1440 · before-nfl-markets-tab-1440 · after-nfl-script-survivors-chart-1440 ·
after-nfl-top-markets-price-moves-1440 · after-nfl-market-board-nav-1440 · after-market-board-browse-1440 ·
after-nfl-parlays-1440 · after-nhl-survivors-chart-1440 · after-cfb-script-survivors-1440 ·
after-phone-script-chart-390 · after-phone-ways-to-bet-390 · after-phone-survivors-390 · after-phone-browse-390 ·
after-compare-studio-1440 · after-phone-compare-studio-390

## Cross-lane edits (surgical)

- `src/views/Game.tsx` (unowned):
  - removed `SurvivorsPanel` from the Script tab (the board replaces it);
  - Markets tab: `MarketsPanel` is replaced by `TopMarkets`, and the old `Unusual` stratum by `PriceMovesPanel`;
  - market history now loads on the Markets tab too;
  - the dead `Unusual` function and unused imports were removed.
- `src/lib/nhl.ts`, `src/lib/soccer.ts`: one decode hook each to name the teams.
- `src/lib/nhlStory.ts`, `src/views/nhl/parts.tsx`: lowercasing via `scriptLower`.
- `src/views/nhl/NhlGame.tsx`: survivor board and chart on the Script and Markets tabs.
- `src/views/soccer/SoccerMatch.tsx`: the counter-case uses the team-named title.
- `src/views/SportHome.tsx`: "Stafford" → "Stanford" (one word).
- `e2e/soccer.spec.ts`: Browse view first, then Full cards.
- `docs/SLATE_PRIORITIES.md`: title table and example.
- `panels.tsx` (lane C) is not edited. Its `SurvivorsPanel` and `MarketsPanel` are simply no longer used by the NFL Script and Markets tabs. `LineHistoryPanel` is unchanged.

## For the integrator

- Lane C's Dashboard `ScriptsCard` and the home tiles show `GameScript.line`, which is now a tight team-named sentence. The volume clause is in `GameScript.detail`.
- The `GameScript.story` contract is unchanged.
- The Market board defaults to Browse. Any e2e that expects `.opp` cards on `/intelligence/markets` must click "Full cards" first; `soccer.spec.ts` is updated.
- Visual baselines touching the game Markets board, Script tab and Market board will change; they need re-rendering on CI.

## Remaining limitations

- No soccer survivor board. The publication counts supporting scripts by its own threshold, and Sift would have to recompute it from conditional edges, so none is shown.
- CFB has no share chart, because its scripts are ranked, not shared.
- Totals and team totals cannot be linked to NFL scripts until the simulation publishes points by script.
