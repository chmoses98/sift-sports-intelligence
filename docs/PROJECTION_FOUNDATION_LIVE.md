# Projection Foundation: live integration and validation

*2026-10-18 · branch `claude/loving-davinci-53ho9c` in all six repos · nothing is merged or deployed · betting authority unchanged*

This report covers the work after the historical study: moving the projections into live shadow operation. That means
pregame availability capture, an immutable forecast archive, settlement against results, live scorecards, and SIFT
display. The historical study is in `PROJECTION_FOUNDATION_REPORT.md`.

**Two kinds of evidence are kept apart throughout:**
* **Historical:** walk-forward backtests on past seasons (development / validation / untouched holdout). These numbers
  are final.
* **Prospective:** forecasts archived *before* a game and scored after it. **No prospective forecast has been settled
  yet.** The live archive branch (`projection-data`) only comes into existence when a workflow runs on `main`, which
  needs the merge. Every prospective number below comes from a dry run or a replay of recorded data, and is labelled as
  such.

---

## 1. Bottom line

| | Status |
|---|---|
| Live chain (capture → project → gate → archive → publish → results → settle → score → guard) | Built for all five sports and **executed on GitHub's runners** as pull-request dry runs (NFL, CFB, NBA, MLB, NHL). Results/settle/score also passed in local replays on real recorded games. |
| Scheduled (cron) operation | **Not verified.** Crons only fire from `main`. The first real scheduled run will happen after merge and creates `projection-data`. |
| Prospective track record | **None yet.** The first settled games arrive the day after the first scheduled run. |
| SIFT display | Shadow projections, availability and the live scorecard are wired into Home (Top Props), Games / Game Command Center, Player Snapshot, Player Prop Explorer and Research Lab. CI is green on Chromium and iPhone WebKit. |
| Authority | All projections are `research_only` with role `shadow`. `PROMOTED_FAMILIES` is empty. No betting, production-forecast or validated-signal classification changed. |

---

## 2. Historically validated families

These are unchanged from the study (holdout, frozen winners; details in `PROJECTION_FOUNDATION_REPORT.md` §3 and §11).

| Sport | READY on holdout | SHADOW VALIDATION | NEEDS IMPROVEMENT |
|---|---|---|---|
| NFL | team pass att, team rush att, team points, targets, receptions, completions, passing yards | receiving yards, carries, rushing yards, anytime TD, passing attempts | passing TDs |
| CFB | team points, plays, team passing yards, team rushing yards, points/play, success rate | margin, game total, player families | — |
| MLB | pitcher strikeouts, batters faced, outs | walks, hits allowed, runs allowed, all hitter stats, team runs, game total | — |
| NHL | — (NHL requires a live record) | TOI, shots, goals, assists, points, team goals | goalie saves (incumbent kept) |
| NBA | minutes, points, rebounds, assists, threes, PRA, FGA | team points | — |

**Reproduction under the live code (pf_core 1.2.x):**
* **NFL:** a cold rebuild on the runner (Python 3.13 and pinned packages, run 39080845443) re-scores the frozen holdout.
  * Non-boosted families match the committed numbers to ≤ 3e-5 relative.
  * The LightGBM-stacked families differ by ≤ 0.2% CRPS. Every "beats baseline" conclusion is unchanged.
  * Pinning removed the package drift; what remains is cross-machine floating point in LightGBM.
  * The check uses a 1% tolerance for stacked families plus a same-conclusion requirement. That tolerance is a judgment
    call, stated as such.
* **CFB:** model choices are identical; MAE, bias and coverage match to ≤ 5e-5.
  * Plays holdout gain re-scored from cached predictions: −0.203. A full recompute under pf_core 1.1.0 gives −0.154. Both
    are significant and both stay READY.
* **MLB:** frozen parameters and winners are identical. All 15 holdout families match except `hits_runs_rbis` CRPS
  (0.9913 vs 0.9911), consistent with the 1.1.0 out-of-support scoring fix.
* **NBA:** minutes, unconditional, team points and reconciliation stages are identical. Points: 18 of 972 values differ in
  the 4th decimal (same scoring fix). The LightGBM stages were not recomputed (the machine ran out of memory).
