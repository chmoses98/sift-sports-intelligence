# SIFT repair sprint — morning handoff (2026-10-11)

**Production:** `main` @ `__DEPLOY_SHA__` (PR #57 on top of PR #56), live on GitHub Pages.
**Tracker (all 52 items, with files, tests and limitations):** [`docs/REPAIR_SPRINT_2026-10-11.md`](REPAIR_SPRINT_2026-10-11.md).
**Lane reports:** [`docs/sprint/`](sprint/) (lane-a … lane-f, wave2).

## 1. Counts

__COUNTS__

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
- **Live production check after the #57 deploy:** __PRODCHECK__

## 5. Outstanding defects and next actions

__OUTSTANDING__

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
