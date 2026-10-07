# NHL on Sift: the research vertical

NHL uses the same Sift product as NFL and CFB (the hero, tabs, panels, the live price token, the market board, the
research tray and the packet). It is driven by the NHL research layer that `chmoses98/NHL-edge-finder` publishes:
**NHL_SCRIPT_V1** game scripts from the joint simulation, script-conditioned prices and survival, research
candidates, opponent-adjusted team strength and a learning report. The methodology is in that repository
(`docs/research/SCRIPTS_V1.md`). This page covers what Sift reads and how it shows it.

Everything on these screens is **RESEARCH ONLY**. Sift places no orders, holds no betting credentials and has no
order endpoint. A research candidate is an observation and nothing is staked from Sift. Actual routed wagers are
reported only by the publisher's accounting ledger and are never mixed with research candidates.

## Where the data comes from

The NHL publication (`NHL-edge-finder`, branch `data-archive`, `app/latest`, an `edge_finder.app.v1` explorer).
Paths come only from `explorer/index.json` and from the documents' own paths ("a client never guesses a path").
No contract type changed: the NHL layer travels in the contract's open `extensions` slot and as registered
metrics.

| What | Where in the publication | Decoder |
|---|---|---|
| Scripts, script-conditioned markets, survival, candidates | `event_research.extensions.nhl_scripts_v1` | `readNhl` in `src/lib/nhl.ts` |
| Matchup findings with their basis | `event_research.extensions.nhl_matchup_v1` | `readFindings` |
| Packet one-liners (scripts, candidates) | `event_research.context.notes` | the packet builder, unchanged |
| Opponent-adjusted team strength | metrics `met_nhl.oa_*` (raw value in `extensions.raw_value`) | the team page's `NhlStrength` |
| Learning stage and scorecard | metric `met_nhl.model_learning_stage`, `extensions.learning_v1` | `readLearning` |
| Capability status | `explorer/capabilities.json`: `opponent_adjustment` and `schedule_strength` are `RESEARCH` | generic |

