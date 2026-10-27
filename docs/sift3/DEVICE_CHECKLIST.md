# SIFT 3.0 device checklist (real iPhone, by hand)

Automated tests run Chromium (touch events sent through the DevTools protocol) and WebKitGTK (the WebKit engine, not iOS Safari). Neither is a finger on glass: none of the items below has been verified on real hardware. Each item says exactly what to do and what must be true. Test on Safari (not only an installed web app), at the largest and the smallest phone you have (a 6.7 inch iPhone and an iPhone SE or mini). Write the device, iOS version and result next to each item when you run it.

## 1. Stat Detail, Trend: touch selection and the observation list

Open `#/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL` (Stat Detail, Trend tab, Dallas points scored: 12 bars). Also try the 2025 chip (17 bars) and a hockey statistic that has a series (`#/v3/stat/nhl/corsi_pct?v=1&tab=trend&sel=ANA`, if that team still publishes one).

The chart looks exactly as designed at rest (slim bars, logos under them, no extra controls). Its bars are about 27 pt wide (about 20 pt in the 17-game season cut), so the chart is built as one touch surface of equal, gap-free columns, each as tall as the chart. A 44 pt column per bar is not possible in 338 pt; the list below the chart is the guaranteed 44 pt path.

1. **Tap, one column at a time.** Tap the middle of each bar, then the left edge and the right edge of the same bar's column (the space beside the bar counts). Every tap must select the column you touched: the bar gets the cyan outline, the card under the chart shows that game, and the address changes (Back does not step through your taps; one Back leaves the screen). No tap may select a neighbouring column.
2. **Press and hold shows a live readout.** Put a finger down on a bar and keep it there: a small pill above the chart names the game and value ("Sep 20 · vs WAS · 37.0"), the bar is lit, and the details card turns cyan-outlined and shows that game. Nothing is committed yet.
3. **Scrub.** With the finger still down, slide left and right across the whole chart, including past the first and last bar and off the chart sideways. The readout follows the finger bar by bar, with no jumping, no skipped bars and no lag you can feel. Lift the finger: the column under it stays selected and the pill disappears.
4. **The page must not scroll while you scrub.** Slide sideways with a deliberately sloppy, slightly diagonal finger: the page must not move up or down, and iOS must not show a text-selection magnifier, a callout or a grey tap flash.
5. **Vertical scrolling still works.** Start a vertical swipe with the finger on the chart and move mainly up or down: the page scrolls as normal, the preview disappears, and the selection you had before is unchanged. Do the same starting from the cards and the list: the page scrolls normally everywhere else.
6. **Screen edge.** Start a scrub on the first (leftmost) bar and on the last (rightmost) bar. Starting at the very edge of the screen may trigger Safari's back swipe; starting on the bar must not. Report if the first bar is too close to the edge to scrub reliably.
7. **Large text and zoom.** With Settings, Display and Brightness, Text Size at the largest setting, and with Safari's page zoom at 150 percent, the chart, the readout pill and the list must still be usable and not overflow sideways.
8. **Rotate** to landscape and back while a bar is selected: the same bar stays selected and the chart is not cut off.
9. **The list (VoiceOver).** Turn on VoiceOver and move to the "Game by game" list (it is the last card). It must read as a list of 12 (or 17) items. Each row has three controls: the game (reads, for example, "Week 6, Oct 18, at GB, 13.0 points", a toggle button that says selected for the chosen game), the opponent ("GB, team page") and the result ("Final 13 to 23, DAL at GB: open Game Detail"). The chart itself is not announced (it is hidden from VoiceOver by design; the list replaces it). Double-tap a game: VoiceOver says "Showing ..." and the card under the chart changes to that game.
10. **Rows are comfortable to hit.** With a normal finger, tap each of the three controls in several rows (the date and value, the "at GB" text, the score). Each row is 44 pt tall; none of the three must trigger the wrong control, and tapping the row between rows must do nothing odd.
11. **Back.** Select a bar, tap "Game Detail" (card or list score), then Back: you return to the same screen with the same bar selected and the page at the same scroll position. Repeat with the opponent button, and with a bar chosen from the list instead of the chart. Swipe-back from the screen edge must behave the same as the Back button.
12. **Reduce Motion.** With Settings, Accessibility, Motion, Reduce Motion on, selecting and scrubbing must show no movement other than the bars changing outline (the build adds no animation here; check that nothing was added by mistake).

Record: iPhone model, iOS version, Safari or home-screen app, and any item that failed with what you saw. A failure on item 1, 3, 4 or 5 is a release blocker for the Trend chart.

## Related charts to look at while you are on the device (not changed here)

These share the same small-bar geometry and have not been given scrubbing (see the Stat QA notes): the Player screen's hit bars (Overview and Trends, 10 to 25 bars at about 10 to 21 pt) and the Team screen's margin bars (one link per completed game, one tap target per bar). Try tapping adjacent bars on each and report any mis-tap.

---

# SIFT 3.0 captured preview: iPhone device checklist

What to tap on a real iPhone, one line per root tab and per locked design, then the touch behaviour that only a device can verify.
The preview is the captured-data build (`docs/sift3/PREVIEW.md`): every number is a published document captured on 26 Oct 2026, 23:25 UTC, prices as captured, nothing live.
The automated crawl (`scripts/v3-qa/preview-routes.mjs`, report in `docs/sift3/qa/impl/preview/crawl-report.md`) proves each path below renders on Chromium at 390 x 844; this list is for what a desktop browser cannot prove.
Kick-off times are shown in the phone's own time zone; the page clock is fixed, so "Today" and "Tomorrow" describe that captured evening, not today.

