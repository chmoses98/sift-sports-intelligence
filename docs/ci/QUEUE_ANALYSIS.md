# CI queue analysis: why the live-quote hand-over waited 55 minutes (2026-10-27)

Scope: measurement, the duplicate-trigger finding, the one workflow change in this branch (`ci.yml`), and proposals that are deliberately not applied.
Everything below was read from the public GitHub REST API on 2026-10-28 (`actions/workflows/*/runs`, `actions/runs/*/jobs`, `events`, `commits`) against `main` at `2f315261`. No workflow was dispatched and no paid runner is assumed.

## 0. Summary

| Finding | Evidence |
| --- | --- |
| The live-quote loop is one 55-minute job that dispatches its successor; the successor has to win a hosted runner. Every minute it waits is a minute the published feed (`generated_at`) is not updated. | 599 executed jobs, 598 hand-overs, 2026-10-04 to 2026-10-28 (sections 1 and 3) |
| Hand-over waits are mostly zero but have a heavy tail that appeared with the dev-branch CI load: p50 0.05 min, p95 17.5, p99 44.9, max 69.4. 50 waited more than 10 minutes, 16 more than 30. | section 1 |
| 0 of the 50 waits above 10 minutes happened while this repository had no other job running or queued. 33 of the 50 had `ci.yml` jobs in flight, 28 had push-triggered CI jobs in flight. | section 4 |
| Not everything is explained by this repository's own CI: five of the twelve worst waits (2026-10-25/26, 36 to 57 minutes) happened with no CI job running at all and only 1 to 2 deploy jobs queued beside the live-quote job. Something outside the visible jobs (other repositories on the account, or GitHub capacity) starved the runner pool. | section 4 |
| `ci.yml` runs on `push` (every branch but `main`, `live-quotes`) AND `pull_request`. 163 of 381 distinct commits (43%) ran the whole gate twice. Those duplicates are 5,716 + 312 runner-minutes in 12.7 days, about 475 per day. | section 5 |
| The two runs never cancelled each other: their concurrency groups were `ci-refs/heads/<branch>` and `ci-refs/pull/<n>/merge`. | `ci.yml` before this change |
| Change made: `ci.yml` no longer triggers on `push`; its concurrency group is keyed by PR number, and it cancels in progress only for `pull_request` runs (never on main). Job names, steps, timeouts, and the deploy gate (`workflow_call`) are untouched. `live-quotes.yml` is not touched. | section 6 |
| Modelled effect if every push-triggered CI job disappeared: waits above 10 min 50 to about 37, above 30 min 16 to about 10. This is necessary but not sufficient. | section 7 |

## 1. Live-quote job: queue delay (job `created_at` to `started_at`)

`run_started_at` equals `created_at` for every run, so run-level fields cannot show queueing. The numbers use the job record (`jobs[].created_at`, `started_at`, `completed_at`). Check: the incident run 40566266791 (created 19:07:40Z) has its job created 19:07:45Z and started 20:02:35Z, a 54.8 minute wait. The feed index confirms `generated_at` equals the commit time of the `live-quotes` branch to the second (2026-10-28T14:28:04Z).

All 599 jobs that started, 2026-10-04 to 2026-10-28:

| statistic | minutes |
| --- | --- |
| p50 | 0.05 |
| p90 | 6.9 |
| p95 | 17.5 |
| p99 | 44.9 |
| max | 69.4 |
| jobs waiting > 5 min | 80 |
| jobs waiting > 10 min | 50 |
| jobs waiting > 30 min | 16 |
| jobs waiting > 45 min | 6 |
| total minutes spent waiting | 1,722 (28.7 h) |

By day (UTC):

