# Quote monitor: CI drill, failure injection and heartbeat verification

For the owner. The monitor and the drill are READ-ONLY (GET requests only), use no secret and write nothing but the runner's
step summary. Sections 2 and 4 say exactly what has been run in GitHub Actions (with run ids) and what has not. Anything marked
"expected" is either produced by the local drill (`scripts/quote-monitor-drill.mjs`, tests in `tests/live/quote-monitor-drill.test.ts` and
`tests/live/quote-drill-ci.test.ts`) or derived from the monitor's source.

## 0. What the monitor decides (the exact rules)

`scripts/quote-monitor.mjs`; every row is pinned by `tests/live/quote-monitor.test.ts` (95 tests) with an injected fetch,
clock and sleep.

| Check | Fails when |
| --- | --- |
| Feed readable | `index.json` unreachable, not JSON, or the wrong schema (one retry, 2 s, on a network error or 5xx) |
| Feed `generated_at` recent | the newest stamp across `index.json`, `health.json` and one game file is more than 600 s old (600 s exactly passes), or more than 5 s in the runner's future |
| Heartbeat sequence advances | `health.json` is re-read every 30 s for up to 540 s; neither a higher `sequence` nor a new `run_id` appeared. A sequence that goes backwards inside one run fails at once. A stale feed is not waited on |
| Heartbeat present | only when `SIFT_MONITOR_REQUIRE_HEARTBEAT=1`; otherwise a missing `health.json` is the distinct state `HEARTBEAT_NOT_PUBLISHED` (a `NOTE`, verdict `PASS (heartbeat not published yet: not a failure)`) |
| Relay quote batch | see below |

**The relay rule.**

1. Only contracts the feed itself lists as open (`status` `active` or `open`) are asked of the relay, up to 25, in one request
   with the SIFT `Origin`. A closed or settled contract is never asserted. If the feed lists no open contract the check is
   `SKIP` (printed as a skip, never as a pass).
2. A game's batch is a pass when the relay answers HTTP 200 with an `X-Sift-Observed-At` no older than 60 s (exactly 60 s
   passes; more than 5 s in the future fails) and at least one of the requested contracts. A partial answer passes and says
   `2 of 3 requested markets`.
3. HTTP 200 with none of the requested contracts ("empty", or a delisted or closed game) is tried against the next game, up
   to 3 games (`SIFT_MONITOR_RELAY_GAMES`). One game answering passes the check, with the empty games named in the detail.
   Every game empty fails (`no markets for the N game(s) tried`).
4. **One transient failure is retried once.** Transient: no answer (network error, timeout), HTTP 429, HTTP 5xx, or a
   200 that is unusable (not JSON, no `markets[]`, no observation time, over 60 s old or in the future, every game empty).
   The retry waits 5 s (`SIFT_MONITOR_RETRY_DELAY_S`) or the relay's `Retry-After` on a 429 (never less than 5 s, never more
   than 30 s). A pass on the retry is a PASS whose detail says `recovered on the single retry after Ns (first attempt: ...)` and
   which also prints a `::notice` (never an error). A failure on the retry is the failure, with both attempts stated. There is
   never a third attempt. Other 4xx (403, 404) are configuration errors and fail at once.
5. **A finished game is not an outage (GAME_OVER).** The feed (published every ~3.5 min, cached up to 5) can list contracts as open that
   Kalshi already reports closed. A fresh HTTP 200 whose returned markets all report a non-trading status (`closed`, `determined`, `settled`,
   `finalized`/`finalised`, `expired`, `paused`, ... or a non-empty `result`) is a PASS saying `GAME_OVER` (a `::notice`, one request per game,
   no retry, never an error). If the batch also holds tradable markets, the closed ones are noted and not asserted; a game whose markets are all
   closed makes the monitor try the next game for a tradable one. The answer must still be fresh: an old or untimed observation, a non-200 or an
   outage fails as ever, and an empty answer for every game still fails. (Same status words as `src/live/tradable.ts`; a test keeps them equal.)
6. **No memory between runs.** The monitor writes nothing and reads no earlier result. A system that has recovered passes on
   its very next run and the output carries no trace of the earlier outage. (A 15-minute schedule therefore alerts at most once
   per bad run, and a single bad run does not repeat itself.)

## 1. Failure injection that cannot touch production

### 1a. The local drill (fake feed, fake relay, real monitor)

