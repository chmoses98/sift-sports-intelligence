# Lane E — Home, Research Lab and Intelligence (repair sprint 2026-10-11)

Branch `sprint/lane-e`, worktree `/home/user/lanes/e`. Real-data screenshots (live publications, 1440 px and 390 px):
`docs/screenshots/2026-10-11/lane-e/` (`before-*` are the baseline).

## New data: the NFL league schedule (feeds issues 2, 19, 46, 50)

`scripts/history/build-nfl-schedule.mjs` → `public/data/league/nfl/schedule.json` (59 KB, committed, refreshed by a new
`continue-on-error` deploy step after the history layer). It is the nflverse schedule (`schedules/games.csv`,
CC-BY 4.0): all 272 regular-season games of 2026 with week, ET date/time, neutral site, division flag and the final
score. **`spread_line` / `total_line` are written only once a game has a final score** (nflverse documents them as the
closing lines; before kickoff the same columns hold a moving line that Sift does not show). Sign convention kept:
positive spread = home favoured. The build refuses a thin file (< 250 regular-season games).

`src/history/league.ts` reads it and does only stated arithmetic: final result, against-the-spread result
(`atsOf`: published final margin vs published closing spread; null when either is missing — a closing line is never
estimated), over/under vs the closing total, records and ATS records from finals before a date (a pregame card never
counts its own game), byes only on a complete schedule, the current week, and matching a publication game by teams and
date (±1.5 days; never by teams alone).

## Issues