* **NHL:** the runner's `pr-repro` job rebuilds the whole study.
  * Sample sizes, chosen models and readiness are identical for all 6 families.
  * Saves and team goals holdout match to 6 decimals.
  * The ridge/LightGBM rungs differ by ≤ 1.4e-4 CRPS (e.g. shots 0.684681 vs 0.684741).
  * The prospective split is not comparable because 2026-27 data has grown.

**Leakage:** every sport's point-in-time and no-leakage tests pass, locally and on the runners. No holdout was tuned after
the freeze. NBA's history was squashed, so for NBA this rests on a code audit rather than commit timestamps.

---

## 3. Families ready for live shadow

All families above are published and archived in shadow, with these exceptions and labels:
* **NFL passing TDs:** published, labelled NEEDS IMPROVEMENT.
* **NHL goalie saves:** the incumbent model stays the reference.
* **MLB hitters:** projected and archived **only** from a posted (CONFIRMED) lineup card. Assumed lineups are shown as
  REVIEW / UNVERIFIED and are not archived.
* **CFB game total and margin:** role `shadow`, `edge_claim: false`.

**Live incumbents archived next to each challenger, so paired comparisons use identical games and players:**
* NFL: shadow-0.4.0 means plus ladders, with shadow-0.5.0 ladders attached.
* CFB: the script engine's frozen artifacts.
* MLB: team runs (only when `createdAt` precedes the start), the production pitcher engine and hitter snapshots.
* NBA: the shadow sim-rotation arm.
* NHL: the production player simulation (PLAYER_SIM_V1), archived unchanged: its own mean and ladder, no invented distribution.

Most incumbents publish only a mean, so live paired comparison against them is MAE (and rung Brier), not CRPS.

**Promotion criteria (unchanged, owner approval required for every step):**
* A family can be proposed for promotion when its **settled live record** satisfies all of the following:
  1. at least ~3–4 weeks of settled pregame forecasts (enough for a game-clustered CI);
  2. the paired difference versus the incumbent on identical keys has a 95% CI below 0, or for families without an
     incumbent, versus baseline A;
  3. 80% coverage within 70–90% and no drift ALERT;
  4. no subgroup failure in the monitored segments (NFL new team, backup tier, rookies; CFB QB change).
* SIFT shows "better" only when the CI excludes 0. Small gains are not promoted (NHL rule).
* Promotion is a one-line change to `PROMOTED_FAMILIES` in `src/lib/projections.ts`, made only with approval.

---

## 4. Point-in-time availability: coverage and freshness

Every observation is a `sift.availability.v1` record with source, capture time, event, entity, status and certainty
(CONFIRMED / REPORTED / PROJECTED / UNKNOWN). Snapshots are write-once with a content hash. Forecasts resolve
participation **as of** their cut-off, and captures at or after the cut-off or the start are excluded. A player with no
observation is **UNVERIFIED**, never active, and goes to gate REVIEW. CONFIRMED_OUT is BLOCK, and SIFT withholds the number.

| Sport | Sources (certainty) | Measured coverage / freshness | Gaps |
|---|---|---|---|
| NFL | ESPN injuries, Sleeper, nflverse injuries (REPORTED); depth chart (PROJECTED); roster inactive list (CONFIRMED when posted); QB cross-check | runner: mean coverage **0.997** over 13 events, newest capture 0.2 min old; on the recorded TNF, ESPN flipped exactly the 5 inactive skill players to Out before kickoff with no false positives | official inactives only ~90 min pre-kick |
| CFB | ESPN injuries (REPORTED / UNKNOWN when stale); projected QB from the last game (PROJECTED) | runner: 42/42 team lists read, **0 listings, player coverage 9.2%**, newest capture 0 min old | ESPN returns references that resolve to stale 2022 records; depth chart endpoint 400. **No CFB player can be CONFIRMED.** QB flags send changes to REVIEW |
| NBA | official NBA injury report PDF (REPORTED, official OUT → CONFIRMED_OUT); ESPN injuries and starters (PROJECTED); minutes restrictions parsed | replay of the real 2026-01-15 report: 8/9 games covered, capture < 5 min old | **the official report has not yet run live:** no report was published at the dry run, so all 2,037 rows were REVIEW. ESPN pregame starters unverified. cdn.nba.com blocks runners |
| MLB | statsapi probables (PROJECTED) and posted lineup cards (CONFIRMED); a replaced probable becomes NOT_STARTING | runner: probables 2/2, lineups 2/2, participation CONFIRMED_ACTIVE 132/144; recorded captures 74 min (median) before first pitch; probable with posted lineup = actual starter **1011/1014 (99.7%)** | no injury / IL source; hitters whose card posts after the last pre-start run are not archived |
| NHL | DailyFaceoff goalies ("Confirmed" = CONFIRMED, otherwise PROJECTED) and lines/PP units (PROJECTED); ESPN injuries (REPORTED); official pregame roster (CONFIRMED, guarded: pregame state, 17–19 skaters, ≥ 1 goalie) | live dry run: 32 goalie, 117 injury, 484 line observations; official roster accepted for 13/16 teams (237 CONFIRMED_ACTIVE, 11 scratches); replay coverage 1.0. Historically, DailyFaceoff lineups 3 h before puck drop dressed 98.1% (UNCERTAIN players 71%); goalie start rates 3 h out: Confirmed 124/124, Probable 59/59, Projected 77% | roster endpoint unproven on early-morning runs; the repo's data-archive copy lagged the direct fetch by ~50 min |

