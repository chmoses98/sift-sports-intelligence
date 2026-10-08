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

When `nhl_scripts_v1` is missing, or has `status` `NOT_SIMULATED` or `FAILED`, the game page says so ("No
game scripts yet", "The script layer failed for this game", "No NHL script layer for this game"), followed by the
publisher's own reason (for example, a game whose latest simulation predates the script layer). It shows no scripts
or candidates instead of inventing them. Markets and the live market clock are unaffected.

## Team identity

All 32 clubs resolve through one table, `src/lib/nhlTeams.ts` (tricode, city, nickname, conference, division, plus the
aliases other feeds use: `LA`, `NJ`, `SJ`, `TB`, `UTAH`…). Logos are the NHL's own `_dark` SVGs, rasterized once to
256 px WebP by `scripts/teams/fetch-nhl-logos.mjs` (the Team logos workflow) and committed under
`public/teams/nhl/<TRICODE>.webp`; `src/lib/nhl-team-logos.json` records each source. `teamLogo('NHL', …)` and
`teamColors('NHL', …)` both go through the table, so the slate, hero, market rows, goalie and player cards can never
disagree. `scripts/check-dist.mjs` fails the build unless all 32 logos ship; `tests/nhl.story.test.tsx` checks every
club. The tricode is always visible text beside a logo, so identity never depends on an image.

## Screens

| Route | Screen | Notes |
|---|---|---|
| `#/nhl` | NHL home (`views/nhl/NhlHome.tsx`) | compact header (schedule day, games, live / final counts), Model and Prices freshness pills, the research-status pill; the slate; *Research that survives the scripts* (robust/moderate, never goal scorers); *Research status* |
| `#/nhl/slate` | slate (`views/nhl/NhlSlate.tsx`) | the same rows, grouped by the NHL (Eastern) schedule day |
| `#/nhl/game/:id` | game (`views/nhl/NhlGame.tsx`, sections in `story.tsx`) | tabs: Story, Scripts, Markets, Players, Matchup, Trends (`?tab=candidates` → Markets, `?tab=lineups` → Players) |
| `#/nhl/market/:id` | market | the generic market page plus stratum 02, *NHL research: does it survive the game scripts?* (`NhlMarket.tsx`) |
| `#/nhl/team/:id` | team | season record, next game, *Opponent-adjusted strength* (adjusted next to raw on the same games) |
| `#/nhl/player/:id` | skater or goalie (`NhlPlayer.tsx`) | role in the next game, season table, game log, priced markets, goalie saves by script |
| `#/nhl/scorecard` | scorecard (`NhlScorecard.tsx`) | sample, projection vs market, expected goals, windows, script model, research candidates by robustness, what is not known, learning gates, versions |

**Slate row:** puck-drop time (or LIVE / FINAL with the final score), each team on its own line with logo, tricode,
nickname, its expected or confirmed goalie and status, and the model's win probability; then the projected total
with its scoring word, the most likely script with its probability, the number of robust or moderate research ideas.
"Goalie unconfirmed", "Pregame research frozen" and aging/stale freshness show on the row only when they apply.

**Game page, Story tab (also the mobile order):** hero (logos, records, venue, puck drop; the final score once
final) → summary strip (win-probability split in team colours, projected total with its 90% range, most likely
script, overtime; Model / Prices / Goalies freshness and the research pill) → for a started game, the frozen note;
for a final, *Review* → *How this game is most likely to play* (headline, the shape in two or three sentences, the
drivers: team strength, pace, shot generation, goaltending, special teams, home ice, schedule, lineups) → *Game
scripts* (all seven, compact) → *Goalie matchup* → *Market fit* → *Special teams* → *Player research* → *What
matters*.

## How the story is derived (`src/lib/nhlStory.ts`)

Sift computes no probability. Every number is published, or an exact identity over published numbers: expected
shots, starter saves and power-play goals across scripts are Σ P(script) × E[x | script] over the seven mutually
exclusive scripts. The words are fixed templates:

* **Headline**: the favourite from the simulation's win probability (< 53% "coin flip", < 60% "slight edge",
  < 68% "favoured", else "clear favourite"), the most likely script, and the scoring environment (the model's total
  against its own league baseline, 2 × league goals per 60; ±0.4 goals is "average").
