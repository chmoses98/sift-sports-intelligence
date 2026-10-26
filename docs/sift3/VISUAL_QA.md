# SIFT 3.0 — Visual QA and verification report

Branch `claude/sift3-build` · opt-in route `#/v3` · written 2026-10-25 · nothing here is deployed.

> **Read this first.** Fidelity statements below come from screenshots of the *running app* in a real **WebKit engine
> (WebKitGTK, `AppleWebKit/605.1.15`)**, opened next to the approved reference images. Playwright's own WebKit build could not
> be downloaded in the overnight sandbox (`cdn.playwright.dev` / `playwright.download.prss.microsoft.com` were denied by the
> network policy), so this is **not iOS Safari**. Fonts, scrollbars, momentum scrolling, safe areas and touch behave differently
> on a phone. **An on-device iPhone pass has not been done and is required before any fidelity claim is final.**
> The app was rendered at exactly 390×844 (and 375×667, 430×932) CSS px by hosting it in a fixed-size iframe.

## 1. Evidence

| Artifact | Where |
|---|---|
| Reference-vs-implementation comparisons (left: approved image, right: real WebKit screenshot, sample data) | `docs/sift3/qa/compare_*.jpg` (15 files) |
| Real published data in WebKit (no sample data), taken 2026-10-25 ≈ 14:30 UTC (`welcome_first_run.png` is the first-run sheet) | `docs/sift3/qa/real/*.png` |
| WebKit interaction run (48 checks, sample data) and layout audit | `scripts/v3-qa/` (`journeys.py`, `audit.py`; README there) |
| Playwright acceptance (Chromium, Pixel 7 viewport, production build) | `e2e/v3.spec.ts` (18 tests) |
| Unit/contract tests | `tests/v3/*` (22 tests) |

Reference images carry fictional scores, ranks, odds and player photos; they were used for geometry, hierarchy, colour layering
and density only. Nothing from them is shipped as content: logos are the repository's committed team identities; where no
verified photograph exists the hero is the photo-free, logo-led layout the contract allows.

## 2. Reference / Rendered / Difference / Fix / Rechecked

Severity: **H** high-impact on the first viewport, **M** noticeable, **L** polish. "Rechecked" = re-captured after the fix.

### Home (`01_home_top`, `02_home_lens`)
| # | Rendered vs reference | Sev | Fix | Rechecked |
|---|---|---|---|---|
| 1 | Featured card ≈ 375px tall vs ≈ 260px in the reference (extra lines box, 76px logos) | H | removed the lines box (prices live in Game Detail), 54px logos, tightened padding; Lens + Game Center kept | yes — card ≈ 300px; My Teams now visible in the first viewport |
| 2 | Sport chips 38px high and scoreboard tiles 112px wide vs reference's denser 30px / ~100px | M | chips 34px, tiles 104×88 | yes |
| 3 | Brand wordmark was skewed italic; Home reference is upright with the slanted-bar mark | L | upright Sora 800 + SVG mark | yes |
| 4 | Hero is photo-free (reference: licensed-looking player photography) | M, **accepted** | cannot ship mockup faces; verified venue photos are used automatically when `src/lib/hero` has one (seen on the 49ers team page); otherwise team-colour glows + stadium-light fallback | n/a |
| 5 | "Watch Live" in the reference | — | per contract: **Game Center** | yes |
| 6 | Late-arriving Lens would push tappable content | M | Lens slot reserves its height from first paint (skeleton → card or quiet "none") | yes |

### Games (`04_games_today`, `05_games_live`)
| # | Difference | Sev | Fix | Rechecked |
|---|---|---|---|---|
| 1 | Scores collided with the lines box for long names ("#3 Alabama 14") | H | team cell shrinks/ellipsises, score never shrinks | yes |
| 2 | Cards ≈ 135px vs ≈ 100px | M | logo 28, row 32, single-line header, star moved to the header corner with a 44px hit area, bell in its own column | yes (≈ 104–112px) |
| 3 | Reference shows an "All Sports ▾" selector; contract forbids a duplicate sport selector | — | omitted; date sheet behind the calendar icon instead | yes |
| 4 | Lines are Kalshi contract ladders, not sportsbook odds | — | prices in ¢ beside every line; one-line provenance note; exact contract on tap | yes |

