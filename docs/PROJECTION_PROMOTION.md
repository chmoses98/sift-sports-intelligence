# Projection promotion: one authoritative projection per stat

*2026-10-18 · supersedes the shadow presentation described in `PROJECTION_FOUNDATION_LIVE.md` §7 · betting authority unchanged*

SIFT shows **one projection number per statistic**. Where the Projection Foundation model has beaten the established
model on an untouched historical holdout, and the live inputs it needs are proven, it is that number. Everywhere else the
established model stays the number. The two are never shown side by side, and the superseded model's values do not appear
anywhere in the user-facing interface (they stay in the repositories for benchmarking, monitoring and rollback).

Changing which engine produces a projection does **not** change betting: Kalshi bet-routing authority, validated-signal
requirements, betting thresholds, staking rules and execution safeguards are untouched, and a gap between a projection and
a market price is not an edge. `MODEL_ERROR` / `VALIDATED_SIGNAL` / `UNRESOLVED` classifications are unchanged.

## 1. How a number is chosen

`src/lib/projectionApprovals.ts` is the single record: one row per sport and family with the decision, the engine SIFT shows,
the live-input status, the reason, and the date. `src/lib/projectionAuthority.ts` resolves a request against it:

1. look up the approved engine for (sport, stat);
2. **established model** → the page keeps its existing number; nothing from the foundation feed is shown;
3. **Projection Foundation** → run the quality checks, then return ONE value or a withheld reason:

| Check | Fails when | Result |
|---|---|---|
| feed present | the feed is missing, unreachable or unrecognised | withheld |
| family validated | the feed does not publish the stat, or it is not READY | withheld |
| coverage | the player is outside the model's population for the game | withheld |
| quality gate | the engine's gate says BLOCK (carries the gate's own reason) | withheld |
| availability | confirmed or likely out; for MLB pitchers also anything other than a confirmed or probable starter | withheld |
| coherence | inverted range, mean below its own 10th percentile, non-monotone alternate lines | withheld |
| freshness | inputs older than the sport's limit (NFL/CFB 192 h, NBA/NHL 48 h, MLB 36 h) or of unknown age | withheld |

A withheld projection shows the reason and **no number from either engine**. There is no automatic fallback: every
approval has `fallback: null`. If a fallback is ever approved it must be named per stat in the approvals table, and the
fallback must pass its own checks.

A shown projection carries: the expected value, a realistic 80% range (a description of the same projection, not a second
one), a reliability level (High / Moderate / Low, with the reasons it is not High), availability and its source, the update
time, and matchup context. Rung and alternate-line probabilities come from the same published distribution as the expected
value; a line that is not on that distribution has no model probability rather than borrowing the old model's.

Reliability is lowered, never hidden, for: availability not verified or uncertain (Low: conditional on playing), a player's
first games with a new team (Low), likely-but-unconfirmed starters, backup roles and rookies (Moderate), and the engine's own
REVIEW findings (Moderate). No unvalidated correction is applied to any number.

## 2. The promotion policy

A family is promoted only when all of these hold (`src/lib/projectionPolicy.ts`, enforced by `tests/projectionApprovals.test.ts`
against the frozen holdout evidence in `research/projection_foundation/promotion/evidence.json`):

* its own holdout verdict is **READY** (beats baseline, calibrated, no subgroup failure);
* against the incumbent on identical holdout rows, the game-clustered 95% interval is **entirely below 0**;
* the gain is **material**: at least 1% of the incumbent's holdout score (statistically significant but marginal gains, such
  as NHL's 0.3–1.0%, are not promoted);
* where no incumbent comparison exists, it beats the baseline with the interval below 0 **and** SIFT shows no competing
  production number for that stat;
* the live inputs it needs are available and reliable, and the gate can detect invalid or missing ones.

The test also runs the other way: a family the policy rejects cannot be promoted, and a family the policy accepts cannot be
left unpromoted without a stated reason (`APPROVED_PENDING_LIVE_INPUTS`).

## 3. The matrix

