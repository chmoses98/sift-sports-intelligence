# SIFT Projection Foundation — research report

*Date 2026-10-17 · branch `claude/loving-davinci-53ho9c` in all six repos · research only: nothing here changes betting authority, merges or deploys.*

Full per-sport write-ups (every table, every experiment): `nfl-edge-finder/research/projection_foundation/RESULTS_NFL.md`,
`cfb-edge-finder/…/RESULTS_CFB.md`, `nba-edge-finder/…/RESULTS_NBA.md`, `edge-finder-api/…/RESULTS_MLB.md` (MLB),
`NHL-edge-finder/…/RESULTS_NHL.md`. Machine-readable twins: each repo's `results/summary.json`; generated cross-sport tables:
`docs/PROJECTION_FOUNDATION_TABLES.md`. Methods and their literature: `research/projection_foundation/METHODOLOGY.md`.

How to read the numbers:
* **MAE** = average miss of the projected mean. **Bias** = projection − actual on average (positive = projects too high).
* **CRPS** scores the *whole* projected distribution (lower is better; for a single number it equals MAE). It is the main
  ranking metric because SIFT prices ladders, not points.
* **80% coverage** = share of outcomes that landed inside the published 80% range (target: 80%).
* **Δ […]** = paired difference on identical player-games with a 95% confidence interval from resampling *whole games*
  (players in one game are not independent). Negative = the new model is better. If the interval crosses 0, it's a tie.
* **Baseline A** = season average shrunk toward the position average. **Incumbent** = the model SIFT/the repo uses today,
  re-run on the same games.

---

## 1. Executive summary

**What was investigated.** For every major player and team stat in five sports, we rebuilt history game by game,
projected each game using only what was known before it, and scored those projections against what happened —
about **3.8 million scored stat projections** across 2014–2026, split chronologically into a development period (build),
a validation period (choose) and an untouched holdout (score once). The holdouts alone contain **~220,000 independent
player-games and ~19,000 team-games** that no model was tuned on.

**What was built.**
* A shared statistics core (`pf_core`, identical in all six repos): point-in-time feature builders, empirical-Bayes
  shrinkage, schedule-adjusted team ratings, count and yardage distributions, game-clustered scoring, experiment records and
  the **Projection Quality Gate** (PASS / REVIEW / BLOCK).
* Per sport: a reproducible walk-forward pipeline that tests a ladder of models (A season average → B recency-weighted →
  C opportunity × efficiency → D + opponent and game environment → E gradient-boosted trees → F stacked ensemble), picks a
  winner on validation and scores it once on the holdout; a forward projector that emits `sift.projections.v1` with gate
  results; and a scheduled workflow (inert until merged) that will publish projections and build a live track record.
* SIFT: the Player Prop Explorer and game prop cards show the independent projection (expected value, realistic range,
  opportunity, opponent adjustment, reliability, freshness) as a labelled **shadow** beside today's number; the Research
  Lab shows per-stat reliability; a feed monitor fails visibly if a feed goes stale or incoherent.

**What improved (holdout, untouched data).**
* **Every frozen model beat its simple baseline on the holdout** in all five sports.
* Against the models in use today: NFL player projections are better than `shadow-0.4.0` in 8 of 10 stats (targets CRPS
  −8%); MLB strikeouts, batters faced and outs beat the production pitcher engine (batters faced Δ −0.25 [−0.27, −0.23]);
  MLB hitter stats beat the production hitter engine on every probability score, mostly by removing its biases (hits
  +0.135 → −0.010 per game); CFB team points miss by 8.99 vs 9.97 for the retired engine and 9.42 for the script engine
  baseline SIFT shows today; NHL shots, assists and points beat the archived `PLAYER_SIM_V1` forecasts on 2026-27 games;
  NBA beats the production simulator in every stat by the widest margins of the program — minutes miss 4.76 vs 6.17 per
  game (the simulator projects players who play ~2.4 minutes short, the root of the documented prop-over bias) and points
  CRPS improves by 0.38 [0.37, 0.40].
* **Ranges are honest.** In every sport and almost every stat, the published 80% range caught 78–84% of outcomes on the
  holdout, and threshold probabilities at Kalshi-style rungs are within ~1–3 points of observed hit rates.

**What failed or remains unreliable.**
* **No model beats the market.** Where compared (CFB closing lines, NFL/NHL/MLB prior market studies), the market is equal
  or better. These projections are a foundation, not a betting signal. Betting authority is unchanged.
* **Three families lose to the incumbent:** NFL passing TDs, NHL goalie saves, and (on totals/margins) nothing beats the
  CFB closing line. All three are marked NEEDS IMPROVEMENT or SHADOW, with a diagnosed cause.
* **Participation is the unsolved problem everywhere.** Historical, timestamped injury/lineup/depth-chart data does not
  exist in the archives, so player projections are *conditional on playing*. In the NFL 59% of role-player DNPs carried
  no injury designation; CFB has no injury history at all; MLB's "probable pitcher" field is overwritten after games.
* Fancy features that didn't help: Statcast pitch quality (MLB), back-to-backs and line changes (NHL), preseason
  talent/returning-production priors (CFB), vacated targets from injured teammates (NFL targets).

**Closest to production** (READY = beat baselines on validation and the untouched holdout, calibrated, no major subgroup
failure): NFL team pass/rush attempts, team points, targets, receptions, completions, passing yards; CFB team points,
plays, team passing/rushing yards, points per play, success rate; MLB pitcher strikeouts, batters faced, outs; NBA minutes,
points, rebounds, assists, threes, PRA, FGA (conditional on playing, and assuming the live injury report is wired in).
READY still only means "accurate enough to show as research"; it becomes SIFT's headline number only after you approve it
(see §13).

---

## 2. Historical data inventory

The sandbox can reach GitHub and PyPI only. NFL history came from nflverse releases; CFB from the repo's CFBD cache plus
sportsdataverse releases; NBA, MLB and NHL from data already archived in their repos and data branches.

