# SIFT acceptance backlog — wave 1 (2026-10-11)

Production baseline: `main` @ `3b3c65b`. GitHub tracking: #70 (the 52 requests), and #63–#69 (one issue per gap area, §1–§7).

## Why this exists

The overnight repair sprint marked all 52 owner requirements "FIXED AND VERIFIED", but **the owner has not accepted them**, and
the tracker's issue text was inferred from lane deliverables, not the owner's words (`REPAIR_SPRINT_2026-10-11.md` says so). At least
two rows were matched to the wrong request: the owner's #14 is the NFL close-game scripts and #22 is a Home Top Props preview, not
"multiple market expressions" and "horizontal prop carousel". The owner's original text is **not in any repository**; this backlog keeps
the original numbering and leaves the wording column empty until the owner supplies it, rather than re-inventing it.

Rules for this backlog: an item is accepted only by the owner. A passing automated test is evidence, not acceptance.
"Verified in production" in the previous sprint was a presence check (`scripts/sprint-production-check.mjs`), not acceptance.

## The 52 requests

| # | Owner's original wording | Prior sprint's inferred deliverable (NOT owner text) | Owner acceptance | Wave 1 work / concern |
|---|---|---|---|---|
| 1 | _needed from owner_ | Improved hero presentations | Not accepted |  |
| 2 | _needed from owner_ | More informative game cards | Not accepted |  |
| 3 | _needed from owner_ | Indoor/outdoor weather handling | Not accepted |  |
| 4 | _needed from owner_ | Dedicated Player Prop Explorer navigation | Not accepted | Likely meant a cross-sport explorer (§1) |
| 5 | _needed from owner_ | Accessible basic statistics | Not accepted | "NFL only" limitation: likely PARTIAL |
| 6 | _needed from owner_ | Units and denominators | Not accepted |  |
| 7 | _needed from owner_ | Adjusted / raw toggle | Not accepted | NFL-only; NHL/NBA publish both (§5) |
| 8 | _needed from owner_ | Team-specific game scripts | Not accepted |  |
| 9 | _needed from owner_ | Team-color-responsive design | Not accepted | Team pages "not yet" per its own limitation (§4) |
| 10 | _needed from owner_ | Flexible offense-vs-defense comparisons | Not accepted | "NFL only" limitation: likely PARTIAL |
| 11 | _needed from owner_ | Relevant game imagery | Not accepted | Removed 30 photos, replaced none (§4) |
| 12 | _needed from owner_ | Typography and visual hierarchy | Not accepted |  |
| 13 | _needed from owner_ | Concise script descriptions | Not accepted |  |
| 14 | Owner (brief, 2026-10-11): NFL close-game scripts combine either team's close win; needs winner-specific outcomes | Multiple market expressions per script | Not accepted | **Fix in review:** sift#62 + nfl-edge-finder#147 |
| 15 | _needed from owner_ | Reduced unnecessary copy | Not accepted |  |
| 16 | _needed from owner_ | Prominent multi-script survivors | Not accepted |  |
| 17 | _needed from owner_ | Player-grouped prop markets | Not accepted |  |
| 18 | _needed from owner_ | Accurate roof and venue information | Not accepted |  |
| 19 | _needed from owner_ | Rankings on game cards | Not accepted | CFB shows no rankings (§1/§7) |
| 20 | _needed from owner_ | Home structure and continuity | Not accepted |  |
| 21 | _needed from owner_ | Contextual best-market indicators (validated only) | Not accepted | "(validated only)" looks like the sprint's own constraint |
| 22 | Owner (brief, 2026-10-11): prominent Top Props preview on Home (≤10, grouped, multi-select, live) | Horizontal prop market carousel | Not accepted | **Fix in progress:** Home Top Props PR (wave 1) |
| 23 | _needed from owner_ | Readable unit-by-unit analysis | Not accepted |  |
| 24 | _needed from owner_ | Prominent scheme tendencies | Not accepted | Owner may mean scheme-informed projections (§2) |
| 25 | _needed from owner_ | Scheme-to-player matchup intelligence | Not accepted | Presentation only; production check passes on empty state (§2) |
| 26 | _needed from owner_ | Improved team comparisons | Not accepted | "NFL only" limitation: likely PARTIAL |
| 27 | _needed from owner_ | Scroll and navigation behavior | Not accepted |  |
| 28 | _needed from owner_ | Team logos in script-survival visuals | Not accepted |  |
| 29 | _needed from owner_ | Interactive simulation graphics | Not accepted | Unclear original ask |
| 30 | _needed from owner_ | Interactive performance charts | Not accepted | "NFL only" limitation: likely PARTIAL |
| 31 | _needed from owner_ | Last 5 / 10 / season / historical filters | Not accepted | "NFL only" limitation: likely PARTIAL |
| 32 | _needed from owner_ | Hit-rate and over/under indicators | Not accepted | "NFL only" limitation: likely PARTIAL |
| 33 | _needed from owner_ | Injury-source freshness and provenance | Not accepted | Labelling, not better sources; NFL injury rows look capped at 25 (§6) |
| 34 | _needed from owner_ | Depth-chart player presentation | Not accepted | "NFL only" limitation: likely PARTIAL |
| 35 | _needed from owner_ | Remove developer jargon | Not accepted |  |
| 36 | _needed from owner_ | Imagery quality / branded fallback | Not accepted | Same deliverable as #11 (§4) |
| 37 | _needed from owner_ | Better market navigation | Not accepted |  |
| 38 | _needed from owner_ | Functional market-category filters | Not accepted |  |
| 39 | _needed from owner_ | Redesigned Market Comparison Studio | Not accepted |  |
| 40 | _needed from owner_ | Kalshi-style browsing; discoverable Wong teasers | Not accepted | Two unrelated features in one row |
| 41 | _needed from owner_ | Price movements and open questions | Not accepted | "Open questions" ambiguous |
| 42 | _needed from owner_ | Supporting prop metrics and matchup explanation | Not accepted |  |
| 43 | _needed from owner_ | Meaningful data-availability states | Not accepted |  |
| 44 | _needed from owner_ | Research Lab replaces Explore | Not accepted |  |
| 45 | _needed from owner_ | Redesigned research navigation | Not accepted |  |
| 46 | _needed from owner_ | Weekly matchup presentation | Not accepted | "NFL only" limitation: likely PARTIAL |
| 47 | _needed from owner_ | Better statistical visualizations | Not accepted |  |
| 48 | _needed from owner_ | Top-props board with multi-select | Not accepted |  |
| 49 | _needed from owner_ | Per-game stat correctness; box stacking vs RB | Not accepted | Compound row |
| 50 | _needed from owner_ | Historical scores, winners, spread results | Not accepted | "NFL only" limitation: likely PARTIAL |
| 51 | _needed from owner_ | Intelligence cards lead to research | Not accepted | Owner may mean intelligence tied to measured outcomes (§3) |
| 52 | _needed from owner_ | Full Intelligence-page audit | Not accepted | Same as #51 (§3) |

