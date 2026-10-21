# SIFT mobile redesign, v4

Status: **design only, for approval.** Nothing under `src/`, `public/`, any workflow, the live-score work, the data pipelines, the models or the Kalshi relay was touched. No merge, no deploy. Branch `design/mobile-v3-redesign`, branched from `design/mobile-v3-polish`. The earlier prototypes (`../source`, `../refinement`, `../polish`) and their screenshots are untouched, and are the "before" in every comparison below.

The v3.2 polish pass changed borders and shadows and looked the same. This is a redesign of how SIFT looks: type, colour, imagery, components, icons and motion. The product structure is the approved one: Home, Games, Props, Signals, Board; Live, Matchups, Players, Markets; signal chips; bottom-sheet research.

* Rendered screens: [`screenshots/`](screenshots/) at 390 by 844 and 3x. Direct comparisons: [`screenshots/before-after/`](screenshots/before-after/). Smaller sizes: [`screenshots/small-screens/`](screenshots/small-screens/).
* Prototype: [`source/`](source/) (interactive `.dc.html` artboards, built from [`src/`](src/) with `node build.mjs`). Not published to the claude.ai canvas.
* Boards: design system (`21-design-system.jpg`), imagery system (`22-imagery-system.jpg`), loading, empty and unavailable states (`20-states-…jpg`).

## 1. Art direction: why the references feel premium, and what v4 does about it

| What the references do | What v3.2 did | v4 |
|---|---|---|
| **Light and depth.** The screen is lit like a stadium: team colour in the lighting, deep ground, glass chrome. | One flat navy ground, outlined boxes, a blue wash on the game hero. | Graphite ground. Club lighting (coral and blue beams and grain) behind the header and the game hero. Frosted sport selector, header and tab bar. Team colour lives only in light and crests. |
| **Real imagery, in context.** A player is in the scene. | Logos only. | A masked, darkened portrait of a player *in the game* behind the featured score, and a hero portrait on player detail. Photos only from the repository's approved set, credited (see §5). |
| **Scoreboard typography.** Big, wide numerals. | Barlow Condensed in capitals everywhere. | Sora for numerals and display (wide, athletic, tabular), Geist for everything read. Sentence case. Almost no capitals. |
| **Compact scoreboard rows.** One line per game, symmetrical. | Two stacked lines with a clock column. | `TEN 7 · Q2 11:03 · 13 BAL`: crest, code, score, clock, score, code, crest. Upcoming rows show names and kickoff. |
| **One inverse selected state.** | Mixed: white blocks, lit tiles, underline. | Selected is always a light pill with dark text. No glow. Ice never means selected. |
| **A real icon family.** | Hand-drawn sprite at one weight. | Phosphor: regular at rest, filled when active. |
| **Restraint.** Colour carries meaning. | Blue everywhere. | Four hues, one meaning each: live red, model ice, market gold, risk amber. |

What was **not** copied from the references: their sample numbers and imagery, the "Edge" column and green "+4%" values, the "SIFT Take" paragraph, the three insight tiles, per-play video buttons, and the AI-composited hero art. All of those would break the rules for this product (no recommendations, no invented data, no fabricated imagery, no large research panels on Home or Game).

## 2. The system

Full reference on the boards. In short:

* **Type.** Sora 700 for scores (54, 48 on narrow screens), display (34) and figures (20 to 32); Geist 400 to 700 for heading 20, title 17, body 15, meta 13, caption 12. Tab labels are 11 (the iOS convention) and the only text under 12. Tabular figures throughout so scores, prices and clocks align and never jitter. Both fonts are SIL OFL and on Google Fonts.
* **Colour.** Ground `#07080B`; surfaces `#0E1116`, `#151920`, `#1D222B`, `#272D38`; text `#F5F7FA`, `#B5BECB`, `#8995A5` (18.7, 10.7 and 6.6 to 1 on the ground). Live `#FF4D5E` (text `#FF8591`), model `#62C9FF`, market `#F2BE45`, risk `#FF9061`. Inverse selected `#F5F7FA` on `#0A0C10` (18.2 to 1). Club colours exist only as lighting.
* **Shape and depth.** Radii 10, 16, 22, 28. One grouped surface per section with hairlines instead of nested boxes. One top highlight. Shadows only where something floats.
* **Components.** Sport selector, day strip, filter chips, scoreboard row, featured card, segmented control, signal chip, badges (LIVE, FINAL, PREGAME, Sample), grouped list, ladder, sheet, tab bar, empty and skeleton states.
* **Motion.** 160 to 340 ms on one easing curve: press scale, sliding tab underline, sheet height with scrim fade, rows rising in a stagger, a slow pulse on live dots. All of it stops under `prefers-reduced-motion`.
* **Imagery tiers.** 1: a verified venue photo (only when the home team, venue and date match an approved photo). 2: club lighting and crests, with a portrait of a player in the game. 3: neutral "SIFT night" art for screens that are not one game. No generic stadium, no unrelated player, no AI composite, and an image never carries a score or a status.