Historical improvement is the share of the incumbent's holdout score the Projection Foundation model removes (negative = worse),
with the 95% interval of the score difference (challenger − incumbent, negative = better). It is forecast accuracy, never betting value.

| Sport | Statistic | Selected engine | Historical improvement (holdout) | Live-data status | Promotion status |
|---|---|---|---|---|---|
| NFL | completions | Projection Foundation | +2.6% vs incumbent [-0.137, -0.0431] | Ready | **Promoted** |
| NFL | receptions | Projection Foundation | +6.1% vs incumbent [-0.0818, -0.0576] | Ready | **Promoted** |
| NFL | targets | Projection Foundation | +8.2% vs incumbent [-0.141, -0.107] | Ready | **Promoted** |
| NFL | team pass attempts | Projection Foundation | beats baseline [-0.104, -0.0177] (no incumbent) | Ready | **Promoted** |
| NFL | team rush attempts | Projection Foundation | beats baseline [-0.146, -0.06] (no incumbent) | Ready | **Promoted** |
| NFL | anytime td | Established model | +0.7% vs incumbent [-0.00208, -5e-05] | n/a (not promoted) | Held |
| NFL | carries | Established model | +7.8% vs incumbent [-0.285, -0.181] | n/a (not promoted) | Held |
| NFL | passing attempts | Established model | +2.7% vs incumbent [-0.203, -0.0684] | n/a (not promoted) | Held |
| NFL | passing tds | Established model | -2.0% vs incumbent [0.00446, 0.0209] | n/a (incumbent kept) | Retained |
| NFL | passing yards | Established model | +1.3% vs incumbent [-1.19, 0.0871] | n/a (not promoted) | Held |
| NFL | receiving yards | Established model | +2.2% vs incumbent [-0.406, -0.252] | n/a (not promoted) | Held |
| NFL | rushing yards | Established model | +1.4% vs incumbent [-0.452, -0.0306] | n/a (not promoted) | Held |
| NFL | team points | Established model | beats baseline [-0.453, -0.259] (no incumbent) | n/a (not promoted) | Held |
| CFB | plays | Projection Foundation | beats baseline [-0.256, -0.154] (no incumbent) | Ready | **Promoted** |
| CFB | points per play | Projection Foundation | beats baseline [-0.012, -0.0088] (no incumbent) | Ready | **Promoted** |
| CFB | success rate | Projection Foundation | beats baseline [-0.0047, -0.0035] (no incumbent) | Ready | **Promoted** |
| CFB | team passing yards | Projection Foundation | beats baseline [-1.62, -0.893] (no incumbent) | Ready | **Promoted** |
| CFB | team points | Projection Foundation | +8.9% vs incumbent [-0.729, -0.523] | Ready | **Promoted** |
| CFB | team rushing yards | Projection Foundation | beats baseline [-3.58, -2.54] (no incumbent) | Ready | **Promoted** |
| CFB | carries | Established model | beats baseline [-0.288, -0.246] (no incumbent) | n/a (not promoted) | Held |
| CFB | epa per play | Established model | beats baseline [-0.0091, -0.0064] (no incumbent) | n/a (not promoted) | Held |
| CFB | game total | Established model | +5.0% vs incumbent [-0.641, -0.321] | n/a (incumbent kept) | Retained |
| CFB | margin | Established model | +11.4% vs incumbent [-1.35, -0.928] | n/a (incumbent kept) | Retained |
| CFB | passing attempts | Established model | beats baseline [-0.336, -0.222] (no incumbent) | n/a (not promoted) | Held |
| CFB | passing yards | Established model | beats baseline [-2.29, -1.4] (no incumbent) | n/a (not promoted) | Held |
| CFB | player week1 | Established model | no holdout | n/a (not promoted) | Held |
| CFB | receiving yards | Established model | beats baseline [-0.393, -0.311] (no incumbent) | n/a (not promoted) | Held |
| CFB | receptions | Established model | beats baseline [-0.0339, -0.0272] (no incumbent) | n/a (not promoted) | Held |
| CFB | rushing yards | Established model | beats baseline [-1.1, -0.89] (no incumbent) | n/a (not promoted) | Held |
| CFB | targets | Established model | no holdout | n/a (not promoted) | Held |
| NBA | assists | Established model (until live inputs verified) | +9.0% vs incumbent [-0.0938, -0.0849] | Pending | Approved, activation pending |
| NBA | fga | Established model (until live inputs verified) | +16.5% vs incumbent [-0.392, -0.366] | Pending | Approved, activation pending |
| NBA | minutes | Established model (until live inputs verified) | +25.2% vs incumbent [-1.18, -1.11] | Pending | Approved, activation pending |
| NBA | points | Established model (until live inputs verified) | +10.8% vs incumbent [-0.401, -0.366] | Pending | Approved, activation pending |
| NBA | pra | Established model (until live inputs verified) | +14.4% vs incumbent [-0.728, -0.672] | Pending | Approved, activation pending |
| NBA | rebounds | Established model (until live inputs verified) | +10.9% vs incumbent [-0.166, -0.152] | Pending | Approved, activation pending |
| NBA | threes | Established model (until live inputs verified) | +5.8% vs incumbent [-0.0381, -0.0337] | Pending | Approved, activation pending |
| NBA | team points | Established model | beats baseline [-0.42, -0.251] (no incumbent) | n/a (not promoted) | Held |
| MLB | batters faced | Projection Foundation | +11.6% vs incumbent [-0.268, -0.229] | Ready | **Promoted** |
| MLB | outs | Projection Foundation | +3.8% vs incumbent [-0.0914, -0.0631] | Ready | **Promoted** |
| MLB | pitcher strikeouts | Projection Foundation | +2.6% vs incumbent [-0.039, -0.0255] | Ready | **Promoted** |
| MLB | game total | Established model | no holdout | n/a (not promoted) | Held |
| MLB | hits | Established model | +2.4% vs incumbent [-0.014, -0.0081] | n/a (not promoted) | Held |
| MLB | hits runs rbis | Established model | beats baseline [-0.00752, -0.00427] (no incumbent) | n/a (not promoted) | Held |
| MLB | home runs | Established model | +2.4% vs incumbent [-0.00343, -0.0019] | n/a (not promoted) | Held |
| MLB | pitcher hits allowed | Established model | beats baseline [-0.0863, -0.0634] (no incumbent) | n/a (not promoted) | Held |
| MLB | pitcher runs allowed | Established model | beats baseline [-0.0386, -0.0256] (no incumbent) | n/a (not promoted) | Held |
| MLB | pitcher walks | Established model | beats baseline [-0.0153, -0.00744] (no incumbent) | n/a (not promoted) | Held |
| MLB | plate appearances | Established model | +19.5% vs incumbent [-0.104, -0.0756] | n/a (not promoted) | Held |
| MLB | rbis | Established model | +3.9% vs incumbent [-0.0166, -0.0111] | n/a (not promoted) | Held |
| MLB | runs | Established model | +2.8% vs incumbent [-0.0116, -0.00648] | n/a (not promoted) | Held |
| MLB | team runs | Established model | +1.0% vs incumbent [-0.0497, 0.014] | n/a (not promoted) | Held |
| MLB | total bases | Established model | +1.6% vs incumbent [-0.0175, -0.0109] | n/a (not promoted) | Held |
| NHL | assists | Established model | +0.9% vs incumbent [-0.00247, -0.00156] | n/a (incumbent kept) | Retained |
| NHL | goals | Established model | +0.1% vs incumbent [-0.000387, -2.7e-05] | n/a (incumbent kept) | Retained |
| NHL | points | Established model | +0.7% vs incumbent [-0.00269, -0.00152] | n/a (incumbent kept) | Retained |
| NHL | saves | Established model | -0.7% vs incumbent [0.0118, 0.0432] | n/a (incumbent kept) | Retained |
| NHL | shots | Established model | +0.3% vs incumbent [-0.00257, -0.00119] | n/a (incumbent kept) | Retained |
| NHL | team goals | Established model | +0.1% vs incumbent [-0.00379, 0.000935] | n/a (incumbent kept) | Retained |

