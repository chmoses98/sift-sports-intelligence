# Live-quote loop: a hand-over that survives runner-queue waits

Companion to `docs/ci/QUEUE_ANALYSIS.md` (the measurements) and separate from the CI-dedupe change (PR 151, `ci.yml`). This change touches `.github/workflows/live-quotes.yml`, adds `scripts/live-quotes/{handover,guard,loop}.mjs` and one test file, and edits two sentences in `docs/ARCHITECTURE.md`. It does not touch `ci.yml`, `publish-live-quotes.mjs`, `lib.mjs`, or the output format.

## 0. Summary

| | before | after (this change) |
| --- | --- | --- |
| Job lifetime | exactly 55 min, then dispatch the successor | about 45 min, then until the successor is running and has published (cap 150 min) |
| When the successor is dispatched | at the end (the feed stands still for its whole queue wait) | 45 minutes in, into the other concurrency slot, so it queues while this job is still publishing |
| Feed gap if the successor waits W minutes for a runner | W (measured up to 69) | 0 for W up to 105; then W - 105 |
| Overwrite protection | none: `git push -f` of whatever the last writer has | freshest wins: compare-and-swap on the branch tip; a feed that is not strictly newer is never pushed |
| Cron | `*/10`, 125 of 129 runs cancelled by the concurrency group | the same schedule, now a watchdog: exits in seconds unless the feed is older than 10 min |
| Output | `index.json`, `games/*.json`, `README.md` (+ `health.json` once PR 148 lands) | identical; one orphan commit per push on `live-quotes` |
| Runner minutes | 1,320 per day measured | about 1,530 per day modelled (+16%) |
| Kalshi sweeps | 1 per 3 min | 1 per 3 min (about 20 per hour; modelled 20.1) |

Replay of the 599 measured hand-over waits (section 3): feed gaps above 10 min 56 -> 0, above 15 min 41 -> 0, minutes beyond the 10-minute limit 938 -> 0, worst gap 72 -> 5 minutes (one publish cycle). Stated limits in section 6: waits longer than about 105 minutes, a job that dies before it has dispatched, and anything on the source side are not fixed.

## 1. What the loop does today, and who reads it

- `live-quotes.yml`: one job, `timeout-minutes: 70`, concurrency group `live-quotes` (`cancel-in-progress: false`). The job loops for 55 minutes, running `node scripts/publish-live-quotes.mjs "$RUNNER_TEMP/feed"` and then `git init; git commit; git push -f` of the whole tree as one orphan commit to `live-quotes`, once per 3 minutes (measured 19 publishes per job, 0 failures). Its last step runs `gh workflow run live-quotes.yml --ref main` (`if: always()`). Because the successor is dispatched only then, and the group is free at that moment, it goes straight to the runner queue: the feed stands still for exactly that wait.
- The cron (`*/10`) shares the group, so a cron run is pending behind the running job and the next cron run replaces it: 125 of 129 scheduled runs were cancelled and 4 started (2 after a real chain break: 148.7 min on 10-06, 63.4 min on 10-07).
- Per cycle: 103 requests (log of run 40566266791: 73 Kalshi series sweeps plus the three sport publications from raw.githubusercontent.com), a 120 ms pause between requests, about 14 s, 0 errors. `makeGet` retries 429/5xx with back-off. Rate limits found in the repository: a per-IP token bucket of about 14 requests refilling about 3 per second, measured for Kalshi from the relay host (`relay/README.md`, `scripts/kalshi-rate-probe.mjs`). Nothing in the repository limits requests per minute from a runner; the runner IP changes with every job.
- Consumers: the app reads `raw.githubusercontent.com/.../live-quotes` (FRESH under 15 min of quote age, AGING to 30, `src/live/freshness.ts`); `scripts/production-check.mjs` on main requires `index.json` `generated_at` no older than 15 minutes (`FEED_MAX_AGE_S`); the quote monitor (`quote-monitor.yml`, only on `claude/quote-track`, PR 148) requires `generated_at` under 10 minutes and a `health.json` heartbeat whose `run_id` changed or `sequence` rose. `health.json` is not on main yet (PR 148 changes `publish-live-quotes.mjs` and `lib.mjs`; this change does not, and `git diff origin/main origin/claude/quote-track -- .github/workflows/live-quotes.yml` is empty, so the two merge cleanly in either order). Two overlapping loops have different `run_id`s, which the monitor counts as advancing; within one run sequence numbers are written by one publisher in order.
- The branch contract is kept: one orphan commit, whole tree replaced, no history, commit message `live quotes <ISO time>`; `index.json` `generated_at` equals the commit time to the second.