| Sport | Seasons analysed | Games (holdout) | Independent player-games (holdout) | Families | What is missing / not point-in-time |
|---|---|---|---|---|---|
| NFL | 2012–2026 (2012–15 warm-up; dev 2016–21, val 2022–23, holdout 2024–25, 2026 wk 1–4 read-only) | 544 team-games ×2 | 6,160 receiving · 1,957 rushing · 1,050 QB starts · 6,965 TD | 13 | Injury designations have no timestamps (treated as near-pregame, flagged); depth charts timestamped only 2025+; game-time weather is observed, not forecast (not used); "did he play" is post-game |
| CFB | 2014–2026 (dev 2015–19, val 2021–22, holdout 2023–24, 2nd holdout 2025, live 2026) | 1,502 FBS games | 21,529 receiving · 11,766 rushing · 2,698 QB | 17 | No targets in any box score; no historical injuries/depth charts; transfer portal only 2025; no live 2026 EPA; FCS-vs-FCS games absent |
| NBA | 2014-15 – 2025-26 (dev 2015–22, val 2022-24, holdout 2024-26) | 2,462 | 52,796 player-games (all stat families) · 4,924 team-games | 8 | Starting lineups only post-game (never archived); official injury reports archived only for 2025-26; no pregame spread history before 2025-26; no travel table |
| MLB | pitchers 2022–2026, hitters 2024–2026 (dev 2023–24, val 2025, holdout 2026 RS) | 2,427 | 4,854 starts · 43,686 hitter-games | 15 | Weather, injuries/IL missing; Statcast only 7 weeks; probable pitchers overwritten post-game; batting order used is post-game (pregame lineups archived for only 527 games); only 40% of archived team-run projections were truly pregame |
| NHL | 2021-22 – 2026-27 (dev 2021–23, val 2023-24, holdout 2024–26, 2026-27 prospective) | 2,623 | 94,228 skater-games · 5,222 goalie starts | 6 + TOI | Pregame lines/PP units and starting goalies archived only from 2026-09-30; no historical injury status; 57 games in 2024-25 lack shift charts |

Point-in-time classes used throughout: **archived pregame** (captured before start with a timestamp), **reconstructable**
(box-score facts used only lagged), **retrospective / possibly contaminated** (e.g. untimestamped injury tags, post-game
lineups), **missing**. Three archive integrity findings are new:
1. MLB `data/pipeline/<date>/projections.json` is overwritten during the day — only **40%** of rows were written before first
   pitch. Earlier audits that treated it as pregame partly used post-start rewrites.
2. MLB's feed "probable pitcher" equals the actual starter 99.9% of the time because it is overwritten post-game; scratches
   cannot be measured, so MLB backtests are "starter known".
3. NFL `nflverse` injury files are rebuilt in place with no per-row timestamp.

---

## 3. Model comparison tables (holdout, frozen winners)

Every row: best model chosen on validation, then scored **once** on the holdout. Full ladders (A–F on validation) are in
`docs/PROJECTION_FOUNDATION_TABLES.md` and the per-sport reports.

### NFL (holdout 2024–25)

| Stat | Best model | Sample | MAE | Bias | 80% cov. | vs baseline A (CRPS) | vs incumbent shadow-0.4.0 | Verdict |
|---|---|---|---|---|---|---|---|---|
| Team pass attempts | F stack | 1,088 | 6.13 | +1.09 | 0.81 | −0.060 [−0.104, −0.018] | — | READY |
| Team rush attempts | F stack | 1,088 | 5.74 | −0.04 | 0.80 | −0.102 [−0.146, −0.060] | — | READY |
| Team points | F stack | 1,088 | 7.17 | −0.66 | 0.80 | −0.352 [−0.453, −0.259] | — | READY |
| Targets | F + availability | 6,160 | 2.00 | +0.17 | 0.81 | −0.083 [−0.096, −0.072] | −0.123 [−0.141, −0.107] | READY |
| Receptions | F + availability | 6,160 | 1.55 | +0.07 | 0.81 | −0.043 [−0.051, −0.036] | −0.069 [−0.082, −0.058] | READY |
| Receiving yards | F + availability | 6,160 | 20.98 | +0.97 | 0.81 | −0.377 [−0.449, −0.306] | −0.325 [−0.406, −0.252] | SHADOW (new-team subgroup) |
| Carries | F + availability | 1,957 | 3.97 | +0.10 | 0.82 | −0.274 [−0.332, −0.221] | −0.233 [−0.285, −0.181] | SHADOW (new-team subgroup) |
| Rushing yards | F + availability | 1,957 | 24.26 | −0.33 | 0.81 | −0.738 [−0.985, −0.511] | −0.243 [−0.452, −0.031] | SHADOW (new-team subgroup) |
| Passing attempts | F, QB starts-only | 1,050 | 6.78 | +1.19 | 0.80 | −0.196 [−0.280, −0.111] | −0.136 [−0.203, −0.068] | SHADOW (validation gain not significant) |
| Completions | F, QB starts-only | 1,050 | 4.68 | +0.56 | 0.81 | −0.136 [−0.194, −0.078] | −0.091 [−0.137, −0.043] | READY |
| Passing yards | F, QB starts-only | 1,050 | 58.28 | +9.04 | 0.81 | −1.368 [−2.131, −0.650] | −0.563 [−1.194, +0.087] (tie) | READY |
| Passing TDs | D, QB starts + implied total | 1,050 | 0.93 | +0.03 | 0.79 | −0.013 [−0.022, −0.004] | **+0.012 [+0.005, +0.021] worse** | NEEDS IMPROVEMENT |
| Anytime TD | F + availability | 6,965 | 0.34 | −0.01 | 0.80 | −0.006 [−0.008, −0.005] | −0.001 [−0.002, −0.000] | SHADOW (new-team subgroup) |

### CFB (holdout 2023–24; 2025 second holdout agrees)

