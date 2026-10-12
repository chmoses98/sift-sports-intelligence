# Combined Player Prop Explorer contract (`prop_explorer_projection.v1` and `.v2`)

A versioned projection contract for the Combined Player Prop Explorer, plus standard-library validators, a
converter and an upgrader. Research tooling only. It makes no accuracy or value claims, changes no SIFT screen,
isn't imported by the app build, and has nothing to do with wagers, staking or model authority. `pure_gate.py` and
`pure_forecast.v1` are unchanged: every sports-only explorer projection embeds (or references) one valid
`pure_forecast.v1` row.

* **v1** (`prop_explorer_projection.v1`): one model's sports-only forecast of one player-game-statistic, with no
  market data at all. The sections from "Two record types" to "Examples (real research outputs)".
* **v2** (`prop_explorer_projection.v2`): one **row** per player-game-statistic as the redesigned explorer shows
  it: every projection side by side (best validated, independent sports-only, market-informed best-accuracy),
  current Kalshi quotes, edge after fees and spread, bet-up-to price, and computed display labels that encode the
  display rules. See "v2: the explorer row".

| File | What it is |
|---|---|
| `schema/prop_explorer_projection.v1.schema.json` | JSON Schema (2020-12) for both v1 record types; the `forecast` field `$ref`s `pure_forecast.v1` |
| `prop_explorer.py` | v1 normative validator and converter, `validate` / `convert` CLI (Python 3.10+, stdlib only, imports `pure_gate`) |
| `types/prop_explorer_projection.v1.d.ts` | v1 TypeScript declarations the app **may** import later. Nothing in `src/` imports them today |
| `schema/prop_explorer_projection.v2.schema.json`, `prop_explorer_v2.py`, `types/prop_explorer_projection.v2.d.ts` | The same three for v2 (`validate` / `upgrade` CLI; `validate` also reads v1 files) |
| `tests/test_prop_explorer.py`, `tests/test_prop_explorer_v2.py` | Unit tests for every rule below |
| `examples/prop_explorer/` | v1 and v2 examples built from **real** committed research outputs of the three sport repositories, plus clearly **synthetic** v2 display-rule fixtures (see the Examples sections) |

## Versioning

`schema_version` names the major version, and a validator refuses versions it doesn't know. Additive, optional
fields stay inside a version: v1 gained the optional `validation.strict_rule_verdicts`, and v1 rows without it are
unchanged and valid. A new required field or a new record shape gets a new `schema_version`. v2 is a new major
version because the record is a different shape (one row holding several projections, market quotes and labels)
with new required fields. v1 stays readable: `prop_explorer_v2.py validate` validates a v1 file with the v1 rules,
and every sports-only v2 projection embeds its v1 record unchanged, so a v1 reader can take the records out of a
v2 row.

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
| `validation` | `status` (closed enum below), `research_only: true`, `scope {season_type, seasons, statistics, population}`, `source_verdict` (the source's verdict, verbatim), `compared_against`, `evidence [{id, kind, repo, commit (pinned hex), path, url}]`, `caveats`, and optionally `strict_rule_verdicts` (below) |
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

#### Strict-rule verdicts (`validation.strict_rule_verdicts`, optional, additive)

A machine-readable list of what each strict preregistered test returned, for this row's model or for a sibling
lane of the same sport, so a caveat such as "the MLB hitter challenger was rejected" can't be lost in prose. Each
entry: `model_version, lane, rule ("strict_preregistered"), verdict, disposition, scope {season_type, seasons,
statistics, population}, row_label, promoted (always false), evidence_ids, summary`.

| `verdict` | Allowed `disposition` |
|---|---|
| `ACCEPTED_CHALLENGER` | `PRESERVED_NOT_PROMOTED` (kept for research collection; nothing is promoted) |
| `REJECTED`, `INCONCLUSIVE` | `REJECTED_INCUMBENT_UNCHANGED`, or `SCOPE_BLOCKED` when the scope stays blocked |
| `BLOCKED_DATA` | `SCOPE_BLOCKED` |

Rules: `evidence_ids` name `validation.evidence` entries (preregistration + results unless `BLOCKED_DATA`);
`row_label: BLOCKED_NOT_VALIDATED_POSTSEASON` needs a postseason scope and `SCOPE_BLOCKED`; the summary gets the
overstatement check. A negative verdict on **this row's own model version** whose scope covers the row (statistic,
season type, season) **forces** `validation.status` (`REJECTED` → `REJECTED`, `INCONCLUSIVE` → `INCONCLUSIVE`,
`BLOCKED_DATA` → `BLOCKED_DATA`), and if its statistic matches, the row's `game.season_type` must be known. Verdicts on
other model versions are lane context and bind nothing.

