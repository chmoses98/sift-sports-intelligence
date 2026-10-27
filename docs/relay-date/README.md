# Relay: expose `Date` to the browser

Status: **prepared for owner review. Nothing is merged, deployed or triggered.** Branch `claude/relay-expose-date`.
Hardened 2026-10-27 after the owner decided to retain the `Date` wrapper if it provably preserves every response.

## The change

One line in `relay/core.ts` (`cors()`):

```diff
-    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At, Retry-After';
+    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At, Retry-After, Date';
```

Plus one small wrapper so the header is always there to read: `handleRelay()` is a one-line wrapper over the
unchanged logic (renamed `respond()`) that passes the answer through `withRelayDate()`, which sets `Date` from the
relay clock (`o.now ?? Date.now`) at the moment of serving. Nothing else changes: no new headers, origins, caching,
rate sharing or 429 handling. `relay/README.md` says why.

Owner decision (2026-10-27): the wrapper is RETAINED because it provably preserves every existing response (below).
It was hardened for that: `withRelayDate()` replaces any `Date` already on the answer (so a replayed or inherited one
can never go out as current), never throws, and never mutates a `Response` it cannot mutate. It sets the header in
place when the headers are mutable and verifies the value stuck; if `Headers.set` throws (Fetch "immutable" guard:
`fetch()`, `Response.error()`, `Response.redirect()`) or is silently ignored, it builds a new `Response` (same status,
statusText, body stream and headers plus `Date`); if even that is impossible (status 0, a body already read) the
answer goes out unchanged with no `Date` and the host adds its own. A clock that throws or returns NaN/Infinity cannot
make it throw (throws: no `Date`; non-finite: host wall clock). Today `respond()` builds a fresh mutable `Response` on
every path, so the copy branch is a guard for future edits and other runtimes, not something production exercises.

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

All numbers below were produced on 2026-10-27 in this sandbox on branch commit `79ab68db` (relay code `6b90ccf6`).

### 1. Behaviour preservation: differential test (`tests/relayDifferential.test.ts`, 105 tests)

`tests/fixtures/relay/coreBaseline.ts` is a frozen, byte-identical copy of `origin/main:relay/core.ts` (`2f315261`,
header comment aside). The test runs the baseline and the branch core with the SAME requests, the SAME fake upstream
(a fresh instance per run; the outgoing upstream URL and headers are compared too) and the SAME injected clock, and
compares for every answer: status, statusText, ALL response headers (so `Cache-Control`, `Vary`, `Retry-After`,
`X-Sift-Observed-At`, `Content-Type`, every CORS header) and the body bytes (hex). The only differences allowed are:
the branch has a `Date` equal to the injected clock at the moment of serving, and on allowed-origin answers
`Access-Control-Expose-Headers` is the baseline's list plus `, Date`. A request that makes the baseline throw must
make the branch throw the same error. The baseline never has a `Date` of its own.

* Single requests, 2,996 cases compared: 7 methods (GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE) x 8 Origins
  (3 allowed, evil, `null`, trailing-slash, upper-case, absent) x 18 paths (valid `tickers` / `series_ticker` /
  `event_ticker` / trailing slash / `/api/markets` / duplicated params, and 11 refusals: wrong path, no selector, bad
  status, limit 0 and 1001, lowercase ticker, unknown param, 101 tickers, 513-char cursor, `/`); for every request that
  can reach upstream, 36 upstream outcomes (200 with/without Date, Age, junk Age, junk Date, Retry-After, charset,
  no content-type, upstream cache/vary/CORS/cookie headers and a spoofed `x-sift-observed-at`, multibyte and invalid
  UTF-8 and 200 KB bodies; 200 malformed/HTML/no `markets`/empty; 204; 429 with/without/junk/zero `Retry-After` and an
  HTML body; 500, 503, 502, 404, 403, 301, 304; fetch rejecting with TypeError, TimeoutError, AbortError, a non-Error;
  `Response.error()`; `Response.redirect()`) x with and without the shared cache. Includes the cases where the
  baseline itself throws (`Response.error()` status 0, 304 with a body: RangeError / TypeError); the branch throws the
  identical error.
* Preflight (OPTIONS with `Access-Control-Request-*` headers) over every origin and path; HEAD (stays the 405 it was,
  never reaches upstream).