| Stat | Best model | Sample | MAE | Bias | 80% cov. | vs baseline / incumbents | Closing market | Verdict |
|---|---|---|---|---|---|---|---|---|
| Team points | G game-level ridge | 3,004 | 8.99 | −0.09 | 0.81 | baseline 10.50 (Δ −0.913 [−1.033, −0.783]); retired engine 9.97 (Δ −0.625); script-engine baseline in SIFT 9.42 | 8.84 (market better, Δ +0.103 [+0.050, +0.158]) | READY |
| Margin | G | 1,502 | 12.44 | −0.42 | 0.80 | retired engine 13.98; v2 research 12.46 (tie) | 12.09 | SHADOW (behind closing line) |
| Game total | G | 1,502 | 12.88 | −0.17 | 0.81 | retired engine 13.62; v2 research 12.90 | 12.77 (tie, Δ +0.07 [−0.02, +0.17]) | SHADOW |
| Plays | F stack | 3,004 | 7.13 | +0.49 | 0.82 | Δ −0.203 [−0.256, −0.154] | — | READY |
| Team passing yards | F | 3,004 | 62.2 | +2.1 | 0.83 | Δ −1.26 [−1.62, −0.89] | — | READY |
| Team rushing yards | F | 3,004 | 53.8 | −0.8 | 0.83 | Δ −3.06 [−3.58, −2.54] | — | READY |
| Points per play / success rate | F | 3,004 / 2,996 | 0.139 / 0.060 | ~0 | 0.80 | both beat baseline (CIs exclude 0) | — | READY |
| EPA/play | F | 2,996 | 0.132 | ~0 | 0.79 | beats baseline | — | INSUFFICIENT DATA (no live 2026 EPA) |
| QB pass att / pass yds | F | 2,698 | 7.36 / 66.9 | −0.4 / −3.3 | 0.82 / 0.84 | beat season average | — | SHADOW (participation unverifiable) |
| Carries / rush yds | E / F | 11,766 | 4.02 / 25.4 (avg 27.4) | ~0 | 0.79 / 0.82 | beat season average | — | SHADOW |
| Receptions / rec yds | F | 21,529 | 1.37 / 19.6 (avg 20.6) | ~0 | 0.80 / 0.81 | beat season average | — | SHADOW |
| Targets, week-1 players | — | — | — | — | — | — | — | INSUFFICIENT DATA |

### MLB (validation 2025, holdout = 2026 regular season)

| Stat | Best | Sample | MAE | Bias | 80% cov. | vs baseline (CRPS) | vs production engine | Verdict |
|---|---|---|---|---|---|---|---|---|
| Batters faced | E (LightGBM) | 4,854 starts | 2.62 | +0.05 | 0.81 | −0.379 [−0.428, −0.332] | −0.249 [−0.268, −0.229] | READY |
| Outs | F | 4,854 | 2.71 | +0.06 | 0.82 | −0.255 [−0.286, −0.224] | −0.076 [−0.091, −0.063] | READY |
| Strikeouts | F | 4,854 | 1.73 | +0.06 | 0.80 | −0.066 [−0.077, −0.055] | −0.032 [−0.039, −0.026] (rung RPS); MAE 1.747 vs 1.799 | READY |
| Walks / hits / runs allowed | D / F / F | 4,854 | 1.00 / 1.67 / 1.61 | ~0 | 0.80–0.81 | all better (CIs exclude 0) | no incumbent | SHADOW |
| Plate appearances | F | 43,686 | 0.57 | 0.00 | 0.78 | −0.023 [−0.025, −0.022] | −0.089 [−0.104, −0.076] | SHADOW (post-game batting order) |
| Hits / TB / HR / R / RBI / H+R+RBI | F | 43,686 | 0.68 / 1.33 / 0.22 / 0.57 / 0.63 / 1.49 | ≤0.02 | 0.80 | all better | all better on CRPS (e.g. hits −0.011) | SHADOW |
| Team runs | D | 4,854 | 2.50 | +0.03 | 0.79 | −0.020 [−0.027, −0.012] | −0.017 [−0.050, +0.014] (tie, n=614) | SHADOW |
| Game total | D convolution | 2,427 | 3.55 | +0.05 | 0.79 | — | — | SHADOW |

### NHL (holdout 2024-25 + 2025-26; 2026-27 prospective vs archived forecasts)

| Stat | Best | Sample | MAE | Bias | 80% cov. | vs baseline (CRPS) | vs incumbent (holdout / 2026-27) | Verdict |
|---|---|---|---|---|---|---|---|---|
| Time on ice | E (LightGBM) | holdout | 1.82 min | −0.05 | — | season avg 1.97, EWMA 1.84 | PLAYER_SIM_V1 1.94 on 2026-27 (ours 1.86) | SHADOW |
| Shots on goal | F stack | 94,228 | 1.02 | +0.04 | 0.80 | −0.006 [−0.007, −0.006] | −0.002 [−0.003, −0.001] / −0.008 [−0.013, −0.004] | SHADOW |
| Goals | F | 94,228 | 0.27 | 0.00 | 0.80 | −0.001 [−0.001, −0.001] | −0.0002 / tie | SHADOW |
| Assists | F | 94,228 | 0.40 | 0.00 | 0.80 | −0.002 [−0.002, −0.002] | −0.002 / −0.004 [−0.007, −0.001] | SHADOW |
| Points | F | 94,228 | 0.52 | 0.00 | 0.80 | −0.003 [−0.003, −0.003] | −0.002 / −0.003 [−0.006, −0.000] | SHADOW |
| Goalie saves | F | 5,222 | 5.35 | +0.18 | 0.81 | −0.087 [−0.112, −0.058] | **+0.028 [+0.012, +0.043] worse** | NEEDS IMPROVEMENT |
| Team goals | F | 5,246 | 1.38 | +0.04 | 0.80 | −0.009 [−0.013, −0.004] | tie (DATA_ONLY_V2) | SHADOW |

NHL's gains are real but small: goals, assists and points sit within ~0.2–1% of the pure-randomness floor of a Poisson
count. NHL kept every family at SHADOW until a live record exists (a stricter bar than the other sports, see §11).

### NBA (holdout 2024-25 + 2025-26; conditional on playing)

