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
| `api.elections.kalshi.com` | Kalshi live-data sampler (`kalshi-discover.mjs`, ≤ 8 requests) | once |
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

## Kalshi live data (read-only, once)

```bash
node scripts/live-latency/kalshi-discover.mjs --contact YOUR_EMAIL --out kalshi-sample
```

Samples Kalshi's `milestones` / `live_data` endpoints during a live slate to see what a first-party feed carries (scores? clocks?
player stats?). The query parameter names are unverified; the script prints every status so a wrong name is visible. Send me the
folder.

## Files

`probe.mjs` run + mark page · `analyze.mjs` matching and statistics · `feeds.mjs` extractors + rights table · `policy.mjs` run rules ·
`doctor.mjs` preflight · `kalshi-discover.mjs` sampler · tests: `tests/live/latency-harness.test.ts`.
