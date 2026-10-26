# Relay: expose `Date` to the browser

Status: **prepared for owner review. Nothing is merged, deployed or triggered.** Branch `claude/relay-expose-date`.

## The change

One line in `relay/core.ts` (`cors()`):

```diff
-    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At, Retry-After';
+    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At, Retry-After, Date';
```

Plus one small guard so the header is always there to read: `handleRelay()` is now a thin wrapper over the
unchanged logic (renamed `respond()`) that sets `Date` from the relay clock (`o.now ?? Date.now`) on any response
that does not already have one. Nothing else changes: no new headers, origins, caching, rate sharing or 429
handling. `relay/README.md` says why.

## Why

The quote-usability rule (`docs/sift3/QUOTE_DELIVERY.md`, validation rules on `origin/claude/sift3-build`) judges a
quote's age against the device clock after correcting it with the relay's own `Date` response header. The client
side (`origin/claude/quote-track`: `src/live/providers/kalshi.ts` computes `clockSkewMs = Date - received`,
`src/live/quoteUsable.ts` applies it) is written and tested, but a page on another origin can only read a response
header that is CORS-safelisted or listed in `Access-Control-Expose-Headers`. `Date` is neither, and the relay listed
only `X-Sift-Observed-At, Retry-After`. In production (Sift on `https://chmoses98.github.io`, relay on Vercel)
`res.headers.get('date')` is therefore `null`, the provider reports no skew, and the correction silently does
nothing: a phone with a wrong clock would withhold good quotes or show old ones.

## Evidence

### 1. Real Chromium, real cross-origin fetch (`scripts/relay-browser-date.mjs`)

Relay core behind a tiny Node http server, local fake upstream (no Kalshi calls; the fake confirms no `Origin`
reaches it), page served from a different localhost port, which the relay's allowed-origins configuration lists.
Chromium (`/opt/pw-browsers/chromium-1243`), `fetch(relayUrl)` from the page, `response.headers.get(...)`:

```
== BEFORE (origin/main): page http://127.0.0.1:33723  ->  relay http://127.0.0.1:34921
   on the wire: Date="Mon, 26 Oct 2026 23:28:21 GMT" Access-Control-Expose-Headers="X-Sift-Observed-At, Retry-After"
   200: status=200 Date=null X-Sift-Observed-At="2026-10-26T23:28:19.000Z" Retry-After=null Vary(control)=null
   429: status=429 Date=null X-Sift-Observed-At=null Retry-After="9" Vary(control)=null

== AFTER (working tree): page http://127.0.0.1:36711  ->  relay http://127.0.0.1:42637
   on the wire: Date="Mon, 26 Oct 2026 23:28:23 GMT" Access-Control-Expose-Headers="X-Sift-Observed-At, Retry-After, Date"
   200: status=200 Date="Mon, 26 Oct 2026 23:28:23 GMT" X-Sift-Observed-At="2026-10-26T23:28:21.000Z" Retry-After=null Vary(control)=null
   429: status=429 Date="Mon, 26 Oct 2026 23:28:23 GMT" X-Sift-Observed-At=null Retry-After="9" Vary(control)=null
   200: relay Date minus page clock = -122 ms
   429: relay Date minus page clock = -531 ms
PASS
```

Reading: BEFORE the header is on the wire (Node adds one, as Vercel does) yet the page reads `null`; AFTER the page
reads the current time. `Vary` (sent, not safelisted, not exposed) stays `null` in both, the control showing the
exposure list is what gates readability and that only `Date` was added. The script exits 1 unless BEFORE is null
and AFTER is readable and current (also checked: `Retry-After` and `X-Sift-Observed-At` still readable, no Origin
reached upstream). Verified to fail when `BEFORE_REF` already contains the fix.

### 2. Unit tests (`tests/relayDate.test.ts`, 19 tests; `tests/relay.test.ts` 27 tests, one expectation updated)

* exposed list is exactly `X-Sift-Observed-At`, `Retry-After`, `Date`;
* every response path carries the relay-clock `Date`, and allowed origins get `Access-Control-Expose-Headers`
  containing `Date` while disallowed origins get neither `Access-Control-Allow-Origin` nor the expose header:
  200 fresh, 200 from cache, 429 with and without upstream `Retry-After`, upstream 500, 502 malformed, 502
  unreachable, 504 timeout, 204 preflight, 400, 405, 403 disallowed origin (GET and preflight), 200 without Origin;
* Cloudflare Worker host and all Vercel handlers go through the same core.
Against `origin/main`'s `core.ts` 18 of the 19 fail (the one that passes only checks that a 429 keeps `Retry-After` and `no-store`).

### 3. Clock skew (`docs/relay-date/proposed-clock-skew.test.ts`, a PROPOSAL for the quote-track branch)