## 2. Designs considered

| | design | idea | verdict |
| --- | --- | --- | --- |
| A | two staggered loops, separate groups, about 27 min apart | the other loop covers one loop's wait | covers at most the offset (about 27 min), and queue waits are clustered in time (starvation lasts 1 to 2 hours), so both loops often wait together; doubles runner minutes and sweeps unless coordinated |
| B | early successor, fixed job length | dispatch the successor L minutes before the end, other group | same limit: tolerates L minutes of wait and costs more the larger L is (+55% at L=20, +100% at L=27.5) |
| C | **overlap until the successor is running** (chosen) | dispatch at minute 45; keep publishing until the successor is running and its feed is on the branch (cap 150) | tolerance is cap minus 45 = 105 minutes; the overlap lasts one cycle, not L minutes; costs +16% runner minutes, no extra sweeps |
| D | a freshness watchdog on a schedule | restart when stale | not a fix: it queues behind the same runners (kept only as the restart path for a broken chain) |
| E | shorter job, cron offset | | no gain: setup is about 30 s from job start to first publish; the cron run queues on the same pool |

A and B are special cases of C with a fixed lead; C removes the lead as a parameter by waiting for evidence that the successor is publishing.

## 3. Replay model

Inputs: the 599 measured live-quote jobs (created, started, completed), 2026-10-04 15:45Z to 10-28 13:40Z (23.9 days); all 3,479 jobs of the repository for the congestion estimate. A designed job created at time t waits W(t). Because the repository's own queue cannot be re-run, W(t) comes from four assumptions, reported side by side:

- S1 neighbour: if t falls inside a measured wait interval, the remaining wait of that interval; otherwise the wait of the nearest measured job (waits are clustered in time).
- S2 pessimistic: the largest measured wait within 30 minutes of t, if it exceeds S1.
- S3 backlog: the larger of S1 and the time the repository's other jobs created before t were still waiting (first-in-first-out backlog).
- S4 i.i.d.: waits drawn at random from the 599 measured waits, 200 runs (optimistic: no clustering).

Publish instants: first publish 0.5 min after job start, then every 2.9 min (measured), at most one per 2.5 min across overlapping jobs (the cadence gate). A feed gap is the time between consecutive publish instants. The baseline replay reproduces the measured 56 gaps above 10 minutes (actual 56 of 598 hand-overs; above 15 minutes 41 vs 43 actual).

| scenario | design | gaps > 10 min | gaps > 15 min | minutes beyond 10 | minutes beyond 15 | worst gap (min) | runner-min per day | publishes per hour | time with 2 jobs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | baseline | 56 | 41 | 938 | 695 | 72 | 1,368 | 19.1 | 0% |
| S1 | early successor, 55-min jobs, 20 min lead | 23 | 15 | 308 | 214 | 46 | 2,119 | 20.3 | 49% |
| S1 | early successor, 55-min jobs, 27.5 min lead | 19 | 14 | 283 | 205 | 44 | 2,650 | 19.8 | 85% |
| S1 | two loops 27 min apart | 49 | 38 | 888 | 670 | 72 | 2,736 | 19.2 | 94% |
| S1 | **overlap until running (45 / cap 150)** | **0** | **0** | **0** | **0** | **5** | **1,530** | 20.1 | 6% |
| S2 | baseline | 57 | 42 | 943 | 696 | 72 | 1,368 | 19.1 | 0% |
| S2 | early successor, 20 min lead | 27 | 20 | 411 | 294 | 52 | 2,104 | 20.2 | 48% |
| S2 | early successor, 27.5 min lead | 20 | 15 | 287 | 201 | 44 | 2,646 | 19.8 | 85% |
| S2 | two loops 27 min apart | 15 | 11 | 254 | 192 | 54 | 2,734 | 19.7 | 91% |
| S2 | **overlap until running** | **0** | **0** | **0** | **0** | **5** | **1,530** | 20.1 | 6% |
| S3 | baseline | 64 | 48 | 1,128 | 848 | 75 | 1,359 | 19.0 | 0% |
| S3 | early successor, 20 min lead | 32 | 26 | 591 | 453 | 70 | 2,084 | 20.1 | 47% |
| S3 | early successor, 27.5 min lead | 21 | 18 | 379 | 283 | 64 | 2,609 | 19.7 | 82% |
| S3 | two loops 27 min apart | 64 | 48 | 1,128 | 848 | 75 | 2,715 | 19.0 | 94% |
| S3 | **overlap until running** | **0** | **0** | **0** | **0** | **5** | **1,529** | 20.1 | 6% |

