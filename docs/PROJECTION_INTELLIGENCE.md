# SIFT Projection Intelligence — Phase 1–3 record (2026-10-17)

Research / shadow only. Nothing here changes betting authority, publishes a recommendation, merges, deploys or spends money.

**Philosophy.** Independent projections are judged on accuracy; disagreements with the market are judged separately, on
whether they paid at an executable price on data not used to find them. A model can be reliable and still never beat the price.

## 1. What the archives can already teach us (inventory)

| Sport | Point-in-time projections | Executable Kalshi prices | Settled model-vs-market pairs today | Existing verdict |
|---|---|---|---|---|
| **NFL** (`nfl-edge-finder`, branch `market-data` @ `dcaf29ea`) | Frozen `shadow-0.4.0` + sim-1.0.0 + v2 projections, 2026 wk 1–4, 542k snapshot evaluations | bid/ask/width/volume per snapshot, 10-min cadence; depth only inside 72h for FULL tier | **20.3k binary player-prop contracts, 4.0k independent player-stat-games, 64 games** (2026); 18.6k 2025 contracts (walk-forward, retrospective) | 2025: market encompasses model (b_model −0.001±0.076, b_market 0.94). Raising disagreement thresholds never helped. |
| **NBA** (`nba-edge-finder`) | PURE shadow store (hash-chained) preseason only, 30 games; older walk-forward CSV from a superseded simulator | Top-of-book only; regular-season prop markets listed 10-16, quotes are 0.00/0.98 placeholders | **0 prospective** | Market beats model in 8/8 families (log loss 0.49 vs 0.56 points); apparent residual folds vanished after de-laddering; rebounds the only lead |
| **MLB** (`edge-finder-api`) | Hitter snapshots (24 dates, ~400 independent player-games); pitcher model only retroactive; prospective pitcher shadow 63 rows | Top-of-book, 1 pre-start quote/ticker median, cents→dollars unit switch 09-10 | ~5.9k hitter tickets (418 player-games); ~6.6k pitcher K markets (941 pitcher-games, retroactive) | Hitters at parity (ΔBrier +0.0007 [−0.002,+0.004]); pitcher model calibrated but worse than market (+0.009, CI excludes 0); no family promotable |
| **NHL** (`NHL-edge-finder`) | `PLAYER_SIM_V1` 213k prediction rows, 113 games, 17 days, append-only with sha256 | 10-min deltas, order books capped at 300 markets | 13.1k pairs / 113 games (heavily correlated) | Market equal or better on goals/assists/points; every edge bucket loses after fees; SOG is not a Kalshi market so cannot be tested |
| CFB/CBB/Soccer/Tennis | not inventoried this session | | | |

**Integrity problems found** (beyond those the repos already document): the NHL `report_player.md` headline compares the model on 211k rows with the market on 160k (not like-for-like); the MLB hitter snapshot stores the *mid* as `executableKalshiPrice`; MLB quote units change mid-archive; NBA prospective data is preseason with placeholder prop quotes on the market side; every sport repeats a ticker across snapshots and across ladder rungs, so row counts overstate evidence by 3–5×.

**What can be learned today:** NFL only. Everything else is too thin or retroactive for a defensible chronological/prospective split; NBA/NHL/MLB gain evidence only as 2026-27 games mature.

## 2. Discovery run — NFL 2026 prospective (weeks 1–4)

Code: `research/intelligence/` (`disagreement.py`, `nfl_prospective.py`, tests). Results: `research/intelligence/results/nfl_prospective_2026_w1-4.json`.
Reproduce: extract `data/shadow/evaluations` from the `market-data` branch, then `python -m research.intelligence.nfl_prospective <dir> <out.json>`.

Protocol: latest pre-kickoff quote per contract; two-sided books with width ≤ 0.10 only; ladder rungs of one player-stat-game form **one cluster** (cluster-robust SEs everywhere); discovery = wk 1–2, validation = wk 3, untouched holdout = wk 4; EV = buy the model-favoured side at the **ask**, minus Kalshi fee.

**Projection accuracy scorecard** (17,405 contracts, 3,995 clusters)

| stat | Brier(model) − Brier(market) | z | mean(outcome − model prob) |
|---|---|---|---|
| receptions | +0.040 | 7.6 | +0.152 |
| carries | +0.082 | 5.3 | +0.238 |
| receiving_yards | +0.021 | 5.7 | +0.103 |
| rushing_yards | +0.022 | 3.9 | +0.062 |
| touchdowns | +0.007 | 3.2 | +0.045 |
| attempts / completions / passing yds / passing TDs / INT | +0.020 … −0.001 | ≤ 2.7 | within ±0.09 |

