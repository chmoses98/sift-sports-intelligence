# NFL Slate Priorities and plain-English scripts

The NFL home answers three questions in about five seconds: which games matter, where SIFT sees something
interesting, and what to open first. It does that with a short **Slate Priorities** rail (3–5 items) beside the
featured game on desktop, and first on the page on phones. The rail is decision compression over evidence the
NFL publication already carries — it adds no model, no score and no "best bet".

Code: `src/lib/priorities.ts` (pure, deterministic rules) · `src/views/home/Priorities.tsx` (the rail) ·
`src/views/SportHome.tsx` (layout) · tests `tests/priorities.test.ts(x)` on the real week-5 publication
(`tests/fixtures/nfl-week5`) and `e2e/nfl-home.spec.ts`.

## Data path

```
nfl-edge-finder  (handicap-reports branch, app/latest — edge_finder.app.v1 + explorer/)
  board.json                         status, kickoff, recommendations_count, market_captured_at
  recommendations.json               the publication's own recommendations (0 while the model is research-only)
  explorer/events/<evt>.json         event_research:
    markets[]                        game-line contracts with the publication's captured bid/ask
    projections[].fair_probability   the model's price per market (authority RESEARCH_ONLY)
    extensions.game_script_inputs    team_volume.by_final_margin (the four scripts) + game_environment
    extensions.model_view            model_spread, model_total
    extensions.market_implied        implied_spread, implied_total_median
        │
live-quotes branch (Sift's quote feed, every 3 min) / Kalshi relay   current bid/ask + observation time
        │   src/live: useLiveQuotes → quoteView (a live quote wins only when newer than the publication's)
        ▼
SportRepo (src/data/repo.ts) → useSlateResearch / useAsync(recommendations)
        ▼
lib/scripts.ts gameScripts()  → four scripts with display titles (below)
lib/priorities.ts slatePriorities() → the rail's sections
        ▼
views/home/Priorities.tsx (links → /nfl/game/<evt> or /nfl/market/<mkt>?event=<evt>)
```

No change to `nfl-edge-finder` was needed: every field already existed in the payload.

## Who is eligible

A game is eligible only while `status === 'SCHEDULED'` and its kickoff is still in the future on the app clock.
Finished and kicked-off games never appear. A price is usable only when the market is OPEN (or its status
unknown) and its quote is FRESH (< 15 min) or AGING (≤ 30 min) — the app's market-quote policy.

## Sections

| Section | Selected when | Fields | Thresholds | Ties | Disappears / says |
|---|---|---|---|---|---|
| ⭐ **Top SIFT Edge** | A publication recommendation that is not research-only, not expired/void/settled, on an eligible game, whose market has a usable quote with ask ≤ `bet_up_to_price` and below `fair_probability` | `recommendations.json`, live quote | — | (fair − ask), then kickoff, then market id | Always shown. No recommendation → **"No strong SIFT edge yet"** (says prices are close only if every game-line gap is under 5 pts, otherwise that the model is research-only). Stale quote → "Waiting for updated markets". File unreadable → "Edge check unavailable". A model-vs-market gap on its own is never promoted to an edge. |
| 🛡️ **Works in Multiple Scripts** | A full-game moneyline or spread that always wins in ≥ 2 of the 4 scripts, those scripts covering ≥ 50 % of simulated games, priced 10–90¢ on a usable quote, with the model ≥ 2 pts above the midpoint | `markets[]`, `projections[].fair_probability`, `game_script_inputs`, live quote | `HOLDS_MIN_SCRIPTS` 2 · `HOLDS_MIN_COVERAGE` 0.50 · `HOLDS_MIN_GAP` 0.02 · `PRICE_MIN/MAX` 0.10/0.90 | coverage, then gap, then kickoff, then market id | Omitted when nothing qualifies; "Waiting for updated markets" when candidates exist but every quote is stale. Script fit is exact only for margin-settled markets (moneyline, spread), so totals and props are never claimed to work across scripts. Shown as "Supported in 2 of the 4 modeled outcome scripts (55% of simulations)". |
| 🔥 **Game to Watch** | The strongest slate standout: for each signal, the slate leader, scored by how far it stands from the week (z = (value − slate mean) / slate SD), kept only above an absolute floor | `game_environment.p_blowout_17plus` (likeliest blowout), `p_one_score` (closest), `model_view.model_total` (highest / lowest scoring), \|`model_spread` − `implied_spread`\| or \|`model_total` − `implied_total_median`\| (SIFT vs market) | z ≥ 1.5 · floors: blowout ≥ 25 %, close ≥ 50 %, total ≥ 5 pts from the slate median, disagreement ≥ 1.5 pts · needs ≥ 4 eligible games | z, then kickoff, then event id | Omitted when no leader clears the bar. Never on a game another section already points at. Unusual, not a bet. |
| 👀 **Worth a Look** | Up to two more leaders, on different games | same | z ≥ 1.0, same floors | same | Omitted when none qualify. |

**Why "Works in Multiple Scripts" and not "Holds Up Across Scripts".** The four NFL scripts are final-margin buckets
(favourite by 14+, by 7–13, within 6 either way, underdog by 7+). A moneyline or spread is decided by the final margin,
so it can *always* win in at most two of the four (e.g. Texans −4.5 wins in "Texans Win Big" and "Texans Win
Comfortably", and only sometimes in "Close Game Either Way"). The earlier label implied broad robustness the data cannot
show; the section now says exactly what it means — supported in *N* of the 4 modeled outcome scripts, with the share of
simulations those scripts cover. The rule, thresholds and ordering did not change (internally the section is still
`holds` / `holdsUp`, and its real-week-5 snapshot is unchanged).

The z ordering is a **presentation-only** rule for "which of these is most unusual this week"; it is never shown
as a number and is not a predictive model. All thresholds are named constants at the top of
`src/lib/priorities.ts` and are asserted in the tests.

Degraded states are explicit: "Reading this week's research…" while loading; "No upcoming games" when every game
has kicked off; "Scripts still processing" when no eligible game carries scripts yet.

## Plain-English script titles

The four NFL scripts are the simulator's final-margin buckets (`team_volume.by_final_margin`, regrouped from the
favourite's side). Their ids and margin ranges are unchanged; only the titles shown to people changed, in
`src/lib/scripts.ts`. The canonical bucket stays on every script as `GameScript.canonical`.

| id | Before | After (title) | Canonical |
|---|---|---|---|
| `fav-big` | Cowboys win going away | **Cowboys Win Big** | DAL by 14+ |
| `fav` | Cowboys win comfortably | **Cowboys Win Comfortably** | DAL by 7–13 |
| `close` | One-score battle | **Close Game Either Way** | Within 6 either way |
| `dog` | Buccaneers win comfortably | **Buccaneers Win Comfortably** | TB by 7+ |

Under each title, one line (`GameScript.line`): the margin, plus — only when the simulation shows it — how the teams
play in games that end that way, read from the conditional pass rates: a team whose pass rate moves 3+ points from
its average "throws more to catch up" or "leans on the run". Example (TB @ DAL, week 5): **Cowboys Win Big · 35%** —
"By 14 or more. The Cowboys lean on the run while the Buccaneers throw to catch up."

What the titles deliberately do **not** say: anything about scoring ("high-scoring, close game") or game flow
("leads most of the game", "close early, then pulls away"). The NFL publication simulates final margin and total
separately (`game_environment.score_state` is `NOT_SIMULATED`), so a joint margin × points or in-game script would
be invented.