S4 (i.i.d., mean of 200 runs, [95th percentile run]): baseline 56.3 [68] gaps above 10 min, 938 [1,252] minutes beyond; early successor 20 min lead 27.5 [36] and 433 [628]; two loops 3.2 [6] and 28 [76]; overlap until running 0 [0] and 0 [0]. The two-loop design looks good only when waits are independent, which the measured waits are not.

Sensitivity of the chosen design to longer waits (S1 timeline, every wait multiplied by k):

| k | longest wait (min) | baseline: gaps > 10 / > 15 / min beyond 10 / worst | overlap until running: gaps > 10 / > 15 / min beyond 10 / worst | runner-min per day |
| --- | --- | --- | --- | --- |
| 1.0 | 69 | 56 / 41 / 938 / 72 | 0 / 0 / 0 / 5 | 1,530 |
| 1.5 | 104 | 75 / 43 / 1,157 / 103 | 0 / 0 / 0 / 5 | 1,529 |
| 2.0 | 139 | 76 / 55 / 1,575 / 138 | 2 / 2 / 49 / 36 | 1,524 |
| 3.0 | 208 | 89 / 66 / 2,698 / 175 | 5 / 5 / 257 / 90 | 1,512 |

Chosen design, S1: job length p50 48.1 min, p90 55.2, longest 117.4; 31.4 jobs per day (25.0 now); never more than 2 jobs at once; the second job exists 6% of the time (the overlap is one cycle, plus the waiting time of the predecessor, which is the point).

What the model cannot know: the queue is shared with jobs it cannot see (section 6), and a job dispatched earlier or held longer changes the load a little (it adds at most one extra running job). The conclusion rests on the measured maximum wait (69.4 min) being below the tolerance (105 min), not on the details of W(t): the result is the same in S1, S2, S3 and S4.

## 4. The change

`live-quotes.yml`
- `run-name`: `Live quotes loop <slot>` for dispatched runs, `Live quotes watchdog` for the schedule. The loop recognises its successor by this title and the `workflow_dispatch` event, so a watchdog run is never mistaken for one.
- New `workflow_dispatch` input `slot` (choice a/b, default a). Concurrency group `live-quotes-<slot>` (`cancel-in-progress: false`), and `live-quotes-watchdog` for the schedule. A job and its successor are in different groups, which is what lets them overlap; two jobs can never share a group, so at most one job per slot runs.
- `timeout-minutes: 160` (loop cap 150 plus 10). `permissions` unchanged (`contents: write`, `actions: write`).
- Two steps: the loop (`node scripts/live-quotes/loop.mjs`), and `Make sure a successor exists` (`if: always()`), the old always-dispatch step as a check: it dispatches only if no loop run is queued or running.

`scripts/live-quotes/handover.mjs` (pure rules), `guard.mjs` (git), `loop.mjs` (driver, with its side effects injected so it can be tested on a fake clock), plus `.d.mts` types.

Loop, per 3-minute cycle:
1. Read the branch tip (one shallow `git fetch`: sha and `generated_at`).
2. From minute 45 on, list the workflow's recent runs (one REST call, `GITHUB_TOKEN`). The successor is any active `Live quotes loop` run with a larger id than this job's.
   - none, not yet dispatched: dispatch it now to the other slot (retried every cycle if it fails; also done if the run list cannot be read);
   - a successor is queued: keep publishing, however long, until the cap;
   - a successor is running and the branch holds a feed newer than this job's last: finish (the handover is proven);
   - a successor is running but has not published yet: keep publishing.
3. If the branch is younger than 150 s, wait until it is 150 s old (another publisher just wrote it); this is what keeps the sweep rate at one per cycle during an overlap.
4. Publish with the unchanged `publish-live-quotes.mjs`, then `guardedPush`.

`guardedPush`: commit the tree as an orphan commit, read the tip, return `superseded` if the branch's `generated_at` is not strictly older than ours, otherwise `git push --force-with-lease=refs/heads/live-quotes:<tip sha>`. If the tip moved in between, the lease rejects the push and the loop reads again and decides again (up to 4 times). So the branch can only move to a strictly newer feed, whatever order concurrent pushes arrive in.