## 3. Screens

| | Screen | File |
|---|---|---|
| 1 | Home: live scores and sports discovery | `01-home-live-390`, scrolled `01b`, published-data-only `01c`, with a signal sheet `01d`, Following selected `01e` |
| 2 | Game Command Center, Live | `02-game-live-390`, plays `02b`, with the signal sheet `02c`, pregame `02d`, final `02e` |
| 3 | Matchups | `03-game-matchups-390` |
| 4 | Players | `04-game-players-390` |
| 5 | Markets | `05-game-markets-390` |
| 6 | Player Prop Explorer, and player detail | `06-props-explorer-390`, `06b-props-player-detail-390`, sheet `06c` |
| 7 | SIFT Signal bottom sheet | `01d`, `02c`, `06c`, `07b` |
| – | Signals list | `07-signals-list-390` |
| – | Loading, empty, unavailable | `20-states-loading-empty-unavailable` |

## 4. What changed that matters

* **Home** now opens like a sports app: sport selector, day, filters, then the live game you follow, lit in both clubs' colours with a real portrait, then compact scoreboard rows. Followed teams stay: a stack of crests in the Following chip, a star on their crests, and a "Your teams" strip when Following is selected. Alerts are a bell on each row; a signal chip replaces the bell where a signal exists.
* **Game** is a compact, dark scoreboard (crests, 54 px score, clock, possession) over four clean tabs with one sliding underline. The Live tab has a real field strip (end zones, yard lines, line to gain, ball), one signal row, plays with team-coloured scoring marks, and team stats. The header collapses to a score line.
* **Matchups** rank duels with team-coloured edge labels; the script distribution is one segmented bar with a list below.
* **Players** shows portraits (or a team-coloured monogram where none is approved), the stat so far, a line-versus-pregame track, and a Kalshi/model ladder.
* **Markets** shows price tiles lit by club colour with the model beside each price and a plain legend.
* **Props** is new as a destination: filter by game and prop type, a row per player with line, Kalshi price and model side by side, and a player detail with a portrait hero and a ladder. The detail's last column is **Diff**, model minus price in points, in neutral grey. It is never green, never called an edge, and the footnote says fees, uncertainty and research checks are in the sheet.
* **Signal sheet** keeps its logic and honesty (frozen at kickoff, fee equation, worst case, "what could make it lose") in the new language. A new read, "Allen 250+ passing yards", shows the other outcome: the model sits *below* the break-even price, headed "Model below the price".

## 5. Honesty rules, and how the design keeps them

* **Separation.** Live data, pregame research, market prices, model projections, signals and unavailable data are each visibly different: red LIVE, a lock for "Frozen at kickoff", gold for Kalshi, ice for the model, an amber banner for stale data, and a dash instead of a number when a feed is stale.
* **No invented live data.** Scores, clocks, plays, stats, lines and prices are samples. Every sample screen carries a "Sample" pill. "Published data only" (`01c`) is the state that ships until a feed exists.
* **No recommendations.** No "edge", no green gain, no "bet" language. Signals say "research candidate" or "model below the price".
* **Imagery.** Venue and player photos come from the repository's approved sets (`public/players`, `public/sift2/venues`); credits are in `source/assets/p/CREDITS.md` and `source/assets/v/LICENSE.md`. The player photos carry `review_asset: true` in `src/lib/player-images.json`, which must be cleared before production. The repository's `public/heroes/art/` composites are AI-generated and are not used. The Tier 1 example (Arrowhead) is illustrative and shown only on the imagery board.

## 6. Validation

