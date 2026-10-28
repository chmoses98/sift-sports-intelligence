# SIFT 3.0 WebKit QA tooling

Playwright's WebKit build could not be downloaded in the overnight environment (`cdn.playwright.dev` was denied by the network
policy), so the WebKit evidence was produced with **WebKitGTK** (real WebKit engine, `AppleWebKit/605.1.15`) driven through its
W3C WebDriver. It is the same engine family as Safari but **not iOS Safari**: fonts, overlay scrollbars and touch/safe-area
behaviour differ, so an on-device pass is still required (see docs/sift3/VISUAL_QA.md).

```bash
apt-get install -y webkit2gtk-driver xvfb && pip install selenium pillow
./scripts/v3-qa/start_driver.sh &                      # WebKitWebDriver on :4444 under Xvfb (inherits the session proxy)
(cd scripts/v3-qa && python3 -m http.server 8765 &)    # serves frame.html: the app runs inside an exact-size iframe
npm run dev                                            # app on :5173
python3 scripts/v3-qa/journeys.py                      # 49 interaction checks, sample data
python3 scripts/v3-qa/audit.py                         # overflow + tap-target audit at 390x844, 375x667, 430x932
python3 scripts/v3-qa/compare.py REF.png SHOT.png OUT.png   # reference | implementation
```

The harness hides the iframe scrollbar (WebKitGTK's overlay gutter swallows clicks at the right edge; iOS has none).

## Mobile performance of every screen

`scripts/v3-qa/screens-perf.mjs` measures documents, wire bytes, first meaningful content, interactive time and tap-to-paint for Home, Games, Game Detail,
Player, Team, Stat, Following, Explore and Prop Discovery, from the committed fixture bundle (`fixtures/real`) under the iPhone-class throttle of
`props-perf.mjs`; the method and the per-screen definitions are in `docs/sift3/IMPLEMENTATION_STATUS.md` ("Hardening: mobile performance").

```bash
npm run build:e2e                                   # a production build in dist/
DIST=dist RUNS=5 SCREEN=home,games node --experimental-strip-types scripts/v3-qa/screens-perf.mjs
DIST="before=/path/old-dist,after=dist" RUNS=5 SCREEN=all OUT=perf.json node --experimental-strip-types scripts/v3-qa/screens-perf.mjs   # alternates the builds run by run
```

`--no-proxy-server` is built in (this sandbox's `HTTPS_PROXY` would otherwise send the documents to the live network). Other knobs: `INTERACT=0` (no taps),
`NOTHROTTLE=1`, `APP_H1=1` (serve the app over HTTP/1.1), `PROFILE=1 PROFILE_OUT=<prefix>` (CPU profile), `TRACE_OUT=<prefix>` (Chrome trace), `URLS_OUT=<prefix>` (the documents of run 1).
