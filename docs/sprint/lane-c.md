# Lane C — Matchups, statistics and schemes (repair sprint 2026-10-11)

Branch `sprint/lane-c`, worktree `/home/user/lanes/c`. Real-data screenshots (live NFL publication run
2026-10-11, LV @ NE week 5, local production build): `docs/screenshots/2026-10-11/lane-c/`.

## Per issue

| # | Issue | Status | What changed |
|---|---|---|---|
| 5 | Accessible basic statistics | IMPLEMENTED | New box-score layer. `scripts/history/build-nfl-history.mjs` now writes per team-week counts (points, gross passing yards, sacks and sack yards, rushing yards, interceptions, fumbles lost, third downs, red-zone trips and TD trips, box-count rush splits, screens, RPOs); verified against nflverse weekly player stats (passing, rushing, sacks, turnovers match per team-week). `insights/basics.ts` turns them into per-game values over the weeks before a game, ranked of 32. Shown first on the Matchups tab (both teams, offense and defense tables), as a **The Basics** card on the game overview bento, at the top of the NFL team page, and in team comparisons. Only stats nflverse actually provides; red-zone TD % and third-down % carry their counts. |
| 6 | Units and denominators | IMPLEMENTED (NFL) / PARTIAL (other sports) | `insights/units.ts` maps every NFL team metric to its registry denominator ("EPA per dropback", "% of dropbacks", "turnovers per play", "% of drives", "air yards per target", "per game"). Adjusted ratings read as a difference from league average ("+1.8 pts", "−0.034 vs league average (EPA / dropback)"); raw values carry their window ("Raw · last 34 games"). Applied to the Matchups tab, metric table, unit cards, builder, team metrics rows, Metric page (answer value, unit chip), Ranking page (unit chip, formatter), AdjustmentCompare, Team Form labels. Rank universes now come from the data ("of 30" on a bye week) instead of a hard-coded 32 (matchup board key, Team Form). Generic `unitLabel('share')` no longer claims "% of plays" for every share. |
| 7 | Adjusted / raw toggle | IMPLEMENTED | `state/statMode.ts`: one app-wide choice (default Adjusted — the publication's matchup rows and ratings are opponent-adjusted), remembered on the device, shown as a two-button toggle on the Matchups tab, team Metrics tab and team comparison. Every value carries an Adjusted / Raw / Season / Box score tag; when only one version exists the tag reads "Raw only" / "Adjusted only" (dashed). |
| 10 | Flexible offense-vs-defense | IMPLEMENTED | **Build a matchup** (`views/stats/Builder.tsx`): 11 rating measures + 9 box-score basics; compare an offense against either team's defense, both offenses, or both defenses. Output: rank-vs-rank duel, both units on one league strip, diverging bars around league average for adjusted ratings, a plain observation sentence and links to every team's ranking. Also on the team comparison ("If they met"). |
| 23 | Readable unit-by-unit analysis | IMPLEMENTED | `insights/unitAnalysis.ts` + `views/stats/UnitByUnit.tsx`: pick an offense, then cards for Quarterback & passing game, Run game, Offensive line vs pass rush, Receivers vs coverage, Early & third downs, Red zone, Turnovers, Special teams. Each opens on a plain conclusion from the two published ranks ("Major edge to the Patriots pass defense: #3 in the league against a #19 passing offense"), then the rank duels and the basics, then what the publication does not measure (no OL grades, no man/zone coverage, red zone raw only, special teams adjusted only). Labelled Observation. The 7-pair rating board stays under it. |
| 24 | Prominent scheme tendencies | IMPLEMENTED | `insights/schemeBoard.ts` + `views/stats/Scheme.tsx`: offense (play action, motion, EPA vs the blitz, screens, RPOs, runs into 8+ boxes, PROE raw and adjusted, shotgun, no-huddle, aDOT, plays per drive) and defense (blitz rate, stacked boxes, opponents' PROE) with tendency words ("Highest in the NFL", "Top 5 (#4)", "League-typical (#16)"), samples, source tags and a neutral league strip with both teams. On the Matchups tab, the team page and the comparison. Coverage shells: not published for 2026 — said so. |
| 25 | Scheme-to-player intelligence | IMPLEMENTED | `insights/schemePlayers.ts`: stacked boxes → lead back, blitz rate → quarterback (team and QB splits vs the blitz, publication under-pressure profile), pass rate over expected → lead receiver. Each card is a chain MATCHUP/SCHEME (Observation, with sample) → PLAYER (publication projection, research simulation) → GAME SCRIPT (simulated volume by final margin, link to Scripts) → MARKET (priced prop, link to `#/nfl/props?game&player&stat` and the market). Bet status comes only from the opportunity layer: "Validated bet" only for ACTIONABLE, else "Research candidate" / "Judged: no bet" / "No bet flagged". |
| 26 | Improved team comparisons | IMPLEMENTED | `views/TeamCompare.tsx`; `/nfl/compare?a=<team>&b=<team>` (Compare detects a team id; player compare unchanged). Team-colour cards with logos, records and team pickers; basics duel; unit against unit (offense with offense, defense with defense) with rank bars and footing tags; "If they met" (unit by unit both ways + builder); scheme board. "Compare with" picker on every NFL team page. |
| 34 | Depth-chart presentation | IMPLEMENTED | `views/stats/DepthChart.tsx`: QB / RB / WR / TE groups, starters first (three receivers), depth slot, photo for starters, injury designation from the publication, this game's projection, season per game from the game logs (games before this one). Game Players tab (old list kept one tap down) and the team Players tab (next game's depth chart). Depth order is labelled as the captured Sleeper chart, not snaps. |
| 47 | Better statistical visualizations | IMPLEMENTED | `components/statviz.tsx`: DuelRow (rank vs rank, each bar under its own team in team colour), PercentileStrip (worst→best or lowest→highest, neutral wash for tendencies), DivergingBar (around league average, better side named), BasisTag, ModeToggle. Checked at 1440 and 390 px; tables fit 360 px. |
| 49 | Data correctness + box stacking | IMPLEMENTED | Audit: no NFL view labels a rate as per game (turnover/takeaway rates now say "% of plays" / "per play"; the per-game turnover count exists only in the basics, computed from counts ÷ games; test asserts it). Fixed "Points scored per game per game" chart titles (Team, Metric), "Points per game, last 40" subtitle on a point-margin chart, "League rank of 32" on a 30-team universe, "% of plays" on dropback/drive shares, "−0.0 pts" signs. CFB `turnovers_per_game` checked: genuinely per game (values 0.8–2.6, unit count). **Box stacking vs RB opportunity** (weeks 1–4): runs into 8+ boxes 2.9 yds/carry (288) vs 4.3 (2,809) lighter; a defense's stacked-box rate vs YPC allowed r ≈ 0.01 (32 teams), vs opponents' designed runs/game r ≈ −0.30; backs have a median of 6 stacked-box carries. Surfaced only as an observation with samples (player split shown only at ≥ 15 stacked carries); nothing adjusts a projection, no market claim. Documented in `docs/INSIGHTS.md`. |

## Test evidence

- `npm run lint`, `npm run typecheck`: clean.
- `npx vitest run`: all passing (68 files; 793 baseline + 15 new in `tests/laneC.stats.test.ts`: units/denominators,
  turnover rate never per game, basics sums and rank direction, missing-count handling, unit conclusions and
  fallback footing, scheme board, box/blitz links with samples and no bet words, depth chart grouping).
- Playwright (desktop + phone, `--grep-invert @visual`, port 4203): smoke, journey, a11y, closure, closure2, rebuild,
  football, context — 165 passed, 1 skipped, 2 failed: `journey.spec.ts:30` on both projects at the final clipboard
  read (`NotAllowedError: Read permission denied`). The spec grants clipboard permission to origin
  `http://localhost:4173` only, so it fails on any `SIFT_E2E_PORT` other than 4173 — environmental, not lane C
  (every lane-C step of that journey — Matchups `.mb__cell` ×28, team, metric "of 32", ranking — passed).
  NHL / CBB / degraded specs (desktop + phone): 100 passed.
- One full-suite vitest run under heavy parallel load had a timeout in `tests/scriptEngine.test.tsx` (CFB, not lane C);
  the file passes alone (18/18) and the previous full run was 808/808.

## Commits

See `git log sprint/lane-c` (history builder + data; main implementation; polish + report).

## Cross-lane edits

- `src/views/Game.tsx` (unowned): the NFL Matchups tab body replaced by `<MatchupTab>`; `MatchupBoard` and
  `MatchupTable` moved to `views/stats/MetricTable.tsx`; `SchemeTable` import removed (scheme now in MatchupTab);
  Players tab gains `<DepthChart>` with the old list in a disclosure; overview bento gains `<BasicsCard>` (one line).
- `src/history/types.ts` (unowned): optional box-score fields on `UnitCounts`, `BoxSplit`, `vs_box`.
- `scripts/history/build-nfl-history.mjs` + `public/data/nfl/history/**` (unowned data): additive fields; the committed
  copy was rebuilt from nflverse capped at week 4 (all 703 player files + teams/index change). Deploy rebuilds the
  full season.
- `src/lib/format.ts` (unowned): `unitLabel('share')` → "% share" (was "% of plays" for every share).
- `src/views/game/lines.tsx` `SchemeTable` (lane D file) is no longer used by the game page; left in place.

## For the integrator

- Conflict risk: `Game.tsx` (matchup and players tab blocks, imports), and any lane that regenerates
  `public/data/nfl/history` (take lane C's builder; re-run it).
- `e2e/journey.spec.ts` clipboard origin is hard-coded to port 4173.
- Visual baselines for `game-matchup` and `team` will change (re-render on CI).
- Not done: NHL / soccer / CBB matchup sections were not restyled (their own matchup panels already state
  units); the CFB Script Engine matchup tab keeps its own tables.
