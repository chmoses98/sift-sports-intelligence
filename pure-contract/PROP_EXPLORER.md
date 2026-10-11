# Combined Player Prop Explorer contract (`prop_explorer_projection.v1`)

A versioned, additive projection contract for the Combined Player Prop Explorer, plus a standard-library
validator and converter. Research tooling only. It makes no accuracy claims, changes no SIFT screen, isn't
imported by the app build, and has nothing to do with wagers, staking or model authority. `pure_gate.py` and
`pure_forecast.v1` are unchanged: every explorer projection embeds (or references) one valid `pure_forecast.v1`
row.

| File | What it is |
|---|---|
| `schema/prop_explorer_projection.v1.schema.json` | JSON Schema (2020-12) for both record types; the `forecast` field `$ref`s `pure_forecast.v1` |
| `prop_explorer.py` | Normative validator and converter, `validate` / `convert` CLI (Python 3.10+, stdlib only, imports `pure_gate`) |
| `types/prop_explorer_projection.v1.d.ts` | TypeScript declarations the app **may** import later. Nothing in `src/` imports them today |
| `tests/test_prop_explorer.py` | Unit tests for every rule below |
| `examples/prop_explorer/` | Examples built from **real** committed research outputs of the three sport repositories (see the Examples section) |

## Two record types, two files

* **`projection`** (`prop_explorer_projection.v1`) is one model's forecast of one player-game-statistic at one
  cutoff, with everything the explorer shows about it. It never carries a market price, a line, a recommendation
  or a stake.
* **`market_comparison`** (`prop_explorer_market_comparison.v1`) is optional and written by the downstream market
  reader. It's keyed by the same identity and used for side-by-side display only. It never carries model output and
  never feeds a PURE model, its training population, its evaluation population or its scoring.

The validator refuses a file that mixes the two types.

## The projection record

Every field listed is **required**. A value the source doesn't provide is an explicit `null`, and its dotted
path in `null_reasons` says why. A missing key is refused, and so is an unexplained null.

