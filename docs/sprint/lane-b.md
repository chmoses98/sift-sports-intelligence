# Lane B — Player Prop Explorer (repair sprint 2026-10-11)

Branch `sprint/lane-b` (worktree `/home/user/lanes/b`), on `66aad3f`. Not pushed. Real-data screenshots:
`docs/screenshots/2026-10-11/lane-b/`. The PR #55 contract (`claude/w2-prop-explorer-contract`) was read only, for
naming. Nothing from it is imported or promoted.

## Issues

| # | Status | What changed | Main files |
|---|---|---|---|
| 4 Dedicated explorer navigation | IMPLEMENTED | Top-level `/props` route: one lazy import and one route line in `App.tsx`. Sport cards: **NFL** is the full explorer, with a strip of games that each open `/nfl/props?game=…` and the top-props board. **MLB** and **NHL** are labelled "Props on game pages". They list upcoming games, count each game's player markets by reading its event detail, and link to the game's Player props tab (MLB) or Markets tab (NHL). `/nfl/props` still works. Lane A adds the nav link. | `src/views/props/PropsHub.tsx`, `src/App.tsx` |
| 17 Player-grouped markets | IMPLEMENTED | The explorer rail lists players, not player×stat rows. Each player card holds all his markets. The analysis adds an "All <player> markets" carousel (every stat with its main line, asks, alternate-line count and hit dots). Pure `groupByPlayer`. On phones the rail becomes a strip of player chips, and the full carousel sits in the analysis. | `views/props/model.ts`, `views/explore/PropExplorerView.tsx` |
| 22 Horizontal market carousel | IMPLEMENTED | `MarketCarousel`: CSS scroll-snap, swipe on touch, arrow buttons on fine pointers (disabled at the ends, hidden under 560 px), ←/→/Home/End keyboard movement, the selected tile kept in view, `aria-pressed` tiles. | `views/props/MarketCarousel.tsx` |
| 30 Interactive performance charts | IMPLEMENTED | `PerfChart` (d3-scale, real pixel width). One bar per game played, against today's line: over is blue ▲, under red ▼, push gold =. A dashed gold threshold line. Today's projection is drawn with its middle-50% band. Hover, tap or keyboard (←/→/Esc) shows a tooltip with opponent, date, score, value and result. A table view sits one tap down. Used in the explorer and on the player page's "Game by Game". | `views/props/PerfChart.tsx`, `views/Player.tsx` |
| 31 Last 5 / Last 10 / Season / historical | IMPLEMENTED | Windows: Last 5, Last 10 (both span seasons), this season, last season and All (shown only when it adds games across two seasons). Each window button shows its n of eligible games. A window is the last N games **played**. | `history/hitRate.ts` |
| 32 Hit rate and over/under | IMPLEMENTED | An eligible game is one he played with the stat recorded. Rows with zero offensive snaps (special teams only or inactive) are skipped and reported. Where no snap count was joined, a recorded touch counts as having played. Over is value > line, under is value < line, and a **push** (equal to the line) is counted on its own. The comparison is always with the CURRENT line. Wording is "4 of 10 over 199.5" or "Last 10: 4/10 over", plus the n and "History against today's line, not a probability". Dots are a compact indicator. Every ladder rung shows its Last 5 / Last 10 / season counts. The game Props tab ("Last N played") and the player page use the same rule. | `history/hitRate.ts`, `views/props/HitRate.tsx`, `views/game/PropsBoard.tsx` |
| 42 Supporting metrics and matchup | IMPLEMENTED | "Usage & role" for the selected window, using only game-log fields: snap share, targets per game, target share, air-yard share, catch rate, carries, yards per carry, attempts, completion rate and sacks. Shares stay percentages, and each metric carries its basis ("242 yards on 51 carries"). Routes, yards after contact and per-play air yards are stated as not published. The player header carries the matchup in one plain sentence from the player's side ("The Jaguars pass defense ranks #6 of 30, better than most: a tough draw for Hurts's passing yards."). The unit-by-unit card stays. | `views/props/model.ts` (`supportMetrics`, `matchupSentence`) |
| 48 Top-props board | IMPLEMENTED | `/props` ranks every priced NFL prop on the coming slate by one criterion the viewer picks. **Projection vs line**: \|projection − line\| in widths of the published middle-50% range, labelled **Research** with the publication's research-only word. **Last 10 history**: the larger of games over and games under, as a share of games played, with n ≥ 5, labelled **History**, never a chance. Rows can be ticked, and "Add N to My Board" saves each one through the existing research tray (`useTray().add`, the same MARKET item a single Save makes). Props of games already kicked off are refused and counted. Saved rows show "On My Board". Integrity guards: a main line outside the simulated 5th–95th range is a **role disagreement**, set aside and never ranked (live example: a backup QB projected at 9 yards against a 224.5 line), and the explorer flags it too. Touchdown ladders rank only under their own filter. History rows show a role change in the last two games (`roleShift`). | `views/props/TopProps.tsx`, `views/props/model.ts` |