```
node scripts/quote-monitor-drill.mjs --list
node scripts/quote-monitor-drill.mjs                    # all 19 scenarios
node scripts/quote-monitor-drill.mjs outage healthy     # an outage, then the very next run after recovery
```

It starts a server on `127.0.0.1` only (the monitor accepts a plain-http relay URL for loopback addresses and nowhere else),
points the monitor at it through `SIFT_FEED_URL` and `SIFT_QUOTE_RELAY_URL`, shortens the timings with the monitor's own
overrides (`SIFT_MONITOR_POLL_S=0.2`, `SIFT_MONITOR_SEQUENCE_WINDOW_S=3`, `SIFT_MONITOR_RETRY_DELAY_S=0.3`) and checks that each
scenario reaches the verdict the rules above specify. Exit 0 means every scenario matched; a monitor that correctly FAILs an
outage is a drill pass.

| Scenario | Fake world | Monitor must |
| --- | --- | --- |
| `healthy` | fresh feed, heartbeat advancing, relay young | PASS |
| `feed-stale` | `generated_at` 30 min old | FAIL `Feed generated_at is recent` |
| `heartbeat-stalled` | sequence never moves | FAIL `Heartbeat sequence advances` |
| `heartbeat-missing` | `health.json` 404 | PASS, `HEARTBEAT_NOT_PUBLISHED` |
| `heartbeat-missing-required` | same, `SIFT_MONITOR_REQUIRE_HEARTBEAT=1` | FAIL |
| `outage` | relay HTTP 503 every time | FAIL, 2 relay requests (one retry) |
| `unreachable` | relay drops the connection | FAIL |
| `relay-429` | 429, `Retry-After: 1`, every time | FAIL, Retry-After reported |
| `relay-429-once` | 429 once, then fine | PASS, recovered on the retry, a notice |
| `relay-flaky` | 503 once, then fine | PASS, recovered on the retry, a notice |
| `relay-stale` | HTTP 200, observation 300 s old | FAIL (`is 301s old; limit 60s`) |
| `relay-empty` | HTTP 200, no markets | FAIL after one retry |
| `relay-delisted-game` | first game's contracts gone, second game answers | PASS, empty game named |
| `all-games-delisted` | both games empty | FAIL, 4 relay requests (2 games, twice) |
| `no-open-contracts` | every contract closed | PASS with the relay check `SKIP` |
| `relay-partial` | relay omits one requested market | PASS, `2 of 3 requested markets` |
| `relay-game-over` | feed says open, relay says every market `finalized` | PASS, `GAME_OVER`, a notice, no retry |
| `relay-closed-among-open` | one market `finalized`, two `active` | PASS, the closed one noted, not asserted |
| `relay-first-game-over` | game A finalized, game B open | PASS from game B, game A named as over |

Expected output shape (this is real drill output; times differ):

```
=== scenario: healthy (the monitor is expected to PASS) ===
[PASS] Feed index readable: status CURRENT_SLATE, 1 game file(s), generated_at 2026-10-26T23:40:40Z
[PASS] Heartbeat readable: run 9001, sequence 1, cycle finished 2026-10-26T23:40:40Z, sweep 9000 ms, 70 requests
[PASS] Game file readable: games/26OCT26TORCGY.json: 3 markets, newest observation 35s old
[PASS] Feed generated_at is recent: newest generated_at 2026-10-26T23:40:40Z (index.json), 31s old; limit 600s
[PASS] Heartbeat sequence advances: run 9001 sequence 1 -> run 9001 sequence 2 after 0s
[PASS] Relay quote batch: HTTP 200, 3 of 3 requested markets from games/26OCT26TORCGY.json, newest observation 3s old; limit 60s
RESULT: PASS
DRILL OK: the monitor reached the specified verdict

=== scenario: outage (the monitor is expected to FAIL) ===
...
[FAIL] Relay quote batch: relay answered HTTP 503 for 3 tickers: {"error":"upstream"}; the same on the single retry after 0s
::error title=Quote monitor: Relay quote batch::relay answered HTTP 503 ...
RESULT: FAIL
DRILL OK: the monitor reached the specified verdict

--- drill summary ---
DRILL PASSED: 3 of 3 scenarios matched
```

### 1b. Forcing a failure against the real, read-only endpoints (still no write, no production change)

The monitor only ever issues GETs. These overrides make its thresholds impossible to meet, so it fails on purpose while
reading the real feed and relay exactly as the scheduled run does:

