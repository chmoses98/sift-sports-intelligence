# Quote delivery track: items 1 to 3, with the owner-required corrections applied

Branch `claude/quote-track`, based on `origin/main`, draft, separately reviewed from the SIFT 3.0 UI work. The specification is
`docs/sift3/QUOTE_DELIVERY.md` on the UI branch (`claude/sift3-build`); it is deliberately not copied here.

Nothing in this branch is deployed, merged, dispatched or configured. No workflow was run and no repository variable was changed.
Merging it changes no production behaviour of the packet path (proved below); the monitor workflow runs only once it is on the
default branch, and the heartbeat appears only when the next `live-quotes` loop picks up the publisher change.

Product rule that governs all of it: users see clean, automatically updating Kalshi prices. There is no freshness text, badge,
age or "last updated" anywhere. When no reliable quote exists the price is withheld (a dash in a list, "Price unavailable right
now" with Retry on an exact contract). Everything below is internal.

Companion documents: `docs/quote-track/CI_DRILL.md` (running the monitor in GitHub Actions, failure injection, heartbeat
verification, proven versus unproven).

## What the corrections changed

| # | Correction | Result |
| --- | --- | --- |
| 1 | Isolate the new behaviour from the production chain | `src/live/config.ts` and `src/live/providers/fallback.ts` are **identical to `origin/main`** (`git diff origin/main -- <file>` is empty). The relay-first, per-ticker, Retry-After behaviour lives in a separately constructed chain used only by the new UI-facing entry points. Characterisation tests written against main first, run there, then run unchanged here |
| 2 | Relay `Date` header | Not touched here (`relay/` is unchanged; handled on another branch). The client-side `clockSkewMs` code stays, now opt-in on the delivery chain only |
| 3 | Each REQUESTED ticker is accounted for | The delivery chain and the store judge every requested ticker on its own observation; partial, empty, stale-next-to-fresh, delisted and closed markets are tested for rows and for `refreshContract` |
| 4 | Monitor drill | One retry of a transient failure, an exact rule for empty and delisted markets, recovery with no false alarm, a local failure-injection drill, `CI_DRILL.md` |
| 5 | Approved age table, silent missing price, invisible diagnostics | Unchanged table; a test proves `renderQuote` returns the stored quote untouched or `null`, scans the new exports and the missing-price wording for freshness words, and proves nothing outside `src/live` refers to the new diagnostics |

## Item 1 (`src/live`): two chains, one store

```
packet preflight  ->  refreshNow([...])  (no context)           ->  production chain: FallbackProvider [relay, feed]   (as on main)
legacy scopes     ->  addScope({tickers, cadence})              ->  production chain
inventory         ->  addScope({events}) / addSlateScope         ->  production chain, feed first
rows on screen    ->  addRowsScope(tickers, ctx)                 ->  delivery chain: DeliveryProvider [relay, feed]
selected contract ->  addContractScope / refreshContract(...)    ->  delivery chain
```

| Piece | Where | What it does |
| --- | --- | --- |
| `quoteUsable(quote, context, now, { clockSkewMs? })` | `src/live/quoteUsable.ts` (new) | The one display rule. Pure. Returns `{ usable, reason, ageMs, limitMs, context }`. Also `assessTickers()`: judge each requested ticker against its own limit |
| Max-age table | same | Unchanged. list >2 h 180 s, list <=2 h 90 s, list live 60 s, contract >2 h 60 s, contract <=2 h or live 30 s |
| `DeliveryProvider` | `src/live/providers/deliveryChain.ts` (new) | Relay first, feed second, per requested ticker (below). Skips a relay that answered 429 until its Retry-After elapses. Abandons a hung relay after 4 s |
| `deliveryProvider()` | `src/live/deliveryConfig.ts` (new) | Builds the delivery chain from the same two public URLs as `config.ts`, as separate provider instances |
| Store | `src/live/store.ts` | `StoreOptions.deliveryProvider`; tickers in a scope **with a context** (and `refreshContract`) go to the delivery chain, everything else to the production chain. Backoff is **per chain**: a failing delivery chain never delays a packet preflight, and the reverse. Scopes, `refreshContract`, `renderQuote`, outcome history, availability meter as before |
| Relay provider | `src/live/providers/kalshi.ts` | `strictObservation` option, **off by default**: only the delivery chain's instance marks an answer without `X-Sift-Observed-At` as `observedVia: 'received'` (never usable) and reports the `Date` skew. With it off the provider is byte-for-byte main's behaviour (tested) |
| Wiring | `src/live/hooks.ts` | One line: the singleton store is built with `deliveryProvider: deliveryProvider()` beside the unchanged `provider: defaultProvider()` |
| Missing-price wording | `src/live/missingPrice.ts` (new) | The approved text in one place. Nothing in this branch renders it |
| Availability meter | `src/live/availability.ts` (new) | Counts every price-slot render: context, usable, provider, observation age; p50/p95 per context and provider. Bounded memory. Internal |

Rules as implemented (every one has a test):

- Age is `now - observed_at` on the quote's own observation time. HTTP status and request time play no part. Exactly at the limit is
  usable; one second over is not.
- Rejected: missing or unparseable `observed_at`, an untimed observation, or one more than 5 s in the future of the device clock after
  skew correction. Up to 5 s ahead counts as age 0.
- Start-time tier comes from the schedule the caller passes (`startsAt`, `live`). Exactly 2 h before start is "within 2 hours". A
  start in the past is live. An unknown start falls to the stricter tier. Kalshi event metadata and contract close time are never read.
- An older observation never replaces a newer one (`QuoteStore.accept`, `overlay.ts`; `tests/live/quoteNewerWins.test.ts`).
- `src/live/freshness.ts` is untouched and stays for ChatGPT packets only.

### Per requested ticker (correction 3)

`DeliveryProvider.fetchQuotes(tickers, signal, opts)` where `opts.maxAgeByTicker` carries each ticker's own limit:

1. Ask the relay for all requested tickers. Judge **each requested ticker** on its own observation (`assessTickers`): usable only if
   the answer holds an observation for that ticker, with a believable time, inside that ticker's limit. A fresh observation of another
   ticker in the batch, or of a ticker nobody asked for, proves nothing. Unrequested quotes are dropped.
2. Every requested ticker that is not usable (absent from a partial answer, an empty 200, stale, untimed, future-dated) is asked of the
   **next provider, and only those tickers**.
3. Results are merged per ticker, the **newest observation wins**; an untimed observation never beats a timed one; no observation time
   is ever changed or re-stamped.
4. A ticker no provider can supply a usable observation for is returned with its true (old) observation, or not at all, and reported
   as `missing`. It stays unusable: `renderQuote()` returns `null`, never an older quote passed off as current.
5. Only when no provider answered at all is an error thrown (the first provider's, which the scheduler's backoff is about). An
   answer, even a partial, stale or empty one, is returned and recorded. The store's outcome per call is `ok` (every requested ticker
   usable), `partial`, `over_limit` (answers held observations, none inside any limit), `no_quotes` (nothing for the requested
   tickers), or a failure kind; `RefreshResult.unusable` lists the unusable tickers.

