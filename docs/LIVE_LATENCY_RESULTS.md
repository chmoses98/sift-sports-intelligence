# Live latency results — Real vs candidate feeds

**Status: EMPTY. No run has happened.** Nothing in this file is a measurement until a run is pasted below. Claimed speeds
(vendor pages, blogs, press) do not belong in the tables. How to run: `scripts/live-latency/README.md`. Decision rules:
`docs/LIVE_VENDOR_EVALUATION.md` §6.

## Acceptance (fixed before any data)

Across ≥ 30 matched score changes spanning ≥ 3 sports, a source is **Real-like** if median delay vs Real ≤ 3 s, p90 ≤ 8 s and
missed-event rate ≤ 5 %, per league. Delays are reported with ± and with low-confidence pairs separate.

## Run log (one block per run)

```
Run id:            YYYY-MM-DD-<slate>
Operator(s):       <names>   Real app version / phone: <…>
Machine / OS / Node: <…>     Wi-Fi: <…>     Clock sync verified: yes/no
Command:           <exact probe.mjs command>
Games followed:    <list, with league>
Feeds:             <ids, intervals, rights status>
Duration:          <start–end local time>
Files:             latency-run-YYYY-MM-DD/  (changes.jsonl, polls.jsonl, marks.jsonl)
Notes:             <missed taps, app glitches, delays in the broadcast, feed errors, 403/429s>
```

## Per-run results (paste `analyze.mjs` output)

### Relative to the fastest observer (`--ref fastest`)

| source | n | median | p90 | max | min | ± |
|---|---|---|---|---|---|---|
| | | | | | | |

### Absolute, against Play taps (`--ref truth`) — only if Play taps exist

| source | n | median | p90 | max | min | ± |
|---|---|---|---|---|---|---|
| | | | | | | |

### Coverage / missed events and warnings

| observer | steps | seen | missed | missed rate |
|---|---|---|---|---|
| | | | | |

Warnings from the analyser (verbatim): <…>

## Per-sport conclusion (fill only from the tables above)

| Sport | Best measured source | Median vs Real (±) | p90 | Missed | Rights position | Monthly cost | Verdict |
|---|---|---|---|---|---|---|---|
| NFL | | | | | | | no qualifying source yet |
| MLB | | | | | | | no qualifying source yet |
| CFB | | | | | | | no qualifying source yet |
| NBA | | | | | | | no qualifying source yet |
| NHL | | | | | | | no qualifying source yet |
| Soccer | | | | | | | no qualifying source yet |
| CBB | | | | | | | no qualifying source yet |
| Tennis | | | | | | | no qualifying source yet |

## What would change the plan

* Free league feeds within the acceptance test for NHL/NBA/MLB → a private-beta ingestion service is worth building while licences are sought.
* Free feeds clearly slower than Real → only a licensed push feed can close the gap; pursue Sportradar/Genius for those leagues.
* Real faster than every feed → ask what is in the TBPN statement about its sources and reconsider vendors.
* Any 403/429 or terms objection → stop that feed; record it here.