## Gap analysis by area

Scope: SIFT `main` @ `3b3c65b` (production) and the live publications at `raw.githubusercontent.com/.../app/latest`
(manifests generated 2026-10-11 20:21Z–22:52Z). Each gap is judged against what a demanding owner would expect, not
against the sprint's own checks. Items #14 (NFL close-game scripts) and #22 (Top Props preview on Home) are being
fixed in parallel and are left out here.

Classification:
- **IMPL-READY**: SIFT-only work; the data is already published.
- **UPSTREAM**: a publisher has to emit new fields first.
- **VALIDATION**: the change would add or alter model outputs, so they must pass the prospective acceptance gates first.

Size: S ≈ ≤1 day · M ≈ 2–4 days · L ≈ a week or more.

A general point on "verified": `scripts/sprint-production-check.mjs` mostly checks that something is present. For example, `#9 team colour CSS vars set on the hero` (l.311) passes if the CSS variables exist. `#25` (l.436) passes on *either* a chain *or* "honest empty state". `#11/#36` (l.765) only checks that no blocklisted image was requested. Many tracker rows marked FIXED AND VERIFIED also carry "NFL only" limits. By an owner's standard those rows are **PARTIAL**.


## 1. Cross-sport Player Prop Explorer and trends

What each publication publishes, from live `explorer/capabilities.json`, profiles, `markets.json` and event details:

