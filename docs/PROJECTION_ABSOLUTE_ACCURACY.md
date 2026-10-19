# Absolute accuracy, calibration and uncertainty of the families promoted without an incumbent

*2026-10-18 · companion to `PROJECTION_PROMOTION.md` · generated from frozen study outputs by
`research/projection_foundation/promotion/absolute_accuracy.py` · accuracy is forecast quality, never betting value*

Seven promoted families have no incumbent comparison (NFL team pass and rush attempts; CFB plays, team passing yards, team
rushing yards, points per play, success rate). For them, beating a simple baseline (a shrunk season average) is the only
comparison the study made, and that is **not enough by itself** to publish a number: a baseline can be beaten by a model whose
ranges are wrong, whose errors are large, or whose edge vanishes in the next season. CFB team points is included below for
reference because its projected score is displayed prominently (it also beat the retired engine, see the promotion matrix).

## 1. The publication standard

Declared before the numbers below were computed, applied by one function to every family, and enforced in code
(`ABSOLUTE_STANDARD` in `src/lib/projectionPolicy.ts`; `tests/projectionApprovals.test.ts` recomputes every verdict in
TypeScript from the per-period numbers and requires it to equal the Python verdict and the status recorded in
`projectionApprovals.ts`).

*Independent periods* are the holdouts and any later period (2026 to date). The validation split chose the model, so it is
shown but never decides. A period with fewer than 300 games is reported but cannot decide (too small to confirm or refute).

