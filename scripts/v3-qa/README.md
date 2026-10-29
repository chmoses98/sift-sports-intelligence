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