* Sequences with a moving clock: miss, hit, hit, hit, expiry over each upstream outcome, with the relay's
  `MemoryRelayCache` and with a Cloudflare-style cache that returns a fresh clone on every `get`; an error followed by
  a success (errors are not cached).
* Six callers at once (allowed, other allowed, none, evil, duplicate, OPTIONS) sharing one in-flight upstream call
  (exactly one upstream call asserted in both cores), over 9 upstream outcomes, with and without the cache.
* Real `fetch()` responses (Node/undici, whose `Headers` are immutable) as the upstream and as the object a cache
  returns.
* Unusable clocks (`NaN`, `Infinity`, throwing) over 3 methods x 3 origins x 9 paths x 5 outcomes: never an error the
  baseline did not have, and nothing but `Date` differs.

Result: 0 differences. Mutation checks: making the wrapper also set `Cache-Control` makes 99 of the 105 fail; with the
immutable-headers fallback removed (`tests/relayDateServe.test.ts`) 3 tests fail.

Immutable and shared `Response` objects (`tests/relayDateServe.test.ts`, 17 tests): `Response.error()` and
`Response.redirect()` really throw `TypeError: immutable` on `headers.set` in this runtime (Node 22), and the wrapper
neither throws nor touches them (redirect: copied with `Location` kept and the original left without a `Date`;
`Response.error()`: returned as is); a `fetch()` response is copied with status/headers/body intact and its upstream
`Date` replaced; an immutable response whose body was read is returned as is; a runtime that silently ignores
`headers.set` is detected by reading it back and the response is copied; null-body statuses stay null-body. The
stored copy inside a cache is never altered (a cache that keeps the `Response` it was given and returns clones: after
serving four callers it still holds only `content-type` and `x-sift-observed-at`). Five concurrent callers sharing one
upstream call get five different `Date`s (a clock that ticks per stamp), each its own `Access-Control-Allow-Origin`
(or none), and each can read the full body; two sharers of a 429 each keep `Retry-After` and `no-store`. Why there is
no leak: `respond()` builds a brand-new `Response` for every caller from a `clone()` of the shared one and the `Date`
is set on that new object only.

### 2. Cached and shared answers: `Date` is the relay's clock at serve time (`tests/relayDateServe.test.ts`)

A fake clock at 18:00:30 and a fake Kalshi that answered at 18:00:10 with `Age: 2` (observed at 18:00:08). For both the
Vercel-style `MemoryRelayCache` and a Cloudflare-style cache, a miss then hits 1 s, 3 s and 4.9 s later and a refetch
at 5 s (TTL expiry; two upstream calls in all) are served with `Date` = 18:00:30, :31, :33, :34.9, :35 (the clock at
each serve), while `X-Sift-Observed-At` stays 18:00:08 on every hit. A client's `Date - X-Sift-Observed-At` is
therefore 22 s, 23 s, 25 s, 26 s: the age grows with time in the cache and is never reset to fresh. The proposed
client test (section 4) takes the same shape through the real quote-track provider and rule: a hit 1, 4, 20 or 40 s
after the first answer is judged exactly `original age + time in cache` old, for device clocks 0, -30 s, +10 min and
-2 h, and a 3 s old quote is usable at 20 s in the cache and withheld at 40 s in the 30 s context.

