# A. SIFT Visual Asset Audit

Status: **planning document, 2026-10-18.** No production code, data, workflow or asset was changed. Branch `claude/sift-visual-asset-audit-v4f8ny`, base `2164af7`.

Conventions used in all six documents:

* **[V]** verified: read in the repository, counted on disk, or confirmed in a primary source during this audit.
* **[R]** recommendation: my proposal, not a fact about the repository.
* **[U]** unverified: from secondary sources or inference. Must be checked before it is relied on.

How this audit was done: the repository was read (`src/`, `public/`, `scripts/`, `.github/workflows/`, `docs/`, `tests/`, `e2e/`), the committed Playwright baselines in `e2e/__screenshots__/` were viewed as the only available picture of the rendered app (they use bundled fixtures and a fixed clock, so they show *fallback states* faithfully but not live data), and three read-only sweeps were cross-checked against the code. Anything not opened is listed in section 9.

---

## 1. Executive summary: what is actually wrong with SIFT's artwork

SIFT already has a serious art *system*. It has a pure, date-aware hero resolver, a rights-gated registry of 100 Commons venue photographs, a reviewed player-image blocklist, per-surface crop profiles for NFL venues, and tests that fail on a wrong-team photo. The weakness is not a missing pipeline. It is **coverage, depth and the empty fallback**.

1. **The fallback is a dark void, and the fallback is the common case.** [V] After SIFT 2.0 art direction, only 10 of 32 NFL home teams resolve to a hero photograph (`src/components/sift2/heroArt.ts:10-17`, `venueArt.ts:18-40`). CFB has 41 of ~137 FBS programs, CBB 7 of 365, NBA/Soccer/Tennis none. Everything else renders the branded wash: two logos and text floating on near-black. The committed baselines show it plainly. The NE @ BUF Command Center hero (`e2e/__screenshots__/desktop/sift2-game.png`) and the OSU @ UGA Games feature (`sift2-games.png`, `phone/sift2-games.png`) have a ~200 px band of empty navy above the matchup.
2. **Player art barely exists.** [V] 25 NFL player photographs across 17 teams (`src/lib/player-images.json`, `public/players/nfl/`). 21 were auto-picked by a filename heuristic, not reviewed pixel by pixel. No NBA, NHL, MLB, CFB, CBB, soccer or tennis player has a photograph. Every other player shows a team logo on a gradient, which is honest but makes "Featured Players" and "Key Matchup Drivers" read as repeated logos (`sift2-game.png`).
3. **Three sports have no identity art at all.** [V] Soccer: no crests, no competition marks, no flags, no heroes, initials only (`src/views/soccer/SoccerHome.tsx:52-53`, `lib/soccer.ts:405`). Tennis: no flags, tournament marks, headshots; initials only (`TennisMatch.tsx:30-39`). NBA: logos exist (30) but no hero photograph although `venues.json` already lists NBA tenants.
4. **Hub mastheads reuse one team's building as a generic banner.** [V] Intelligence's masthead is hard-coded to `nfl-chi-soldier-field` (`src/views/intel/TerminalView.tsx:172`), My Board falls back to `nfl-lar-sofi-stadium` (`src/views/board/BoardView.tsx:250`), Pulse to Arrowhead (`PulseView.tsx:102`). `docs/sift-2.0/ASSET-POLISH.md` itself rejects the Soldier Field frame as "washed-out" for featured use, and `docs/HEROES.md` states the principle "never a generic stadium". The mastheads contradict both. [U] These screens are in the classic shell in the baselines; confirm they render the same component under `/design/sift2/`.
5. **Text-only surfaces carry no atmosphere.** [V] Home's "What matters today", My Board and Research Lab promo cards, the Prop Explorer hub masthead, empty states and the Games schedule are text and stroke icons (`Sift2HomePreview.tsx:80-93`, `PropsHub.tsx:54-70`, `BoardView.tsx:179-187`).
6. **The one AI image in the product shows exactly why AI athletes fail.** [V] `public/heroes/art/nfl-lar-buf-1200.webp` (copy: `docs/artwork/img/existing-ai-art-lar-buf-1200.jpg`) is shown only for LAR–BUF in the *classic* hero (`src/lib/hero/artwork.ts:18-30`). It has generated NFL shields, a swoosh-like mark on the sleeve, captain's patches on both players, an unreadable jersey number and two plausible-but-invented faces. It is labelled "AI-generated, not a photograph", but it violates every rule in `players.ts:1-4`. Its composition (athletes anchored to the outer edges, a dark centre for text, team-coloured light split) is correct and is the target *composition*. The ingredients must change.
7. **Rights debt.** [V] ~757 logos are fetched from ESPN's and the NHL's CDNs with no licence record. 64 of 100 hero photographs and 15 of 25 player photographs are CC BY-SA. The Arrowhead night photo is in neither registry nor credits table. On-image credits are 9 px and truncate the artist. The prune loop in `scripts/heroes/fetch.mjs:77-81` would delete `public/heroes/art/` on the next run. Details in section 7.

