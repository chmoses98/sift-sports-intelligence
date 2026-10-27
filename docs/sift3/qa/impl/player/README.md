# Player Research: implementation vs the locked P1 to P4

`compare_p*_390x844.png` and `compare_p*_375x667.png`: locked reference on the left, the running app on the right (real published documents, Chromium phone, the page clock pinned a few seconds after the captured quotes). `shots390/` and `shots375/` hold every state, including the inferred Trends, Log and Replay, the Props tab and the contract sheet. Regenerate: `BASE=http://localhost:5175/sift-sports-intelligence/ node --experimental-strip-types scripts/v3-qa/player-shots.mjs OUT` (`W=375 H=667` for the small phone).

## Remaining differences (honest list)

- Data, not layout: the mockup's numbers are the original designer's capture (hero "#88", weather "61°F clear · wind 5 mph", Props badge 11, All 19 games, 56¢). The app shows what is published: no jersey number, no weather, the player's real count of listed props, 17 logged games, the live ask.
- Rec yards in P4: the mockup draws 70 (20 to 126); the approval ledger HOLDS NFL receiving yards, so the stage shows "—" and "not approved yet". Matchup's chip reads "3 of 4 approved" (the mockup's "research-only" was the publication's document flag, not the ledger).
- Times are in the viewer's time zone (the mockup shows Mon 8:15 PM Eastern; a UTC browser shows Tue 12:15 AM).
- The device status bar and the home indicator are the phone's, not the app's. The shell's tab bar highlights nothing on this screen (the mockup highlights Games).
- The statistic pills scroll (a fifth pill, Longest reception, is published for receivers); the mockup draws four.
- P3: the shared sheet's close button sits where the mockup has "Reset" (Reset is on the Time range line); the sheet is 93% tall so the filters fit, but the locked group's explanatory line scrolls just below the button.
- P2: the mockup is captured after the page scrolled so the compact header is up; the app's compact bar appears after the hero scrolls away (same bar, same content).
- Fonts: the dev server runs from a symlinked node_modules, so Geist is not served in these screenshots and the browser's fallback sans is used.
- 375x667 (iPhone SE class): the hero gives way to the compact bar so the whole chart, the line and the price sit above the tab bar (the locked hero needs 119 points the screen cannot spare). No locked image exists for that size.
- Trends, Log and Replay have no locked images; they are inferred from the same atoms (see IMPLEMENTATION_STATUS.md).