Edge / CDN semantics. Every answer a client reads data from carries `Cache-Control: no-store`: 200 (fresh and cached),
429, 500 passed on, 502 (malformed and unreachable), 504, 400, 405, 403 (tested). The one exception is the CORS
preflight (204), unchanged from main: it has no `Cache-Control`, the browser keeps it for `Access-Control-Max-Age`
(24 h) and never reads its `Date`. A cache that obeys `no-store` (browsers; and, per Vercel's documented behaviour that its CDN only caches function
output the function marks cacheable, Vercel's edge: NOT verified here) does not store or replay an answer, so `Date`
is never replayed. If an
intermediary DID ignore `no-store` and replay an answer, it would replay `Date` and `X-Sift-Observed-At` together, and
the client would be misled in the unsafe direction: `Date - observed-at` is unchanged, so the replayed answer looks as
fresh as when it was produced (section 4: a 60 s old replay of a 3 s old quote is judged 3 s old and shown, where
without the Date correction and with a right device clock it would correctly be 63 s old and withheld). **The
client-side rule does NOT discard such a skew** (see section 4: on the current quote-track head only a skew under 2 s
is discarded; there is no upper bound and no plausibility check). What the client does is: fetch with
`cache: 'no-store'` and `credentials: 'omit'` (the browser's own HTTP cache is bypassed; measured in both engines: the
request carries `Cache-Control: no-cache` and causes no preflight), and rely on the relay's `no-store`. Neither can
be verified against the deployed Vercel host from here (see "Not proven").

### 3. Real browsers, real cross-origin fetch (`scripts/relay-browser-date.mjs`, `scripts/relay-webkit-date.py`)

Relay core behind a tiny Node http server, local fake upstream (no Kalshi calls; the fake confirms no `Origin` reaches
it), a page served from a different localhost port which the relay's allowed-origins configuration lists, and a
second page on a third origin it does not list. The page runs the fetches the Sift client makes (`cache: 'no-store'`,
`credentials: 'omit'`) and reads `response.headers.get(...)`. Rows: a fresh 200; the same read 2.1 s later (answered
from the relay's cache: one upstream call for both); 429; upstream 500; malformed upstream (502); unreachable upstream
(502); refused query (400); a read with a custom request header (forces a preflight, which the relay does not grant,
so it must be blocked both before and after: Sift sends a plain GET); and the third-origin page.

Chromium 153 (`/opt/pw-browsers/chromium-1243`), exit 0:

```
== BEFORE (origin/main): page http://127.0.0.1:33439  ->  relay http://127.0.0.1:42257
   on the wire: Date="Tue, 27 Oct 2026 18:15:39 GMT" Access-Control-Expose-Headers="X-Sift-Observed-At, Retry-After"
   200 fresh                  status=200 Date=null X-Sift-Observed-At="2026-10-27T18:15:35.000Z" Retry-After=null Cache-Control="no-store" Vary(control)=null
   200 cached (2.1 s later)   status=200 Date=null X-Sift-Observed-At="2026-10-27T18:15:35.000Z" ...
   429                        status=429 Date=null X-Sift-Observed-At=null Retry-After="9" ...
   500 from upstream / 502 malformed / 502 unreachable / 400 refused query: Date=null on all four
   custom header (preflight)  blocked (TypeError) ;  third-origin page: blocked (TypeError)
== AFTER (working tree): page http://127.0.0.1:39449  ->  relay http://127.0.0.1:38061
   on the wire: Date="Tue, 27 Oct 2026 18:15:43 GMT" Access-Control-Expose-Headers="X-Sift-Observed-At, Retry-After, Date"
   200 fresh                  status=200 Date="Tue, 27 Oct 2026 18:15:40 GMT" X-Sift-Observed-At="2026-10-27T18:15:38.000Z" Vary(control)=null
   200 cached (2.1 s later)   status=200 Date="Tue, 27 Oct 2026 18:15:42 GMT" X-Sift-Observed-At="2026-10-27T18:15:38.000Z"
   429                        status=429 Date="Tue, 27 Oct 2026 18:15:42 GMT" Retry-After="9"
   500 / 502 / 502 / 400      Date="Tue, 27 Oct 2026 18:15:42 GMT" (x3), 18:15:42 ... all readable
   relay Date minus page clock: -618, -757, -788, -798, -815, -836, -862 ms (all rows)
   cached answer: Date is 2 s later than the first answer's; X-Sift-Observed-At unchanged
   custom header (preflight): blocked (TypeError) ;  third-origin page: blocked (TypeError)
PASS
```

The relay saw the `Cache-Control: no-cache` request header the browser adds for `cache: 'no-store'` and exactly one
OPTIONS (the custom-header row only); the plain reads caused no preflight. BEFORE the header is on the wire (Node
adds one, as Vercel does) yet the page reads `null` on every row; AFTER every row reads the current time. `Vary` (sent,
not safelisted, not exposed) stays `null` in both: the exposure list is what gates readability and only `Date` was
added. The script exits 1 unless BEFORE is null on every row and AFTER is readable and current on every row, the
cached row is 1-4 s newer than the first answer with the same `X-Sift-Observed-At`, `Retry-After` and
`X-Sift-Observed-At` are still readable, the third origin is blocked and no Origin reached upstream.

WebKit, a real WebKit engine: WebKitGTK 2.52.6 (`WebKitWebDriver` 2.52.6 + MiniBrowser under `xvfb-run`; ports 4466
WebDriver, 8776 page), same servers, same rows, `python3 scripts/relay-webkit-date.py`, exit 0, with the same result as
Chromium: BEFORE `Date=null` on all seven rows (and the custom-header and third-origin controls blocked), AFTER
`Date` readable on all seven rows with relay-minus-page-clock between -833 ms and -437 ms, the cached row 2 s newer than
the first answer with an identical `X-Sift-Observed-At`, `Retry-After="9"` on the 429, `Vary` still `null`.
This is WebKitGTK, not Safari on an iPhone: it shares WebKit's CORS and Fetch implementation but not the iOS build,
so the iPhone result is strongly indicated, not directly measured.

### 4. Clock offsets (`docs/relay-date/proposed-clock-skew.test.ts`, a PROPOSAL for the quote-track branch)

Run against the CURRENT head of `origin/claude/quote-track` (`2c5310d2`, scratch export in the session scratchpad;
the branch was not modified): 46 of 46 pass; `tsc -p tsconfig.test.json --noEmit` and eslint clean on the file. The
real `KalshiApiProvider.fetchQuotes` and `quoteUsable` are driven, with a stand-in for the browser that hides every
header the relay does not expose.

Finding on the way: the version of this file written earlier failed 9 of 19 on that head, because the provider now
reads the relay's `Date` only when constructed with `strictObservation: true` (`src/live/providers/kalshi.ts`; the
production wiring in `src/live/deliveryConfig.ts` passes it for the relay). The file now constructs the provider that
way.

With `Date` exposed (the relay as changed):

* device clocks 5 s, 30 s, 10 min, 2 h, 3 days fast and slow, and 400 days off: the skew is measured exactly (relay
  minus device) and a 3 s old quote is usable and a genuinely old one (45 s in the 30 s context, 200 s in the 180 s
  context) is not, in both contexts; with the 1 s truncation of the Date header the age error stays under 1 s and no
  verdict changes; device clocks within 2 s (0, +-1 s, +-1.999 s) are trusted as they are, from exactly 2 s on the skew
  is measured;
* a malformed `Date` is ignored (device clock trusted); a `Date` in 1970 or 2100 is applied as measured and the verdict
  fails SAFE (every quote looks future-dated and is withheld).

Without `Date` exposed (relay as it was, unchanged expectations): `clockSkewMs` is `undefined` for every offset; a
30 s fast clock wrongly withholds a 3 s old quote, a 30 s slow clock wrongly accepts a 45 s / 200 s old one, a slow
clock or one 10 min fast wrongly withholds fresh ones.

A relay clock that is itself wrong by 30 s (device exactly right): the client reads skew = 30 s and concludes the
device is 30 s slow; the quote age passes straight through the relay's error. Relay +30 s: a 3 s old quote looks 33 s
old and is withheld in the 30 s context (usable in the 180 s context). Relay -30 s: a 45 s old quote looks 15 s old and
is accepted. For any device clock the computed age is the true age plus the relay's clock error exactly (the device
offset cancels); a relay error under 2 s is ignored. This is the documented limit: the client cannot tell whose clock
is wrong, it trusts the relay's, and `X-Sift-Observed-At` (Kalshi's own clock) is unaffected. The relay hosts are assumed NTP
disciplined (not measurable from here); a 30 s error would be an incident.