**What the user asked for versus what is achievable for free.** Authentic, high-contrast, licensed *action photography of named athletes* cannot be obtained for free at scale. Wikimedia Commons yields mostly mediocre, partly dated frames, and rights of publicity are a separate, real risk for a betting-adjacent product (section 7.5). The strategy in this folder therefore moves the *visual drama* off the athletes and onto things SIFT can own: light, atmosphere, playing surfaces, sport objects and team-colour systems, with verified photography kept where it is genuinely good. See document B.

---

## 2. Verified surface map

SIFT 2.0 is the default build: `src/lib/uiMode.ts:8` (`BUILD_UI` is `sift2` unless `VITE_SIFT_UI=classic`). `UiGate` (`src/App.tsx:71-78`) redirects classic roots to `/design/sift2/*`; the classic interface stays in the bundle and under `?ui=classic`.

| Surface | Route (SIFT 2.0) | Entry component |
|---|---|---|
| Home | `/design/sift2/home` | `src/views/Sift2HomePreview.tsx` |
| Games | `/design/sift2/games` | `src/views/Sift2Games.tsx` |
| Game Command Center | `/design/sift2/:sport/game/:eventId` | `GameRoute` → `GameView sift2` (`src/views/Game.tsx:76-106`) |
| Prop Explorer | `/design/sift2/props`, `/design/sift2/:sport/props` | `PropsHubView`, `PropExplorerView` |
| Intelligence | `/design/sift2/intelligence/*` | `TerminalView`, `PulseView`, … |
| Research Lab | `/design/sift2/explore` | `ExploreView` |
| My Board | `/design/sift2/board` | `BoardView` |
| Sports | `/design/sift2/:sport/*` | `SportHome` dispatch (`SportHome.tsx:103-111`) |

Supported sports (`src/data/sports.ts:33-93`): **NFL, MLB, CFB, NBA, NHL, SOCCER, CBB, TENNIS** (eight). MMA and PGA appear in nav as `planned` and render only an icon (`src/views/PlannedSport.tsx:15`); there is no WNBA, no MMA or PGA publication. Not assumed, not scheduled.

**Important structural fact** [V, `Game.tsx:76-106`]: only the generic `GameView` path gets the SIFT 2.0 cinematic Command Center. That is **NFL**, and **CFB through the Script Engine branch**, which uses `GameHero cinematic` but its container is `page page--hero game game--engine` with no `sift2-command` class (`Game.tsx:405`), so the fixed command heights do not apply [U: the visual consequence was not rendered]. NHL, MLB, NBA, Soccer, Tennis and CBB route to their own game views that call `GameHero`/`HeroArt` without the `sift2` prop. "Game Command Center artwork" therefore means two things: the NFL/CFB cinematic hero, and six sport-specific classic heroes.

---

## 3. Measured geometry

Read from CSS; the e2e capture spec `e2e/sift2-fidelity-capture.spec.ts` records geometry JSON that should be used to confirm container widths before any asset is finalised.

| Surface | Desktop | Phone | Source |
|---|---|---|---|
| Games feature hero | `height:502px` above 719 px; matchup grid `1fr 240px 1fr`, padding `0 70px 18px` | `405px`; grid `1fr 145px 1fr` | `sift2-fidelity.css:15-16, 74` |
| Command Center hero | `454px` full-bleed from x=128 (left rail 128 px); right rail 168 px, container `padding-right:184px`; `550px` min at ≥1800 px | final **250px** (338 → 310 → 250); Props tab **202px** | `sift2-fidelity.css:26-28, 67, 79`; `sift2-refine.css:90-91`; `sift2-reference.css:32` |
| Home featured hero | `height:auto`, `min-height:0`; matchup padding `84px 30px 14px` | matchup padding `52px 10px 10px`, columns `1fr 112px 1fr` | `sift2-refine.css:8-13, 29-43` |
| Club logo in hero | 112×88 base; 130×84 on Command Center; 82×74 ≤1250 px | 76×65 (Games), 87×64 (Command), 56×44 (Home) | `sift2-reference.css:22,33,35`; `sift2-fidelity.css:29,67` |
| Venue/photo in rows | backdrop `inset:0 0 0 38%`, `opacity:.55`, 60 px row | — | `sift2-games-list.css:69-92` |
| Featured-player card | `126px` tall, 4 columns | 2 columns | `sift2-fidelity.css:52, 70` |
| Driver art | 85 px tall, 38 % column | 80 px | `sift2-fidelity.css:51, 70` |
| Player rows | 100 px photo column, 128 px min | 86 px / 120 px; Props tab 110 px | `sift2-fidelity.css:61, 73, 91` |
| Prop-explorer faces | 42 px (rail), 112 px (header) | 76 px (header) | `fidelity-research.css:146,155,218` |
| `PlayerFace` sizes | sm 40, md 56, lg 88, xl 132 | same | `insight.css:45-48` |

