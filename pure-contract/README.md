# PURE forecast contract (`pure_forecast.v1`)

A shared, read-only contract for **market-independent** player-stat forecasts, and a standard-library
acceptance runner for it. Research tooling only: it makes no accuracy claims, changes no SIFT screen,
and has nothing to do with wagers, staking or model authority.

| File | What it is |
|---|---|
| `schema/pure_forecast.v1.schema.json` | JSON Schema (2020-12) for one JSONL line, v1 and the kit interim format (v0) |
| `pure_gate.py` | Normative validator + `validate` / `compare` / `rerun` / `mutation` CLI (Python 3.10+, stdlib only) |
| `tests/` | Unit tests, including the 13 ported kit tests and synthetic toy upstream models for `rerun` |
| `examples/*.example.jsonl` | **Synthetic** example rows (not forecasts of any real player or game) |
| `ADOPTION.md` | How each sport repo emits the sidecar and where market quotes go |
| `PROP_EXPLORER.md` | The Combined Player Prop Explorer contract (`prop_explorer_projection.v1`), built on top of v1 rows |
| `prop_explorer.py`, `schema/prop_explorer_projection.v1.schema.json`, `types/` | Its validator/converter (stdlib), JSON Schema and TypeScript declarations |
| `examples/prop_explorer/` | Explorer examples built from **real** committed research outputs of the sport repos |

The vendored `src/contract/` protocols and `kalshi-bet-router/contract/edge_finder_contract` are not part of
this and are unchanged. This directory isn't imported by the app build.

## The record

One JSON object per `(sport, game_id, player_id, statistic)` at one forecast cutoff.

| Field | Rule |
|---|---|
| `schema_version` | `"pure_forecast.v1"`. Rows without it are read as the kit interim format, `pure_forecast.v0` |
| `sport`, `game_id`, `player_id`, `statistic` | Nonempty canonical IDs. `statistic` is one statistic, never a ladder rung (`receiving_yards_over_50`, `points_25+`, `…at_least…` are refused) |
| `source_max_observed_at` ≤ `as_of` < `kickoff` | Source cutoff, forecast cutoff, game start; ISO-8601 with an explicit offset |
| `projection_mode` | `"PURE_INDEPENDENT"` |
| `model_version`, `model_frozen_hash` | Version name plus `sha256:<64 hex>` or `git:<7–40 hex>` of the frozen code/parameters |
| `conditional_on_playing` | `true`: distribution given the player plays (DNP outcomes are excluded from scoring and counted). `false`: unconditional (DNP is scored as the realised value) |
| `participation_probability` | P(plays) in [0,1], or explicit `null` = not modeled (reported as a warning). For unconditional rows, P(X ≥ t) for t > 0 can't exceed it |
| `projection` | `mean`, `median`, `p10`, `p90` (p10 ≤ median ≤ p90); optional `quantiles` `[{q, value}]` with q strictly ascending in (0,1) and values non-decreasing (and equal to p10/median/p90 at 0.1/0.5/0.9); `thresholds` `[{at_least, probability}]` with strikes strictly ascending, probabilities in [0,1] and non-increasing |
| `sources` | Nonempty: `{source_id, class: "sports_only", max_observed_at ≤ source_max_observed_at}`, optional `uri`, `snapshot_sha256`, `description` |
| `feature_lineage` | Nonempty: `{name, value (scalar/null), source (a declared source_id), observed_at, class: "sports_only"}`; `observed_at` ≤ `source_max_observed_at` and ≤ its source's `max_observed_at`; names unique |
| `x_*` | Optional producer metadata (run id, notes). Not model-owned, so excluded from rerun signatures |