When `nhl_scripts_v1` is missing, or has `status` `NOT_SIMULATED` or `FAILED`, the game page says so ("Not
simulated yet", "The script layer failed for this game", "No NHL script layer for this game"). It shows no scripts
or candidates instead of inventing them. Markets and the live market clock are unaffected.

## Screens

| Route | Screen | Notes |
|---|---|---|
| `#/nhl` | NHL home (`views/nhl/NhlHome.tsx`) | learning badge, featured game, today's games, research candidates across the slate, biggest matchup edges, learning panel |
| `#/nhl/slate` | slate | the generic slate on NHL data |
| `#/nhl/game/:id` | game (`views/nhl/NhlGame.tsx`) | tabs: Overview, Scripts, Candidates, Markets, Matchup, Lineups, Trends |
| `#/nhl/market/:id` | market | the generic market page plus stratum 02, *NHL research: does it survive the game scripts?* (`NhlMarket.tsx`) |
| `#/nhl/team/:id` | team | season record, next game, *Opponent-adjusted strength* (adjusted next to raw on the same games) |
| `#/nhl/player/:id` | skater or goalie (`NhlPlayer.tsx`) | role in the next game, season table, game log (goalies: games they played, W/L/OTL, relief), priced markets, goalie saves by script |
| `#/nhl/scorecard` | scorecard (`NhlScorecard.tsx`) | sample, projection vs market, expected goals, windows, script model, research candidates by robustness, what is not known, learning gates, versions |
| `#/nhl/metric/…`, `#/nhl/ranking/…` | generic metric and ranking screens | NHL metric categories (opponent-adjusted, advanced, model inputs, model quality, official) |

**Game overview, in order:** hero (rink fallback, "Puck dropped" after the start), projection strip (model
expected goals, win probability next to the market's), **What Matters** (the findings that move the game, each
with its basis), **How It Could Play Out** (each script's probability as a number, no decorative bar),
**Research Candidates**, **Goaltending**, **Lines & Special Teams**, form and injuries.

**Scripts tab:** each script with its supporting and opposing evidence, what it depends on, the model outputs
inside it, and the markets it helps and hurts. Below that, the cross-script matrix (*Which markets survive which
scripts*). It is a table at 720px and wider; on phones each market is a disclosure card, so the page never scrolls
sideways.

**Markets tab:** the live market board. Rows the NHL model prices show its probability and survival. Rows it does
not price say **"Model does not price this market"** and keep their live quote. No model price is invented.

## What the numbers mean

* **Script probability**: the share of the 10,000 joint simulated games that fall into the script. The seven
  scripts are mutually exclusive and sum to 100%. Scripts are classified by precedence: special teams decide it,
  open game, tight low-event game, goaltending steals it, home control, away control, back-and-forth.
* **EV**: per $1 contract at the research run's executable ask for that side, after Kalshi fees and the
  conservative haircut (the model probability shrunk toward the market).
* **Survival**: the share of simulated games in the scripts where the side stays at least +1¢. It is probability
  mass, not a count of scripts.
* **Robustness**: *Robust* means at least +2¢ overall, at least 65% of mass survived and at least three major
  scripts. *Moderate* means at least +1¢, 45% of mass and two major scripts. Anything else with positive EV is
  *Fragile*. *Negative EV* means it does not survive. *Unavailable* means the data-quality gate failed.
* **Research status** comes from the publisher's governance: funded research (nominal stakes, never placed by
  Sift), shadow only, or rejected. The stake type is always labelled.
* **Candidate order** is by robustness first, not raw edge. A candidate that duplicates a higher-ranked thesis is
  marked and down-weighted.
* **Bet up to** is the highest ask at which the candidate still clears its conservative fair value. When the live
  ask is above it, the row says so.

## Raw vs opponent-adjusted

Only `met_nhl.oa_*` metrics are opponent-adjusted (`nhl-oppadj-1.0`: recency-weighted ridge on 5v5 rates, as-of,
walk-forward). Everywhere they appear they are labelled *opponent-adjusted* and shown next to the raw number on the
same games. Findings carry a basis: **Opponent-adjusted**, **Model**, **Availability** or **Raw**. Raw statistics
are context and are never presented as the reason for an edge. Opponent adjustment is a research layer. It is not
an input to the projection model, and the capability manifest says `RESEARCH`.

## Learning state

The learning stage is read from real counts in the publisher's learning report. It is a status: it grants no
authority, and ROI is never a criterion.

| Stage | Gate |
|---|---|
| Learning | fewer than 100 settled games or 1,000 settled final-pregame contracts |
| Calibration building | at least 100 settled games and 1,000 settled final-pregame contracts |
| Evidence emerging | at least 300 games, 200 settled script forecasts, 500 candidate CLV observations, Brier within 0.005 of the market in both halves, no family biased beyond 0.03 at n ≥ 200 |
| Validated | at least 800 games, 600 script forecasts, Brier at or below the market in both halves, candidate CLV > 0 with a 95% interval excluding 0 at n ≥ 1,000, scripts beating the base rate |

The scorecard prints the gate progress ("contracts 7,626 of 1,000 · games 43 of 100") and a *What we still do not
know* list. Sift never shows "Profitable" or "Proven".

## Live quotes and the packet

NHL markets use the same market clock as every sport. The relay comes first and the GitHub quote feed is the
fallback. `scripts/publish-live-quotes.mjs` lists NHL next to NFL, and there is no NHL-specific fetcher. A
publication capture is never labelled "Live". The research tray and the handicap packet use the contract's
`edge_finder.handicap.nhl.v1` protocol. An NHL game packet carries the script distribution and the research
candidates (with survival and stake type) as context notes.

## Load budget

The NHL home reads the board-level documents and event research only. It never reads players, series, rankings,
team pages or market history (`tests/nhl.packet.test.tsx`). Event research documents stay under 400 KB each. The
NHL screens are lazy chunks, so NFL pages do not download them.

## Tests

* `tests/nhl.test.tsx`: decoding, findings basis, learning, injuries, hockey market language, and every NHL
  screen rendered from a trimmed real publication (`tests/fixtures/nhl`, made by `scripts/make_nhl_fixture.py`).
* `tests/nhl.packet.test.tsx`: the NHL packet (notes, determinism) and the load budget.
* `tests/live/feed-publisher.test.ts`: the quote feed maps NHL publication games to Kalshi game keys.
* `e2e/nhl.spec.ts`: home, game, scripts, candidates, markets, market, team, skater, goalie, scorecard, search,
  tray → packet. Also axe, no horizontal overflow and visual baselines, on phone, desktop, iPhone and iPhone SE.
* `scripts/production-check.mjs`: the live NHL home, a game and the scorecard after each deploy.