Breakpoints used by art-bearing CSS: **719/720** (phone/desktop, the primary art split), 900, 1100 (Home collapses to one column), **1250/1251** (Command Center rail goes static / two-column overview), 1180 (3-column Games rows), **1800** (hero grows to 550 px). Focus is art-directed per breakpoint with `--focus-d` / `--focus-m` (`sift2-assets.css:4,24`; `hero.css:50`). Note a 1 px mismatch: `hero.css` switches at `max-width:720px`, SIFT 2.0 files at 719.

Derived aspect ratios [R, derived from the numbers above, to be confirmed with the geometry JSON]:

| Slot | Approx. size at 1536 / 390 px viewport | Ratio |
|---|---|---|
| Command hero desktop | ≈1224 × 454 | ≈ 2.7 : 1 |
| Games hero desktop | ≈1260 × 502 | ≈ 2.5 : 1 |
| Command hero phone | ≈390 × 250 (202 on Props tab) | ≈ 1.56 : 1 (1.93 : 1) |
| Games hero phone | ≈360 × 405 | ≈ 0.9 : 1 |

The ratios differ enough that **no single image fits both desktop heroes, and phone is a different composition (nearly square, up to 0.9 : 1), not a scaled desktop.** Document D specifies one wide master (3 : 1) and one tall master (4 : 5), each with art-directed focus points, rather than stretching.

Safe areas [V]: the tab bar is sticky with `top:var(--safe-t)` and a painted inset (`sift2-game-nav.css:11,20`); bottom nav uses `env(safe-area-inset-bottom)`; `viewport-fit=cover` is set (`index.html:5`). **The hero itself uses no inset**, so phone art must keep subjects out of the top ~44 px and bottom nav area by composition, not by CSS.

---

## 4. Existing artwork inventory (verified counts)

| Asset | Count / size | Where | Notes |
|---|---:|---|---|
| Hero venue photos | **100** (CFB 41, MLB 23, NFL 15, NHL 14, CBB 7); 300 WebP files, **76.4 MB** | `public/heroes/<sport>/`, `src/lib/hero/photos.json` | 720/1200/2400 triplets; 2400 median 483 KB, max 1.46 MB; 11 originals are only 1600 px wide |
| Arrowhead night (SIFT 2.0) | 3 files, 452 KB | `public/sift2/venues/` | CC BY-SA 4.0 (Kj1595). In neither `photos.json` nor the Status credits table |
| AI art LAR–BUF | 2 files, 424 KB | `public/heroes/art/` | classic hero only; deleted by next Hero images run |
| Team logos | NFL 33, NHL 32, NBA 30, MLB 30, CFB 263, CBB 365; **3.9 MB** | `public/teams/<sport>/` | ESPN / NHL CDN; none for soccer or tennis |
| League marks | 4 (NFL, MLB, NBA, NHL), 15.8 KB | `public/leagues/` | comment claims NCAA/PGA; manifest has neither |
| Player photos | **25**, 1.25 MB (13–134 KB) | `public/players/nfl/` | NFL only, 17 teams; 21 heuristic picks |
| Sport symbols | 6 inline SVGs (soccer, tennis, mma, cfb, cbb, pga) | `src/components/SportMark.tsx:12-67` | original art, no rights issue |
| Icon sets | stroke `Icon` (24 grid), market glyphs, NHL (~30) and CFB (12) glyph sets | `Icon.tsx`, `MarketIcon.tsx`, `views/nhl/glyphs.tsx`, `views/cfb/kit.tsx` | original |
| PWA | icon-192/512/maskable, apple-touch, svg | `public/icons/` | rendered from inline SVG by `scripts/make-icons.mjs`; **no splash screens, no OG/social image** (`index.html`) |
| Blocklists | 30 player files, 6 hero files | `player-image-blocklist.json`, `scripts/heroes/blocklist.json` | reasons: college/former-team uniform ×16, press/off-field ×~11, camp/charity ×3 |

Coverage by sport [V]: NFL heroes 15/32 registry (10/32 after SIFT 2.0 curation), MLB 23/30, NHL 14/32, CFB 41 FBS (many without a publication-stated venue), CBB 7/365, NBA 0, Soccer 0 (no club table at all), Tennis 0 (always branded, `resolve.ts:43`).