### Why each non-promoted family stays on the established model

* **NFL passing yards** — READY and 1.3% better, but the interval versus the incumbent includes 0 ([−1.194, +0.087]): not a credible win yet.
* **NFL passing TDs** — the challenger is significantly *worse* than the incumbent.
* **NFL receiving yards, carries, rushing yards, anytime TD** — each fails a subgroup test: the first game with a new team runs high (e.g. rushing yards +12.3 on a 24.5 mean). A tenure correction is verified on development data but is not holdout-tested, so it is not applied.
* **NFL passing attempts** — the validation gain over baseline was not significant.
* **NFL team points** — no incumbent comparison exists, and the projection is essentially the closing implied team total; promoting it would make SIFT's projection a copy of the market and blur projection quality with market value.
* **CFB spreads, totals and player stats** — spread/total behavior is retained (the model stays behind the closing line); player stats lack a pregame availability feed (ESPN returns stale records, player coverage 9.2%).
* **MLB hitters** — held until point-in-time lineup integrity is established over a live record; hitters are archived only from a posted lineup card, and there is no injury/IL source.
* **NHL shots, assists, points, goals** — significant but marginal (0.15–0.95%); **goalie saves** — the challenger is worse than the incumbent saves model.
* **NBA (all seven candidates)** — the strongest historical result in the study (minutes +25.2%, PRA +14.4%, FGA +16.5%, points +10.8%), approved on history and **not yet live**: see §4.