**Market vocabulary is refused.** Any key anywhere in the row, and any feature `name`/`source` or source
`source_id`/`uri`/`description`, that contains a market term fails validation. Terms include kalshi,
polymarket, pinnacle, draftkings, fanduel, sportsbook, bookmaker, odds, spread, vig, moneyline, price, market,
wager, bet, implied, closing/opening line, over/under, consensus, clv, ticker, settlement and quote. Matching
is token-based (`closing_speed` and `navigation` pass), plus the kit's substring list on key names. Market
quotes belong in a separate comparison record (see `ADOPTION.md`); top-level fields outside the contract are
refused.

### Compatibility with the kit interim format (v0)

Sport lanes are emitting the Wave 1 kit format (`scripts/prop_projection_gate.py`) in parallel. The gate reads
those unversioned rows as `pure_forecast.v0` under the kit's own rules, with token-based market scanning added.
v0 rows have no frozen hash, no participation probability and no per-feature source or time, so their lineage
is **not verified**, and `validate` says so. A v0 champion can be compared against a v1 challenger.
`validate --require-v1` refuses v0 once a lane has migrated. Any later breaking change gets a new
`schema_version`; the gate refuses versions it doesn't know.

## Commands

```bash
cd pure-contract
python3 -I -m unittest discover -s tests -v

python3 -I pure_gate.py validate --forecasts examples/pure_forecast.v1.example.jsonl [--require-v1]
python3 -I pure_gate.py compare --champion champ.jsonl --challenger chal.jsonl --outcomes outcomes.jsonl \
    [--bootstrap 1000 --bootstrap-seed 20261010] [--output scorecard.json]
python3 -I pure_gate.py rerun --manifest rerun_manifest.json \
    --model-cmd   "python -m sport.pure_v1 --sports {sports[box]} --odds {market[odds]} --out {out} --seed {seed}" \
    --control-cmd "python -m sport.pure_v1 --sports {sports[box]} --odds {market[odds]} --out {out} --seed {seed} --use-market-center" \
    [--seed 7 --mutation-seed 20261010 --random-draws 1 --workdir DIR --timeout 1800]
python3 -I pure_gate.py mutation --before a.jsonl --after b.jsonl   # never certifies; see below
```

Exit codes: 0 pass; 1 fail (leak, no power, nondeterminism); 2 contract error; 3 `mutation` on identical
files (`NOT_CERTIFIED_PRECOMPUTED_FILES`).

### `compare`

* Scores only rows present in champion, challenger **and** outcomes. Each row is a unique
  player-game-stat; duplicates, rung-named statistics and per-rung outcome rows are refused.
* Every exclusion is counted, overall and by statistic: champion-only, challenger-only, matched without
  outcome, outcomes without forecasts, conditional DNP.
* Conditionality, `as_of` and `kickoff` must match between the two models, otherwise the comparison is refused.
* Per `sport:statistic` (never pooled across statistics) it reports MAE, RMSE, bias, p10–p90 coverage, and
  the Brier score of **one** representative ladder rung per player-game. That rung is the exactly matching
  common strike whose two-model mean probability is closest to 0.5, so the choice is outcome-blind and
  symmetric. It also reports a CRPS approximation: 2 × mean pinball loss over the quantile levels both models
  publish (at least p10/median/p90; more with `quantiles`).
* Uncertainty is a paired percentile bootstrap that resamples whole games (`sport|game_id`) for ΔMAE, ΔMSE,
  Δcoverage, ΔBrier and ΔCRPS (challenger − champion). It is deterministic given the seed. With fewer than
  3 games there's no CI, and with fewer than 20 games `few_game_clusters_warning` is set.
* The output is descriptive (`DESCRIPTIVE_ONLY_NOT_AUTOMATIC_PROMOTION`). Promotion needs a preregistered,
  untouched chronological holdout.

### `rerun`: runtime non-leakage proof

`rerun` actually executes the upstream model. Comparing two files the developer supplies can't prove anything,
so it doesn't. For the model command and for a **negative control** (a deliberately market-reading variant,
such as the existing market-centred arm), it runs these arms with identical seed, sports inputs, environment
and command-line paths, so no arm label is visible to the command:

