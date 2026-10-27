# SIFT 3.0 preview

Nothing here touches `main`, the production Pages site, v4, SIFT 2.0, any workflow, model, ledger or paid service. Everything is preview-only: `src/v3/preview/*`, `scripts/`, `tests/v3/preview-capture.test.ts`, docs.

## 0. The captured-data preview (the one to review on an iPhone)

One isolated build with **all four root tabs** (Home, Games, Explore = Prop Discovery, Following) and **all 26 locked research designs** (Player P1-P4, Game G1-G3, Prop Discovery PD1-PD6, Team TR1-TR6, Statistic SD1-SD7) reachable by tapping, running on **real published documents captured on 26 Oct 2026, 23:25 UTC**. It is clearly labelled "captured data" and never mixes the capture with live quotes (the page has no network path to a live quote or score).
Host: a Claude Artifact (the lead publishes `dist-v3-snapshot/`; section 0.7). The earlier 4-route snapshot at `https://claude.ai/artifact/VhQ27SsC9F83hQMdwNK1YA` is superseded by this build.

### 0.1 Rebuild (needs the disk caches; none of them is committed)
```bash
# the base capture and the other families (all uncommitted disk caches, named by SHA-1 of the request URL):
ln -s <worktree-with-the-props-cache>/.v3-feed-cache .v3-feed-cache                  # base: 1,411 documents + captured_at.txt (2026-10-26T23:25:00Z)
mkdir .v3-feed-cache-families && ln -s <...>/.v3-feed-cache .v3-feed-cache-families/{player,team,stat,game}
node scripts/build-v3-captured-preview.mjs --provenance                               # builds dist-v3-snapshot/, self-checks it, writes MANIFEST.json
node scripts/v3-qa/preview-routes.mjs                                                 # the reachability crawl (needs the build): report in docs/sift3/qa/impl/preview/
node scripts/v3-preview/serve.mjs dist-v3-snapshot 8777                               # serve it yourself: http://127.0.0.1:8777/
```
Options: `--base DIR` (or `V3_FEED_CACHE`), `--also name=DIR` (or `V3_ALSO_CACHES`), `--gaps DIR`, `--cap-kb`, `--min-kb`, `--pack-encoding bin|b64`, `--no-check`. `node scripts/build-v3-snapshot.mjs` (the earlier 4-route builder) now only forwards here.
`scripts/v3-preview/fetch-gaps.mjs` fills gaps with static research documents (section 0.2); `scripts/v3-qa/preview-routes.mjs --write-assets --write-missed --write-order` re-derives the three committed lists the build reads (`docs/sift3/qa/impl/preview/local-assets.json`, `missed-documents.json`, `scripts/v3-preview/pack-order.json`).