Watchdog (schedule): if the branch is at most 10 minutes old it records "nothing to do" and exits (the ensure step then does nothing). If it is older, it runs the loop itself (slot `w`, its successor goes to slot `a`). Duplicated chains (a manual dispatch, a watchdog restart racing a late successor) merge on their own: a job always yields to a younger running publisher, and dispatches no successor when a younger run already exists.

Truth table (which job exists after each event):

| event | before | after |
| --- | --- | --- |
| loop job reaches minute 45 | nothing | dispatch run `Live quotes loop <other slot>`; this job continues |
| successor starts (any queue wait) | the old job already ended | both publish for about one cycle (cadence gate: one sweep per 3 min); then the old job ends |
| successor still queued at minute 150 | feed stale since minute 55 | this job ends at 150; the queued successor takes over when it starts; the `ensure` step sees it queued and dispatches nothing |
| dispatch call fails | `if: always()` step tries once | retried every cycle from minute 45 (about 35 tries), then the `ensure` step, then the watchdog |
| job cancelled/failed before minute 45 | `always()` step dispatches | same (ensure step), then watchdog if the runner died |
| schedule fires | pending behind the loop in the same group, replaced by the next cron (125 of 129 cancelled) | own group; exits in seconds when the feed is fresh; restarts the loop when older than 10 min |
| manual dispatch, slot a, while slot a runs | pending in the group | pending in the group (same); the running job treats it as its successor and keeps publishing until it can run (at most to the cap) |
| dispatch on another branch | publishes, and re-dispatches nothing from the `always()` step (`github.ref` check) | the same: no dispatch unless `refs/heads/main` |
| the workflow is rolled back while a new-style job runs | | its dispatch with `slot` gets 422 from the old workflow; it dispatches again without inputs (tested) |

## 5. Freshest-wins proof

`tests/live/quote-handover.test.ts` (29 tests, `npx vitest run tests/live/quote-handover.test.ts`, about 15 s; uses real `git` against a local bare repository standing in for GitHub):

- creating the branch gives exactly one orphan commit with `README.md`, `index.json`, `games/*.json` and the message `live quotes <time>`; a newer feed replaces it and the branch still has one commit;
- an older feed arriving later does not move the tip; an equal `generated_at` does not move it;
- stale read: publisher B reads the tip, publisher C pushes a newer feed, B pushes with its stale tip: the lease rejects it, B reads again and is superseded (attempts = 2) and the tip stays C's; if B's feed is newer than C's it goes through on the second attempt;
- six concurrent publishers in random order, each its own probe repository: the final `generated_at` is the maximum and a watcher polling the tip never observed it going backwards.

Mutation check (done once, by hand, not committed): replacing the `newestWins` check by `if (false)` and the lease by `--force` makes 5 of those tests fail.

The loop is tested on a fake clock and fake GitHub: a 69-minute wait for the successor (the 10-27 22:14 case) gives a longest gap between pushes of 3.0 minutes and a hand-over only after the successor published; no wait gives an overlap of about one cycle; a successor queued past the cap ends the job at the cap with exactly one dispatch; a successor that started but never publishes does not end the job; two failed dispatches are retried at the next cycles; an unreadable run list dispatches to be safe; publishes per hour stay between 19 and 22.

Also run: `npm run typecheck`, `eslint` on the new files, `actionlint` (1.7.12, whole directory, clean), the existing `tests/live` suites (233 passed, 3 skipped, unchanged), and the watchdog path against the real repository (read-only `git fetch` of the live branch: "the feed is 1.3 min old (limit 10); nothing to do", exit 0).

## 6. What this does not fix (stated plainly)