| Stat | Best | Sample | MAE | Bias | 80% cov. | vs baseline A (CRPS) | vs production simulator (CRPS) | Verdict |
|---|---|---|---|---|---|---|---|---|
| Minutes | E LightGBM | 52,796 | 4.76 | +0.09 | 0.80 | −0.51; MAE vs EWMA −0.33 [−0.36, −0.31] | MAE −1.43 [−1.48, −1.38] (sim 6.17, bias −2.4) | READY |
| Points | E LightGBM + empirical | 52,796 | 4.52 | −0.03 | 0.79 | −0.176 [−0.187, −0.165] | −0.383 [−0.401, −0.366] (sim bias −1.22) | READY |
| Rebounds | F stack (minutes mixture) | 52,796 | 1.87 | +0.01 | 0.79 | −0.058 [−0.063, −0.054] | −0.159 [−0.166, −0.152] | READY |
| Assists | E LightGBM | 52,796 | 1.32 | 0.00 | 0.80 | −0.037 [−0.040, −0.035] | −0.089 [−0.094, −0.085] | READY |
| Threes | F stack | 52,796 | 0.88 | −0.01 | 0.79 | −0.014 [−0.015, −0.012] | −0.036 [−0.038, −0.034] | READY |
| PRA | E LightGBM (NB) | 52,796 | 5.92 | −0.03 | 0.77 | −0.308 [−0.326, −0.289] | −0.700 [−0.728, −0.673] | READY (range slightly narrow) |
| FGA / usage | E LightGBM | 52,796 | 2.72 | 0.00 | 0.80 | −0.161 | −0.378 | READY |
| Team points | D ratings + rest | 4,924 | 9.46 | +0.70 | 0.79 | −0.34 [−0.42, −0.25]; season average 9.95 | none exists | SHADOW (no incumbent) |

Threshold calibration (points, validation): 10+ 0.479 vs 0.475 realised, 20+ 0.165 vs 0.167, 30+ 0.042 vs 0.043; the
production simulator projected 0.453 at 10+ against 0.492 realised. The challenger has the lower Brier at every rung of
every family. Conditioning matters: points MAE is 4.52 for players who play, 4.17 over the whole candidate pool when the
forecast is P(play) × E[points | play], and 5.25 if you assume everyone plays.

---

## 4. Detailed experiment findings

The per-sport reports hold all ~260 experiment records in Question / Hypothesis / Method / Data / Result /
Interpretation / Decision form. The ones that change how SIFT models sports:

**NFL-PF-05 — Are the new models better than the incumbent, replayed with its own code?**
*Hypothesis:* structured opportunity × efficiency + trees beat shadow-0.4.0. *Method:* replay `shadow-0.4.0` and the
`shadow-0.5.0` challenger season by season with their frozen code (no file edits), score their own distributions on identical
player-games. *Result:* better in 8/10 player stats on holdout (targets −0.123, receptions −0.069, carries −0.233 CRPS);
tie on passing yards; worse on passing TDs (+0.012). *Interpretation:* the gains are opportunity gains. Caveat: the replay
includes current-season games, so it understates the incumbent's live 2026 error from defect D1. *Decision:* adopt (shadow).

**NFL-PF-03 — Do closing spread/total add to team projections?** *Result:* team points D − D_opp −0.149 [−0.219, −0.072];
pass attempts −0.023. Rush attempts rise from 24.4 as a 7-point underdog to 28.5 as a 7-point favourite; pass attempts
barely move (34.0 vs 34.6). *Interpretation:* the closing line carries most pregame team information. *Decision:* adopt.
Consequence: the NFL team-points model is essentially the market's implied total; it is a coherence anchor, not an independent opinion.

**CFB-SOS-01/02/03 — Does strength of schedule matter, and how?** Schedule-adjusted ridge ratings beat raw opponent
averages (validation MAE 9.33 vs 9.60, Δ −0.27 [−0.40, −0.13]); carrying prior seasons helps most (−0.70 [−0.85, −0.56]);
pooling FCS teams into one rated entity improves FCS games by 1.4–2.0 points. *Decision:* adopt all three.

**CFB-TP-02 — Does a game-level model beat summing two team projections?** Ridge on margin and total using both teams'
offence *and* defence ratings; team points = (total ± margin)/2 so all three always agree. Holdout matches the archived v2
research models on margin (Δ −0.01 [−0.10, +0.08]) and ties the closing total. *Honesty note:* this model was added after a
first scoring pass, so the CFB holdout was looked at twice for these families; 2025 serves as the clean second holdout and agrees.

**MLB-PF-P1 — Why did the transparent workload model miss batters faced?** A pitch-count leash ignores role. Openers
(pitched 1–4 days earlier) are 6–8% of "starts" but ~13% of error (bias +3.8 BF); season debuts +3.2; spot starters +6.5.
Adding rest/opener/debut/layoff terms cut MAE 2.81 → 2.61 and these biases to under +1 BF. *Decision:* adopt; this is the
main reason batters faced beats the production engine by 0.25 CRPS.

**MLB-PF-H1 — What is the confirmed lineup worth?** Batting slot changes in 41% of games. Knowing the slot improves PA
CRPS by 0.010 [0.009, 0.011]; for RBI the gain is not significant. *Decision:* hitters stay SHADOW until a prospective
record with genuinely pregame lineups exists.

**NHL — Is saves error about save percentage or volume?** Knowing the realised shots against would cut saves MSE from 54
to 2.7: the error is almost entirely *volume*. Pulled starters are 6.4% of starts but 30% of squared error (bias +14.5 saves
when pulled). *Decision:* the incumbent's pull-hazard/game-script mixture is the right structure; borrow it (priority).

