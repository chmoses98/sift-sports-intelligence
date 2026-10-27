# Stat Detail and League Rankings: implementation against the locked designs (SD1 to SD7)

Reference on the left, implementation on the right, 390x844 at 2x (`*-390x844-ref-left-impl-right.png`); 375x667 and 390 full-page
captures of the implementation alongside. Captured from the dev server on REAL published documents (`REAL=1 V3_REAL_FEEDS=live`,
`scripts/v3-qa/shot.mjs`), so values come from today's documents, not the mockups' frozen snapshot.

| Image | State |
| --- | --- |
| sd1 | Ranking: adjusted offensive EPA, DAL selected, PHI next opponent |
| sd2 | Trend: points scored per game, DAL |
| sd3 | Side by side: raw and adjusted as two separate cards |
| sd4 | Compare teams: DAL and PHI |
| sd5 | Compare players: Lamb and Pickens, receptions, 5+ |
| sd6 | About: definition, limits, related statistics |
| sd7 | Hockey: power-play percentage, TOR selected, CGY next opponent |

## Remaining differences (honest list)

1. Device chrome in the references (status bar, home indicator) is mockup furniture, not part of the app.
2. Data: the mockups used a frozen snapshot; real documents differ in places, and every difference below is the real publication speaking:
   Lamb 6.8 / Pickens 4.4 receptions (mockup 6.6 / 4.8), the NHL ranking is titled "Power-play percentage (official)" by the registry,
   Toronto's list name reads "Maple Leafs" (the mockup shortened to "Leafs"), related-statistic names are the registry's own, and the
   Compare players statistic chips list every game-log statistic the two players share (the mockup showed three).
3. SD1 shows the locked two-way switch (Opponent-adjusted | Raw); the SD3 third segment only appears inside the side-by-side view, so
   from SD1 the way in is a "Side by side" link on the note line. The mockups do not draw that entry point.
4. Compare players: the dashed-line stepper buttons are 44 pt wide (hit-area rule) and so a little larger than the mockup's.
5. 375 pt width: the Compare chips row wraps the Teams/Players switch under the chips (the mockup is drawn at 390 only).
6. Trend: the 12 bars are 27 pt wide each (338 pt shared by 12 columns); the column is the whole 167 pt tall, so the tap target is
   27 x 167, not 44 x 44. Bars cannot be wider without scrolling the chart.
7. About (SD6): derived related statistics carry a small type tag (Component, Raw version, ...) under the name; the mockup rows have none.