## Evidence

### 1. The production chain behaves exactly as on main

`tests/live/productionChainCharacterisation.test.ts` drives the real production wiring (`defaultProvider()` from `config.ts` ->
`QuoteStore.refreshNow` -> `preflightQuotes` -> `packetLiveInputs` -> `buildPacket` -> `renderText`) over the real provider classes and
a fake network (relay and feed behind a stubbed `fetch`), on the real NFL snapshot (796 markets). Per step it pins the URLs asked
(order and counts), the quote kept per ticker (source, observation offset, price, availability), fallback provenance, every preflight
classification (`status`, `refreshed`, `failed`, `missing`, FRESH/AGING/STALE counts, oldest age, error), the packet notes and
sources, and a hash of the whole rendered packet. Scenarios: relay answers; relay 429 with Retry-After and two later refreshes inside
and after it; **recovery after Retry-After**; relay down then feed 404; relay 503 plus feed down after a good quote
(last-known-good keeps its true age); a relay 200 with 10-minute-old data; a partial 200; an empty 200; a relay answer without
`X-Sift-Observed-At`; inventory order (feed first, relay when the feed has no file).

Procedure and results:

1. Written first, in a scratch worktree of `origin/main` (`2f315261`): 10 tests, inline snapshots taken from main, then re-run without
   updating: **10 passed on main**.
