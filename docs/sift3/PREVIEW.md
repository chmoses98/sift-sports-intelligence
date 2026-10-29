# SIFT 3.0 preview: how to open it on an iPhone, what was verified, what was not

Code commit the previews were built and verified from: `038d4856ffde571a7035c773c1ec3241108ceec1` (branch `claude/sift3-build`, draft PR #147).
Nothing here touches `main`, the production Pages site, v4, SIFT 2.0, any workflow, model, ledger or paid service.

## 1. Two ways to open it

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

## 2. What was verified (WebKitGTK, 390x844, the built bundle served from a sub-path like Pages would)
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

## 3. What was NOT verified (needs your iPhone)
* Anything on iOS Safari itself (WebKitGTK is the same engine family, not the same browser): safe areas and the home-indicator gap, address-bar collapse, momentum scrolling, keyboard behaviour and the search field, sheet drag/dismiss, pull-to-refresh, text rendering and font weight.
* Artifact A inside the Claude viewer: I could not open claude.ai from the build environment, so how the viewer's frame treats hash navigation, Safari Back, and its own top/bottom padding is untested. The skeleton adds safe-area padding to the page root, so a doubled top/bottom gap is possible.
* Option B from its real `github.io` address: it is not published, so asset URLs, cross-origin requests from that origin, and the live Kalshi-quote and score feeds were checked only from `127.0.0.1`. Quotes in this build come from the GitHub quote feed (about every 3 minutes); the sub-minute relay is not configured.
* Live-game states (a game in play with a real score feed) and the NBA score source, because no NBA game was in play during testing.
* Real-data screens other than those listed above (Team, Stat, Player in real mode were checked on 2026-10-25 against the dev server, not re-run on the hosted build).

## 4. iPhone checklist (about 10 minutes)
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
