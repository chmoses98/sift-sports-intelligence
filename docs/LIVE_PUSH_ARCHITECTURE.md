# "Real-like" live updates — latency, licensing, push architecture

Status: **proposal + measurement tooling. Nothing purchased, merged or deployed.** Written 2026-10-20 on branch
`claude/live-scores-infrastructure`, after `docs/LIVE_SCORES.md` (the polling-based provider memo, preserved unchanged) and
its prototype `src/live/scores/` (reused here as the ingestion core).

## 0. What this document can and cannot claim

* **No latency was measured.** The environment refuses every provider host (and the open internet), so no feed was polled
  and Real could not be observed. Everything about feed speed below is a vendor/third-party claim or an explicit
  hypothesis. The deliverable for "test feeds against Real" is the **harness** (`scripts/live-latency/`, §1), validated
  end to end against a local simulator only. The first owner run produces the numbers this document needs.
* Provider facts come from **web-search summaries**, not provider pages; prices and terms must be re-read before any
  purchase. Items marked *(secondhand)* are competitor or directory claims.
* Hosting prices (a ~$5–6/month VPS, Cloudflare Workers Paid $5/month) and iOS Web Push support (installed PWA, iOS 16.4+) are
  **my estimates from prior knowledge, not looked up in this session**; confirm them when choosing a host.
