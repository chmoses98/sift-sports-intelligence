# Lane F — Data integrity and application quality (2026-10-11)

Branch `sprint/lane-f`. Issues 3, 18, 33, 35, 43.

## Root cause of the reported defect (Lions at Cardinals, State Farm Stadium)

The live NFL publication (week 5, run of 2026-10-11 00:48Z) publishes `context.venue.roof = ""` and
`context.weather.roof = ""` for **State Farm Stadium** (and Mercedes-Benz Stadium). nflverse leaves `roof` blank for
retractable-roof stadiums until a game is played (it becomes `open`/`closed` afterwards; 2022–2026 rows for
`PHO00` are 31 × closed, 5 × open, then blank for upcoming games). Sift's old `gameWeather()` returned the
"retractable" state **only when no forecast existed**; with a forecast present it fell through to the outdoor path,
so the hero printed "85° Patchy Blowing Dust · wind 25 mph SSW · 39% precipitation" for a roofed stadium.

A second defect surfaced in the same data: **Eagles at Jaguars, Tottenham Hotspur Stadium (London)** carried a
76° "Chance Showers And Thunderstorms" forecast whose kickoff hour is in UTC−04:00 — the Jacksonville forecast.

### Upstream defects (documented, not changed; repos inspected read-only)

1. **nfl-edge-finder `nfl_edge/handicap/packet.py` `weather_state()` (≈ lines 655–702).** Only
   `roof in ("dome", "closed", "indoors")` short-circuits; a blank roof (`""`) at a retractable stadium is treated
   as outdoors, the NWS forecast is attached and `material` is computed (`material: true` for ARI: wind 25 mph),
   which also raises a weather question for the handicapper. `config/stadiums.json` has coordinates but no roof
   construction. Fix: add `roof_type` to `config/stadiums.json` and treat blank roof at a retractable venue as
   "status not announced" (not material).