| day | jobs | p50 | p95 | max | >5m | >10m | >30m |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10-04 | 10 | 0.1 | 0.1 | 0.1 | 0 | 0 | 0 |
| 10-05 | 23 | 0.1 | 0.2 | 0.2 | 0 | 0 | 0 |
| 10-06 | 26 | 0.1 | 0.5 | 3.6 | 0 | 0 | 0 |
| 10-07 | 26 | 0.1 | 0.1 | 0.2 | 0 | 0 | 0 |
| 10-08 | 26 | 0.1 | 0.1 | 3.5 | 0 | 0 | 0 |
| 10-09 | 27 | 0.1 | 0.1 | 0.9 | 0 | 0 | 0 |
| 10-10 | 26 | 0.1 | 3.5 | 5.3 | 1 | 0 | 0 |
| 10-11 | 26 | 0.1 | 6.7 | 8.1 | 3 | 0 | 0 |
| 10-12 | 25 | 0.1 | 18.9 | 21.2 | 4 | 3 | 0 |
| 10-13 | 26 | 0.1 | 1.5 | 2.6 | 0 | 0 | 0 |
| 10-14 | 26 | 0.1 | 0.1 | 0.1 | 0 | 0 | 0 |
| 10-15 | 26 | 0.1 | 5.9 | 12.0 | 4 | 1 | 0 |
| 10-16 | 27 | 0.1 | 0.1 | 4.6 | 0 | 0 | 0 |
| 10-17 | 25 | 0.1 | 9.9 | 32.1 | 6 | 2 | 1 |
| 10-18 | 25 | 0.1 | 15.2 | 17.6 | 5 | 4 | 0 |
| 10-19 | 25 | 0.1 | 6.8 | 14.8 | 4 | 1 | 0 |
| 10-20 | 26 | 0.1 | 6.2 | 15.5 | 3 | 1 | 0 |
| 10-21 | 26 | 0.1 | 8.2 | 13.0 | 2 | 2 | 0 |
| 10-22 | 24 | 0.1 | 41.8 | 44.8 | 8 | 7 | 3 |
| 10-23 | 23 | 2.5 | 23.3 | 30.5 | 9 | 6 | 1 |
| 10-24 | 25 | 0.1 | 20.5 | 29.2 | 5 | 3 | 0 |
| 10-25 | 21 | 3.4 | 38.6 | 52.5 | 10 | 10 | 6 |
| 10-26 | 24 | 1.4 | 19.0 | 56.5 | 4 | 3 | 1 |
| 10-27 | 21 | 0.1 | 68.0 | 69.4 | 7 | 6 | 3 |
| 10-28 (to 13:40) | 14 | 1.5 | 25.4 | 55.1 | 5 | 1 | 1 |

Through 10-09 no wait exceeded 4 minutes. The tail starts on 10-10 and is large from 10-22.

## 2. Schedule cadence versus actual starts

| measure | value |
| --- | --- |
| cron in `live-quotes.yml` | `*/10 * * * *` (3,443 fires expected over the window) |
| `schedule` runs GitHub actually created | 129 (3.7% of the expected fires; GitHub drops and delays scheduled runs) |
| of those, cancelled by the `live-quotes` concurrency group (a newer pending run replaces an older pending one) | 125 |
| of those, that actually ran | 4 (10-06 00:25, 10-07 16:19, 10-13 21:13, 10-19 17:01) |
| scheduler lateness against the `*/10` boundary, p50 / p90 / max | 5.3 / 9.2 / 9.9 min |
| `workflow_dispatch` (self-hand-over) runs that ran | 590 |
| job duration p50 / p90 / max | 54.5 / 54.6 / 75.0 min (loop budget is 55 min) |
| interval between consecutive job starts p50 / p90 | 54.6 / 61.6 min (target about 55.3) |
| publishes per job | 19 in the sampled job (run 40557525999: "published 19 times, 0 failures", cycle about 2.9 min) |

So the loop is kept alive by the self-dispatch, not by the cron. A cron run executed only 4 times in 24 days; two of them followed a real chain break (148.7 minutes of no feed on 10-06, 63.4 minutes on 10-07), the other two (10-13, 10-19) started with a hand-over gap of about 0.1 minute. The cron is also useless for the queue problem, because a cron run is queued on the same hosted-runner pool.

## 3. Feed generation gaps

A job's last publish is within seconds of the job end (log of run 40557525999: last publish 19:07:37Z, job end 19:07:44Z) and its first publish about 30 s after its start (first push after the incident hand-over 20:03:02Z, job start 20:02:35Z). The feed gap across a hand-over is therefore the hand-over wait plus about 0.5 min. Hand-over wait = previous job `completed_at` to next job `started_at`.

| hand-over wait (598 hand-overs) | value |
| --- | --- |
| p50 / p90 / p95 / p99 / max | 0.07 / 8.0 / 20.4 / 55.1 / 148.7 min |
| feed gap above the 10 minute limit | 56 hand-overs, 1,114 minutes beyond the limit (3.2% of the 23.9 day window) |
| feed gap above the 15 minute limit (the limit `scripts/production-check.mjs` enforces on `main`: `FEED_MAX_AGE_S = 15 * 60`) | 43 hand-overs, 876 minutes beyond the limit (2.5%) |

