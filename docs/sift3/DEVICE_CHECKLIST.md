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
