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

## Internal quote-usability rule (engineering configuration, never shown)

One shared function decides whether a quote may be displayed, per context. Defaults proposed for approval:

| Context | May display a stored quote if its observation is | The contract sheet |
| --- | --- | --- |
| Lists (Prop Discovery rows, team and game lines), event more than 2 h away | 15 min old or less | n/a |
| Lists, event within 2 h or live | 3 min old or less | n/a |
| Exact contract, any time | n/a | Refresh on open (relay, then feed). Show the price if the refresh succeeded or the stored quote is within 30 s (event within 2 h or live) or 2 min (otherwise). |

When a quote does not pass: a list row shows "—" in the price pill with no explanatory copy; the exact contract shows a single plain "Price unavailable right now" state with Retry, and the fee and break-even rows are not shown (they derive from the ask). That failure state is the only visible consequence and is subject to your approval. No timestamps, ages or badges appear in any case. The existing FRESH/AGING/STALE thresholds in `src/live/freshness.ts` (15 and 30 minutes) remain for ChatGPT packets only.

## Monitoring (internal)

- Per refresh: provider that answered, fallback reason, request latency, observation age, outcome. Kept in the store diagnostics (already present) with a bounded history.
- Server side: feed heartbeat (item 2), 15-minute monitor (item 3), daily relay smoke (exists).
- Targets to track: relay quote age p95 ≤ 60 s while a screen is visible; feed publish interval ≤ 5 min on 99% of intervals; relay error rate (non-200) < 1% outside Kalshi 429s; zero silent paused loops longer than 10 minutes.

## Not examined

Vercel dashboard usage and limits; the log contents of individual feed loops; the cause of the 80 to 111 minute intervals; the unrelated "Sprint features" failure in Production check. None of these changed anything.