| Field | Content and rules |
|---|---|
| `schema_version`, `record_type`, `research_only` | `"prop_explorer_projection.v1"`, `"projection"`, `true` |
| `explorer_id` | `sport\|game_id\|player_id\|statistic\|model_version\|cond or unc\|as_of`, checked |
| `identity` | `sport, game_id, player_id, statistic, model_version, model_frozen_hash, conditional_on_playing, as_of`. Each must equal the forecast's value |
| `forecast` / `forecast_ref` | The embedded `pure_forecast.v1` row (validated by `pure_gate`, v0 refused), and/or `{uri, model_signature}` where `model_signature = "sha256:" + pure_gate.model_signature(row)`. A ref-only row is resolved with `validate --forecasts` |
| `capture` | `captured_at`, `capture_mode` (`prospective_pregame`: as_of ≤ captured_at < kickoff; `historical_research_replay`: built later from a historical output), `builder` |
| `player` | `name, position, team_id, team_abbr` (nullable). Player and team identity |
| `game` | `kickoff` (= forecast kickoff), `season, season_type, week, home_team_id, away_team_id, opponent_team_id, is_home`. These are opponent and game facts, cross-checked with each other when known |
| `distribution` | `unit`, `quantiles` (must include and agree with p10/median/p90 and every `forecast.projection.quantiles` entry; q strictly ascending, values non-decreasing), `pmf` (`[{value, probability}]` or null; sums to 1; its mean and every P(X ≥ t) agree with the forecast within 1e-3) |
| Mean, median, threshold probabilities | Stay **inside the embedded forecast**: `forecast.projection.{mean, median, thresholds}`. The ladder is strictly ascending in strikes and monotone non-increasing (pure_gate), one row per player-game-stat, never one row per rung |
| `expected_workload` | `measure` (snaps, snap_share, minutes, plate_appearances, batters_faced, pitches, outs_recorded, time_on_ice, …), `unit`, `mean, median, p10, p90`, `lineage` of kind `self` (this row is the workload statistic), `sibling_forecast` (same player-game, model, conditionality and cutoff; `statistic` + `model_signature`, cross-checked when the sibling is in the file) or `feature` (one feature_lineage value; median/p10/p90 null) |
| `drivers` | Named entries of the forecast's `feature_lineage`: `feature, label, role, matchup_role, value, source, observed_at`. Value, source and time must equal the lineage entry. `matchup_role`: `opponent_input` (describes the opponent), `opponent_adjusted` (a model stage that consumed opponent inputs), `not_matchup`. A driver the model didn't read isn't a driver |
| `game_script` | Sports-only script scenarios: `conditioning: team_final_margin`, `perspective_team_id`, `exhaustive`, `source {model_version, model_frozen_hash, class: sports_only, description}`, `scenarios [{scenario_id, label, margin_min, margin_max, probability, probability_kind: simulation_share or model_probability, projection {mean, median, p10, p90} or null}]`. When exhaustive, probabilities sum to 1, margin bands tile the integers (open at both ends), and if every scenario is projected, Σ p·mean matches the forecast mean within max(2%, 0.05). A market spread or total never defines or weights a scenario |
| `uncertainty` | `p10_p90_width` (= p90 − p10), `interval_nominal_coverage: 0.8`, `holdout_interval_coverage {observed, n_rows, n_games, scope, evidence_id}` or null, taken from the source's scorecard; `evidence_id` names an evidence entry |
| `freshness` | `as_of`, `source_max_observed_at`, `staleness_seconds` (= as_of − source_max_observed_at), `oldest_input_observed_at` (earliest lineage time), `kickoff_lead_seconds` (= kickoff − as_of). All recomputed and checked |
| `validation` | `status` (closed enum below), `research_only: true`, `scope {season_type, seasons, statistics, population}`, `source_verdict` (the source's verdict, verbatim), `compared_against`, `evidence [{id, kind, repo, commit (pinned hex), path, url}]`, `caveats` |
| `change_explanation` | Null for a first capture. Otherwise: `prior {explorer_id, as_of (< this as_of), model_version, model_signature}`, `model_changed`, `delta {mean, median, p10, p90}` (current − prior, checked against the prior row when it's in the file), `method`, `attributed_drivers`. `driver_value_diff` lists the drivers whose value changed and makes no attribution. `producer_attribution` adds `contribution` per driver plus `unattributed`, summing to `delta.mean` |
| `provenance` | Optional: `repo, commit, path, file_sha256, selection, conversion` of the source row |
| `null_reasons` | `{dotted path: reason}`. Every null outside the embedded forecast needs a reason, and every reason must name a null. Scenario margin bounds (null = unbounded) and change-explanation values that mirror lineage are exempt |
| `x_*` | Producer metadata; keys still scanned |

### Validation status

| Status | Meaning | Required evidence |
|---|---|---|
| `RESEARCH_HISTORICAL_ACCEPTED` | Passed its preregistered rule on a chronological historical holdout. Research only, never promotion | `preregistration` + `results` evidence, the verbatim `source_verdict`, a scope whose `statistics` contains this row's statistic (and whose `season_type`/`seasons` cover the game when both are known) |
| `SHADOW_PROSPECTIVE` | Being collected prospectively in shadow, with no matured verdict | `shadow_collection` evidence; `capture_mode` must be `prospective_pregame` |
| `INCONCLUSIVE` / `REJECTED` | The preregistered test was inconclusive or failed | `results` evidence |
| `BLOCKED_DATA` | The evaluation can't be run | a caveat naming the missing data |
| `NOT_VALIDATED` | No acceptance test of its own (an incumbent or a baseline used as a comparator) | none |

Mapping from sport-repo verdicts: `ACCEPTED_CHALLENGER` (research only, historical holdout) →
`RESEARCH_HISTORICAL_ACCEPTED`, limited to its evaluated scope. `REJECTED`, `INCONCLUSIVE` and `BLOCKED_DATA`
map to themselves. Champions and baselines that were only comparators → `NOT_VALIDATED`. Labels that overstate
evidence are refused. The status is a closed enum, so `VALIDATED`, `PROFITABLE` and the like can't appear. In
`source_verdict`, `caveats`, `scope.population` and `null_reasons`, words such as *validated, verified, proven,
profitable, profit, guaranteed, certified, edge, +EV, ROI* are refused unless a nearby negation qualifies them
("not yet validated" passes). Driver and scenario labels get the market check instead, because "edge rusher" is
a football term.

### Hard separation from markets

* `pure_gate`'s market vocabulary check (`scan_keys`) runs over **every key** of the projection, including the
  embedded forecast and `x_*`. Kalshi, sportsbook, odds, spread, moneyline, price, market, implied, closing line,
  over/under, quote, settlement and similar terms are all refused.
* The projection also refuses betting-recommendation keys: recommendation, pick, lean, stake, kelly, bankroll,
  edge, ev, fair, line, venue, payout, roi, units.
* Driver labels and features, scenario ids and labels, and the script source are value-scanned for market terms.
  Player and team names are not scanned, because a pitcher can be named Price.
* The market-comparison record refuses model-output keys anywhere: forecast, projection, distribution, drivers,
  mean, median, p10, p90, quantiles, thresholds, pmf, model_version, model_probability, fair_probability, edge,
  ev, recommendation, stake, kelly, pick. Its rungs are strictly ascending, prices lie in [0,1] with bid ≤ ask, and
  `listed_at ≤ quoted_at ≤ captured_at`. Its identity can't spell a rung (`receiving_yards_over_60`). When it
  names a `projection_explorer_id`, that projection must exist and share its identity.

## Backward compatibility and the converter

`pure_forecast.v1` rows stay the unit of exchange. An explorer projection embeds one unchanged and only adds
fields around it. `convert` builds explorer projections from a v1 JSONL and a context JSON:

```bash
cd pure-contract
python3 -I prop_explorer.py convert --forecasts pure_forecasts.v1.jsonl --context context.json --out explorer.jsonl
python3 -I prop_explorer.py validate --projections explorer.jsonl [--forecasts v1.jsonl] [--market market.jsonl]
```

The context provides what v1 rows don't carry: `capture`, `players`, `games` (or `game_defaults` /
`game_id_pattern`), `units`, `workload {measure, unit, statistic}`, `drivers[model_version][feature]
{label, role, matchup_role, null_value_reason}`, `validation[model_version]`,
`coverage[model_version][statistic]`, `null_reasons` (paths may use `[*]`) and `provenance`. The converter:

* refuses v0 rows (convert them with the sport's own converter first, as the NFL example does);
* fills the workload from the sibling forecast;
* builds the drivers from `feature_lineage` and refuses an uncatalogued feature;
* computes freshness;
* writes `change_explanation` (`driver_value_diff`) when the input holds several captures of the same
  player-game-statistic and model;
* refuses to emit any null the context doesn't explain;
* refuses to overwrite an existing output, since captures are write-once.

## Mapping to the app's Combined Prop Explorer

The explorer is on `main` (`src/views/explore/PropExplorerView.tsx` and `src/insights/propBoard.ts`, from the
fidelity-b/c redesign, merged). The table below is how a future adapter would map this contract onto the app's
current shapes. **No app code changes in this PR.**

| App today | Contract field |
|---|---|
| `PropRow.playerId / name / role / team / opp` | `identity.player_id`, `player.name / position / team_*`, `game.opponent_team_id / is_home` |
| `PropRow.projection` ("simulation mean · research") | `forecast.projection.mean` |
| `PropRow.range` (`rangeOf`: needs p05, p25, p50, p75, p95) and `QuantileDist` points | `distribution.quantiles`. The current sources publish p10/p50/p90 only, so `rangeOf` would return null for them. An adapter should draw the quantiles that exist and never interpolate p05/p95 |
| `Rung.modelP` ("shadow model P(over)", research) | `forecast.projection.thresholds` P(X ≥ t), at exact strikes only. For integer statistics P(X ≥ 80) is the over-79.5 probability, and nothing is interpolated between strikes |
| `Rung.yesBid / yesAsk / noAsk / marketP`, `PropRow.line`, `PropRow.price` | `market_comparison.rungs` only, never the projection |
| `extensions.market_implied` game context (implied score / total / spread) | market data, never the projection or a script |
| Matchup panel (`UNIT_PAIRS` unit ranks) | `drivers` with `matchup_role` `opponent_input` / `opponent_adjusted` (model inputs with lineage). The unit-rank panel itself stays the app's own research layer |
| Scripts panel (`ScriptSet`: final-margin buckets lead14+ / lead7-13 / within6 / trail7-13 / trail14+, "sim share") | `game_script` with `conditioning: team_final_margin`, `probability_kind: simulation_share`, bands such as `{margin_min: 14, margin_max: null}` and `{-6, 6}`. Today the app says "player projections by script are not published"; `scenarios[].projection` is where a producer would publish them |
| `ShadowState` (`PROJECTABLE_NOT_YET_VALIDATED`, …) | a different thing (the shadow pricer's support state). The model's evidence status is `validation.status` |
| "SIFT read" reasons / risks | `drivers[].label` / `validation.caveats`. Nothing is generated beyond what the record carries |
| `FreshChip` (`captured_at` age) | `capture.captured_at`, `freshness.staleness_seconds`, `freshness.kickoff_lead_seconds` |

## Examples (real research outputs)

`examples/prop_explorer/` holds one player-game per sport, picked deterministically (the first
`(game_id, player_id)` in sorted order with the listed statistics in both arms). Each source row is copied
verbatim from a sport repository's committed research output, pinned by commit and file sha256 in
`sources/SOURCES.json`.

| Sport | Source (repo @ commit) | Arms → status |
|---|---|---|
| MLB | `edge-finder-api` @ `6a50874` (PR #283), `data/research/pitcher_workload_joint/holdout_2025_2026/*.pure_v1.sample300.jsonl` | `mlb_pitcher_workload_joint_v1` → `RESEARCH_HISTORICAL_ACCEPTED` (2025–2026 regular season; postseason BLOCKED_DATA in caveats); champion `pitcher_prop_projection@params_asof_2026-10-07` → `NOT_VALIDATED` |
| NFL | `nfl-edge-finder` @ `762d69d` (PR #135), `research/pure_player_v1/sidecars/SAMPLE_2025_wk15-18.*` (v0, converted with the repo's own `pure_player_v1_v1sidecar.py --frozen git:0441dfc`) | `pure-player-v1.0.0` → `RESEARCH_HISTORICAL_ACCEPTED` (primary scope 2024+2025); `pure-ewm-baseline-1.0.0` → `NOT_VALIDATED` |
| NBA | `nba-edge-finder` @ `1742b74` (PR #21), `docs/research/w1_nba/sidecars_sample/pure_sim_{rotation,challenger}_unc.v1.jsonl.gz` | champion `NBA_BASELINE_2026_PRESEASON_V1:sim-rotation` → `NOT_VALIDATED`; `sim_challenger` (RATE_PRIOR_5) → `REJECTED` |

None of these sources provides player names or teams, a pmf, a script-conditional projection or a second
capture. In the examples those fields are therefore explicit nulls with reasons: `player.*`,
`game.opponent_team_id`, `game.is_home`, `distribution.pmf`, `game_script` and `change_explanation`. NFL
season, week and home/away come from the nflverse `game_id` convention. MLB and NBA season facts come from the
source documents' population definitions. Holdout coverage is read from each source's committed scorecard by
`make_contexts.py`. There's no market-comparison example because none of the sources holds a matching quote;
the tests use synthetic records for it.

```bash
cd pure-contract
python3 -I examples/prop_explorer/build_examples.py --check   # examples rebuild byte-for-byte from sources + contexts
# Regenerating the sources/contexts needs local checkouts of the sport repos (not run in CI):
python3 -I examples/prop_explorer/extract_sources.py --mlb <path>/edge-finder-api --nfl <path>/nfl-edge-finder --nba <path>/nba-edge-finder --out examples/prop_explorer/sources
python3 -I examples/prop_explorer/make_contexts.py  --mlb <path>/edge-finder-api --nfl <path>/nfl-edge-finder --nba <path>/nba-edge-finder --out examples/prop_explorer/contexts
```

## Limitations

* `validate` checks an exported artifact. The lineage times, driver roles and status evidence are the producer's
  claims, which is why statuses must cite pinned evidence. Runtime market independence is proven only by
  `pure_gate rerun` in the sport repo.
* `matchup_role` is a classification taken from the model's code. It isn't a measured effect, and
  `driver_value_diff` isn't a causal attribution.
* The script mixture check needs every scenario projected. A partly projected script is validated structurally only.
* Status describes evidence for a **model version within its scope**. It isn't a statement about one row's accuracy.
