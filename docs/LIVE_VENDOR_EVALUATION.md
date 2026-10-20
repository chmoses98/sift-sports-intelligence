# Live data vendors — Sportradar trial vs Genius NFL, and how we will decide

Status: **plan + drafts. Nothing purchased, sent, merged or deployed.** Continues `docs/LIVE_SCORES.md` (prototype, unchanged) and
`docs/LIVE_PUSH_ARCHITECTURE.md` (push architecture). Everything about vendors below comes from **search summaries of their own
pages and press**, because the session had no access to the vendors' sites; re-read each cited page before relying on it.

## 1. What Real said (owner-verified)

The owner verified the TBPN interview of 2026-09-23 ([transcript](https://www.tbpndigest.com/story/2026-09-23/real-a-social-live-sports-stats-app-with-15m-mau-and-50m-daily-notifications-pitches-second-screen-dominance/transcript)).
As the owner reports it: Real's founders **discuss low latency and name Genius Sports, Sportradar and additional scraping, but do not
disclose which source covers which sport, nor any measured delay.** I could not open the page from this session (host blocked), so
nothing here is quoted from it, and this document makes no claim beyond that summary.

**Correction to my earlier note.** I previously suggested Real's speed is "probably a blend of licensed feeds for some leagues and
unofficial collection for the rest, so the benchmark is per league". The transcript does not say that, and I have no basis for
a per-league mapping. What can be said is narrower: Real itself uses licensed official-data vendors *and* scraping, so a
scraping-only or free-feed approach is not a like-for-like copy of Real, and Real's latency is unknown until measured. The
benchmark compares every candidate against Real game by game because Real's own sourcing is undisclosed, not because we know
it varies by league.

## 2. Sportradar: the 30-day trial and the push-feed evaluation

What the developer documentation says (via search of `developer.sportradar.com`):

| Item | Finding | Source |
|---|---|---|
| Trial | Self-issued from a developer account; "trials last 30 days" (the tennis/golf FAQs say **90 days**, one sport per key; the docs disagree). | [Your Account](https://developer.sportradar.com/getting-started/docs/your-account), [Tennis FAQ](https://developer.sportradar.com/tennis/v2/docs/faqs) |
| Limits | **1,000 calls per rolling 30 days, 1 query per second**; extensions and higher limits go through sales. | same |
| Data quality | "Trial data matches production, with lower rate limits"; not throttled or updated less often. | same |
| Terms | A free trial is **non-commercial use for internal testing and evaluation only**: a public SIFT page is not a permitted trial use. | [Terms](https://developer.sportradar.com/terms-and-conditions) (quoted via search) |
| Production | Reserved for paying customers; a package returns a production key at an agreed request volume; **pricing depends on call frequency and volume** (page is ~4 years old). Two tiers: *Realtime* (all data, feeds pulled continuously) and *Standard* (key game intervals, pulled every 15 min). | [API Packaging](https://developer.sportradar.com/api_packaging) |
| **Push feeds** | **Not self-issued.** "Reach out to our sales team … Push Feeds." Per-sport pages: NCAAMB, soccer, NHL, NFL, tennis say push is an add-on, unavailable in the self-issued trial, and (soccer, NHL, tennis, NBA overview) for **Realtime customers**. | [Your Account](https://developer.sportradar.com/getting-started/docs/your-account), [NHL push](https://developer.sportradar.com/ice-hockey/docs/nhl-ig-push), [NCAAMB push](https://developer.sportradar.com/basketball/docs/ncaamb-ig-push) |
| NBA oddity | The NBA *Push Events* reference still shows a trial access level and a trial stream endpoint, which may mean a trial key can reach the NBA stream. **Unclear; ask.** | [NBA Push Events](https://developer.sportradar.com/basketball/reference/nba-push-events) |
| Push format | HTTP chunked streaming, publish/subscribe, heartbeat about every 5 s when idle. | [Insights push](https://developer.sportradar.com/insights/reference/insights-push-feed) |
| Latency | NCAAFB games carry an **expected-latency field of 2, 10, 25 or 50 seconds**, set the day before and changeable on game day; REST live-game cache examples are 2–3 s and are an upper bound, "not a guarantee". | [changelog](https://developer.sportradar.com/sportradar-updates/changelog/ncaa-football-api-game-expected-latency) |
| Coverage | Separate APIs for NBA, MLB, NHL, NCAAFB, NCAAMB, soccer, tennis; **not NFL** (the NFL's official data went to Genius in 2021). | developer portal; [LawInSport](https://lawinsport.com/topics/news/item/national-football-league-taps-genius-sports-group-as-exclusive-distributor-of-official-league-data) |

**Practical meaning of the numbers.** 1,000 calls at 1 QPS is *snapshots*: about 83 minutes of one game polled every 5 s, or a few
dozen calls per game per night across several. It is enough to see the real payload shape, the status/clock/period fields and an
`expected latency` value, and to spot-check against Real. It is **not** enough for a latency benchmark across a slate, and a
trial cannot back a public display. The meaningful evaluation is the **push feed**, which only sales can open.

**How to request it** (owner steps; I cannot create accounts):

1. Create a developer account at developer.sportradar.com and issue trial keys for **NBA, MLB, NHL, NCAA football, NCAA men's basketball,
   soccer and tennis** (one key per product; start the clock only when you will use it: align with a Sunday/Thursday NFL-adjacent
   or midweek NBA/NHL slate). Confirm in the portal whether the trial key can reach the NBA `stream/events/subscribe` endpoint.
2. Send the **Sportradar draft** (`docs/outreach/sportradar.md`) to the sales route on the developer site/`sportradar.com` contact page.
   It asks for a push-feed evaluation period, quota for benchmarking, and a media/fan-app licence quote. No public form or address
   was confirmed from search, so use the site's "contact sales" path.
3. Ask them to state, in writing: which sports' push feeds and which tier (Realtime vs Standard); evaluation length and quota; whether
   benchmarking against consumer apps is allowed; whether a private beta may display evaluation data.

## 3. Genius Sports: the NFL offering

| Item | Finding | Source |
|---|---|---|
| Rights | **Exclusive distributor of the NFL's official real-time play-by-play, Next Gen Stats and betting feed to media companies and sportsbooks** (since 2021). Term: reported **through 2029** by one outlet, **through the 2027-28 season** by another: confirm. | [LawInSport](https://lawinsport.com/topics/news/item/national-football-league-taps-genius-sports-group-as-exclusive-distributor-of-official-league-data), [Sportcal](https://www.sportcal.com/news/nfl-renews-expands-genius-sports-partnership-through-2029/) |
| Non-betting use | Supplies media products (e.g. X's NFL Gametime); FANHub (fan targeting/advertising). Scope covers media, not only sportsbooks. | LawInSport, [Genius newsroom](https://www.geniussports.com/newsroom/) |
| Self-serve / trial / pricing | **None found.** No developer portal, free trial, public price list or small-publisher programme appeared. Access is a commercial partnership conversation. | search; unverified |
| Latency | "Under a second" in-stadium-to-sportsbook for Football DataCo soccer; no NFL-specific figure found. | [Genius](https://www.geniussports.com/newsroom/genius-sports-and-football-dataco-extend-exclusive-official-data-partnership-through-2029/) |
| Prediction-market adjacency | Aug 2026: official soccer data/integrity deals with **Kalshi** and **Polymarket**; the NFL has **not** approved prediction markets, and Genius's CEO was reported not to expect it this season. | [SBC Americas](https://sbcamericas.com/2026/08/07/genius-sports-ceo-kalshi-polymarket/) |

The last row matters for SIFT: the app shows **Kalshi prices next to NFL games**. Genius and the NFL are sensitive to prediction-market
association, so the inquiry must say plainly what SIFT is (a research tool displaying third-party market prices, no trading, no
wagering) rather than leave them to discover it.

## 4. Side by side

| | Sportradar (trial → push evaluation) | Genius (NFL) |
|---|---|---|
| Time to *evidence* | **Today** for REST payloads (self-serve); days–weeks for push after sales | Weeks–months; sales only |
| Push / streaming | Yes (add-on, Realtime tier, via sales) | Yes in principle (official feed); product shape for apps unknown |
| NFL | **No** (Genius exclusive) | **Yes**, the only licensed official source |
| NBA | Yes (non-exclusive) | Also (non-exclusive, betting data) |
| MLB / NHL / NCAA / tennis | MLB (exclusive official), NHL, NCAAFB/MB, tennis | NCAA championships only; not MLB/NHL/tennis found |
| Soccer | Yes | EPL/EFL and others (official) |
| Trial | 30 days (docs also say 90), 1,000 calls/30 days, 1 QPS, internal/non-commercial | None public |
| Price | Unpublished; depends on call frequency/volume; competitors claim five figures *(secondhand)* | Unpublished |
| Public display right | Only under a production/media contract | Only under a media licence |
| Fit for SIFT's 8 sports | 6 of 8 (+ soccer, tennis) | 1 of 8 (NFL) + soccer |

**Reading:** the two are complements, not alternatives. Sportradar is the route to *measure* and probably to license NBA/MLB/NHL/NCAA/tennis;
Genius is the only licensed route to *official NFL real-time*. Because Genius has no self-serve path and the longest lead time, send
its inquiry first; run the Sportradar trial for evidence while waiting. Neither answers price until sales replies.

## 5. Kalshi's own live sports data: technically promising, contractually closed

### What the API offers (docs.kalshi.com, via search; not fetched)

* `GET /live_data/milestone/{id}` → `{ live_data: { type, details, milestone_id } }`; `type` names the schema of the flexible `details`;
  `include_player_stats` for pro football, pro basketball and college men's basketball milestones with player mappings.
* `GET /live_data/batch?milestone_ids=…` (≤ 100 ids).
* `GET /live_data/milestone/{id}/game_stats` → `{ pbp }` play-by-play by period, **sourced from Sportradar** (it returns null for
  unsupported types or milestones without a Sportradar id). Supported: pro football, college football, pro basketball, college men's and
  women's basketball, WNBA, soccer, pro hockey, pro baseball. **Tennis is not listed.**
* Milestones are found with `related_event_ticker` (or `with_milestones` on events); a sports milestone's `details` carries team ids.
* Field-level contents (score, clock, period names, timestamps) and update frequency are **not documented in anything I could read**.
  They are what `scripts/live-latency/kalshi-discover.mjs` would establish.

### Identity: SIFT → Kalshi → milestone (checked on the real feed, 2026-10-20)

SIFT's live-quote feed (`raw.githubusercontent.com/…/live-quotes/index.json`, readable from this session) keys each game as
`26OCT20ANANYI` (date + away + home, from Kalshi's own tickers). That game's file holds 233 Kalshi markets across 20 events, including
`KXNHLGAME-26OCT20ANANYI`. So the chain is deterministic: **SIFT feed game key + the sport's game-winner series = Kalshi event ticker →
`/milestones?related_event_ticker=` → milestone id → live data.** Implemented and unit-tested as `gameEventTicker()`; the final hop
(event → milestone) is what the sampler would verify and I could not. Tonight's feed lists 11 NHL games (2026-10-20), NFL Thursday
`26OCT22NECHI` and the Sunday 2026-10-25 slate; the feed carries no NBA, CFB, CBB, soccer or tennis games, so those need Kalshi's own
event lists (the sampler uses series `KXNBAGAME`, `KXNCAAFGAME`, `KXEPLGAME`, `KXATPMATCH`, … whose names beyond NFL/NHL/MLB/EPL/NCAAF/
ATP/WTA are unverified).

### Rights: read first-hand from Kalshi's own PDFs (2026-10-20)

Sources: [Developer Agreement v1.1](https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf), [Data Terms of Use](https://kalshi-public-docs.s3.amazonaws.com/kalshi-data-terms-of-service.pdf).

| Clause | Text | Consequence for SIFT |
|---|---|---|
| Dev. Agreement §1 | "Accessing or using Kalshi's API shall be considered a binding acceptance of this Agreement." | Binds API users; whether it also binds an unauthenticated public-endpoint reader is **unclear** (§4.1.1 says you must be a Member). |
| §3 | "Use of Kalshi APIs is expressly limited to facilitating a members own trading on the Exchange; all other usages are disallowed." | A public scoreboard is not "your own trading". |
| **§3.1** | Prohibits "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading on Kalshi. You may not share such data or content with third parties in any manner without prior written authorization from Kalshi." | **Public display of Kalshi live data is not permitted without Kalshi's written authorization.** |
| **§3.5** | Prohibits "Accessing the API for purposes of monitoring the availability, performance, or functionality of any of Kalshi's services or for any other benchmarking or competitive purposes." | A latency/cadence test of Kalshi's API is itself within this clause. |
| §3.7 / §6.4 | No sublicensing; no public statements relating to Kalshi/its API without prior written approval. | Any attribution or announcement needs sign-off. |
| Data Terms §I–II | Personal, non-commercial use "in the form in which it is presented on the Website"; "publicly displaying, … collecting, … scraping … or otherwise transfer[ring] … to any third person" prohibited **without prior written authorization from Kalshi "and/or an applicable third party provider"**. | Third-party-provider data (Sportradar's) needs the provider's authorization too. |

**Conclusion: Kalshi's published terms do not permit independent public display of its sports data.** A public API is not a
redistribution licence, and here the paper says so explicitly. The game data is also Sportradar-sourced, so even Kalshi's
permission may not be enough: the underlying vendor's rights would need to cover SIFT. Kalshi publishes no licensing programme I could
find (it licenses media data through negotiated deals, e.g. its Fox partnership).

**Flag for the owner (I changed nothing):** the same clauses read against SIFT's existing Kalshi infrastructure raise questions that
need a lawyer's read, not mine. §3.1 ("caching", "storing", "sharing with third parties") vs the relay's 5 s cache and the
`live-quotes` branch, which republishes Kalshi market data publicly every 3 minutes; §3.5 ("monitoring … performance … or
benchmarking") vs `live-provider-smoke.yml`, `relay-smoke.yml`, `kalshi-probe.mjs` and `kalshi-rate-probe.mjs`. Whether these clauses
bind a reader of Kalshi's unauthenticated public market-data endpoints is exactly the open question in §1 above. I recommend
raising it in the same message as the licence request (`docs/outreach/kalshi.md`), since a licence conversation will surface it anyway.

### The test, and what is being done about it

`kalshi-discover.mjs` is ready as a **one-command, no-tapping** test of coverage, identity mapping, fields, play-by-play, player stats and
update cadence. Because of the clauses above it **refuses to run without `--ack-kalshi-terms`** (collection) and **skips the cadence stage
without `--ack-benchmark`** (§3.5). Recommended order: send the Kalshi inquiry first; run the sample only once the owner has chosen to
accept that risk or Kalshi has agreed. It has not been run (no access from this session). Technical verdict is therefore **unproven**,
but it no longer decides the outcome: even a perfect result would not authorise public display.

## 6. Establishing the comparison with evidence

No latency has been measured by anyone in this work. The comparison is built only from runs of the harness
(`scripts/live-latency/README.md`) recorded in `docs/LIVE_LATENCY_RESULTS.md`. Rules, fixed before the data exists:

1. **Claims are not results.** "15 s", "<1 s", "2 min", "2/10/25/50 s" are hypotheses to test, never inputs to a decision.
2. **Same games, same minutes.** Every candidate and Real are observed during the same games; per-league tables, not one average.
3. **Report ± and missed events with every number**; low-confidence pairs and unpaired taps stay visible.
4. **Acceptance** (set now): across ≥ 30 matched score changes spanning ≥ 3 sports, a source is "Real-like" if its median delay vs Real is
   within **3 s** and p90 within **8 s**, with missed-event rate **≤ 5 %**. A source can pass for one league and fail another.
5. **Coverage of all eight sports is the end state**: for each of NFL, MLB, CFB, NBA, NHL, Soccer, CBB, Tennis the results page names
   the source, its measured delay vs Real, its rights position, and its cost, or marks the sport "no qualifying source yet".
6. **Rights are a column, not a footnote:** a fast source without display rights is recorded as "usable for measurement only".
7. Provider-independent: every source enters through a `LiveScoreProvider` adapter (polling) or, for push, a stream consumer that
   emits the same `sift.live_game/1` deltas; vendors and the kill switch are configuration. Adding Sportradar or Genius changes
   one adapter file and the rights table, not the contract, matcher, freshness rules or UI slots.

Sequencing: (a) send the Kalshi, Sportradar and Genius inquiries (drafts in `docs/outreach/`; nothing sent); (b) the owner's own-machine benchmark on the free
league feeds (NHL, NBA, MLB) for the first real Real-vs-feed numbers and to validate the harness; (c) the Kalshi sample only after the §5
decision; (d) Sportradar trial payloads and, if granted, a push evaluation re-run through the same harness (a stream consumer logs the same
`change` records); (e) Genius when it replies.

## 7. Decisions needed

1. Review and send (or edit) the three drafts in `docs/outreach/` (Genius, Sportradar, Kalshi); I have sent nothing.
2. Fill in the owner placeholders (name, entity, contact, whether SIFT is or will be commercial, expected audience).
3. Choose the benchmark night and run the harness on your MacBook.
4. Decide whether to run the Kalshi sample before Kalshi answers (see §5), and whether to have the existing Kalshi relay/feed reviewed against Kalshi's Developer Agreement.
