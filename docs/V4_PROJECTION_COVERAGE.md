# v4 player research: which approved projection feeds could support it

Audit for PR #113 (Milestone 2A). **Nothing here is activated.** No approval, feed, threshold or Kalshi route was changed;
this is a reading of what exists so the owner can decide what, if anything, to promote next. v4 Props keeps NFL as the only
sport with player research; MLB and NHL stay market-only browsing. (Update 2026-10-23: NBA is promoted and v4 Props → NBA and Game → Players show the approved projections; see the NBA section.)

Sources read: `src/lib/projectionApprovals.ts` (the decision table), `src/lib/projections.ts` (feed contract, freshness),
`src/data/projections.ts` (loader), `src/insights/propBoard.ts` (the NFL prop board), and, read-only, the live
`projection-data` feeds on 2026-10-21 (`projections/<sport>/latest.json`; each sport's own publication repo).
`tests/v4Coverage.test.ts` pins the decision-table facts below, so this document cannot drift from the table unnoticed.

## What "full v4 player research" needs

For a stat to get the NFL treatment on a player page, all of these must hold for it:

1. **One approved projection.** `projectionApprovals.ts` decides which engine is SIFT's one number. v4 shows the number
   `resolveProjection` returns and never a second one. A family that is not `PROMOTED` shows the established (legacy)
   engine's number, if the publication has one, and nothing from the foundation feed.
2. **A published distribution** (mean, p10/p90, and `thresholds` or a distribution artifact) so the model's P(YES) can
   be stated for each Kalshi rung, on the same side as the price.
3. **Player availability with a source and capture time** (`participation`), because a projection is conditional on the
   player playing, and `gate` PASS/REVIEW/BLOCK.
4. **Kalshi player markets mapped to the same player and stat** with a capture time (the ladder).
5. **A prop-board contract for the sport.** `PROP_STAT_DEFS` and the matchup ranks in `propBoard.ts` are NFL-specific
   (`met_nfl.*` simulation metrics, defense-vs-position ranks). Any other sport needs its own stat definitions and
   its own matchup source; the NFL board cannot be pointed at another sport's rows.
6. **Verified identity** between the projection's player id, the publication's participant id and the Kalshi market, before
   any headshot or comparison is shown.

## Decision table (from `projectionApprovals.ts`)

| Sport | Family | Decision | Number SIFT shows |
|---|---|---|---|
| NBA | minutes, points, rebounds, assists, threes, pra, fga | `PROMOTED` 2026-10-23 (approved fallback for a missing, stale or unpublished feed only) | foundation |
| NBA | team_points | `HELD` | established |
| MLB | pitcher_strikeouts, batters_faced, outs | `PROMOTED` (participation must be verified; strikeouts and outs have an approved fallback) | foundation |
| MLB | pitcher_walks, pitcher_hits_allowed, pitcher_runs_allowed | `HELD` | established |
| MLB | plate_appearances, hits, total_bases, home_runs, runs, rbis, hits_runs_rbis | `HELD` (hitters need a posted lineup card; no injury/IL source) | established |
| MLB | team_runs, game_total | `HELD` | established |
| NHL | shots, goals, assists, points, saves, team_goals | `RETAINED` (challenger tied, marginal or worse) | established (legacy) engine |

## Findings by sport

### NBA — promoted 2026-10-23 (seven player families); team points HELD

- **Decision.** The owner accepted three consecutive independent READY feeds and promoted `minutes`, `points`, `rebounds`, `assists`, `threes`, `pra` and `fga`
  (CRPS gains 5.8%–25.2% over the incumbent; `minutes` also removes the incumbent's −2.4 minute bias). `team_points` stays `HELD` (shadow validation, no incumbent
  comparison). See `PROJECTION_PROMOTION.md` §11.
- **What v4 shows.** Game → Players and Props → NBA resolve every player and stat through the approved authority (`src/lib/nbaProjection.ts`): one projection each,
  labelled "SIFT projection · approved for production" (or "· Low reliability" with the reason for an uncertain player). A ruled-out player, a row the quality gate
  blocked, an incoherent range, or a stat that is not READY has no number, and the panel says how many were withheld and why. The raw Foundation rows are no
  longer shown as a "research preview". Reliability describes data quality, never betting value; projections are not bet recommendations.
- **Fallback.** Approved only for a missing, stale or unpublished feed, and only if the established projection itself passes freshness, availability and quality.
  Shown alone, never beside the SIFT number, as "Established projection — The current SIFT forecast is unavailable or not yet published. Showing the established
  model's projection instead." Never for `GATE_BLOCK`, `INCOHERENT` or a ruled-out player.
- **Finding: the fallback has no data today.** The established NBA publication carries `model_prices: 0` and no per-player projections. A stale or missing feed therefore
  shows no number and the reason. Wiring a loader into `NBA_ESTABLISHED_ROWS` is the only change needed once rows exist.
- **Props → NBA** lists only games the feed can be matched to by team and start time. With no feed it shows "No matched upcoming forecasts".
- **Still not verified here.** That feed ids (`espn:<id>`) map one-to-one onto Kalshi's NBA player markets, and any Kalshi ladder comparison: v4 NBA shows projections only,
  with no market price, edge or recommendation.

### MLB — pitchers only, and nothing to show today

- **Promoted families are pitcher-only:** `pitcher_strikeouts`, `batters_faced`, `outs`, with `requiresVerifiedParticipation`
  (the projection is withheld unless the pitcher is the confirmed or probable starter). Every hitter family is `HELD`
  pending posted lineup cards and an injury/IL source, so hitter props cannot have projections.
- **The feed is empty right now.** On 2026-10-21 the MLB feed's slate says "No MLB games start in the next 20 hours
  (offseason / off-day)": 0 players, 0 families. Its shape and a real pitcher row could not be inspected in this audit.
- **Kalshi ladders** exist (v4 lists the player markets on each game page) but their pitcher stat names, thresholds and
  identity mapping to the feed were not verified.
- **To enable:** a pitcher-only v4 surface needs a sample of real pregame rows to confirm `thresholds` and participation,
  a pitcher stat-definition set, and the mapping of `participation` to Kalshi's starter markets.
  Hitters stay out until the owner's lineup-card and IL conditions are met.

### NHL — a feed exists, but nothing is approved for display

- **Feed:** 2026-10-21, `pf-nhl pf-nhl-1.0.0`, 584 player rows over 4 games: shots, goals, assists, points (all `SHADOW
  VALIDATION`), saves (`NEEDS IMPROVEMENT`), team_goals, toi_minutes. Rows carry thresholds, a participation call from
  DailyFaceoff lines (all `LIKELY_ACTIVE`, i.e. projected, never confirmed; 0 teams with official confirmation) and gates
  (495 `PASS`, 89 `REVIEW`; the reasons are identity, confidence, role and starter checks).
- **Decision:** every NHL family is `RETAINED`: the foundation challenger was tied, marginal (below the 1% materiality
  floor) or worse. The established engine is the number SIFT would show, and saves are worse than the incumbent.
  v4 therefore must not show these foundation rows as projections.
- **What the app says now:** v4 Props states that the NHL publication carries no simulated player projection and links to the
  game's player markets. That sentence is about the *established* publication; it does not describe the foundation feed.
  Whether the established NHL engine publishes a player distribution v4 could use was **not verified**; if it does not, the
  copy stays accurate, and if it does, the copy needs revisiting once someone checks.
- **To enable:** the owner would need to promote at least one family (new evidence, or a reviewed decision), after which the
  board needs hockey stat definitions, goalie-start handling for saves, and an identity check (the feed uses NHL
  numeric ids).

## What is and is not changed by this audit

- (2026-10-23) The seven NBA player rows were promoted and the v4 NBA surfaces now read the authority; nothing else in the approvals table changed.
- No v4 surface for MLB or NHL player projections exists or was added. MLB and NHL keep the market-only browsing that
  PR #113 ships; v4 still never shows a projection the approvals table does not authorise.
- Anything marked **not verified** above is an open question for the owner or for a follow-up with real rows, not a finding.

## CFB yardage ranges that start below zero (2026-10-22)

The published CFB player feed has a negative 80% lower bound (`p10`) for 238 of 424 `rushing_yards` rows and 524 of 893 `receiving_yards` rows
(feed `2026-10-21T20:56Z`); the lowest is -20, and 9 rushing means are negative. Until now v4's coherence rule treated *any* negative value in a
row as "corrupt" and dropped the row without saying so, which hid 56% of the rushing forecasts (e.g. quarterbacks' rushing) as well as the receiving ones.
The two stats are not the same case. Evidence: ESPN player box scores (sportsdataverse `espn_cfb_player_box`), 2016-2019 and 2021-2025:

| stat | player-game lines | share below 0 | by role / volume |
|---|---|---|---|
| rushing yards | 93,347 | 17.7% | quarterbacks 28.4%; non-QBs 14.3%, falling to 0.9% at 5-8 carries |
| receiving yards | 116,854 | 2.4% | 5.0% at one catch, 1.4% at two, 0.4% at three, about 0% above |

- **Rushing: legitimate, now shown.** NCAA rushing yardage is net of sacks, so quarterbacks and low-carry players are often negative. A published
  rushing `p10` of -3 (-13 for a quarterback) matches these frequencies. `NEGATIVE_FLOOR` (`src/lib/projections.ts`) lets `rushing_yards` carry a
  negative mean, median or range down to -30, the lowest value the model's own lattice allows (`cfb/project.py`); anything lower is still corrupt.
  The range is shown exactly as published, with one line saying why it can be negative.
- **Receiving: a model artifact, still withheld, now said.** Fewer than 5% of even one-catch lines are negative, yet 59% of published receiving rows put
  at least 10% of their probability below 0. The yardage distribution is a residual distribution fitted on all receivers in 6 bins (`cfb/project.py`,
  lattice from -30), so low-volume bins inherit negative residuals from higher-volume players. The mean and upper bound are not implicated, but the lower
  bound is not a realistic floor (zero is). v4 does not clamp it (that would silently rewrite a published value) and does not show it as a forecast; the
  panel now says how many stat forecasts were withheld and that receiving-yards ranges starting below 0 are a model artifact.
- **Not done here:** correcting the receiving distribution (fit the residuals within the low-volume bins, or model zero-inflation) changes a validated
  model's numbers and belongs in `cfb-edge-finder` with its own validation. Until it ships, those receiving rows stay withheld. All CFB player
  families remain unapproved shadow research.
