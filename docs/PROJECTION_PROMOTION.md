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
| published for this game | the feed has no rows at all for the game (outside its publication window, e.g. next week's games) | withheld ("not published yet") |
| publication standard | the family does not meet the absolute standard (`PROJECTION_ABSOLUTE_ACCURACY.md`): currently CFB success rate | withheld |
| freshness | inputs older than the sport's limit (NFL/CFB 192 h, NBA/NHL 48 h, MLB 36 h) or of unknown age | withheld |

A withheld projection shows the reason and **no number from either engine**, with one explicit exception (§1a).

### 1a. The approved established-model fallback

The owner approved a narrow fallback (2026-10-18). When a promoted projection is **missing, stale or not yet published for the
game**, SIFT may show the established model's number for that player and stat instead, still as **exactly one number**, labelled
"Established projection" with the reason. It exists only where the stat's row in `projectionApprovals.ts` carries a `fallback`
approval (today NFL receptions and completions, MLB pitcher strikeouts and outs: the stats that have an established number SIFT
already shows; never CFB team points, whose script-engine baseline is "not a projection").

The established number must **independently pass its own checks** (`src/lib/projectionFallback.ts`):

| Check | Fails when |
|---|---|
| freshness | the established publication's own timestamp is older than the sport's limit, undated, or in the future |
| availability | the publication lists the player with any designation beyond active / probable / available (injury, doubtful, questionable, suspended); for MLB pitchers, the publisher does not project him as a starter |
| quality | the mean is missing, negative or not a number; its range is inverted or does not contain the mean; or (NFL) the market line sits outside the simulated 5th–95th range, i.e. the market and the simulation are pricing different roles |

It is **never** used when the player is confirmed or likely out, the quality gate blocked the projection, the distribution is
incoherent, the family is no longer READY or no longer meets the publication standard, the player is outside the model's population
for a game it covers (the established model may be projecting a different player, e.g. a replaced probable pitcher), the starter is not
the confirmed or probable one, or the feed shows a documented structural defect (a first game with a new team, found on a stale row).
Where a family has a documented defect that only the feed can rule out (NFL receptions: first games with a new team), the fallback also
needs the feed's own segment flag from a stale row that shows the player is not in that segment; with no feed row at all, receptions are
withheld. That requirement is one flag (`requiresKnownSegments`) the owner can relax.

A fallback row shows Moderate reliability and says why. If any check fails, nothing is shown, and the withheld reason says the established
projection could not be used and why. A fresh, healthy feed row always wins: the established model is not even consulted.

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
* **CFB success rate** stays on the matrix as promoted but its number is **withheld**: on the 2026 games so far the 80% range caught 73.2% (see `PROJECTION_ABSOLUTE_ACCURACY.md`). It is the one family that failed the absolute publication standard.
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

**Roll back one family without reverting the deployment.** (A rolled-back family is on the established model outright; its fallback approval is moot.) Build with `VITE_SIFT_PROJECTION_ENGINES="NFL:receptions=legacy"`
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

## 7. Production data path verification (2026-10-18)

`scripts/verify-projection-feeds.ts` reads the same URLs SIFT's browser reads, through SIFT's own fetcher, decoder, authority and row
builders, against the live research publications (`NODE_USE_ENV_PROXY=1 npx vite-node scripts/verify-projection-feeds.ts --cfb-sample <feed.json>`).
Run at 19:07 UTC:

| | NFL | CFB | MLB |
|---|---|---|---|
| HTTP / CORS / cache | 200 · `access-control-allow-origin: *` · `max-age=300` | same | same |
| Decodes through `decodeProjections` | yes · 349 players, 30 team rows | yes · 0 rows (no games in its window) | yes · 138 players, 3 team rows |
| Feed age | 0.3 h | 12 h (generated 15:55Z, empty slate) | 3.9 h |
| Current games | 5 pregame games in the feed; per game 9–12 receptions rows **authoritative**, 0–6 withheld "outside the model's population" (low-usage players), 2 completions rows authoritative; the other 76–77 stat rows stay on the established model | n/a today (Sunday) | TB @ CLE: the feed's confirmed starters are Rasmussen (TB) and Messick (CLE); SIFT's markets are for Nick Martinez (TB), who is outside the model's population, so his two pitcher stats are **withheld** and the established projection is **not** substituted (correct: it is for a pitcher who is not starting) |
| Games outside the window | the board lists no NFL game beyond this week yet; covered by tests (not published → fallback only if the established number passes its checks) | 110 upcoming games (Oct 20–Nov 1): all **withheld, "projections for this game have not been published yet"**; the horizon is the rest of the week, so Tuesday 10:41Z publishes Oct 20–25 | no further games on the board |

Findings and fixes from this check:

* **CFB team join was wrong and is fixed.** The CFB feed names teams by display name and ESPN id (`"Mississippi State"`, `team_id "344"`), not SIFT's contract codes (`MSST`), so every CFB game would have stayed "not published". SIFT now joins on the ESPN id (from its own identity map, `cfbTeam(code).e`). On a real feed document from the past Saturday, **35 of the 35** feed games that SIFT lists matched by id (17 feed games are not on SIFT's board at all, so they have no page); 107 of 110 upcoming board games have both team ids (the three codes without an identity entry are FCS schools the FBS feed does not cover).
* The unit and e2e fixtures used code-like names that hid this; they now use the feed's real shape.
* A game with **no rows at all** in a feed is now "not published yet" (`NOT_PUBLISHED`), distinct from a player missing from a game the feed covers ("outside the model's population").
* Not verified live: a CFB team projection in an in-window game (the first slate with games in the window is Tuesday), and the NFL/MLB fallback on a real outage. The same code paths are covered by the unit tests with the feeds' real field shapes.