| Sport | Player prop markets (live) | Model player projections | Player game logs published | Other | What SIFT shows |
|---|---|---|---|---|---|
| NFL | 5,785 `player_stat` + TD/leader markets | sim p05–p95 per player stat (RESEARCH) | **No.** `player_game_logs: RESEARCH`, "2026 rows are not committed". SIFT builds its own from nflverse (`src/history/load.ts:7` `SUPPORTED = new Set(['NFL'])`) | — | Full explorer, hit rates, PerfChart, Top Props |
| NHL | 192 player-linked (goals 61, points 55, assists 38, first goal 36, saves 2) | PLAYER_SIM_V1 RESEARCH, not published as projections. Per-contract model P(YES) where `nhl_scripts_v1` prices it | **Yes:** `extensions.game_log`, last 82 games (g, a, p, sog, toi by EV/PP/SH, ±; goalie rows) | — | Hub entry point to the Markets tab only. Game log table on `NhlPlayer` (`views/nhl/NhlPlayer.tsx:78`). **No hit rates vs line** |
| NBA | No game-level player props on the board today; 314 `KXNBASTATLEADER` season markets | quantiles RESEARCH, gated | **Yes:** `extensions.game_log`, 175 players, 27 box columns, last 82 | **`extensions.prop_log`: historical Kalshi prop lines with `mid_t30m`, `exec_yes_t30m` and `outcome`** (pts 2,587 / reb 2,330 / ast 1,708 / 3s 1,494 settled rows) | **Not in the Props hub** (`PropsHub.tsx:31` lists NFL/MLB/NHL only). The NBA player page renders no game log (below) |
| MLB | 476 markets on 1 game (K 42, outs 5, hitter H/TB/HRR/RBI/SB) | `extensions.player_prop` (`mlb.player_prop.v1`): pitcher K/outs RESEARCH_PROJECTION with drivers and p10/p90. Hitters `LINEUP_UNCONFIRMED` (236 rows) | Partial: pitcher `games` + series `met_mlb.pitcher_outs`, `pitcher_pitches`; `extensions.statcast_games` (batter xwOBA/EV/LA per game; pitcher pitch mix, whiff%, velo) | `player_prop.validation` (Brier vs Kalshi) | Game-page Player props tab with projection and validation (`views/mlb/PlayerProps.tsx`). **No game logs, no hit rates, `statcast_games` unused** (no `statcast` reference in `src/`) |
| CFB | 12 `touchdown_scorer`, 54 `team_stat_prop`, 3 `game_stat_prop` | none | none ("no player data exists") | — | Not in the Props hub |
| Soccer | none published (`player_*` families dispositioned UNSUPPORTED_FAMILY) | none | lineup appearance counts only | — | n/a |
| Tennis | `PLAYER_ACES` parsed, `projectable: False` | none | none | — | n/a |
| CBB | none | none | `UNKNOWN` | — | n/a |

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 1.1 | **The NBA player page shows no game log, though the publication has one.** `Player.tsx` builds stat options from `NFL_STATS` only (`history/stats.ts:38-39`), so for NBA `cur` is null and the whole "This game / Game by Game" block returns null (`Player.tsx:295`). If it rendered, the empty-state copy is NFL-specific ("not in the play-by-play", `Player.tsx:360`). Meanwhile `NbaGame.tsx:89` tells users to "Open one for last season's game log". | NBA profile `extensions.game_log` columns `date_et…min, pts, reb, ast, fg3m…plus_minus`, 82 rows | IMPL-READY | M |
| 1.2 | **NBA `prop_log` (historical lines, T-30m price, outcome) is never read.** It is the only publication that gives *historical* prop lines, so a hit rate can be measured against the line that was actually posted, and against the price, not just "today's line". | `extensions.prop_log` columns `tip_utc, event_id, stat, ticker, line, mid_t30m, exec_yes_t30m, outcome`; `grep prop_log src` finds nothing | IMPL-READY | M |
| 1.3 | **There is no NBA entry in the Props hub or explorer.** That is acceptable while no game props are listed (preseason), but there is no plan for regular-season props even though logs and prop history are published. | `PropsHub.tsx:22-35` (`slug: 'nfl' \| 'mlb' \| 'nhl'`) | IMPL-READY | M |
| 1.4 | **NHL hit rates against the line are absent.** Goals/points/assists contracts (1+, 2+) could be measured against `game_log` g/a/p/sog over the last 5/10/season with the same `hitRate` rules. The hub sends users to the Markets tab ("no combined explorer to fill", `PropsHub.tsx:128`). | live NHL `markets.json` 192 player-linked; profile `game_log` 14 columns, cap 82 | IMPL-READY | M |
| 1.5 | **The NHL model's player P(YES) shows only on the player page** (`NhlPlayer.tsx` `PricedMarkets`). The hub copy says the NHL "carries no … simulated distributions", which undersells the per-contract model prices that do exist. | `NhlPlayer.tsx:105-135`; `PropsHub.tsx:126-128` | IMPL-READY | S |
| 1.6 | **MLB pitcher outs hit rate is possible but missing.** There is a per-start `met_mlb.pitcher_outs` series. **MLB K hit rate** needs per-start strikeouts, which are not published. Hitter box lines are absent ("No per-game batter box lines in production"). | MLB pitcher profile `series` → `met_mlb.pitcher_outs`, `pitcher_pitches`, `sc_velocity`; capability `player_game_logs` PARTIAL | outs: IMPL-READY (S–M); K/hitters: UPSTREAM (M) | |
| 1.7 | **MLB `statcast_games` (per-game xwOBA, EV, LA; pitcher pitch mix, whiff%, velocity) is unused.** It is natural trend material for the prop tab. | MLB profiles `extensions.statcast_games` (16–40 rows) | IMPL-READY | S–M |
| 1.8 | **NFL hit rates use "today's line" against past games** because historical prop lines are not published (`Player.tsx:358` copy). An owner reading "4 of 10 over" will assume those were the lines at the time. | NFL `market_history` only 15 docs; capability `player_game_logs` RESEARCH | UPSTREAM (NFL Kalshi prop line archive) | M |
| 1.9 | **CFB, soccer, tennis and CBB player props** have nothing to research (no logs, no projections). Their markets are listed only. | capabilities above | UPSTREAM | L |
| 1.10 | **No cross-sport "trends" surface.** For example: "players over their line in N of last 10", across NFL/NHL/NBA. TopProps "Last 10 history" ranking is NFL-only (`TopProps.tsx`, `PropsHub.tsx:108`). | — | IMPL-READY once 1.2–1.4 land | M |

