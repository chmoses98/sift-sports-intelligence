# Real-document fixtures for the SIFT 3.0 browser tests

Byte-exact copies of the **public documents** the app reads from `raw.githubusercontent.com` (research publications, board and explorer documents,
the live-quote feed), captured once, sanitized, deduplicated and committed, so that the real-document Playwright specs run **offline, on a fixed
clock, with the same answers on any day** (locally and in `.github/workflows/v3-ci.yml`).

| | |
|---|---|
| Families | `stat`, `team`, `game`, `player`, `props` (never merged: they were captured at different instants) |
| URLs / unique documents | 799 URLs, 656 unique documents (95.5 MB if each family kept its own copy, 74.0 MB deduplicated) |
| Committed size | 7,602,573 bytes of gzip packs + 544 KB of index and manifest = 7.9 MB for the directory (largest file: `packs/props-1.bin.gz`, 5.0 MB; the limit is 16 MB per file, the CI budget 20 MB in all) |
| Verified by | `node scripts/v3-fixtures/verify.mjs --max-total-mb 20` (CI "static" job and `tests/v3/fixtures-bundle.test.ts`) |

## Layout

```
fixtures/real/
  README.md        this file
  MANIFEST.json    provenance and capture metadata (for people and audits): sources, capture window and clock per family, tool version,
                   and per family every document: original URL, status, sha256, bytes, content type, fetch time
  index.json       the machine index (small, plain JSON; what loaders read)
  packs/<name>.bin.gz   gzip of the concatenated, byte-exact document bodies ("document packs")
```

### `index.json` (schema `sift.v3.fixtures.index.v1`)

```jsonc
{
  "schema": "sift.v3.fixtures.index.v1",
  "packs": { "game-1": { "file": "packs/game-1.bin.gz", "sha256": "<of the .gz file>", "compressed_bytes": 166915, "raw_bytes": 2320881, "documents": 15 } },
  "documents": { "<sha256 of the body>": { "pack": "game-1", "offset": 0, "length": 41234 } },   // offset/length into the DECOMPRESSED pack
  "families": {
    "game": {
      "clock": { "captured_at": "2026-10-26T23:25:00Z", "basis": "why this instant" },       // the instant the family's documents describe
      "urls": { "https://raw.githubusercontent.com/...": { "status": 200, "sha256": "<document hash>" } }   // URL -> document; no sha256 = answered with this status and no body
    }
  }
}
```

* Each unique document body is stored **once** (keyed by its sha256), in the pack of the first family (order `stat, team, game, player, props`) that
  references it. Several URLs, in one family or several, can map to one document.
* A URL that is not in a family's `urls` was never captured for it: **answer 404** (that is exactly what the live publication did not have either).
* Bodies are never altered. The only transformations are the documented ones the test helpers apply at test time (`freshQuotes`: re-stamps the
  quote observation time; `playerFeeds`: pins `captured_at`/`observed_at`; both leave every price untouched).
* Packs are written deterministically (documents sorted by sha256, gzip level 9, no timestamps), so re-packing unchanged inputs gives identical files.

### Reading it from a browser (preview shim)

`scripts/v3-fixtures/webLoader.mjs` is the reference reader (no Node APIs; `fetch` + `DecompressionStream`):

```js
import { openWebBundle } from '/scripts/v3-fixtures/webLoader.mjs';           // or copy the file next to your shim
const bundle = await openWebBundle('/path/to/fixtures/real/');                  // directory holding index.json and packs/
const game = bundle.family('game');
game.clock.captured_at;                                                         // pin the page clock here
const doc = await game.get('https://raw.githubusercontent.com/...');            // { status, body: Uint8Array, text() } | null (null = answer 404)
```

By hand: fetch `index.json`; for a URL look up `families[f].urls[url].sha256`, then `documents[sha256]` gives `{pack, offset, length}`; fetch
`packs[pack].file`, gunzip the whole file once (`new Response(blob.stream().pipeThrough(new DecompressionStream('gzip')))`), cache the bytes by pack
name, and slice `[offset, offset + length)`. The `.gz` files are served as plain binary (no `Content-Encoding`). All bodies are UTF-8 JSON.

## Families, specs and clocks