## 8. Ledger

| Date | Change | Evidence | By |
|---|---|---|---|
| 2026-10-18 | Foundation infrastructure merged and its workflows run on `main`: nfl-edge-finder#167, cfb-edge-finder#166, nba-edge-finder#32, NHL-edge-finder#44, edge-finder-api#296 (after #297 pinned the MLB opponent-quality test fixture) | CI green on every head; first `projection-data` publishes: NFL, CFB, NBA (archive only), NHL | owner-authorized |
| 2026-10-18 | First promotion: NFL targets, receptions, completions, team pass/rush attempts; CFB team points, plays, team passing/rushing yards, points per play, success rate; MLB pitcher strikeouts, batters faced, outs | §3 matrix, `tests/projectionApprovals.test.ts` | owner-authorized |
| 2026-10-18 | NBA (7 stats) approved on history, activation held for live availability; NFL passing yards, team points held; NHL retained | §3–§4 | owner-authorized |
| 2026-10-18 | Approved legacy fallback (§1a) for NFL receptions and completions and MLB strikeouts and outs: the established number is shown, alone, only when it independently passes freshness, availability and quality, and never for a player ruled out or a structural defect | `tests/projectionAuthority.test.ts`, `tests/projectionSurfaces.test.tsx`, `tests/mlb.test.tsx` | owner-approved |
| 2026-10-18 | Absolute publication standard for the no-incumbent families (`docs/PROJECTION_ABSOLUTE_ACCURACY.md`): CFB success rate does not meet it and is withheld; CFB passing and rushing yards and NFL pass attempts publish with caveats | `absolute_evidence.json`; TypeScript and Python verdicts must agree | owner-approved |
| 2026-10-18 | CFB join fixed: the feed names teams and ESPN ids, not SIFT codes, so no CFB game would have matched; the join now uses ESPN ids | `tests/projectionAuthority.test.ts`, `e2e/cfb.spec.ts` | found in verification |
| 2026-10-18 | Production data path verified for NFL, CFB, MLB (§7) | `scripts/verify-projection-feeds.ts` | verification |
| 2026-10-18 | NHL season derived from the calendar (NHL-edge-finder#45), so 2027-28 needs no code change; smoke `--date auto` no longer picks a slate the archive still shows as live | `test_nhl_season.py`, pr-replay on the PR | owner-requested |

## 9. Release readiness (SIFT)

The SIFT release is the branch `claude/dreamy-gates-0en25g`. It includes everything in sift-sports-intelligence#104 (the feed
decoder, accuracy card plumbing, feed monitor) and replaces its shadow presentation, so #104 should be closed rather than
merged separately. Merging to `main` **deploys** (see `deploy.yml`), so the merge is the deployment and needs explicit approval.

