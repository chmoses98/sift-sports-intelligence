# Adopting the PURE sidecar in a sport repo

**Goal:** each sport repo keeps its existing publisher exactly as it is and also writes a PURE forecast
sidecar next to it. Market quotes go in a separate comparison record. SIFT shows the two side by side and
never turns odds into a PURE number.

## 1. Emit the sidecar beside the existing publication

* Leave the current publisher, its schema, its URLs and its consumers untouched. Don't rebadge an existing
  champion as PURE.
* Write `pure_forecasts.jsonl` (one `pure_forecast.v1` row per player-game-stat, see `README.md`). Put it in a
  new, separate path, for example `publish/pure/<sport>/<as_of>/pure_forecasts.jsonl`, or attach it as a
  separate artifact. It's immutable once written. A new cutoff gets a new file; earlier files are never edited.
* Forecast **every eligible player-game-stat** from sports data. Don't choose the population from which markets
  are listed. Market rungs are joined later, and only for comparison.
* The ladder sits inside `projection.thresholds`. Pick strikes on sports grounds (for example the stat's
  half-integers). Never emit one row per market rung.
* Fill `sources` and `feature_lineage` from the actual inputs that run read, with their real observation
  times. A source you can't timestamp to the cutoff is a source you leave out, or abstain on.
* Lanes already emitting the kit interim format can keep doing so. The gate reads those rows as `v0`. Move to
  v1 by adding `schema_version`, `model_frozen_hash`, `participation_probability`, `sources` and
  `feature_lineage` (in place of `model_features`).
* Gate it in the sport repo's CI or research script:
  `python3 -I pure_gate.py validate --forecasts pure_forecasts.jsonl`.

## 2. Prove runtime non-leakage with `rerun`

Commit a small rerun manifest and two commands: the PURE model, and a negative control that is the closest
market-reading variant, such as the existing market-centred arm or the PURE model with a market-centre flag
switched on. Run `pure_gate.py rerun` on a fixed historical sports snapshot and seed. Then record the JSON
report, its verdict and the commit hash in the PR. Only `PASS_RUNTIME_NONLEAKAGE` counts. Comparing two output
files you made yourself doesn't (`mutation` exits 3, `NOT_CERTIFIED_PRECOMPUTED_FILES`).

## 3. Keep market quotes in a separate comparison record

The downstream market reader owns contract IDs, settlement semantics and executable prices. Where a price
comparison is wanted, it writes its own record keyed by the same identity, for example:

```json
{"record": "market_comparison", "sport": "NFL", "game_id": "...", "player_id": "...",
 "statistic": "receiving_yards", "pure_as_of": "...", "venue": "kalshi", "ticker": "...",
 "at_least": 50.5, "quote_probability": 0.55, "quoted_at": "..."}
```

That record never feeds back into a PURE model, its training population, its hyperparameter selection or its
evaluation population. The "price of independence" (PURE against a market-informed model or against quotes)
is a separate, downstream diagnostic. It's fine for PURE to score worse there.

## 4. What SIFT does with it

* SIFT renders the PURE forecast and the market comparison **side by side**, each labelled with its own source,
  as-of time and model version.
* SIFT never adjusts, recentres, blends or converts odds into a PURE value, and never shows a PURE-only number
  as a price or "bet up to" level.
* If no PURE sidecar exists for a sport, SIFT shows nothing in its place. It doesn't invent a projection.

## 5. Scoring

Use `pure_gate.py compare` on matched player-game-stat rows only, against **sports-sourced** outcomes
(`{sport, game_id, player_id, statistic, actual, played[, source, observed_at]}`, never market settlement).
Report the full sample and exclusion counts and the game-clustered paired CIs. Compare against the simplest
sports-only baseline and the current champion, on a preregistered chronological holdout.