The 10 minute limit is the owner's figure for the quote monitor; the monitor itself is not on `main` (`claude/quote-track`, `quote-drill.yml` live on branches). `main` enforces 15 minutes. Both are shown.

Worst hand-overs (feed gap = last publish to next publish), with this repository's other jobs in flight when the live-quote job was created (running/queued):

| job created (UTC) | wait | ci push | ci PR | deploy | prod-check | other | feed gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10-22 17:22 | 42 | 0/0 | 1/0 | 1/0 | 0/0 | 0/1 | 42 |
| 10-22 20:21 | 42 | 0/1 | 1/3 | 0/2 | 0/1 | 1/0 | 42 |
| 10-22 21:57 | 45 | 0/0 | 2/2 | 1/0 | 0/0 | 1/2 | 45 |
| 10-25 00:40 | 36 | 0/0 | 0/0 | 0/1 | 0/0 | 0/0 | 37 |
| 10-25 20:15 | 53 | 0/0 | 0/0 | 0/2 | 0/0 | 0/0 | 53 |
| 10-25 22:03 | 39 | 0/0 | 0/0 | 0/1 | 0/0 | 0/1 | 39 |
| 10-25 23:36 | 36 | 0/0 | 0/0 | 0/1 | 0/1 | 0/0 | 36 |
| 10-26 01:06 | 57 | 0/0 | 0/0 | 0/1 | 0/0 | 0/0 | 57 |
| 10-27 00:49 | 68 | 10/3 | 1/5 | 0/2 | 0/0 | 0/0 | 68 |
| 10-27 19:07 (incident, run 40566266791) | 55 | 10/7 | 2/3 | 0/0 | 0/0 | 0/1 | 55 |
| 10-27 22:14 | 69 | 5/4 | 1/0 | 0/2 | 0/0 | 0/0 | 70 |
| 10-28 00:18 | 55 | 4/2 | 1/0 | 1/0 | 0/0 | 0/0 | 56 |

Longest chain breaks (no runner involved): 148.7 min (10-05 21:56 to 10-06 00:25, restarted by cron), 63.4 min (10-07), 60.7 min (10-04, first run).

Cross-check from the Events API (254 live-quotes pushes, 10-26 16:11 to 10-27 22:08): the 55.4 minute incident gap (19:07:39 to 20:03:02) and the 65.7 minute gap (10-26 22:09 to 23:15) appear as expected. The Events API is lossy for 3-minute pushes (many gaps of exactly 6, 9 or 12 minutes that the job logs, "0 failures", do not support), so only the job-level numbers above are used for statistics.

## 4. What was running when the hand-over waited

Reconstruction: every job of this repository (3,479 jobs from 21 workflows: `ci`, `v3-ci`, `deploy`, `production-check`, and the rest) is an interval [created, started) = queued and [started, completed) = running; skipped jobs excluded. Samples at the creation time of each live-quote job.

Wait of the live-quote job against the number of other jobs of this repository in flight (running + queued) when it was created (598 hand-overs):

| other jobs in flight | hand-overs | p50 wait | p95 wait | max | waits > 10 min |
| --- | --- | --- | --- | --- | --- |
| 0 | 316 | 0.1 | 2.1 | 6.0 | 0 |
| 1 to 2 | 203 | 0.1 | 17.3 | 56.5 | 20 |
| 3 to 5 | 51 | 3.2 | 24.5 | 41.9 | 13 |
| 6 to 9 | 20 | 12.6 | 45.3 | 55.1 | 11 |
| 10 or more | 8 | 25.7 | 68.9 | 69.4 | 6 |

Correlation of wait with: queued other jobs 0.67, running `ci.yml` jobs 0.44, queued `ci.yml` jobs 0.57.

Of the waits above 10 minutes (50) and above 30 minutes (16):

| | > 10 min | > 30 min |
| --- | --- | --- |
| with at least one `ci.yml`/`v3-ci.yml` job in flight | 33 | 11 |
| with at least one push-triggered `ci.yml` job in flight | 28 | 9 |
| no CI job in flight but other jobs (mostly queued `deploy.yml`) | 17 | 5 |
| with no other job of this repository in flight | 0 | 0 |
| median CI jobs in flight / median push-triggered | 2 / 1 | 4 / 1 |

