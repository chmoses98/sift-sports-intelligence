# Quote delivery: read-only assessment and improvement plan

Date measured: 2026-10-26. Scope: how Kalshi prices reach SIFT 3.0, how reliable that path is today, and what to change. **Nothing here was changed**: no workflow, relay, feed or app code was modified, and no production pipeline was touched. Evidence comes from the public repository, the GitHub Actions API (read), public `raw.githubusercontent.com` reads, and the logs of an existing scheduled check.

## Product rule (decided)

Users see clean, automatically updating Kalshi prices. There are **no stale-quote warnings, freshness badges or last-updated labels** anywhere in the interface (this applies to Prop Discovery PD1 to PD6 and every later screen). Freshness is an engineering responsibility: the app refreshes by itself, asks for the freshest price when an exact contract opens, keeps internal timestamps and reliability checks, and **never invents or misrepresents a price**. When no reliable quote can be obtained, the price is withheld rather than shown.

## How a price reaches the screen today

| Tier | Path | Typical latency | Notes |
| --- | --- | --- | --- |
| 1. Relay | Kalshi public market data → read-only relay on Vercel (`relay/`, `sift-quote-relay.vercel.app`) → browser | quote age 0.7 s median, 14.7 s max (measured) | No secret; CORS only for SIFT origins; shares identical reads for 5 s; passes 429 with Retry-After. |
| 2. Feed | GitHub Actions loop (`live-quotes.yml`) sweeps Kalshi and force-pushes one JSON per game to the `live-quotes` branch → `raw.githubusercontent.com` → browser | 3.5 min publish interval plus up to 5 min CDN cache (measured) | Used for inventory sweeps and as the fallback when the relay fails. |
| Client | `QuoteStore` (`src/live/store.ts`) | n/a | Cadences: detail 20 s, game 45 s, slate 90 s, background 180 s. Refreshes on tab visible, window focus and coming back online. Backs off on failure and on 429 (honours Retry-After). Persists quotes locally. `overlay.ts` only ever replaces a quote with a **newer** observation, so a failed refresh cannot make a price look newer than it is. `refreshNow()` forces a bounded (8 s) refresh. |

The relay is live and passing: the Production check workflow runs a relay smoke test whenever the `SIFT_QUOTE_RELAY_URL` variable is set, and its job succeeded on 2026-10-26.

## Evidence

