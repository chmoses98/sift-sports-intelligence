# v4 screenshots for the Claude Design canvas ("SIFT Mobile Design Direction")

Captured from the real React app (classic e2e build, Chromium phone project, 390×844) with test fixtures, not live data: the bundled NFL
publication (ATL at NO), the NHL and CFB fixtures, controlled recommendations (`e2e/propSignals.ts`) and a seeded tray (`e2e/boardSeed.ts`).
Regenerate with `V4_SHOTS=<dir> npx playwright test --project=phone e2e/v4.spec.ts e2e/v4-props.spec.ts e2e/v4-signals.spec.ts e2e/v4-board.spec.ts`.

| File | Screen |
| --- | --- |
| 01-home | Home (milestone 1; earlier capture, unchanged since) |
| 02-games | Games (milestone 1) |
| 03-game-matchups | Game Command Center, Matchups tab (milestone 1) |
| 04-research-sheet | Research sheet on a published NHL research candidate (milestone 1) |
| 05-props-explorer | Prop Explorer (2A) |
| 06-player-detail | Player detail with the Kalshi ladder (2A) |
| 07-prop-sheet-published-signal | Prop sheet over a valid published signal (2A corrections) |
| 08-prop-sheet-research-only | Prop sheet, research only: "No published signal validates this difference." (2A corrections) |
| 09-signals-feed | Signals feed, every status (2B) |
| 10-signals-watch | Signals, a published CFB watch (2B) |
| 11-signals-verdicts | Signals, sports with no opportunity show their verdict (2B) |
| 12-board | Board: saved by game, side-aware price, worth another look (2C) |
| 13-board-item | Board item sheet (2C) |
| 14-board-full | Board, whole page (2C) |

Not yet republished to the canvas: that updates a shared published page, so it waits for the owner's go-ahead.