The MLB examples carry the MLB lanes' verdicts (all from open edge-finder-api research PRs, pinned at their heads):

| Model version | Lane | Scope | Verdict → disposition | Source |
|---|---|---|---|---|
| `mlb_pitcher_workload_joint_v1` | pitcher props | 2025–2026 regular season | `ACCEPTED_CHALLENGER` → `PRESERVED_NOT_PROMOTED` | #283 |
| `mlb_pitcher_workload_joint_v1` | pitcher props | 2026 postseason (46 starts, 25 games) | `REJECTED` → `SCOPE_BLOCKED`, row label `BLOCKED_NOT_VALIDATED_POSTSEASON` | #284, #286 |
| `mlb_pitcher_workload_joint_v1+postseason_regime_v1` | pitcher props | 2026 postseason | `REJECTED` → `SCOPE_BLOCKED`, row label `BLOCKED_NOT_VALIDATED_POSTSEASON` | #284 |
| `mlb_pitcher_workload_joint_leash_v1` | pitcher props | 2025–2026 regular season (reused holdout) | `REJECTED` → `REJECTED_INCUMBENT_UNCHANGED` | #288 |
| `MLB_HITTER_W2_PURE_V1` | hitter props | 2026 regular season (43,686 player-games) | `REJECTED` → `REJECTED_INCUMBENT_UNCHANGED` | #285 |