**NBA — Is minutes the driver, and what is the injury report worth?** *Hypothesis:* a minutes model with a participation
hurdle, then per-minute rates, beats the production simulator. *Method:* LightGBM minutes refit each season on the prior
five; the production simulator from `src/nba_edge` re-run unchanged, walk-forward, over all 4,923 games of 2022-26.
*Result:* minutes MAE 4.76 vs 6.17 (Δ −1.43 [−1.48, −1.38]); the simulator projects players who play ~2.4 minutes short
(starters ~3). Using the archived official T-60 injury reports for 2025-26: minutes error −0.20 [−0.22, −0.17] (same as
the box-score proxy, so the proxy is not leaking), participation Brier 0.132 → 0.087. Knowing actual starters would add
−0.17 minutes, but lineups were never archived. Forcing team minutes to sum to 240 (the simulator's core mechanism) added
nothing. *Decision:* adopt; wire the live injury report into the projector (priority).

**NFL-PF-06 / NFL availability — What does "conditional on playing" cost?** Role players miss 15.8% of games; 59% of those
DNPs had no injury designation. Assuming everyone plays gives targets CRPS 1.457 (bias +0.49); a participation hurdle gives
1.415 (bias −0.10). Players who play through a Questionable tag produce 0.91× projection. *Decision:* adopt the own-tag term;
publish conditional on playing (prop void convention) and say so.

---

## 5. Projection error investigations — largest systematic errors

| Sport | Error pattern | Size | Status | What was done |
|---|---|---|---|---|
| NFL | QB histories mixed relief/garbage-time appearances | QB volume under-projected ~5% (−13.8 pass yds on dev) | **verified defect, fixed** | starts-only history + implied-total term |
| NFL | First games with a new team | over-projected 14–37% (rush yds +99% on 2022-23) | verified, fix pre-registered | correction fitted on dev, validated (CIs exclude 0), held for untouched data — not adopted post-freeze |
| NFL | Backup tiers (RB2+, TE2+, WR3+) | over-projected 7–18% | verified, fix pre-registered | as above |
| NFL | mean_defect's early-season targets deficit | realised/projected 0.96–1.00 on representative data | **ruled out** as a model defect | the remaining gap on Kalshi-listed players is listing selection (the exchange lists players whose role history hasn't caught up) |
| NFL | Publication defects caught by the gate | 8.3% of projections BLOCKed (pmf mean ≠ published mean); trees applied outside training population summed to 1.71× team carries | **verified, fixed** | publish the distribution's own mean; never apply E/F outside their population (reconciliation 1.05×) |
| CFB | Starting-QB change | team over-projected 2–3 points (market 1.3–1.8) | verified | cannot be modelled historically (no injury data); archive QB status weekly from now |
| CFB | Week 1 vs market | MAE gap +1.6 vs closing line (week 1), ~0.5 later | verified | talent/returning-production prior did **not** help; needs transfer/defensive turnover data |
| CFB | FBS vs FCS games | MAE 11.6 vs 9.5 | hypothesis (one pooled FCS rating) | gate REVIEWs FCS games; rate FCS teams from FCS-vs-FCS results |
| CFB | Unrealistic defensive rankings | see §6 | **verified defect** | replacement rating built; production not changed (owner decision) |
| MLB | Openers / debuts / spot starters / short rest | 13–33% of batters-faced error | **verified, fixed** | role & rest terms |
| MLB | Early exits (≤12 BF) | 4% of starts, 16–18% of BF error | ruled out as forecastable | needs injury/IL data; handled by the distribution's tail |
| MLB | Incumbent level biases (hits +0.135, PA +0.42, team runs −0.34) | every game | **verified, fixed** in challenger | matches RSCH-0033's −0.33 independently |
| NHL | League-level drift (shots/team-game 31.6 → 27.7, 2021–26) | saves bias +0.68 → +0.21 after fix | **verified, fixed** | rolling 1,200-start league level (decision made on validation; saves holdout scored twice — disclosed) |
| NHL | Pulled goalies | 30% of saves squared error | verified | pull-hazard mixture (priority 1) |
| NHL | Blowouts, overtime, back-to-backs, line/PP changes | large share of variance, ~zero bias | **ruled out** | randomness, not a model defect — stop iterating |
| All | `pf_core` 1.0.0 look-ahead in `group_prior_pit` / `rolling_opponent_allowed` fallback | rows on a group's first data date | verified (found by NHL's poisoned-future test) | audited: no development, validation or holdout row in any sport hit it; fixed in `pf_core` 1.1.0 |

---

## 6. Opponent-adjustment research

| Sport | Does adjusting for the opponent help on unseen games? | Schedule-adjusted vs raw opponent averages |
|---|---|---|
| NFL | Team level yes: team points −0.064 [−0.109, −0.013]; volume ~0.5–1% (borderline). Player level: helps receiving yards (−0.048), passing yards (−0.64), completions, receptions; nothing for targets. Fitted elasticities 0.35–1.03: raw opponent splits overstate matchup effects even after schedule adjustment. | ridge used throughout |
| CFB | **Largest effect of any sport.** Ridge vs no opponent: −1.56 MAE; ridge vs raw opponent-allowed: −0.27 [−0.40, −0.13] (validation), −0.51 (dev). FCS pooling is required; prior-season carry replaces heavy shrinkage. Calendar decay on top of season decay *hurt* (9.63 → 10.10). | schedule-adjusted clearly better |
| MLB | Opponent K% vs handedness and park help strikeouts and hitters (part of D). Schedule-adjusted ridge team ratings: **no gain** (+0.004 [+0.0005, +0.007]) — MLB schedules are balanced. | raw shrunk factors suffice |
| NHL | Helps shots (−0.002 CRPS), smaller for assists/points, not confirmed for goals on holdout. Ridge vs raw factor: identical at player level. | tie |
| NBA | Yes, small: position-specific opponent factor (shrunk, elasticity 0.6–0.7) plus pace improves every family on validation and holdout (CIs below 0), but only 0.1–0.4% of CRPS vs 4–5% for minutes × rate. A typical matchup moves a projection ±3–6%. At team level schedule-adjusted pace × efficiency is worth −0.34 CRPS. | player-specific expectations act as the schedule adjustment |