## 2. Scheme-informed projections versus scheme presentation

**Finding:** no published projection uses blitz, box count, motion, play action, RPO, screen or coverage features. In SIFT, scheme is display-only, and SIFT says so in its own code.

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 2.1 | **NFL sim reads pass-rate tendency and pace, not scheme.** The pass-rate model uses `off_neutral_pass_rate, off_pass_rate, off_proe, def_pass_rate, def_neutral_pass_rate` (`nfl_edge/sim/models.py:87-88`), served in `simulate.py:130-134`. Per-touch efficiency uses opponent `def_ypc/def_ypa/def_comp_rate` (`simulate.py:254-258`). No blitz, box, motion, PA or coverage input exists. | nfl-edge-finder @ `c8cab4f` | — (fact) | — |
| 2.2 | **FTN scheme data was explicitly rejected upstream**: "`ftn_charting` has run concepts (RPO, sneak, backfield/box counts, motion) … no per-row publication instant, so a point-in-time claim cannot be made" (`nfl_edge/sim/rushing.py:35-40`). The OL/defensive-front enrichment in the same file is used only by research scripts (`scripts/sim/write_results.py`). | as cited | VALIDATION (any scheme feature in projections) | L |
| 2.3 | **The opponent-adjusted matchup arm is "a separate RESEARCH arm, not deployed"** (`nfl_edge/sim/opponent_adjust.py:1`). The research player-mean model has "no opponent term at all" (`nfl_edge/features/defense.py:3-4`, `research/player_distributions.py:249-250`). | as cited | VALIDATION | L |
| 2.4 | **SIFT's scheme board and scheme→player chains are presentation only**: "Sift does not claim the tendency moves the projection" (`src/insights/schemePlayers.ts:6-9`). The source is SIFT's own nflverse/FTN layer, not the publisher (`src/insights/schemeBoard.ts:4-7`). Lane C measured stacked-box rate against YPC allowed at r ≈ 0.01. An owner asking for "scheme-informed projections" has not received them. | as cited; `docs/sprint/lane-c.md` #49 | VALIDATION | L |
| 2.5 | **Coverage shells (man/zone) are not available for 2026** in any source SIFT reads, so "receivers vs coverage" is stated as unmeasured. | `docs/sprint/lane-c.md` #23/#24 | UPSTREAM | M |
| 2.6 | **The MLB hitter engine is the only matchup-type model found.** It weights hitter PA outcomes by the opposing pitcher's pitch-family mix (`edge-finder-api/lib/research/hitter_pa_outcome_model.py:119-148`, used by `scripts/build_hitter_projection_board.py:391`). Every live hitter prop is `LINEUP_UNCONFIRMED`. The pitcher K driver "Opponent K tendency ×0.95" is team-level. SIFT shows drivers (`PlayerProps.tsx:154-157`) but has no "pitch mix vs hitter" presentation. | live MLB event detail `player_prop.drivers` | presentation: IMPL-READY (S, needs pitch-mix fields in `player_prop`: UPSTREAM S) | |
| 2.7 | **The NBA scheme layer is defined but neutral.** `SchemeFeature` (drop coverage, switch frequency, blitz/trap …) at `nba_edge/matchup/schemas.py:219-235`; `MatchupAdjustment` "defaults to the identity transform" (`schemas.py:12-14`); packet note "no effect has been learned yet" (`matchup/packet.py:155`). | as cited | VALIDATION | L |

