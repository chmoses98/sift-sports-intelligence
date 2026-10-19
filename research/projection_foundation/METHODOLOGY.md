# Projection Foundation — methodology

How SIFT builds projections, which established methods each projection family uses, and why. Results of the tests live in
`docs/PROJECTION_FOUNDATION_REPORT.md`; this file is the design rationale.

## 1. The decomposition every sport shares

**Production = opportunity × efficiency × context**, forecast as a full distribution.

| Layer | What it is | Why separate it |
|---|---|---|
| Opportunity | snaps / targets / carries / pass attempts (NFL, CFB); minutes, possessions, FGA (NBA); PA, batters faced, pitch count (MLB); TOI by strength (NHL) | It is the most stable, most forecastable piece and the largest source of error when a role changes. NFL defect D1 and the remaining receptions bias were both opportunity errors. |
| Efficiency | per-opportunity rates: catch rate, yards/target, points/minute, K/PA, shots/60 | Noisy in small samples; needs heavy pooling toward a population mean. Pooling it in *opportunity units* (targets, minutes, PA) rather than games is the statistically correct exposure. |
| Context | opponent quality (schedule-adjusted), pace / game environment (closing spread & total), venue, rest, weather | Small multiplicative effects; only valuable if they survive walk-forward testing. Their strength (an elasticity β) is fitted on development data, never assumed. |
| Distribution | count family (Poisson / negative binomial / hurdle) or empirical residual shape | Prop ladders are threshold probabilities; a correct mean with a wrong spread misprices every rung. |

## 2. Methods, and where each is used

| Method | Reference | Used for | pf_core |
|---|---|---|---|
| Empirical-Bayes shrinkage / partial pooling | Efron & Morris (1975); Gelman et al., *BDA* ch. 5 | Every player rate and average: posterior mean = (n·x̄ + k·prior)/(n + k), k estimated by method of moments (within ÷ between variance) | `pit.eb_shrink`, `pit.estimate_shrinkage_k` |
| Marcel-style weighted history | Tango (Marcel); Silver (PECOTA) | Model A: season-to-date blended with last season at a discount, regressed to a group mean | `models.est_A` |
| Exponential smoothing (recency weighting) | Brown (1959); Holt | Model B: EWMA with half-life in games, evidence capped at ≈2.9 half-lives | `models.est_B` |
| Opportunity × efficiency | standard in fantasy/DFS modelling; Football Outsiders, numberFire | Model C | `models.ratio_rate` |
| Schedule-adjusted ratings (ridge regression on offence + defence indicators) | Massey (1997); Sill (2010) RAPM; Connelly SP+ (opponent-adjusted efficiency) | Model D opponent factors; CFB/NFL/NBA/NHL team scoring. Fitting offence and defence jointly *is* the strength-of-schedule adjustment — a defence that only faced weak offences is not credited for their low output | `pit.rolling_ridge_ratings` |
| Poisson attack/defence with time decay | Dixon & Coles (1997) | Team goals/points priors; half-life weighting in the ridge fit | `rolling_ridge_ratings(halflife_days=…)` |
| log5 / odds-ratio matchup | James (1981); Tango | MLB batter-vs-pitcher K / hit rates | sport code |
| Generalised linear models with regularisation | Nelder & Wedderburn (1972); Tibshirani (1996) | Model E (Poisson GLM, log link) | `models.ridge_glm_walkforward` |
| Gradient-boosted trees | Friedman (2001); Ke et al. (2017) LightGBM | Model E (Poisson / Tweedie objectives) | `models.lgbm_walkforward` |
| Stacking with non-negative weights | Wolpert (1992); Breiman (1996) | Model F; weights fitted on development predictions only | `models.fit_stack_weights` |
| Negative binomial (NB2), hurdle and zero-inflated counts | Cameron & Trivedi (2013); Mullahy (1986); Lambert (1992) | Over-dispersed counts (targets, rebounds, shots); zero mass from low participation | `dists.negbin`, `dists.hurdle` |
| Dispersion as a function of the mean | GAMLSS — Rigby & Stasinopoulos (2005) | Binned NB α / residual SD by projected mean (low-volume players are dispersed differently from workhorses) | `dists.fit_nb_alpha_binned`, `fit_sd_binned` |
| Nonparametric quantile mapping | — | Yards and other skewed continuous outcomes: y = μ·r with r drawn from the empirical ratio distribution of the same mean bin | `dists.empirical_scale` |
| Proper scoring rules | Gneiting & Raftery (2007) | CRPS and log score rank whole distributions; Brier/log loss for threshold rungs | `metrics.dist_metrics` |
| Calibration and sharpness, PIT | Dawid (1984); Gneiting, Balabdaoui & Raftery (2007); Czado, Gneiting & Held (2009) randomised PIT for counts | Coverage (cover_50/80/90) and PIT variance ratio (>1 = overconfident) | `DistBatch.pit` |
| Rolling-origin evaluation | Tashman (2000) | Walk-forward: refit on blocks strictly before the one predicted | `pit.rolling_origin` |
| Cluster bootstrap | Cameron, Gelbach & Miller (2008) | Model comparisons; players in one game share pace, script and weather, so games are the resampling unit | `metrics.cluster_bootstrap_diff` |

