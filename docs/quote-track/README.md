# Quote delivery track: items 1 to 3

Branch `claude/quote-track`, based on `origin/main`. Separately reviewed from the SIFT 3.0 UI work. The specification is
`docs/sift3/QUOTE_DELIVERY.md` on the UI branch (`claude/sift3-build`); it is deliberately not copied here.

Nothing in this branch is deployed. Merging it changes no production behaviour until the monitor workflow is on the
default branch and the publisher change is picked up by the next `live-quotes` loop.

Product rule that governs all of it: users see clean, automatically updating Kalshi prices. There is no freshness text,
badge, age or "last updated" anywhere. When no reliable quote exists the price is withheld. Everything below is internal.

## What changed

### Item 1: relay-first refresh and the shared usability rule (`src/live`)

| Piece | Where | What it does |
| --- | --- | --- |
| `quoteUsable(quote, context, now, { clockSkewMs? })` | `src/live/quoteUsable.ts` (new) | The one display rule. Pure. Returns `{ usable, reason, ageMs, limitMs, context }`. |
| Max-age table | same | list >2 h 180 s, list <=2 h 90 s, list live 60 s, contract >2 h 60 s, contract <=2 h or live 30 s. |
| Availability meter | `src/live/availability.ts` (new) | Counts every price-slot render: context, usable, provider, observation age. Reports availability % and p50/p95 age per context and per provider. Bounded memory. |
| Scopes | `QuoteStore.addRowsScope / addContractScope / addSlateScope` | Visible rows at `game` (45 s), selected contract at `detail` (20 s), list-wide feed data at `slate` (90 s). Rows are capped at 200 tickers (two batches). |
| Contract open | `QuoteStore.refreshContract(ticker, ctx)` | `refreshNow([ticker])` relay first, feed second, inside the existing 8 s bound (the relay gets 4 s of it). Returns the quote only if it passes `quoteUsable`. |
| Display | `QuoteStore.renderQuote(ticker, ctx)` | Returns the quote or `null` (the screen shows the missing-price state) and feeds the meter. |
| Outcome history | `QuoteStore.refreshHistory()`, `diagnostics().lastOutcome` | Last 200 provider calls: provider, fallback reason, latency, observation age, outcome (`ok`, `over_limit`, `rate_limited`, `timeout`, `error`). In memory only. |
| Chain behaviour | `src/live/providers/fallback.ts` | Opt-in per call: a 200 whose newest observation is over the limit is a failed refresh and the next provider is asked; an earlier provider is abandoned after `primaryTimeoutMs`; with `honourRetryAfter` a provider that answered 429 is not asked again until its Retry-After elapses. |
| Relay provider | `src/live/providers/kalshi.ts` | A relay answer without `X-Sift-Observed-At` is marked `observedVia: 'received'` (arrival time is not an observation time) and is never usable. Reports relay-clock minus device-clock from the `Date` header when readable. |

Rules as implemented (every one has a test):

- Age is `now - observed_at` on the quote's own observation time. HTTP status and request time play no part.
- Exactly at the limit is usable; one second over is not.
- Rejected: missing or unparseable `observed_at`, an untimed observation, or one more than 5 s in the future of the device clock after skew correction. Up to 5 s ahead counts as age 0.
- Start-time tier comes from the schedule the caller passes (`startsAt`, `live`). Exactly 2 h before start is "within 2 hours". A start time in the past is live. An unknown or unparseable start falls to the stricter "within 2 hours" tier. Kalshi event metadata and contract close time are never read.
- A 200 whose newest observation is over the limit is a failed refresh. An older observation never replaces a newer one: already true in `QuoteStore.accept` and `overlay.ts`; verified by `tests/live/quoteNewerWins.test.ts`, not changed.
- Legacy scopes (no `context`) are refreshed exactly as before: no policy is sent to the provider. `src/live/freshness.ts` is untouched and stays for ChatGPT packets only.

### Item 2: feed heartbeat (`scripts/`)