## 3. Intelligence-to-market evaluation

**Finding:** discoveries are computed live and never recorded. Matchup-mismatch discoveries carry no measured outcome. Market discoveries show a settled family record **only for NHL**.

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 3.1 | **Mismatch discoveries are narrative only.** `mismatchMeaning` says where the edge "would show" (lead back's rushing line, touchdown props …) (`src/intelligence/discoveries.ts:181-197`). Nothing measures whether past "major mismatch" discoveries covered the spread, hit the props, or moved the close. The Terminal's evidence panel says so: "A matchup or data finding carries no model price, so there is no model record to weigh" (`views/intel/TerminalPanels.tsx:428`). | as cited | VALIDATION (a predictive claim) + UPSTREAM (NFL ratings are "current snapshot only; no committed history", capability `opponent_adjustment`) | L |
| 3.2 | **There is no discovery ledger.** Discoveries are rebuilt each render (`buildDiscoveries`, `discoveries.ts:228-235`). IDs are ephemeral and pins live in localStorage (`TerminalView.tsx:32-45`). There is no record of what was surfaced, at what price, or how it settled. | as cited | UPSTREAM (or a SIFT data job committing daily snapshots, like `build-nfl-schedule.mjs`) | M–L |
| 3.3 | **A per-family settled record is attached only for NHL** (`src/opportunity/record.ts:17` `nhlFamilyRecord`, used only at `opportunity/sources.ts:289`). Other publications do carry family-level evaluation, read today only by Model Pulse (`src/intelligence/evidence.ts:4-9`): the NFL scorecard (`met_nfl.incumbent_fair_probability`), soccer `extensions.calibration[]` by family, tennis `strict_executable_clv` by family, NBA `model_vs_market`. The market discovery card's "Family record" fact (`discoveries.ts:99`) is therefore blank outside NHL. | as cited | IMPL-READY | M |
| 3.4 | **There is no CLV or hit-rate column per discovery type** (e.g., "Research candidates in NFL player props: n settled, hit %, mean CLV"). Its source tables differ by sport. NFL's capability `clv: VERIFIED` ("model CLV (scorecard)"). | NFL capabilities `clv` | IMPL-READY where the scorecard has it (M); others UPSTREAM | |
| 3.5 | **MLB is shown as "no model-vs-market scorecard"** in Pulse (`evidence.ts:9`). Yet each MLB prop carries `player_prop.validation.summary` ("worse than Kalshi on 6,610 settled 2026 markets (Brier 0.166 vs 0.157)"), and that appears only in a game-page disclosure. The summary is free text, so it needs structured fields. | live MLB `player_prop.validation` | UPSTREAM (structured Brier/n) then IMPL-READY | S |
| 3.6 | **Owner wager CLV and results are deliberately excluded** from model evidence (`evidence.ts:10-11`). Defensible, but there is no separate "my record" view of `performance.json` (NFL mean CLV −0.80 on 94 wagers; MLB −0.005 on 141; `by_market_family` for NFL/MLB/CFB/NHL). An owner may expect it. | live `performance.json` | IMPL-READY (if wanted) | M |
| 3.7 | **"context" and "model" discovery kinds are declared but never produced** (`discoveries.ts:22`; `terminalModel.ts:47-48`; `buildDiscoveries` emits only market/mismatch/freshness). NFL injury rows already flag "changed since previous capture", and NBA/NHL publish injuries, so lineup-change discoveries are possible. | live NFL event research `context.injuries[].detail` | IMPL-READY | S–M |

## 4. Hero imagery and dynamic team-colour styling

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 4.1 | **30 of 55 NFL player photos were removed and none replaced.** 25 game-day files remain (`public/players/nfl/`, `src/lib/player-images.json`); the blocklist holds 30 (`src/lib/player-image-blocklist.json` `files`). `scripts/players/players.json` lists 87 player slots, with only 4 carrying a pinned `commons_file`. Script cards and player pages fall back to the branded frame. | as cited | IMPL-READY (curation and licensing; no publisher) | M |
| 4.2 | **Game-day imagery is mostly absent.** `src/lib/hero/photos.json` has 100 *venue* photos: NFL 15/32, MLB 23/30, NHL 14/32, CFB 41, CBB 7/365. There are no per-matchup or action images. The rest get a branded identity hero. | `docs/HERO_COVERAGE.md` table; `photos.json` counts | UPSTREAM (a licensed image source; not a publisher field) | L |
| 4.3 | **NBA, soccer and tennis game pages render no hero art at all** (`HeroArt` is not imported in `views/nba/*`, `views/soccer/*`, `views/tennis/*`). `HERO_COVERAGE.md:17` still says "no game pages in Sift today", which is stale. | grep | IMPL-READY (branded identity hero) | S–M |
| 4.4 | **The Team page barely uses team colour**: only `--team` → a 3 px left border on the header (`views/Team.tsx:230`; `styles/sift.css:266`). It does not use the accessible `accentOnDark` helper (used only in `broadcast/parts.tsx` and `game/Hero.tsx`). The tracker row #9 limitation says so ("Team pages can adopt the same helper (not yet)"), yet the row is FIXED. | as cited | IMPL-READY | S–M |
| 4.5 | **There are no soccer club colours.** `teamColors` has tables for NFL/NHL/MLB/NBA/CFB and returns the navy default for everything else (`src/lib/teams.ts:33-43`), so soccer cards, rails and heroes cannot be team-coloured. | as cited | IMPL-READY (colour table) | M |
| 4.6 | **TeamCompare, the Prop explorer and Home's "Matchup edges" hard-code `'NFL'`** in colour calls (`TeamCompare.tsx:75-93`; `PropExplorerView.tsx:108,145,223`; `Home.tsx:44`). That is acceptable while those views are NFL-only, but it blocks reuse. | as cited | IMPL-READY | S |

## 5. Raw vs opponent-adjusted statistics and comparison charts

| Sport | Adjusted published | Raw counterpart published | Toggle in SIFT |
|---|---|---|---|
| NFL | 22 `met_nfl.adj_*` | yes (offense/defense/style, last 34) | Yes: Team (`Team.tsx:303`, NFL only), MatchupTab (`MatchupTab.tsx:68`), TeamCompare (`TeamCompare.tsx:140`) |
| NHL | 7 `met_nhl.oa_*_5v5` | yes, `extensions.raw_value` on the same games | No (raw shown inline only) |
| NBA | `team_adj_off/def/net_ppp` | `team_off/def/net_rtg` | No |
| CBB | 17 `met_cbb.adj_*` (after first archived projection) | no | n/a (adjusted only) |
| Soccer / Tennis | Dixon–Coles / Elo (adjusted by construction) | raw form rows | n/a |
| CFB | Script Engine ridge adjustment (per event extension) | some metrics raw | No |
| MLB | simple opposing-starter xERA adjustment | yes | No |

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 5.1 | **No raw/adjusted toggle on NHL**, even though both values exist per observation. | NHL metrics `category: opponent_adjusted` ×7; wave2 shows "raw 2.02" inline | IMPL-READY | S–M |
| 5.2 | **No raw/adjusted toggle on NBA** (rtg vs adj ppp pairs). | NBA metrics registry | IMPL-READY | S–M |
| 5.3 | **Team comparison is NFL-only.** Other sports fall through to `PlayerCompareView` (`Compare.tsx:52`), so DuelRow, PercentileStrip and DivergingBar (`views/stats/Builder.tsx`, `UnitByUnit.tsx`, `TeamCompare.tsx`) never render outside NFL. | as cited | IMPL-READY (NHL, NBA, CBB, soccer have ranked team metrics) | M–L |
| 5.4 | **Metric and Ranking pages format non-NFL values with the generic formatter** (wave-2 stated limitation). | `docs/sprint/wave2.md` "Remaining limitations" | IMPL-READY | S |
| 5.5 | **Box-score "basics" (#5) are NFL only**, built by SIFT from nflverse. Other publications carry no per-game box counts, except NBA/NHL player logs, which could be aggregated to team level. | tracker #5 | NBA/NHL: IMPL-READY (M); others UPSTREAM | |
| 5.6 | **CBB opponent-adjusted rows exist only after the first archived projection** (season starts Nov 2026). They were verified by fixture, not live data. | capability `opponent_adjustment: UNAVAILABLE` | UPSTREAM (timing) | — |

## 6. Injury-source quality and upstream weather accuracy

**Injury sources (live):**

| Sport | Source | Freshness at fetch | Quality notes |
|---|---|---|---|
| NFL | ESPN rows (Sleeper status as a cross-check field) | capture 19:56Z, publication 20:21Z | Official NFL report not captured. Name-joined, no GSIS ids. **Every upcoming game has exactly 25 rows per team** (DEN/LAC, SF/SEA, ARI/DET, ATL/BAL, BUF/LA), and 64–82 % of them are `ACTIVE`. BUF+LA show only 2 IR players in total. This looks like truncation (unverified where: ESPN endpoint `scripts/data/context_capture.py:160` or the packet) |
| NBA | ESPN | 22:16Z | "official NBA PDF **never captured** (`missing: true` on every snapshot)"; `nba_id` null on all rows |
| NHL | ESPN, name-only | 21:17Z | "not modelled in V1"; no history |
| MLB | none | — | "No injury or availability data is stored" (lineup confirmation only) |
| CFB | none | — | ESPN capture hibernated 2026-09-17 |
| Soccer | none | — | "InjuryProvider is unimplemented" |
| Tennis / CBB | none | — | — |

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 6.1 | **The likely 25-per-team cap on NFL injury rows** hides real designations, so SIFT's injury tab and context lose IR and long-term players. | live NFL event research, 5 upcoming games | UPSTREAM | S–M |
| 6.2 | **No official injury report is captured for NFL or NBA**, and SIFT can only caveat it (`src/lib/injurySource.ts:36`). Tracker #33 delivered labelling, not better sources. | capabilities `injuries` | UPSTREAM | M |
| 6.3 | **MLB, CFB, soccer, tennis and CBB have no injury source at all.** | capabilities | UPSTREAM | M each |
| 6.4 | **The freshness thresholds (6 h / 24 h) are a SIFT product choice** (`injurySource.ts:12-13`) and not tied to the report cadence (e.g., NFL Wed–Fri practice reports, NBA 5 pm ET). | as cited | IMPL-READY | S |
| 6.5 | **nfl-edge-finder PR #138 is still an open draft, not merged** (`draft: true, merged: false`, head `claude/sift-overnight-repair-sprint-2o8mmb`, 7 files, +426/−53, last updated 2026-10-11T09:44Z). Live data still shows the bug: State Farm Stadium and Mercedes-Benz Stadium `context.venue.roof = ""`, and the ARI game's `weather.material: true`. SIFT corrects this on screen, but the upstream handicap still raises a weather question. | GitHub REST `pulls/138`; live NFL event research | UPSTREAM (review and merge) | S |
| 6.6 | **SIFT withholds a wrong international forecast only when the time zone differs**; a same-zone wrong location would pass (lane F's own limitation). PR #138 fixes the root cause. | `docs/sprint/lane-f.md` "Remaining limitations" | UPSTREAM | S |
| 6.7 | **The CFB export drops venue and weather.** `scripts/app_export.py:296-301` builds `contexts[event_id]` from teams, identity, completeness, family_distribution and catalog_events only. Live CFB event_detail `context.venue = null`, `context.weather = null`. The weather capture itself is **hibernated since 2026-09-17** (capability `weather`; `src/cfb_edge_finder/research/hibernation.py`), so fixing the export alone gives no forecasts. | as cited | UPSTREAM (un-hibernate and export) | M |
| 6.8 | **MLB publishes no weather** ("data/weather.json = dome/notes only") during the postseason. **Soccer weather covers 55 of 127 events**, with STATUS DEGRADED from geocode failures. | capabilities `weather` | UPSTREAM | M |

## 7. Remaining Home, Research Lab and Intelligence UX gaps

| # | Gap | Evidence | Class | Size |
|---|---|---|---|---|
| 7.1 | **Home mismatch discoveries come only from the featured game, and only when it is NFL** (`Home.tsx:77-78`, `research: []`). Home's intelligence is therefore market-only on any non-NFL-featured day. The Terminal loads all NFL games (`TerminalView.tsx:95-100`). | as cited | IMPL-READY | S |
| 7.2 | **The Home summary mixes scopes**: "N games" counts today, while "N flagged for review" counts all loaded opportunities, unfiltered by day (`Home.tsx:85,96`). | as cited | IMPL-READY | S |
| 7.3 | **The Home Research Lab strip uses static copy for every sport** (`Home.tsx:140-147`, `LAB_TOOLS.sub`). A CFB- or NHL-featured Home promises "results against the spread" and "Two teams side by side". The hub adapts its copy (`ExploreView.tsx:72-79`); Home does not. | as cited | IMPL-READY | S |
| 7.4 | **The Props tool ignores the sport**: `labHref('props', slug)` returns `/props` (`labTools.ts:34`), which opens NFL. The hub tile says "Every published prop: projection, range, line, price" for soccer, tennis and CBB too (`ExploreView.tsx:75`), where none are published. | as cited | IMPL-READY | S |
| 7.5 | **"Matchup compare" promises team-vs-team for every sport** (`ExploreView.tsx:76`), but non-NFL routes to the player compare (`Compare.tsx:52`). | as cited | IMPL-READY (copy S; real feature see 5.3) | S |
| 7.6 | **Matchup discoveries are NFL-only.** `matchupInsights` is keyed to `met_nfl.*` (`src/insights/matchups.ts:32-36`), though NHL (`oa_*`), CBB (`adj_*`) and NBA (`team_adj_*`) publish opponent-adjusted ranks. | as cited | IMPL-READY (M); predictive framing VALIDATION | M |
| 7.7 | **Terminal pins and layout are per device** (localStorage, `TerminalView.tsx:32-45`). A pinned discovery silently disappears when it leaves the slate. There is no history view. | as cited | IMPL-READY (UX) / see 3.2 | S–M |
| 7.8 | **There is no "results" loop on Home or Intelligence**, i.e. yesterday's discoveries and how they settled. It depends on 3.2. | — | UPSTREAM/IMPL | M |
| 7.9 | **The Research Lab Season tool is NFL-only** (ATS and finals from the nflverse schedule). Other sports get "The calendar, day by day" (`ExploreView.tsx:77`), and their finals say only "Final" (tracker #50 limitation). | as cited | UPSTREAM (scores and closing lines per sport) | M–L |

---

## Tracker mapping concerns

These are **inferences**. `REPAIR_SPRINT_2026-10-11.md` says each row's *Issue* text is "the lane deliverable that number is matched to … an inference". #14 and #22 are confirmed mismatches and are being fixed. The rows below read like the sprint's deliverable rather than a plausible owner request, or carry a limitation that contradicts FIXED AND VERIFIED.

| # | Tracker "Issue" text | Concern (inference) |
|---|---|---|
| 4 | "Dedicated Player Prop Explorer navigation" | An owner probably asked for a **cross-sport** prop explorer. What shipped is a nav tab with NFL explorer plus MLB/NHL links; NBA game logs and prop history go unused (§1). |
| 7 | "Adjusted / raw toggle" | NFL only, while NHL and NBA publish both values (§5). The owner likely meant app-wide. |
| 9 | "Team-color-responsive design" | The row's own limitation says Team pages are "not yet" done. If the owner named Team pages (as this brief suggests), the row is not fixed. |
| 11 / 36 | "Relevant game imagery" / "Imagery quality / branded fallback" | Two rows for one deliverable. The work *removed* 30 photos and replaced none. An owner asking for "relevant game imagery" likely wanted more game-day images, not fewer (§4). |
| 19 | "Rankings on game cards" | CFB is the sport where rankings on cards matter most (AP/CFP). It shows none because the publication has no polls, so the owner's likely intent is unmet. |
| 24 / 25 | "Prominent scheme tendencies" / "Scheme-to-player matchup intelligence" | The owner may have asked for **scheme-informed projections**. What shipped is observation-only presentation (§2). |
| 33 | "Injury-source freshness and provenance" | The owner may have asked about **injury-source quality** (official reports, completeness). What shipped is labelling; the 25-per-team truncation and the missing official reports remain (§6). |
| 40 | "Kalshi-style browsing; discoverable Wong teasers" | Two unrelated features in one row. This suggests the matching guessed at an owner sentence. |
| 41 | "Price movements and open questions" | "Open questions" is ambiguous. The original ask is unclear. |
| 49 | "Per-game stat correctness; box stacking vs RB" | A compound row. The box-stacking part reads like a specific owner hypothesis, answered as "weak relationship". Check that this was the question. |
| 51 / 52 | "Intelligence cards lead to research" / "Full Intelligence-page audit" | The owner may have wanted intelligence **tied to measured market outcomes** (CLV, hit rate, settled record). What shipped is links and copy (§3). |
| 21 | "Contextual best-market indicators (validated only)" | "(validated only)" looks like the sprint's own constraint written into the issue text. |
| 29 | "Interactive simulation graphics" | What shipped is a script split chart. The owner may have meant interactive distributions or simulation exploration. Unclear. |
| 5, 10, 26, 30, 31, 32, 34, 46, 50 | (various) | Every one carries "NFL only" in its limitations yet is marked FIXED AND VERIFIED. If the owner's text was sport-agnostic, these are PARTIAL. |
| 48 vs 22 | "Top-props board with multi-select" | The owner's #22 (a prominent Top Props preview on Home) may overlap with #48's board. Check that the parallel fix for #22 and #48 do not duplicate or contradict each other. |

Verification caveat for all rows: the "VERIFIED" evidence is a presence check (see the note at the top), not acceptance against the owner's text.

