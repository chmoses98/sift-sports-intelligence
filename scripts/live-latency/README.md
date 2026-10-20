# Live-score latency harness — run it on your MacBook

Measures **when each feed first shows each score change** and lines it up with **what Real shows on a phone** during the same
live games. It reports delays with their uncertainty, and **which events a feed missed**. It has never touched a real feed:
the session that wrote it had no network access (validated only against a local simulator and synthetic tests). The first
thing `doctor.mjs` tells you is whether each extractor reads a real payload.

**Zero dependencies.** Plain Node (built-in `fetch`); no `npm install`.

## 1. One-time setup (about 5 minutes)

```bash
# 1. Node 20 or newer. Check; install only if missing or older:
node --version                 # want v20+ (v22 is what this was written on)
# if missing:  brew install node@22   (or https://nodejs.org)

# 2. Get the branch (nothing is installed, merged or deployed by this)
git clone --branch claude/live-scores-infrastructure https://github.com/chmoses98/sift-sports-intelligence.git sift-latency
cd sift-latency

# 3. Clock: System Settings → General → Date & Time → "Set time and date automatically" ON
```

## 2. Network domains this needs (nothing else is contacted)

| Domain | Needed for | When |
|---|---|---|
| `api-web.nhle.com` | NHL scoreboard (`nhl-web`) | NHL nights |
| `cdn.nba.com` | NBA scoreboard JSON (`nba-cdn`) | NBA nights |
| `statsapi.mlb.com` | MLB schedule/linescore (`mlb-statsapi`) | MLB nights |
| `api.elections.kalshi.com`, `external-api.kalshi.com` | Kalshi live-data sampler (`kalshi-discover.mjs`) — **terms-restricted, see below** | once, optional |
| `raw.githubusercontent.com` | SIFT's public quote feed, for the Kalshi identity check | with the sampler |
| `site.api.espn.com` | ESPN feeds — **off by default**; its terms reportedly bar automated access. Only with `--ack-prohibited` after you have read them | normally never |

Inbound: the mark page listens on port **8787** on your Mac so your phone can reach it. A macOS firewall prompt
("allow incoming network connections for node") appears once: choose Allow. It has no login, so use a trusted Wi-Fi only.
Print the list for any feed set: `node scripts/live-latency/doctor.mjs --domains --feeds nhl-web,nba-cdn`.
A cloud sandbox would need the same four hostnames added under *Allowed domains*.

## 3. Check before game time

```bash
node scripts/live-latency/doctor.mjs --feeds nhl-web,nba-cdn,mlb-statsapi --ack-unlicensed
```

One request per feed. You want `✓ <feed>: HTTP 200 … N game(s) read`. `?` with zero rows means no games today **or** the payload
shape differs from the extractor: save that response (`curl -s <url> > sample.json`) and send it to me. A `403`/`429` means
the provider is refusing: stop, do not retry, tell me.

`node scripts/live-latency/probe.mjs --plan --feeds nhl-web,nba-cdn --ack-unlicensed` prints the exact request rate and count
without making a request.

## 4. Run during live games

```bash
caffeinate -i node scripts/live-latency/probe.mjs \
  --feeds nhl-web,nba-cdn,mlb-statsapi --ack-unlicensed \
  --contact YOUR_EMAIL --minutes 150 --out latency-run
```

Pick a night with **several simultaneous live games** (NHL + NBA, or MLB postseason + NHL). Start it a few minutes before puck
drop/tip so every game has a baseline.

The tapping (best with two people; one person can do Real only):

1. On the phone running Real, open `http://<your-mac-ip>:8787` (`ipconfig getifaddr en0` prints the IP; or `localhost:8787` on the Mac).
2. Each live game has two rows:
   * **Real** — tap the **team that just scored** the moment the score changes **in Real**.
   * **Play** — tap the team when you **see the scoring play** (venue, or an over-the-air antenna, the lowest-delay thing you have).
     Streaming TV is 20–60 s behind: do not use it as truth.
3. One tap per score change; **undo** removes your last tap for that row. Do not tap a score that is only a correction.
4. Keep Real open on the game's own screen with the phone awake. Follow 2–3 games at most; accuracy beats volume.
5. Stop with Ctrl-C (or let `--minutes` end it).

## 5. Read the result

```bash
node scripts/live-latency/analyze.mjs latency-run                 # relative to the fastest observer
node scripts/live-latency/analyze.mjs latency-run --ref truth     # absolute, against your "Play" taps
node scripts/live-latency/analyze.mjs latency-run --ref nhl-web   # against a named feed
```

Send me the whole `latency-run/` folder (it contains scores, timestamps and your taps; no credentials). Then fill
`docs/LIVE_LATENCY_RESULTS.md`.

How to read it:

* **How events are matched.** Feeds are matched to each other by the **resulting score** (0-0 → 3-0 → 3-7 …), not by count.
  Your taps are matched to score changes by **team and time** with a monotone alignment: a missed tap or a step a feed skipped
  costs only that pair. A pair whose nearest same-team step is not clearly nearest is **low confidence** and kept out of the
  headline numbers.
* **± uncertainty.** A poll that first sees a change only proves it happened since the previous poll, so each observation is a
  window; a 5 s poll cannot resolve differences under about ±2.5 s. Human taps carry ±0.7 s. Quote no delay without its ±.
* **Missed events.** *Coverage* lists, per observer, how many score changes it never showed (two scores between polls, or a feed
  that skipped one) and how many of your taps/steps found no partner.
* **Relative vs absolute.** Without Play taps only relative delay is known (the fastest observer may itself be late). Real's
  absolute latency = Real's tap minus the truth tap.
* **Warnings** (thin sample, far-off pairs, Mac clock off) are part of the result: do not hide them when reporting.

## Conditions the harness enforces (provider terms and rate limits)

* a feed with no licence or only a non-commercial notice needs `--ack-unlicensed`; one whose terms are reported to prohibit
  automation needs its own `--ack-prohibited <feed>`;
* per-feed minimum interval (5 s league feeds, 15 s ESPN); you can only go slower;
* one request in flight per feed; **a 403/429 stops that feed for the run**; 5xx backs off exponentially; 4-hour cap;
* a User-Agent that names the tool and your contact address.

This is a short, internal, owner-run measurement, **not a service and not a licence**. Do not leave it running, do not raise the
rate, do not point it at a vendor outside that vendor's trial terms. Real is observed only by a person; nothing automates or
scrapes the Real app.

## Adding a vendor (trial/evaluation) feed

Add an entry to `EXTRACTORS` in `feeds.mjs` written **from a recorded sample** of the vendor's response, with
`rights: { status: 'LICENSED_TRIAL', minIntervalMs: <their limit>, note }` and `auth: { header: 'x-api-key', env: 'VENDOR_KEY' }`
(the key is read from your environment, never written to a file or log). Mind the trial quota: Sportradar's self-issued trial is
1,000 calls per rolling 30 days at 1 QPS, enough for roughly 80 minutes of one game at 5 s, so use it for payload shape and
spot latency, and ask sales for a push evaluation for the real benchmark (`docs/LIVE_VENDOR_EVALUATION.md`).

## Kalshi live data: one command, no tapping — read the warning first

**Kalshi's own terms restrict this** (Developer Agreement §3.1 no collecting/caching/sharing API data; §3.5 no monitoring or
benchmarking the API; Data Terms: no public display without written authorization). Details: `docs/LIVE_VENDOR_EVALUATION.md` §5.
The script therefore **refuses to run** without `--ack-kalshi-terms`, and **skips its cadence (latency) stage** without
`--ack-benchmark`. Recommended: send `docs/outreach/kalshi.md` first. If you decide to run a short read-only sample on your own
responsibility, it is one command (new clone or `git pull` in an existing one):

```bash
git clone --branch claude/live-scores-infrastructure https://github.com/chmoses98/sift-sports-intelligence.git sift-latency && cd sift-latency && \
node scripts/live-latency/kalshi-discover.mjs --contact YOUR_EMAIL --ack-kalshi-terms --out kalshi-sample
# add  --ack-benchmark --minutes 5  to also measure update cadence (needs a live game; best 7–10 pm ET with the NHL/NBA slate)
```

What it does automatically (no taps): lists open events per sport and maps them to Kalshi milestones; maps SIFT's real games (from
SIFT's public quote feed) to milestones; fetches `live_data`, `game_stats` (play-by-play) and `include_player_stats`; reports which
of score / clock / period / status / timestamp / players / plays each payload contains; and, with `--ack-benchmark`, polls one batch
request every 3 s for the chosen minutes and reports how often score and clock fields change and how old any provider timestamp is.
About 60–200 requests in total, 1.2 s apart. It prints a plain summary and saves `kalshi-sample/` (raw responses, `schema-*.json`,
`report.md`; public market metadata only, no credentials). Zip it (`zip -r kalshi-sample.zip kalshi-sample`) and send it back.

Domains: `api.elections.kalshi.com` (falls back to `external-api.kalshi.com`), and `raw.githubusercontent.com` (SIFT's own quote feed,
for the identity check; skip with `--no-sift-feed`). Stops at the first 429 or a 401/403 on live data (a 401/403 would mean live data is
not public, which is itself a blocker: SIFT holds no credential by design).

## Files

`probe.mjs` run + mark page · `analyze.mjs` matching and statistics · `feeds.mjs` extractors + rights table · `policy.mjs` run rules ·
`doctor.mjs` preflight · `kalshi-discover.mjs` + `kalshi-lib.mjs` Kalshi test · tests: `tests/live/latency-harness.test.ts`, `tests/live/kalshi-livedata.test.ts`.