**Fixes made in this phase:**
* **MLB probable-pitcher overwrite:** projections now use only the archived pregame observation, never the post-game
  field.
* **MLB incumbent timestamps:** incumbent forecasts are archived through the same late-rejecting path. The 2026-09-12
  replay reproduces the old problem: only 2 of 8 team games had a genuinely pregame incumbent.
* **NBA PHI-style incoherent rosters:** repaired by minutes and volume reconciliation. This repairs broken rosters; it is
  not an accuracy gain on ordinary ones.
* **NBA Kalshi placeholders:** 369 opening-night markets, 59% placeholder. Placeholders are never executable (tested on
  the real rows).

---

## 5. Prospective capture and settlement status

| Sport | Real runner execution (PR dry run, read-only) | Local replay of recorded games (results → settle → correction) |
|---|---|---|
| NFL | run 39080845443: 13 games, 863 players, gate **751 PASS / 60 REVIEW / 52 BLOCK**, **1,629** forecasts archived (941 challenger, 688 incumbent), 0 late, guard OK, reproduce OK | TNF replay (SEA@DEN, state rebuilt with the game hidden, pf_core 1.2.1): **27/27 checks**, 136 settled, re-runs add nothing, a stat correction appends 2 records (challenger + incumbent) and leaves settlements untouched. ESPN moved exactly the 5 official inactives to Out before kickoff; none of them had a projection, so nothing needed blocking (the BLOCK path is pinned by a unit test) |
| CFB | runs 39075255180, 39075772663, 39077155306: 21 games, 1,278 forecasts, 0 late; gate 158 PASS / 998 REVIEW | real week-3 and week-6 data: 3,446 forecasts, 3,384 settled + 62 void; re-run adds nothing; 6 corrections, originals untouched |
| NBA | run 39079478003: real opening-night slate, 291 players, **2,328** forecasts, 0 late; all REVIEW (no official report yet) | 2026-10-16 replay: 2,066 forecasts, 1,340 settled + 726 void; re-run adds nothing; 3 corrections |
| MLB | run 39080349680: 144 forecasts, gate 135 PASS, coverage 1.0; latest head run 39085989790 green | 2026-09-12: 816 forecasts (810 challenger + 6 incumbent), K actuals equal the feed 12/12, re-run archives nothing, 1 correction; 2026-10-15 postseason: 12 settled paired keys |
| NHL | live dry run, 10 games: 1,845 challenger + 1,758 incumbent forecasts, 0 late; gate PASS 534 / REVIEW 46 / BLOCK 8 (BLOCK only from confirmed scratches). Run 39087142038 green on every job, incl. `pr-replay` and `pr-repro` | 2026-10-15 replay on the runner: 2,112 challenger + 3,054 incumbent forecasts, none for started games, 3,704 settlements (163 void), 2 corrections appended with originals untouched, re-runs add no files, guard clean |