---

## 5. The artwork inventory

Production attributes are given once per **asset family** (section 6) to avoid repeating fifteen columns on every row. Each row names the family it needs. Priorities: **Critical** (first thing a visitor sees, on every visit), **High**, **Medium**, **Low**.

### 5.1 Home

| # | Component | Exact source | Current art | Visible problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| H1 | Featured matchup hero (`BroadcastHero compact`) | `src/components/sift2/BroadcastHero.tsx:32-52`, `VenueArt.tsx:9-28`, `HeroArt.tsx:45-67` | Venue photo when verified, else branded wash + logos | Void above logos in the fallback; "Venue not verified" text; 9 px credit; no sport character | Sport atmosphere plate beneath the branded layer + effects; photo path unchanged | F1 + F2 | **Critical** |
| H2 | "Today's games" rows (max 6, 2 per sport) | `GameList.tsx:35-59`; `sift2-games-list.css:69-92` | Quiet card-crop backdrop at 55 % opacity only when a photo exists | Most rows are flat gradients; soccer/tennis marks are initials | Sport-tinted row texture from plate card-crop; monogram crest system for no-logo sports | F1, F6 | High |
| H3 | Top-props cards | `src/views/home/HomeTopProps.tsx:220,309`; `home-top-props.css:33,121` (52/40 px faces) | `PlayerFace` photo or team logo on gradient | Mostly logos; non-NFL never has a face | Prop-category object art as the *card* identity, face only when approved | F3, F5 | High |
| H4 | "What matters today" / Intelligence aside | `Sift2HomePreview.tsx:85-93` | Text | No visual identity per signal type | Abstract signal-field header, per-type glyph | F8 | Medium |
| H5 | Explorer / My Board / Research Lab promo cards | `Sift2HomePreview.tsx:80-93` | Text surface cards | Flat, repetitive | One abstract illustration per destination | F8 | Medium |
| H6 | Empty / error / loading states | `Sift2HomePreview.tsx:58-75`; `ui.tsx:260-294`; `DataState.tsx` | Text boxes, skeleton lines | Look broken rather than designed | Small state illustrations (no slate, feed unavailable, research only) | F9 | Medium |
| H7 | Sport filter chips | `SportMark.tsx`, `Sift2Games.tsx:68` | League logo (4) or inline SVG | Inconsistent set (logos vs hand-drawn) | One unified SIFT sport-glyph family | F7 | Medium |

### 5.2 Games

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| G1 | Games feature hero (502 px / 405 px) | `Sift2Games.tsx:24-37, 72`; `sift2-fidelity.css:15-17, 74` | Same stack as H1 | Largest void in the app (see `sift2-games.png`); credit link 8-9 px | As H1, with the 2.5 : 1 / 0.9 : 1 crops | F1 + F2 | **Critical** |
| G2 | Schedule rows | `GameList.tsx:32,109` (`art=false` by design: "paints no hundred photographs") | Flat rows, `PMark` | Sport group headings are plain text; initials for soccer/tennis | Keep rows quiet. Add sport glyph + thin accent to group headers only | F7, F2 | Medium |
| G3 | Status visuals (live / upcoming / final) | chips in `Sift2Games.tsx`, `GameList.tsx` | Text chips | Fine functionally | Optional micro-glyphs only. No new art | F7 | Low |
| G4 | Date strip, filters | `Sift2Games.tsx` | Text | Functional controls | **None.** Decoration would hurt usability | — | — |