| To prove | Run with | Expected |
| --- | --- | --- |
| it alerts on a stale feed | `SIFT_MONITOR_FEED_MAX_AGE_S=1` | `[FAIL] Feed generated_at is recent: ... Ns old; limit 1s` |
| it alerts on a stalled heartbeat | `SIFT_MONITOR_SEQUENCE_WINDOW_S=1` (needs a published `health.json`) | `[FAIL] Heartbeat sequence advances: run R is still at sequence S` |
| it alerts on an old relay observation | `SIFT_MONITOR_RELAY_MAX_AGE_S=0.001` | `[FAIL] Relay quote batch: ... newest observation ... old; limit 0s` (retried once, so it reads `the same on the single retry` or states both attempts) |
| it alerts on an unreachable relay | `SIFT_QUOTE_RELAY_URL=https://sift-quote-relay-drill-does-not-exist.vercel.app` | `[FAIL] Relay quote batch: relay unreachable: ...` |

Locally: `SIFT_QUOTE_RELAY_URL=<relay base> SIFT_MONITOR_FEED_MAX_AGE_S=1 node scripts/quote-monitor.mjs; echo $?` prints the report
and exits 1. From a machine with network access this is a read-only check of the real relay and feed from your network. It does
not show that a GitHub-hosted runner can reach them; section 2 does.

## 2. The staged CI drill on a GitHub-hosted runner (run, with the owner's authorisation)

**Plainly: `workflow_dispatch` only starts a workflow whose file exists on the default branch.** The real `quote-monitor.yml` therefore
cannot be dispatched, and its `schedule` cannot fire, before this PR merges. What was run instead is a throwaway branch
`claude/quote-drill` (based on `claude/quote-track`) whose only addition is `.github/workflows/quote-drill.yml`, triggered by a `push` to
that one branch (and by `workflow_dispatch`, which will not work from a non-default branch). It is not part of this PR and was not
merged anywhere; the branch is kept for the owner to read and delete.

| Property | Value |
| --- | --- |
| Trigger | `push` to `claude/quote-drill` only (plus `workflow_dispatch`); no schedule, no other branch |
| Permissions | `contents: read` only; no secret, no token; the only `${{ }}` reference is `vars.SIFT_QUOTE_RELAY_URL` |
| Concurrency / limit | own group `quote-drill`; `timeout-minutes: 45` |
| What it touches | GET only: the public feed (`live-quotes` branch on raw.githubusercontent.com), the deployed relay (`SIFT_QUOTE_RELAY_URL`), deliberately wrong hosts and paths, and a fake relay on 127.0.0.1 inside the runner |
| Command | `node scripts/quote-monitor-drill.mjs --ci` (the local drill script, extended; `--stages=2,3` runs only those) |
| Verdict | exit 0 only when EVERY stage matched its expectation; otherwise exit 1, an `::error title=Quote drill: stage N did not match (...)` per failed stage, and the step summary table names the item |
| Output | job log in `::group::` blocks per stage; a markdown table in the step summary; one `::notice` per stage with the observed result of every item (readable from the check-run annotations even where the log cannot be fetched). The monitor's own `::error` lines are neutralised so a forced failure never becomes an annotation on a green run |

The stages and what each asserts (the script asserts them, not the reader):

| # | Stage | Expectation, asserted by the script |
| --- | --- | --- |
| 1 | healthy, real relay and real feed | monitor PASS (or PASS with `HEARTBEAT_NOT_PUBLISHED`), feed index and freshness pass, and the relay check actually PASSED (a skipped relay check is a mismatch, an unset `SIFT_QUOTE_RELAY_URL` is a named mismatch) |
| 2 | forced outage against the real relay URL | five forced failures, each must FAIL with its own diagnosis: unroutable host (`relay unreachable: ... ENOTFOUND`, retried once), a black-holed address (`relay unreachable`, timeout, retried once), a wrong path on the real relay host (`relay answered HTTP 4xx`), an impossible relay freshness limit (`newest observation ... old; limit 0s`), an impossible feed limit (`Feed generated_at is recent ... limit 1s`) |
| 3 | forced 429, empty, delisted, closed, partial (loopback fake relay) | 13 scenarios inside the runner, each with its specified verdict: 429 every time (FAIL, Retry-After reported), 429 once and 503 once (PASS on the single retry), outage, stale, empty, delisted game with another answering (PASS), all games delisted (FAIL), no open contract (SKIP), partial (PASS `2 of 3`), game over (PASS `GAME_OVER`), a closed market among open (PASS, noted), first game over (PASS from the second) |
| 4 | recovery | loopback: outage then healthy, the healthy run mentions no failure, retry, notice or error; real: relay and feed again after the forced failures, PASS, relay check pass, no `[FAIL]` and no `::error` |
| 5 | heartbeat on the real feed branch | `health.json` absent: the heartbeat check is the distinct non-failing note `HEARTBEAT_NOT_PUBLISHED`, and only with `SIFT_MONITOR_REQUIRE_HEARTBEAT=1` does the same feed fail on it; `health.json` present: it is readable and its sequence advances. Plus, deterministic on the loopback: heartbeat missing (PASS), stalled (FAIL), missing and required (FAIL). Judged on the heartbeat alone, not on feed freshness |

