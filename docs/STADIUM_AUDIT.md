# NFL stadium audit — 2026-10-06

Baseline `main` = `6206a7e` (PR #9, approved redesign). This is the first delivery of the stadium /
weather asset phase: an audit plus the infrastructure. **No photograph was added, replaced or re-graded.**
Regenerate the table with `npm run stadiums -- audit --date <YYYY-MM-DD>`. It is built from
`scripts/stadiums/venues.json`, `scripts/stadiums/photos.json` and the served files.

The verdicts in the table (status, hero and mobile quality, replacement) are the audit's reading, made
against owner spec 9. **They await owner confirmation.** The crop percentages are computed: they give the
share of each photo's identifying architecture (`crop.keep`) that survives the measured hero shapes.

## Venue table (all 32 clubs, home venue on 2026-10-06)

| TEAM | VENUE | VENUE / PHOTO STATUS | CURRENT ASSET | ASSET TYPE | SOURCE | LICENSE / RIGHTS | IMAGE DIMENSIONS | HERO QUALITY | MOBILE CROP QUALITY | NEEDS REPLACEMENT? | NOTES |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ARI | State Farm Stadium | REAL PHOTO — NEEDS REVIEW | state-farm-stadium (Fiesta Bowl, Boise State v TCU (college)) | Real photo · indoor | Wikimedia Commons — Sean Hobson | CC BY 2.0 | orig 3072×2304; desktop 2133×1600 666 KB; mobile 1050×1400 318 KB | Good composition (roof lights, bowl, field) but 16 years old (desktop keeps 0% of the architecture; suggested focus y 0.11) | Good (keeps 100%) | Recommended — dated | 2010 photo: predates the stadium's later videoboard and fascia upgrades; Boise State end zone. |
| ATL | Mercedes-Benz Stadium | BAD COMPOSITION | mercedes-benz-stadium (Atlanta United v Columbus Crew (soccer)) | Real photo · indoor | Wikimedia Commons — Eric.Jason.Cross | CC BY-SA 4.0 | orig 4032×3024; desktop 2133×1600 335 KB; mobile 1050×1400 146 KB | Low field-level angle on a soccer pitch; the halo board is a sliver; roof petals barely read (desktop keeps 0% of the architecture; suggested focus y 0.06) | Poor (keeps 82%) | YES — fails 'believable football perspective' | Soccer configuration with soccer players on the pitch. |
| BAL | M&T Bank Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| BUF | Highmark Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET | The NEW Highmark Stadium (opened for the 2026 season, across Abbott Road from the old one). Same published name as the 1973 venue; the event date separates them. Open-air bowl with a canopy over most seats; the field is uncovered. |
| CAR | Bank of America Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| CHI | Soldier Field | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| CIN | Paycor Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| CLE | Huntington Bank Field | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| DAL | AT&T Stadium | APPROVED REAL PHOTO | att-stadium (Texans at Cowboys, 2019 preseason (opening kickoff)) | Real photo · indoor | Wikimedia Commons — Michael Barera | CC BY-SA 4.0 | orig 6000×4000; desktop 2400×1600 725 KB; mobile 1050×1400 262 KB | Strong: the centre-hung videoboard, roof and Cowboys end zone (desktop keeps 0% of the architecture; suggested focus y 0.07) | Good (keeps 95%) | No — raise desktop focus so the videoboard stays in the band | Videoboard content is a 2019 in-game graphic. Desktop band cuts through the videoboard. |
| DEN | Empower Field at Mile High | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| DET | Ford Field | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| GB | Lambeau Field | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| HOU | NRG Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| IND | Lucas Oil Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| JAX | EverBank Stadium | REAL PHOTO — NEEDS REVIEW | everbank-stadium (Chiefs at Jaguars, 2025 season) | Real photo · night | Wikimedia Commons — elisfkc2 | CC BY-SA 4.0 | orig 4080×3072; desktop 2125×1600 673 KB; mobile 1050×1400 300 KB | Fair: generic lower-bowl view; a light beam washes the right third; weak venue identity (desktop keeps 34% of the architecture; suggested focus y 0.21) | Fair (keeps 100%) | Likely — and check against the renovation | Shows the PRE-renovation bowl; EverBank Stadium is mid-renovation, so the current configuration may differ. Under a multi-season renovation ('stadium of the future'). Owner to confirm the configuration the Jaguars are using this season, and whether any home game moves to another venue (the publication's venue name decides per game). |
| KC | GEHA Field at Arrowhead Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| LAC | SoFi Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET | Fixed translucent canopy roof with open sides: no precipitation reaches the field (treated as a fixed roof). |
| LAR | SoFi Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET | Fixed translucent canopy roof with open sides: no precipitation reaches the field (treated as a fixed roof). |
| LV | Allegiant Stadium | APPROVED REAL PHOTO | allegiant-stadium (Vegas Kickoff Classic, BYU v Arizona (college)) | Real photo · indoor | Wikimedia Commons — Ken Lund from Reno, Nevada, USA | CC BY-SA 2.0 | orig 4032×3024; desktop 2133×1600 738 KB; mobile 1050×1400 322 KB | Good: real bowl, roof trusses and light ring, deep field-facing view (desktop keeps 7% of the architecture; suggested focus y 0.11) | Good (keeps 83%) | No — consider raising desktop focus so the roof reads | College game: BYU/Arizona end-zone and midfield paint. At 1280-1920 px the 253 px desktop band shows the far stands only; the roof (the identifier) sits above it. |
| MIA | Hard Rock Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET | Canopy over the seats; the field is open. |
| MIN | U.S. Bank Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| NE | Gillette Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| NO | Caesars Superdome | REAL PHOTO — NEEDS REVIEW | caesars-superdome (Super Bowl LIX) | Real photo · indoor | Wikimedia Commons — elisfkc2 | CC BY-SA 2.0 | orig 4032×2268; desktop 2400×1350 753 KB; mobile 1013×1350 337 KB | Fair: flat sideline view, little of the dome visible; reads as 'a Super Bowl' more than 'the Superdome' (desktop keeps 22% of the architecture; suggested focus y 0.13) | Fair (keeps 77%) | Owner decision — every Saints home game would show Super Bowl LIX branding (LIX logos, Chiefs/Eagles end zones) | Event-specific signage is real but not representative of a regular Saints game. |
| NYG | MetLife Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| NYJ | MetLife Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| PHI | Lincoln Financial Field | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| PIT | Acrisure Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| SEA | Lumen Field | BAD COMPOSITION | lumen-field (CONCACAF Champions League Final (soccer)) | Real photo · night | Wikimedia Commons — SounderBruce | CC BY-SA 4.0 | orig 4866×3194; desktop 2400×1576 640 KB; mobile 1050×1400 224 KB | Venue is unmistakable (roof arcs, light rails, skyline board) but the field is a soccer pitch with a goal in frame (desktop keeps 0% of the architecture; suggested focus y 0.05) | Fair (keeps 80%) | YES — fails 'believable football perspective' | Soccer configuration: goal, penalty box and centre circle visible. Roof covers about 70% of the seats; the field is open. |
| SF | Levi's Stadium | REAL PHOTO — NEEDS REVIEW | levis-stadium (CFP National Championship, Clemson v Alabama) | Real photo · night | Wikimedia Commons — Legoktm | CC BY-SA 4.0 | orig 4000×3000; desktop 2133×1600 521 KB; mobile 1050×1400 218 KB | Fair: pyrotechnic smoke covers the far stands; college championship field; fan heads in the foreground (desktop keeps 8% of the architecture; suggested focus y 0.11) | Fair (keeps 98%) | Recommended | Smoke obscures the architecture that identifies Levi's (suite tower). |
| TB | Raymond James Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |
| TEN | Nissan Stadium | APPROVED REAL PHOTO | nissan-stadium (Titans home game, LP Field era (2006–2015)) | Real photo · night | Wikimedia Commons — Casey Fleser from Nashville, TN | CC BY 2.0 | orig 3008×2000; desktop 2400×1596 650 KB; mobile 1050×1400 247 KB | Good: night bowl, light banks, Titans end zone, strong depth (desktop keeps 0% of the architecture; suggested focus y 0.06) | Good (keeps 91%) | No for 2026; the venue is replaced in 2027 | Taken when the venue was LP Field (signage/boards of that era). Valid only for the 1999 stadium (through the 2026 season). The 1999 open-air stadium, in use through the 2026 season. Its enclosed replacement (nissan-stadium-2027) carries the same name; the event date separates them. |
| WAS | Northwest Stadium | FALLBACK | Designed floodlit fallback | CSS artwork | — | — | — | — | — | NEEDS OWNER-SUPPLIED ASSET |  |

LAR also appears in the publication as `LA`. Both map to SoFi Stadium, which the Chargers share. NYG and
NYJ share MetLife Stadium. Each shared stadium is **one** venue in the manifest.

## The 9 previously approved photos against the new bar

| Venue | Photo (Commons) | Passes the new bar? | Why |
| --- | --- | --- | --- |
| AT&T Stadium | Texans at Cowboys, 2019 preseason — Michael Barera, CC BY-SA 4.0 | **Yes** | Real NFL game and an unmistakable videoboard. The desktop band cuts the board: raise focus y |
| Allegiant Stadium | Vegas Kickoff Classic 2022 — Ken Lund, CC BY-SA 2.0 | **Yes, with a crop fix** | Real bowl and roof. College field paint. At ≥ 1280 px the roof (the identifier) is above the band |
| Nissan Stadium | "Night Settles on LP Field" — Casey Fleser, CC BY 2.0 | **Yes, for 2026** | Real Titans night game with strong depth. LP Field-era boards. The venue is replaced in 2027 |
| State Farm Stadium | 2010 Fiesta Bowl — Sean Hobson, CC BY 2.0 | **Borderline: dated** | Good composition, but 16 years old and predating the later board and fascia upgrades. Boise State end zone |
| Caesars Superdome | Super Bowl LIX — elisfkc2, CC BY-SA 2.0 | **Borderline** | Real and current, but Super Bowl LIX branding on every Saints game. Little dome architecture visible |
| EverBank Stadium | Chiefs at Jaguars 2025 — elisfkc2, CC BY-SA 4.0 | **Borderline** | Real, recent, NFL. Weak identity (generic lower bowl, light-beam glare). Shows the pre-renovation bowl |
| Levi's Stadium | 2019 CFP Championship — Legoktm, CC BY-SA 4.0 | **Borderline** | Real. Pyrotechnic smoke hides the identifying stands. College championship field. Foreground heads |
| Lumen Field | 2022 CONCACAF final — SounderBruce, CC BY-SA 4.0 | **No** | Unmistakable venue, but a **soccer** configuration (goal and penalty box). Fails "believable football perspective" |
| Mercedes-Benz Stadium | Atlanta United 2017 — Eric.Jason.Cross, CC BY-SA 4.0 | **No** | **Soccer** pitch from a low angle. The roof and halo board barely read |

All 9 stay **approved and served unchanged** in this delivery. Approval and replacement are the
owner's decision. Their licences and authors are as the Commons API returned them to the fetcher on
2026-10-05. They were not re-verified here, because Commons is unreachable from the dev container.

**Crop finding (applies to every photo, including future ones).** On desktop the approved hero is a
234 – 253 px band: aspect 4.3 at 1280 px and 6.2 at 1920 px. A 3:2 inside-the-bowl photograph shows
only about a quarter of its height there. With today's focus points the band keeps **0 – 34 %** of each
photo's identifying architecture. On the 1280 px game page the photo reads as "a crowd". The layout is
approved and unchanged. Two remedies are possible: per-photo `focus.y` (suggested values are in the
table), or a taller desktop hero, which is a layout change for the owner to decide.

## Venues on the fallback

Every club below shows the designed floodlit fallback. None has a reviewed candidate (no contact sheets
survive in the repository), so all are **NEEDS OWNER-SUPPLIED ASSET**:

BAL M&T Bank Stadium · BUF Highmark Stadium (new, 2026) · CAR Bank of America Stadium · CHI Soldier Field ·
CIN Paycor Stadium · CLE Huntington Bank Field · DEN Empower Field at Mile High · DET Ford Field · GB
Lambeau Field · HOU NRG Stadium · IND Lucas Oil Stadium · KC GEHA Field at Arrowhead Stadium · LAC / LAR
SoFi Stadium · MIA Hard Rock Stadium · MIN U.S. Bank Stadium · NE Gillette Stadium · NYG / NYJ MetLife
Stadium · PHI Lincoln Financial Field · PIT Acrisure Stadium · TB Raymond James Stadium · WAS Northwest
Stadium — **21 venues, 23 clubs**.

Neutral and international sites (all fallback): Tottenham Hotspur Stadium, Wembley Stadium,
Olympiastadion, Allianz Arena, Deutsche Bank Park, Santiago Bernabéu, Croke Park, Stade de France,
Melbourne Cricket Ground, Estadio Azteca, Neo Química Arena and Maracanã.

## Incorrect, outdated or questionable venue mappings found

| # | Finding | Before | Now |
| --- | --- | --- | --- |
| 1 | **A published venue the manifest did not know fell back to the home team's stadium.** A neutral site or temporary home missing from the list would have shown the wrong stadium | wrong photo | Unresolved: fallback with the published name |
| 2 | The schedule-cache capture names the stadium under `context.venue.stadium`; the featured card and tiles also ignored `context.weather.stadium` | ignored | Read everywhere through `publishedVenue()` |
| 3 | **Buffalo: old and new Highmark Stadium were one entry.** The 2026 Bills play in the new stadium under the same name, so a photo of the 1973 bowl would have been shown as current | one entry | Two venues split by date. The 2026 games resolve to the new stadium |
| 4 | **Tennessee:** the enclosed Nissan Stadium (2027) carries the old name. The LP Field-era photo would have carried over | — | `nissan-stadium-2027` added (fixed roof). The photo is bound to the 1999 venue only |
| 5 | **Jacksonville:** EverBank Stadium is mid-renovation. The approved photo shows the pre-renovation bowl | — | Flagged. Owner to confirm the current configuration and any relocated home game (the published venue decides per game) |
| 6 | The publication still names NRG Stadium **"Reliant Stadium"** and publishes an empty roof for it (stale upstream stadium config) | resolved by alias | Still resolved. The roof stays "not published" (never guessed). Worth fixing upstream |
| 7 | The publication's surface for the 2026 Highmark Stadium is `a_turf`, possibly inherited from the 1973 stadium's record | — | Not used by the media system. Flag to the data owner |
| 8 | "Levis Stadium" (no apostrophe) did not match "Levi's Stadium" | no match | Apostrophes ignored in matching |
| 9 | The featured card's venue line shows the manifest name (e.g. "NRG Stadium"), while the hero shows the published name ("Reliant Stadium") | — | Unchanged (approved UI text). Reported only |
| 10 | Stade de France, Maracanã and Deutsche Bank Park were added for name resolution only. Whether an NFL game is scheduled there this season is unverified | — | Owner to confirm |
| 11 | Roof facts recorded: Allegiant, SoFi, U.S. Bank, Ford Field and the Superdome are fixed roofs; State Farm, Mercedes-Benz, AT&T, NRG, Lucas Oil, Bernabéu and Deutsche Bank Park are retractable. Lumen, Hard Rock, Wembley, Allianz and the new Highmark cover seats but leave the field open, so they are outdoor | — | Encoded in `roof` |
