# Captured preview: reachability crawl

Built from `dist-v3-snapshot`, 390x844, time zone America/New_York, 2026-10-27T20:55:07.802Z. Every path below is taps only, starting from a root tab; the page was loaded once at its start address.

Welcome (first visit): {"shownOnFirstVisit":true,"dismissedByTap":true,"shownAgainAfterReload":false,"tabBarVisibleBeforeDismiss":true,"ok":true}

## Root tabs
| id | what | start tab | tap path (taps only) | result | checks |
|---|---|---|---|---|---|
| ROOT-Home | Home tab shows the captured slate (not sample data) | Home | About (banner) > Close (About sheet) | PASS | 6/6 |
| ROOT-Games | Games tab lists the captured slate with lines through the quote gate | Games | Games (bottom tab) > Games (bottom tab) > NFL (sport rail) | PASS | 3/3 |
| ROOT-Explore | Explore tab is Prop Discovery on the captured props | Explore | Explore (bottom tab) | PASS | 3/3 |
| ROOT-Following | Following tab: save from Player Research, then open the saved state | Home | Home (bottom tab) > Game Center (Home) > CeeDee Lamb (Players to research) > Save this research (bookmark) > Following (bottom tab) > the saved Lamb item | PASS | 5/5 |

## The 26 locked designs
| id | design | start tab | tap path (taps only) | result | checks |
|---|---|---|---|---|---|
| P1 | Player overview, chart first | Home | Game Center (Home) > CeeDee Lamb (Players to research) | PASS | 10/10 |
| P2 | Drag the line, compare every rung | Home | Game Center (Home) > CeeDee Lamb (Players to research) > touch-drag the dashed line > a ladder rung > Alt lines (chevron on the decision card) | PASS | 8/8 |
| P3 | Research builder: cut the sample before you trust it | Home | Game Center (Home) > CeeDee Lamb (Players to research) > Research filters > Away (draft filter) > Show N games (apply) | PASS | 7/7 |
| P4 | Matchup tab: why the projection says what it says | Home | Game Center (Home) > CeeDee Lamb (Players to research) > Matchup | PASS | 5/5 |
| G1 | Matchup: offense against defense, both ways | Home | Game Center (Home) > Matchup | PASS | 5/5 |
| G2 | One unit, in depth | Home | Game Center (Home) > Matchup > Passing unit row | PASS | 7/7 |
| G3 | Lens, game shape, key matchups, context | Home | Game Center (Home) > Matchup > SIFT Lens header (expand) | PASS | 7/7 |
| PD1 | Discover: what is interesting today | Explore | Explore (bottom tab) | PASS | 8/8 |
| PD2 | All props: sort and browse the whole universe | Explore | Explore (bottom tab) > See all (SIFT model published shelf) | PASS | 7/7 |
| PD3 | Peek: depth without leaving the list | Explore | Explore (bottom tab) > See all (SIFT model published shelf) > a prop row (expand in place) | PASS | 4/4 |
| PD4 | Sort and filter the entire universe | Explore | Explore (bottom tab) > See all (SIFT model published shelf) > Sort and filters > Apply | PASS | 7/7 |
| PD5 | Compare props side by side | Explore | Explore (bottom tab) > See all (SIFT model published shelf) > Compare (tick mode) > tick the first row > tick the second row > tick the third row > Compare in the tray | PASS | 6/6 |
| PD6 | The exact contract | Explore | Explore (bottom tab) > a card price pill | PASS | 5/5 |
| TR1 | Overview: what kind of team is this? | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) | PASS | 8/8 |
| TR2 | Profile: how it compares, and what changed | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > Profile | PASS | 5/5 |
| TR3 | Form: results, margins, splits | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > Form | PASS | 6/6 |
| TR4 | Schedule: who is next, and how strong are they | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > Schedule | PASS | 5/5 |
| TR5 | Players: availability and today's props | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > Players | PASS | 5/5 |
| TR6 | Overview, hockey (Toronto) | Games | Games (bottom tab) > NHL (sport rail) > Maple Leafs at Flames card > Toronto logo (Game Detail header) | PASS | 4/4 |
| SD1 | Ranking: where does the team stand, and who is around it? | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > offense block (Identity card) | PASS | 8/8 |
| SD2 | Trend: how has it moved, game by game? | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > Profile > Raw (statistic basis) > Show all offense and defense stats > Points scored per game (row) > Trend | PASS | 5/5 |
| SD3 | Raw versus opponent-adjusted, kept apart | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > offense block (Identity card) > Side by side | PASS | 6/6 |
| SD4 | Compare teams | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > offense block (Identity card) > Compare | PASS | 6/6 |
| SD5 | Compare players | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > offense block (Identity card) > Compare > Players (mode) > Add player 1 > pick CeeDee Lamb > Add player 2 > pick George Pickens | PASS | 7/7 |
| SD6 | About: definition, limits and related statistics | Games | Games (bottom tab) > NFL (sport rail) > Cowboys at Eagles card > Dallas logo (Game Detail header) > offense block (Identity card) > About | PASS | 7/7 |
| SD7 | Hockey ranking: power play | Games | Games (bottom tab) > NHL (sport rail) > Maple Leafs at Flames card > Toronto logo (Game Detail header) > power-play (special teams) row | PASS | 6/6 |