Concurrency evidence: the largest number of this repository's jobs running at once was 17 (2026-10-26 23:45Z, 5-minute samples since 10-12); jobs were queued for more than 5 minutes at times when only 1 to 3 jobs of this repository were running (distribution of running jobs during those minutes: 0 to 3 in 2,357 of 4,107 minutes). Hosted capacity available to the repository was therefore lower than the visible repository load implies, so other consumers of the same pool (other repositories under the same account, which this session cannot read, or GitHub itself) take part. That is the reason dedupe alone cannot be promised to fix the tail (section 7).

The incident (10-27 19:07Z): 12 `ci.yml` jobs running (10 push-triggered, 2 pull-request), 10 queued (7 push-triggered, 3 pull-request) from 13 `claude/*` branches, including the `sift3-h-*`, `quote-track`, `quote-drill`, `relay-expose-date` and `sift3-impl` branches.

## 5. Duplication

Workflows on `main` and what triggers them (before this change):

| workflow | push | pull_request | other | heavy jobs |
| --- | --- | --- | --- | --- |
| `ci.yml` | all branches except `main`, `live-quotes` | all | `workflow_call` | `verify` (timeout 135 min; measured p50 27 min, p90 57 min, max 136 min), `projection-foundation` (15 min cap) |
| `deploy.yml` | `main` | | cron `17 */3 * * *`, dispatch | calls `ci.yml` (`verify` only, `projection-foundation` skipped), then build and deploy; group `pages`, no cancel |
| `production-check.yml` | | | `workflow_run` after deploy, dispatch | `check` (100 min cap) |
| `live-quotes.yml` | | | cron `*/10`, dispatch, self-dispatch | `publish` (70 min cap), group `live-quotes`, no cancel |
| `visual-baselines.yml` | all branches except `main`, `live-quotes` | | dispatch | job `if`-gated on commit message: 609 of 687 runs were skipped (no runner used) |
| `team-logos.yml`, `hero-images.yml`, `player-images.yml` | path-filtered, non-main | | dispatch | 10 to 30 min caps |
| `hero-candidates.yml`, `live-scores-probe.yml` | single branch patterns | | dispatch | up to 150 and 345 min caps |
| `pure-contract.yml` | `main`, path-filtered | path-filtered | dispatch | 10 min |
| `nba-activation-joint.yml` | | path-filtered | dispatch | 25 min |
| `live-provider-smoke.yml`, `projection-foundation-monitor.yml` | | | cron every 6 h | 10 to 15 min |
| `relay-smoke.yml` | | | dispatch | 10 min |

Duplicate: only `ci.yml` has the same job on both `push` and `pull_request`. `v3-ci.yml` (not on `main`; present on `claude/sift3-impl` and other branches) is `pull_request` only, so it does not duplicate itself but it adds a second heavy suite to every sift3 pull request (28 jobs in 6 runs so far). It is untouched here.

Measured from 2026-10-15 20:00Z (the current trigger set merged 10-15) to 10-28, 12.7 days:

| ci.yml runner-minutes (job `started` to `completed`) | heavy `verify` | `projection-foundation` |
| --- | --- | --- |
| pull_request runs | 6,307 (177 jobs) | 504 (112 jobs) |
| push runs on a commit that also ran under a pull_request | 5,716 (162 jobs, mean 35.3 min) | 312 (102 jobs) |
| push runs on a commit with no pull_request run | 4,455 (205 jobs, mean 21.7 min) | 1,079 (151 jobs) |
| total | 16,477 | 1,894 |

Run counts: 380 push runs (29.9 per day) and 170 pull_request runs (13.4 per day); 163 of 381 distinct head commits ran under both events. Outcome of the 367 heavy jobs started on push: 230 cancelled (superseded by a newer push, 3,914 runner-minutes), 51 failed, 86 succeeded.

All observed jobs together average 3,307 runner-minutes per day; `ci.yml` heavy is 1,298 per day of that, 801 per day on push. `deploy.yml` verify (cron every 3 hours plus each push to `main`) is 334 per day, `production-check` 88 per day, live-quotes 1,320 per day.