All run on the final files. Scripts are in `review-scripts/` (they point at the build environment's paths and a local server on :8096; adjust before reuse).

| Check | Result |
|---|---|
| axe-core, WCAG 2.0 to 2.2 A and AA plus best practice, 17 states (every screen, every sheet, empty day, published) | **0 violations.** The first run found two (a button given `role="listitem"`, ladder rows without cell roles). Both fixed. |
| 390 by 844, 375 by 812, 375 by 667 (iPhone SE), 15 views each: overflow, truncated names, controls under 44 px, text under 11.5 px | **Clean at every size.** Found and fixed on the way: truncated team names in rows (live and final rows now use team codes beside crests), 11 px captions (all now 12), a 38 px script bar (now 44). |
| Touch targets | Every control has a 44 px hit area. Chips (38), segmented buttons (34) and icon buttons (40) extend it invisibly. |
| Contrast | Token text steps 4.5 to 18.7 to 1 against every surface (table on the system board); axe reports no contrast violations in any state. |
| Fonts | Geist and Sora load in Chromium and WebKitGTK in every view. |
| WebKit (WebKitGTK through `WebKitWebDriver`) | Same checks at 390 by 844 and 375 by 667: no overflow. Tabs move panels and the underline follows, a row opens the player detail, the sheet opens to 612 px, expands to 764 px and closes. `backdrop-filter`, container queries, masks and sticky positioning all work. |

**This is not iOS Safari.** WebKitGTK does not exercise safe-area insets on a device, rubber-banding, the on-screen keyboard, the iOS touch pipeline, or how the frosted layers perform on an iPhone GPU.

## 7. Known limitations and open questions

* **Test on a real iPhone before approving.** Frosted glass, the sliding underline, the sheet drag and the row rise should be felt, not judged from stills.
* Motion was reviewed from the CSS and from stills after load; there is no recording. Reduced motion was not exercised in a browser. VoiceOver, Dynamic Type and a light theme were not designed or tested.
* On 375 by 667 the header, sport selector, day strip and filters take most of the first screen: the featured card fits, the first game rows are below it. A short-screen variant (smaller selector, no day labels) is worth considering.
* Tier 1 venue photos exist for only some clubs; the NE at BUF game uses Tier 2. Hero lighting colours here are fixed for the sample; production needs a club-colour table with a fallback.
* Soccer clubs have no crest files in the repository (monogram discs). League marks are the existing approved assets; the CFB and Soccer selector items use glyphs.
* Followed teams, alerts and the Board are static in the prototype. Storage, sync and notification permissions are not designed.
* Sample lines and prices for Props are illustrative; ten players and three prop types are shown.
* **Decisions for you:** (1) Sora and Geist, or another pairing. (2) Inverse selected state versus a quieter raised surface. (3) Whether Home keeps the featured live card, or only the compact rows, when no followed team is live. (4) Whether the portrait behind the featured score is acceptable once photo credits are visible in an info sheet. (5) Whether Props becomes a top-level tab (as here) or lives inside Games.

## 8. Plan to bring this into the real app

Nothing here is wired to the app. Proposed order, each step reviewable on its own and behind a flag so SIFT 2.0 keeps working:

1. **Foundations (no visible change).** Add tokens as CSS variables scoped to a `data-ui="v4"` root, as SIFT 2.0 did. Self-host Geist and Sora (`@fontsource`, latin subset: about 36 KB per Geist weight and 36 KB for variable Sora, with a metric-matched fallback). Add Phosphor as a small icon component that ships only the icons used. Add a `?ui=v4` escape hatch beside the existing one.
2. **Primitives.** Build and visually test: Chip, Segmented, GroupedList, ScoreRow, FeaturedCard, SignalChip, Badge, TabBar, Sheet (reuse the existing `BottomSheet`), EmptyState and Skeleton. Reuse `resolveHero` (`src/lib/hero/resolve.ts`) to choose the imagery tier; add the club-colour table.
3. **Screens in order of risk:** shell and tab bar, Home with the "published data only" state first, Game with Matchups and Markets (data exists today), Players and Props (Kalshi ladders exist; the model column needs the pregame run), Signals. Live-only parts (score, clock, plays, field strip, stats) stay hidden until the separate live-score work ships; the design for "published only" is `01c`.
4. **Gates per screen.** The existing Playwright visual and axe specs, plus overflow and 44 px checks like `review-scripts/layout.mjs`, at 390, 375 and 375 by 667, in Chromium and WebKit; baselines rendered on CI and reviewed, not auto-accepted. A real-device pass on iOS Safari before each release.
5. **Imagery and credits.** Clear the `review_asset` flags, add an info affordance that shows photo credit, and keep the Tier 1 rule in the resolver tests.
6. **Performance.** Budget the two fonts, check `backdrop-filter` on older iPhones (fall back to a solid surface), and keep the backdrop art as SVG or CSS rather than bitmaps.
7. **Rollout.** Flag on for internal use, then a share of users, with the live-score integration as a separate release.

## 9. Files

```
redesign/
  src/        templates (Home, Game, Props, Signals, SignalSheet, States, System, Imagery, wrappers), sift.css, fonts.css, icons.json
  source/     built, self-contained prototype: *.dc.html, sift.css, assets (crests, leagues, player and venue photos), _fonts, canvas.json
  build.mjs   expands icon macros and the status bar into source/ (node build.mjs)
  extract-icons.mjs   vendors the Phosphor icons used into src/icons.json
  review-scripts/     capture, axe, layout, WebKit and before/after scripts
  screenshots/        all captures
```

`source/support.js` (the design-canvas runtime) is not committed; copy it next to the artboards to run them.