### Game Detail (`06_game_pregame`, `07_game_live`)
| # | Difference | Sev | Fix | Rechecked |
|---|---|---|---|---|
| 1 | Hero logos 76px / hero ≈ 300px vs ≈ 62px / ≈ 250px | M | 66px logos, 232px hero | yes |
| 2 | "#1" rank rendered on its own line above the team name | H | wrapped in the name span | yes |
| 3 | Moneyline card showed one side; reference shows both | M | both sides with their asks (real data: both Kalshi game-winner contracts) | yes |
| 4 | Drive card had no yard labels or team mark | M | team logo, plays/yards/time, 10…50…10 yard labels (sample data only: no live feed exists) | yes |
| 5 | Photo hero (reference) vs logo-led hero | M, **accepted** | as Home #4 | n/a |

### Signature Game Switcher (`08`, `09`, `10`, `11`)
| # | Difference | Sev | Fix | Rechecked |
|---|---|---|---|---|
| 1 | First tile design (overlapping logos, ambiguous abbreviation) | M | two-row miniature scoreboard tile: logo + abbr + score per team, clock beneath; 112×72, constant height, 2–3 visible, current = cyan | yes |
| 2 | Picker had a stray 14px gap under the segmented control | M | grid `align-content: start` | yes |
| 3 | Picker covered more of the hero than the reference | L | sheet 82dvh | yes |
| 4 | Collapsed sticky scoreboard missing | H | compact bar (‹ logo score logo ›) appears when the rail leaves view; arrows go to the neighbouring games in rail order | yes (journey A10/A11) |
| 5 | Picker row ordering | L | favourites first, then live/kickoff; searchable; tab keeps; 25 sample games verified | yes |

### Team (`15`, `16`), Stat Detail (`17`, `18`, `26`), Player (`12`, `13`, `14`), Explore (`19`), Following (`20`, `21`)
| Screen | Remaining differences vs reference |
|---|---|
| Team | no photographic stadium hero in sample mode (real mode shows a verified venue photo + credit); 5 tabs in a boxed active state as designed; stat tiles show "rank of N" instead of coloured-only ranks; "conference record" line omitted (not published) |
| Stat Detail | sample teams show real names via the identity tables; Season select is a fixed single value (publication carries one season); compare mode (`27`) **not built** |
| Player | the hero is now a compact identity row (team mark beside the name; a verified photograph keeps the taller photo-led hero), so the whole chart including its date axis fits above the tab bar at 390×844 (chart top y≈544 including the 24px sample strip; the reference is ≈530);  Replay shows observed comparable games and says the adjusted what-if is *not available* |
| Explore | (a typing race was fixed: a late echo of an older keystroke could overwrite newer text, found by the WebKit run as "point er" for "points per") search field + sport rail + four category tiles (no Props tile: no cross-game prop index) + Recent research + What's Trending (the publication's own busiest games) |
| Following | compact favourites hub; live followed games elevated; saved research restores the exact route; gear replaced by the settings sliders icon |

## 3. Interaction and layout results

### WebKit journeys — 48 checks (sample data), all passing on the final build

Home→Game Center→tab→rail switch→Back (tab kept) · picker open/search/star-pin/select (**25 games**) · compact scoreboard +
next-game control · Games card: star, bell, lines box (exact `SAMPLE-` ticker), team logo and card body are independent;
Back restores **scroll offset** and filters · J1 Home logo → Team → statistic tile → ranking → another team → Back (same
ranking, same scroll) → value tap opens that team's history · Player: stat pill, window, bar → observation sheet (state
preserved), filter apply/chip/remove, `0 games match` + one-tap removal, save → Following → reopen restores stat/window/filter ·
follow without alerts, no notification permission · stat search with no market → Stat Detail, Back keeps the query · price
format switch applies instantly.