Open the Artifact in Safari (or the Claude app) while signed in. The strip at the top says CAPTURED DATA; tap **About** to read what is real, transformed and not captured. First visit shows the Welcome sheet once: tap **Explore without setup**.

## Root tabs
| Tab | Tap | Look for |
|---|---|---|
| Home | Home | Featured Cowboys at Eagles, My Teams, no "Sample data" strip. Scroll to the end. |
| Games | Games > NFL > Today/Upcoming | Cowboys at Eagles card with cent lines; star, bell, lines box, logo and card body each go to their own place. |
| Explore | Explore | Prop Discovery: title with real counts, shelves, cards with prices. |
| Following | Following | Empty until you save something (the bookmark on Player Research); the saved item reopens with the same state. |

## The 26 locked designs
| Id | Tap path from the tab bar | What to check on the phone |
|---|---|---|
| P1 Player overview | Home > Game Center > CeeDee Lamb | Hero, game strip, five tabs, the three lanes, five windows, ten bars; the whole chart above the tab bar. |
| P2 Drag the line | P1 > drag the dashed line; tap a ladder row; the chevron "Alt lines" | The line snaps between rungs under the finger, the page does not scroll, the readout replaces the window chips and returns on release. |
| P3 Research builder | P1 > Research filters > Away > Show N games | Counts before applying; locked rows do nothing; chip appears and removes with one tap; Back closes the sheet. |
| P4 Matchup tab | P1 > Matchup | Opportunity chain, opposing unit strip, locked position-level row. |
| G1 Game Matchup | Home > Game Center > Matchup | Direction control, unit tracks, tilt pills, SIFT Lens collapsed. |
| G2 One unit | G1 > Passing row | Two teams on the league strip, recent form, markets; Back returns to the same scroll. |
| G3 Lens, shape, key matchups | G1 > SIFT Lens header | Lens opens in place; game shape; key matchups with player, unit fact and price. |
| PD1 Discover | Explore | Search, sport rail, stat chips, shelves, cards. |
| PD2 All props | Explore > See all | Sorted list (Soonest), filter chips, legend, rows. |
| PD3 Peek | PD2 > tap a row (away from the price and links) | Row expands in place with bars, lanes, rungs, actions. |
| PD4 Sort and filter | PD2 > sort/filter button | Live count, sort, filters, locked facets; Apply returns to the list. |
| PD5 Compare | PD2 > Compare > tick three rows > Compare | Three columns, lane order, Contract under each. |
| PD6 Exact contract | Explore > a card's price | Ticker, ask, bid, fee, break-even; no bet button. |
| TR1 Team overview | Games > NFL > Cowboys at Eagles > Game Detail > Dallas logo | Hero record, next game, identity card, strongest and weakest, last six margins. |
| TR2 Profile | TR1 > Profile | Raw or adjusted switch, rows with rank and 34-game marker. |
| TR3 Form | TR1 > Form | Margin bars, results, splits, locked spread row. |
| TR4 Schedule | TR1 > Schedule | Opponents with rest and unit ranks. |
| TR5 Players | TR1 > Players | Availability, skill players with prop counts. |
| TR6 Hockey overview | Games > NHL > Maple Leafs at Flames > Toronto logo | W-L-OTL record, hockey units. |
| SD1 Ranking | TR1 > the offense block of the identity card | Selected-team card, dot plot, ranked list, next opponent pinned. |
| SD2 Trend | TR2 > Raw > Show all > Points scored per game > Trend | Bars per game, observation card, seasons. |
| SD3 Raw vs adjusted | SD1 > Side by side | Two separate cards, never combined. |
| SD4 Compare teams | SD1 > Compare | Eight unit rows, two team chips. |
| SD5 Compare players | SD4 > Players > Add player (twice) | Last ten games as bars, table, locked league-rank row. |
| SD6 About | SD1 > About | Definition, limits (expand), related statistics. |
| SD7 Hockey ranking | TR6 > the power-play row | Window chips, 32-team universe, dot plot. |

The states the capture cannot supply are listed in the About sheet and in `docs/sift3/PREVIEW.md` ("What is not captured").

## Touch interactions only a device can verify
1. **P2 line drag**: with one finger on the dashed line's label, drag up and down. Expect rung snapping, no page scroll while dragging, no accidental text selection or magnifier, release commits the line.
2. **Stat Trend scrub**: on SD2 drag a finger across the bars; the selected observation follows at 44 pt resolution and the page scrolls vertically when the finger moves off the chart.
3. **Props list scroll and Back**: scroll PD2 a long way, expand a row, open a player, tap Back: same scroll position, same expanded row, no jump.
4. **Sheet drag**: open the contract sheet, a filter sheet and the About sheet; drag the handle down to dismiss; the page underneath must not scroll while a sheet is open.
5. **Keyboard in the Props search**: tap the search field; the keyboard must not cover the results list or the field; closing it returns the layout.
6. **Safe areas**: the top banner clears the notch, the tab bar clears the home indicator, in portrait and with the Dynamic Island.
7. **Rotation**: rotate to landscape and back on Home, Games, Player and Prop Discovery: no horizontal scroll, the tab bar stays reachable.
8. **Address bar**: scroll up and down; the collapsing Safari bar must not hide the tab bar or leave a gap.
9. **Back swipe**: use the edge swipe instead of the on-screen Back on a Team, Stat and Player page.
10. **Text and contrast**: Settings > Accessibility > larger text; the cards must wrap, not clip.
