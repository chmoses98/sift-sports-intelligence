# The insight layer — how Sift tells you what matters

Sift opens every game on conclusions, not tables: *"Bills rush offense has a major edge"*, *"Falcons season
passing numbers mix 2 starting quarterbacks"*, *"Buccaneers blitz often — watch how Packers answer"*. Each
conclusion is computed by a pure function over published documents (`src/insights/`), carries the numbers
behind it one tap down, and never changes a model probability, a projection or a published metric.

## Sources

| Layer | Source | Refresh | Where |
|---|---|---|---|
| Ratings, ranks, projections, scripts, markets | The NFL publication (`edge_finder.app.v1`) | every publication run | `public/data/nfl/app/latest` (snapshot) or the live root |
| Player game logs, quarterback starts, scheme counts | nflverse public releases: `stats_player_week`, `play_by_play`, `snap_counts`, `ftn_charting` (2026); `stats_player_week`, `snap_counts`, `schedules/games.csv` (2025) | every deploy (3 h), committed copy as fallback | `public/data/nfl/history` via `scripts/history/build-nfl-history.mjs` |
| Player photos | Wikimedia Commons, free licences only | on demand (`player-images.yml`) | `public/players/nfl`, credits in `src/lib/player-images.json` |

nflverse data is CC-BY 4.0; FTN charting is © FTN Data, CC-BY-SA 4.0 (attribution on Data & provenance and in
each scheme card). Team counts are stored **per week**, so a game's pregame view aggregates only the weeks
before it; player game logs are cut at the game's week (`gamesBefore`). A game's own result is never mixed
into its pregame research.

## Matchup edges (`insights/matchups.ts`) — requirement 11

* Pairs: run, pass, pass rush vs protection, big plays, turnovers, early downs, red zone, overall.
* Each unit's strength is `(N − rank) / (N − 1)` from the publication's direction-aware ranks (opponent-adjusted
  ratings; red zone from the season profile). The edge is the strength gap: **clear** ≥ 0.35, **major** ≥ 0.55
  with the stronger unit in the top 40% and the weaker in the bottom 40%.
* Ordered by gap × area weight; at most two per offense; the aggregate "overall" pair yields to a specific
  run/pass pair. No offense+defense number is computed (see `MATCHUP_MATH.md`).
* "Why it matters" lines quote the simulation (designed runs, dropbacks, pass rate when trailing) or the QB's
  published under-pressure split with its approximate sample.

## Context that matters (`insights/context.ts`) — requirement 18

* **Quarterback change**: starts = the quarterback with the most dropbacks in each game (≥ 10). When the depth
  chart's QB1 did not start every game, the note names who started which weeks and the team EPA per dropback
  with each (with dropback counts). It says the season ranks "may understate/overstate" the current offense
  only when the gap is ≥ 0.15 EPA per dropback.
* **Key absence**: a skill starter out/doubtful who played this season (season numbers were built with him).
  A player absent all season is not news — the numbers already reflect it.
* **Returning**: a depth-chart starter who missed games before this one.
* Notes are explanations, never adjustments (`adjustment: 'none'`); the script deep view shows them too.

* **Key absence** notes need a real role: at least 35% of snaps, 8 carries or 4 targets per game in the games
  played. Such an absence also appears in the game's Injuries That Matter, so the two panels never disagree.

## What Matters ordering (`insights/matters.ts`)

Matchup edges and context notes share one importance scale. An edge's score is its strength gap × area weight
(a clear edge ≈ 0.45, a major one 0.6–1.0). A quarterback change scores 1.0 for a new starter, 0.85 when the
current starter started at most half the games, 0.5 otherwise, +0.15 when the EPA-per-dropback gap is large.
A key absence scores 0.15 + 0.5 × the player's snap share (an every-down player ≈ a major edge; a committee
back sits below the clear edges). A returning starter 0.35; one scheme note at most, at 0.4. The five highest
are shown, highest first.

## Player history (`history/stats.ts`, `views/player/history.tsx`)

* Windows: Last 5 · Last 10 (both span seasons) · this season · last season. Rows carry their season; a mixed
  window labels last season's games ("'25 W17").
* Every comparison is with **today's** line ("3 of 5 above today's line of 89.5"); no historical line is
  published or implied. The chart's line is labelled "Today's line".
* Ranks: per-game averages of counting stats within a position, #1 = most, ties share a rank, minimum games =
  half the most-played player's games. This season's ranking is read through the last week before the game.
* Is today's projection unusual? The summary says whether it sits above or below the window's average, or
  outside every game in the window.

## Scheme (`insights/scheme.ts`, `history/team.ts`) — requirement 14

| Relationship | Status |
|---|---|
| Team blitz frequency (FTN `n_blitzers > 0` on dropbacks) | **Live** — ranked when ≥ 60 charted dropbacks |
| Offense EPA per dropback vs the blitz | **Live** — ranked when ≥ 30 blitzed dropbacks |
| RB share of targets vs the blitz (vs no blitz) | **Live** — shown when ≥ 20 targets vs the blitz and the gap ≥ 8 pts |
| Stacked boxes (8+) vs the run, play action, pre-snap motion | **Live** (scheme table) |
| QB under pressure vs clean pocket | **Live** from the publication's QB profiles |
| Player share of targets vs the blitz | **Live** on player pages (Splits) |
| Man vs zone usage; player performance vs man/zone | **Blocked** — nflverse `pbp_participation_2026` is not published (404); FTN charting has no coverage field |
| Routes run, route participation | **Blocked** — no 2026 public source; would need a licensed tracking/charting feed |
| Personnel groupings | **Derivable next** — needs `pbp_participation` (offense/defense personnel) when published |

Scheme insights only pair tendencies with sample sizes ("When blitzed, Atlanta throw to their running backs on
30% of targets (9 of 30)"); they never claim cause.

## Props to watch (`insights/props.ts`) — requirement 13

Candidates: players with a simulated distribution and a priced line (the rung nearest 50¢). "Reason to care" =
0.5 × role size + 0.3 × matchup extremity + 0.2 × projection-vs-line separation; at most one prop per player,
one quarterback passing line per list. Cards show projection, typical range (25th–75th percentile), low/high
ends (5th/95th), the line, the opposing unit's rank and recent results against that line.

## News (`insights/news.ts`) — requirement 17

importance = severity (out/IR 3, doubtful 2.5, questionable 1.3) × role (QB starter 3, skill starter 2, WR2 1.6,
projected 1.1, others 0.6, kickers 0.3) + 2.5 if the publication's own key questions name the player; × 0.3
when the player has not played all season. critical ≥ 7, high ≥ 4 lead; medium and routine are one tap down.
Quarterback changes and weather flags are news too.

## Findings (`research/findings.ts`) — requirement 5

The research tray holds findings, not games. A finding is a contract `research_tray` item anchored to what it
rests on (METRIC for a matchup, MARKET for a prop, TEAM for context/scheme, PLAYER otherwise), with
`extra.x = finding:<kind>:<key>` (so findings stay distinct) and the finding written out as the contract
`note`, which the packet prints beside the item. The packet format is unchanged.