### Layout audit (17 screens × 3 viewports)
390×844, 375×667, 430×932: **no horizontal scroll on any screen**. The audit measures element bounds as well as document width,
because the shell clips overflow (`overflow-x: clip`) and hides it from scroll-width checks. That stricter pass found three real
defects, all fixed and re-audited (21 routes, 0 findings): the Player page content was 433px wide at a 390px viewport (grid
item without `min-width: 0`), the switcher rail ran past the edge (negative margins), and the line card's price column was off-screen. The audit's remaining "small target" findings are the dense
bars of the player chart (27–31px wide each; each bar has a 209px-tall hit area, and the same games are reachable as 44px rows
in the Game log tab) and drawn chip heights (34–36px, each with a 44px invisible hit area).

### Tests
| Suite | Result |
|---|---|
| `tsc -b` / `eslint .` | clean |
| `vitest` (all) | 142 files / 1653 tests pass, 3 skipped (pre-existing), after the one guard update noted in the PR (`tests/live/scores-isolation.test.ts` +1 allowlisted display file) |
| `tests/v3` (research engine, Kalshi line/prop shapes for NFL/NBA/NHL/CFB, fees/freshness, switcher, featured game, isolation) | 22 pass |
| `e2e/v3.spec.ts` on Chromium Pixel 7 against `npm run build:e2e` | 18 pass |
| Playwright WebKit / `iphone` projects | **not run**: browser download blocked |
| iOS device | **not run** |
| Existing Playwright suites | **not run** (unrelated to this change; they need the same browsers) |

## 4. Real-versus-sample data status (per screen)

Design fidelity (WebKitGTK) · interaction (WebKitGTK + Chromium) · real data (verified by loading the screen with real
publications on 2026-10-25) are tracked separately.

| Screen | Design fidelity | Interaction | Real data |
|---|---|---|---|
| Home | verified (sample) | verified | verified (real NFL/NBA/NHL/MLB slate, featured, My Teams, injury news) |
| Games | verified (sample) | verified | verified (NFL/NBA/NHL lines; **CFB lists no executable asks today → "No lines listed"**, honest) |
| Game Detail + Switcher | verified (sample) | verified | verified for pregame NFL (lines + live-quote overlay, Lens from matchup rows, matchup, props); **live/final scores unavailable for NFL/CFB/NHL by design** |
| Team | verified (sample) | verified | verified (NFL 49ers: record, ranks, results, roster, injuries, verified photo) |
| Stat Detail | verified (sample) | verified | verified (NFL rankings, definition, history) |
| Player research | verified (sample NBA guard) | verified | verified (NFL player log + Kalshi ladder; NBA/NHL read from profile logs) |
| Explore / Following / Settings | verified (sample) | verified | verified (search index for 4 sports; follows/saved are device-local) |
| Onboarding welcome | verified (`qa/real/welcome_first_run.png`) | skippable | uses real slate teams |

## 5. Open issues (honest list)

1. **No on-device iPhone verification** (see the banner above). Safe-area, notch, address-bar collapse, rubber-band scroll and iOS font rendering are untested.
2. Photographic hero art exists only where `src/lib/hero` has a verified venue photo; the mockup photography is not usable. Expect the photo-free hero most of the time.
3. Live drive / play-by-play / box scores need a play feed that does not exist for NFL/CFB/NHL; they appear only in sample mode.
4. Stat comparison (`27`), a dedicated offline screen (`25`) and a Props category in Explore are not built; CFB script engine is not wired into Game Detail.
5. Player filters that need data the publications lack (teammate with/without, pace, projected minutes) are deliberately not offered.
6. WebKitGTK ≠ iOS Safari; Playwright WebKit and Existing e2e suites were not run here.
7. v3 imports three display helpers from `src/v4/scoreState.ts` (score formatting). Fine while v4 exists; move them if v4 is retired.
8. The live-quote overlay and score feed make real network calls; no cost, but they depend on the existing free feeds being reachable.