* **Real**: the only match found is Real, the social box-score app founded by John and Louis Antonelli (Chernin Group-led
  round; [Front Office Sports](https://frontofficesports.com/article/chernin-group-funding-round-real-app/)). That article
  quotes the founders on latency in general ("sports naturally have data feeds that are basically instant"); **I found no public
  statement by them naming Genius Sports, Sportradar or their collection method.** Their data stack is therefore treated as
  unknown. Please send the source of the statement you found.

## 1. Measuring event-to-screen latency, not advertised refresh rates

Advertised "refresh" numbers are cache TTLs or polling advice, not event-to-screen time. Example from Sportradar's own docs:
a live-game cache of 2–3 s is described as *an upper bound on staleness, not a guarantee*, and NCAAFB games carry an
`expected latency` field of **2, 10, 25 or 50 seconds** chosen per game
([docs](https://developer.sportradar.com/sportradar-updates/changelog/ncaa-football-api-game-expected-latency)): the same
product delivers anywhere from 2 s to 50 s depending on how the game is covered.

`scripts/live-latency/` records the **first-seen time of every score change, per feed**, plus taps from a person watching Real
on a phone (and optionally a "play happened" tap from the venue/OTA broadcast). `analyze.mjs` pairs them by order and reports,
per source, median / p90 / max delay against the fastest source or against the truth taps, **each with its polling-window
uncertainty**. Design points that keep it honest:

* a poll that first sees a change only proves it happened since the previous poll, so each observation is a window and
  every delay carries ± the window half-width (a local simulation with a known 6 s lag measured 4.2 s ± 2.0 s: inside its own
  error bar, which is exactly why the ± is mandatory);
* relative latency (feed vs feed, Real vs feed) is always measurable; **absolute** latency needs a ground-truth clock, which
  is only as good as the human "play happened" taps (reaction error ±0.7 s is carried in the result);
* marks that cannot be paired (different counts) are excluded, never forced; Real is only observed by a person.

Reference points from the search (all unverified, mostly low-quality): broadcast TV tends to run ~17 s behind the field and
streaming 20–60 s; one developer measured a betting-data feed ≥4 s ahead of live TV; a vendor table lists Sportradar's
push at "<1 s" without a per-league breakdown. A score app that beats TV by a few seconds can *feel* real-time; the
harness decides whether each free feed is within reach of Real, which is the single most valuable unknown.

**Proposed acceptance test** (set before looking at data): over ≥30 paired score changes spanning ≥3 sports, a feed or
architecture is "Real-like" if its **median** is within 3 s of Real's and its **p90** within 8 s, ± reported.
**Hypotheses to be falsified by the first run (not findings):**
H1 league-operated feeds (MLB statsapi, NHL api-web, NBA CDN) are faster than ESPN's aggregated scoreboard;
H2 ESPN is the slowest and most variable (CDN `Age`); H3 a 2–3 s poller adds ≤ half its interval on average;
H4 Real is faster than every free feed.

## 2. Licensing, trial access, price and coverage

Rights landscape (search results; dates matter):

| League | Official-data position found | Source |
|---|---|---|
| NFL | **Genius Sports** is the exclusive distributor of official real-time play-by-play, Next Gen Stats and the betting feed **to media companies and sportsbooks** (2021; renewed, reported through 2029). Sportradar is out of the NFL data role. | [LawInSport](https://lawinsport.com/topics/news/item/national-football-league-taps-genius-sports-group-as-exclusive-distributor-of-official-league-data), [Sportcal](https://www.sportcal.com/news/nfl-renews-expands-genius-sports-partnership-through-2029/) |
| MLB | **Sportradar** exclusively distributes official data and Statcast, extended through 2032 (Feb 2025 release). | [Sportradar IR](https://investors.sportradar.com/node/8816/pdf) |
| NBA | Sportradar **and** Genius, non-exclusive (betting data, 2020). | [NBA](https://pr.nba.com/nba-betting-data-partnerships-sportradar-genius) |
| NHL | Betting-data deals signed; current vendor **not confirmed** (an old report named Sportradar). | unverified |
| NCAA (CFB/CBB) | Genius holds NCAA **championship** data through 2032; **regular season and CFP are excluded**; the NCAA's free LiveStats feeds member schools; a Sportradar scouting dispute exists. No single licensor for the regular season. | [SportsVideo](https://www.sportsvideo.org/2025/04/28/ncaa-and-genius-sports-expand-partnership-through-2032/), [LSR](https://www.legalsportsreport.com/38201/ncaa-betting-sportradar-scout/) |
| Soccer | Genius + Football DataCo (EPL/EFL, "under a second" to sportsbooks); elsewhere Sportradar (unverified). | [European Gaming](https://europeangaming.eu/portal/latest-news/2024/08/05/164609/genius-sports-and-football-dataco-extend-exclusive-official-data-partnership-through-2029/) |
| Tennis | ATP data via Tennis Data Innovations with Sportradar sublicensing; WTA unverified. | [SBC Americas](https://sbcamericas.com/2022/10/21/sportradar-atp-tour-tennis-data-tdi/) |

So a *fully licensed* Real-like product needs **at least two vendors**: Genius for NFL, Sportradar for MLB/NHL/NBA/tennis,
plus unresolved NCAA regular-season sources.

| Route | Latency (claimed) | Push? | Trial | Price | Coverage of the 8 | Display rights |
|---|---|---|---|---|---|---|
| **Genius Sports** (NFL media data, FANHub) | "under a second" to books | yes (feeds) | none public found | sales-quoted; NFL once sought >$100M/yr for data rights from the *betting* market (not the app price) | NFL, EPL/EFL, NCAA championships | licensed B2B incl. media |
| **Sportradar** push feeds | claimed <1 s; 2–50 s expected-latency tiers on NCAAFB | **yes**, HTTP chunked stream, 5 s heartbeat; **not self-issued, via sales** | self-serve REST trial 30–90 d, 1,000 calls/30 d, 1 QPS, **non-commercial/internal only** | unpublished; competitor claims $10k+/month and five-figure/yr minimums *(secondhand)* | MLB, NBA, NHL, tennis, NCAAFB/MB, soccer; **not NFL** | yes under contract (media addendum) |
| **SportsDataIO** | real-time only on the sales-quoted Leagues API | polling (push unverified) | scrambled data, no display | $99–149 tiers are 1-day delayed | 8 sports, no soccer/tennis live below Leagues tier | licensed product display OK |
| **Mr. Doge** | "live WebSocket stream" | **WebSocket** | unverified | $59.90/mo (live scores + WS); $199.90 business *(directory listing)* | claims 8 sports incl. tennis | **unknown data origin — treat as unlicensed until proven** |
| **TheSportsDB** | 2-minute livescores | polling | free test key (non-commercial) | ~$9/mo | NFL, NBA, NHL, MLB, soccer | paid tier terms unverified |
| **Free league/ESPN feeds** (MLB statsapi, NHL api-web, NBA CDN, ESPN) | unmeasured | polling only (MLB has `diffPatch`/`timestamps`) | n/a | $0 | MLB, NHL, NBA; ESPN all 8 (tennis uncertain) | **none granted** (ESPN: no licence, Disney terms likely bar automated access; MLB: non-commercial, non-bulk notice; NHL/NBA: site terms) |

Honest summary: **push feeds that are genuinely fast are licensed B2B products, sales-gated and priced for businesses; the
cheap or free routes are polling, and their rights are absent or unclear.** Real's founders presumably have contracts or a
partner; SIFT has neither yet.

## 3. Fastest realistically achievable solution

Two lanes, because the honest answer depends on whether SIFT is a private research tool or a public product.

### Lane A — fastest, cheap, **rights-unresolved** (days; about $6/month; private/invited scale only)

Server-side pollers on the league-operated feeds (MLB statsapi, NHL api-web, NBA CDN) at **2–3 s** and ESPN at 3–5 s for
NFL/CFB/CBB/soccer, fanned out to the PWA over **SSE** (plus Web Push for alerts). Expected event-to-screen = *provider's own
publication delay* + ≤ half the poll interval + <0.5 s of our pipeline — the first term is unknown until the harness runs
(H1–H4). Tennis stays on today's "unavailable" unless a source proves out. Cost: **a ~$5–6/month VPS, $0 for data.**
Why this lane exists: it is the only path that could approach Real's feel without a contract. **Why I do not recommend it for
a public launch:** none of these feeds grants display rights, the endpoints can change or block without notice, and ESPN's
terms reportedly prohibit automated access. If chosen, scope it to a private beta, keep the kill switch (already in
`LiveScoreService`), fetch each upstream once regardless of client count, attribute the source, and ask each owner for
written permission in parallel.

### Lane B — fastest **licensed** (weeks–months; sales-quoted; unknown, likely five figures/year or more)

Sportradar push feeds (MLB, NBA, NHL, NCAA, tennis, soccer) **plus** Genius for NFL, through one ingestion service that
terminates the vendor streams. Latency is then the vendors' (claimed ~1–3 s; verify in a vendor trial against the same harness).
**Cost cannot be quoted without a sales conversation; I will not invent a number.** Secondhand signals: $10k+/month
Sportradar, NFL data historically priced for sportsbooks. Ask each for a *media/fan-app* tier, a non-betting scope, a
startup or revenue-share structure, and a paid pilot restricted to one league (MLB or NBA) to validate before committing.

**Recommended sequence:** run the harness (free) → if free league feeds are within the acceptance test, build Lane A for an
invited beta while requesting licences → move league by league to Lane B as users or revenue justify it. The architecture
below is identical in both lanes; only the *source adapters* change.

## 4. Architecture: server-side ingestion → push to the mobile PWA

```
 providers ──poll/stream──▶ INGEST (one Node process, always on)
                              ├─ pollers (adaptive cadence) / vendor stream consumers
                              ├─ normalise  = src/live/scores adapters  (sift.live_game/1)
                              ├─ state store + diff → events {seq, game, delta, observedAt, ingestedAt, emittedAt}
                              ├─ ring buffer (last 10 min / 500 events) for resume
                              └─ kill switch / per-provider health
                                   │
            ┌──────────────────────┼───────────────────────────┐
            ▼                      ▼                           ▼
   GET /events  (SSE)     GET /snapshot (JSON, 1 s CDN TTL)   Web Push worker (VAPID)
   Last-Event-ID resume   initial load + fallback poll        goal/final alerts to opted-in installs
            │                      │                           │
            └──────────────▶  PWA (existing app)  ◀────────────┘
                              store → scoreView() freshness → the five slots in LIVE_SCORES.md §5
```

**Ingestion host.** A single always-on process on a small VPS (~$5–6/month; it also gets its own egress IP, which matters —
the repo's own history shows Cloudflare Workers' shared egress was rate-limited by Kalshi). Not Vercel Hobby (serverless
cannot hold a polling loop or long streams; the existing relay stays as is) and not GitHub Actions (5-minute scheduler
reliability, 3-minute loops). Scale-out option later: Cloudflare Durable Objects (alarms for polling, hibernating WebSockets
for fan-out; Workers Paid $5/month) once egress behaviour has been verified per provider.

**Source adapters.** Poll cadence is adaptive per sport: 2–3 s while a game is live, 30 s inside the hour before a start, 5 min
otherwise; conditional GET (`If-None-Match`) where supported; backoff and `Retry-After` honoured. A vendor push feed
(Sportradar chunked stream, Genius) replaces a poller without touching anything downstream. Provider order per sport and the
kill switch are configuration, not code.

**Fan-out protocol.** SSE rather than WebSocket: one-way, auto-reconnect, works through proxies, resumes with `Last-Event-ID`
from the ring buffer; client→server traffic (subscriptions) is plain REST. Heartbeat comment every 15 s; the client treats
silence > 2 heartbeats as "stream down". Messages are small deltas keyed by provider game id with team keys, so **matching to
Sift events stays in the browser** (`TeamDirectory` + `pairGames`, already tested) and the server never needs the boards.

**PWA client.** `EventSource` while the app is visible; on `visibilitychange`→visible: fetch `/snapshot`, then reconnect with
the last event id. **Platform limit that sets expectations:** an installed iOS PWA is suspended in the background, so a live
screen is foreground-only; background updates are **Web Push notifications** (installed PWA, user opt-in, iOS 16.4+), which
are best-effort (typically seconds, no guarantee), carry only a short alert, and are coalesced per game. If SSE fails the
client polls `/snapshot` every 15 s and the chip says so; if the server fails it falls to the publication's final result or
"Live — score unavailable" (today's wording). Freshness uses the server's `observedAt`; the chip never says LIVE for a
2-minute provider (`liveBeforeMs`).

**Continuous latency telemetry.** Every event carries `observedAt` (feed), `ingestedAt`, `emittedAt`; the client samples
`receivedAt − emittedAt` (clock offset estimated from heartbeat times) and beacons it. That measures *our* leg in production,
all day; the harness measures the *provider* leg. Budget: provider delay (unknown) + poll ≤ ½ interval (~1–1.5 s) +
ingest/diff <50 ms + fan-out <200 ms + render <100 ms.

**Isolation (unchanged).** Separate host, store and endpoints; no import from models, projections, packets, opportunities or
the quote store (guarded by `tests/live/scores-isolation.test.ts`). The Kalshi relay and quote feed are untouched.

**Build order (after approval; each step independently shippable and flagged off).**
1. Run the harness on a live slate; decide Lane A feasibility (free; 1 evening, ideally two people).
2. `ingest/` service reusing `src/live/scores` (pollers, diff, ring buffer, SSE, `/snapshot`, kill switch, health, telemetry) with the
   existing synthetic fixtures + a local simulator in CI.
3. Client store/hook (`EventSource` + resume + snapshot fallback + freshness) behind `VITE_SIFT_SCORE_URL`.
4. The five UI slots (needs explicit approval; first production-UI change).
5. Web Push (VAPID, opt-in UX, per-game subscriptions).
6. Vendor adapters (Lane B) written from recorded trial samples.

## 5. Cost summary

| Item | Lane A (private beta) | Lane B (public, licensed) |
|---|---|---|
| Data | $0 (rights unresolved) | **quote required** (Sportradar + Genius; unverified secondhand: $10k+/mo Sportradar) |
| Ingest + SSE host | ~$5–6/mo VPS | same, plus a standby (~$12) |
| Edge/CDN/TLS | $0 (Cloudflare free) | $0–20 |
| Web Push | $0 | $0 |
| **Total** | **≈ $6/month** | **sales-dependent; not estimable honestly** |

## 6. Decisions needed

1. Open network access for a measurement evening (allow the feed hosts; the harness needs a laptop with internet and a phone
   running Real) — or run `scripts/live-latency` yourself and send me `latency-run/`.
2. Is Lane A acceptable for an invited, non-commercial beta given the unresolved rights, or must everything be licensed first?
3. Authorise written outreach to Sportradar and Genius (media/fan-app tier, one-league pilot, startup terms) and, in parallel,
   to the league/ESPN owners for permission.
4. Send the source of the Genius/Sportradar statement from Real's founders so I can read what they actually said.
