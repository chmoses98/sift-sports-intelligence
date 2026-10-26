# Team Research (TR1 to TR6): implementation against the locked references

Files: `trN-compare.png` = reference `out/trN.png` (left), implementation 390x844 (middle), implementation 375x667 (right), real published documents (DAL 2026 week 7 packet, TOR 2026-27). `tr2-raw-compare.png` shows Profile with Raw selected (the reference state; the address default is Opponent-adjusted, as in `proto-team.js`).

Remaining differences (all intentional or data-driven):

1. Hero: the reference is photo-free; the implementation shows the verified, credited photography (existing hero resolver) for DAL and TOR, with the logo-led treatment when no verified photo exists. The hero carries a third action (bookmark = saved research) beside bell and star.
2. Status bar and home indicator in the references are device chrome, not part of the page.
3. Numbers differ from the mockup where the mockup was illustrative: next-game time is the viewer's local zone (the sandbox is UTC), props count and "Props" instead of "Props today" when the next game is not today, availability and skill-player lists, a few Profile rows (the published packet carries 12 offense / 11 defense raw statistics).
4. Next-game line shows no over/under total unless the slate carries one for that game (never from Kalshi event metadata).
5. Shell tab highlight: the references highlight Games on team pages; the shared shell (`tabOf`) highlights nothing on `/v3/team/*`. Shell-wide, outside this screen.
6. At 375 px the compact title truncates ("Dallas Cowb…") and hockey's "Scoring vs preventing" wraps to two lines; the cards themselves do not change.
7. Profile in Opponent-adjusted shows no "vs last 34" deltas because adjusted statistics have one window (as in the design).