### What was observed

Run ids are read anonymously with `gh api repos/chmoses98/sift-sports-intelligence/actions/runs?branch=claude/quote-drill`. The job log
itself is NOT readable anonymously (the log download answers 403 `Forbidden`), so what follows comes from the run and job `conclusion`,
the step timings, and the check-run annotations (the per-stage notices above), which are readable.

| Run | Commit | Conclusion | What it shows |
| --- | --- | --- | --- |
| [40561848896](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40561848896) | `91a0baf8` | success (step "Run the five stages" 23 s) | First run. All five stages matched (a mismatch exits 1). Per-stage detail was not yet in the annotations (added afterwards), so this run proves only the verdict. It ran 9 minutes after the last feed publish and passed the 10-minute freshness limit by about a minute |
| [40568156310](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40568156310) | `57186efb` | **failure** (stages 1, 4, 5; stages 2 and 3 matched) | **A genuine finding, not a workflow bug.** The real feed's `generated_at` was `2026-10-27T19:07:37Z` when read at 19:26 (about 19 minutes old, limit 10): the monitor and the drill correctly refused to call it healthy. Cause: the `live-quotes` loop hands over to a new workflow run at the end of each ~55-minute loop, and that handover run ([40566266791](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40566266791)) was created at 19:07:40 and sat in the runner queue until about 20:02, behind the CI jobs of the many branches being pushed at the same time. The feed was therefore not updated for about 55 minutes (19:07:37 to 20:03:00). Stage 5 also failed here only because it used to demand an overall PASS; it now judges the heartbeat alone (fixed, not a relay problem) |
| [40574799848](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40574799848) | `189a9cbb` | **success** (step 23 s) | Fresh feed (loop restarted at 20:02). All five stages matched; observed results below |

Observed in run 40574799848 (check-run annotations, one notice per stage; the relay path is the `SIFT_QUOTE_RELAY_URL` repository
variable, which is set: the real relay answered):

- **Stage 1** matched: monitor `PASS_HEARTBEAT_NOT_PUBLISHED`; the real relay answered `HTTP 200, 25 of 25 requested markets from games/26NOV01ARIDAL.json,
  newest observation 1s old; limit 60s`. The real feed `index.json` read and fresh.
- **Stage 2** matched, five forced failures against the real feed and relay:
  unroutable host: `relay unreachable: getaddrinfo ENOTFOUND sift-quote-relay-drill-unroutable.invalid; the same on the single retry after 1s`;
  black-holed `192.0.2.1`: `relay unreachable: The operation was aborted due to timeout; the same on the single retry after 1s`;
  wrong path on the real relay host: `relay answered HTTP 404 for 25 tickers: {"error": {"code": "404", "message": "The page could not be found"}}` (the host is a Vercel deployment;
  no retry, a 4xx is a configuration error);
  impossible relay limit: `relay answered HTTP 200 but its newest observation (2026-10-27T20:04:57Z) is 22s old; limit 0s (25 markets); the single retry ... failed too`;
  impossible feed limit: `Feed generated_at is recent: newest generated_at is 2026-10-27T20:03:00Z (index.json), 139s old; limit 1s`.
- **Stage 3** matched, all 13 loopback scenarios, including `relay-429` (`HTTP 429 (Retry-After 1) ... the same on the single retry after 1s`), `relay-429-once` and
  `relay-flaky` (`recovered on the single retry`), `relay-empty`, `all-games-delisted`, `relay-delisted-game` (PASS), `no-open-contracts` (SKIP), `relay-partial` (`2 of 3 requested markets`),
  `relay-game-over` (`GAME_OVER: HTTP 200 with a current observation ...`), `relay-closed-among-open` and `relay-first-game-over`.