Cached answers (relay shape from section 2): see section 2, ages are exact. Replayed `Date` (a cache that ignores
`no-store`): shown by tests to be the unsafe direction (a replayed answer looks as fresh as it was when produced, for
any device clock), and `Date`-less behaviour on a right device clock to be correct. The rule has no defence against
it: only skews under 2 s are discarded, there is no upper bound and no plausibility check on the skew (the earlier
assumption that implausible skew is discarded is not what the code does). If the owner wants a belt-and-braces
defence it belongs on quote-track and has a cost: any bound on |skew| also rejects a phone that is legitimately days
off, and a replay cannot be told from a wrong device clock by `Date` alone. The relay-side defence is `no-store`
(tested), the client-side ones are `cache: 'no-store'` and an obedient HTTP path.

## How to re-run

From the repo root (`npm ci` first):

```
npx vitest run tests/relay.test.ts tests/relayDate.test.ts tests/relayDateServe.test.ts tests/relayDifferential.test.ts
node scripts/relay-browser-date.mjs                            # Chromium, BEFORE = origin/main core, AFTER = this tree
node scripts/relay-browser-date.mjs --after-only               # no git needed
BEFORE_REF=<ref> node scripts/relay-browser-date.mjs           # compare against another ref
CHROME_PATH=/path/to/chrome node scripts/relay-browser-date.mjs
WK_PORT=4466 PAGE_PORT=8776 python3 -I scripts/relay-webkit-date.py   # WebKitGTK (needs xvfb-run, WebKitWebDriver, selenium)
```