## 4. Live-data status

| Sport | Source | Status on 2026-10-18 |
|---|---|---|
| NFL | ESPN, Sleeper and nflverse injuries (REPORTED), depth chart (PROJECTED), roster inactive list (CONFIRMED) | **Ready.** The first run on `main` (manual dispatch, run 39097687041, which created `projection-data`) published 863 players; for receptions: 132 PASS, 8 BLOCK (confirmed out), 25 REVIEW. Official inactives arrive about 90 minutes before kickoff. The feed flags a player's first four games with a new team; SIFT lowers those to Low reliability. |
| CFB | team-level families need no player availability | **Ready for team families.** The first publish had no games in its window (it is Sunday), so no CFB projection exists yet; the next scheduled run with a slate in its window is the first. Until then a CFB team projection is withheld with "not published yet", never replaced. CFB player availability is not usable. |
| MLB | statsapi probables (PROJECTED), posted lineup cards (CONFIRMED); a replaced probable becomes NOT_STARTING | **Ready for pitchers.** The probable with a posted card was the actual starter 1011/1014 times. SIFT additionally requires a confirmed or probable starter, so an unverified pitcher is withheld. The regular season is over; postseason slates exercise it. Hitters: not ready (no IL source). |
| NBA | official NBA injury report (REPORTED/CONFIRMED_OUT), ESPN injuries and starters (PROJECTED) | **Not yet proven live.** The first publish ran and created `projection-data`, but no projections were written: no NBA game is inside the run window, and the official-report path has not run on a slate (first reports are expected 2026-10-19/20). Activation is held for this reason alone. |
| NHL | DailyFaceoff goalies/lines, ESPN injuries, official roster | Ready, but no NHL family is promoted. First publish (run 39097694994): 288 players, gate 258 PASS / 30 REVIEW. |

The existing approximately 2.4-minute NBA minutes under-projection of the established model is acknowledged: the Projection
Foundation minutes model removes that bias on the holdout (bias +0.09), but no correction was applied to the established model.

**Prospective validation is not complete.** Real forecasts are archived pregame in each sport's `projection-data` branch and
scored after games finish. No forecast has been settled yet; the first settlements arrive the day after the first scheduled
slates. The Research Lab accuracy card says so until games settle, and keeps historical and live results separate.

## 5. Operations