| | Fails the standard (NOT MET) if, on a deciding period… |
|---|---|
| R1 Calibration | an 80/50/90% range covers less than nominal by more than 3 standard errors (binomial, counted in games), or more than 5 points above nominal; or the PIT variance ratio is outside 1 ± max(0.10, 2√(2/games)) |
| R2 Bias | the mean error exceeds 0.15 × RMSE (a scale-free bound; RMSE stands in for the outcome's standard deviation) |
| R3 Information | on the first holdout, the CRPS improvement over the baseline is under 1% or its 95% interval reaches 0 |
| R4 Stability | on any later deciding period, the CRPS improvement is not positive with a 95% interval below 0 |

It is published **with caveats** (and never reads as High reliability, with the caveat shown as a reason) if nothing fails but:
the squared-error improvement over the baseline is under 5% (low information); an 80% range covers more than 83% of outcomes
(ranges slightly wide, i.e. conservative); a period too small to decide did not confirm the improvement; or bias exceeds 0.10 × RMSE.
A family that **does not meet** the standard stays promoted on record but its number is withheld
(`publication: NOT_MET` in `projectionApprovals.ts`) until the evidence changes.

Calibration is asymmetric on purpose: ranges that are too narrow understate risk (the harmful direction, held to 3 standard
errors); ranges that are a little too wide only overstate it (allowed up to 5 points, flagged above 3).

## 2. The evidence

CRPS vs baseline is the share of the baseline's CRPS the model removes (positive = better). PIT var is the randomized-PIT
variance ratio (1 = calibrated, above 1 = ranges too narrow, below 1 = too wide). Games are the number of games (the two
teams of one game are not independent, so the standard errors above count games, not team-games).

| Sport | Statistic | Period | Games | MAE | RMSE | Bias (÷RMSE) | 50% / 80% / 90% covered | PIT var | CRPS vs baseline | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| NFL | team pass attempts | validation (chose the model) | 543 | 6.08 | 7.61 | +0.449 (+0.06) | 0.515 / 0.829 / 0.906 | 0.953 | +1.4% | met with caveats |
|  |  | holdout 2024-25 | 544 | 6.13 | 7.67 | +1.09 (+0.14) | 0.497 / 0.805 / 0.904 | 0.966 | +1.4% |  |
|  |  | 2026 weeks 1-4 | 64 | 6.15 | 7.99 | -0.0694 (-0.01) | 0.539 / 0.789 / 0.883 | 0.960 | +1.6% |  |
| NFL | team rush attempts | validation (chose the model) | 543 | 5.87 | 7.31 | -0.135 (-0.02) | 0.482 / 0.784 / 0.897 | 1.024 | +1.7% | met with caveats |
|  |  | holdout 2024-25 | 544 | 5.74 | 7.1 | -0.0387 (-0.01) | 0.506 / 0.804 / 0.896 | 0.995 | +2.5% |  |
|  |  | 2026 weeks 1-4 | 64 | 5.42 | 6.71 | +0.0357 (+0.01) | 0.531 / 0.844 / 0.945 | 0.930 | -2.0% |  |
| CFB | team points | validation (chose the model) | 1,466 | 9.17 | 11.4 | +0.285 (+0.02) | 0.507 / 0.818 / 0.906 | 0.981 | +10.4% | met |
|  |  | holdout 2023-24 | 1,502 | 8.99 | 11.3 | -0.0871 (-0.01) | 0.520 / 0.809 / 0.904 | 0.970 | +12.6% |  |
|  |  | holdout 2025 | 762 | 8.79 | 11 | +0.261 (+0.02) | 0.524 / 0.819 / 0.915 | 0.943 | +13.0% |  |
|  |  | 2026 to date (ESPN source) | 339 | 8.93 | 11.1 | -0.0279 (-0.00) | 0.503 / 0.827 / 0.913 | 0.969 | +15.4% |  |
| CFB | plays | validation (chose the model) | 1,465 | 7.58 | 9.58 | +0.36 (+0.04) | 0.508 / 0.801 / 0.896 | 0.984 | +4.5% | met |
|  |  | holdout 2023-24 | 1,502 | 7.13 | 9.09 | +0.493 (+0.05) | 0.535 / 0.819 / 0.912 | 0.930 | +3.8% |  |
|  |  | holdout 2025 | 762 | 7.17 | 8.91 | -0.155 (-0.02) | 0.518 / 0.822 / 0.917 | 0.963 | +3.6% |  |
|  |  | 2026 to date (ESPN source) | 339 | 7.23 | 9.07 | +0.364 (+0.04) | 0.504 / 0.823 / 0.922 | 0.957 | +4.9% |  |
| CFB | team passing yards | validation (chose the model) | 1,465 | 66.7 | 83.7 | +2.63 (+0.03) | 0.526 / 0.813 / 0.894 | 0.974 | +2.1% | met with caveats |
|  |  | holdout 2023-24 | 1,502 | 62.2 | 77.9 | +2.09 (+0.03) | 0.542 / 0.835 / 0.916 | 0.914 | +2.8% |  |
|  |  | holdout 2025 | 762 | 61.5 | 77.1 | +1.12 (+0.01) | 0.546 / 0.831 / 0.916 | 0.905 | +3.5% |  |
|  |  | 2026 to date (ESPN source) | 339 | 62.5 | 77.5 | +0.916 (+0.01) | 0.524 / 0.823 / 0.907 | 0.934 | +2.9% |  |
| CFB | team rushing yards | validation (chose the model) | 1,465 | 58.1 | 72.9 | +2.04 (+0.03) | 0.504 / 0.814 / 0.909 | 0.980 | +7.4% | met with caveats |
|  |  | holdout 2023-24 | 1,502 | 53.8 | 68.6 | -0.752 (-0.01) | 0.546 / 0.835 / 0.917 | 0.906 | +7.4% |  |
|  |  | holdout 2025 | 762 | 53.5 | 67.3 | -0.542 (-0.01) | 0.537 / 0.843 / 0.936 | 0.911 | +9.1% |  |
|  |  | 2026 to date (ESPN source) | 339 | 55.3 | 70.3 | +0.827 (+0.01) | 0.526 / 0.833 / 0.917 | 0.936 | +8.7% |  |
| CFB | points per play | validation (chose the model) | 1,465 | 0.136 | 0.172 | +0.0056 (+0.03) | 0.500 / 0.810 / 0.905 | 0.988 | +8.8% | met |
|  |  | holdout 2023-24 | 1,502 | 0.139 | 0.178 | -0.0053 (-0.03) | 0.510 / 0.796 / 0.888 | 1.011 | +9.6% |  |
|  |  | holdout 2025 | 762 | 0.137 | 0.176 | +0.0072 (+0.04) | 0.500 / 0.803 / 0.899 | 0.990 | +9.6% |  |
|  |  | 2026 to date (ESPN source) | 339 | 0.138 | 0.173 | +0.005 (+0.03) | 0.472 / 0.807 / 0.897 | 1.013 | +11.9% |  |
| CFB | success rate | validation (chose the model) | 1,466 | 0.0613 | 0.0777 | +0.0019 (+0.02) | 0.489 / 0.795 / 0.894 | 1.021 | +8.8% | not met |
|  |  | holdout 2023-24 | 1,498 | 0.0603 | 0.0757 | -0.0012 (-0.02) | 0.486 / 0.797 / 0.893 | 1.018 | +8.8% |  |
|  |  | holdout 2025 | 762 | 0.0585 | 0.0736 | +0.0019 (+0.03) | 0.501 / 0.814 / 0.905 | 0.981 | +10.9% |  |
|  |  | 2026 to date (ESPN source) | 339 | 0.0689 | 0.0867 | +0.0005 (+0.01) | 0.448 / 0.732 / 0.851 | 1.154 | +10.6% |  |


The holdout interval for the CRPS difference excludes 0 for every family in the table (see `PROJECTION_PROMOTION.md` §3);
the 2026 NFL rows are 64 games and cannot decide.

## 3. What the evidence says, family by family

**NFL team pass attempts: published with caveats.** Calibrated on the holdout and validation (80% range covers 0.805 and 0.829;
PIT variance 0.97 and 0.95). The model removes 1.4% of the baseline's CRPS (interval excludes 0), but it explains only about 8%
of the variance (correlation 0.28): the average miss is 6.1 attempts on a mean of 32.4 (19%), because attempts depend on how the
game unfolds. It over-projected by 1.09 attempts (0.14 × RMSE, 3.4% of the mean) over 2024–25, but only −0.07 on the first four
weeks of 2026. The 2026 sample (64 games) cannot confirm the improvement. Read the range, not the point. No SIFT surface shows it
today.

**NFL team rush attempts: published with caveats.** Calibrated and essentially unbiased (bias −0.04, PIT variance 0.995). It
removes 2.5% of the baseline's CRPS on the holdout (squared error 4.6% lower; about 9% of the variance explained; average miss
5.7 on a mean of 26.9, 21%). On the first four weeks of 2026 (64 games) it was slightly *worse* than the baseline (CRPS +2%,
interval spans 0), which is inconclusive at that size but is the reason for the caveat. No SIFT surface shows it today.