Not part of this branch's test run (it imports `src/live/*` from quote-track, which is not here, and quote-track
was not modified). It drives quote-track's real `KalshiApiProvider.fetchQuotes` + `quoteUsable`, with a stand-in
for the browser that hides every header the relay does not expose. Run in a scratch checkout of
`origin/claude/quote-track` (`cef55f69`) with the file copied to `tests/live/relayDateClockSkew.test.ts`:
19 of 19 pass; `tsc -p tsconfig.test.json` and eslint clean on it. It shows:

* with `Date` exposed, device clocks 30 s fast, 30 s slow, 10 min fast and 10 min slow all measure the skew exactly
  and judge a 3 s old quote usable and a genuinely old one (45 s in the 30 s context, 200 s in the 180 s context)
  unusable; with the Date header's 1 s truncation the age error stays under 1 s and no verdict changes;
* without `Date` exposed (the relay as it was): `clockSkewMs` is `undefined` for every offset; the 30 s fast clock
  wrongly withholds a 3 s old quote (looks 33 s old); the 30 s slow clock wrongly accepts a 45 s old quote (looks
  15 s) and a 200 s old list quote (looks 170 s); a slow clock, 30 s or 10 min, also wrongly withholds fresh quotes
  (they look to be from the future), and a clock 10 min fast withholds fresh ones.

To adopt: copy it to `tests/live/relayDateClockSkew.test.ts` on the quote-track branch.

## How to re-run

From the repo root (`npm ci` first):

```
npx vitest run tests/relay.test.ts tests/relayDate.test.ts     # unit tests
node scripts/relay-browser-date.mjs                            # Chromium, BEFORE = origin/main core, AFTER = this tree
node scripts/relay-browser-date.mjs --after-only               # no git needed
BEFORE_REF=<ref> node scripts/relay-browser-date.mjs           # compare against another ref
CHROME_PATH=/path/to/chrome node scripts/relay-browser-date.mjs
```

The script uses `playwright-core` and `typescript` already in `devDependencies`, defaults to
`/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (falls back to Playwright's own Chromium if absent), and
needs no network beyond localhost. It is not wired into CI or any workflow.

Local results on this branch: `tsc -b --noEmit` clean; eslint clean on the touched files; the two relay test files
46 of 46 pass; full suite (`npx vitest run`): 140 files passed, 3 skipped; 1655 tests passed, 3 skipped, 0 failed.

## Rollout notes

* Vercel deploys the relay from this repo with **Root Directory `relay`**, redeploying whenever `relay/` changes on
  `main`; `claude/*` and `live-quotes` never deploy (`relay/README.md`, `relay/vercel.json`). So **merging this to
  `main` is what deploys it**. That needs the owner's review; it has not been done and no workflow was triggered.
* After deploy, check with a browser from Sift's origin (or Sift's Data & provenance clock-skew diagnostic once
  quote-track is in): `fetch(relay + '/markets?...').then(r => r.headers.get('date'))` must be a date, not `null`.
* The client change on quote-track does not depend on the order: until the relay exposes `Date` it simply trusts the
  device clock (same as today); once exposed, it starts correcting. No coordinated release is needed.
* Rollback: revert the one line (and, if wanted, the wrapper); Vercel redeploys on the revert and the client goes
  back to trusting the device clock.

## Risks

* `Date` is exposed to allowed origins only (the same condition as the other two headers); a disallowed origin gets
  no CORS headers at all. The value is the relay's clock, which is not secret.
* HTTP-date resolution is 1 s; quote-track already ignores skews under 2 s. Transit time is ignored; that error is
  well below the smallest tolerance that matters here (the future tolerance is 5 s, the tightest limit 30 s).
* The relay's `Date` is only as right as the host clock (Vercel/Cloudflare: NTP-synchronised). A wrong relay clock
  would mis-correct every client by the same amount; `X-Sift-Observed-At` comes from Kalshi's own `Date` and is
  unaffected, so only the device-versus-relay offset would be wrong.
* The wrapper sets `Date` only if absent. Vercel and Cloudflare add their own `Date` regardless; both are the
  server clock, so whichever wins the value is equivalent. The explicit set removes the dependence on that.
* Responses stay `no-store`, so a stale `Date` is not reused by browser caches.

## Not proven

* **The deployed relay.** This sandbox cannot resolve the Vercel host, so nothing here touched the real deployment.
  Evidence is the relay core behind a Node http server, which is the same `Request`/`Response` code Vercel runs, not
  Vercel's edge itself. Still unproven: that Vercel's platform passes `Access-Control-Expose-Headers` through
  unchanged (it does not rewrite function headers as a rule) and sends `Date` to a real browser on the real origin.
* Not run: WebKit/Safari (the exposure rule is a standard Fetch/CORS behaviour, but only Chromium was exercised).
* The quote-track side was exercised only through the proposed test in a scratch checkout; that branch is unchanged.