## Test evidence
- `npm run lint` and `npm run typecheck` are clean. `npx vitest run`: **831/831** (70 files). New: `tests/hitRate.test.ts` (20: half-point lines, whole-number lines with pushes, float tolerance, negative values, zero-snap rows skipped, missing snap joins, non-zero values that override a 0-snap join, no-stat games, Last 5 skipping, short samples, cross-season windows, a re-read at a different line, windows offered with their n). `tests/propsModel.test.ts` (12, on a real game: grouping, matchup words, support metrics, gap ranking with role disagreements and touchdowns kept apart, history ranking, history wording). `tests/propsUi.test.tsx` (6: chart colouring, tooltip by click and keyboard, table view, no "chance" wording, carousel selection and keyboard). One run hit a timeout in `tests/scriptEngine.test.tsx` (CFB, another lane's area) under machine load of about 40. It passes when run alone and passed in the next full run.
- Playwright (desktop + phone, Chromium, `--grep-invert @visual`, port 4202): `props-hub`, `rebuild`, `a11y`, `closure2`, `football`, `context`: **109 passed, 1 skipped**. The one failure found on that run (a hit-rate race against game-log loading) was fixed (`f417a58`). After the fix, `props-hub` + `rebuild` passed 20/20 and the hit-rate test passed 3/3 with `--repeat-each`. New spec `e2e/props-hub.spec.ts` covers ranking words, multi-select → My Board (2 items), history wording, row → explorer, and MLB/NHL entry points. axe on `/props` was added.
- Tests updated to the new correct behaviour: `e2e/rebuild.spec.ts` (the explorer journey now asserts player grouping, carousel selection and keyboard; the new hit-rate journey). `e2e/closure2.spec.ts` (player page: the new chart, "n = 5 games played", window tabs named with their n).

## Screenshots (`docs/screenshots/2026-10-11/lane-b/`, live publications)
`before-nfl-props-1440.jpg`, `after-nfl-props-1440.jpg`, `after-nfl-props-phone-strip.jpg`, `after-phone-filters-and-player.jpg`,
`props-hub-1440.jpg`, `props-hub-history-1440.jpg`, `props-hub-phone.jpg`, `props-hub-phone-multiselect.jpg`,
`player-game-by-game-1440.jpg`, `props-hub-mlb-1440.jpg`.

## Remaining limitations
- MLB and NHL have no combined explorer. Their publications carry no simulated player distributions or per-prop opponent ranks. Today NHL lists no player markets, and the hub says so.
- The history layer is NFL only, so hit rates and charts are NFL only.
- The top-props board reads every pregame game's research and detail (about 28 static documents). The history ranking fetches one game log per player, on demand.
- The player page main line can differ from the explorer's for a while, because the player page overlays live quotes and the explorer uses the publication's capture. Both pick the rung nearest 50¢. This predates the sprint.
- The visual baselines for `props` (`e2e/visual.spec.ts`) will change and must be re-rendered on CI.

## Commits
- `47b97c4` Prop explorer: player-grouped markets, market carousel, hit rates vs today's line, game-log chart, usage & role
- `b9f5424` Props hub at /props and the top-props board with multi-select to My Board
- `2bde92d` Tests for the prop explorer model and components
- `4ca773d` Player page and game props tab: eligible-game hit rates, the interactive game-log chart vs today's line
- `ead2f07` Prop explorer polish: phone filters one tap away, history ranking keeps touchdowns apart and flags role changes
- `f417a58` Prop explorer: loading state for game logs instead of 'no game log' while they arrive
- (this report)

## Cross-lane edits
- `src/App.tsx`: +2 lines (the lazy import and `{ path: 'props', element: <PropsHubView /> }`). Root scroll is untouched.
- `e2e/a11y.spec.ts`: +1 line (`props-hub` route in the axe list).
- `docs/INSIGHTS.md`: new section "Hit rates and the Player Prop Explorer" (before "News").
- Nothing in lane C's files was edited. `views/game/matters.tsx` (lane C) still computes the overview prop cards' "last 5" from raw rows (`hitRecord(windowRows(...,'last5'))`), so a zero-snap row there counts as a 0. Suggested follow-up for lane C: use `hitRate(pregameRows(...), def, line, 'last5')` from `src/history/hitRate.ts`.

## For the integrator
- New files: `src/history/hitRate.ts`, `src/views/props/{PropsHub,TopProps,MarketCarousel,PerfChart,HitRate,model,useHits}.ts(x)`, `src/styles/lane-b-props.css` (imported from the components, not from `main.tsx`), `e2e/props-hub.spec.ts`, three unit-test files.
- The lane A nav link should point at `#/props`. NFL is the default. `?sport=mlb|nhl` selects the others.
- The old `history/stats` helpers (`hitRecord`, `windowRows`, `windowsFor`) are kept for lane C's `matters.tsx`.