**Activate a pending family (NBA).** When `research/projection_foundation/monitor.py` (scheduled every six hours) reports the
family's availability as verified from an official report on a real slate, change its row in
`src/lib/projectionApprovals.ts` from `APPROVED_PENDING_LIVE_INPUTS` to `PROMOTED`, add
`requiresVerifiedParticipation: true` if the family is a starter-dependent stat, and note the date here. Nothing activates
automatically.

**Roll back one family without reverting the deployment.** Build with `VITE_SIFT_PROJECTION_ENGINES="NFL:receptions=legacy"`
(several entries separated by `;`, `SPORT:*=legacy` for a whole sport). Only a move *back* to the established model is
honoured; a promotion is never created by configuration. For a permanent rollback, change the row's decision to `RETAINED`
or `HELD` in the same file. The established model's code and archives are untouched either way, and historical forecast
archives are never deleted or overwritten (the archive guard allows additions only).

**Audit.** Every decision is a reviewed change to `projectionApprovals.ts` (git history), each row carries its reason and date,
and `tests/projectionApprovals.test.ts` fails if a row disagrees with the frozen evidence.

**Monitoring.** Each sport's workflow archives its forecasts and scores them against results; the SIFT feed monitor
(`.github/workflows/projection-foundation-monitor.yml`) fails if a promoted family stops being READY in its feed, a feed is
stale or incoherent, and reports live-input readiness for approved-pending families.

## 6. What is not part of this change

* The CFB defensive ratings (`ratings/cfb/defense_latest.json`) stay a shadow publication. They are not a projection family:
  they would replace the script engine's published defensive ranks, which feed spread and total behavior (excluded here), and
  the downstream gain is a system effect (significant in weeks 2–4, parity from week 9). Switching them is an owner decision.
* No betting recommendation, threshold, staking rule or execution safeguard changed.
* Merging a SIFT pull request deploys SIFT (`deploy.yml` runs on every push to `main`), so the SIFT release is prepared on a
  branch and waits for explicit deployment approval.

## 7. Ledger

| Date | Change | Evidence | By |
|---|---|---|---|
| 2026-10-18 | Foundation infrastructure merged and its workflows run on `main`: nfl-edge-finder#167, cfb-edge-finder#166, nba-edge-finder#32, NHL-edge-finder#44, edge-finder-api#296 (after #297 pinned the MLB opponent-quality test fixture) | CI green on every head; first `projection-data` publishes: NFL, CFB, NBA (archive only), NHL | owner-authorized |
| 2026-10-18 | First promotion: NFL targets, receptions, completions, team pass/rush attempts; CFB team points, plays, team passing/rushing yards, points per play, success rate; MLB pitcher strikeouts, batters faced, outs | §3 matrix, `tests/projectionApprovals.test.ts` | owner-authorized |
| 2026-10-18 | NBA (7 stats) approved on history, activation held for live availability; NFL passing yards, team points held; NHL retained | §3–§4 | owner-authorized |

## 8. Release readiness (SIFT)

The SIFT release is the branch `claude/dreamy-gates-0en25g`. It includes everything in sift-sports-intelligence#104 (the feed
decoder, accuracy card plumbing, feed monitor) and replaces its shadow presentation, so #104 should be closed rather than
merged separately. Merging to `main` **deploys** (see `deploy.yml`), so the merge is the deployment and needs explicit approval.

Before deployment:

1. CI green on the release head: lint, typecheck, unit tests, build, and the Chromium + WebKit acceptance suite.
2. Visual baselines: the CFB game screenshots change on purpose (the engine's baseline points line is gone); review the
   diffs, then regenerate with a commit message containing `[update-visual-baselines]`. No other baseline should change.
3. The three promoted sports' feeds are published and pass `monitor.py` (NFL, CFB, MLB). A promoted stat whose feed is missing is
   withheld, so a deployment without a feed would show reasons instead of numbers.
4. `VITE_SIFT_PROJECTION_ENGINES` is empty (no family rolled back).

After deployment: confirm one number per stat on Home, Games, the Game Command Center, Player Snapshot, Prop Explorer and the
Research Lab, and that the feed monitor workflow is active.
