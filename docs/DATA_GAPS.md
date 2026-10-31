# Data gaps found while building Sift V1

Sift renders what the publications contain and labels the rest. These are the gaps that shape the NFL
experience today, with their source. None was "fixed" by changing a sport model.

## 1. NFL publishes no research explorer (blocking upstream defect)

* **Symptom:** `https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/explorer/index.json`
  returns 404, although nfl-edge-finder#92 (explorer adapter) is merged and RUN NFL ran on that commit.
* **Cause:** `scripts/research_export.py`, `collect_players()`:
  ```python
  for team, lst in ((g.get("game_script_inputs") or {}).get("player_opportunity") or {}).items():
      for x in lst or []:
          opp_by_id[x.get("player")] = {**x, "team": team}   # TypeError: 'str' object is not a mapping
  ```
  For `2026_04_PIT_CLE`, `player_opportunity` is a status object (`{"state": "UNAVAILABLE", …}`), not
  per-team lists. The run-nfl workflow marks the explorer step `continue-on-error`, so the v1 payload
  publishes and the explorer silently does not.
* **Fix (upstream, two lines):** skip non-list values (`if not isinstance(lst, list): continue`).
* **What Sift does meanwhile:** builds the explorer with NFL's own exporter and that guard, from the same
  run's committed inputs, verifies it with the contract, and serves it as a labelled RESEARCH SNAPSHOT
  (`scripts/refresh-nfl-snapshot.sh`, every deploy and every 3 hours). Once NFL publishes its explorer,
  the refresh becomes a no-op and Sift reads the live explorer.

## 2. NFL capability limits (from NFL's own capability manifest)

| Capability | Status | Effect in Sift |
|---|---|---|
| player_game_logs | RESEARCH (2026 rows not committed) | **Filled by Sift's history layer** (nflverse weekly stats + play-by-play, `docs/INSIGHTS.md`): player pages show game-by-game results, usage and splits. Historical games still say the publication has no per-game box scores. |
| team_game_logs | PARTIAL | Per-game *series* exist only for points for/against/margin (schedule-derived); EPA metrics are current snapshots without history. |
| rankings / time_series | PARTIAL | Rankings are current-snapshot; no "last 5" for EPA-type metrics. |
| opponent_adjustment | PARTIAL | Ridge ratings are a current snapshot; shown as such. |
| schedule_strength, play_by_play, venue_effects | UNAVAILABLE | Not shown. |
| situational_splits | PARTIAL (pressure splits for QBs only; home/away UNAVAILABLE) | QB pressure splits only. |
| usage | RESEARCH (projected shares) | Labelled "projected, not observed usage". |
| market_price_history | VERIFIED, game-level families only | Player-prop tickers have no history; Sift says so on the market screen. |

## 3. Historical games

Only games on the current packet or referenced by the wager ledger have event-research documents (51
events in this publication); each team profile lists ~55 games across four seasons. Other historical games are reconstructed only from both teams'
published game lists and series (score, date, home/away, points series, trailing mean, form around the
game). No per-game EPA, no player lines.

## 4. Smaller data quirks

* Some team display names repeat the nickname in the published data ("New York Jets Jets", "Los Angeles
  Rams Rams", "Los Angeles Chargers Chargers", "New York Giants Giants"). Sift drops the repeated word for
  display only; ids and packets keep the published name.
* One event (`2026_04_PIT_CLE`) has status `UNKNOWN` in the board.
* QB profile metrics have `unit: null` in the registry; Sift formats them generically.
* Packet text formats JSON integers as Python would only when it can tell them from floats: every NFL
  value is a float, so NFL packets are byte-identical to the Python builder; a sport publishing integer
  observation values would print `47.000` where Python prints `47`.

## 5. Other sports

MLB is explorable as a beta through the same screens. CFB is explorable as a beta, and its game page is driven
by the CFB Script Engine (`docs/CFB_SCRIPT_ENGINE.md`); its team and slate screens are the generic ones, with
the CFB publication's own (sparser) data. NBA, Soccer and Tennis are explorable on their live publications (validated 2026-10-09 against the latest
upstream commits; fixtures trimmed from the real publications by `scripts/make_sport_fixture.py`). What stays
upstream: **Soccer** — every model family is RESEARCH_ONLY, script shares are simulation shares (not calibrated), no
lineup/player layer, no xG (Dixon-Coles rates), no standings or must-win context, no club logos published; **Tennis** —
every model number is RESEARCH_ONLY (Kalshi mid Brier 0.1776 vs model 0.2193 on 15,117 settled rows), doubles have no
model, first-ball truth covers the main tours and Slams only, no injuries, draws or rankings consumed, no bet-up-to
price is ever published; **NBA** — RESEARCH authority in every family, the market beats the data-only model out of
sample in 8 of 8 families, this publication carries 0 model prices (a documented export defect), injuries come from
ESPN rather than the official report, no lineups or confirmed starters, and preseason rotations are not
representative. None of these gaps is filled by Sift: the screens say PASS where the evidence stops.