### 0.2 What is in it (the unified capture)
Base = the props cache (1,411 documents: slate, boards, 649 game documents, 622 game research documents, injuries, indexes, projections, 5 quote feed files, profiles, rankings). Other families add **only documents whose request URL the base lacks**; a document the base has is never replaced (41 / 35 / 34 / 35 same-URL documents in the player / team / stat / game caches differed in bytes because they were captured at other instants: the base's copy was kept).

| Family | Documents in the cache | Added to the capture | Which |
|---|---|---|---|
| props (base) | 1,411 | 1,411 | everything |
| player | 107 | 14 | 6 game documents, 4 metric registries, 3 search indexes, 1 profile |
| team | 98 | 24 | 22 team profiles, 2 NHL/NFL rankings |
| stat | 78 | 1 | 1 per-game series |
| game | 76 | 0 | all of its URLs were already in the capture |
| gap fill (curl, now) | | 0 | 45 ranking documents were requested by the crawl and fetched; all 45 were **rejected**: the live publication has been republished since the capture (`run_id` differs from every ranking run in the capture), and a newer ranking would contradict the team page that links to it. Nothing live was fetched or added; live-quote, slate, board and event documents are never fetched (`fetch-gaps.mjs` refuses them). |

Total 1,450 documents. The full per-document list (hash, family, kind) is `docs/sift3/qa/impl/preview/capture-manifest.json`. The 26 designs read only base-family documents; the crawl's two statistic sweeps additionally read two team-family rankings.
Local files bundled (derived from the crawl's own same-origin requests): 157 (team logos 142, player photos 3, hero photos 3, NFL game-log history files 9, the app icon).

### 0.3 Packaging, size and first load
`dist-v3-snapshot/`: **230 files, 12.14 MB (12,731,052 bytes), largest file 1.46 MB** (Artifact limits: 511 files, 16 MB per file). 10 packs of gzip'd documents + one index: `snapshot/index.json` (89 KB) maps SHA-1(request URL) to `[pack, offset, length]`; each document is its own gzip member, so the page inflates only what a screen reads. The shim fetches the index first, then whole packs on demand (about 1 MB each; Range requests are deliberately not used: the Artifact host's support is unverified and whole packs are small). Documents are packed in the order the crawl first read them, so Home loads one 1.18 MB pack and each later screen usually none: first load is the app code it needs (about 0.25 MB gzip), the latin fonts (about 0.1 MB), the 89 KB index and one 1.18 MB pack.
Format `sift3.captured-pack.v1` is documented in `scripts/v3-preview/capture-lib.mjs` and read by `src/v3/preview/capture.ts` (unit tests: `tests/v3/preview-capture.test.ts`: merge rule, round trip byte for byte, restamp rule).
`--pack-encoding b64` writes the packs as base64 text (`packs/pNN.txt`, +33%) for a host that refuses binary files; nothing else changes.
**Overlap with H-E** (`origin/claude/sift3-h-fixtures`, landed): its bundle (`fixtures/real/`, `scripts/v3-fixtures/*`) keeps per-family, URL-keyed indexes over whole-pack gzip (a pack must be inflated to read one document) and holds 181 unique documents; the preview needs the unified 1,450-document capture with SHA-1 keys and per-document gzip members, so its code was not reused. If the fixtures tooling is later extended to the full props capture, `webLoader.mjs` could replace `capture.ts`'s reader; the shim's clock and restamp rules would not change.

### 0.4 Honest labelling
* **Banner** on every screen, above the app: `CAPTURED DATA · 26 Oct 2026, 23:25 UTC · prices as captured, not live`, with an **About** button.
* **About this capture** sheet (reachable from the banner on every screen): what is real (the document counts by kind, byte-for-byte documents, generation times 26 Oct 01:36 to 27 Oct 01:59 UTC), what is transformed, what is not captured, this session's counts (documents served, requested but not captured, other hosts refused).
* **Transformed**, and only this: (1) the page clock is fixed at the capture instant minus 3 s (23:24:57 UTC): the quote gate tolerates 5 s of future, so quotes stamped at the clock pass; (2) market observation times are set to that clock: the quote feed's `generated_at` and every market's `observed_at`, and `captured_at` on each market in game documents. Prices and every other field are untouched (`restampMarketTimes`, unit tested to return all other documents byte for byte); (3) the live-score provider is switched off, and quotes the app persisted from an earlier visit are cleared on every load.
* **Captured slate, not sample data**: Home and Games show the captured slate (the first design check asserts no sample strip; sample mode cannot be switched on in this build). Their Kalshi lines pass through the real quote gate on the pinned clock (e.g. Cowboys at Eagles shows DAL -4.5 49c, O/U 44.5 48c).
* **Demo: no reliable quote** (About sheet, labelled, reloads the page): does not restamp, so the app's own gate withholds every captured price (it uses the real withheld-price path, nothing is faked): lists print a dash, the exact-contract sheet says "Price unavailable right now" with Retry and hides fee and break-even. The banner then also says `DEMO: no reliable quote`. The crawl proves it (STATE-NoQuote).
* **First-run Welcome** shows once as in the app and does not block anything (it is dismissed by a tap in the crawl, does not return after a reload, and the tab bar stays visible).

### 0.5 Reachability crawl (automated, taps only)
`node scripts/v3-qa/preview-routes.mjs` serves `dist-v3-snapshot/` statically on localhost (a minimal HTML skeleton around `artifact-page.html`, the way the Artifact viewer wraps a page fragment: ours, not the viewer's), drives it with Chromium at 390 x 844 (time zone America/New_York) with every non-localhost request refused and counted, and for each design starts from a root tab, reaches the design by taps and asserts its locked structure with data (not an error or empty state).
Result of the final run: **26 of 26 designs pass, 4 of 4 root-tab checks pass, Welcome once, withheld-price demo passes.** Full table with every tap path, check counts and notes: `docs/sift3/qa/impl/preview/crawl-report.md` (data: `crawl-report.json`; one screenshot per design and root, `docs/sift3/qa/impl/preview/<id>.png`).

| Start tab | Designs, with the path summary |
|---|---|
| Home | P1 Game Center > CeeDee Lamb; P2 P1 + touch-drag of the line, a ladder rung, Alt lines sheet; P3 P1 + Research filters > Away > Show N games; P4 P1 > Matchup; G1 Game Center > Matchup; G2 G1 > Passing row; G3 G1 > SIFT Lens header |
| Explore | PD1 the tab; PD2 See all; PD3 tap a row; PD4 Sort and filters > Apply; PD5 Compare > tick three > Compare; PD6 a price pill |
| Games | TR1 NFL > Cowboys at Eagles > Dallas logo; TR2-TR5 its Profile, Form, Schedule, Players tabs; TR6 NHL > Maple Leafs at Flames > Toronto logo; SD1 TR1 > offense block; SD2 Profile > Raw > Show all > Points scored per game > Trend; SD3 SD1 > Side by side; SD4 > Compare; SD5 > Players > Add player x2; SD6 > About; SD7 TR6 > power-play row |
| Following | save from Player Research, then Following > the saved item reopens the same state |

Network record of the final run (asserted): 215 same-origin requests (58 built files, 157 images and data), **0 requests to any external host, 0 attempts by the app at one, 0 live-quote network fetches**; 233 published documents answered from the capture (5 quote files); 0 same-origin 404s. Quote files requested but not captured: 104 (no quote was fetched for them).
Designs whose real state needs data the capture lacks: the live-game variants of G1 to G3 and the Games live states (no score feed: a game the slate lists as in play shows "Score unavailable"), a hockey team (captured: Toronto), the missing-price state (the demo switch above). Per-design notes are in the report.
WebKitGTK (real WebKit engine, not iOS Safari): `scripts/v3-qa/preview_wk.py` drives the same build on a static server (4 root tabs, About sheet, PD2, PD6, Game Detail, P1 chart, G1, TR1, SD1, no external host, no horizontal scroll): **16 of 16 checks pass** (ports 4477 driver, 8777 server).

### 0.6 What is not captured
Listed in the About sheet and repeated here: live scores and in-play state (a game shown as in play has no score) and anything after the capture instant; Kalshi quote files for 104 of the 109 games the crawl asked about (only 5 were captured; those games show a price from their own game document where it has one, otherwise "No lines listed"); game documents for many soccer, tennis, MLB and college games (Game Detail opens from the slate row alone and says "No Kalshi lines are listed"; the crawl found examples in each sport); 45 statistic ranking documents linked from the team pages the crawl opened (Dallas, Toronto) (tapping those rows shows the Statistic screen's own "not published" state: the screen cannot tell "not captured" from "not published"); player and team pages outside the captured games. Everything the 26 designs need is captured.
Kick-off times follow the phone's time zone; "Today" and "Tomorrow" follow the fixed clock (the crawl finds each card through the state chips, so it does not depend on the zone).

### 0.7 Publishing (lead)
`dist-v3-snapshot/MANIFEST.json` lists every file (path, bytes, content type) with `publish.files`; publish `artifact-page.html` as the page and every other listed file through `files` (relative path = published path, `root: dist-v3-snapshot`). `MANIFEST.json` itself need not be published. The packs are `application/octet-stream`; if the host refuses binary files rebuild with `--pack-encoding b64` (text packs). Nothing in `dist-v3-snapshot/` is built from or enters the production bundle (`npm run build` is untouched).

### 0.8 Device checklist
`docs/sift3/DEVICE_CHECKLIST.md`: one line per root tab and per design saying what to tap on an iPhone, then the touch interactions only a device can verify (P2 line drag, Stat Trend scrub, Props list scroll and Back, sheet drag, keyboard in the Props search, safe areas, rotation).

### 0.9 Gates
`npx tsc -b` clean; `npx eslint src/v3 scripts tests e2e` clean; unit tests `tests/v3/preview-capture.test.ts` 8 of 8 (the full `npx vitest run` is in the report of the worker); the crawl and the WebKit smoke above; the build's own self-check (production-built bundle served statically, Home renders the captured slate, no external request, no sample strip) passes.

---

## Earlier previews

(Kept for reference; written for the earlier sample-data builds. Section 0 above is the current preview.)

Code commit the previews were built and verified from: `038d4856ffde571a7035c773c1ec3241108ceec1` (branch `claude/sift3-build`, draft PR #147).
Nothing here touches `main`, the production Pages site, v4, SIFT 2.0, any workflow, model, ledger or paid service.

### 1. Two ways to open it

### A. Claude Artifact (live now, sample data only, private to the account that owns it)
`https://claude.ai/artifact/Ld3g3shu8ftfejXTJof22f` (build `038d485`, 423 files, 4.2 MB).
It runs the real app on the labelled sample data. It **cannot show real data**: the artifact viewer blocks requests to the research
feeds, so that build deliberately offers no real-data mode (Settings says so). Open it in Safari or the Claude app while signed in.

### B. Full preview (sample + real data), on its own GitHub Pages site: NOT published yet
Publishing needs a new repository and enabling Pages, which the session's permissions did not allow (repo creation returned 403, and the
GitHub API proxy blocks Pages settings). Everything else is ready:

1. github.com -> New repository -> `sift3-preview`, **public**, empty (no README).
2. On a computer with Node 22 and git, from a checkout of this branch:
   `scripts/publish-v3-preview.sh chmoses98/sift3-preview`
   (builds `dist-v3-preview/` and force-pushes it as the only content of that repo's `main`; it refuses to push to the app repo).
3. That repo -> Settings -> Pages -> Deploy from a branch -> `main` / `(root)` -> Save.
4. After about a minute open `https://chmoses98.github.io/sift3-preview/` on the iPhone. The start page has two separate links:
   **Open with sample data** (`app.html#/v3?demo=1`) and **Open with real data** (`app.html#/v3?demo=0`).

The same repo origin (`chmoses98.github.io`) as production is what the data feeds already expect; the preview adds no new origin.
Delete the repo to take the preview down. To use any other static host, upload the `dist-v3-preview/` folder as is.

### 2. What was verified (WebKitGTK, 390x844, the built bundle served from a sub-path like Pages would)
| Check | Result |
|---|---|
| Start page: two explicit mode links, commit id shown, feed check reaches the research registry and the NFL publication | pass |
| Sample mode, 9 routes: only the host itself is contacted, no broken image, no horizontal overflow, Geist + Sora load from the bundle | pass |
| 48 interaction journeys (Home to Game to switcher to Back, picker, compact scoreboard, card tap regions, Team to stat ranking to Back, Player stat/window/filter/bar/save, Explore search, price format) on the hosted-style build | 48/48 |
| Real mode from the hosted-style build: no sample strip or sample tickers, published research host contacted, real Games list (219 games on 2026-10-26), real NFL Game Detail and tabs, no broken images, Settings says "real published data", score-source note shown | pass |
| Simulated outage of the research and score hosts: real mode shows "feeds unavailable", never sample data; the bundled NFL saved copy (built Oct 4) is labelled "Saved copy in use" | pass |
| Same suite against the sample-only Artifact build wrapped in the viewer's own skeleton (exact published `index.html`): 48/48, only its own host contacted, `?demo=0` does not switch to real data | pass |
| `tsc -b`, `eslint .`, full `vitest` (1653 pass), Playwright v3 spec on Chromium phone (18 pass) | pass |

Scripts: `scripts/v3-qa/preview_check.py` (hosted address), `scripts/v3-qa/journeys.py`.

### 3. What was NOT verified (needs your iPhone)
* Anything on iOS Safari itself (WebKitGTK is the same engine family, not the same browser): safe areas and the home-indicator gap, address-bar collapse, momentum scrolling, keyboard behaviour and the search field, sheet drag/dismiss, pull-to-refresh, text rendering and font weight.
* Artifact A inside the Claude viewer: I could not open claude.ai from the build environment, so how the viewer's frame treats hash navigation, Safari Back, and its own top/bottom padding is untested. The skeleton adds safe-area padding to the page root, so a doubled top/bottom gap is possible.
* Option B from its real `github.io` address: it is not published, so asset URLs, cross-origin requests from that origin, and the live Kalshi-quote and score feeds were checked only from `127.0.0.1`. Quotes in this build come from the GitHub quote feed (about every 3 minutes); the sub-minute relay is not configured.
* Live-game states (a game in play with a real score feed) and the NBA score source, because no NBA game was in play during testing.
* Real-data screens other than those listed above (Team, Stat, Player in real mode were checked on 2026-10-25 against the dev server, not re-run on the hosted build).

### 4. iPhone checklist (about 10 minutes)
Open the sample link first, then the real one (when published).
1. **Start**: sample strip visible on every sample screen; real mode has none. Settings -> bottom line shows the build id and mode.
2. **Home**: featured matchup, "Game Center" button, My Teams, scroll to the end. Pull down: nothing odd happens.
3. **Games**: sport rail, state chips, a card: tap the star (does not open the game), the bell (sheet, no permission prompt), the lines box (exact contract sheet), a logo (team page), the card body (game).
4. **Game Detail**: swipe the switcher rail; tap `>` for the picker, search, star a game; switch games and check the tab is kept; scroll until the compact scoreboard appears and use its arrows; tap every tab; tap a market card.
5. **Back**: from Team, Stat Detail and Player, Back returns to the same tab, filters, scroll offset, search text and chart state.
6. **Player**: chart visible without scrolling; change stat, window, line; tap a bar; open Filters, apply and remove a chip; Save, then reopen from Following.
7. **Explore**: type in the search field (keyboard does not cover results); open a statistic with no market.
8. **Safe areas**: rotate to landscape and back; check the bottom bar clears the home indicator and nothing sits under the notch.
9. Add to Home Screen (Share) and reopen full-screen (option B).
10. Note anything that looks different from the approved references; screenshots are most useful.