### Checklist

| # | Item | Status |
|---|---|---|
| 1 | Lint, typecheck, unit tests (1255), Python monitor tests (36) | done, see the release commit's CI |
| 2 | Chromium + WebKit/iPhone acceptance suite on the release head | see the release commit's CI |
| 3 | Visual baselines: only intended screens changed (CFB game, NFL completions fallback); reviewed, noise restored | see the release commit |
| 4 | Fallback (§1a) tested for fresh, stale, ruled-out, defective and unreliable cases; exactly one number everywhere | done |
| 5 | Absolute publication standard documented and enforced (`PROJECTION_ABSOLUTE_ACCURACY.md`) | done |
| 6 | NFL and MLB feeds verified through the production path; CFB in-window behaviour verified by feed-shape replay (§7) | done; CFB in-window verified live after its Tuesday run |
| 7 | NHL season rollover fix merged (NHL-edge-finder#45) | see that PR |
| 8 | `VITE_SIFT_PROJECTION_ENGINES` empty (no family rolled back) | confirm at release |
| 9 | Betting safeguards unchanged (Kalshi routing, validated-signal requirement, thresholds, staking, MODEL_ERROR / VALIDATED_SIGNAL / UNRESOLVED) | unchanged; no diff touches them |
| 10 | Owner approval to merge and deploy | **pending, not requested** |

### Known blockers and limits

- **NBA stays held** until the official injury report has been seen live with a real slate (no NBA games in the publication window yet).
- **CFB success rate is withheld**: it does not meet the absolute publication standard.
- **CFB in-window projections** cannot be seen until the feed's first in-season run (Tuesday); until then every CFB game shows a withheld reason, never a number.
- **Receptions fallback** is limited to players with known segments (§1a).
- **No prospective forecasts have settled yet**, so there is no live scorecard; the evidence is historical.
- **iPhone Safari** is verified by CI (WebKit) only, not on a device.
- **CFB defensive-rating replacement** is a separate piece of work and is not part of this release.

After deployment: confirm one number per stat on Home, Games, the Game Command Center, Player Snapshot, Prop Explorer and the
Research Lab, and that the feed monitor workflow is active.

## 10. Published distributions, and one number on every surface (2026-10-19)

**Distributions (NFL).** Each player row of the NFL feed is the summary of one integer pmf (archived write-once). The feed itself carries no quantiles
and only the study's three rungs, so the Explorer had nothing to draw. The NFL publisher now writes a **separate, versioned artifact** beside the feed
(`projections/nfl/distributions/latest.json`, `sift.projection_distributions.v1`; nfl-edge-finder PR #178, `research/projection_foundation/
CONTRACT_DISTRIBUTIONS.md`): p05 p10 p25 p50 p75 p90 p95 (*smallest integer x with P(X ≤ x) ≥ level*) and, for count families, P(X ≥ k) for every integer line,
all read from the same pmf as the mean, median and p10/p90, and only for rows whose pmf reproduces the published row. It is a new artifact rather than a
change to the feed because the feed's writer is recorded research under the repository's append-only guard (the guard was respected, not weakened).
SIFT (`src/lib/projections.ts`, `src/data/projections.ts`):

* fetches the artifact beside the feed (NFL only; optional and additive: a missing, unreadable or mismatched artifact leaves the feed as published) and
  joins it **only when it describes exactly the feed that was read** (`projection.generated_utc` equal) and **only to rows it reproduces** (mean, median,
  p10/p90 equal; every feed rung reproduced by the ladder to its 4-decimal rounding). Rows that fail keep no distribution;
* decodes it strictly (integers, ordered, non-negative, finite; a self-contradicting row is dropped alone), and cross-checks quantiles against the row's own
  median, range and line probabilities (`k ≤ q_a ⇒ P(X ≥ k) > 1 − a`, `k > q_a ⇒ P(X ≥ k) ≤ 1 − a`). A feed that embeds its own quantiles and declares the
  pmf basis is held to the same rules, and a self-contradicting row is **withheld whole** (`INCOHERENT`): which of its numbers is wrong cannot be known;
* draws exactly the published quantiles (seven blocks between them; nothing smoothed or extended past the outer quantiles) and never reconstructs a
  distribution from p10/p90/mean: without one the Explorer says *No published distribution* and still shows the prediction range; a withheld projection shows
  its reason instead of a chart;
* reads the expected value, median, middle 50%, prediction range (80%), 90% range, the drawing and the probability of the over from the one selected
  projection (`PropRow.distribution`, `PropRow.predictionRange`, `rungOf`). The probability of a line off the published ladder is none, never the other
  engine's.

Live check (2026-10-19, WAS @ SF, real event, player ids and live Kalshi ladders, production-like build, Chromium desktop and 390 px): George Kittle
receptions 5.1 expected (median 5, middle 50% 3–7, 80% 2–8, 90% 1–10), over 5.5 at 40% (market 46%); Christian McCaffrey 4.9 (3–6, 2–8, 1–9), over 4.5
at 53%; Brock Purdy completions 21.9 (18–26, 14–30, 11–33). The live repository does not publish the artifact until nfl-edge-finder#178 is merged and has run,
so for that check the live feed was served unmodified and the artifact was the one the publisher code builds from the real 2026-10-19 archive
(72 of 72 rows reproduce); every other value was live.

**Surfaces.** The pages that read the established simulation directly now ask the projection authority (`src/lib/simStat.ts`): the Player page (props
table, this-game card, ranges, line probabilities), the Market page (probability of the line, projection), Compare, the depth chart and the game roster list.
For a promoted stat they show the selected projection or a withheld reason; otherwise they are unchanged. The Market page no longer shows a "Shadow v2"
probability.

**Wording.** *Shadow model P(over)* → *Probability of over*; *SIFT projection* → *Projected receptions*; *simulation mean* → *expected value*;
*Established model kept* → *Current projection kept*. The approved fallback label *Established projection* is unchanged. Internal model ids, shadow
tracking, audit logs and benchmarking are untouched. Documented exceptions (`tests/uiTerminology.test.ts`): the NHL research-candidate ledger ("shadow"
results of never-placed candidates, publisher-supplied status words), the CBB model roster comparison, and tennis "Challenger" tournaments: none shows a
projection for a stat that has an approved engine.

**Open items.** (1) The "COPY FOR CHATGPT" packet prints each market's pricing-model `fair` and `proj` (pinned to the router's packet.py by golden tests);
for a promoted stat that is a second number outside the app's screens. (2) The game page's win-probability ring still shows the repository's model score and the
simulation's share beside the market (three published numbers with three authorities, labelled); win probability is not a promoted stat.

| Date | Change | Evidence |
|---|---|---|
| 2026-10-19 | NFL distributions consumed from the feed; Explorer, Player, Market, Compare and depth chart read one projection; development vocabulary removed from screens | `tests/nflDistribution.test.ts`, `tests/projectionPages.test.tsx`, `tests/uiTerminology.test.ts`, `e2e/projection-surfaces.spec.ts`, `e2e-default/projection-surfaces.spec.ts` |

## 11. NBA activation: verification and the exact remaining requirement (2026-10-19)

The seven NBA families (minutes, points, rebounds, assists, threes, PRA, FGA) stay on the established engine. Nothing in this section changes
`PROJECTION_APPROVALS`; activation is the single approval-record change below, made only after both verifiers read READY on a live slate and the owner approves.

**What was built (independent of the live report).** nba-edge-finder#36 adds an activation-readiness report to every scoring run
(`nba/live/activation_check.py`: availability provenance and timestamps, strict-before-cutoff observations, identity, status mapping for
OUT / QUESTIONABLE / PROBABLE / AVAILABLE / unknown, ruled-out rows withheld, uncertainty lowering reliability, the engine receiving availability
before it forecasts, quality gates). Verdicts are READY / PENDING / BLOCKED; PENDING means the live evidence does not exist yet and is never
reported as a pass. SIFT's side is `scripts/verify-nba-activation.ts` (`src/lib/nbaActivation.ts`): it reads the live feed through SIFT's own decoder
and authority in a preview mode that exists only for this check (the application never sets it) and asks what a reader would see if the families were promoted.

**Live results (2026-10-19; first slate 2026-10-20).**

* 20:15 UTC (feed from 20:09): the official report had no player-level rows (all six teams "NOT YET SUBMITTED"), so S5 and S7 were pending.
* 23:20 UTC: the official report carried its **first 16 player designations** (11 OUT, 5 QUESTIONABLE; 87 covered players unlisted = implicitly available).
  The feed in use predated the clock fix of nba-edge-finder#36 and `activation_check` correctly reported **BLOCKED**: 26 archived observations were ignored by the
  projection and 21 ruled-out rows were not gate-BLOCKed (D3, D7).
* 23:44 UTC, first run after #36 merged (main `b415341`, model `pf-1.2.1+b415341`, 721 rows): A1–A6, B1–B2, C1–C2, D1–D4, D6, D7, E1–E2 **PASS**
  (every archived observation reaches its row; 77 ruled-out rows are BLOCK; 63 uncertain rows REVIEW; 99 players resolved from the official report use the
  report-aware minutes model; forecasts archived before the start). SIFT's `verify-nba-activation.ts` on that feed: **S1–S9 all PASS, READY**.
  **`activation_check` is still BLOCKED on one check, D5**: of 581 eligible (confirmed or likely active) rows 100% are not blocked but only 9% pass the
  quality gate (the threshold proposed in the check is 50%).

**Why D5 fails, exactly.** 504 of the 526 eligible REVIEW rows carry one finding, `team_consistency` (the engine normalises minutes and points to the team's total;
"roles carried over from previous teams overlapped; early-season roster uncertainty"), and 105 also carry a `confidence` or `role` finding. It is the engine's
own model-assumption review, it is not an availability problem, and SIFT already presents REVIEW rows at Low reliability with the reason (S6, S7 pass). The 50%
threshold in D5 is a proposal in the code ("for the owner to adjust"), and it has **not** been changed to fit this result.

**Exact remaining requirement.** An owner decision on D5, and one more pass of both verifiers on the run before the first game:
(a) accept REVIEW-at-Low-reliability for rows whose only finding is `team_consistency` (change D5 to count "not blocked and not an availability finding"),
or (b) wait until the early-season roster uncertainty clears (the gate's own rule) and require D5 as written. Either way the report must read READY and
`verify-nba-activation.ts` must exit 0 on a pre-game run with the official report's player-level rows. Neither verifier has been relaxed, and no test was
written to pass without live data.

**Activation (needs explicit approval, one change).** Change the seven NBA rows from `APPROVED_PENDING_LIVE_INPUTS` to `PROMOTED` in `src/lib/projectionApprovals.ts`, update the
matrix in §3, and re-run `npx vitest run`, the Playwright suites and `scripts/verify-nba-activation.ts` on that head. No correction is applied to the
established model's historical minutes under-projection: the Foundation minutes model is the one that removes it, and it is selected only through approval.