**Relay (Production check run #230, relay-smoke job, 2026-10-26 14:46Z).** 53 requests across 57 series and 802 tickers from 3 games: 53 × HTTP 200, 0 × 429, 0 × 5xx, 0 errors. Latency p50 138 ms, p95 674 ms, max 745 ms. Quote age p50 0.7 s, max 14.7 s. Control run straight from the same runner to Kalshi: 46 × 200, 7 × 429 (all in the 20-request burst); the relay shows no 429 in the same burst. Kalshi's per-IP limit was measured earlier at about 14 requests burst refilling about 3 per second (`relay/README.md`).

**Feed publish loop (GitHub Actions API, `live-quotes.yml`, 30 most recent runs, 2026-10-25 18:22Z to 2026-10-26 18:44Z).**

- The chain is continuous: every run is started by the previous run's `workflow_dispatch`, with a hand-off gap of 0 to 1 minute. Since 02:57Z on 10-26 every run lasted 54 to 60 minutes, as designed (55-minute loop).
- Five consecutive runs between 18:56Z on 10-25 and 02:57Z on 10-26 show 80, 107, 93, 90 and 111 minutes between start and last update. The job has a 70-minute timeout, so those intervals must include queue or wait time rather than publishing time. **The API cannot show whether publishing paused during them.** This is an open item (needs the run logs or a heartbeat).
- The `*/10` cron runs are all `cancelled` by the concurrency group, which is the intended behaviour while the dispatch chain is alive.
- Cron start reliability is not something to depend on: the workflow's own header records 40+ minute scheduler gaps.

**Feed freshness as the browser sees it (12-sample probe of one game file, 19:42Z to 19:51Z).**

- Two consecutive publications were `generated_at` 19:42:14Z and 19:45:45Z: **211 s apart**, not 180 s (sweep time and push time add to the 180 s wait).
- The CDN answered `cache-control: max-age=300`. The 19:45:45Z publication first became visible between 19:47:07Z and 19:47:51Z, **between 1 m 21 s and 2 m 6 s after it was generated**, because the CDN kept the 19:42Z copy until its 5-minute lifetime ended. Sending `Cache-Control: no-cache` did not bypass this.
- Oldest quote seen by a reader in the window: **4 m 52 s**. Theoretical worst case: publish interval (3.5 min) plus CDN lifetime (5 min), **about 8.5 minutes**.

**Production check.** Runs #228 to #230 conclude `failure` because of the "Sprint features" step. The relay-smoke job in the same runs succeeds. The failing step was not investigated and does not concern quotes.

**Data question noticed (not a quote issue).** For TOR at CGY the NHL explorer lists a 00:30Z start (8:30 PM ET) while the Kalshi event implies 9:00 PM ET. NFL matches (8:15 PM). One schedule source should be chosen for game times.

## Requirements against what exists

| Requirement | State | Gap |
| --- | --- | --- |
| Refresh quotes automatically and on return to the app | Built in `QuoteStore` (visibility, focus, online; cadences above) | v3 registers scopes only for game lines (`useGameExtras`). Prop Discovery and Team Research need their own scopes. |
| Freshest price when an exact contract opens | `refreshNow()` exists (used by packet preflight, bounded at 8 s) | Not wired to a contract sheet. Needs a single-ticker forced refresh relay-first, feed-second, on open. |
| Internal timestamps, reliability checks, failure monitoring | Per-quote `observed_at`; store diagnostics (provider, fallback reason, consecutive failures, backoff) in Data & provenance; daily Production check with relay smoke | No heartbeat from the feed loop, no alert when it stalls, no durable record of client refresh outcomes. |
| Never invent a price | `overlay.ts` newer-only rule; publisher excludes a stale sport instead of publishing it | No single "usable quote" rule shared by all screens; no defined behaviour when every source fails. |
| Preserve the exact-contract view (fees, break-even) | PD6 approved; fee and break-even derive from the ask | Needs the rule below so they never display against an unreliable ask. |
| No freshness UI in PD1 to PD6 | Removed ("Quote … from the SIFT quote feed" row deleted from PD6) | None. |

## Can the roughly three-minute GitHub pipeline be improved?

Short answer: **yes, but its cadence is not the bottleneck.** Its effective latency is the publish interval plus a 5-minute CDN cache, so a faster loop would barely help. The relay is already about 0.7 s old and passing. The biggest gains come from using the relay for everything a person looks at and keeping the feed as fallback and heartbeat.

| # | Change | Gain | Cost / limits | Risk |
| --- | --- | --- | --- | --- |
| 1 | Register quote scopes for new screens: visible rows at `game` (45 s), selected contract at `detail` (20 s); list-wide data from the feed at `slate`. Force-refresh a single ticker when a contract opens (relay first, then feed). | Prices move on their own; exact contract is as fresh as the relay (about 140 ms request). | One 100-ticker relay batch per 45 s per active user is about 80 invocations an hour; Vercel Hobby allows 1,000,000 invocations a month (about 12,000 user-hours). Do **not** poll all 902 contracts (9 to 10 batches per cycle). | Low. Client-only. |
| 2 | Feed heartbeat: add a small `health.json` to the `live-quotes` branch (run id, loop start, sequence number, last success, per-sport status, sweep duration). | Makes stalls and the 80 to 111 minute intervals diagnosable. | A few lines in `publish-live-quotes.mjs`. | Low. |
| 3 | Independent monitor: a small scheduled workflow every 15 minutes that fetches the feed and relay, fails (and emails through GitHub) when the newest `generated_at` is older than 10 minutes or the relay returns errors. | Alert on stalls instead of finding them later. | Free (public repo). Scheduler gaps mean a missed run is possible, so pair with the daily Production check. | Low. |
| 4 | Bulk "slate" endpoint on the relay: one request returns every market of a game's prop series, edge-cached 30 to 45 s with single-flight. | Removes GitHub and the CDN from the hot path for list screens; collapses about 10 batches into one request per game. | Vercel Hobby (free, non-commercial). Must respect Kalshi's per-IP budget (about 14 burst, 3 per second refill): a full 57-series sweep is about 53 requests, so only the prop series should be swept, or the cache must be at least 30 s. Needs a short investigation of which Kalshi calls cover prop series with the fewest requests. | Medium. Relay change. |
| 5 | Tighten the feed to 60 to 90 s while games are within about −3 h to +4 h of start, keep 180 s otherwise. | Fallback and inventory data younger. | Free for a public repository; one runner job; about 53 Kalshi requests per sweep is inside the budget. Little benefit until the CDN cache is out of the path (item 4). | Low to medium. |
| 6 | Second relay host (Deno Deploy or Netlify) as tertiary fallback. | Survives a Vercel pause or a Kalshi throttle on Vercel's egress. | `relay/core.ts` is host-portable. Free tiers listed in `relay/README.md`. | Low. |

Not recommended: authenticated Kalshi access or websockets (needs credentials; SIFT's design is read-only and secret-free), and Cloudflare Workers egress (Kalshi returned 429 to 16 of 17 requests on 2026-10-04). Vercel Hobby is non-commercial; if SIFT becomes commercial, Pro is $20 a month.

## Decisions (2026-10-26, approved)

- **Missing price.** Lists show "—" in the price pill with no warning text. An exact contract with no reliable quote shows "Price unavailable right now" and Retry, with the price-dependent fee and break-even rows hidden. Nothing else changes visibly.
- **No visible freshness.** No stale labels, ages, badges or last-updated text anywhere.
- **The proposed 15-minute maximum for list prices is rejected.**
- Items 1 to 3 of the improvement plan below are authorized for a **focused, separately reviewed implementation**. Nothing is to be merged or deployed until tests, call volumes, failure behaviour and production isolation have been reviewed. Item 4 (bulk relay endpoint) is to be investigated next and not deployed.

## Internal quote-usability rule (configuration, never shown)

A quote may be displayed only if its **observation timestamp** is within the maximum age for its context. The timestamp that counts is the time Kalshi's data was observed (`observed_at`: the relay's `X-Sift-Observed-At`, the feed's per-market `observed_at`), not the time a request was made and not whether the request returned HTTP 200. These are the initial values, to be validated against measurement:

| Context | Maximum age of the observation |
| --- | --- |
| List, start more than 2 hours away | 180 s |
| List, start within 2 hours | 90 s |
| List, live | 60 s |
| Exact contract, start more than 2 hours away | 60 s |
| Exact contract, start within 2 hours or live | 30 s |

The exact contract refreshes when it opens (relay first, then feed). A quote older than its limit is not displayed; the screen shows the missing-price state above. Start time comes from the league schedule, never from Kalshi event metadata; a contract's closing time is separate and is not used for these tiers.

Validation rules: reject an observation timestamp that is missing, unparseable, or more than 5 seconds in the future of the device clock after correcting for the relay's own `Date` header; treat a response whose newest observation is older than the limit as a failed refresh even if it was HTTP 200; never let an older observation replace a newer one (already true in `overlay.ts`).

**Measured metric: reliable price availability.** For each screen that shows prices, record every time a price slot is rendered and whether a quote within its maximum age was available. Report availability per context and per provider (relay, feed) as a percentage, plus the median and 95th-percentile observation age at render. Target to be set after the first measured week. The feed alone cannot meet any of the list limits (its measured publish interval is 211 s and its worst case about 8.5 minutes), so the relay must carry every visible price.

The existing FRESH/AGING/STALE thresholds in `src/live/freshness.ts` (15 and 30 minutes) remain for ChatGPT packets only.

## Monitoring (internal)

- Per refresh: provider that answered, fallback reason, request latency, observation age, outcome. Kept in the store diagnostics (already present) with a bounded history.
- Server side: feed heartbeat (item 2), 15-minute monitor (item 3), daily relay smoke (exists).
- Targets to track: relay quote age p95 ≤ 60 s while a screen is visible; feed publish interval ≤ 5 min on 99% of intervals; relay error rate (non-200) < 1% outside Kalshi 429s; zero silent paused loops longer than 10 minutes.

## Not examined

Vercel dashboard usage and limits; the log contents of individual feed loops; the cause of the 80 to 111 minute intervals; the unrelated "Sprint features" failure in Production check. None of these changed anything.

## Authorized implementation: items 1 to 3 (specification for the separate review)

Branch and PR: separate from PR #147, its own review. Not merged or deployed until the review below is complete.

**Item 1: relay-first refresh on new screens.**
- Scopes: visible price rows at `game` cadence (45 s) through the relay in batches of at most 100 tickers; the selected contract at `detail` (20 s); list-wide background data from the feed at `slate`. Pause when the tab is hidden; refresh immediately on visible, focus and online (existing).
- Exact contract: on open, `refreshNow([ticker])` with the existing 8 s bound, relay first, feed second; show the price only if the result passes the usability rule.
- A shared `quoteUsable(quote, context, now)` function applies the table above; list and contract views use it and nothing else decides display.
- **Call volumes.** Visible rows are about 30 tickers (one batch) per 45 s per active user: about 80 relay invocations per hour; the contract adds 3 per minute while open. Vercel Hobby allows 1,000,000 invocations a month, so about 12,000 user-hours. The full 902-contract universe is never polled (ten batches per cycle).
- **Failure behaviour.** Relay failure or 429: back off per `Retry-After`, fall back to the feed; if the feed's observation is over the limit, show the missing-price state. Both fail: missing-price state, Retry on the contract.
- **Tests.** Unit: `quoteUsable` for every row of the table and boundaries (exactly at the limit, one second over, missing, future timestamp, 200 with old data); store scope registration, pause and resume; contract open refresh with relay success, relay 429, relay timeout, both failing. Component: the missing-price states in lists and the contract sheet, with fee and break-even hidden. Regression: existing live-quote tests and the packet preflight unchanged.
- **Isolation.** New code under `src/v3` and `src/live` additions only; no change to the packet path or v4 screens; no workflow or relay change in this item.

**Item 2: feed heartbeat.**
- `publish-live-quotes.mjs` writes `health.json` beside `index.json` on every successful cycle: run id, loop start, sequence number, cycle start and finish, sweep duration, request count, per-sport status, last success.
- Isolation: file addition only; consumers ignore unknown files; the feed schema (`sift.live_quotes.v1`) and per-game files are unchanged. Tested with the existing `feed-publisher` tests plus a heartbeat shape test. Deployed through the existing `live-quotes` loop only after review.

**Item 3: independent monitor every 15 minutes.**
- A new small workflow (`quote-monitor.yml`), read-only: fetches `health.json`, one game file and one relay quote batch; fails the run, and so emails through GitHub, when the newest feed `generated_at` is more than 10 minutes old, the heartbeat sequence has not advanced, or the relay returns non-200 or only observations older than 60 s. No secrets; no writes; `permissions: contents: read`; its own concurrency group so it cannot affect `live-quotes`.
- Failure behaviour of the monitor itself: a skipped scheduled run is possible (the scheduler is unreliable); the daily Production check relay smoke remains as a second line.

Review checklist before any merge or deploy: tests green; call-volume numbers re-measured with the smoke tooling; failure behaviour demonstrated for each row above; confirmation that `live-quotes.yml`, `relay/` and the packet path are untouched by items 1 and 3 and that item 2 only adds a file.

## Bulk relay efficiency (investigation, item 4, not deployed)

Findings from the published feed for 2026-10-26 (no Kalshi calls were made for this):

- Today's whole prop universe is 902 contracts in **14 distinct series**: NFL 5 (`KXNFLPASSYDS`, `KXNFLREC`, `KXNFLRECYDS`, `KXNFLRSHYDS`, `KXNFLTD`), NHL 3 (`KXNHLAST`, `KXNHLGOAL`, `KXNHLPTS`, shared by all three games), MLB 6. Per game: NFL 299 contracts, NHL 137 to 147, MLB 178.
- Fetching by ticker needs 10 batches of 100 for the full slate. Fetching by series needs **14 requests for the whole slate**, and the three NHL games are covered by 3 requests together because a series spans the day's games. A single game's props need 3 to 6 series requests.
- Kalshi's per-IP budget is about 14 requests in a burst refilling about 3 a second. A 14-request slate sweep sits exactly at the burst size, so it must be paced (about 300 ms apart) and cached.
- A relay endpoint returning only `ticker, yes_bid, yes_ask, volume, status, observed_at` would shrink answers from about 2.3 KB to roughly 150 bytes per contract: the whole slate under 150 KB, against about 2 MB passed through today.
- Recommended shape for review: `GET /slate?sport=NHL&date=…` swept by series with single-flight, cached at the edge for 30 to 45 s (`s-maxage` plus `stale-while-revalidate`), which keeps Kalshi traffic at one sweep per sport per window regardless of how many users are connected, and answers the 60 s list limit with room to spare.
- Open questions: whether a series request can return more than 1,000 markets (NHL goals: about 300 contracts today, fine); the exact response size per series; how Vercel Hobby limits behave under a slate-wide cache. To be measured with the existing relay-smoke tooling before any build.