What these executions prove:
* the chain runs end to end on the real runner with real live feeds;
* forecasts made at or after the start are rejected;
* settlement happens once and re-runs add nothing;
* a changed stat produces an appended correction and never overwrites;
* the archive guard rejects any edit or deletion of immutable files.

**What is not yet proven:**
* a scheduled run on `main`;
* the first commit to `projection-data`, including the push-race retry on the real branch;
* any settled live game.

**Immutability:** `pf_core.archive_guard` allows only additions under `forecasts/`, `outcomes/`, `settlements/`,
`corrections/` and `availability/`. pf_core 1.2.1 also checks committed changes since the run's starting commit, so an edit
made earlier in the same run cannot hide.

---

## 6. CFB defensive ratings

The new rating is carried across weeks, pools FCS opponents, shrinks toward conference, and has uncertainty and rank
bands. It reproduces the frozen ridge to 3e-13 points.
* **Testing:** 11 independent known-truth tests. One of them checks that a defense that faced only weak offenses is not
  ranked elite.
* **Rank suppression:** ranks are suppressed while the FBS schedule graph is disconnected. Replayed week 3 had 39
  components; today there is 1.
* **Conference offsets:** adopted on development data, the best of 9 variants (CI [−0.078, −0.005], *not* adjusted for
  choosing among 9). Every later split agreed.

**Downstream next-game points MAE versus the production script engine (new − engine, week 1 excluded):**

| Split | Δ MAE | 95% CI |
|---|---|---|
| validation | −0.40 | [−0.54, −0.28] |
| holdout 2023–24 | −0.33 | [−0.45, −0.22] |
| 2025 | −0.45 | [−0.63, −0.28] |
| holdout, weeks 2–4 | −0.92 | [−1.31, −0.54] |
| holdout, week 9+ | −0.06 | includes 0 (parity) |

* **Where the gain comes from:** swapping only the defense term into the engine helps significantly in weeks 2–4, but not
  overall. The all-weeks gain is a system effect.
* **Calibration:**
  * Week-2 rank correlation with the rest-of-season rating: 0.63 (engine 0.35).
  * Rating intervals cover 82–84%.
  * Rank bands are honest about noise: they contain the rest-of-season rank only 61–65% of the time.
* **Shadow output:** `ratings/cfb/defense_latest.json` publishes the new rating beside the engine's current rank.
  **The production engine is unchanged; switching it needs owner approval.**

---

## 7. SIFT integration and tests

**What each surface shows.** Every projection shows: expected value, realistic range, exact update time, reliability
label, participation status and source, opportunity and matchup context, and an explicit "Independent projection ·
shadow" label.

| Surface | What it shows |
|---|---|
| Home / Top Props | a one-line shadow projection under each prop. Never ranks or labels an edge |
| Games / Game Command Center | shadow team-points lines for both teams ("Not a betting signal") |
| Player Snapshot | a one-line shadow projection |
| Player Prop Explorer | the full projection card |
| Research Lab | "Projection accuracy": research progress, historical test (average miss and 80% range per family), and a separate live record table (settled count, miss, bias, coverage, verdict versus production, drift status). The live table is empty until games settle and says so |

**Safety rules:**
* A BLOCKed or CONFIRMED_OUT projection shows only the reason, never the number.
* Incoherent projections are withheld.
* An unknown participation value decodes to UNVERIFIED.
* The decoder rejects anything that is not `research_only`.
* No private or operational detail is exposed: no file paths, run ids or error traces.

**Tests:**
* Unit: lint and typecheck clean. 1,189 unit tests, including 21 projection tests. One unrelated game-overview test timed
  out once under heavy machine load; it passes alone and in CI.
* Browser: the projection acceptance tests (Home / Explorer consistency with availability, the Game Command Center team
  line, the Research Lab accuracy summary) run on **phone and desktop Chromium and iPhone WebKit** in CI.
* Visuals: CI compares 113 committed baselines (phone / desktop / iPhone). None changed; with no published feed every page
  renders as before.
* CI result: green on the integration commit (35be093) and on the pf_core 1.2.1 commit (5232449), Chromium + WebKit.

---

## 8. Pull requests, checks and blockers

