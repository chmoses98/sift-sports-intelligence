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
Filled in when the post-deploy checks complete: see the end of the PR description or the report that accompanies this file.