NHL is explorable (`docs/NHL.md`). Gaps that remain upstream: NHL_SCRIPT_V1 probabilities are not yet calibrated
(0 settled script forecasts when the layer shipped; the scorecard counts them); script-conditioned prices exist only
for the families the joint simulation models (moneyline, puck line, game and team totals, period results, spreads and
totals, first goal, skater goals/points/assists, goalie saves); every other market (for example overtime and early-goal
contracts) says "Model does not price this market";
opponent adjustment covers 5v5 team rates only (no special-teams or player adjustment) and is a research layer, not a
model input; goalie starts come from a lineup source and can be "projected" until confirmed; the learning stage is
"Learning" (43 settled games and 7,626 settled final-pregame contracts at release), so nothing is validated.

CFB gaps that remain upstream: no script likelihoods (not yet calibrated — they are ranked only), no
first-half/quarter/prop mapping to scripts (shown as unmappable), no player data, and injury availability is a
listing rather than a depth chart. A game the engine could not match to the football schedule shows its
markets with a notice saying so.

## 6. Live market data (market clock) — what remains impossible or limited

* **No direct browser access to Kalshi.** Kalshi's public API refuses any browser `Origin` other than
  kalshi.com (HTTP 403, no CORS headers; evidence in ARCHITECTURE.md → *The market clock*). Sift reads
  quotes from the GitHub Actions quote feed (published every 3 minutes, typically 3–8 minutes old) and, once the owner deploys it, from the
  read-only relay (15–60 s). Without the relay, quotes are near-live, not sub-minute; their real age is
  always shown.