### 5.3 Game Command Center

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| C1 | NFL/CFB cinematic hero (454 / 250 / 202 px) | `views/game/Hero.tsx:176-183`; `BroadcastHero.tsx`; `sift2-fidelity.css:26-33, 67, 79` | Venue photo (10/32 NFL), else branded | As H1; 22 of 32 NFL home teams hit the fallback | As H1 with desktop and tall phone masters; phone keeps subjects out of top 44 px | F1 + F2 (+ F4 photos) | **Critical** |
| C2 | Six non-NFL game heroes (NHL, MLB, NBA, Soccer, Tennis, CBB) | `NhlGame.tsx:289`, `MlbGame.tsx:99-101`, `NbaGame.tsx:59`, `SoccerMatch.tsx:206`, `TennisMatch.tsx:126`, `cbb/Game.tsx:171` | Classic `GameHero`/`HeroArt`; always branded for NBA/Soccer/Tennis | No cinematic treatment; no sport character; soccer shows default navy with no watermark | Reuse the same plate + effect stack per sport; do not redesign these layouts | F1 + F2 | **Critical** (NBA, Soccer, Tennis) / High (NHL, MLB, CBB) |
| C3 | Key Matchup Drivers art (85 px / 80 px) | `CommandOverview.tsx:48`; `sift2/playerArt.ts:5-10`; `sift2-fidelity.css:51` | A QB/RB photo for offence units with a match; **always the team logo for defence units** | Three rows of near-identical logos (see `sift2-game.png`) | **Unit art**: sport-object + team-colour light per driver type (run game, pass protection, big plays, takeaways), no person | F3 + F2 | High |
| C4 | Featured Players ×4 (126 px) | `CommandOverview.tsx:27,54-58`; `PlayerArt.tsx:7-16` | Photo for 25 NFL players, else logo-on-gradient | Two of four cards are usually logo cards | Keep photos where approved; make the *fallback* a designed prop-card art, not a logo on stripes | F3, F5 | High |
| C5 | Players tab rows | `PlayerSnapshot.tsx:33-43`; `sift2-fidelity.css:61,73,91` | `PlayerArt portrait` | Same coverage gap | Same as C4 | F3, F5 | High |
| C6 | Right-rail weather/market tiles | `CommandOverview.tsx:68-76` | stroke `Icon` (sun/dome/…) | Functional | Optional unified weather glyphs | F7 | Low |
| C7 | Game script bars | `CommandOverview.tsx` | bars + percentages | Intentionally quiet (shares are not probabilities) | **None**; do not decorate evidence | — | — |

### 5.4 Player Prop Explorer

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| P1 | Hub masthead | `props/PropsHub.tsx:54-56` | Text only | The weakest art surface of the four primary destinations | Sport plate masthead matching Home | F1 + F8 | High |
| P2 | Sport cards (NFL / MLB / NHL) | `PropsHub.tsx:70`; `lane-b-props.css:181` | 44 px stroke-icon box | Generic; icon hidden on phone (`refine.css:56-58`) | Sport object render as card key art | F3 | Medium |
| P3 | Player rail + selected header | `explore/PropExplorerView.tsx:148,237`; `fidelity-research.css:146-155,218` | Classic `PlayerFace`, **not** `PlayerArt`, so it skips the reviewed crops | Logo fallback; no sport/venue art; header glow only | Route through the reviewed crop layer; designed fallback | F5, F3 | High |
| P4 | Prop-category artwork (passing / rushing / receiving / TD; MLB hits/K; NHL goals/assists) | filter chips `PropExplorerView.tsx`; `props/model.ts` | Text chips | No visual vocabulary for stat types | Per-category object glyph + colour | F3, F7 | High |
| P5 | Top-props rows | `props/TopProps.tsx:119` | `PlayerFace sm` 44 px | As P3 | As P3 | F5 | Medium |

### 5.5 Intelligence

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| I1 | Terminal masthead | `intel/TerminalView.tsx:172` (hard-coded `nfl-chi-soldier-field`) | Chicago photo for every sport | Contradicts `HEROES.md` and `ASSET-POLISH.md`; Bears building on a "Soccer" tab | Abstract signal-field masthead, sport-neutral | F8 + F2 | High |
| I2 | Detail hero | `intel/TerminalPanels.tsx:118,133` | `HeroArt card` or 40 px sport mark | Fine when a game exists | Plate fallback instead of sport mark | F1 | Medium |
| I3 | Pulse / Lab mastheads | `PulseView.tsx:102,191` (Arrowhead, Scotiabank) | Hard-coded photos | As I1 | As I1 | F8 | Medium |
| I4 | Market-movement / emerging-signal art | `intel/Markets.tsx:77,152,275`; `MarketCompare.tsx` | `PlayerFace`, `SportMark` | Text-heavy | Signal-type glyphs only | F7 | Low |
| I5 | Evidence / confidence charts | inline SVG `TerminalPanels.tsx:90`, `PulseView.tsx:137` | Functional charts | Data visualisations | **No artwork.** Use the dataviz palette; chart chrome only | — | — |

### 5.6 Research Lab

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| R1 | Masthead | `explore/ExploreView.tsx:99`; `explore/photos.ts` | Photo for NFL, CFB, MLB, NHL, CBB; **glass wash for NBA, Soccer, Tennis** | Three sports have no masthead art | Plate masthead | F1 | High |
| R2 | Tool cards | `explore/labTools.ts:22-28` | 7 stroke icons | Generic | Category illustration per tool | F8 | Medium |
| R3 | Stats views | `views/stats/*`, `statviz.tsx` | `TeamMark`, charts | Functional | None | — | — |