Overall model − market Brier +0.0243 (z≈11.7); one-rung-per-ladder view +0.0263, so ladder duplication is not driving it. Encompassing regression: b_model = +0.06±0.04, b_market = 0.90±0.04. A model recalibrated on weeks 1–2 and tested on weeks 3–4 still loses (ΔBrier +0.0174±0.0024; b_model 0.13±0.07): **fixing the bias alone does not create information the market lacks.**

**Betting-signal scorecard.** Net EV per contract is negative in every |gap| band (−0.028 … −0.040 up to 20pt gaps; −0.004 beyond) and in every week (−0.012 … −0.042). Larger disagreement does not pay — the same conclusion as the 2025 retrospective (`nfl-edge-finder/research/model_vs_market`).

## 3. Disagreement diagnosis (rules implemented in `disagreement.py`)

Applied per segment (stat × direction of disagreement), then inherited by every disagreement in it; a wide/stale book or unsupported identity can never be VALIDATED_SIGNAL.

* **MODEL_ERROR** — same-signed model bias in discovery (|z|≥3) *and* validation and holdout (|z|≥2), while the market is not similarly biased (|z|<2).
* **VALIDATED_SIGNAL** — ≥100 independent clusters in each split, EV>0 in discovery, EV z ≥1.645 in validation *and* holdout, not a MODEL_ERROR.
* **UNRESOLVED** — everything else. No bet recommendation.

Result on 30 segments: **5 MODEL_ERROR, 0 VALIDATED_SIGNAL, 25 UNRESOLVED** (most for too few clusters in a four-week sample, the rest for non-positive EV).

| MODEL_ERROR segment | evidence (z discovery / validation / holdout) |
|---|---|
| receptions (all, and model-below-market) | model under-predicts 7.9 / 6.9 / 7.3 |
| receiving_yards (all, and model-below-market) | 4.6 / 4.9 / 5.2 |
| touchdowns, model-below-market | 3.5 / 3.6 / 3.8 |

Receptions are under-predicted at **every** threshold (mean model 0.199 vs hit rate 0.352; e.g. P(≥2) 0.458 vs 0.669). A uniform shortfall that survives the fixed-threshold view points at a defect (threshold semantics ≥k vs >k, or an over-thin count distribution in `shadow-0.4.0`), not at a market inefficiency. **Hypothesis, unverified — next task is to audit threshold semantics and the count distribution in `nfl_edge/engines/player` before any recalibration.** A single losing prediction is never classified; only repeated, same-signed segment bias is.

**Negative discoveries recorded:** no stat, direction or disagreement size has positive EV at the ask; opponent defence (2025 study) improved the model standalone but added nothing over the price; recalibration adds nothing over the price; sample fraction in each tested segment is far below the 100-cluster bar for any positive claim. The matchup/usage/injury/script/environment circumstances the brief lists were **not** testable on this corpus (features are not joined to the evaluation rows); that join is the next study.

## 4. Handoff — highest-impact next work (ordered)

1. **NFL receptions/receiving-yards defect audit** (repo `nfl-edge-finder`): reproduce the uniform under-prediction on the 2025 walk-forward set; if it is a semantics bug, fix, re-run this study on fresh weeks only (weeks ≥5 are the untouched prospective set; do not reuse 1–4 to tune).
2. **Join circumstance features** (opponent-adjusted efficiency, role/usage change, injury state, script/weather) onto `evaluations` via `player_anatomy`/`player_autopsy` and test them as pre-registered segments with the same rules; each circumstance gets its own cluster-counted verdict.
3. **Automation** — run `nfl_prospective` as a step of the existing `shadow-v2-settle` flow inside `nfl-edge-finder` (the 15 GB `market-data` branch must not be fetched; use `git archive` of `data/shadow/evaluations` or sparse checkout), write verdicts append-only, and publish `intelligence/disagreement_status.v1.json` to the Sift data contract. Equivalent adapters: NHL `evaluations_player`, MLB `edgelab/model_evaluations` + `hitter_projection_snapshots`, NBA once opening-week props settle (≥200 decisions / 40 games per its own preregistration).
4. **SIFT 2.0 wiring (not done; UI untouched)**: Prop Explorer reads the status file by contract ticker/segment and shows status chip + reason; Top Props currently ranks by projection-vs-line gap (`src/views/props/ranking.ts`) — change the primary key to VALIDATED_SIGNAL, then UNRESOLVED ordered by data quality, never by gap size. With zero validated segments today, Top Props should honestly show none as validated.
5. NHL: H1/H3 preregistered tests on one-row-per-ticker; MLB: re-run hitter audit on 10-07→10-16 snapshots with ask-based price; drop SOG until a market exists.

## 5. What this does not establish

No projection model here is shown to be reliable enough to trade; the only usable conclusion is negative. Four NFL weeks cannot validate a signal and the segment tests are underpowered by design (they refuse to resolve rather than guess). No new expense, authority or deployment was made.