## States of the preview itself
| id | what | start tab | tap path (taps only) | result | checks |
|---|---|---|---|---|---|
| STATE-NoQuote | Demo: no reliable quote (the real withheld-price path) | Home | About (banner) > tick "Demo: no reliable quote" (the page reloads) > Games (bottom tab) > NFL (sport rail) > Explore (bottom tab) > a withheld price pill > About (banner) > untick the demo (the page reloads) | PASS | 8/8 |

## Sweeps (render every reachable list once; record what the capture can and cannot open)
- **SWEEP-GameCoverage** (PASS): Game Detail coverage by sport and state: NFL/Today opens with its game documents; NBA/Today opens with its game documents; NBA/Upcoming opens with its game documents; MLB/Today opens from the slate row only ("MLB Today · 8:00 PM at Brewers Rays MIL TB 8:00 PM Overview "); NHL/Today opens with its game documents; NCAAF/Upcoming opens with its game documents; NCAAB/Upcoming opens from the slate row only ("NCAAB Sun, Nov 1 · 9:30 AM ND at VIL Notre Dame Fighting Iri"); SOCCER/Today opens from the slate row only ("SOCCER LIVE In play EDL — UNI Estudiantes de La Plata Score "); SOCCER/Upcoming opens with its game documents; TENNIS/Today opens from the slate row only ("TENNIS LIVE In play PAP — SIL Despina Papamichail Score unav"); TENNIS/Upcoming opens with its game documents.
- **SWEEP-TeamsNFL** (PASS): 77 statistic links on DAL's Overview, Profile (adjusted), Profile (raw), Schedule were opened by tapping (63 distinct), each with its Trend, Compare and About tabs.
- **SWEEP-TeamsNHL** (PASS): 7 statistic links on TOR's Overview were opened by tapping (6 distinct), each with its Trend, Compare and About tabs.
- **SWEEP-Games** (PASS): every sport and state on Games (assets the lists show)

## Notes by design
- **P2**: The SIFT lane shows a dash on every rung the model does not publish (it publishes three), as the design locks.
- **G1**: Shown on Cowboys at Eagles, a game still to be played at the capture instant. A game in play is not captured (the score feed is off), so the live variants of G1 to G3 are not shown.
- **PD1**: The counts in the title are the captured day's (the whole slate), not the mockup's own day.
- **TR6**: Hockey is Toronto, from the Maple Leafs at Flames game on the captured slate; the record is wins-losses-overtime losses as the design locks.
- **SD2**: The per-game series is captured for Dallas's points per game, so that is the statistic shown; a statistic with no series opens the rank-path state instead.
- **SD5**: The two players are CeeDee Lamb and George Pickens, whose game logs are in the capture; a player without a captured log would show the locked state.

## Network
```json
{
 "origin": "http://127.0.0.1:33613",
 "localRequests": 215,
 "localByKind": {
  "built": 58,
  "images_and_data": 157
 },
 "externalHostRequestsAttempted": 0,
 "externalHosts": [],
 "attemptsRefusedInsideThePage": 0,
 "liveQuoteNetworkFetches": 0,
 "documentsServedFromTheCapture": 233,
 "quoteFeedDocumentsServedFromTheCapture": 5,
 "quoteFeedDocumentsNotCaptured": 104,
 "documentsRequestedButNotCaptured": 199,
 "localAssetsRequestedButNotBundled": 0,
 "sameOriginRequestsThatAnswered404": [],
 "documentsReadFromOtherFamilies": [
  {
   "family": "team",
   "kind": "ranking",
   "firstReadBy": "SWEEP-TeamsNFL"
  },
  {
   "family": "team",
   "kind": "ranking",
   "firstReadBy": "SWEEP-TeamsNHL"
  }
 ],
 "additionsInTheCapture": 39
}
```

- PASS: zero requests to an external host
- PASS: zero attempts by the app at an external host (the shim would have refused them)
- PASS: zero live-quote network fetches (quote documents come only from snapshot packs)
- PASS: only same-origin snapshot files: no request left the origin
