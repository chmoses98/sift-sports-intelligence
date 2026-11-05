# NBA team/player research and CBB: findings (2026-11-05, issues #11, #12)

Measured against the live publications on 2026-11-05 ~05:15 UTC (`raw.githubusercontent.com`). Nothing here is assumed.

## NBA

### What was broken in this repo (fixed)
| Finding | Root cause | Fix |
|---|---|---|
| NBA player pages (175 profiled players) show "L10 / season" hit rates from games that ended Jan to Jun 2026, with nothing saying so | `usePlayerVM` takes the log as published; no screen compared the log's end with today | `logGap` (`model/playerResearch.ts`): a visible note "The game log ends Apr 30, 2025-26 ..." when the newest game is more than 21 days old (35 for football). Test `tests/v3/teamSeason.test.ts`, `e2e/v3-player.spec.ts` |
| NBA Team screen was a bare lock although the publication does carry current things | `NbaTeam` rendered only `Lock` | Locked state now also shows the slate's upcoming games (current schedule and prices), the dated injury report, and the player list. No 2025-26 statistic is shown. `e2e/v3-nba-cbb.spec.ts` |
| Generic Team screen (used by NBA/CBB/any `YYYY-YY` season) dropped every result of the season | `useTeam` built the season cut as `` `${season}-06-01` `` = `"2026-27-06-01"`, which sorts above every November 2026 date | `seasonStartIso` (`model/teamSeason.ts`), tested against the real 2026-27 CBB profile |

Checked and **not** broken: slate team ids vs explorer `short_name` (identical source, all 30 resolve); participant-id route for roster links; profile lookup via the index `files` table; box-log decoding (all 175 logs decode, every `team.short_name` present); season gate (`nbaCurrency` reads `season` and `quality.data_as_of`, never a flag, and correctly refuses 2025-26).

### Blocked upstream (nba-edge-finder, `data-archive` branch, `app/latest/explorer/`)
* **The explorer was not re-exported.** `app/latest/manifest.json` is `generated_at 2026-11-05T04:54Z` (schedule and Kalshi FRESH), but `explorer/index.json`, every `teams/*.json` and `players/*.json` are `generated_at 2026-10-31T06:16:05Z`. The Team and Player documents lag the base publication by five days.
* **Team profiles are 2025-26.** 30/30 `season: "2025-26"`, all 62 metrics `as_of 2026-06-14`, `quality.data_as_of 2026-06-14T00:30:00Z`, `quality.coverage "2023-10-05..2026-06-13"`, `source_version 2026-09-19T00:37:29Z`. `games[]` lists 2026-27 games only as `SCHEDULED` (ATL: 7, through 2026-11-10); none carries a `result`, though 2026-27 play began 2026-10-21.
* **Player logs end last season.** 175/175 profiles `season: "2025-26"`, `data_as_of 2026-06-14`; newest played game per player: 2026-01 (4), 02 (7), 03 (16), 04 (80), 05 (52), 06 (16). No player has a 2026-27 row. The registry holds only the 175 prop-market players (the profile's own limitation: "40.6 % of 2025-26 played rows"); each team profile lists 4 to 6 of them as `players`.
* **The production export lacks the metric set the Team screen reads.** The 2026-11-02 `local_explorer.py` export (fixture `tests/v3/fixtures/nba/team-CHI.json`, `production: false`) carries `team_blend_{off,def,net}`, `team_cur_adj_{off,def,net}`, `team_blend_w_current`, `team_roster_continuity`, `team_efg_pct`, `team_opp_efg_pct`, `team_fg3_rate`, `team_ast_pct`, `team_orb_pct`, `team_drb_pct`, `team_opp_tov_pct` (windows `SEASON` and `2025-26 + 2026-27 blend`). The published profiles carry none of them (they have `team_off_rtg/def_rtg/net_rtg/possessions/tov_rate/fta_rate/win_pct`, `team_adj_*_ppp`, shot shares, market metrics).
* **Injury rows** are dated 2026-10-31, carry no team attribution of their own (attributed by profile), and mix sources (`nba_official_pdf`, `espn_injuries`), so one player can appear twice.

**What the upstream ingest must produce** (acceptance, unchanged): a scheduled job that pulls ESPN box scores for all 2026-27 games played (backfill from 2026-10-21), rebuilds team metrics and rankings through the newest game with the full metric set above, sets `season: "2026-27"` and `quality.data_as_of` to the newest game, publishes completed games with `result` in `events.json` and each team's `games`, appends 2026-27 rows to player `game_log`, and re-exports the explorer on every run. `node scripts/probe-nba-freshness.mjs --max-days 3` must exit 0. The app opens the Team screen by itself from the data (`nbaCurrency`); no flag needs flipping, and the player note disappears when the log reaches the present.

## CBB (NCAA men's basketball)

### Logos: fixed
All 363 teams on the live board (470 events) are in `src/lib/cbb-teams.json` with a committed logo (`public/teams/cbb/<espn id>.webp`; none missing, no file absent). The table's abbreviation `a` equals the publication's `short_name` for all 363. **Root cause:** `teamLogo`/`teamColors` (`src/lib/teams.ts`) had no CBB branch, so every Home/Game/Team card for CBB fell back to an abbreviation tile on default navy. Fixed through `src/lib/cbbTeams.ts` (code to logo and school colours). Tests: `tests/v3/teamSeason.test.ts` (every logo resolves to an existing file; unknown code stays null).

### Team schedule: fixed
The CBB explorer exists and is current (2026-27, `data_as_of 2026-11-04`, 365 team profiles, each with its whole calendar in `games[]`). The Team screen for CBB is the generic one, which showed no results (season-cut bug above) and listed only slate-window games. Now: record and completed results appear, and "Later this season" lists the profile's own schedule (27 further games for the sample team) beyond the slate window. Browser check: `e2e/v3-nba-cbb.spec.ts`.

### Live scores: not wired (rights and evidence)
* The only cleared feed is SportScore (free tier, attribution). `docs/LIVE_SCORES_REAL.md` lists it for "NBA (and other basketball)", but its section 2 decision, the owner's 2026-10-22 approval, `rights.ts` and the parser (`NBA_COMPETITION` filter, `SPORTSCORE_SPORT = { NBA, TENNIS }`) all name NBA only. No document records which SportScore `competition` strings carry NCAA games, how its college team names match the publication's, or its accuracy for college games.
* Evidence cannot be gathered from this environment: `sportscore.com` answers 403 to the sandbox proxy and the `live-scores-probe` branch holds no basketball capture. A parser written without a real payload would match on a guess; a wrong match prints a wrong score. ESPN, NCAA.com and other feeds are not licensed (`LIVE_SCORES_REAL.md` section 1).
* Result: CBB in-play games keep the honest "Score unavailable" with the reason from `missingReason` ("no live feed whose published terms permit this use covers college basketball").
* To unblock: (1) owner decision to extend SportScore to college basketball; (2) run the probe workflow on a game day and commit a real `sport=basketball` answer containing NCAA games; (3) add the competition filter and team-name matching against that fixture, with a rights entry in `src/v3/data/live/rights.ts`.

### Not done
CBB has no player layer (`players_by_team: 0`) and its search index is not in `EXPLORER_SPORTS`, so CBB teams are searchable only through the slate; the generic Team screen shows CBB ratings only as listed metrics.