Required PR checks: the integration token gets 403 on branch protection, environments and Actions variables, so these could not be read. What could be read: `GET /branches/main` reports `protected: false`, the rulesets list is empty, and PR 150's check list shows exactly these names (preserved by this change): "Lint · typecheck · test · build · acceptance (Chromium + WebKit)", "Projection Foundation (pf_core) · Python tests + vendoring manifest", plus the skipped "baselines". Nothing visible makes any of them a required status check on `main`.

## 6. The change

`.github/workflows/ci.yml`, trigger block and concurrency only:

```yaml
on:
  pull_request:
  workflow_call:

concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- `push` removed. `main` was already excluded; it is gated by `deploy.yml` -> `ci.yml` (`workflow_call`), unchanged. Pull requests into any base (including stacked PRs) keep the full gate; draft PRs are included (default `pull_request` types: opened, synchronize, reopened).
- Group by PR number, cancelling only `pull_request` runs: a newer commit on the same PR replaces its superseded run (this was already the effect of the `refs/pull/<n>/merge` key). In the deploy gate (`workflow_call` from `deploy.yml`, `github.event_name` is the caller's `push` or `schedule`) it no longer cancels: previously `cancel-in-progress: true` applied to group `ci-refs/heads/main` as well. Overlap on main was already prevented by deploy's own `pages` group, so this is hardening, not a behaviour change.
- The `if` on `projection-foundation` is left as it was; its push disjunct is now unreachable from this file's own triggers and is harmless.
- Not changed: `live-quotes.yml`, `deploy.yml`, `production-check.yml`, job names, steps, timeouts, permissions, environments (`github-pages` is only used in `deploy.yml`).
- Path filters were not added: the gate must run on every PR, and `npm test`, lint and the e2e suites read most of the tree, so no path set is provably safe.

### Event-by-event truth table (workflows that run a runner job)

| event | branch | PR open | before | after |
| --- | --- | --- | --- | --- |
| push | `claude/x` | no | `ci.yml` verify + projection-foundation (push group `ci-refs/heads/claude/x`) | nothing from `ci.yml` (branch-specific workflows such as `team-logos`/`hero-images`/`player-images`/`visual-baselines` unchanged; `visual-baselines` job skipped without the commit tag) |
| push | `claude/x` | yes | `ci.yml` twice: push run and pull_request run, different groups, both full gate | `ci.yml` once: the pull_request run |
| pull_request opened / synchronize / reopened | `claude/x` into `main` (or any base) | yes | `ci.yml` pull_request run; `pure-contract` / `nba-activation-joint` only when their paths change | identical; a newer commit cancels the previous run of the same PR |
| pull_request closed/merged | | | no CI (not a trigger) | same |
| push (merge commit) | `main` | merged | `deploy.yml` (push): `verify` -> `ci.yml` verify only (projection-foundation skipped by its `if`), `nfl-snapshot`, build, deploy (`github-pages` environment), then `production-check` via `workflow_run`; `pure-contract` if its paths changed | identical; the `ci.yml` call no longer cancels in progress |
| schedule `17 */3 * * *` | `main` | | `deploy.yml` -> same chain | identical |
| workflow_dispatch | `deploy.yml`, `live-quotes.yml`, `production-check.yml`, `visual-baselines.yml` etc. | | unchanged | unchanged (`ci.yml` was never dispatchable) |
| push by the feed bot | `live-quotes` | | nothing (`branches-ignore`, and no workflow reacts) | nothing |
| schedule `*/10 * * * *` and self-dispatch | `main` | | `live-quotes.yml` | identical (file untouched) |
| push | stale branch whose own `ci.yml` still has `push:` | any | the branch's old `ci.yml` runs on push (a push uses the workflow file in the pushed commit) | unchanged until the branch merges or rebases `main`; of 149 remote branch tips, 114 carry an older `ci.yml` and 31 an identical copy of the current one (4 could not be resolved locally); every one has the push trigger |

Trigger evaluation of `ci.yml` before and after was also checked mechanically (YAML parsed, `branches-ignore` globbing evaluated): `push claude/feature` True -> False; `push main`, `push live-quotes` False -> False; `pull_request` True -> True; `workflow_call` True -> True.

### Consequences for pushes to branches that have no pull request

They no longer get a CI run until a PR (draft is enough) is opened. 212 of 381 commits in the window were push-only; 4,455 + 1,079 runner-minutes (436 per day) were spent on them, and 159 of their 205 heavy jobs were cancelled by a later push before finishing. This is the part of the saving that is a coverage trade rather than a pure duplicate removal; see the owner decisions in the pull request.

## 7. Estimated reduction

| quantity | per pushed commit | per day (12.7 day average) |
| --- | --- | --- |
| duplicate heavy `verify` removed (commit on a branch with a PR) | one run, mean 35.3 runner-min (cap 135) | 450 |
| duplicate `projection-foundation` removed | about 3 runner-min | 25 |
| push-only commits (no PR) no longer gated | one run, mean 21.7 runner-min | 436 |
| all push-triggered CI | | 910 of 1,447 `ci.yml` runner-min (63%), 27.5% of the 3,307 runner-min per day observed |

Modelled effect on the live-quote wait if all push-triggered CI jobs had not existed (conditional frequency by number of other jobs in flight, applied to the counterfactual in-flight counts; 409 hand-overs since 10-12; the timeline is held fixed, which understates the benefit, and unseen consumers are not modelled): waits above 10 minutes 50 to about 37, above 30 minutes 16 to about 10. In the four worst windows of 10-27/28 the in-flight count would have gone from 21, 23, 12, 8 to 8, 6, 3, 2. The five starvation windows of 10-25/26 would be unchanged.

The realised benefit depends on active branches picking up the new `ci.yml` (section 6, last row).

## 8. Can the live-quote job be less sensitive to queueing? (proposals, not applied)

Measured facts: the job's own setup is about 30 seconds from start to first publish; the cron is cancelled 125 of 129 times; queue wait is 98% of the exposure. So the lever is the hand-over design, not the job body.

1. Overlapping loops (largest effect, changes `live-quotes.yml` logic): two loops in two concurrency groups (for example `live-quotes-a`, `live-quotes-b`), offset by about 27 minutes, each dispatching its own successor. A single loop's queue wait is then covered by the other loop; the feed only goes stale if both hand-overs wait at once. The 598 measured hand-overs had p95 20.4 min and 20 above 30 min, which an overlap of this kind tolerates up to roughly 27 minutes of delay per loop. Costs: twice the runner minutes and two concurrent jobs of the repository's pool, and the publish step needs to stay safe when both loops force-push (each push replaces the branch with one orphan commit, so the last write wins; request rate to Kalshi doubles unless the loops alternate cycles). Needs a review of the Kalshi rate behaviour (`relay-smoke.yml`) before use.
2. Earlier successor: dispatch at about minute 35 into a different group so it is already waiting when the predecessor ends. A single group cannot do this: with `cancel-in-progress: false` a dispatched successor is held pending in the same group and only asks for a runner once the predecessor finishes.
3. Cron changes: offsetting the minute or shortening the interval does not help (the cron run is queued on the same pool; its median creation delay is already 5.3 minutes).
4. Shorter or lighter job: no measurable gain; keep the 70 minute timeout and the no-cancel behaviour.
5. Reduce competing heavy jobs outside the PR trigger: the scheduled deploy runs the full acceptance gate every 3 hours (92 `verify` jobs, 334 runner-min per day), then `production-check` (100 minute cap, 88 per day); `v3-ci.yml` adds a second heavy suite to every sift3 pull request. These are owner decisions because they trade deploy freshness and test coverage.
6. Move the market clock off hosted Actions (the read-only relay in `relay/`, or another scheduler): removes the dependency entirely. Out of scope here.

Self-hosted runners were not evaluated (not a GitHub-paid runner, but it adds operations work and a trusted-code question for a public repository).

## 9. Not verifiable before merge

- A workflow change cannot be run from a branch for `push`/`schedule`/`workflow_call` events before it is on `main`, and no workflow was dispatched. This branch's commits carry `[skip ci]`, so the pull request's own CI is skipped by design.
- Required status checks, rulesets-like protection beyond the empty ruleset list, and the `github-pages` environment rules: 403 through the integration. The change does not touch the environment or any permission.
- Other repositories sharing the account's hosted-runner pool: not readable here.
- The account's plan limits (concurrent jobs) are not readable.
- First real confirmation after merge: open a draft PR from a branch carrying the new `ci.yml` and check that only the `pull_request` run appears for each push (sections 5 and 6).