The NFL examples carry the NFL PURE player lane's later challengers (nfl-edge-finder), both `REJECTED` →
`REJECTED_INCUMBENT_UNCHANGED` with `PURE_PLAYER_V1` kept as the PURE arm: `PURE_PLAYER_V1_1` (2023–2024 holdout,
#137, merged) and `PURE_PLAYER_V1_2` (primary 2024–2025, #153, open draft). They also cite the xpass dependency
audit (`source_audit` evidence): nflfastR `xpass` takes `vegas_wp`, built from the closing `spread_line`, so
`pass_oe` / PROE and PROE-based team ratings are indirectly market-derived, and `PURE_PLAYER_V1` reads none of them.

So an MLB pitcher-challenger row for a postseason game can only be `REJECTED`, and no MLB hitter challenger has any
accepted status. `make_contexts.py` reads the #284, #288, #137 and #153 verdicts from their committed scorecards and
asserts the #285, #286 and xpass-audit wording at the pinned commits instead of typing them in.

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
| MLB | `edge-finder-api` @ `6a50874` (PR #283), `data/research/pitcher_workload_joint/holdout_2025_2026/*.pure_v1.sample300.jsonl` | `mlb_pitcher_workload_joint_v1` → `RESEARCH_HISTORICAL_ACCEPTED` (2025–2026 regular season only; preserved, not promoted). Strict-rule verdicts: its 2026 postseason test `REJECTED` (#284), postseason rows `BLOCKED_NOT_VALIDATED_POSTSEASON` (#286), and the MLB hitter sports-only challenger `REJECTED` (#285). Champion `pitcher_prop_projection@params_asof_2026-10-07` → `NOT_VALIDATED` |
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

## v2: the explorer row (`prop_explorer_projection.v2`)

One record (`record_type: "explorer_row"`) per player-game-statistic and conditionality at one `snapshot_at`. It
is a **display record**: it carries market data, so it never feeds a PURE model, its training population, its
evaluation population or its scoring. The validator, `prop_explorer_v2.py`, recomputes every derived field
(selection, labels, edges, fees, bet-up-to prices, matchup lists, freshness) and refuses a row whose stored value
differs. A consumer should show the stored labels and never re-derive them.

### The row

Every field is required. A null outside the embedded v1 records needs a reason in `null_reasons`, except where
null has a fixed meaning (listed in `prop_explorer_v2.null_paths`: quote prices = no resting order, computed rung
fields, `importance_rank` when not ranked, calibration metrics not reported, `value_scope` when the value is not
tested, and the like).

| Field | Content and rules |
|---|---|
| `schema_version`, `record_type`, `research_only` | `"prop_explorer_projection.v2"`, `"explorer_row"`, `true` |
| `row_id`, `identity` | `sport\|game_id\|player_id\|statistic\|cond or unc\|snapshot_at`; `snapshot_at` is before kickoff |
| `capture` | v1 `capture` shape; `captured_at ≥ snapshot_at`, before kickoff when `prospective_pregame` |
| `player`, `game` | v1 shapes and cross-checks; must equal those of every embedded v1 record |
| `projections[]` | Every projection of this player-stat (below), including REJECTED and BLOCKED ones, so the explorer can show why they're not used |
| `best_validated_projection_id` | The projection with the highest **accuracy** status among `ACCURACY_PROMOTED` / `ACCURACY_ACCEPTED_RESEARCH`; null (with a reason) only when none has one. Never REJECTED or BLOCKED |
| `sports_only_projection_id` | The highest displayable projection with `market_informed: false` (the independent track); null only when there is none |
| `primary_projection_id` | What the explorer leads with: the best validated projection, else the highest displayable one; null only when every projection is REJECTED / INCONCLUSIVE / BLOCKED |
| `market` | Current Kalshi quotes or null: `venue: "kalshi"`, `event_ticker`, `captured_at`, `quotes [{contract_ticker, at_least, yes_bid, yes_ask, no_bid, no_ask, last_price, observed_at}]`. YES pays when the statistic ≥ `at_least`. Prices in dollars in (0,1), bid ≤ ask, strikes strictly ascending, `observed_at ≤ captured_at ≤ snapshot_at` and before kickoff |
| `market_evaluation` | Null without quotes. `evaluated_projection_id` (displayable only), `fee_model`, `slippage_per_contract`, `min_edge`, `max_quote_age_seconds`, and `rungs`: one entry per quote and side (yes, then no) |
| `display_label` | Computed (below) |
| `freshness` | `snapshot_at`, `projections_as_of_max`, `inputs_max_observed_at` (latest over projections), `market_observed_at_max` (latest quote, null without quotes), `kickoff_lead_seconds` |

### A projection inside the row

| Field | Content and rules |
|---|---|
| `projection_id`, `role` | Unique id; `champion`, `challenger`, `baseline`, `best_accuracy`, `other` |
| `model` | `model_id` (stable family id for the explorer), `model_version`, `model_frozen_hash` |
| `provenance` | `market_informed` (bool), `market_derived_inputs [{input, dependency: direct\|indirect, market_source: sportsbook\|kalshi\|other_exchange\|settlement\|unknown, derivation}]`, `source {repo, commit, path}` or null. `market_informed` is true **exactly** when the list is nonempty. An indirect input counts: NFL PROE / `pass_oe` and PROE-based team ratings (nflfastR `xpass` takes `vegas_wp`, which is built from the closing spread), ratings fitted to sportsbook lines, a parameter fitted on settlement values (the MLB champion's postseason outs shift). A driver whose name or label uses market vocabulary must be listed (an undisclosed market input is refused) |
| `explorer_projection` | The embedded `prop_explorer_projection.v1` record, required when `market_informed` is false (it's the proof, through `pure_gate`, that the inputs are sports-only), and null when true |
| `outcome` | `unit, mean, median, p10, p90, quantiles, thresholds, pmf`: the threshold ladder P(X ≥ t) (strikes strictly ascending, probabilities non-increasing), quantiles including 0.1/0.5/0.9, optional pmf (v1 consistency rules) |
| `expected_workload`, `game_script`, `uncertainty` | v1 shapes and rules |
| `drivers` | v1 driver fields plus `importance_rank` (1 = most important, unique) and `importance_basis` (`not_ranked`, `producer_attribution`, `model_structure`). Every `observed_at` ≤ `as_of` |
| `matchup` | `opponent_team_id` (= `game.opponent_team_id`), `opponent_inputs` and `opponent_adjusted_by` (the drivers whose `matchup_role` says so), `opponent_adjusted` (either list nonempty). Derived, checked |
| `calibration` | `status` (`CALIBRATED`: passed a preregistered calibration criterion, citing calibration / results / value_results evidence; `ASSESSED`: metrics reported, no pass/fail rule; `MISCALIBRATED`; `NOT_ASSESSED`: everything null), `metrics {interval_coverage_80, threshold_ece, brier, log_loss, crps, calibration_slope}`, `sample_size {n_rows, n_games}`, `scope`, `evidence_id` |
| `freshness` | `as_of`, `inputs_max_observed_at`, `staleness_seconds`, `oldest_input_observed_at`, `kickoff_lead_seconds`; `oldest ≤ inputs_max ≤ as_of ≤ kickoff`, `as_of ≤ snapshot_at` |
| `validation` | `accuracy_status`, `value_status`, `research_only`, `accuracy_scope`, `value_scope`, `source_verdict`, `compared_against`, `evidence` (v1 kinds plus `value_results`, `calibration`, `promotion_decision`), `caveats`, `strict_rule_verdicts` (v1 shape and binding rule) |

A sports-only projection must **mirror** its v1 record: model, outcome, workload, script, uncertainty, freshness,
drivers (same order) and matchup equal what the v1 record proves; the accuracy scope, source verdict, comparators
and strict verdicts are the v1 ones; evidence starts with the v1 evidence and caveats keep every v1 caveat.

### Accuracy promotion and value promotion are separate

| `accuracy_status` | Meaning | Needs |
|---|---|---|
| `ACCURACY_PROMOTED` | Promoted as the best-accuracy projection | preregistration + results + promotion_decision evidence, source verdict, scope covering the row |
| `ACCURACY_ACCEPTED_RESEARCH` | Passed its preregistered accuracy rule on a chronological holdout; research only, not promoted (v1 `RESEARCH_HISTORICAL_ACCEPTED`) | preregistration + results, source verdict, scope covering the row |
| `ACCURACY_SHADOW_PROSPECTIVE` | Collected prospectively, no matured verdict | shadow_collection |
| `ACCURACY_NOT_TESTED` | No accuracy test of its own (incumbent, baseline) | none |
| `ACCURACY_INCONCLUSIVE`, `ACCURACY_REJECTED` | The preregistered test was inconclusive / failed | results |
| `ACCURACY_BLOCKED_DATA` | Can't be evaluated | a caveat |
| `BLOCKED_NOT_VALIDATED_POSTSEASON` | A postseason row of a lane whose postseason is blocked (the MLB shadow collector's row label) | a postseason game and a caveat |

| `value_status` | Meaning | Needs |
|---|---|---|
| `VALIDATED_VALUE` | Value against executable Kalshi prices after fees and spread was demonstrated by a preregistered test | preregistration + value_results evidence, a `value_scope` covering the row, `calibration.status: CALIBRATED`, a **sports-only** projection that isn't REJECTED / BLOCKED |
| `VALUE_SHADOW_PROSPECTIVE` | Prospective value collection, no matured verdict | shadow_collection, value_scope |
| `VALUE_INCONCLUSIVE`, `VALUE_REJECTED` | The value test was inconclusive / failed | value_results, value_scope |
| `VALUE_BLOCKED_DATA` | Can't be evaluated | a caveat |
| `VALUE_NOT_TESTED` | No value test (`value_scope` is null) | none |

A v1 status maps to the v2 accuracy statuses `RESEARCH_HISTORICAL_ACCEPTED` → `ACCURACY_ACCEPTED_RESEARCH` or
`ACCURACY_PROMOTED`; `SHADOW_PROSPECTIVE` → `ACCURACY_SHADOW_PROSPECTIVE`; `INCONCLUSIVE` → `ACCURACY_INCONCLUSIVE`;
`REJECTED`, `BLOCKED_DATA` and `NOT_VALIDATED` → their counterparts or `BLOCKED_NOT_VALIDATED_POSTSEASON`. A binding
strict-rule verdict forces the status: its `row_label` when it has one, else `REJECTED` → `ACCURACY_REJECTED`,
`INCONCLUSIVE` → `ACCURACY_INCONCLUSIVE`, `BLOCKED_DATA` → `ACCURACY_BLOCKED_DATA`. So an MLB pitcher challenger
row for a postseason game can only be `BLOCKED_NOT_VALIDATED_POSTSEASON`. Nothing in the committed examples is
`ACCURACY_PROMOTED` or `VALIDATED_VALUE`; every value status there is `VALUE_NOT_TESTED`.

### Display rules (validator rules and the computed labels)

1. **REJECTED / BLOCKED never lead.** A projection whose accuracy status is `ACCURACY_REJECTED`,
   `ACCURACY_INCONCLUSIVE`, `ACCURACY_BLOCKED_DATA` or `BLOCKED_NOT_VALIDATED_POSTSEASON` can't be the best validated,
   primary or sports-only projection and is never priced (`evaluated_projection_id`). Selection must pick the
   highest status, so a weaker projection can't be shown in place of a better one.
2. **Market-informed is always labelled.** If the primary projection (the best validated / best-accuracy one) is
   market-informed, the row's `display_label` is `MARKET_INFORMED`, whatever the edges are, and every rung priced
   with a market-informed projection is `MARKET_INFORMED`. Its edge against the market is never labelled as
   independent value, and a market-informed projection can't hold `VALIDATED_VALUE`.
3. **Disagreement without demonstrated value is research.** A rung priced with a sports-only projection is
   `RESEARCH` unless that projection is `VALIDATED_VALUE` inside its value scope and `CALIBRATED`. Only then can a
   rung be `VALIDATED_OPPORTUNITY`, and only when its edge after fees and spread is > 0 and ≥ `min_edge`.

Rung `display_label`, first match wins:

| Label | When |
|---|---|
| `MARKET_INFORMED` | the evaluated projection is market-informed |
| `NOT_EXECUTABLE` | no ask on that side |
| `STALE_QUOTE` | `quote_age_seconds` > `max_quote_age_seconds` |
| `RESEARCH` | value not demonstrated for this row (rule 3) |
| `VALIDATED_OPPORTUNITY` | edge after fees > 0 and ≥ `min_edge` |
| `NO_EDGE` | otherwise |

Row `display_label`: `NO_ELIGIBLE_PROJECTION` when there is no primary projection; else `MARKET_INFORMED` when the
primary is market-informed; else `VALIDATED_OPPORTUNITY` when any rung is; else `RESEARCH`.

### Price arithmetic (recomputed)

Per rung and side, with the evaluated projection's probability `p` at **exactly** that strike (a quote at a strike
the ladder doesn't hold is refused; nothing is interpolated), `p_no = 1 − p_yes`:

* `executable_price` = that side's ask; `spread` = ask − bid;
* `fee_per_contract`: `kalshi_general_taker` = rate × multiplier × P × (1 − P), rounded up to the cent
  (`ceil_cent`) or unrounded (`none`), the app's `kalshiFee` with rate 0.07; or `flat_per_contract`;
* `edge_after_fees` = p − ask − fee(ask) − `slippage_per_contract` per $1 contract;
* `bet_up_to_price` = the highest price on the `price_tick` grid at which the edge after fees is still > 0 and
  ≥ `min_edge` (null when none).

`min_edge`, slippage and the quote-age limit are the producer's stated parameters, not evidence. The contract
publishes no stake, Kelly fraction or recommendation: such keys are refused anywhere in a row.

### Upgrade from v1 and the v2 examples

```bash
cd pure-contract
python3 -I prop_explorer_v2.py upgrade --projections a.v1.jsonl [b.v1.jsonl ...] --context v2.context.json --out rows.v2.jsonl
python3 -I prop_explorer_v2.py validate --rows rows.v2.jsonl        # also accepts a v1 file
```

The upgrade groups v1 records by player-game-statistic and conditionality, takes each model's latest capture at
or before the snapshot (default: the latest `as_of`), fills `role` and `model_id` from `context.models`, maps the
v1 status, derives calibration from the v1 holdout interval coverage (`ASSESSED`, never `CALIBRATED`, unless the context supplies a calibration block), picks the
best validated / sports-only / primary projections, and inherits every v1 null reason; anything else unexplained is
refused, and so is an existing output file.

`examples/prop_explorer/<sport>.prop_explorer_projection.v2.jsonl` are the upgraded real examples
(`contexts/v2.context.json`). All their projections are sports-only and `VALUE_NOT_TESTED`, and no source holds a
Kalshi quote for those historical player-games, so `market` is null and every row is `RESEARCH`:

| Sport | Rows | Best validated / primary | Also in the row |
|---|---:|---|---|
| MLB | 3 | `mlb_pitcher_workload_joint_v1` (`ACCURACY_ACCEPTED_RESEARCH`, regular season only; MLB strict-rule verdicts attached) | champion `ACCURACY_NOT_TESTED` |
| NFL | 4 | `pure-player-v1.0.0` (`ACCURACY_ACCEPTED_RESEARCH`) | EWM baseline `ACCURACY_NOT_TESTED` |
| NBA | 5 | none / champion `sim-rotation` (`ACCURACY_NOT_TESTED`) | `sim_challenger` `ACCURACY_REJECTED`, never used |

`synthetic.prop_explorer_projection.v2.example.jsonl` (from `synthetic_v2.py`) is **synthetic**: no real player,
game, model or quote (`SYN` ids, `x_synthetic: true`). It exists so the UI can exercise every label: S1 sports-only
research (`RESEARCH`, one `NOT_EXECUTABLE` rung), S2 a market-informed best-accuracy projection with NFL-style
PROE / implied total / team ratings inputs (`MARKET_INFORMED` despite positive edges), S3 a synthetic
`VALIDATED_VALUE` + `CALIBRATED` projection (`VALIDATED_OPPORTUNITY`, `NO_EDGE` and `STALE_QUOTE` rungs), S4 a
postseason row whose arms are all `BLOCKED_NOT_VALIDATED_POSTSEASON` (`NO_ELIGIBLE_PROJECTION`).

### Mapping to the redesigned explorer (for the adapter; no app code changes here)

| App today (`src/insights/propBoard.ts`, `src/opportunity/pricing.ts`) | v2 field |
|---|---|
| `PropRow.projection`, `range` | `projections[primary].outcome.mean`, `.quantiles` (p10/p50/p90 in the current sources; never interpolate p05/p95) |
| `Rung.modelP`, `modelState` | `market_evaluation.rungs[side=yes].model_probability` and the rung `display_label` |
| `Rung.yesBid / yesAsk / noAsk`, `marketP` | `market.quotes[]` |
| `PropRow.price.{overAsk, underAsk, overBreakEven, underBreakEven, spread}` | rung `executable_price`, `executable_price + fee_per_contract`, `spread` |
| `PriceInputs.betUpTo`, `publishedFee`, `publishedEv` | rung `bet_up_to_price`, `fee_per_contract`, `edge_after_fees` |
| `PropRow.matchup` | `projections[primary].matchup` + its drivers |
| Scripts panel | `projections[*].game_script` |
| "SIFT read" reasons / risks | ranked `drivers`, `validation.caveats`, `strict_rule_verdicts[].summary` |
| `FreshChip` | `freshness` (row) and `projections[*].freshness` |
| a market-informed / research badge | `display_label` (row and rung), `provenance.market_informed`, `market_derived_inputs` |

## Limitations

* `validate` checks an exported artifact. The lineage times, driver roles and status evidence are the producer's
  claims, which is why statuses must cite pinned evidence. Runtime market independence is proven only by
  `pure_gate rerun` in the sport repo.
* `matchup_role` is a classification taken from the model's code. It isn't a measured effect, and
  `driver_value_diff` isn't a causal attribution.
* The script mixture check needs every scenario projected. A partly projected script is validated structurally only.
* Status describes evidence for a **model version within its scope**. It isn't a statement about one row's accuracy.
* v2 labels are only as good as the statuses and calibration a producer declares; the validator checks that they
  cite pinned evidence of the right kind, not that the evidence is right. No committed source holds a
  `VALIDATED_VALUE` model or a Kalshi quote for the example player-games, so the real v2 examples exercise
  selection and provenance only; the price arithmetic and the opportunity labels are exercised by the synthetic
  fixtures and the tests.