* **Shape**: whether one script dominates (≥ 40%), the top two are within 5 points, or the top script leaves most
  games elsewhere; which team has the stronger control-and-pull-away branch (a 3-point gap or more); open vs tight.
* **Market fit** groups the published research candidates by their published survival bits: goal-scorer contracts
  (`player_goals`, `first_goal`) → *High-variance research* (collapsed, never featured); fails in the most likely
  script and survives < 50% of simulated games → *Conflicts with the thesis*; robust → *Survives multiple scripts*;
  moderate and holds in the most likely script → *Fits the projected game*; anything else → *Script-dependent*.
* **Contradiction check**: a pair is flagged when the model's own relation says OFFSETTING / PARTIALLY_CONTRADICTORY,
  or when two ideas that each survive ≥ 45% of simulated games survive together in < 25% (they need different games,
  e.g. one team dominating vs. the other goalie facing few shots). "No contradictory pair" is stated when none is.
* **Goalie matchup**: status, confidence and last update from the publication's goalie timeline; save %, even-strength
  save %, GAA and starts from the goalie's profile (the last season with 20+ starts, the current season beside it
  marked as a tiny sample); workload from the game log; the model goalie factor; shots faced and saves as script
  expectations; the saves market closest to even money with model vs market. No goals-saved metric is published,
  so none is shown. An unconfirmed starter gets a gold card and a plain warning.
* **Player research**: every priced player prop grouped by player and team (team from the script matrix), role from
  the line combinations (Line n / Pair n · PP1), model probability beside the market midpoint, and the script where
  the point chance is highest and lowest. Goal props are marked high variance. No shots-on-goal prop is published.

## Freshness and game state

* **Model**: CURRENT ≤ 1 h, AGING ≤ 6 h, STALE beyond (the publisher's own health thresholds); a STALE slate shows a
  visible warning. After puck drop it is FROZEN, never stale.
* **Prices**: the market clock (CURRENT < 15 min ≤ AGING ≤ 30 min < STALE).
* **Goalies**: from the newest goalie observation (CURRENT ≤ 3 h, AGING ≤ 12 h).
* **Phase**: UPCOMING before the scheduled start; LIVE after it even when the publication still says SCHEDULED;
  FINAL only when published. A live score is never shown (a periodic publication's live score is stale by
  construction); the final score prefers the publisher's postmortem.

**Started games keep their research.** The NHL model only simulates games that have not started, so the exporter
now freezes each started game at its last pregame simulation (`nhl_scripts_v1.frozen`, `frozen_from_run`,
`extensions.sim_frozen`; NHL-edge-finder `docs/research/SCRIPTS_V1.md` §8). Sift labels it "Frozen at puck drop",
shows research-run prices (not live ones) on candidates and says live prices move with the score. For a FINAL game
with a script postmortem, `nhl_scripts_v1.outcome` drives *Review*: the realized script, its pregame probability
and rank, and the script forecast's Brier score against league base rates.

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
publication capture is never labelled "Live".

The feed reads NHL's board with the same slate rule as NFL (`scripts/live-quotes/slate.mjs`). Staleness is judged
per sport: if the NHL board stopped refreshing, NHL's games are left out of the feed (and its index `sport_status`
says why) while NFL and MLB keep publishing, and the reverse. The whole cycle is refused (the last good feed stays
up) only when no sport carries a current game with markets. The relay, which is the primary quote source, is
unaffected. NHL's board marks games FINAL as they finish, so a working NHL capture never trips this rule.

The research tray and the handicap packet use the contract's
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
* `tests/nhl.story.test.tsx`: all 32 logos and aliases, phases, freshness, the projection identities, the thesis,
  goalie states, market fit and the contradiction check, player research, missing scripts, and the started/final
  slate (`tests/fixtures/nhl-final`: the real 2026-10-07 publication after puck drop, with two reviewed finals).
* `e2e/nhl.spec.ts`: home, game story, unconfirmed goalie, direct links / refresh / back-forward, tablet and 360 px,
  scripts, market fit, markets, market, team, skater, goalie, scorecard, search, tray → packet, and the started /
  final slate. Also axe, no horizontal overflow and visual baselines, on phone, desktop, iPhone and iPhone SE.
* `scripts/production-check.mjs`: the live NHL home, a game and the scorecard after each deploy.