2. **nfl-edge-finder `scripts/data/context_capture.py` (weather loop, ≈ lines 106–113).** Coordinates come from
   `stadiums.get(g["home_team"])`; the skip happens only when `location == "Neutral"` and the stadium differs.
   nflverse lists `2026_05_PHI_JAX` at "Tottenham Hotspur Stadium" with `location = "Home"` (stadium_id JAX00), so
   NWS was queried at EverBank Stadium and the Jacksonville forecast is published as the London kickoff forecast.
   Fix: skip (or use the venue's coordinates via Open-Meteo) whenever `st["stadium"] != g["stadium"]`; NWS does not
   cover sites outside the US. Same export marks the game `neutral_site: false`.
3. **nflverse schedules** list Melbourne Cricket Ground, FC Bayern Munich Stadium (Allianz Arena) and Stade de France
   as `dome` (they are open-air) and call NRG Stadium "Reliant Stadium" in 2026 rows.
4. **cfb-edge-finder** captures ESPN `venue.indoor` and weather in `src/cfb_edge_finder/execution/context_sources.py`
   `environment_field()`, but the app export (`scripts/app_export.py`, event `context`) publishes
   `context.venue = null` and `context.weather = null` for all 301 events, so CFB pages have no roof/forecast from
   the publication (Sift falls back to its venue table for roof type).

## Issue status

### 3 — Correct indoor/outdoor weather handling — IMPLEMENTED
* `src/lib/venue.ts` `venueWeather()` — one decision for every screen:
  dome → "Indoors · dome" (arenas: "Indoor arena"), no weather; retractable + published `closed` → "Roof closed";
  retractable + published `open` → forecast with "Roof open · context only · not in the projection";
  retractable + unknown → "Retractable roof · roof status not announced", outside forecast only as context
  (`outside`), never flagged (no "Wind 25 mph" alert, no News item); open-air → forecast, "Context only · not in
  the projection". A forecast whose kickoff-hour UTC offset differs from the venue's IANA zone is **withheld** with a
  reason (London game). A published roof that contradicts construction (MCG "dome") keeps the construction and
  carries `conflict` ("Roof record disputed" in the tile, explained on Data & provenance).
* `src/views/game/Hero.tsx`: only the weather block changed — `gameWeather`, `weatherLine`, `WeatherBlock` delegate
  to `lib/venue.ts` (GameWeather type re-exported). Because the Home featured hero (`broadcast/parts.tsx`
  FeaturedHero), Dashboard, HeroStats, home cards, News and Intelligence all call `gameWeather`/`weatherLine`, they
  are fixed **without editing their files**; `parts.tsx` needed no edit.
* Soccer: `soccerWeatherLine()` (roof-aware, "(context only)") used in `views/soccer/SoccerMatch.tsx`.
* MLB/CFB: no weather is published; retractable/dome parks and indoor CFB venues still say so from the table.
* Real data after: Home featured hero reads "State Farm Stadium · Retractable roof · roof status not announced ·
  85° outside"; game hero ROOF tile "Retractable roof"; London game shows no Jacksonville forecast.

### 18 — Accurate roof and venue information — IMPLEMENTED
* `src/lib/venueFacts.ts`: all 2026 NFL stadiums (roof, surface, city, country, IANA zone, tenants), 12
  international/neutral NFL sites, college indoor venues (Alamodome, JMA Wireless Dome, Kibbie Dome, Holt Arena,
  UNI-Dome, Walkup Skydome; NFL domes/retractables cover the bowl/title sites), all 30 MLB parks + international MLB
  sites; nflverse spellings and former names as aliases; provenance note in the file header.
* Precedence: publication per-game roof status (open/closed) → venue table construction → hero registry roof;
  disagreements flagged.
* Data & provenance (Status) has a new **Venues, roofs and kickoff weather** section (filter NFL / College indoor /
  MLB / International; responsive on phones) and lists the publication issues Sift corrects for.
* `tests/venue.test.ts` (21 tests): coverage of 32 NFL + 30 MLB clubs, agreement with the hero registry on every
  shared venue (0 disagreements), valid IANA zones, aliases, roof precedence & conflicts, the State Farm row, roof
  closed/open, domes with a forecast row, open-air flags, London withheld, Arizona no-DST check, MCG "dome" conflict,
  neutral site resolving the published venue (Wembley), CFB, MLB (American Family Field, Tokyo Dome), NHL arena,
  failed capture reason, soccer line.

### 33 — Injury-source freshness and provenance — IMPLEMENTED (existing injury experience preserved)
* `src/lib/injurySource.ts`: provider in words ("ESPN injury report"), publication qualifiers as sentences ("The
  official league injury report is not captured…", "Players are matched … by name"), newest capture time, age
  (fresh ≤ 6 h, aging ≤ 24 h, stale after — injury lists only; market freshness gates untouched), official
  designation words + meanings, per-sport timing sentence.
* `src/components/InjurySource.tsx` (`InjurySource`, `DesignationKey`) on: NFL game Injuries tab (`views/Game.tsx`,
  replacing the hard-coded "ESPN via the publication" line), NBA game (`views/nba/NbaGame.tsx`, replacing the raw
  `espn_injuries (official NBA report not captured)` sub-line), NHL game (`views/nhl/NhlGame.tsx`), News
  (`views/News.tsx`). Empty lists use `DataState` with a plain explanation. Raw availability rows show the source
  name and a readable time.
* Status gains an **Injury reports** section (source per sport, what to know, the age rule).

### 35 — Remove developer-facing repository jargon — IMPLEMENTED in lane-F/unowned files; PROPOSED for owned files
* `src/lib/plainLabels.ts` — `qualityLabel`, `healthLabel`, `authorityLabel`, `modelVersionLabel`,
  `modelVersionShort`, `capabilityLabel`, `availabilitySentence`, `humanize` for every lane.
* Model version: `views/broadcast/numbers.ts` now returns `modelVersionShort()` ("v0.4.0 (trial)" instead of
  "shadow-0.4.0"), so the featured hero eyebrow no longer prints "SIFT MODEL · SHADOW-0.4.0", nor the hero strip /
  Intelligence notes. NFL game model line uses it too.
* Plain wording: source banner (saved copy / why live research is missing / health & authority words),
  research-unavailable notice, source reasons (`data/source.ts`), sport overview, Status lede (technical names moved
  to one "Technical detail" line), capability counts in words, router health message, Game page notes ("the
  repository's handicap packet", raw script authority constant and `.scripts.json.gz` file name), soccer/tennis
  `RESEARCH_ONLY`, NBA "repository", MLB "capability manifest".
* Cross-lane strings (not edited — apply at integration):

| File:line | Current | Proposed |
|---|---|---|
| `src/components/Shell.tsx:345` (A) | `Reads the published <code>edge_finder.app.v1</code> contract. Projections and model prices are research evidence, not bets.` | `Projections and model prices are research evidence, not bets.` (format name already on Data & provenance) |
| `src/views/Player.tsx:525` (B) | `authority RESEARCH_ONLY` | `{authorityLabel('RESEARCH_ONLY')}` → "Research only" |
| `src/views/Market.tsx:169` (D) | `sub={mp.model_version ?? undefined}` | `sub={modelVersionLabel(mp.model_version) ?? undefined}` |
| `src/views/HistoricalGame.tsx:137` (E) | `'nflverse schedule (schedule_cache.csv)'` | `'the nflverse game schedule'` |
| `src/views/explore/ExploreView.tsx:65` (E) | `off: 'Needs research explorer'` | `off: 'Needs this sport’s research files'` |
| `src/views/explore/SeasonView.tsx:191` (E) | `The NFL explorer is not available` / `…needs the publication’s event index.` | `NFL research is not available right now` / `The season view needs the publication’s list of games, which could not be read.` |
| `src/views/intel/PulseView.tsx:249` (E) | `Source: <code>{cur.source}</code>{… model ${cur.modelVersion}}` (prints `met_nhl.calibration_v1 · extensions`) | Plain source name (e.g. "the NHL publication's calibration report") and `modelVersionLabel(cur.modelVersion)`; keep the raw id in a `title` |
| `src/views/intel/PulseView.tsx:46` (E) | `'Unavailable'` | `'Could not be read'` |
| `src/views/Team.tsx:341` (C) | `'status n/a'` | `'status not listed'` |

### 43 — Meaningful data-availability states — IMPLEMENTED (shared components) / PARTIAL (other lanes' screens)
* `QualityBadge` (`components/ui.tsx`) shows Verified / Incomplete / Research grade / Not published / Not stated,
  with the meaning on hover and in the provenance popover; the code stays as `data-quality`. Every screen using it
  (≈ 50 call sites) loses bare "PARTIAL"/"UNAVAILABLE".
* `HealthPill` (`components/SourceBanner.tsx`): Healthy / Research only / Degraded / Out of date / Not available,
  meaning on hover; "health not readable" → "Health unknown" with an explanation.
* `CapabilityTable` (SportOverview, Status): capability names in words plus one sentence on what the status means
  for the screens, then the publication's own note.
* `components/DataState.tsx`: what is missing, why, when it may arrive (+ optional link to Data & provenance).
* `LiveDiagnostics`: one plain sentence above the technical table (where prices come from, last refresh, last
  problem).
* Weather states say why: "No forecast in this publication", "No forecast captured yet (…)", "Forecast withheld".
* Proposals for lane C (HeroStats/Dashboard) to surface the new fields: `HeroStats.weatherItem` — for
  `wx.kind === 'none' && wx.withheld` show `{label: 'Kickoff weather', value: 'Withheld', sub: 'Published forecast is
  for another place'}`; use `wx.note` as the sub-line (it already says "Roof status not announced · outside forecast
  for context"). `Dashboard.tsx:308` — label 'Roof' only for indoor/retractable, and add `wx.outside` as the sub for
  retractable. `views/home/cards.tsx:85` (unowned) shows nothing for retractable; could append `weatherLine(wx)`.

## Tests
* `npm run lint` clean, `npm run typecheck` clean (final commit).
* `npx vitest run`: 824 tests, 823 pass in the full parallel run; the one failure,
  `tests/scriptEngine.test.tsx › CFB game page › a game without a read keeps its markets and says why`, is a
  load-dependent 4-second `findByText` timeout that **also fails at the sprint baseline 66aad3f** in this environment
  (verified in a scratch worktree: 792/793, same test) and passes when its file is run alone (18/18). Added tests:
  `tests/venue.test.ts` 21, `tests/dataIntegrity.test.tsx` 10.
* Playwright, desktop + phone, `--grep-invert @visual`, SIFT_E2E_PORT=4206, specs smoke, football, nfl-home,
  degraded, hero, nba, nhl, soccer, tennis, mlb, context, a11y: **231 passed, 1 skipped, 0 failed** (13.2 min).

## Screenshots (real live data, `docs/screenshots/2026-10-11/lane-f/`)
`home-featured-retractable-roof_1440/_390`, `game-hero-state-farm-retractable_1440`,
`game-hero-london-forecast-withheld_1440`, `injuries-provenance_1440/_390`, `status-venues-roofs_1440/_390`,
`status-injury-sources_1440`. Before: the featured hero read "State Farm Stadium · 85° Patchy Blowing Dust · wind
25 mph SSW · 39% precipitation · weather shown for context" and "SIFT MODEL · SHADOW-0.4.0".

## Remaining limitations
* Whether a retractable roof is open is unknown until a publication says so; Sift never guesses.
* Venue surfaces for international sites and the new Highmark Stadium are "Not confirmed".
* The upstream NFL capture still emits wrong forecasts for international "home" games; Sift withholds them only when
  the time zone differs (a same-zone wrong location would not be caught).
* Injury age thresholds are a display rule chosen here (6 h / 24 h); owner may tune.