| Repo | PR | Head | Checks |
|---|---|---|---|
| sift-sports-intelligence | [#104](https://github.com/chmoses98/sift-sports-intelligence/pull/104) | 5232449 + this report | lint · typecheck · unit · build · acceptance (Chromium + WebKit): **green** |
| nfl-edge-finder | [#167](https://github.com/chmoses98/nfl-edge-finder/pull/167) | 81cf86c | Tests and Projection Foundation (pr-dry-run with cold rebuild + reproduce): **green** |
| cfb-edge-finder | [#166](https://github.com/chmoses98/cfb-edge-finder/pull/166) | 5bd79afd2 | `test` and projection-foundation `run` dry run: **green** (`publish` skipped on PRs by design) |
| nba-edge-finder | [#32](https://github.com/chmoses98/nba-edge-finder/pull/32) | 10983f6f | ci and projection-foundation dry run: **green** |
| edge-finder-api (MLB) | [#296](https://github.com/chmoses98/edge-finder-api/pull/296) | 523fd738 | PR Checks `test` and projection-foundation dry run: **green** after the owner merged `main` (the earlier `oppquality.json` data failure from `main` no longer occurs) |
| NHL-edge-finder | [#44](https://github.com/chmoses98/NHL-edge-finder/pull/44) | 8bf5a46a | test, gate, pr-dry-run, pr-replay, pr-repro: **green** |

**Engineering fixes made during validation:**
* **CFB:** the pinned-requirements path was resolved twice under the job's working directory. Fixed, plus a contract test
  that resolves every file reference in the workflow.
* **CFB:** a smoke assertion that could never fail (`or True`) now fails on any guard violation.
* **pf_core 1.2.1:**
  * a "not starting" observation keeps its own certainty instead of being reported as CONFIRMED;
  * one dated scorecard per day;
  * unchanged outcomes are not rewritten;
  * committed-change archive guard.
* **NFL:** the state cache is keyed on the pinned requirements, so a cold rebuild and reproduce check are forced when
  versions change.
* **NFL:** re-runs no longer rewrite projection files: timestamped copies are write-once, and the "latest" file only moves
  forward in time. Availability coverage is now counted over projected players only.
* **NHL:** the stat-correction replay read the old data archive, because the archive path was fixed at import; it now
  honours `--data-archive`.
* **NHL, upstream data defect:** the 2026-27 `player_events` ingestion leaves the goalie `starter` flag False for 124 of the
  first 240 team-games. So the study's prospective saves sample (n=116) silently lost about half the games. The live runner
  uses an opt-in repair (the goalie in net for the first shot against), which agrees with the flag on 116/116 flagged
  games. The ingestion itself is not changed.

**Known limitations of the live core (fail-safe, documented, not fixed here):**
* An injury designation is never withdrawn by a later list that simply omits the player. A stale OUT therefore stays in
  force until the freshness window expires. This withholds a projection rather than wrongly showing one.
* A REPORTED OUT resolves to the CONFIRMED_OUT class (BLOCK). The certainty field still says REPORTED.
* Each run's forecast is a new version (its id includes the generation time), and settlement uses the latest pregame
  version. The sport runners skip identical re-forecasts.
* Settlement keeps only the standard forecast fields. Segment flags (e.g. NFL new-team) are joined back from the forecast
  archive when scoring.

**Blockers (none is solvable from this sandbox without your decision or more time):**
1. **Merge:** scheduled runs, `projection-data` and any settled live record all need the merge.
2. **CFB availability:** there is no usable pregame QB or injury feed (ESPN stale, depth endpoint 400). League availability
   reports are a possible free source and are untested.
3. **NBA:** the official injury report path has not run live yet; first reports are expected around 2026-10-19/20.
4. **MLB:** no injury / IL source; regular-season lineups and late scratches will only be exercised on live data next season.
5. **NHL:** the season constant is hard-coded to 2026 (rollover is a code change). The two PR-only verification jobs
   (`pr-replay`, `pr-repro`) can be removed after merge if their runner time is not wanted.

---

## 9. Decisions for the owner

1. **Merge the six PRs** (in any order; they are independent). The first scheduled run per sport creates `projection-data`
   and starts the live record.
2. **After ~3–4 weeks of settled forecasts:** approve promotions family by family, using the criteria in §3.
3. **CFB defensive rating:** approve or decline switching the script engine to the new rating. The evidence is in §6; the
   shadow file runs regardless.
