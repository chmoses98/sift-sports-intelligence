# DRAFT — Sportradar (NOT SENT)

**Before sending (owner):** create a developer account at developer.sportradar.com and issue the self-serve trial keys you want to
reference (the docs describe 1,000 calls / rolling 30 days, 1 QPS, internal evaluation only). Mention only the products you have
actually keyed. The documentation says Push Feeds are not self-issued and are sold through sales.

**To:** [Sportradar sales / the "contact sales" route on developer.sportradar.com or sportradar.com — no public address was confirmed]
**From:** [YOUR NAME], [ROLE], [ENTITY / SIFT]
**Subject:** Push-feed evaluation and fan-app/media licence enquiry: NBA, MLB, NHL, NCAA, tennis, soccer

Hello,

I am building SIFT, an independent mobile web app (installable PWA) for sports fans: live scores plus deeper game reading.
[One honest sentence about the product, e.g. "It also shows third-party prediction-market prices next to games for reference; it offers
no trading or wagering."] [Audience today / expected: ___ . Commercial status: ___ .]

I have trial keys for [LIST: e.g. NBA, MLB, NHL, NCAA Football, NCAA Men's Basketball, Soccer, Tennis] and have read that Push Feeds
and a production/media licence are arranged through sales. I would like to evaluate properly before committing. Could you help with:

1. **Push-feed evaluation.** A time-limited evaluation of the **push feeds** for [NBA first; then MLB, NHL, NCAA FB/MB, tennis, soccer].
   Which tier is required (the docs refer to Realtime), how long can the evaluation run, and what quota applies? Can an
   existing trial key reach the NBA push stream, as the NBA Push Events page suggests?
2. **Benchmarking.** I would like to measure event-to-delivery latency for scoring plays against consumer apps during live games.
   Is that permitted under the evaluation terms? What latency should we expect per sport (I saw the NCAA football
   `expected latency` values of 2/10/25/50 s), and what determines which one a given game gets?
3. **Licence path for a small independent app.** Is there a media / fan-app licence for non-betting use with early-stage,
   usage-based or revenue-share pricing? What are the minimum term and commitment? How is price determined (call frequency, volume,
   sports, MAU)?
4. **Initial scope.** We would start with **NBA** (and MLB/NHL as available) and add others later. Can scope and price be per sport,
   and can we add leagues mid-season? Which leagues are official-data-rights holders versus Sportradar-collected?
5. **NFL.** I understand the NFL's official data is distributed by another provider. Does Sportradar offer any NFL live data for media
   use, and with what caveats?
6. **Display rights.** Terms for public display in a free-to-view PWA: attribution, caching and storage, derived data (notifications,
   charts), redistribution limits, and what is allowed during a private beta before a production licence.
7. **Delivery and reliability.** Delivery format (HTTP streaming vs other), reconnection and replay of missed events, heartbeats, SLA,
   and recommended handling of corrections.
8. **Pricing.** An indicative range for the smallest licensable scope.

We ingest on our own servers, do not resell or redistribute the raw feed, and can share our technical approach. I am available
[WINDOWS] for a call.

Thank you,
[NAME] · [ENTITY] · [EMAIL] · [PHONE] · [URL]
