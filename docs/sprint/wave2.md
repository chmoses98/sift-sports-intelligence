# Wave 2 — units for every sport, plain availability states (repair sprint 2026-10-11)

Branch `sprint/wave2` (worktree `/home/user/lanes/w2`), based on merged `main` @ `0aec8bd`. Finishes the two
tracker items left PARTIAL after the six lanes (issues 6 and 43) and the NHL "New York R" leftover from issue 8.
Real-data screenshots (live publications of 2026-10-11, local production build): `docs/screenshots/2026-10-11/wave2/`.

## Per issue

### 6 — Clearly labelled units and denominators — IMPLEMENTED (was: NFL only)

`src/insights/sportUnits.ts` is the non-NFL counterpart of lane C's `insights/units.ts`:

* **Denominators come from the publications' own metric registries**, written in fan words, never converted:
  * NHL (`explorer/metrics.json`, 41 metrics): `xgf_pct` "of expected goals" (xGF ÷ (xGF + xGA)), `corsi_pct` "of shot
    attempts", `oa_xgf60_5v5` "xG / 60 at 5v5", `gf_per_game` "goals / game", `pp_pct` "of power plays scored on"
    (PP goals per opportunity), `pk_pct` "of shorthanded spells killed", `rating_finish` "× xG (finishing)",
    `toi_per_game` "min / game", skater G/A/P/SOG "totals in the window, not per game", `gaa` "goals against / 60 min".
  * Soccer (11): per-match goals/points, `clean_sheet_rate` / `btts_rate` / `over_2_5_rate` "of matches …" (the
    publication stores these as 0–100, so they print "45%", no longer "100" next to "0.0000"), Dixon–Coles ratings
    "log goals", Elo points.
  * CBB (25): "pts / 100 poss", "poss / 40 min", eFG / 2-pt / 3-pt "% … made", **turnovers "per 100 possessions"
    (the registry says `%` but describes per-100-possession turnovers; the description wins)**, free-throw rate
    "FTA per 100 FGA", roster minutes "of 200 min", returning share "of last season's minutes".
  * CFB Script Engine registry (26): "of plays successful", "of dropbacks" (sack rate), "of pass attempts" (INT
    rate), "yds / designed run", "pts / trip inside the 40", "sec / play", …
  * A metric Sift has no entry for uses the registry's `unit` as published (NBA "points/100 poss", tennis
    "Elo points"); a metric with no unit at all says **"unit not stated"** — never a guess.
* **Raw vs opponent-adjusted on the value itself** (`footingOf`): Adjusted when the publication says so
  (`category: opponent_adjusted`, observation `basis: OPPONENT_ADJUSTED`, CBB `extensions.cbb.adjusted`, Dixon–Coles
  "opponent-adjusted by construction"); "Model input" for NHL `rating_*` / model λ; "Roster" for CBB roster measures;
  otherwise "Raw · season 2026-27" / "Raw · last 10 games". MoneyPuck's score-and-venue-adjusted xG share is
  labelled raw, with "NOT adjusted for the opponent" in its tooltip. Tags reuse lane C's `svtag` look
  (`components/StatUnit.tsx`).
* **Rank universes come from the data** (`rankWords`): the NHL model-input ratings rank 6 slate teams and now read
  "#1 of 6 on the slate" — the old table header claimed "league rank of 32" for them; special teams "#11 of 32"
  is read from the observation, not hard-coded.

Where it shows:

| Screen | Before | After |
|---|---|---|
| NHL game · Matchup (`views/nhl/NhlGame.tsx`) | "#30 2.37", one header "league rank of 32" | metric + denominator line, Basis tag, "#30 of 32 · 2.37 · xG / 60 at 5v5 · raw 2.02" (raw value on the same games, from the publication's `raw_value`); raw table rows say their window; phone puts the tag under the name |
| NHL special teams / goalie card / player season table | "#16 of 32 · raw, season" (hard-coded 32); GAA, EV SV% bare; GP/G/A/P headers only | rank from data, "of chances scored", "killed", key sentence; GAA "goals against per 60 minutes"; abbreviations with titles and a unit key (totals vs per game) |
| Soccer / tennis / NBA matchup (`views/shared/kit.tsx` `RankRows`) | "1.0000", "100", "0.0000", short names "GF/G", values hidden on phones | value in its unit (percent scale respected), unit + footing under the full metric name, "#2/20" and "W-D-L 17-9-3" beside the value, header says when no league rank is published; values visible on phones |
| Soccer strength panel | "73th percentile" | "73rd percentile in the pool · ADJUSTED", raw form tagged RAW, unit sentence, mismatch with club names |
| CBB matchup cells, roster tape, team tiles | "107.8", "#15/20", "70" | "107.8 · pts / 100 poss · adjusted", "#15 of 20", "70 · of 200 min", tile notes carry the unit |
| CFB engine metric tables / metric evidence | "41.6% · adj · #74/138" | unit line under each metric ("of 1st & 2nd downs successful"), "adjusted · #74 of 138" or "raw · not adjusted"; edges panel states its unit (standard deviations across FBS) |
| Generic team metric rows (`views/Team.tsx` `MetricRow`) for NHL / soccer / CBB | value + window | footing tag + unit + window (NFL branch unchanged) |

### 43 — Meaningful data-availability states — IMPLEMENTED (was: shared components only)

Swept the sport screens for raw enum constants, bare "unknown" and empty-nothing:

* Soccer match: engine state pill ("Not run for this match" / "Not available" instead of "absent"), the reason as a
  sentence plus what happens next (kicked off → no pregame read will be added; otherwise it appears after the next run
  if the fixture joins the model board); lineups "not announced" / "not confirmed yet" instead of "lineups unknown";
  missing market document → `DataState` "No Kalshi markets for this match" with why and when (the old notice read
  "this match's markets is not published" and the section said "(0)"); rest note quality via `qualityLabel`
  ("incomplete", not "partial"); "1 meeting"; Dixon–Coles metric-kind constant in words.
* NHL: the findings rule printed "only OPPONENT_ADJUSTED, MODEL and AVAILABILITY findings…" → `plainCodes` →
  "Only opponent-adjusted, model and availability findings…"; governance reasons ("SUPERSEDED_BY_HIGHER_FIDELITY_
  EXPRESSION (KXNHLSPREAD-…|no)") → "replaced by a closer way to bet the same idea (NO on NY Rangers −2.5)"; missing
  opponent-adjusted block → `DataState` with why/when.
* CBB: event status tag in words ("In progress", "Postponed"); provenance shows the state words
  (`StateLine`/`IntegrityBadge`) instead of `PENDING_WINDOW` / `PENDING`.
* CFB: finding chips "away disruption advantage" → "Louisiana Tech disruption advantage" (`findingLabel`); empty
  "Contradicted by this script" list says so instead of "None.".
* Tennis / NBA / soccer homes: health pill from `healthLabel` ("Research only", "Degraded"), shared `Authority` pill
  from `authorityLabel`; tennis identity in words, empty player market list explained; MLB lineups "not announced".
* `ErrorState` for a document the publication does not publish: "<What>: not in this publication — … appears here after
  a publication run that includes it" (was "<what> is not published", ungrammatical for plurals).
* Technical names stay on Data & provenance; verbatim publication notes inside each game's "Publication notes &
  provenance" disclosure are left as published (only Kalshi short names are spelled out there).

### 8 (leftover) — Kalshi short names outside `betPhrase` — FIXED

`plainClubTitle` (lib/betWords.ts) now also runs in `describeNhlMarket` (every NHL market title), the generic
`describeMarket` title fallbacks, `candidateTitle`, NHL script "helps"/conflict text, the featured-row labels in
`views/nhl/parts.tsx`, MarketBoard ladder headers ("Team total — NY Rangers over X goals scored") and NHL notes.
Live check on VAN @ NYR: no "New York R" left in the rendered Story / Scripts / Markets / Matchup / Players tabs.

## Tests

* `npm run lint` clean · `npm run typecheck` clean.
* `npx vitest run`: **82 files, 950 tests, all passing** (937 before this wave + 13 new in
  `tests/wave2.units.test.tsx`: NHL/soccer/CBB/CFB units, footing incl. MoneyPuck venue adjustment and model inputs,
  slate-only rank universe, "unit not stated", RankRows output with percent-scale values and footing tags, empty
  RankRows state, `plainCodes`, NHL "New York R" titles, governance reasons, CFB finding labels).
* Updated to the new correct behaviour: `tests/cfbSidecar.test.tsx` (rank text "#n of N"), `tests/soccer.test.tsx`
  (engine reason now written as a sentence, case-insensitive match).
* Playwright (desktop + phone, `--grep-invert @visual`, `SIFT_E2E_PORT=4207`, specs nhl, soccer, cbb, cfb, tennis, nba,
  mlb, smoke, a11y, degraded): **254 passed, 0 failed** (7.3 min), on the final code.

## Screenshots (`docs/screenshots/2026-10-11/wave2/`)

Before = merged main `0aec8bd`, after = this branch; same live publications (2026-10-11).

* `before-/after-nhl-matchup-units_1440.jpg` — VAN @ NYR Matchup tab: special teams and the opponent-adjusted table.
* `after-nhl-matchup-units_390.jpg` — the same table on a phone (footing tag under the name).
* `after-nhl-raw-metrics-windows_1440.jpg` — raw table: Raw · season / Raw · last 10 games / Model input,
  "#1 of 6 on the slate".
* `after-nhl-scripts-ny-rangers_1440.jpg` — survivor board reads "NY Rangers", not "New York R".
* `before-/after-soccer-empty-states_1440.jpg` — Lille v Le Havre: engine state, lineups, matchup units, missing
  markets explained.
* `after-soccer-matchup-units_1440.jpg` — Palmeiras v Corinthians strength panel and ranked rows.
* `before-/after-cbb-roster-units_1440.jpg`, `after-cbb-roster-units_390.jpg` — Notre Dame vs Villanova roster tape.
* `before-/after-cfb-matchup-units_1440.jpg` — Louisiana Tech @ UL Monroe findings and metric tables.

## Commits

* `31b631f` Units, denominators and plain availability states for NHL, soccer, CBB, CFB (issues 6, 43)
* (this commit) phone layout fix for the NHL units table, screenshots, this report

## Cross-file notes for the integrator

* Touched shared files: `components/ui.tsx` (ErrorState not-published wording), `components/MarketBoard.tsx` (ladder
  header), `lib/marketLabel.ts`, `lib/nhl.ts`, `lib/scriptEngine.ts` (`findingLabel`), `lib/plainLabels.ts`
  (`plainCodes`), `views/Team.tsx` (`MetricRow` non-NFL branch), `views/shared/kit.tsx` (`RankRows`, `Authority`).
* The tracker (`docs/REPAIR_SPRINT_2026-10-11.md`) was not edited: rows 6 and 43 can move to IMPLEMENTED, NOT
  DEPLOYED, and row 8's "New York R" limitation is resolved.
* Visual baselines for NHL / soccer / CBB / CFB game pages will change (re-render on CI).

## Remaining limitations

* NBA and tennis matchup rows use the registry unit as published (no hand-written denominators); tennis serve/return
  values keep their decimals.
* The NHL raw per-60 metrics are "per 60 minutes of the situation's ice time" in the registry but the observations do
  not state the situation; Sift says "xG / 60 min" and does not claim 5v5 or all-situations.
* CBB opponent-adjusted matchup rows only exist once a projection is archived (season starts Nov 2026); verified with
  the e2e season fixture and unit tests, not live data.
* `views/Metric.tsx` / `Ranking.tsx` still format non-NFL values with the generic formatter (unit chip from the
  registry); not part of the matchup/stat sections in scope.