### 5.7 My Board

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| B1 | Masthead | `board/BoardView.tsx:227-250` | Next saved game's photo, else `nfl-lar-sofi-stadium` | A Rams building on a generic page; an NHL saver sees SoFi | Personalised plate: the saved sport's atmosphere + the saved team's colours | F1 | High |
| B2 | Empty state | `BoardView.tsx:179-187`, `BoardPreview.tsx:2,20` | Icon-only how-to (plus, clock, bolt) | Weakest first impression of a personal feature | Illustration + one clear CTA (no new feature) | F9 | Medium |
| B3 | Saved game card / saved player row | `BoardView.tsx:140`; baseline `board.png` | `HeroArt card`; player row is a "PLAYER" pill with no face | Saved players have no portrait at all | Reuse `PlayerArt` + designed fallback | F5, F3 | Medium |
| B4 | Slate packet buttons | `BoardView.tsx` | `SportMark` | Fine | Unified sport glyphs | F7 | Low |

### 5.8 Individual sports

| # | Sport | Verified state | Gaps | Proposed | Priority |
|---|---|---|---|---|---|
| S1 | NFL | 32 logos; 15 photos (10 usable); 25 players; generic home (`GenericSportHome`) | 17 teams no photo (ATL, BUF, CIN, CLE, DEN, DET, HOU, IND, LAC, LV, MIA, NE, NYG, PHI, PIT, SEA, TB); 3 forced-branded (CHI, BAL, GB); CAR/WAS card-only | F1 (NFL night-turf signature) + F4 gap-fill | **Critical** |
| S2 | CFB | 263 logos; 41 photos; `CfbGlyph` set | Most programs fallback; no home masthead art beyond tiles | F1 (college Saturday light), F4 targeted | High |
| S3 | NBA | 30 logos, league logo; **0 photos, 0 players** | `venues.json` has NBA tenants but no pinned photos | F1 hardwood signature; F4 curation run | **Critical** (hero) |
| S4 | CBB | 365 logos + monogram fallback (`cbb/viz.tsx:13-31`); 7 photos | 358 programs on branded | F1 (arena court plate), reuse monograms | Medium |
| S5 | NHL | 32 logos; 14 photos; hockey `Glyph` set; league logo | 18 on branded | F1 (ice-sheet plate) | High |
| S6 | MLB | 30 logos; 23 photos; no players | 7 on branded | F1 (ballpark dusk plate) | Medium |
| S7 | Soccer | **No crests, no competition marks, no flags, no heroes, no league logo** | Everything | F1 (pitch-under-lights plate), F6 monogram crest system. Official crests are trademarked: do not ship them without a licence | **Critical** (identity) |
| S8 | Tennis | **No flags, headshots, tournament marks; initials only** | Everything; hero is already surface-tinted (`TennisMatch.tsx:94-98`) | F1 (court-surface plates: hard / clay / grass), flags via MIT `flag-icons` [U verify], monograms | High |
| S9 | MMA / PGA | `planned`, icon only | Not supported | **Nothing.** Do not create art for unsupported sports | — |

### 5.9 Shared / cross-cutting

| # | Component | Source | Current | Problems | Proposed | Family | Priority |
|---|---|---|---|---|---|---|---|
| X1 | Sport marks | `SportMark.tsx:12-78`; `league-logos.json` | 4 league logos + 6 inline symbols | Inconsistent set; NCAA/PGA claimed in comment but absent | Unified SIFT sport glyph family (own art, no league marks needed) | F7 | Medium |
| X2 | Brand | `sift2/Navigation.tsx`; `Icon.tsx:94,106` | Text "SIFT 2.0"; `SiftMark` (three bars + gold dot) | No logo image in the 2.0 nav | Refine the existing mark; do not redesign the layout | F10 | Medium |
| X3 | PWA / social | `vite.config.ts:42-60`; `index.html` | Icons only | **No splash, no OG/Twitter image** | Generated splash set + one OG image | F10 | Medium |
| X4 | Loading | `ui.tsx:260`; `App.tsx:53-55` | Skeleton lines | Acceptable | Leave neutral; skeletons should not imitate content | — | Low |
| X5 | Onboarding | none exists [V] | — | — | **Do not add**; not an existing feature | — | — |
| X6 | Photo credits | `BroadcastHero.tsx:51`; `views/Status.tsx:89-104` | 9 px / 7 px phone link | Legal visibility; artist truncated | Not artwork, but required alongside any new asset class | — | High (rights) |
| X7 | Orphans / stale | `CinematicHero.tsx` (only `/design/sift2/hero`); `docs/ARCHITECTURE.md:292-301` | Unused / describes nonexistent `public/stadiums/` | Misleads the next contributor | Reconcile in the roadmap | — | Low |

---

## 6. Asset families (production attributes)