- **Stage 4** matched: loopback outage then the very next run PASS with no trace; real relay and feed again after the five forced failures: `PASS_HEARTBEAT_NOT_PUBLISHED`,
  `25 of 25 requested markets ... newest observation 0s old`.
- **Stage 5** matched: on the real feed branch `health.json` is **not published** (`HEARTBEAT_NOT_PUBLISHED`, reported as a note and an overall `PASS_HEARTBEAT_NOT_PUBLISHED`, not a failure);
  with `SIFT_MONITOR_REQUIRE_HEARTBEAT=1` the same feed fails (`health.json does not exist on the live-quotes branch (HTTP 404) and SIFT_MONITOR_REQUIRE_HEARTBEAT is set`);
  loopback stall and missing-required detected.

What could not be read: the job log text (403 anonymously), the step summary table (not exposed by the API) and the first run's per-stage detail. The real relay's
response headers and body for the batch were not seen directly, only the monitor's report of them. Nothing here shows email delivery, the `schedule` trigger,
or a `workflow_dispatch`.

**Finding for the owner (worth acting on whatever happens to this PR).** The `live-quotes` loop depends on GitHub starting its handover run promptly, and the runner pool
is shared with the CI jobs of every pushed branch. On 2026-10-27 that handover waited about 55 minutes and the production feed stopped updating for the same time. The monitor
in this PR is what would have paged for it (feed `generated_at` more than 10 minutes old). Reducing CI fan-out on `claude/*` branches, or a separate concurrency pool or
self-hosted runner for `live-quotes`, are the levers; none was touched here (`live-quotes.yml` is untouched).

Local proof of the drill logic (no network): `tests/live/quote-drill-ci.test.ts` (11 tests: every stage against a loopback stand-in for the
real relay and feed, mismatches fail and name the stage, a forced failure that unexpectedly passes is caught, stage 5 independent of feed
freshness, the markdown summary, the `--ci` command line and exit codes) and `tests/live/quote-drill-workflow.test.ts` (5, on the drill
branch only: the workflow text is read-only, secret-free, push-to-branch-only, own concurrency group, timeout).

Clean-up (owner): `git push origin --delete claude/quote-drill`. The branch also triggers `ci.yml` (its `branches-ignore` is `[main,
live-quotes]`), as every non-main branch does.

## 3. Heartbeat verification in the real publishing loop

Precondition (owner decision): the heartbeat is produced by `scripts/publish-live-quotes.mjs`, which `live-quotes.yml` checks out
from the ref it runs on. The running loop uses the `main` copy, so `health.json` appears only after this PR is merged and the
next loop starts (the current loop hands over to a new run within about 55 minutes). I recommend waiting for that natural
hand-over. Dispatching `live-quotes.yml` against another ref is possible (`gh workflow run live-quotes.yml --ref claude/quote-track`)
but runs the loop from the branch, writes to the production `live-quotes` branch, and its "Dispatch the next loop" step only runs
on `main`, so the chain would not continue from it; not recommended.

Once it is live, read the file a reader reads (CDN cache is up to 5 minutes, so sample every ~4 minutes):

```
curl -s https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes/health.json \
  | jq '{schema, run_id, sequence, generated_at, cycle_started_at, cycle_finished_at, sweep_duration_ms, requests, errors, status, last_success_at, previous_success_at, loop_started_at}'
curl -s https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes/index.json | jq '{schema, generated_at, status}'
```

What proves the sequence advances (expected, from the publisher code and `tests/live/feed-heartbeat.test.ts`; unproven until
you see it live):

