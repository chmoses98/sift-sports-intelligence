# v4 player research: which approved projection feeds could support it

Audit for PR #113 (Milestone 2A). **Nothing here is activated.** No approval, feed, threshold or Kalshi route was changed;
this is a reading of what exists so the owner can decide what, if anything, to promote next. v4 Props keeps NFL as the only
sport with player research; MLB and NHL stay market-only browsing, and NBA has no v4 Props surface.

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
| NBA | minutes, points, rebounds, assists, threes, pra, fga | `APPROVED_PENDING_LIVE_INPUTS` | established (legacy) engine |
| NBA | team_points | `HELD` | established |
| MLB | pitcher_strikeouts, batters_faced, outs | `PROMOTED` (participation must be verified; strikeouts and outs have an approved fallback) | foundation |
| MLB | pitcher_walks, pitcher_hits_allowed, pitcher_runs_allowed | `HELD` | established |
| MLB | plate_appearances, hits, total_bases, home_runs, runs, rbis, hits_runs_rbis | `HELD` (hitters need a posted lineup card; no injury/IL source) | established |
| MLB | team_runs, game_total | `HELD` | established |
| NHL | shots, goals, assists, points, saves, team_goals | `RETAINED` (challenger tied, marginal or worse) | established (legacy) engine |

## Findings by sport

### NBA — closest to eligible, blocked by one owner decision and two input checks

- **Evidence is done.** All seven player families beat the incumbent on holdout (CRPS gains 5.8%–25.2%), and `minutes` also
  removes the incumbent's −2.4 minute bias. They are held *only* for live availability inputs.
- **The live feed is running.** On 2026-10-21 the feed (`pf-nba pf-1.2.1`, generated 15:38Z, 11 games) carries 2,660 player
  rows across the seven families, all `READY`, each with a distribution (`thresholds`, p10/p90), an opportunity block and an
  opponent adjustment. Participation is read from `nba_official_injury_report` (300 `LIKELY_ACTIVE`, 47 `CONFIRMED_OUT`,
  29 `UNCERTAIN` (16 of them from ESPN injuries), 4 `LIKELY_OUT` in the points family).
- **Not yet cleared in the approvals table.** The table still says the official injury report path "has not run on live
  data" and that ESPN pregame starters are unverified. The feed above shows the report path now runs; no one has recorded
  that as the live proof, and `LIKELY_ACTIVE` is a projection, not a confirmation. Gate status in the same feed is mixed
  (96 `PASS`, 237 `REVIEW`, 47 `BLOCK` per family), so most rows would be withheld or shown with a reliability caveat.
- **Identity.** Feed ids are `espn:<id>`. Whether they map one-to-one onto the NBA publication's participants and onto
  Kalshi's NBA player markets is **not verified** here.
- **Kalshi ladders.** Whether the NBA publication lists Kalshi player markets with capture times is **not verified** here.
  The opportunity layer separately says the NBA publication prices no contract and its own study finds the market beating
  its model in 8 of 8 families, so a v4 NBA surface would be research only.
- **To enable (all outside this PR):** (a) the owner records the live-input proof and changes the approval rows, which is
  the only way a promotion happens; (b) a basketball stat-definition set and matchup source for the board; (c) an identity
  check against the NBA participants and Kalshi tickers; (d) the gate/participation states shown as v4 already does for NFL.

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

- No approval row, engine choice, freshness window, fallback or `MAX_AGE_H` changed.
- No v4 surface for NBA, MLB or NHL player projections exists or was added. MLB and NHL keep the market-only browsing that
  PR #113 ships; v4 still never shows a projection the approvals table does not authorise.
- Anything marked **not verified** above is an open question for the owner or for a follow-up with real rows, not a finding.

## CFB yardage ranges that start below zero (2026-10-22)

The published CFB player feed has a negative 80% lower bound (`p10`) for 238 of 424 `rushing_yards` rows and 524 of 893 `receiving_yards` rows
(feed `2026-10-21T20:56Z`); the lowest is -20. v4 shows every published number exactly as published and adds one line saying what a negative bound
means for that stat (`rangeNote`, `src/v4/ProjectionPanels.tsx`). The two stats are not the same case. Evidence: ESPN player box scores,
sportsdataverse `espn_cfb_player_box`, 2016-2019 and 2021-2025 (2020 not used):

| stat | player-game lines | share below 0 | by role / volume |
|---|---|---|---|
| rushing yards | 93,347 | 17.7% | quarterbacks 28.4%; non-QBs 14.3%, falling to 0.9% at 5-8 carries |
| receiving yards | 116,854 | 2.4% | 5.0% at one catch, 1.4% at two, 0.4% at three, about 0% above |

- **Rushing: legitimate.** NCAA rushing yardage is net of sacks, so quarterbacks and low-carry players are often negative. A published rushing
  `p10` of -3 (or -13 for a quarterback) is consistent with these frequencies; v4 says why and changes nothing.
- **Receiving: a model artifact.** Fewer than 5% of even one-catch lines are negative, yet 59% of published receiving rows put at least 10% of their
  probability below 0. The yardage distribution is a residual distribution fitted on all receivers in 6 bins (`cfb/project.py`, lattice from -30), so the
  low-volume bins inherit negative residuals from higher-volume players. The upper bound and mean are unaffected by this reading, and coverage is, if
  anything, conservative, but the lower bound is not a realistic floor; zero is. v4 does not clamp it (that would silently rewrite a published value);
  it says the bound is a model artifact.
- **Not done here:** correcting the distribution (fit the residuals within the low-volume bins or model zero-inflation) changes a validated model's
  numbers and belongs in `cfb-edge-finder` with its own validation. The families remain unapproved shadow research.