**CFB defensive rankings — diagnosis.** The ranks SIFT shows come from the script engine's `scripting/adjust.py`
(`fit_metric`, `rank_in_universe`): a *season-to-date-only* ridge (4 games of shrinkage, no prior season), on points *per
game*, ranked across FBS and **published even when the fit is flagged unstable** (the FBS schedule graph has ~85
disconnected pieces after week 1). Shrinkage cannot change the order when every team has played the same number of games,
so early ranks are just the order of 1–3 raw results. Measured against each team's rest-of-season defensive quality:

| Week | Script engine rank correlation | Carried schedule-adjusted rating | Raw points allowed | Top-10 overlap (engine / carried) |
|---|---|---|---|---|
| 2 | 0.36 | **0.62** | 0.31 | 2.0 / 4.4 |
| 4 | 0.49 | 0.57 | 0.47 | 3.9 / 4.2 |
| 8 | 0.53 | 0.52 | 0.52 | 4.2 / 4.0 |

Two further distortions: defences that already played an FCS team are flattered (their next points allowed is
under-projected by 1.3 vs 0.2 with FCS pooling), and per-game points mix in the team's own pace (correlation +0.34 with own
plays). Even a good rating identifies only ~4 of the true top-10 defences by mid-season, so **any published rank needs an
uncertainty band**. Fix: rank by the carried, FCS-pooled rating, suppress ranks until the schedule connects (≈ week 4), use
per-play or per-drive points. Not applied to production (your decision, §13).

---

## 7. Opportunity-model research

| Sport | Opportunity | Best accuracy (holdout) | Main weakness |
|---|---|---|---|
| NFL | team pass / rush attempts | MAE 6.1 / 5.7 per game; corr 0.34 / 0.29 | game script; spread helps rushing, not passing |
| NFL | targets / carries | MAE 2.0 / 4.0; corr 0.65; targets CRPS −8% vs incumbent | role changes (new team, depth tier); listing selection on Kalshi players |
| NFL | QB pass attempts | MAE 6.8 (validation gain not significant) | relief appearances (fixed); level drift (+1.2 bias holdout) |
| CFB | plays | MAE 7.1 (season avg 7.4) | 2023 clock-rule change; plays × points/play does *not* beat direct points ratings |
| CFB | targets | — | do not exist in any CFB box score; needs play-by-play parsing |
| MLB | batters faced | MAE 2.62 (production engine much worse: Δ −0.25 CRPS) | early exits (injury) unforecastable |
| MLB | plate appearances | MAE 0.57; known slot worth 0.010 CRPS | batting order only post-game in history |
| NHL | time on ice | MAE 1.82 min (PLAYER_SIM_V1 1.93 on 2026-27, despite it having pregame lines) | top-line under-projected 0.27 min; minutes help shots but not scoring |
| NBA | minutes | MAE 4.76 (production simulator 6.17, EWMA 5.09); play/no-play Brier 0.125 (simulator 0.174) | new teammate absences = 32% of minutes error (fixable with the archived official injury report: −0.20 min, participation Brier 0.132 → 0.087); role changes 15% (needs pregame lineups — never archived) |

Across sports, **better opportunity is where most of the accuracy gain came from** (NFL targets, MLB batters faced, NHL
TOI), and the largest remaining opportunity errors are role events the archives can't see in advance (injuries, depth
changes, early exits).

---

## 8. Distribution and calibration research

* **Calibration is the strongest result of the program.** Holdout 80% coverage: NFL 0.79–0.82, CFB 0.79–0.84, MLB
  0.78–0.82, NHL 0.80–0.81, NBA 0.77–0.80. PIT variance ratios (1.0 = perfectly sized ranges) 0.91–1.07. Threshold hit rates at
  Kalshi-style rungs are within ~0–3.6 percentage points of the projected probabilities (worst: NFL pass attempts 35+/40+,
  over-confident by 3.6 pp; NFL passing yards 300+ by 3.0 pp).
* **Which distribution:** negative binomial with dispersion that varies by projected volume wins for NFL targets/receptions
  and team volume; an empirical "residual ratio by volume bin" wins for every yardage stat (the normal curve never wins —
  it misses the right skew); Poisson is enough for NHL goals/assists/points (fitted dispersion ≈ 0); MLB hitters use
  binomial-on-PA and total-bases convolution families; CFB team scores come from one joint distribution, so team totals,
  game totals and margins can never contradict each other. NBA: pricing points off a single expected-minutes figure is
  overconfident (PIT variance 1.37, 80% ranges caught only 64%) — exactly how the old simulator's 39% coverage for heavy-minute
  players happened; the empirical/NB marginals fix it (coverage 0.79–0.80; PRA 0.77, slightly narrow).
* **Defects found:** NHL game totals are too wide (PIT variance 0.92; independent team draws ignore OT/shootout structure)
  — joint model needed before publishing total ladders. NFL workhorse RBs at 100+ rushing yards are over-confident (24.7%
  projected vs 17.8% realised, n=219); WR1 100+ receiving yards slightly under-confident (17.0% vs 19.9%).
* **Probabilities at the market's own number are not informative** (CFB cover/over Brier ~0.26 vs 0.25 coin flip). A
  calibrated distribution is not an edge.

---

## 9. Improvements achieved (clearly split by data period)

| | Development | Validation (selection) | Holdout (scored once) |
|---|---|---|---|
| NFL | QB starts-only fix; availability terms | 12/13 beat A (passing attempts CI crosses 0) | 13/13 beat A; 8/10 beat shadow-0.4.0, 1 tie, 1 worse |
| CFB | SOS, FCS pooling, prior-season carry | team points G 9.17 vs F 9.29 | team points 8.99 vs baseline 10.50, retired engine 9.97; 2025 confirms |
| MLB | opener/rest terms (BF MAE 2.81 → 2.61) | vs production (rung RPS): K −0.028 [−0.035, −0.022], BF −0.249, outs −0.064 | K −0.032, BF −0.249, outs −0.076 vs production; hitters better on every CRPS |
| NHL | league-drift fix (saves bias +0.68 → +0.21) | shots/assists/points beat A | beat A in 6/6; beat PLAYER_SIM_V1 in shots/assists/points; worse on saves |
| NBA | minutes model (LightGBM + participation hurdle); usage-freed teammate-absence proxy, checked against archived T-60 injury reports (no leakage) | all 7 player families beat A and the simulator (e.g. points −0.33 vs simulator) | all 7 beat A and the simulator, CIs well below 0 (points −0.38, PRA −0.70, minutes MAE −1.43) |

