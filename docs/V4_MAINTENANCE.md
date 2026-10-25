# SIFT v4: feature freeze and maintenance mode

**Status: FEATURE FROZEN** (declared 2026-10-25, after the final approved v4 release, #144, merge `77b3892a`; the deployment record is at the end of this file).
The next-generation SIFT replaces the experience; it inherits the intelligence. See `NEXT_SIFT_HANDOFF.md`.

## What stays accessible
The production app (GitHub Pages, SIFT 2.0 by default, v4 at `#/v4`) stays up. Rollback for v4 is unchanged: `docs/v4/ROLLBACK.md` (pause switch `SIFT_V4=off`, or revert the v4 merge).

## Allowed without asking
* critical functionality failures
* security vulnerabilities
* incorrect or corrupted data
* material projection or identity errors
* production outages
* essential operational maintenance (CI, deploy, the Production check, scheduled jobs, dependency or runner breakage)

## Not allowed without explicit approval
* new v4 features, cosmetic refinements, navigation redesigns, additional UX polish, new research interfaces
* unnecessary refactors
* opening issues or pull requests only to keep improving the old interface

A genuine production problem is fixed minimally, with its evidence in the PR, and the freeze resumes.

## The freeze is for the frontend only
Nothing below is disabled, paused or deprecated because v4 is frozen. The new app inherits all of it.

* Sport research pipelines and publications: `nfl-edge-finder`, `cfb-edge-finder`, `nba-edge-finder`, `NHL-edge-finder`, `edge-finder-api` (MLB and EdgeLab), `soccer-edge-finder`, `cbb-edge-finder`, `Tennis-Edge-Finder`
* Projection generation and publication (`projection-data` branches), the feed monitor, quality gates, absolute-accuracy and prospective scorecards
* Opponent-adjusted statistics, matchup research, game scripts and market-expression analysis (`CFB Script Engine` and the game-script exporters)
* Kalshi market collection, discovery and historical price archives; CLV and closing-line capture
* Live quotes (quote feed workflow and relay); permitted live-score integrations (`src/live/scores`)
* Schedules, team identities and logos, rosters, injury and availability capture
* Monitoring, watchdogs, scheduled jobs and the Production check

## NBA promotion (PR #143) is preserved, not abandoned
PR #143 stays an open draft: the seven-family implementation, tests, model evidence and the owner-approved fallback policy are kept as written. The approval ledger (`src/lib/projectionApprovals.ts`) is unchanged and NBA player projections remain in the existing research-preview presentation. NBA `team_points` stays `HELD`. No activation checks are dispatched to advance it. A new activation decision is made when the new SIFT needs the promoted projections, with fresh evidence at that time.

## Temporary branches (safe to delete)
These served the iPhone SE Board investigation and are obsolete now that #144 is merged. The tap telemetry they carried is in `main`. A command-line deletion was refused (HTTP 403) and was deliberately not worked around, so delete them in the GitHub UI. Nothing depends on them.

| Branch | Why it is safe |
|---|---|
| `claude/repro-se-board` | temporary diagnostic workflow; never to be merged |
| `claude/board-tap-at-rest` | an earlier attempted fix that did not work; superseded by #144 |
| `claude/board-tap-telemetry` | telemetry only; contained in #144 |

To delete a branch: open `https://github.com/chmoses98/sift-sports-intelligence/branches` → **All branches** → find the branch (the search box accepts the name) → click the trash can at the right of its row → confirm. Repeat for each of the three. (Cleanup does not block anything.)

## Deployment record for #144
| | |
|---|---|
| Merge commit on `main` | `77b3892a86900b3e258599cf126a422c55bab648` |
| Deploy to GitHub Pages | run 196, success (02:29:27Z) |
| Live build | production `version.json` = `77b3892a…` (the v4 projections production check logs `deployed commit is the intended one (77b3892 vs 77b3892)`) |
| Production check (run 221) | v4 early-access journey (Board), v4 CFB/NBA projections, sprint features (252 PASS · 1 N/A · 0 FAIL) and the relay-smoke job passed. The `check` job is red because of one step, **CFB — Script Engine path and team logos**. |

### Known false failure in the CFB production check
`scripts/cfb-production-check.mjs` `priorityCheck()` assumes the CFB home always has upcoming games. The run began at 02:40Z, after the Saturday slate had finished, so the rail correctly said "No upcoming games — Every game on this slate has kicked off or finished" (`src/views/cfb/CfbPriorities.tsx`). The check then looked for a "Top Value Signal" section and the `[data-priority="value"]` slot, which are not rendered in that state, and timed out. Everything else in that step passed on all three devices (identity, signals, deployed SHA, cards, overflow, Value Watch filter).

This is a time-of-day assumption in the check, not a product defect and not caused by #144 (Board/live-quote code).

Later scheduled re-runs on the same SHA behaved differently: run 223 (13:08Z) passed the CFB step and failed on the **NFL distribution** step instead (`the artifact describes the feed of 2026-10-25T13:12:30Z, not the current 2026-10-24T16:59:12Z`: a feed-timing mismatch in the live NFL publication, unrelated to #144 and to the CFB check). Run 222 was not examined.

### Resolution: CFB check fix (#146)
| | |
|---|---|
| Merge commit on `main` | `9f2dadaa2d62b36f706c7a8ef9c62b437d2a2617` (`scripts/cfb-production-check.mjs`, `scripts/cfb/priorities.mjs`, `tests/cfbProductionCheckRail.test.tsx`; the app is unchanged) |
| Behaviour | With no upcoming game on the published board the check requires the plain "No upcoming games" state (no value slot, no item links). With upcoming games every earlier signal, priority and navigation assertion is unchanged. A board/rail mismatch fails. |
| Regression coverage | The real `CfbSlatePriorities` rail rendered in both states through the check's own judging code, plus the mismatch and mid-run-kickoff cases. |
| Deploy to GitHub Pages | run 199, success (16:53:14Z); live `version.json` = `9f2dadaa…` |
| Production check (run 224) | `check` job passed: CFB step (the board had 230 upcoming games, so the upcoming-games path ran: 5 priority items, Top Value Signal present, on Chromium desktop, Chromium phone and WebKit iPhone), v4 early access, v4 projections (`version.json is served (9f2dada)`), sprint features (254 PASS · 0 N/A · 0 FAIL). The NFL distribution step reported N/A (the feed publishes no receptions/completions projection for PIT @ NO). |

The "No upcoming games" branch is verified by the regression tests; production exercises it the next time the check runs after a slate has finished.