**CFB plays: met.** Calibrated and stable in all four periods (80% range 0.80–0.82; PIT variance 0.93–0.98), bias at most
0.054 × RMSE, CRPS 3.6–4.9% better than the baseline with every interval below 0 (holdout, 2025, 2026 to date).

**CFB team passing yards: published with caveats.** Stable and unbiased (bias ≤ 0.031 × RMSE; CRPS 2.1–3.5% better in every period), but
the ranges run slightly wide (80% ranges cover 0.81–0.84; PIT variance 0.90–0.97): the displayed range overstates the risk a little.

**CFB team rushing yards: published with caveats.** The strongest improvement of the yardage families (CRPS 7.4–9.1% better; squared error
14–19% lower) and unbiased, with the same slightly wide ranges (80% ranges cover 0.81–0.84; PIT variance 0.91–0.98).

**CFB points per play: met.** Calibrated everywhere (80% range 0.80–0.81; PIT variance 0.99–1.01), unbiased, CRPS 9–12% better than the
baseline in every period.

**CFB success rate: does not meet the standard; withheld.** On the 2023–25 holdouts and validation it is calibrated, unbiased and 9–11%
better than the baseline. On the 2026 games played so far (339 games, ESPN source) the 80% range covers only 0.732 and the 90%
range 0.851 (more than 3 standard errors under nominal) and the PIT variance ratio is 1.15: the ranges are too narrow. It still beats
the baseline there, which is exactly why beating the baseline is not enough. A likely cause is that the 2026 source (ESPN game
logs) defines or counts successful plays differently from the CFBD data the model was built on (the same source change is why
EPA per play cannot be projected in 2026), but that is a hypothesis, not a finding. The family stays on the promotion matrix; its
number is withheld until the discrepancy is explained or enough live games show calibrated ranges. SIFT currently displays it only as a
secondary line on the CFB game page.

**CFB team points: met** (for reference). Calibrated and unbiased in every period; CRPS 12.6–15.4% better than the baseline and 8.9% better than the
retired engine on the holdout.

## 4. Limits of this evidence

* The study did not record the outcome mean for the CFB families, so bias is judged in units of the RMSE rather than as a share of the mean.
* The 2026 rows are a retrospective check on games already played (CFB: ESPN source; NFL: weeks 1–4) and were already seen by the
  study; they are not a prospective record. Prospective scoring of archived pregame forecasts started on 2026-10-18 and has settled nothing yet.
* Calibration is assessed on the marginal distribution of each family. The study did not publish conditional calibration by opponent or
  game situation for these families beyond its subgroup bias test (no subgroup with more than 25% relative bias).
* None of this is evidence of betting value; no projection here has been shown to beat the market.