Relative size: the biggest improvements are where the incumbent had a structural defect (MLB batters faced, NFL targets,
MLB hitter level bias, CFB retired engine). Where the incumbent was already sound (NHL scoring stats, NFL passing yards,
MLB team runs), gains are small or ties.

---

## 10. Failed experiments and lessons

| Experiment | What happened | What it changes |
|---|---|---|
| Gradient-boosted trees as a stand-alone model (NFL) | won only for targets/receptions/rec yds/carries; extrapolated badly outside its training population (non-RB carries 3.4 projected vs 0.76) | trees only inside a stack and only for players in their training population |
| Opportunity × efficiency as the headline model (NFL targets, CFB points) | no better than a player EWMA / direct rating | keep it as the explanation layer and stack input |
| Vacated targets from injured teammates (NFL) | no gain, even with *actual* absences as an oracle | target error is role, not absences; carries are different (absences matter, adopted) |
| Discretised normal for yards | lost to empirical ratios in every yards family | empirical residual ratios are the default for yardage |
| Talent / returning-production preseason prior (CFB) | no week-1 gain | need defensive turnover + transfer data |
| Calendar recency decay on CFB ratings | MAE 9.63 → 10.10 (worse) | decay within season only; prior season is the most valuable early information |
| Statcast whiff/velocity (MLB) | Δ −0.0004 [−0.013, +0.012] on 468 starts | revisit only with a multi-season pitch archive |
| Schedule-adjusted ratings (MLB, NHL player level) | no gain over raw shrunk factors | keep the simpler factor there; SOS matters in CFB, a bit in NFL |
| Back-to-back, injury-return, line-change fixes (NHL) | < 0.01% CRPS | stop iterating on schedule fatigue for NHL props |
| Saves via team shots allowed × save% (NHL) | biased high (starter faces ~1 fewer shot than team allows) | model starter shots faced directly, with a pull mixture |
| Team minutes budget — water-fill to 240 (NBA) | no gain | the simulator's core mechanism adds nothing over a good per-player minutes model |
| Blowout minutes from rating-based expected margin (NBA) | no gain (−0.02 [−0.05, +0.005]) | needs a real pregame spread history |
| Single-minutes distributions for NBA points | overconfident (PIT var 1.37, 64% coverage) | price props off the outcome's own distribution, not a mean-minutes plug-in |
| The quality gate as an error predictor | REVIEW projections only ~0–5% worse (NFL, NHL lower; CFB +0.2–0.5 MAE; MLB BF +0.65 MAE) | the gate's value is catching structural defects (it caught two in NFL), not forecasting misses — present it that way |

---

## 11. Production-readiness scorecard

Rule (`METHODOLOGY.md` §5): **READY** = best model beats baselines on validation *and* the untouched holdout, with
calibrated ranges and no unacceptable subgroup failure. **SHADOW VALIDATION** = historically sound but missing something
(pregame-only inputs, a subgroup failure, or a live record). **NEEDS IMPROVEMENT** = loses to the incumbent or has a
material error. **INSUFFICIENT DATA** = cannot be validated or projected forward with available data.

| Sport | READY | SHADOW VALIDATION | NEEDS IMPROVEMENT | INSUFFICIENT DATA |
|---|---|---|---|---|
| NFL | team pass att, team rush att, team points, targets, receptions, completions, passing yards | receiving yards, carries, rushing yards, anytime TD (new-team subgroup bias), passing attempts (validation gain not significant) | passing TDs (worse than incumbent) | — |
| CFB | team points, plays, team passing yards, team rushing yards, points/play, success rate | margin, game total (behind the closing line), all player families (participation unverifiable) | — | EPA/play (no live source), targets (not in box scores), week-1 players |
| MLB | pitcher strikeouts, batters faced, outs | walks, hits allowed, runs allowed (no incumbent, no live record), all hitter stats (post-game lineups), team runs (tie), game total | — | — |
| NHL | — | TOI, shots, goals, assists, points, team goals (all pass historically; NHL also requires a live record) | goalie saves | — |
| NBA | minutes, points, rebounds, assists, threes, PRA, FGA | team points (no incumbent to compare) | — | — |

Consistency note: NHL applied a stricter bar (a live shadow record) than the other sports. Under the shared rule, NHL shots,
assists and points would qualify for READY; the published label stays SHADOW until the workflow has run for a few weeks,
which is the safer reading. MLB marks READY without a live record; its own top priority is a prospective shadow before any
display change. CFB's team-points holdout was examined twice (disclosed), with 2025 as the clean confirmation. NBA's READY rule (fixed in
code before its holdout was scored) requires beating both baseline and incumbent with calibrated ranges but has no explicit
subgroup check; its root-cause table shows no subgroup with a large bias except role changes and teammate absences, which
the injury feed addresses. NBA READY assumes the live official injury report is wired in (priority 10).

---

## 12. Remaining engineering priorities (ranked)