2. The same file, unchanged, on this branch **before** the correction: **2 failed, 8 passed**. Both failures were the Retry-After
   scenarios (`honourRetryAfter: true` in `config.ts`): after a relay 429 the branch asked the relay once instead of on every refresh
   (1 relay call plus 8 feed calls against main's 8 relay plus 8 feed calls for the same step) and the fallback note read
   `... not asking kalshi-relay again for 60s (Retry-After)` instead of main's `rate_limited: rate limited (HTTP 429)`. This confirms
   the earlier claim that "the outcome is the same" needed proving, and that the characterisation test detects exactly this.
3. After the correction: **10 passed on the branch**, snapshots byte-identical to main's.

Also covered in `tests/live/quoteStore.test.ts`: a scope without a context is served by the production chain and receives no policy;
`refreshNow` without a context never touches the delivery chain; after a relay 429 the production chain asks the relay again; a
ticker on both a legacy and a context scope goes to the delivery chain while the legacy-only ticker does not; a failing delivery
chain does not put the production chain into backoff and the reverse; the relay provider without `strictObservation` marks nothing
and reports no skew.

### 2. Relay `Date` header

Not changed here. The client reads `Date` only when it is readable (it is not exposed cross-origin by the deployed relay today), so
the clock-skew correction is inert in production until the separately reviewed relay change lands. Tests: "the store applies the
skew" in `tests/live/quoteStore.test.ts`.

### 3. Missing requested tickers

`tests/live/quoteMissingTickers.test.ts` (27 tests, mutation-checked: replacing the per-ticker `pending` rule with the old
whole-batch rule fails 3 of them). For list rows and for `refreshContract`:

- **Partial batch**: relay omits U and V; the feed is asked for exactly `[U, V]`; merged per ticker; a ticker absent from both stays
  unusable and `missing`, the others display; contract: relay lacks it, feed supplies it / absent from both -> `missing`, `unusable`,
  `renderQuote` null.
- **Empty HTTP 200**: relay empty -> feed asked for all; both empty -> outcome `no_quotes`, no error, no backoff; relay empty plus feed
  503 -> no price, nothing thrown, both reasons recorded; relay empty then fresh feed -> quote.
- **Stale requested next to fresh unrelated**: relay returns T 10 min old plus a fresh unrelated ticker; U is fine; only T falls
  through to the feed; the unrequested quote is never kept; for `refreshContract` the same answer is unusable (the old whole-batch
  rule would have accepted it: freshest observation in the batch 0 s old); newest wins between two stale sources and an older
  observation never replaces a held one; stale on both is an answer (no error, no backoff) with every ticker counted unusable.
- **Delisted / closed**: delisted everywhere -> missing, neighbours unaffected; `refreshContract` on a market delisted after a good
  quote -> `too_old`, the held quote keeps its original `observedAt`; a closed market the relay still lists is a fresh observation
  (usable by age, `availability` stays `CLOSED` for the screen's own handling); a closed market only the feed holds from minutes ago
  is unusable.
- **`refreshContract` sources**: relay success; 429 (+ feed omits it, relay not hammered); timeout (+ feed returns only unrelated
  tickers); both failing (an aged-out earlier quote is not resurrected, `observedAt` unchanged); an untimed relay answer is not an
  observation, the feed is asked.
- Chain on its own: no observation time is changed; with no limits supplied the second provider is not asked; an untimed observation
  never beats a timed one; abort throws `aborted`; nobody answering throws the first provider's error.

### 4. Monitor

See `CI_DRILL.md` for the rules, the drill and the proven/unproven table. Tests: `tests/live/quote-monitor.test.ts` (63),
`tests/live/quote-monitor-drill.test.ts` (6, real child processes), `tests/live/quote-monitor-workflow.test.ts` (7).
`scripts/quote-monitor-drill.mjs` runs 15 scenarios against a loopback fake feed and relay: **15 of 15 matched**.

### 5. Invisible diagnostics

`tests/live/quoteInvisible.test.ts` (9): for every context and an age grid around each limit, `renderQuote` returns the very same
stored object or `null` (never a copy, a dimmed or a rounded price); `null` for every unusable reason; reasons are machine codes;
the missing-price wording is exactly the approved text and passes a freshness-word scan (`stale`, `ago`, `updated`, `fresh`,
`aging`, `as of`, `N min old`, clock times, dates, `45s`; the scan is itself tested on bad strings); no string exported by the new
`src/live` modules matches it; nothing outside `src/live` refers to `refreshHistory`, `lastOutcome`, the meter, the skew, the
per-ticker counters, `renderQuote`, `refreshContract`, `addRowsScope` or `addContractScope`; the packet path and `config.ts` do not
import the delivery modules.

Known and unchanged: the existing Data & provenance panel (`src/components/LiveDiagnostics.tsx`, main) prints `d.lastError` and
`d.fallback.error`. A delivery-chain failure can therefore appear there as, for example, `stale: HTTP 200 but 1 of 1 requested
tickers have no usable observation (newest returned is 300s old; limit 60s)`. That panel is the existing developer diagnostics
screen, not a price surface; the new history, meter and per-ticker counters are not shown anywhere.

## Item 2: feed heartbeat (`scripts/`)

`scripts/publish-live-quotes.mjs` also writes `health.json` (schema `sift.live_quotes.health.v1`) beside `index.json` on every
successful cycle. Fields: `generated_at` (equal to the feed's), `run_id`, `run_attempt`, `loop_started_at`, `sequence`,
`cycle_started_at`, `cycle_finished_at`, `sweep_duration_ms`, `requests`, `errors`, `status`, `excluded_sports`, per-sport
`sports[]`, `last_success_at`, `previous_success_at`. The workflow is unchanged. Each cycle is a separate `node` process, so the loop
state (run id, loop start, sequence, last success) is kept in a small file next to the feed tree in `$RUNNER_TEMP`, which the
workflow does not delete between cycles. A new `GITHUB_RUN_ID` or an unreadable state file starts a new loop at sequence 1. A failed
cycle writes nothing, so a stall shows as a stale file. File addition only: `sift.live_quotes.v1`, `index.json` and the per-game
files are byte-for-byte what `buildFiles` always produced (tested). **Not proven in the real loop** (`CI_DRILL.md` section 3).

## Item 3: independent monitor

`.github/workflows/quote-monitor.yml`, `scripts/quote-monitor.mjs`. Every 15 minutes (`7,22,37,52`) plus `workflow_dispatch`;
`permissions: contents: read`, no secrets, no writes, its own concurrency group. The rules (thresholds, the one retry, the relay rule
for partial/empty/delisted/closed markets, no state between runs) are written out in `CI_DRILL.md` section 0 and pinned by tests.
Choices made: the sequence window is 9 minutes (the feed publishes about every 3.5 minutes and raw.githubusercontent.com caches up to
5); heartbeat missing is the distinct state `HEARTBEAT_NOT_PUBLISHED` (a note, not a failure) until the owner sets
`SIFT_MONITOR_REQUIRE_HEARTBEAT=1`; an unset `SIFT_QUOTE_RELAY_URL` skips the relay part (printed as a skip, never a pass).

## Call-volume math

Pure arithmetic from the spec's figures; no Kalshi calls were made. Per active user (tab visible):

| Source | Cadence | Requests per hour |
| --- | --- | --- |
| Visible rows (about 30 tickers, one batch of at most 100) | 45 s | 3600 / 45 = **80** |
| Selected contract, while open | 20 s | 3600 / 20 = **180** |
| Contract opened (forced refresh) | once per open | 1 |
| List-wide background data | 90 s, feed only | 0 relay |

- Rows plus an open contract: 80 + 180 = **260 relay invocations per user-hour**; rows only: 80.
- Vercel Hobby, 1,000,000 invocations a month: 12,500 user-hours browsing rows only; 3,846 user-hours with a contract open the whole time.
- Rows are capped at 200 tickers (2 batches) = at most 160 requests an hour from rows. The 902-contract universe is never polled.
- **Per-ticker fall-through adds feed reads, not relay load**: the feed is asked only for tickers the relay could not supply. A relay 429 adds no relay load (skipped for the Retry-After period).
- Monitor: 96 runs a day. A healthy run makes **one** relay request (4 an hour); a transient failure adds one retry, a run that finds a game empty adds at most one request per extra game (up to 3 games, 6 with the retry). Per run about 3 feed reads plus up to 18 heartbeat re-reads. Zero extra Kalshi requests from the monitor beyond what the relay does.
- Heartbeat: zero extra Kalshi requests; one extra file of about 1 KB in each push.

## Failure behaviour, demonstrated by tests

Fake clock, no network. `tests/live/quoteStore.test.ts` unless noted.

| Situation | Behaviour | Test |
| --- | --- | --- |
| Contract opens, relay answers | relay quote, feed never asked, outcome `ok` | "relay success" |
| Relay 429 with Retry-After | feed answers; relay not asked again until Retry-After elapses, then asked again | "relay 429: honours Retry-After" |
| Relay 429 and the feed is older than the limit | nothing displayed (`too_old`), Retry works once the relay is back | "relay 429 and the feed is older" |
| Relay hangs | abandoned after 4 s; feed answers inside the 8 s bound | "relay timeout" |
| Relay 200 with old data | that ticker is asked of the feed; stale relay price never shown | "relay 200 with OLD data" |
| Both sources over the limit | unusable, outcome `over_limit`, no error, no backoff | "both sources too old", `quoteMissingTickers` |
| Both fail | unusable, error reported, an aged-out earlier price is not resurrected | "both failing" |
| Both hang | call returns by 8 s | "bounded at 8 s" |
| Hidden tab | nothing sent; quote ages out and is withheld; refreshes immediately on visible/online | "pause when hidden" |
| Partial / empty 200 / stale beside fresh / delisted / closed | per requested ticker, see correction 3 | `quoteMissingTickers.test.ts` |
| Production chain after a relay 429 | relay asked again (as on main) | "production chain: after a relay 429" and the characterisation test |
| Monitor, every row, retry, recovery | `quote-monitor.test.ts`, `quote-monitor-drill.test.ts` | |
| Heartbeat shape, sequence, file addition | `feed-heartbeat.test.ts`, including a run of the real publisher script on a stubbed network and clock | |

## Production isolation

Changed files (38 changes against `origin/main`; test files counted):

```
.github/workflows/quote-monitor.yml           new (comment text and no behaviour beyond the monitor)
scripts/quote-monitor.mjs, .d.mts             new
scripts/quote-monitor-drill.mjs               new (loopback only)
scripts/publish-live-quotes.mjs               heartbeat added (health.json + loop state)
scripts/live-quotes/lib.mjs, lib.d.mts        HEALTH_SCHEMA, advanceLoop, buildHeartbeat added (buildFiles untouched)
src/live/quoteUsable.ts                       new
src/live/availability.ts                      new
src/live/missingPrice.ts                      new
src/live/deliveryConfig.ts                    new
src/live/providers/deliveryChain.ts           new
src/live/store.ts                             deliveryProvider, per-chain backoff, scopes with a context, refreshContract, renderQuote, history, meter
src/live/types.ts                             optional fields and FetchOptions; 'stale' error kind (types only)
src/live/providers/kalshi.ts                  opt-in strictObservation (off = main's behaviour)
src/live/hooks.ts                             one line: deliveryProvider: deliveryProvider()
tests/live/ productionChainCharacterisation, quoteUsable, quoteStore, quoteMissingTickers, quoteInvisible, quoteNewerWins,
  feed-heartbeat, quote-monitor, quote-monitor-drill, quote-monitor-workflow   new
tests/live/support/delivery.ts, publisher-preload.mjs   new
docs/quote-track/README.md, CI_DRILL.md       new
```

Confirmed **byte-identical to `origin/main`**: `src/live/config.ts` and `src/live/providers/fallback.ts` (reverted; `git diff origin/main --`
is empty for both). Confirmed **not touched**: everything under `relay/`, `.github/workflows/live-quotes.yml`,
`src/live/preflight.ts` and the packet path, `src/live/freshness.ts`, `src/live/overlay.ts`, `src/live/normalize.ts`,
`src/live/providers/feed.ts`, `src/v3`, the v4 screens, `docs/sift3/`. No repository variable is read or changed by code in this
branch other than the monitor reading `SIFT_QUOTE_RELAY_URL` and `SIFT_MONITOR_REQUIRE_HEARTBEAT` at run time.

What remains shared with the production path, and why it is safe:

1. `store.ts` is one class. The production tickers run through the same `run()`, with the same batching (`provider.maxBatch`), the same
   accounting (`onSuccess`/`onFailure`), the same per-chain backoff (the production chain's is the single backoff it always had) and
   the same scheduler decisions; the characterisation test proves the observable result. The only additions on that path are
   in-memory diagnostics (history entry per call).
2. The same `LiveQuote` map holds quotes from both chains; the newer observation wins. One residual: if the deployed relay ever
   stopped sending `X-Sift-Observed-At`, a production-chain refresh of a ticker could replace a delivery-chain quote (marked
   untimed, never usable) with an unmarked one stamped with its arrival time. The relay always sends the header today
   (`relay/core.ts`), and the characterisation test pins the production chain's current treatment of such an answer. Not changed.

## Verification

RESULTS_PLACEHOLDER

## Not proven

- The monitor on a GitHub-hosted runner against the deployed relay and the real feed; `workflow_dispatch` before merge (the workflow
  must be on the default branch); email on a failed run. See `CI_DRILL.md`.
- The heartbeat inside the real `live-quotes` loop (loop-state survival between cycles in `$RUNNER_TEMP`, hand-over run ids).
  Production `health.json` was 404 when last read.
- The deployed relay's live behaviour for `tickers=` batches under the delivery chain. The relay host could not be resolved from this
  environment, so no real relay response was ever read here; the relay provider is tested against fakes and `relay/core.ts`.
- Component tests for the missing-price states (UI branch). Wiring of the v3 screens to `addRowsScope`, `addContractScope`,
  `refreshContract`, `renderQuote` (UI branch).
- Kalshi's per-IP budget at many concurrent users (below).

## Open questions for the owner

1. **The relay does not expose `Date` cross-origin** (`relay/core.ts` exposes `X-Sift-Observed-At, Retry-After`). Until the separate
   relay change lands, the device-clock correction is inactive in production: a device clock more than 5 s ahead rejects good relay
   quotes as old, more than 5 s behind as future (the safe direction: the price is withheld).
2. **Kalshi per-IP budget at scale.** Per-user relay requests are distinct ticker sets, so the relay's 5 s identical-read sharing helps
   little. At about 3 requests a second of refill, rows-only users (0.022 req/s each) saturate at about 135 concurrent users and
   rows-plus-contract users (about 0.072 req/s) at about 40. This is the case for the item 4 bulk endpoint; it does not matter at
   current traffic. Worth deciding the target concurrency.
3. **Thresholds are the spec's initial values** (`MAX_AGE_MS`, one place). The availability meter is how to validate them; nothing
   consumes it yet.
4. **Unknown start time falls to the stricter tier.** Say if you want the looser "far" tier instead.
5. **Sequence semantics.** The sequence restarts at 1 for each new run (each ~55 minute loop). If a cycle builds its feed but the
   later `git push` fails, the sequence still advanced (the state is saved before the push). The monitor treats a changed `run_id` as advanced.
6. **Monitor run length.** A stalled heartbeat makes a run last about 10 minutes (the 9 minute window); a failing relay adds at most
   one retry wait (5 to 30 s) and a second attempt. Inside the 15 minute cadence and the 20 minute job timeout.
7. **Closed markets.** A closed market the relay still lists is a fresh observation and passes the usability rule by age; its
   `availability` (`CLOSED`) is for the screen to handle, as today. If you want a closed market's price withheld everywhere, that is a
   one-line rule in `quoteUsable` and a decision about the spec's table.
8. **Enabling the monitor.** Scheduled workflows run only from the default branch, so nothing runs until this merges. After the heartbeat
   is live, set `SIFT_MONITOR_REQUIRE_HEARTBEAT=1`.
