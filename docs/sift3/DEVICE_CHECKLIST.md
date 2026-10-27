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