| # | Item | Expected accuracy impact | Defect severity | Evidence | Complexity | Data |
|---|---|---|---|---|---|---|
| 1 | **Merge the five projection workflows** so every forward projection is archived and scored | turns SHADOW into READY or NEEDS IMPROVEMENT with real pregame evidence | — | all sports' readiness depends on it | low | already captured |
| 2 | **Participation / availability archive** (timestamped injury tags, lineups, starters, depth charts, every slate) | NFL hurdle CRPS 1.457 → 1.415; CFB QB-change bias 2–3 pts; MLB lineups; NHL starters | high (largest unsolved error) | NFL availability study, CFB QB change, MLB H1 | low–medium | captures already exist for 2026 in several repos; need persistence + joins |
| 3 | **NFL new-team and backup-tier corrections** (pre-registered) | 14–37% / 7–18% over-projection removed in those groups; moves 4 families toward READY | medium | dev + validation, CIs exclude 0 | low | existing |
| 4 | **NHL saves pull-hazard mixture** | only NHL family losing to its incumbent; pulls = 30% of saves error | medium | §5 | medium | existing |
| 5 | **Replace CFB defensive ranks** with the carried, FCS-pooled rating; suppress until schedule connects; add uncertainty | week-2 rank correlation 0.36 → 0.62 | high (user-visible, misleading) | CFB-DEF-01 | low–medium (production change) | none new |
| 6 | **NFL passing TDs**: add the incumbent's implied-total regression rung | the one NFL loss (+0.012) | low | holdout | low | existing |
| 7 | **NHL joint team-goals model** for game totals | total PIT var 0.92 → ~1.0 | low | §8 | medium | existing |
| 8 | **CFB FCS ratings and live EPA / targets from play-by-play** | FCS games MAE 11.6 vs 9.5; unlocks EPA + targets families | medium | §5 | medium | sportsdataverse releases (reachable) |
| 9 | MLB postseason leash + postseason hitter lines | October projections | low | label in projections | medium | partial |
| 10 | **NBA live injury report + pregame lineup capture** | minutes −0.20, participation Brier −0.045; lineups −0.17 min more | high (the biggest NBA lever) | archived 2025-26 T-60 reports | low (parser exists) | official report archive; lineups must start being captured now |

---

## 13. Next development actions (concrete roadmap)

**Decisions only you can make** (nothing below happens without your approval):
1. Merge the six `claude/loving-davinci-53ho9c` branches (pull requests not yet opened — say the word and I'll open them).
   The workflows then start publishing to each repo's `projection-data` branch and SIFT starts showing the shadow projections.
2. After ~3–4 weeks of live record: approve promotions family by family by adding them to `PROMOTED_FAMILIES` in
   `src/lib/projections.ts` (empty today). Candidates first: MLB strikeouts/BF/outs, NFL targets/receptions, CFB team points.
3. Approve replacing the CFB defensive rankings in the script engine (production change).

**Engineering, in order:**
1. Week 0: merge → confirm each workflow's first run publishes and the SIFT monitor turns green.
2. Weeks 0–2: persistent pregame availability archive per sport (priority 2) and joins into the walk-forward datasets.
3. Weeks 1–2: NFL new-team/backup corrections and passing-TD rung, evaluated on 2026 weeks ≥ 5 *for projection accuracy
   only* (the market study's holdout stays untouched).
4. Weeks 2–4: NHL saves pull mixture + joint team goals; CFB FCS ratings + play-by-play parser (EPA, targets).
5. Monthly: the monitor + summary refresh re-score every family on the growing live record; READY families are proposed for
   promotion with their live numbers.
6. Market research (separate track, unchanged rules): disagreements stay MODEL_ERROR / VALIDATED_SIGNAL / UNRESOLVED;
   nothing here is a betting signal.

---

## Appendix A — infrastructure delivered

| Repo | Projection Foundation code | Workflow (inert until merged) | Forward projections |
|---|---|---|---|
| sift-sports-intelligence | `research/projection_foundation/` (canonical `pf_core`, contracts, methodology, monitor, report tables); `src/lib/projections.ts`, `FoundationProjection`, `ProjectionScorecard` | `projection-foundation-monitor.yml` (every 6 h, read-only) | consumer |
| nfl-edge-finder | `research/projection_foundation/nfl/` | `projection-foundation.yml` | 2026 week 6, 13 games, 870 player projections |
| cfb-edge-finder | `research/projection_foundation/cfb/` | `projection-foundation.yml` (Tue/Fri) | 2026-10-17, 52 games, 2,658 player projections (2,582 PASS / 180 REVIEW) |
| nba-edge-finder | `research/projection_foundation/nba/` | `projection-foundation.yml` (daily in season) | 2026-27 opening night (Oct 20: BOS@DET, PHI@NYK, OKC@SAS), 774 rows; PHI new arrivals' points/PRA BLOCKed (roster sums to 171 vs team 112) |
| edge-finder-api (MLB) | `research/projection_foundation/mlb/` | `projection-foundation.yml` | ALCS G4 2026-10-16 (retroactive, labelled; all REVIEW) |
| NHL-edge-finder | `research/projection_foundation/nhl/` | `projection-foundation.yml` (daily Oct–Jun) | 2026-10-17, 14 games, 2,028 rows (1,701 PASS / 323 REVIEW / 4 BLOCK) |

Safety: betting authority unchanged everywhere; projections carry `authority: research_only` and SIFT rejects any other value;
frozen NFL files byte-identical (pin test green); CFB archetype seal untouched; NFL 2026 weeks ≥ 5 never scored; no paid
services; nothing merged or deployed.

## Appendix B — `pf_core` defects found by the studies (fixed in 1.1.0)

Look-ahead fallback in `group_prior_pit` / `rolling_opponent_allowed` (NHL; audited harmless to all reported numbers);
out-of-support outcomes clipped in log score / CRPS / PIT (MLB, NFL — NFL widened supports and padded incumbent pmfs);
`lagged_features` dropped the caller's index; ridge ratings lacked team pooling, history windows and within-season-only
decay, and penalised home advantage (CFB); gate opponent thresholds not sport-aware (flagged 44% of CFB) and BLOCKed
legitimately floored distributions; empty-input crash in the bootstrap; NB parameters didn't record support size.
All were worked around inside the sport code. The reported results were produced with 1.0.0; to check that they do not
depend on the bugs, the full CFB pipeline was re-run under 1.1.0: every family reproduced the same model choice, mean accuracy
and readiness. Only two distribution scores moved, because out-of-range outcomes are now scored properly: plays' holdout gain
over baseline went from −0.203 to −0.154 CRPS (CI [−0.209, −0.104], still READY) and rushing-yards CRPS from 17.386 to 17.426.
NFL had already widened its supports for the same reason; NBA, MLB and NHL rerun on their next workflow run.
