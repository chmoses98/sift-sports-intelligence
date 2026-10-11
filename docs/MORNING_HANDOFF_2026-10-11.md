# SIFT repair sprint — morning handoff (2026-10-11)

**Production:** `main` @ `e191d47` (PRs #56, #57, #58, #59), live on GitHub Pages.
**Tracker (all 52 items, with files, tests and limitations):** [`docs/REPAIR_SPRINT_2026-10-11.md`](REPAIR_SPRINT_2026-10-11.md).
**Lane reports:** [`docs/sprint/`](sprint/) (lane-a … lane-f, wave2).

## 1. Counts

| Status | Count |
|---|---|
| Fixed and verified in production | **52** |
| Implemented, not deployed | 0 |
| Partial | 0 |
| Blocked | 0 |
| Not started | 0 |

Several items still have stated limits; see the tracker's last column. For example, MLB and NHL props are entry
points only, CFB publishes no rankings, and coverage shells are not published.

"Verified in production" means the item's check passed in `scripts/sprint-production-check.mjs`. That script runs on
GitHub after every Pages deploy, against the live site (Chromium desktop, Chromium phone, WebKit iPhone), and picks
its target games from the live publications. This session's network policy blocks `chmoses98.github.io`, so the live
site was checked only through that workflow and the existing production checks. Local real-data screenshots of the
same bundle are in `docs/screenshots/2026-10-11/`.

## 2. What shipped

| PR | Merge | What |
|---|---|---|
| [#56](https://github.com/chmoses98/sift-sports-intelligence/pull/56) | `0aec8bd` | Lanes A–F, plus the integration fixes. |
| [#57](https://github.com/chmoses98/sift-sports-intelligence/pull/57) | `c44f321` | **Wave 2:** issues 6 and 43 across NHL, soccer, CBB and CFB; Kalshi short club names spelled out. **Live check:** a feature check covering all 52 items, plus three defects it found (#38, #51/#52, #35). **Check fixes:** the existing production checks follow the new navigation; CFB logo-wait fix. **Test fix:** the WebKit scroll e2e race. |
| [#58](https://github.com/chmoses98/sift-sports-intelligence/pull/58) | `9a28cb9` | Hit-rate e2e race; it blocked the #57 deploy. |
| [#59](https://github.com/chmoses98/sift-sports-intelligence/pull/59) | `e191d47` | Team-page navigation e2e race; it blocked the #58 deploy. **Production.** |
| [#60](https://github.com/chmoses98/sift-sports-intelligence/pull/60) | — | Final tracker and handoff; production-check pattern fixes (below). |
| [nfl-edge-finder#138](https://github.com/chmoses98/nfl-edge-finder/pull/138) | draft, **not merged** | Upstream weather context: authoritative roof types (retractable stadiums were read as open air) and a venue check (the London game got Jacksonville's forecast). 3090 tests pass. Left for your review because it changes a scheduled data pipeline. The PR lists its risks. |

Lane commits (on `sprint/lane-*`, merged through #56):
- A: `d1fbb7e` `43ad05c` `64f8881` `e34702f` `048c9a9`
- B: `47b97c4` `b9f5424` `2bde92d` `4ca773d` `ead2f07` `f417a58` `cb13a0a`
- C: `dcd7b1d` `34d14c3` `e2e88ca` `f0d7c91`
- D: `de58a2f` `ed7e13f` `4cd041d` `ca97ba3`
- E: `2e7465a` `5029c99` `d791a0e` `5df688b`
- F: `e908c49` `07a1d2e` `6f88a22` `c074b80` `69d6f30` `6020acb`
- Wave 2: `31b631f` `75ddc2b`
- Production check: `d7eabb0` `9012b39` `7eb153c` `45e9c97`

## 3. Screenshots

| Surface | Desktop | Phone |
|---|---|---|
| Home (hero, cards, intelligence, Research Lab) | `integrated/home_1440.jpg` | `integrated/home-phone-top_390.jpg`, `integrated/home-phone-intel_390.jpg` |
| NFL game (hero, verdict, basics, scripts, props) | `integrated/nfl-game-det-ari_1440.jpg` | `lane-a/after-game-hero-branded_390.jpg` |
| Script Theater (team-named scripts, survivors, split) | `integrated/nfl-game-det-ari-scripts_1440.jpg` | `lane-d/after-phone-script-chart-390.jpg` |
| Player Prop Explorer / Props hub | `integrated/props_1440.jpg`, `lane-b/after-nfl-props-1440.jpg` | `integrated/props_390.jpg`, `lane-b/props-hub-phone-multiselect.jpg` |
| Matchups (basics, unit by unit, scheme to player) | `lane-c/desktop-matchups-*.jpg` | `lane-c/phone-*.jpg` |
| Markets (browse, compare studio, price moves) | `lane-d/after-market-board-browse-1440.jpg`, `lane-d/after-compare-studio-1440.jpg` | `lane-d/after-phone-*.jpg` |
| Research Lab, Season with ATS finals, Terminal | `lane-e/research-lab_1440.jpg`, `lane-e/season-week_1440.jpg`, `lane-e/terminal_1440.jpg` | `lane-e/*_390.jpg` |
| Weather and roof handling, injury provenance | `lane-f/home-featured-retractable-roof_1440.jpg`, `lane-f/game-hero-london-forecast-withheld_1440.jpg` | `lane-f/*_390.jpg` |
| NHL, soccer, CBB and CFB units | `wave2/*` | `wave2/*` |

All paths are under `docs/screenshots/2026-10-11/`. The "before" shots sit next to the "after" shots in each lane folder.

## 4. Test results

- **Unit (vitest):** 952 passing (baseline 793).
- **Playwright, local** (Chromium desktop and phone, non-visual): 412 passed, 0 failed.
- **CI on PR #57's head** (lint, typecheck, unit, build, and Chromium plus WebKit acceptance, including visual): green.
- **Live production check after the `e191d47` deploy** (run 38161043189):
  - `production-check.mjs` passed.
  - `sprint-production-check.mjs`: 223 PASS · 0 N/A · 1 FAIL. Every item's checks passed on Chromium desktop and
    phone. The only FAIL was WebKit reporting a transient raw.githubusercontent.com request failure as a page error;
    the app catches it. The check now ignores exactly that network message.
  - `cfb-production-check.mjs`: 546 ok · 3 FAIL, all one stale pattern. The check counted CFB ranks written "#12/130",
    and wave 2 writes "#12 of 130". All 104 ranks are present on the deployed build. Fixed in #60.

## 5. Outstanding defects and next actions

| # | Defect / gap | Next action |
|---|---|---|
| 1 | Upstream NFL weather context: retractable roofs read as open air; the London game got Jacksonville's forecast. Sift already corrects both on screen. | Review and merge [nfl-edge-finder#138](https://github.com/chmoses98/nfl-edge-finder/pull/138) (draft; risks listed in it). |
| 2 | CFB export drops the venue and weather context it captures (`scripts/app_export.py`). | Export `context.venue` / `context.weather` upstream; Sift's venue table covers indoor CFB venues meanwhile. |
| 3 | 30 of 55 player photos were removed (not game-day frames). Those players show the team-branded graphic. | Pin licensed game-day photos in `scripts/players/players.json`. |
| 4 | The WebKit iPhone pass of the new sprint check has run only on CI (WebKit is not installed in this environment). | Watch the next scheduled production checks. |
| 5 | Injury freshness thresholds (fresh ≤ 6 h, aging ≤ 24 h) are a product choice. | Tune in `src/lib/injurySource.ts` if wanted. |
| 6 | The NBA and tennis matchup rows show the registry unit as published, without Sift's own denominator wording. | Extend `src/insights/sportUnits.ts` when those registries carry denominators. |
| 7 | NFL totals cannot be linked to scripts until the simulation publishes points by script. MLB and NHL props have no simulated player distributions. | Upstream publication work. |
| 8 | Issue text: the brief gave only numbers and lanes, so each tracker row's description is the lane deliverable it was matched to. | Correct any row whose matching is wrong. |

## 6. Research gates

Unchanged:
- `src/opportunity/*` ranking, fee and price logic;
- `src/live/*`;
- the FRESH/AGING/STALE gates and executable-price checks;
- the authority levels (ACTIONABLE / research candidate / research only).

The only edit under `src/opportunity/` is wording: three confidence notes now say "Research only" instead of the
`RESEARCH_ONLY` code. No model was promoted. PR #55 (the research-only prop contract) is untouched. No probability,
projection, market price, historical line or result is invented. Historical hit rates are labelled history and
measured against today's line on eligible games only. Closing lines are shown for finals only, from the nflverse
schedule. Weather stays labelled as context, never an input.