| Family | Content | Asset type | Reusability | Est. quantity (concepts → delivered files) | Free production method | Licensing considerations |
|---|---|---|---|---|---|---|
| **F1 Atmosphere plates** | Sport environment *without* people, logos, text or a recognisable real venue: surface in perspective, light, haze | Raster plate (AVIF/WebP), wide + tall + card crop, luminance-balanced, team-colourable | Very high: one plate serves every team in a sport; tinted at runtime | 8 signature + ~10 variants → ~18 concepts → ~54 files | Procedural CSS/SVG floor [V proof-of-concept, section 8]; Blender renders; local open-weight diffusion for texture only | Generated art: model licence + record; US Copyright Office: prompts alone are not authorship [U via secondary reports], so SIFT may not be able to *exclude* others, but may use it |
| **F2 Effects kit** | Light cones, haze, grain, halftone, speed lines, livery stripes, vignette, score-glow | SVG / CSS / tiny PNG; runtime layers | Universal | ~12 → ~12 files (<20 KB each) | Hand-coded SVG/CSS (Inkscape) | Original; no third-party rights |
| **F3 Sport-object art** | Ball, puck, glove, bat, racquet, helmet *without marks*; prop-category and unit keys | 3D renders (transparent PNG/AVIF) + SVG glyphs | High | 8 sports × 2 poses = 16 → ~32 files | Blender (GPL; Metal on Apple Silicon [V via search]); Inkscape | Generic equipment only. No league, team or brand marks. Own renders |
| **F4 Venue photos** | Verified home-venue game frames | Existing 720/1200/2400 WebP triplet | Per team, per era | Today 100; gap-fill target depends on Commons yield (R: +20 to +40) | Existing Commons curation workflow | CC BY / BY-SA / CC0; share-alike on adaptations; trademark and signage visible in frame |
| **F5 Player photos** | Verified game-day frames in current team kit | Existing 600 px WebP | Per player | Today 25; policy-gated | Existing Commons pipeline | CC clears copyright only. Right of publicity and trademarks on uniforms are separate (section 7.5) |
| **F6 Team identity** | Logos (existing); SIFT monogram crests for clubs/players without a licensed mark; tennis flags | SVG generated at runtime | High | 0 new files for monograms (code); flags via library | Code; MIT `flag-icons` [U verify] | Official crests/competition marks: do not ship without a licence |
| **F7 Sport & status glyphs** | Unified sport glyph family, weather, status | SVG | Universal | ~30 SVG | Inkscape / hand SVG | Original |
| **F8 Intelligence / Research art** | Abstract signal fields, ledger grids, per-tool illustrations | SVG / procedural canvas | High | ~12 | Code + Inkscape | Original |
| **F9 State illustrations** | Empty board, no slate, feed unavailable, research-only | SVG | High | ~10 | Inkscape | Original |
| **F10 Brand / PWA** | Splash set, OG image, mark refinements | PNG/SVG | Fixed | ~12 | Playwright render (`make-icons.mjs` pattern) | Original |

Estimated complete new library: **~70–90 concepts, ~250–300 delivered files, ≈ 15–25 MB** of new bytes, before the existing 76 MB of photographs. [R] See document D for budgets. The Critical-path subset is about 25 assets (document F).

---

## 7. Rights and compliance findings that affect any artwork plan

All [V] unless marked.