* **No per-quote timestamp from Kalshi.** Market objects carry `updated_time`, which is a metadata time
  (e.g. listing), not when the price last changed. Sift's quote time is when the provider answered
  (Kalshi's `Date` minus `Age`, rounded down) — the time the price was known to be current.
* **Newly listed contracts have no research.** A rung or alternate line listed after the research run
  appears with Kalshi's own wording and live quote only. The publication has no `market_family`, subject
  ids, model price or price history for it, so Sift shows none and does not put it in packets (the packet's
  market rows require the publication's metadata). It becomes a full market at the next publication run.
* **Inventory is bounded by the publication's series.** The feed sweeps the Kalshi series the publication
  already uses; a brand-new series type is invisible until the sport repository maps it.
* **Availability in the packet text.** The canonical packet text has no per-market status column, so
  closed / suspended / not-listed contracts are named on the packet's MISSING line rather than per row.
* **Feed cadence is bounded by GitHub.** The feed publishes every 3 minutes from a self-chaining workflow
  loop (GitHub's cron is undependable here), and raw.githubusercontent.com caches for up to 5 minutes;
  quotes from the feed are typically 3–8 minutes old. Sub-minute quotes need the relay.
* **The live NFL publication is ahead of the bundled snapshot.** The feed maps against the live NFL
  publication (e.g. 801 markets on NE @ BUF) while research screens read the snapshot (796); the extra
  live contracts appear as *Listed on Kalshi after this research run* until the NFL explorer is repaired.

## 7. Gaps found in the redesign (pass 1)

* **Game scripts are final-margin only.** The simulation publishes five final-margin buckets per team
  (`team_volume.by_final_margin`, with conditional plays / pass / rush volume). Sift's four scripts are
  those buckets regrouped, weighted by **sim share** (not a calibrated probability). A "Shootout" script
  and exact script fit for totals, team totals, props and period markets need a **joint** output
  (margin × total × team points per simulated game, or per-script conditional distributions). The
  simulator already writes `*.scripts.json.gz`; publishing per-script conditional point distributions in
  `game_script_inputs` would unlock them.
* **Matchup advantage is sign-inverted upstream** — see `docs/MATCHUP_MATH.md`.
* **Weather / venue.** The publication carries `context.weather` (kickoff-period forecast) and
  `context.venue` for some games only; others carry the roof alone. Sift shows the forecast when present,
  "Indoor"/"Roof closed" for domes and closed roofs, and "Forecast not published yet" otherwise.
  Retractable-roof status is published only as `open`/`closed` when known.
* **Team form.** Points, EPA and success-rate ranks are published; total yards and yards per play are
  not, so the form panel uses EPA/play and success rate instead.
* **Model performance.** `performance.json` is the owner's wager ledger, not model calibration. It is not
  shown (owner-specific betting history stays out of the app until accounts exist). A sport home "model
  performance" panel needs a published calibration / closing-line report.
* **Live score, clock, possession, live stats.** No publication or Kalshi endpoint carries them. The
  publication already ingests ESPN for injuries; the lowest-risk architecture is to extend the existing
  read-only Vercel relay (or the GitHub quote-feed loop) with a `scores` path that reads one public
  scoreboard source server-side and stamps observation time, exactly like quotes. Provider choice and
  terms are an owner decision (redesign phase 5); nothing is wired yet.
* **News.** No news provider is connected; the News page is the availability wire from the publication's
  injury designations.
* **Teasers / parlays.** Kalshi lists no teaser product. The Parlays page lists Stafford Wong-eligible
  legs from market-implied spreads only; combined prices and correlation need per-leg pricing and a
  correlation model (phase 4).

## 8. Gaps found in the progressive-clarity pass

* **Man/zone coverage, routes, personnel.** nflverse `pbp_participation_2026` is not published (HTTP 404) and FTN
  charting carries no coverage field. Sift shows blitz, box, play-action and motion tendencies only; man/zone
  and route-based insights wait for that file (or a licensed charting feed). See `docs/INSIGHTS.md`.
* **Snap counts lag a week.** PFR snap counts arrive after the box scores; the newest game shows "snap count
  not published yet".
* **Player photos.** Only free-licence Wikimedia Commons photos are used (51 players this week, each checked
  by eye; 16 automatic picks were rejected). Players without one show their team mark. Licensed headshots
  (e.g. the NFL's) are not used.
* **Season hard-coded in the deploy refresh** (`build-nfl-history.mjs … 2026`): bump it with the season.

## 9. Gaps found in the surgical polish pass

* **Player history now spans two seasons.** 2026 from nflverse weekly stats + play-by-play; 2025 from weekly
  box scores and snap counts — no 2025 play-by-play is read, so 2025 has no longest plays or blitz splits.
  Home/away comes from the nflverse game id; 2025 dates and final scores appear only when nflverse's
  `schedules/games.csv` is reachable (it returned 404 on 2026-10-06). 703 players (any skill player with a game
  in either season). The builder refuses to publish a layer that lost last season (the deploy then keeps the
  committed copy).
* **No historical betting lines.** nflverse's schedule carries historical game spreads/totals, but no player
  prop lines; Sift compares past games with **today's** line only and labels it that way. Game lines in the
  schedule are deliberately unused.
* **Opponent strength for past games** is omitted: early-season samples are too thin to reconstruct an
  as-of-that-week rank defensibly, and today's rank must not be presented as if it were known then.
* **Player league ranks** are per-game averages of counting stats within a position (#1 = most), one ranking per
  completed week (a pregame view uses the weeks before its game) and one for last season. Rate stats (yards per
  carry, catch rate) are not ranked: their direction and sample rules need owner review.
* **Routes run / route participation** remain blocked (no 2026 public source).

## 10. Sport coverage audit (2026-10-31, SIFT 3.0 Workstream 4)

Every publication was re-read against the live `raw.githubusercontent.com` documents on 2026-10-31 and the committed real fixtures. What is connected is in
`docs/SIFT3.md` ("Sport coverage"); this section is what is **not**, with the precise reason. Nothing below was estimated or filled in.

* **MLB team profiles are stale; the slate is current.** The explorer index says `generated_at 2026-10-31`, but the newest *team* observation is
  `2026-08-27` (13 of 37 team metrics; the rest are completed seasons 2022 to 2025). The regular season ended 162 games in, so the team cache stopped
  about a month before it did. Team Overview, Profile, Form, Schedule, Players and the league rankings stay `gated` (capabilities.ts), re-checked by
  freshness: 65 days at the audit, outside the 21-day rule (`isCurrent`). The *event research* document (the daily slate: projected runs, win
  probability, probable pitchers, park, lineup status, form) is current (`quality.data_as_of 2026-10-28`, projections `as_of 2026-10-29`) and is
  connected, with its own freshness check (3 days). **Upstream fix:** the team-profile export in `edge-finder-api` must refresh its snapshot metrics
  (xwOBA, bullpen, opponent quality) daily again. Also not published for baseball: league ranks (observation `context` is null), injuries, weather
  values, umpires, batting orders.
* **NBA team statistics run through last season.** Every team observation is `as_of 2026-06-14` (an exponentially weighted rating "to 2026-06-14" and the
  82-game 2025-26 season); the 2026-27 games already played are not in them. The game Overview now says so under the table, and the Team and Stat
  screens stay `gated`. Also gaps NBA itself states: the official NBA injury report was never captured; the ESPN injury rows carry **no team**, so they
  are listed only for players the game's projected roster places on a team (the rest are counted); no lineups or starters; the export carries 0 model
  prices (defect §5.14); the publication's own out-of-sample verdict is that the Kalshi price beat the model in 8 of 8 families (the verdict travels with
  the number).
* **NHL.** Overview research is complete (simulation, season ranks, goalie status, designations, scripts, findings) and the Team Schedule and Players tabs
  are now connected to the current team document (82 games, season and last-10 statistics, a roster by position, designations). The Team Profile tab
  stays `gated`: its opponent-adjusted switch is football's (`ADJ_RIDGE` window) while NHL publishes its `oa_*` ratings under a `5v5 recency-weighted`
  custom window. That is a screen declaration, not missing data. Power play and penalty kill are season-only. Designations carry no team in the game
  feed (matched by name to the game's roster; unmatched ones are counted). The simulation says `sim_frozen: false` until its pregame freeze.
* **CBB.** Real research documents exist for 303 games (live 2026-10-30), but each carries 0 `matchup` rows, projection state `PENDING_WINDOW`, and only
  `matchup_pairs` (statistic names with no values). Tempo (possessions), points per possession, and the total and margin ranges exist **only** for a game
  inside the 30-hour prospective capture window; rosters, continuity and the expected rotation are published now and are connected. No injuries are
  published. The Team screens have no CBB declaration (the team document carries `ratings` and the roster). The offline tests for CBB use the publisher's
  synthetic fixture (labelled so): no real projected game is committed.
* **Soccer.** Connected: model board (1X2, mean goals, BTTS, over 2.5), six scripts with simulation shares, attack against defence ratings, rest and
  congestion, head to head, the publication's own data gaps, and the Kalshi match-result contracts as the win price. Not published: lineups, injuries or
  any player layer (so no player props: Kalshi lists match markets only), shot-based xG (mean goals are Dixon-Coles rates), standings or qualification
  context, club logos. The script engine abstains for some fixtures (`UNAVAILABLE` with its own reason, shown as such). Not built on the v3 side: a Team
  Research declaration for clubs (the club document publishes goals, points, BTTS and over-2.5 rates for the season and last 5; 7 of 14 are ranked), a
  Game Script tab (the scripts are on the Overview), and the draw contract and the handicap and exact-score ladders as Overview cards. The survivability
  rows (priced expressions) are deliberately not read: they are bet-shaped.
* **Tennis.** Connected: match-win probability (fair_v1, with its envelope and the Gen-1 and Gen-2 values), Elo, surface Elo, serve and return ability,
  serve-point sample, surface sensitivity, recency inputs, start status and warnings, the sharp references beside the Kalshi mid and the model, and the
  match-winner and total-games contracts. Not published: a model for doubles (the publication says so), win-loss form (recency and experience inputs only),
  league ranks for the ratings, court speed or altitude, injuries, draws or rankings. The publication's own settled record has the Kalshi mid out-scoring
  the model, and the model lane says so. The publication's bet selector labels are never read.
* **No real soccer or tennis event document is committed** in `fixtures/real` (the `props` family holds those sports' boards only: their games fall
  outside its research horizon). The v3 browser tests for them serve the trimmed real publications in `tests/fixtures`. **Follow-up:** capture a soccer
  and a tennis family when a slate with research documents is available.