The Chromium script uses `playwright-core` and `typescript` already in `devDependencies`, defaults to
`/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (falls back to Playwright's own Chromium if absent), and
needs no network beyond localhost. `--serve [--ref <ref>]` only serves the page, relay and fake upstream (one JSON line
on stdout), which is what the WebKit script drives. Neither is wired into CI or any workflow. The clock-skew proposal
is run by copying it to `tests/live/relayDateClockSkew.test.ts` in a checkout of `origin/claude/quote-track`.

Local results on this branch (relay code `6b90ccf6`): `npx tsc -b` clean; eslint clean on
the touched files (`relay`, the four relay test files, `tests/fixtures/relay`, `scripts/relay-browser-date.mjs`);
the four relay test files 168 of 168 pass (`relay.test.ts` 27, `relayDate.test.ts` 19, `relayDateServe.test.ts` 17,
`relayDifferential.test.ts` 105); full suite (`npx vitest run`): 145 files, 1780 tests. The first full run, with the
machine at load average ~30 from other workers, had 9 failures, all timeouts or late renders in `tests/mlb.test.tsx`,
`tests/nhl.test.tsx` and `tests/screens.test.tsx` (none import the relay); re-run alone, `nhl` and `screens` passed
(52 of 53 with `mlb`) and `mlb` passed 19 of 19 with `--testTimeout=100000`. So: 1768 passed, 3 skipped on the full
run, and the 9 load-induced timeouts pass in isolation; no failure involves the relay.

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
  no CORS headers at all (browser-verified: a page on an unlisted origin cannot read the relay). The value is the
  relay's clock, which is not secret.
* HTTP-date resolution is 1 s; quote-track already ignores skews under 2 s. Transit time is ignored; that error is
  well below the smallest tolerance that matters here (the future tolerance is 5 s, the tightest limit 30 s).
* The relay's `Date` is only as right as the host clock (assumed NTP-synchronised on Vercel/Cloudflare). A wrong
  relay clock mis-corrects every client by exactly that error, even those whose own clock is right (section 4);
  `X-Sift-Observed-At` comes from Kalshi's own `Date` and is unaffected.
* The wrapper now always sets `Date` (it used to only add one when absent; no code path produced one, so nothing
  changes). Vercel and Cloudflare may add or overwrite their own `Date`; both are the server clock, so whichever wins
  the value is equivalent. The explicit set removes the dependence on that.
* A `Date` replayed by an intermediary cache that ignores `Cache-Control: no-store` would make a replayed answer look
  as fresh as when produced, and the client has no check against it (section 2 and 4). All data answers are
  `no-store`; the client fetches with `cache: 'no-store'`. Not verifiable for the deployed host from here.
* Safari/iPhone: measured on WebKitGTK only (same result as Chromium).

## Not proven

* **The deployed relay.** This sandbox cannot resolve the Vercel host, so nothing here touched the real deployment.
  Evidence is the relay core behind a Node http server, which is the same `Request`/`Response` code Vercel runs, not
  Vercel's edge itself. Still unproven: that Vercel's platform passes `Access-Control-Expose-Headers` through
  unchanged (it does not rewrite function headers as a rule), sends `Date` to a real browser on the real origin, and
  honours `Cache-Control: no-store` so no `Date` is replayed. A CI drill by another worker may exercise the
  deployment; nothing in this branch does.
* **Safari on an iPhone.** WebKitGTK 2.52.6 (a real WebKit engine, a different port from iOS Safari) reads `Date`
  exactly as Chromium does; the iOS build itself was not run.
* The quote-track side was exercised only through the proposed test in a scratch export of `2c5310d2`; that branch is
  unchanged. Whether quote-track should bound or sanity-check the skew (section 4) is an owner decision there.