`scripts/publish-live-quotes.mjs` now also writes `health.json` (schema `sift.live_quotes.health.v1`) beside `index.json`
on every successful cycle. Fields: `generated_at` (equal to the feed's), `run_id`, `run_attempt`, `loop_started_at`,
`sequence`, `cycle_started_at`, `cycle_finished_at`, `sweep_duration_ms`, `requests`, `errors`, `status`,
`excluded_sports`, per-sport `sports[]` (status, published, games, markets), `last_success_at`, `previous_success_at`.

The workflow is unchanged, and each cycle is a separate `node` process, so the loop state (run id, loop start, sequence,
last success) is kept in a small file next to the feed tree in `$RUNNER_TEMP`, which the workflow does not delete between
cycles. A new `GITHUB_RUN_ID` (the dispatch chain handing over) or an unreadable state file starts a new loop at
sequence 1. A failed cycle writes nothing, so a stall shows as a stale file.

File addition only: `sift.live_quotes.v1`, `index.json` and the per-game files are byte-for-byte what `buildFiles` always
produced (tested), and consumers ignore unknown files.

### Item 3: independent monitor (`.github/workflows/quote-monitor.yml`, `scripts/quote-monitor.mjs`)

Every 15 minutes (`7,22,37,52`, off the hour to avoid the scheduler peak) plus `workflow_dispatch`. `permissions:
contents: read`, no secrets, no writes, its own concurrency group `quote-monitor`. It fails the run when:

| Failure row | Check |
| --- | --- |
| Feed unreachable, or not the expected schema | index.json read with one retry |
| Newest feed `generated_at` (index, heartbeat, one game file) more than 10 min old | exactly 10 min passes, 10 min 1 s fails |
| Heartbeat sequence has not advanced | health.json re-read every 30 s for up to 9 min; a new `run_id` or a higher sequence counts |
| Relay not HTTP 200 | including 429 (reports Retry-After) and unreachable |
| Relay answers only with observations older than 60 s | measured on `X-Sift-Observed-At`; exactly 60 s passes |

Choices made, per the spec's intent:

- The sequence window is 9 minutes because the feed publishes about every 3.5 minutes (measured 211 s) and
  raw.githubusercontent.com caches for up to 5: a healthy loop shows a new sequence within about 8.5 minutes. The monitor
  stops waiting as soon as it moves, and does not wait at all if the feed is already stale. The monitor keeps no state
  between runs (it may not write), so "advanced" is judged within one run.
- Heartbeat not published yet (the state on the live branch today: `health.json` returns 404): reported as the distinct
  state `HEARTBEAT_NOT_PUBLISHED`, printed as `NOTE`, with a `::notice` annotation and the verdict `PASS (heartbeat not
  published yet: not a failure)`. Feed freshness is still judged from `index.json`. After the heartbeat is deployed, the
  owner sets repository variable `SIFT_MONITOR_REQUIRE_HEARTBEAT=1` and a missing `health.json` becomes a failure.
- Relay part skipped (printed as `SKIP`, never as a pass) when `SIFT_QUOTE_RELAY_URL` is unset, or when the feed lists no
  game to take tickers from (a quiet day is not an outage). A relay URL that is set but not https fails loudly.
- One relay batch of up to 25 open tickers from the game file, with the SIFT `Origin`.

## Call-volume math

Pure arithmetic from the spec's figures; no Kalshi calls were made.

Per active user (tab visible):

| Source | Cadence | Requests per hour |
| --- | --- | --- |
| Visible rows (about 30 tickers, one batch of at most 100) | 45 s | 3600 / 45 = **80** |
| Selected contract, while open | 20 s | 3600 / 20 = **180** (3 per minute) |
| Contract opened (forced refresh) | once per open | 1 |
| List-wide background data | 90 s, feed only (raw.githubusercontent.com) | 0 relay |

- Rows plus an open contract: 80 + 180 = **260 relay invocations per user-hour**; rows only: 80.
- Vercel Hobby, 1,000,000 invocations a month: 1,000,000 / 80 = **12,500 user-hours** of browsing rows only (the spec rounds to about 12,000); 1,000,000 / 260 = **3,846 user-hours** if every hour also had a contract open the whole time.
- The rows cap bounds the worst case: 200 tickers is 2 batches, so at most 160 requests per hour from rows. Polling the whole 902-contract universe would be 10 batches per cycle = 800 per hour per user; it is never done.
- Hidden or offline tabs send nothing, so these are upper bounds.
- A relay 429 adds no relay load: the relay is skipped for the `Retry-After` period (30 s if absent) and the feed answers.
- Monitor: 96 runs a day, one relay batch each = **4 relay requests an hour**; per run about 3 feed reads plus up to 18 heartbeat re-reads (9 min at 30 s), all GETs of public files.
- Heartbeat: zero extra Kalshi requests; one extra file of about 1 KB in each push. The publisher's own sweep is unchanged (103 requests at the last public read of `index.json`, every ~3.5 min).

Not covered by the arithmetic above, see open questions: Kalshi's per-IP budget at many concurrent users.

## Failure behaviour, demonstrated by tests

All in `tests/live/quoteStore.test.ts` unless noted (fake clock, no network).

| Situation | Behaviour | Test |
| --- | --- | --- |
| Contract opens, relay answers | relay quote, feed never asked, outcome `ok` | "relay success" |
| Relay 429 with Retry-After | feed answers; relay not asked again until Retry-After elapses, then asked again | "relay 429: honours Retry-After" |
| Relay 429 and the feed's observation is over the limit | feed answers but nothing is displayed (`usable: false, too_old`, `quote: null`); Retry works once the relay is back | "relay 429 and the feed is older than the limit" |
| Relay hangs | abandoned after 4 s; feed answers inside the 8 s bound | "relay timeout" |
| Relay HTTP 200 with old data | counted as a failed refresh, feed asked, stale relay price never shown | "relay 200 with OLD data" |
| Both sources over the limit | unusable, outcome `over_limit` | "both sources too old" |
| Both fail | unusable (`no_quote` or `too_old`), error reported, an aged-out earlier price is not resurrected | "both failing" (two tests) |
| Both hang | call returns by 8 s | "bounded at 8 s" |
| Hidden tab | nothing sent; quote ages out and is withheld; refreshes immediately on visible/online | "pause when hidden" |
| Relay answer without `X-Sift-Observed-At` | never usable | "without the header" |
| Device clock wrong by 10 min | corrected through the relay `Date` header when readable (see open questions) | "the store applies the skew" |
| Scope registration, caps, cadences, batching at 100 | rows 45 s, contract 20 s, slate 90 s, 200-ticker cap | "scope registration" |
| Legacy scopes | no policy sent; old relay 200 accepted as before | "legacy scopes" |
| Monitor, every row | `tests/live/quote-monitor.test.ts` (33 tests incl. CLI exit codes) | |
| Heartbeat shape, sequence, file addition | `tests/live/feed-heartbeat.test.ts`, including a run of the real publisher script on a stubbed network and clock | |

## Production isolation

Files changed (20 code and test files plus this document):

```
.github/workflows/quote-monitor.yml        new
scripts/quote-monitor.mjs                  new
scripts/quote-monitor.d.mts                new
scripts/publish-live-quotes.mjs            heartbeat added (health.json + loop state)
scripts/live-quotes/lib.mjs                HEALTH_SCHEMA, advanceLoop, buildHeartbeat added (buildFiles untouched)
scripts/live-quotes/lib.d.mts              types for the above
src/live/quoteUsable.ts                    new
src/live/availability.ts                   new
src/live/store.ts                          scopes, refreshContract, renderQuote, history, meter
src/live/types.ts                          optional fields and FetchOptions; 'stale' error kind
src/live/providers/fallback.ts             opt-in policy (see below)
src/live/providers/kalshi.ts               untimed marking and Date-header skew
src/live/config.ts                         honourRetryAfter: true on the production chain
tests/live/quoteUsable.test.ts, quoteStore.test.ts, quoteNewerWins.test.ts,
  feed-heartbeat.test.ts, quote-monitor.test.ts, quote-monitor-workflow.test.ts   new
tests/live/support/publisher-preload.mjs   new
docs/quote-track/README.md                 new
```

Confirmed untouched: `.github/workflows/live-quotes.yml`, everything under `relay/`, `src/live/preflight.ts` and the packet
path, `src/live/freshness.ts`, `src/live/overlay.ts`, `src/v3`, the v4 screens, `docs/sift3/`. No repository variable is
read or changed by code in this branch other than the monitor reading `SIFT_QUOTE_RELAY_URL` and
`SIFT_MONITOR_REQUIRE_HEARTBEAT` at run time. The relay endpoint (item 4) is not built.

Two shared-code behaviours do change at runtime, and the owner should know:

1. The production provider chain (`src/live/config.ts`) now sets `honourRetryAfter`. The packet preflight uses the same
   chain: after a relay 429 it will go straight to the feed for the Retry-After period instead of asking the relay again
   first. The outcome it receives (the feed's answer, carrying its true observation time) is the same as before; only the
   repeated relay call is skipped. Preflight code and its tests are unchanged and pass.
2. Quotes from a relay answer that lacks `X-Sift-Observed-At` now carry `observedVia: 'received'`. Nothing that exists today
   reads that field; only `quoteUsable` does.

Everything else is opt-in by passing a `context` to a scope: legacy scopes send no policy to the providers.

## Verification

- `npx tsc -b`: clean. `npx eslint .`: clean.
- `npx vitest run`: 145 files passed, 3 skipped; 1760 tests passed, 3 skipped, 0 failed.
- New tests: 124 (quoteUsable 42, quoteStore 30, newer-wins 2, heartbeat 10, monitor 33, workflow 7).
- Read-only check of production, once: `health.json` on the `live-quotes` branch answers 404 (so the monitor's
  heartbeat-not-published state is the real state today); `index.json` was 111 s old; the monitor run against the live feed
  passed its feed checks. The relay could not be reached from this environment (DNS `ENOTFOUND` for the relay host), so the
  relay half of the monitor has only been exercised against fakes, not the live relay.
- Not run: component tests for the missing-price states (they belong to the UI branch), a real GitHub Actions run of
  the monitor workflow (nothing may be triggered), and the heartbeat inside the real loop.

## Open questions for the owner

1. **The relay does not expose `Date` cross-origin.** `relay/core.ts` exposes only `X-Sift-Observed-At, Retry-After`. A
   browser therefore cannot read the relay's `Date`, and the device-clock correction is inactive in production until the
   relay adds `Date` to `Access-Control-Expose-Headers` (a one-line relay change; this track does not touch `relay/`).
   Until then a device clock more than 5 s ahead rejects good relay quotes as old and one more than 5 s behind rejects them as
   future: the safe direction, but a user with a badly wrong clock would see "—".
2. **Kalshi per-IP budget at scale.** Per-user relay requests are distinct ticker sets, so the relay's 5 s identical-read
   sharing helps little. At about 3 requests a second of refill, rows-only users (0.022 req/s each) saturate at about 135
   concurrent users and rows-plus-contract users (about 0.072 req/s) at about 40. This is exactly the case for the item 4 bulk
   endpoint; it does not matter at current traffic. Worth deciding the target concurrency.
3. **Thresholds are the spec's initial values.** The table is configuration in one place (`MAX_AGE_MS`); the availability meter
   is how to validate it, but nothing consumes the meter yet (no UI in this branch).
4. **Unknown start time falls to the stricter tier.** Chosen so a missing schedule can only tighten the rule. Say if you
   want the looser "far" tier instead.
5. **Sequence semantics.** The sequence counts cycles that produced a feed within one run; it restarts at 1 for each new run
   (each ~55 minute loop). If a cycle builds its feed but the later `git push` fails, the sequence still advanced. The monitor
   treats a changed `run_id` as advanced.
6. **Monitor run length.** A stalled heartbeat makes a run last about 10 minutes (the 9 minute window); healthy runs end in a
   few minutes. Inside the 15 minute cadence and the 20 minute job timeout. Set `SIFT_MONITOR_SEQUENCE_WINDOW_S` shorter if
   preferred.
7. **Monitor false-alarm risk.** A relay `200` with no markets for tickers the feed lists is treated as a failure, and the
   relay check needs the feed's game file; both are deliberate but the first could fire if Kalshi delists a settled game's
   contracts between a feed publication and the check.
8. **Wiring.** The v3 screens (`useGameExtras`, Prop Discovery, the contract sheet) still need to call `addRowsScope`,
   `addContractScope`, `refreshContract` and `renderQuote`; that is the UI branch's work and the missing-price states and
   their component tests live there.
9. **Enabling the monitor.** Scheduled workflows run only from the default branch, so nothing runs until this merges. After the
   heartbeat is live in the loop, set `SIFT_MONITOR_REQUIRE_HEARTBEAT=1`.