1. **Logos have no recorded licence.** ~753 team logos (ESPN CDN, `scripts/teams/fetch-*.mjs`) and 32 NHL logos (`assets.nhle.com`). Manifests record only a source string; `mlb-team-logos.json` lists all 30 as "previously committed", so provenance is already lost. The scripts and docs call trademark review "an owner item before commercial launch" (`docs/HEROES.md:79-81`, `fetch-logos.mjs:4`, `fetch-nhl-logos.mjs:127`). [U] ESPN's CDN terms probably do not grant redistribution. This is the largest single legal exposure in the asset base and is outside what artwork generation can fix.
2. **Share-alike.** 64/100 hero photos, the Arrowhead photo and 15/25 player photos are CC BY-SA. Crop + colour grade + resize makes the served WebPs adaptations, so BY-SA applies to those files. `docs/HEROES.md:77` says they are served under the same licence, but the only shipped notice is `public/sift2/venues/LICENSE.md`. No LICENSE/NOTICE covers `public/heroes` or `public/players`. **Consequence for new art: do not bake generated or composited content into a BY-SA photograph.** Keep photographs pure and layer overlays at runtime in CSS, as `ASSET-POLISH.md` already does. [U] whether a CSS overlay creates a derivative is jurisdiction-dependent; the separable-layer design avoids the question.
3. **Attribution display.** On-image credits truncate artists to 32-40 chars and show no licence link; the stored artist is cut at 120 chars (one entry ends mid-parenthesis, `nhl-car-lenovo-center`). The full credit exists on Status only.
4. **SIFT 2.0 credits gap.** The Arrowhead night photo is absent from `photos.json`, therefore from the Status "Game photo credits" table (`Status.tsx:89-103`) and from the `heroRegistry` licence tests.
5. **Right of publicity is not solved by a Commons licence.** CC licences clear the photographer's copyright, not the athlete's likeness rights or marks visible on uniforms. Commons itself warns that reusers must check personality-rights and trademark restrictions [V via search of Commons guidance]. In 2024 the MLB Players Inc. sued DraftKings, bet365, FanDuel and Underdog over player likenesses on betting products; FanDuel settled under a confidential licence and the others were pending at the time of reporting [V via ESPN/ABC/Legal Sports Report coverage]. The same reporting noted operators used only team logos and names, not photos, on NFL prop pages [V via the same coverage]. SIFT's `players.json` already labels its portraits "REVIEW ASSETS … until a licensed player-image source is chosen". **This is not legal advice; it is the strongest reason this plan does not make athlete portraits the primary visual.**
6. **AI art provenance.** `public/heroes/art/*` has no credits entry and no generation record (prompt, model, seed, date).
7. **Policy to preserve.** Existing project rules forbid generated athletes and stadiums in the product: `players.ts:1-4`, `venues LICENSE.md`, `VISUAL-FIDELITY.md:11,26`, `BLUEPRINT.md:14`, `ASSET-POLISH.md:7`. The Rams–Bills art is the single owner-approved exception. My recommendations stay inside these rules except where an explicit owner decision is requested (document F, decisions D1-D3).
8. **Build hazard.** `scripts/heroes/fetch.mjs:77-81` removes any file under any subfolder of `public/heroes/` that no pin owns, including `public/heroes/art/*`. `tests/heroArtwork.test.ts` does not check file existence, so nothing would catch it. New asset classes must **not** live under `public/heroes/`.
9. **No image budget gate.** `scripts/check-dist.mjs` has no image checks; `docs/ARCHITECTURE.md:62-70` has no image row; its "Stadium photos" section (`:292-301`) is stale (describes `public/stadiums/`, which does not exist). Production check requires hero photos to load (`scripts/production-check.mjs:446-472`) and `e2e/hero.spec.ts:33-41` requires `naturalWidth > 600`.
10. **Service worker.** WebP/AVIF are not precached; only `/heroes/` has a CacheFirst rule (80 entries, 30 days, `vite.config.ts:91-100`). Logos, players and `/sift2/venues/` have no runtime cache rule.

---

## 8. Proof-of-concept: what a rights-clean procedural plate can and cannot do

To test the central recommendation without generating anything with AI, I built one throwaway, code-only atmosphere (`docs/artwork/img/poc-light-field.html`, documentation evidence only, not imported by the app): two team-colour light fields anchored to the outer edges (BUF blue/red on the right, NE navy/red on the left), floodlight cones, bokeh, haze, film grain, a vignette and the existing readability gradient, with real text at the real proportions.

* Desktop 1352 × 454 (`img/poc-desktop-1352x454.png`), phone 390 × 250 (`img/poc-mobile-390x250.png`).
* **What it proves [V by rendering]:** the layering works at both real hero sizes; the centre stays dark enough for the existing text; team identity reads from colour alone; it replaces the void; it costs ~0 bytes of image and has no rights surface.
* **What it does not prove:** it is a *floor*, not the ceiling. Honestly, it is atmospheric but not yet cinematic; it has no depth cues of a real bowl and no photographic texture. It will not reach "ESPN Primetime" alone. The recommended stack adds Blender-rendered or locally generated *plates* beneath these effects and keeps verified photographs where they are good.

---

## 9. Not verified (open items)

* Rendered geometry of the Home hero (`height:auto`) and the 720-1250 px Command Center range. Use `e2e/sift2-fidelity-capture.spec.ts` geometry JSON.
* Whether `TerminalView` / `BoardView` / `ExploreView` mastheads render identically under `/design/sift2/` (baselines are classic-shell captures).
* The visual consequence of CFB's missing `sift2-command` class.
* Live-data appearance (baselines use fixtures and a fixed clock of 2026-10-04).
* Image content beyond the AI art and a handful of baselines; the 100 venue photos were not re-reviewed here (`HEROES.md` records a 2026-10-11 full review).
* Network-restricted sources: this environment could not reach huggingface.co, commons.wikimedia.org, unsplash.com, pexels.com, pixabay.com or copyright.gov. Licence statements about those are from search summaries and flagged [U] where relied on.
* Nothing was generated, downloaded or purchased.
