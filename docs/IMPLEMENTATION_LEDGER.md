# SIFT overnight rebuild — implementation ledger (2026-10-10)

Baseline: `main` @ `ef993ab` (PR #42). Lint clean, typecheck clean, 58 unit files / 730 tests passing before any
change. Open PRs at start: #10 (draft, stadium media phase, untouched). Production check on `ef993ab` had one failure:
a CFB deep-link logo check (`26OCT10PRINWAG`), a timing-dependent asset check unrelated to this work.

Status words: **DONE** (built, wired, tested in a browser) · **PARTIAL** (works, with a stated gap) · **BLOCKED**
(needs something outside this repository) · **NOT STARTED**.

## Destinations

| Destination | Status | Where | Notes |
|---|---|---|---|
| Shell: five destinations, sport strip, one search, glass active state | DONE | `src/components/Shell.tsx`, `src/lib/destinations.ts`, `src/styles/broadcast.css` | Desktop glass tabs; phone 5-tab bar (Home · Games · Explore · Intel · My Board); sport sheet on phones, sport strip on desktop. |
| Breadcrumbs collapse when navigating upward | DONE | `src/state/trail.tsx` `nextTrail` | Reopening a screen already in the path truncates below it. Destination crumbs outside a sport. |
| Home | DONE | `src/views/Home.tsx`, `src/views/broadcast/*` | Games rail (sport filter, View all), featured matchup hero (licensed venue photo first, model and market glass panels from published fields only), intelligence preview, research lab, My Board preview. |
| Games | DONE | `src/views/broadcast/GamesView.tsx` | Day window × sport filter, one grid per sport with venue art; board only (no per-game download). |
| Game Overview: compact Player Prop Explorer | DONE | `src/views/game/CompactProps.tsx` | Replaces the static "Props to Watch"; deep-links to the full explorer. |
| Combined Prop Explorer | DONE (NFL) · PARTIAL (others) | `src/views/explore/PropExplorerView.tsx` | Filters: game, team, position, category, projection vs line, over-price band, priced only. Analysis: range vs line, Last 5/10/season/last season vs today's line, matchup (player perspective), alternative lines with asks, risks. MLB/NHL props stay on game pages; other sports publish no prop projections. |
| Explore hub | DONE | `src/views/explore/ExploreView.tsx` | Tools, team grid, Stats Lab (every published ranking, opponent-adjusted first), player finder. |
| Season navigator | DONE (NFL 18-week grid) · DONE (daily calendar for other sports) | `src/views/explore/SeasonView.tsx` | Results shown are the selected team's (its own profile); unpublished weeks say so; weekly EPA/play trend from nflverse history. |
| Intelligence Terminal | DONE | `src/views/intel/TerminalView.tsx`, `src/intelligence/discoveries.ts` | Discovery Board, selected workspace with connected panels (numbers, price ladder, matchup strength, model evidence, risks, method/source, same game), Football/Prop/Market Lab presets, pins, mobile focused view. Significance and evidence rated separately. |
| Market board | DONE (moved) | `src/views/Markets.tsx` | The previous global Home, now Intelligence → Market board; decision words added. |
| Public Model Pulse | DONE | `src/views/intel/PulseView.tsx`, `src/intelligence/evidence.ts` | Live published evaluation records per sport; no single overall win rate. |
| Advanced Model Lab | PARTIAL | same | Calibration curves (NFL, NHL), family tables, CLV, walk-forward/benchmark studies (tennis, NBA). No feature ablations or score time series: no publication provides them. |
| My Board | DONE | `src/views/board/*`, `src/board/model.ts`, `src/state/tray.tsx` | Game-grouped; filters; notes; saved-market snapshot (ticker, prices, observation time) and same-contract change detection; game lifecycle and newer-research notices; per-game analysis packet; "Run NFL/MLB/…" slate packets. Local-first, says so. |

## Owner fix list

See the morning handoff (`docs/OVERNIGHT_HANDOFF_2026-10-10.md`) for the item-by-item status with evidence.