Considered and **not** used as primary engines: full MCMC hierarchical models (correct but too slow to refit walk-forward
across five sports in CI; empirical Bayes gives the same posterior means for these Gaussian/Poisson-gamma structures);
state-space Kalman filters for team strength (Glickman & Stern 1998) — the half-life–weighted ridge fit is the closed-form
analogue and is cheaper to refit weekly; NGBoost / deep distributional nets (dependency weight, no evidence they beat
GLM + fitted dispersion on samples of this size).

## 3. Outcome characteristics → method choice

| Family type | Examples | Characteristics | Mean model | Distribution |
|---|---|---|---|---|
| Opportunity counts | targets, carries, pass attempts, FGA, PA, batters faced, shots | Count, mildly over-dispersed, role-driven, game-script sensitive | B or C with team volume × share | NB (binned α); hurdle for participation risk |
| Low counts | TDs, HR, goals, assists, passing TDs | Mostly 0/1/2, heavy zero mass | C (opportunity × rate), strong pooling | Poisson; NB if over-dispersed |
| Medium counts | receptions, rebounds, assists (NBA), strikeouts, saves | Count, dispersion depends on mean | C/D | NB binned or empirical |
| Yardage / continuous | passing/rushing/receiving yards, minutes, TOI | Skewed, long right tail, rushing can be negative | C (volume × per-unit) | Empirical ratio or discretized normal; compared by CRPS |
| Team scoring | points, runs, goals, totals, margins | Sum of correlated events; schedule strength matters | D (ridge ratings + environment) | Discretized normal (football/basketball), NB (runs/goals); game total and margin derived from one joint simulation so all three agree |

## 4. Point-in-time discipline

1. Every feature is computed from games that finished before the projected game (shift-by-one inside the entity; ratings
   refit on blocks strictly earlier). `pit.assert_point_in_time` guards timestamped inputs.
2. Information classes are recorded per dataset: **archived pregame** (captured before kickoff with a timestamp),
   **reconstructable** (deterministic from earlier box scores), **retrospective / possibly contaminated** (e.g. injury
   designations without timestamps, "did the player start"), **missing**.
3. Conditioning on participation ("player played") is not pregame information; where a backtest conditions on it, the
   report quantifies the effect and the production projection carries a participation hurdle or gate REVIEW instead.
4. Splits are chronological: development (build, discover), validation (select), holdout (evaluated once, frozen
   candidates only). Existing frozen boundaries (NFL Week-1 freeze, 2026 weeks ≥5 market holdout, CFB archetype sealed
   holdout) are honoured.

## 5. Promotion rule

A family is **READY** only if its best model beats the simple baselines on validation, holds up on the untouched
holdout (CI excludes no-improvement or matches validation within noise), has calibrated intervals (cover_80 within
±0.05) and shows no unacceptable subgroup failure (e.g. a role bucket with large bias). READY still does not change what
SIFT displays as the headline number: that requires the owner adding the family to `PROMOTED_FAMILIES`
(`src/lib/projections.ts`). Betting authority is never changed by this program.