1. `normal` and `normal_repeat`: real market inputs, run twice to establish determinism.
2. `deleted`: market inputs absent.
3. `randomized_<i>`: market inputs replaced by a seeded randomization. JSON/JSONL/CSV/TSV numbers are
   perturbed and identifiers kept; other formats are replaced with random bytes of the same length unless the
   manifest gives a format-preserving `randomizer_cmd`.

The verdict is `PASS_RUNTIME_NONLEAKAGE` only if all of these hold:

* The model's declared outputs are bit-identical across every arm (`compare: "bytes"`). With
  `compare: "pure_jsonl"`, the canonical model-owned fields of every validated PURE row are compared instead,
  so `x_*` wall-clock metadata is ignored.
* The model exits 0 in every arm. A model that needs the market file in order to run *is* market-dependent.
* The control is deterministic and **responds to every mutation**: its output changes, or it fails.
  Otherwise the verdict is `FAIL_NO_POWER`, because the mutation never reached a reader and the test proved
  nothing.
* The randomization really changed every market input's values, the sports inputs hash the same before and
  after, and in-place market files are restored byte-identical. Otherwise the verdict is
  `ERROR_INVALID_EXPERIMENT`.

The other verdicts are `FAIL_MARKET_LEAK` and `FAIL_NONDETERMINISTIC`. The gate also refuses to run when the
manifest has no market inputs, when the control command equals the model command, or when (in placeholder
mode) the model command never receives the market inputs.

Manifest (paths relative to the manifest's directory, or to `cwd` if given):

```json
{
  "mode": "placeholder",
  "cwd": ".",
  "market_inputs": {"odds": "data/odds/2025_closing.parquet",
                    "kalshi": {"path": "data/kalshi_rungs.jsonl"}},
  "sports_inputs": {"box": "data/snapshots/2025-12-01/"},
  "outputs": ["pure_forecasts.jsonl"],
  "compare": "bytes",
  "env": {"OMP_NUM_THREADS": "1"}
}
```

* `mode: "placeholder"` (default): the gate builds the market files for each arm in a sandbox and passes them
  through `{market[NAME]}` or `{market_dir}`. Use this when the production pipeline takes market paths as
  arguments.
* `mode: "in_place"`: for pipelines that read fixed repo paths. The gate backs the files up, deletes or
  randomizes them where they are, and restores them in a `finally` block, then verifies the hashes. If the
  process is killed, the backups are in `<workdir>/backup/`. Don't run two in-place reruns on one checkout at
  the same time.
* A parquet or other binary market input needs `"randomizer_cmd": "python tools/randomize.py {src} {dst} {seed}"`
  for a meaningful randomized arm. Without it, random bytes make any reader fail. That still counts as the
  control responding, but it says nothing about values.
* Placeholders: `{out}` (required; outputs are read from here), `{seed}`, `{market[NAME]}`, `{market_dir}`,
  `{sports[NAME]}`. The gate also sets `PYTHONHASHSEED=0`, `TZ=UTC` and `PURE_GATE_SEED`.

## Limitations (read before citing a PASS)

* `rerun` proves that the **declared** market inputs don't influence the outputs at runtime. It can't see a
  market input that isn't in the manifest (another file, a network call, a database), market information
  already baked into the sports snapshot (for example, a population selected by market availability), or
  frozen parameters that were fitted with market data. Every PASS has to be paired with the sport lane's
  source and dependency audit and its training-sample audit.
* The negative control shows the mutation reaches *a* market reader. It doesn't show that the model under test
  would have read the same file. The control should be the closest market-reading variant of the same pipeline.
* `validate` checks an exported artifact. Lineage timestamps are the producer's claims, and v0 rows carry none.
* CRPS from three quantiles is coarse. Publish denser `quantiles` for a better approximation.
* `mutation` (kit compatibility) can detect a difference between two files. It never certifies identity
  (exit 3).