- Waits longer than about 105 minutes (cap 150 minus the 45 minutes before the dispatch). The longest measured is 69.4 minutes, so the margin is 1.5 times; the sensitivity table shows what remains at 2 and 3 times (gaps of 36 and 90 minutes). The cap can be raised (a job may run up to 6 hours) at the price of holding one runner while it waits.
- The starvation windows with no visible job of this repository (2026-10-25/26, waits of 36 to 57 minutes, only 1 to 2 queued deploy jobs): the cause is outside what the API shows (other repositories on the account, whose runs this session cannot read, or GitHub capacity). This design does not remove that starvation; it makes the loop independent of it as long as a running job exists, because a running job is not affected by the queue. All five such windows are within the tolerance.
- A job that dies before it has dispatched (a runner lost in the first 45 minutes): the `ensure` step runs if the runner is alive; if the runner is gone the watchdog restarts it after the feed is 10 minutes stale, but the watchdog queues like any job. Measured, 3 jobs in 24 days ended abnormally (a 75-minute timeout, a failure at 54 minutes, a cancel at 43 minutes); two of them led to 148.7 and 63.4 minutes without a feed. After this change the dispatch is made at minute 45 and retried, which covers failures of the last-step kind (two of the three); a runner lost earlier still leaves the watchdog.
- Source-side problems: Kalshi or a sport publication unreadable or stale (the publisher refuses to replace the last-known-good feed by design), and the 5-minute cache of `raw.githubusercontent.com` that readers see.
- The model only replays history. Whether a successor dispatched at minute 45 waits longer or shorter than one dispatched at minute 55 is not observable; if queue wait grows with the number of simultaneously queued jobs, one more queued job is the cost of the design.

## 7. Cost

- Runner minutes: measured 1,320 per day (replay of the baseline 1,368); modelled 1,530 per day (+16% measured, +12% replay baseline), hosted Linux minutes on a public repository.
- Kalshi/relay requests: unchanged per cycle (103) and, with the cadence gate, 20.1 sweeps per hour in the replay (baseline 19.1). During an overlap the two publishers run on different runners, and a sweep starts only when the branch is at least 150 s old, so sweeps of the two jobs essentially never overlap in time. No relay is involved in the feed.
- GitHub API: one run-list call per cycle from minute 45 (about 35 calls in a normal job, 1 to 2 per 3 minutes), one dispatch per job; the `GITHUB_TOKEN` limit is 1,000 requests per hour per repository.
- Extra pending/active runs: the run list in the Actions UI shows `Live quotes loop a/b` runs; 31 per day instead of 25, plus a watchdog run about every 10 minutes (5 to 6 per day created by GitHub's scheduler, each a few seconds of runner time when the feed is fresh).

## 8. Rollout and measurement

1. Merge. The job already running finishes its old loop and dispatches a successor without inputs; that run starts with the new definition, slot `a`. No action is needed. The watchdog finds a fresh feed and exits.
2. First hour: the first new job should log `hand-over: dispatched the successor (slot b) after 45.x min` and, when it ends, `finishing ... successor <id> is running and publishing`. Runs are titled `Live quotes loop a` / `b`.
3. Track the actual gaps and waits with the same method as `QUEUE_ANALYSIS.md`: the jobs endpoint for job created/started/completed, and `GET /repos/chmoses98/sift-sports-intelligence/commits?sha=live-quotes` shows only the single tip, so use the job log lines `published N times, M superseded by a newer publisher` and the Events API (`PushEvent` on `refs/heads/live-quotes`) for the push times. Success criterion: no two consecutive pushes more than 4 minutes apart outside source-side failures, including during a queued hand-over.
4. If the quote-track PR (148) is merged afterwards, set `SIFT_MONITOR_REQUIRE_HEARTBEAT` as its notes say; nothing here changes `health.json`.

## 9. Rollback

Revert the pull request (the workflow, the three scripts, the test, the two doc sentences). A new-style job still running after the revert dispatches its successor with the `slot` input; the old workflow answers 422 and the job dispatches again without inputs, so the chain continues. The old definition then has the single group `live-quotes` again; a run from slot `b` that is still alive just finishes. No data format, branch name, secret or variable is involved.

## 10. Cannot be verified before merge

- Everything that needs the new workflow on the default branch: `workflow_dispatch` with the `slot` input, the `run-name` display title that the successor detection reads (`display_title`; the run list currently shows the workflow name for old runs), the two concurrency groups running at once, dispatch from inside a running job to the other slot, the run `status` values on the REST run list, and a real overlap of two publishers pushing over HTTPS. The pieces are tested against a local git remote, a fake GitHub and the read-only fetch of the real branch; the GitHub-side behaviour is not.
- A real queue wait of 45+ minutes with the new design (it happens by chance; the model says it will be absorbed).
- The Kalshi behaviour of two sweeps close in time from different runner IPs (not expected; sweeps are separated by the cadence gate).
- The effect on the quote monitor's heartbeat check (the monitor is not on main).
- This pull request's own commits carry `[skip ci]`, so no CI run of this branch exists.