| Family | Specs | Clock pin (`clock.captured_at`) | URLs | Docs |
|---|---|---|---|---|
| `stat` | `v3-stat`, `v3-stat-trend` | 2026-10-26T23:25:00Z | 62 | 62 |
| `team` | `v3-team` | 2026-10-26T23:25:00Z | 55 | 55 |
| `game` | `v3-game`, `v3-quotegate`, `v3-hit-targets`, `v3-rails`, `v3-welcome`, `v3-timezones`, `v3-unavailable`, `v3-nontradable`, `v3-saved-reopen` (Prop Discovery group) | 2026-10-26T23:25:00Z | 61 | 61 |
| `player` | `v3-player`, `v3-saved-reopen` (Player group) | 2026-10-26T19:00:00Z (a test pin, see its `basis`) | 60 | 60 |
| `props` | `v3-props`, `v3-props-avail`, `v3-props-budget`, `v3-scores`, `v3-starts`, `v3-nontradable` (Prop Discovery group), `v3-saved-reopen` (Prop Discovery group), `v3-fidelity` (PD1 to PD6, ROOT-Home, ROOT-Games, ROOT-Explore) | 2026-10-28T14:58:10Z | 561 (8 answer 404) | 553 |

(All under `e2e/`, `.spec.ts`.) The `v3-nontradable` and `v3-saved-reopen` Prop Discovery groups read the `props` family: its 48-hour horizon holds games the live-quote
feed has files for (priced rows) and games it has none for (rows that print "—"), see below. The other groups of those two specs still read `game` and `player`.

### The `props` family (captured 2026-10-28 14:58:10 UTC, window to 15:13:05)

One capture, one scratch cache, one instant: `node scripts/v3-fixtures/sweep.mjs --dir D` (the horizon part), then the props specs with `V3_REAL_FEEDS=live V3_FEED_CACHE=D V3_FEED_RECORD=...`,
then `pack`. The clock pin is the capture start (`captured_at.txt`), the window and tool are in `MANIFEST.json` (`captured_start`, `captured_end`, `capture_tool`). It was never merged with
documents of another instant; the other four families, their pins and their documents are byte-for-byte what they were.

| | 48 hours | 7 days | All upcoming |
|---|---|---|---|
| Games Prop Discovery reads (the board lists a market, not started at the pin) | 26 (NBA 15, CFB 5, NHL 4, MLB 1, NFL 1) | 165 | 289 (CFB 238, NBA 32, NFL 14, NHL 4, MLB 1) |
| Priced: the feed has a live-quote file with asks (NFL, NHL, MLB) | 6 | 19 | 19 |
| Not priced: no live-quote file (NBA, college football; the app asks, gets a 404 and prints "—") | 20 | 146 | 270 |

Every game of every horizon has its contract document (`event_detail`), and every game within 7 days of the pin its research document (availability) where the publication has one;
the specs read the rest (identity tables, rankings, profiles, logs, projections) as they run. The live feed in this capture lists only `active` markets with an ask, so a quote that is
`inactive`, `determined` or missing an ask is made by the specs (`freshQuotes` `status` / `omit`, controlled modifications named as such in their test titles), as before.
`tests/v3/propsCapture.test.ts` states what a props capture must hold (priced and unpriced games in every horizon, every game readable, the facts the specs derive from), so a refresh
that lacks one fails there instead of making a spec skip. The specs name no player, club, event or count of one capture: they derive them from the family's own documents
(`e2e/support/propsFixture.ts`), so the family can be refreshed without editing a spec.

The exact capture window (`captured_start` / `captured_end`), the reason for each pin, the source repositories and branches, the capture tool version
and git sha are in `MANIFEST.json`. The first import of the five pre-existing worker caches had no capture journal, so their per-document fetch time is the
cached file's modification time and status/content type are those the helpers answered with (the manifest says so in `capture_method`); caches filled
with `capture` or `V3_REAL_FEEDS=live` carry real status, content type and fetch time.

## How the specs use it

```ts
await useRealFeeds(page, { family: 'game' });          // e2e/support/realFeeds.ts: raw.githubusercontent.com requests are answered from the bundle
await freshQuotes(page, { family: 'game' });            // test transformation: live-quote observation times re-stamped to the family clock
await page.clock.setFixedTime(feedNow('game'));         // the family's clock pin from the manifest
```

`usePlayerFeeds(page)` (e2e/support/playerFeeds.ts) uses the `player` family. A spec that edits a real document must read it with
`feedDocument(family, url)`, **not** `route.fetch()` (which goes to the network). Sources, in order: `V3_REAL_FEEDS=live` (refill a scratch cache from the
network), `V3_FEED_CACHE=<dir>` (serve only that scratch cache, e.g. an `unpack` output), otherwise the committed bundle. `V3_FEED_NOW=<ISO>` overrides the clock.
`V3_FEED_RECORD=<file>` appends `HIT <url>` / `MISS <url>` for every document request (this is how the documents a spec needs are found).

## Refreshing a family

Captures change what the specs see (new games, new prices), so refresh a whole family at once, then re-run its specs and update any assertion that is
about the data (never silently).

