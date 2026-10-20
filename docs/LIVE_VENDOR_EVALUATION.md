# Live data vendors — Sportradar trial vs Genius NFL, and how we will decide

Status: **plan + drafts. Nothing purchased, sent, merged or deployed.** Continues `docs/LIVE_SCORES.md` (prototype, unchanged) and
`docs/LIVE_PUSH_ARCHITECTURE.md` (push architecture). Everything about vendors below comes from **search summaries of their own
pages and press**, because the session had no access to the vendors' sites; re-read each cited page before relying on it.

## 1. What Real said (owner-verified, not re-read here)

The owner verified that the TBPN interview of 2026-09-23 ([transcript](https://www.tbpndigest.com/story/2026-09-23/real-a-social-live-sports-stats-app-with-15m-mau-and-50m-daily-notifications-pitches-second-screen-dominance/transcript))
has Real's founders naming **Genius Sports, Sportradar and additional scraping**. I could not open that page (host blocked in
this session; search surfaced only a TBPN Digest company profile: real-time play-by-play, 18+ leagues), so this document does
**not quote it** and I have not seen what they said about latency, which sports each source covers, or what "scraping" means.
What it implies for SIFT, as a working hypothesis only: Real's speed is probably a *blend* of licensed official feeds for the
leagues that have them, plus unofficial collection for the rest. That makes "match Real" a per-league question, and is why the
benchmark compares every candidate against Real **game by game**, not in aggregate. Open item: paste the lines about latency and
which sports use which source into this section.

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

## 5. A lead worth one evening: Kalshi's own live data

Kalshi documents `GET /live_data/milestone/{id}`, a batch variant, and `/milestones`, with an option for **player-level statistics for pro
football, pro basketball and college men's basketball** ([docs](https://docs.kalshi.com/api-reference/live-data/get-live-data)).
SIFT already reads Kalshi's public API; Kalshi settles contracts on licensed official data (Genius soccer, Aug 2026). Unknown:
the response fields (score? clock? period?), update speed, whether the data may be re-displayed beyond Kalshi's terms, and the rate
limit. `scripts/live-latency/kalshi-discover.mjs` samples it read-only (≤ 8 requests) so we can read the actual schema. If it carries
live score and clock, it is the only cheap source with a plausible licence path (a first-party, documented API), and it would slot
in as one more provider adapter.

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

Sequencing: (a) the owner's own-machine benchmark on the free league feeds (NHL, NBA, MLB) gives the first real Real-vs-feed numbers
and validates the harness; (b) Kalshi live-data sample; (c) Sportradar trial payloads and, if granted, a push evaluation re-run
through the same harness (a stream consumer logs the same `change` records); (d) Genius when it replies.

## 7. Decisions needed

1. Review and send (or edit) the two drafts in `docs/outreach/`; I have sent nothing.
2. Fill in the owner placeholders (name, entity, contact, whether SIFT is or will be commercial, expected audience).
3. Choose the benchmark night and run the harness on your MacBook.
4. Paste Real's founders' latency and per-sport source statements into §1.