| # | Status | What changed | Files |
|---|---|---|---|
| 2 More informative game cards | IMPLEMENTED | One card body for Home's rail and the Games grid: logos and team colours, time / phase, record before the game (NFL), opponent-adjusted O/D ranks (NFL, NHL), the research model's read (NFL projected score, NHL expected goals — labelled "Model", research) and the market's read (NFL market-implied spread + total, else the game-winner contract's market probability), one contextual tag (major matchup mismatch · division game · primetime · coin flip), and the validated-market indicator (#21). Finals show the score, the winner and the result against the closing spread. Cards render from the board immediately and load their game's research only when on screen. Home's rail is now sport groups in research-richness order (NFL, CFB, NHL, MLB, NBA, Soccer, CBB, Tennis) with deep slates capped (tennis 4, soccer 6 …) behind a "N more" tile; games the publication flags stay inside the cap; a sport filter shows everything. Before: 198 tennis matches led the rail and the NFL slate was not visible. | `views/broadcast/cardFacts.ts` (new, pure), `GameCard.tsx` (new), `rail.tsx` (new), `games.ts` (`opps`, `railGroups`, `RAIL_CAP`, week label), `GamesView.tsx`, `styles/lane-e-cards.css` |
| 19 Rankings on cards | IMPLEMENTED (NFL, NHL) | NFL: opponent-adjusted EPA/play offense and defense league ranks (`met_nfl.adj_off_epa` / `adj_def_epa`, direction-aware, "of N" = the publication's universe). NHL: opponent-adjusted 5v5 xGF/60 and xGA/60 ranks. Tier colours follow the rank system. CFB publishes no rankings and no AP/CFP poll (checked: board, events, explorer index has 0 rankings, research-signals) — so CFB cards show none. | `cardFacts.ts` (`CARD_RANKS`, `sideRanks`) |
| 20 Home structure and continuity | IMPLEMENTED (composition; hero visuals are lane A's) | Hero → Today's games → SIFT Intelligence (discoveries beside the featured game's matchup edges) → Research Lab (the same seven tools as the hub) → My Board, one chapter rhythm, the stage/side-panel layout removed, the intelligence subtitle and the old "Explore" link copy removed, summary line shortened. | `views/Home.tsx`, `styles/fidelity-home.css` |
| 21 Best-market indicators only where validated | IMPLEMENTED | `edgeOf`: "Back · <position>" only for an ACTIONABLE row; the publication's top research candidate (tier 2–3, i.e. not a market-beats-model disagreement) shows its tier word ("Research candidate", "Research candidate · robust") with the position, and the authority in the title; a judged game with neither reads "No edge"; a CFB Value Watch or an unjudged game shows nothing. Never a tier-4 or pass row. | `cardFacts.ts` |
| 44 Research Lab replaces "Explore" | IMPLEMENTED (in lane-E files) | Hub h1 "Research Lab", trail label, Season eyebrow "Research Lab · NFL", "Stats Lab" → "Stats & rankings", Home links. Route stays `/explore`. | `ExploreView.tsx`, `SeasonView.tsx`, `hub.tsx`, `Home.tsx`, `state/trail.tsx` (cross-lane, 1 line) |
| 45 Research navigation | IMPLEMENTED | Seven tool categories, one definition shared by the hub and Home (`labTools.ts`): Teams · Players · Props (→ `/props`, lane B's top-level route) · Matchup compare · Season · Stats & rankings · Model Pulse. Each tile states what the sport publishes or why the tool is not there; in-page tools are buttons that scroll and set `?tool=`, and `?tool=teams|players|stats` lands on that section from anywhere. The rule that hid the 7th tool under 900 px was removed (odd last tile spans on phones). | `explore/labTools.ts` (new), `ExploreView.tsx`, `fidelity-hubs.css` |
| 46 Weekly matchup presentation | IMPLEMENTED (NFL) | Season navigator: the team strip now covers all 18 weeks from the league schedule (opponent, home/away, date; finals with W/L score and ATS ✓/✗/push; the bye stated because the schedule is complete). The week view lists every game of the week as matchup tiles (logos, records, O/D ranks, model and market read where the game is on the publication's board, finals with result, ATS and over/under), prev/next week, and a week summary ("favourites covered 7 of 12 · 5 of 12 went over — results, not a forecast"). Team header adds the ATS record. Falls back to the old publication-only grid if the schedule cannot be read. The Research Lab hub's timeline shows finals with ATS and links unlisted weeks to the navigator. | `SeasonView.tsx`, `SeasonWeek.tsx` (new), `hub.tsx`, `styles/lane-e-season.css` |
| 50 Historical scores, winners and spread results | IMPLEMENTED (NFL) | League-wide 2026 scores now exist (the OVERNIGHT_HANDOFF gap). Shown on Games/Home final cards, every Season week, the hub timeline and the historical game hero ("Closing spread LAC −8.5 · did not cover", "40 points · closing total 47.5 · under", source line). The publications themselves carry no closing spread or scores for other sports, so those finals say "Final" only. The historical hero's name wrapping ("Arizon a Cardin als") was fixed. | `history/league.ts`, `HistoricalGame.tsx`, cards |
| 51 Intelligence cards lead to research | IMPLEMENTED | Every discovery now carries `meaning` (a plain conclusion, never stronger than its decision word) and `leads` (≤ 4 links by kind). Mismatch → full matchup, the offense-vs-defense metric page, the props that would show it (area-specific: rushing / passing / QB / touchdowns), the game scripts. Market → the contract, every market on the game, NFL props when it is a prop, the model's record in Pulse. Freshness → Data & provenance, the sport home. Home's cards open in place ("What it means": conclusion, key facts, leads; the title still opens the Terminal); the Terminal's selected discovery shows the same conclusion and leads. | `intelligence/discoveries.ts`, `broadcast/parts.tsx` (`DiscoveryCard expandable`, `LeadLinks`), `intel/TerminalPanels.tsx`, `styles/lane-e-intel.css` |
| 52 Intelligence page audit | IMPLEMENTED (see findings) | See the audit table below. | `intel/*`, `discoveries.ts`, CSS |
| 22 Top props (shared with B) | LINK ONLY | Home's Research Lab "Props" tile and the hub's Props tool link to `/props`; no prop logic duplicated. | `labTools.ts` |

## Intelligence audit (issue 52)

| Found | Fix |
|---|---|
| Mismatch discoveries' "Research" link used `tab=matchups`, which no game page knows (silently opened the overview). | `tab=matchup`; covered by a unit test. |
| Home's old "Team rankings" lab tile linked `/nfl/ranking/met_nfl.adj_off_epa` — a metric id where a ranking id is needed (NotFound). | Replaced by the Teams / Stats & rankings tools (`/explore?tool=…`). |
| The Terminal hero offered Scripts / Matchups / Markets tabs for soccer, tennis and NBA, whose pages have no tabs (three links to the same screen). | Tabs only for NFL, CFB, NHL, MLB (MLB without Scripts); one "Open the match/game" link elsewhere. |
| Phone Terminal rendered all 80 discoveries in one 13,000 px list. | The board pages 20 at a time ("Show 20 more · N left"); the 80 cap note is gone. |
| Phone Intelligence sub-navigation scrolled "Model Lab" off-screen. | 2 × 2 grid under 720 px. |
| Model Pulse / Lab bars drew forecast error, so the longer (model) bar looked better. | Header "Forecast error · the shorter bar is better" and a "Better" mark on the leader row. |
| Pulse showed 6 market families with no hint that more exist (soccer has 13). | "+N more in Model Lab" link. |
| The Lab's headline card was half empty and gave no takeaway. | "What this means" sentence keyed on the leader (market leads → a gap is a question, not an edge; model leads → past accuracy, not a promise). |
| Explore/Research Lab: the 7th tool (Model Pulse) was hidden under 900 px. | Removed the rule. |
| Rail sport-group header was `aria-hidden` around a link (axe serious). | Never hidden. |
| Lane A's `FeaturedHero` links "Game scripts" with `tab=scripts` (should be `script`). | Not edited (lane A's component) — handed over below. |

Checked and fine: Market board link (`/intelligence/markets` route exists), Pulse/Lab empty states (MLB/CFB/CBB say why
no record exists), Terminal filters (sport and type chips recount), the selected-discovery deep link (`?d=`) when it has
expired.

## Tests

- `npm run lint`, `npm run typecheck`: clean.
- `npx vitest run`: 68 files, 812 tests passing (new `tests/laneE.test.ts`, 19 tests: schedule integrity — no closing
  line before a final; ATS sign, cover/push/pick'em, no estimation; records before a date; byes only on a complete
  schedule; publication-game matching; NFL and NHL card ranks on real documents; model/market reads; the indicator
  rules; rail grouping and caps; lab tools; discovery meanings and leads). Updated `tests/seasonNavigator.test.ts`
  (breadcrumb now "Research Lab"). One CFB test (`scriptEngine.test.tsx`) timed out once under parallel-lane load and
  passes alone (18/18).
- Playwright (desktop + phone, Chromium, `--grep-invert @visual`, port 4205): rebuild, smoke, a11y, degraded, journey:
  124 passed; then after fixes `e2e/lane-e.spec.ts` (new, 4 tests) + `e2e/a11y.spec.ts`: 62/62 passed. `journey.spec.ts`
  "packet on the clipboard" fails locally on both projects because it grants clipboard permission to the hard-coded
  origin `http://localhost:4173` while lanes run on their own port — environmental, unrelated to lane E.
- Updated e2e to the new behaviour: `rebuild.spec.ts` (destination link /Research Lab|Explore/, h1 "Research Lab"),
  `a11y.spec.ts` (waits for "Stats & rankings").

## Commits

See `git log 66aad3f..sprint/lane-e` (subjects start "Lane E:").

## Cross-lane edits

- `src/state/trail.tsx`: `EXPLORE_STEP.label` "Explore" → "Research Lab" (1 line + comment).
- `.github/workflows/deploy.yml`: one `continue-on-error` step running `build-nfl-schedule.mjs`.
- `e2e/rebuild.spec.ts`, `e2e/a11y.spec.ts`: expectations for the Research Lab names.

## For the integrator / other lanes

- Lane A: the nav label "Explore" in `lib/destinations.ts` should become "Research Lab" (the e2e accepts either).
  `FeaturedHero` "Game scripts" button uses `tab: 'scripts'` → should be `'script'`.
- Lane B: `PropExplorerView` eyebrow still reads "Explore · NFL". The Research Lab links `PROPS_ROUTE = '/props'`
  (`views/explore/labTools.ts`) — if the route lands under another path, change that one constant.
- `GameRow` gained `opps` (all judged rows on the game, best first); `RailTile`/`GameRail` moved from `parts.tsx` to
  `broadcast/rail.tsx`; `DiscoveryCard` gained `expandable`; `Discovery` gained `meaning` and `leads` (required).
- Data: CFB has no published poll or rankings, and no sport except NFL has a published closing line or score source;
  cards stay silent there rather than inventing one. The nflverse closing lines are third-party (nflverse) and are
  shown only for finals, labelled with their source.