```bash
# 1. fill a scratch cache for ONE family: the specs discover the URLs they need and fetch them (curl, so the environment's proxy applies)
rm -rf /tmp/game-cache && V3_REAL_FEEDS=live V3_FEED_CACHE=/tmp/game-cache V3_FEED_RECORD=/tmp/game-req.txt V3_PROJECTS=v3-phone \
  npx playwright test -c playwright.v3.config.ts e2e/v3-game.spec.ts e2e/v3-quotegate.spec.ts e2e/v3-hit-targets.spec.ts
#    (or refetch exactly what is committed: node scripts/v3-fixtures/capture.mjs --family game --dir /tmp/game-cache --from-bundle)
#    /tmp/game-cache now holds the documents, journal.jsonl (url, status, content type, sha256, fetch time) and captured_at.txt (the clock pin)
#    a Prop Discovery (props) capture starts with the sweep, in the SAME cache and at the same instant, so that which games are priced or unpriced is a property of the instant and not of what a spec
#    happened to scroll to:  node scripts/v3-fixtures/sweep.mjs --dir /tmp/props-cache   (then run the props specs live into it; pack with --requests <spec log>,/tmp/props-cache/sweep-urls.txt)
# 2. pack it: sanitization scan (fails on any hit), dedup, packs, index, manifest
node scripts/v3-fixtures/pack.mjs --family game --cache /tmp/game-cache --requests /tmp/game-req.txt \
  --specs e2e/v3-game.spec.ts,e2e/v3-quotegate.spec.ts,e2e/v3-hit-targets.spec.ts --clock-basis "why this instant"
# 3. check and run offline
node scripts/v3-fixtures/verify.mjs
V3_PROJECTS=v3-phone npx playwright test -c playwright.v3.config.ts e2e/v3-game.spec.ts
```

Never copy documents between families. Clock pin: `captured_at.txt` of the scratch cache (the capture start) unless `--clock` says otherwise.

## Tools (`scripts/v3-fixtures/`)

| Tool | Does |
|---|---|
| `capture.mjs --family F --dir D (--urls file \| --from-bundle)` | live fetch through curl into scratch cache `D` (files named by SHA-1 of the URL) + `journal.jsonl` + `capture.json` + `captured_at.txt` |
| `sweep.mjs --dir D [--family props]` | the horizon part of a Prop Discovery capture: every board, and for every game Prop Discovery would read its contract document (all horizons), its research document (within 7 days) and the live-quote file the feed has for it; writes `capture.json` and `sweep-urls.txt` (pass to `pack --requests`) |
| `pack.mjs --family F --cache D (--requests logs \| --urls file) [--clock ISO --clock-basis text --specs a,b]` | cache -> one family of the bundle; scans, dedups, drops documents no spec requested; other families are kept |
| `verify.mjs [--dir fixtures/real] [--max-total-mb N]` | file sizes (< 16 MB), pack hashes, every document's sha256/length, index = manifest, URL hygiene, JSON shapes, clocks, orphan/missing documents, sanitization re-scan |
| `unpack.mjs --family F --out D` / `--family F --url U` | write a family back as a scratch cache (`V3_FEED_CACHE=D` serves it) / print one document |
| `webLoader.mjs` | the browser-side reader (reference for the preview shim) |
| `lib.mjs` | shared code (format, scan rules, writer, offline reader) |

## Sanitization

`pack` (and `verify`) scan every document body, every URL, `index.json` and `MANIFEST.json` and **fail on a hit**: private keys, GitHub / AWS / Google /
Slack / payment tokens, JWTs, `Authorization` headers and bearer/basic credentials, API-key and secret fields, e-mail addresses, phone numbers, SSN-shaped numbers,
credentials or secrets in URLs, private-network / localhost / `file:` URLs. URLs must be `https://raw.githubusercontent.com/...`. Bodies must be UTF-8 JSON.
A reviewed false positive can be exempted, one exact match at a time and with a reason, in `scripts/v3-fixtures/sanitize-allow.json` (`{"allow":[{"rule","match","reason"}]}`);
there are none today. Documents that no spec requested are not committed.

The documents are public publications: they name teams, players and public statistics, nothing private.

## Provenance and terms

Public data from the repositories and branches listed under `sources` in `MANIFEST.json` (the Sift data pipeline's publications per sport, the router
registry, the CFB research signals and the `live-quotes` branch of this repository), fetched from `raw.githubusercontent.com`. They are kept only so the
test suite can reproduce real-document behaviour offline; prices and probabilities in them describe the captured instants, are not current, and are not
a recommendation. Use stays subject to the publishers' own terms and those of the third-party sources they cite; no endorsement by or affiliation with any
league, team, player, data provider or exchange is implied.
