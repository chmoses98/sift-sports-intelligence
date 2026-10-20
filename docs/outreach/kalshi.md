# DRAFT — Kalshi (NOT SENT)

**Why this exists.** Kalshi's Developer Agreement (v1.1) and Data Terms of Use, read on 2026-10-20, do not permit collecting, caching or
publicly displaying API data without Kalshi's written authorization (Agreement §3.1, §3.5; Data Terms §II), and Kalshi's game data is
Sportradar-sourced. This asks for the authorization, or a clear no. See `docs/LIVE_VENDOR_EVALUATION.md` §5.

**Owner decision before sending:** paragraph 4 discloses that SIFT already reads Kalshi's public market data (a short-lived cache and a
public quote feed). That is honest and will surface in any licence conversation anyway, but it is your call, ideally after a lawyer has
read the two documents. **To:** [Kalshi API / developer-relations or business-development contact: no public intake address was
confirmed; use the support/contact route on kalshi.com or docs.kalshi.com, or an introduction].

**From:** [YOUR NAME], [ROLE], [ENTITY / SIFT]
**Subject:** Written authorization request: displaying Kalshi live sports data (live_data / game_stats) in an independent research app

Hello,

I run SIFT, an independent sports research web app (installable PWA). [One honest sentence: it reads Kalshi's prediction-market prices
next to games for reference; it offers no trading, wagering or order routing, and holds no Kalshi credentials.]

1. **What we would like to do.** Show **live game state** (score, game clock, period, status, and, where available, play-by-play and
   player stats) from Kalshi's `live_data`, `live_data/batch` and `game_stats` endpoints on public game pages and in notifications,
   with attribution to Kalshi [and to the underlying data provider as required].
2. **Authorization.** The Developer Agreement (§3, §3.1) limits API use to a member's own trading and bars caching and sharing data
   without Kalshi's prior written authorization; the Data Terms bar public display. Is there a licence, partner programme or written
   authorization under which an independent app may display this data? On what terms (fee, attribution, volume, duration)?
3. **Upstream rights.** `game_stats` is Sportradar-sourced. Does Kalshi's authorization extend to redisplay of that data, or must we also
   license it from Sportradar/Genius? Which sports and leagues does `live_data` cover, including NFL, NBA, college football and
   basketball, soccer and tennis?
4. **Our existing use, for clarity.** SIFT already reads Kalshi's *public, unauthenticated* market-data endpoints server-side: a
   short-lived read-through cache and a quote snapshot published every few minutes. Does the Developer Agreement apply to reading
   public endpoints without an account, and is that existing use acceptable, or would you prefer we change it?
5. **Evaluation.** May we sample `live_data` for a few live games to confirm fields and update frequency before committing, given §3.5?
   What latency should we expect for scoring plays, and is there a streaming (WebSocket) option for live data?
6. **Public statements.** §6.4 requires approval of public statements about Kalshi; how should we describe the relationship?

I can share screenshots and our technical approach. Happy to take a call: [WINDOWS].

Thank you,
[NAME] · [ENTITY] · [EMAIL] · [PHONE] · [URL]