| Observation | Meaning |
| --- | --- |
| `schema` is `sift.live_quotes.health.v1` and `index.json` keeps `sift.live_quotes.index.v1` | additive file; feed schema unchanged |
| `sequence` is higher on each fresh read within the same `run_id`, by 1 per cycle (about every 211 s; a read may repeat the previous value while the CDN cache is warm) | the loop is publishing; this is exactly what the monitor tests |
| `generated_at` equals `index.json`'s `generated_at` and moves forward with each new sequence | the heartbeat describes the same cycle as the feed |
| `previous_success_at` equals the earlier read's `last_success_at` | no cycle was skipped between two reads |
| when the loop hands over (about every 55 minutes): `run_id` changes, `loop_started_at` changes, `sequence` restarts at 1 | the dispatch chain continued; the monitor counts a new `run_id` as advancing |
| `sequence` jumps by more than 1 between two reads, or `previous_success_at` differs from the earlier read's `last_success_at` | cycles ran in between (a read can span several cycles), or a cycle advanced the sequence and then its `git push` failed (the loop state is saved before the push; known, README open question 5) |
| `sequence` stuck while `generated_at` is also stuck for more than 10 minutes | a stall; the monitor fails (`Heartbeat sequence advances`) and the stale feed (`Feed generated_at is recent`) |

The same check automated: `node scripts/quote-monitor.mjs` (or the Actions run from section 2) prints
`[PASS] Heartbeat sequence advances: run R sequence S -> run R sequence S+1 after Ns`. Then set the repository variable
`SIFT_MONITOR_REQUIRE_HEARTBEAT=1` (owner action) so a later disappearance of `health.json` fails instead of noting.

## 4. Proven versus unproven

| | State |
| --- | --- |
| Every monitor rule above: thresholds and boundaries, one retry, 429 with Retry-After (capped), unusable 200s, partial answer, empty and delisted games, closed contracts not asserted, **a finished game is not an outage (GAME_OVER)**, no-open-contract skip, recovery on the next run with no false alarm, heartbeat advance, stall, jump, backwards, new run id, disappearance, window edge | **Proven in tests** (injected fetch, clock, sleep): `tests/live/quote-monitor.test.ts` (95) |
| The same rules end to end through the real script as a child process against a local fake feed and relay, including an outage followed by recovery | **Proven locally**: `tests/live/quote-monitor-drill.test.ts`, `node scripts/quote-monitor-drill.mjs` (19 scenarios) |
| The staged drill logic (all five stages, mismatch naming, unexpected pass caught) | **Proven locally** against a loopback stand-in: `tests/live/quote-drill-ci.test.ts` (11) |
| The monitor on a GitHub-hosted runner reading the real feed (`raw.githubusercontent.com`) and the real deployed relay | **Proven**: runs [40561848896](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40561848896) and [40574799848](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/40574799848) (stage 1: `25 of 25 requested markets`, observation 1 s old) |
| Detection of a real outage from a runner: unroutable host, black-holed address, wrong path (the relay's host answers HTTP 404), impossible freshness limits | **Proven** in run 40574799848, each with its own diagnosis |
| Detection of a real stall of the production feed | **Proven by accident, in production**: run 40568156310 failed on a feed 19 minutes old, caused by the `live-quotes` handover waiting about 55 minutes in the runner queue (section 2) |
| Recovery with no false alarm | **Proven** (loopback outage then healthy, and the real relay and feed passing again after the forced failures, run 40574799848); and run 40574799848 itself passed on the feed once the loop restarted |
| Distinct non-failing `HEARTBEAT_NOT_PUBLISHED` on the real feed branch, and the strict switch | **Proven** in run 40574799848 (`health.json` absent on the `live-quotes` branch) |
| The workflow file (read-only permissions, no secrets, push-to-branch-only, concurrency, timeout) | **Proven by static tests** (`quote-drill-workflow.test.ts` on the drill branch, `quote-monitor-workflow.test.ts` for the real monitor) and by the run itself (`contents: read`, no token) |
| `quote-monitor.yml` itself, its `schedule`, its `workflow_dispatch`, `vars.SIFT_MONITOR_REQUIRE_HEARTBEAT` wiring | **Unproven; cannot be run before merge** (default-branch rule above). The drill ran the same script with the same relay variable |
| The deployed relay's response headers and body for `tickers=` batches under the delivery chain | **Partly proven**: HTTP 200 with a usable `X-Sift-Observed-At` and all 25 requested markets, as the monitor reads them; the body and headers were not otherwise inspected, and a closed or finalised market has not been observed from the real relay |
| The heartbeat inside the real `live-quotes` loop: `$RUNNER_TEMP` loop-state survival between cycles, handover run ids, real push cadence | **Unproven.** `health.json` is absent on the `live-quotes` branch today (run 40574799848). Needs section 3 after the owner merges |
| Email delivery on a failed scheduled run | **Unproven** (a GitHub account setting). The drill's failing stage 1 in run 40568156310 failed the job; whether an email followed was not observed |
