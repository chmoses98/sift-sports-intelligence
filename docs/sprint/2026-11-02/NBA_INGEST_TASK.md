# NBA current-season data ingest — upstream task (separate from PR #172)

**Do not disable the stale-data gate** (`NBA_STALE` in `src/v3/model/capabilities.ts`). It is correct today. This is the work that makes it open legitimately.

## Evidence (2 Nov 2026, `scripts/probe-nba-freshness.mjs`)
- `nba-edge-finder@data-archive` `app/latest/explorer/teams/*.json`: **30 of 30** profiles are `season 2025-26`, newest metric `as_of 2026-06-14`, last completed game April–May 2026.
- `explorer/capabilities.json` (`team_profiles`, `player_profiles`) both state: *"Nothing that feeds the research tables runs on a schedule; the ESPN history was last pulled 2026-09-19 (box scores) and 2026-09-29 (shot events), Kalshi history 2026-09-19."* Coverage line: 8,320 team-game rows, 2023-10-05 … 2026-06-13.
- `events.json`: 93 events; 2026-27 season has 2 FINAL and 3 LIVE; everything else SCHEDULED. The season started well before that, so the publisher is **not even listing already-played 2026-27 games** with results.
- Consequence in SIFT: Team screens locked (correct); NBA player pages are marked ready but their game logs end in June — verify they show dates and never read as current (follow-up audit).

## Required upstream (nba-edge-finder, outside this repo's GitHub scope for this session)
1. A scheduled workflow (daily, plus after games) that pulls ESPN box scores for **all 2026-27 games played** and appends team-game and player-game rows; backfill from 2026-10-21 (season start) to today.
2. Rebuild team metrics (pace, ORtg/DRtg, four factors, splits, last-N windows, rankings) so `metrics[].as_of` is the newest completed game; set `season: "2026-27"` and `quality.data_as_of`; keep 2025-26 as a labelled prior-season series, not mixed into current windows.
3. Publish completed 2026-27 events with `result` in `events.json` and in each team's `games`.
4. Update `capabilities.json` limitations when the schedule exists.
5. Keep the ESPN injury rows' team attribution gap (rows have no team) on the punch list.

## Acceptance (objective)
`node scripts/probe-nba-freshness.mjs --max-days 3` exits 0 (every team: season 2026-27, `as_of` ≤ 3 days). Then, in one reviewed change: replace `NBA_STALE` entries for `teamOverview/teamProfile/teamForm/teamSchedule/teamPlayers` with `ready`, add a team-sport declaration (`teamSport('nba')` in the Team model — NBA has none today, so the screens also need the metric ids pace/ortg/drtg), and add a regression test that the probe's thresholds are mirrored in `isCurrent`.

## Suggested guard in this repo (not done here)
Open the gate **from the data, not a flag**: have the Team screen read the team document's `season` and `quality.data_as_of` and use `isCurrent(asOf, 3)` before treating a gated NBA section as ready, mirroring `gameCapability`'s per-game evidence. That removes the manual flip and can never show stale numbers as current.
