# Game hero coverage — 2026-10-08

The goal was **100% correct visual identity**, not 100% photographic coverage. Every home team of every sport with game
pages resolves to its own identity:
- a **verified photo** of its own home game at its own venue, or
- its **designed identity hero**: logo, colours and livery, with the "<Team> home game" line.

Neutral sites and unconfirmed home sides show both teams, with nobody at home.

| Sport | Home teams | Verified home photos | Branded identity heroes | Unresolved |
| --- | ---: | ---: | ---: | ---: |
| NFL | 32 | 15 | 17 | 0 |
| MLB | 30 | 23 | 7 | 0 |
| NHL | 32 | 14 | 18 | 0 |
| CFB | 137 | 41 | 96 | 0 |
| CBB | 365 | 7 | 358 | 0 |
| NBA · Soccer · Tennis | — | 0 | (resolver supports them) | no game pages in Sift today |

"Home teams" is the identity table each gallery is drawn from:
- **CFB:** every FBS program in the venue registry. FCS home teams also get a branded identity hero, but they have no
  registered venue.
- **CBB:** every team in the CBB identity table.

## Verified photos (team codes)
- **NFL (15):** ARI, BAL, CAR, CHI, DAL, GB, JAX, KC, LAR, MIN, NO, NYJ, SF, TEN, WAS
- **MLB (23):** ATL, AZ, BAL, BOS, CHC, CIN, CLE, COL, CWS, DET, KC, LAA, LAD, MIN, NYM, NYY, PHI, PIT, SEA, SF, STL, TB, TEX
- **NHL (14):** BOS, BUF, CAR, COL, EDM, FLA, MIN, MTL, NYR, SJS, STL, TBL, TOR, VAN
- **CFB (41):** AFA, ALA, ARK, BAY, BSU, BYU, CAL, CLEM, CMU, COLO, DUKE, FLA, GT, HOU, ILL, IND, KENT, LOU, LSU, MICH, MINN, MRSH, MSU, NAVY, ND, NEB, OHIO, OKLA, ORE, OSU, RUTG, SDSU, SYR, TCU, TULN, UCF, UCLA, UGA, UTAH, VT, WYO
- **CBB (7):** ARK, CIN, DAY, DUKE, OSU, UK, UVA

## Branded identity heroes (no photo yet)
- **NFL:** ATL, BUF, CIN, CLE, DEN, DET, HOU, IND, LAC, LV, MIA, NE, NYG, PHI, PIT, SEA, TB
- **MLB:** ATH, HOU, MIA, MIL, SD, TOR, WSH
- **NHL:** ANA, CBJ, CGY, CHI, DAL, DET, LAK, NJD, NSH, NYI, OTT, PHI, PIT, SEA, UTA, VGK, WPG, WSH

## Replaced misleading photos

These photos showed the right building at the wrong event. All are blocklisted in `scripts/heroes/blocklist.json`.

| Team | Old photo | Now |
| --- | --- | --- |
| Saints | Super Bowl LIX (Chiefs/Eagles end zones, NFL shield) | Saints home game: fleur-de-lis at midfield, SAINTS end zones |
| Cardinals | 2010 Fiesta Bowl (Boise State) | Cardinals home game: ARIZONA end zone |
| Falcons | Atlanta United soccer | Falcons identity hero (no verified Falcons home frame on Commons) |
| Raiders | BYU v Arizona college game | Raiders identity hero |
| 49ers | 2019 CFP final (Clemson v Alabama) | 49ers home game: 49ERS end zone, midfield logo |
| Seahawks | CONCACAF Champions League final | Seahawks identity hero (the only Seahawks frames predate the 2012 rebrand) |

Before the overhaul, MLB, NHL and CFB pages never got a photo or any team identity. They showed a generic floodlit
stadium drawing. Every team in those sports now has its own identity.

## Rejected at the full-resolution check (20)

These proposals passed the contact-sheet review but failed on the full-size file.
- **Wrong identity era or venue configuration:**
  - Marlins: before the 2019 rebrand.
  - Brewers: before the 2020 rebrand.
  - Padres: 2013 colour scheme.
  - Predators: before the 2011 rebrand.
  - Seahawks: before the 2012 rebrand.
  - Buccaneers: before the 2014 rebrand.
  - Dolphins: before the 2013 rebrand and the 2015–16 stadium rebuild.
  - Astros: before the 2017 configuration.
  - Blue Jays: before the renovation, and a postseason game.
- **Event branding:** Broncos (NFL Kickoff 2013 banner dominates the frame).
- **No legible home identity, or too dark:**
  - CFB: Florida State, Memphis.
  - CBB: Temple, North Carolina, BYU, Eastern Michigan.
  - NHL: Calgary, Winnipeg.
- **Quality:** Xavier (2009 court since replaced), Stanford basketball (soft compact-camera frame).

## Open gaps

1. **Photographic coverage.** Commons often has no free-licence frame that shows a team's home identity in its current
   era. These teams keep their branded hero, which is correct but not photographic:
   - NFL: 17 teams.
   - MLB: 7 teams.
   - NHL: 18 teams.
   - Most CFB programs.
   - Almost all CBB programs.

   Licensed photography (team or league media, Getty, AP) would close this gap. It is an owner decision.
2. **CFB venue data.** The CFB publication carries no venue or neutral-site flag.
   - Home stadiums are inferred from the dated tenancy registry.
   - The standing neutral rivalries (Red River, Florida–Georgia, Army–Navy) are recognised.
   - A one-off neutral-site regular-season game (a kickoff classic) that Kalshi titles "X at Y" would show the stated
     host's identity and stadium.
   - **Fix upstream:** publish `venue` and `neutral_site` from `cfb-edge-finder`.
3. **Ageing photos.** Some approved frames are 2008–2016 photos of venues whose boards or signage have since changed,
   though home identity and the building are the same: Bruins 2008, Twins 2010, Saints 2009, Air Force 2011.
   Re-check yearly.
4. **Rights.**
   - Photos are CC BY / CC BY-SA / CC0 / PD, credited on each hero and on Status → Game photo credits.
   - CC BY-SA derivatives are served under the same licence.
   - One photographer asks for "Courtesy of Brian Reading" (Houston TDECU). Houston is not pinned, so this does not apply.
   - Team and school logos are the identification marks Sift already ships. Trademark review remains an owner item
     before commercial launch.
