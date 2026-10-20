# Live-score latency harness

Measures **when each feed first shows each score change**, and lines it up against what the **Real** app shows on a
phone, during the same live games. Written because the session that built it had no network access: nothing here has
touched a real feed yet. `docs/LIVE_PUSH_ARCHITECTURE.md` §1 says how to read the numbers and what the first run decides.

## Run (owner, from a machine with open network access)

```
node scripts/live-latency/probe.mjs --feeds nhl-web,espn-nhl,nba-cdn,espn-nba,mlb-statsapi,espn-mlb \
     --contact you@example.com --interval 3000 --minutes 150 --out latency-run
```

* Pick **simultaneous live games** (a night with NHL + NBA, or MLB postseason + NHL; NFL on Sundays; college on Saturdays).
  The feed list is the menu in `feeds.mjs`; a vendor feed is a new entry written from a recorded sample.
* Open `http://<laptop-ip>:8787` on the phone running Real (same Wi-Fi). Each live game has two buttons:
  **Real updated** — tap when the score changes *in Real*; **Play happened** — tap when you see the scoring play
  (venue, or an over-the-air broadcast, the lowest-delay thing you have). Two people is better than one.
  Tap for **every** score change of the games you follow; marks are paired to feed changes by order.
* Stop it (or let `--minutes` end it), then: `node scripts/live-latency/analyze.mjs latency-run [--ref fastest|truth|<feed>]`.

## Reading the output

* `delay` = source minus reference (positive = later). `±` = the polling window: a feed polled every 3 s cannot show
  a difference smaller than about ±1.5 s. Do not quote a delay without its ±.
* `--ref fastest` = relative latency between feeds (always available). `--ref truth` = absolute, only as good as the
  "Play happened" taps. **Real's absolute latency** = Real's mark minus the truth mark.
* A game whose tap count differs from the feed's change count is listed **Unpaired** and excluded.
* `polls.jsonl` also records each response's `Age` / `Date` / cache headers: a large `Age` is a CDN holding the feed back.

## Limits and rules

* Real is observed by a person only. This harness does not automate or scrape any third-party app.
* Polling is deliberately polite (≥ 2 s per feed, backoff on 429/5xx, descriptive User-Agent with your contact). It is a
  short measurement for the owner, **not a licence to run an unlicensed feed as a product** (see the rights table in
  `docs/LIVE_PUSH_ARCHITECTURE.md`). Do not leave it running.
* `--override feed=http://127.0.0.1:…` points a feed at a local simulator for pipeline tests. Never a measurement.
* Extractors are unvalidated against live payloads (see `feeds.mjs`). If a feed shows zero rows in `polls.jsonl`, its
  shape drifted: fix the extractor, do not guess.
