# SIFT 3.0 implementation status

Branch `claude/sift3-impl`, stacked on `claude/sift3-build` (PR #147, draft). Everything is behind the single `#/v3` opt-in. Order (approved 2026-10-26): 0 Foundations, 1 Data layer, 2 Stat Detail and League Rankings, 3 Player Research, 4 Team Research, 5 Game Detail and Matchup, 6 Prop Discovery, 7 Saved research and shell, 8 Hardening. Quote engineering runs on its own branch (`claude/quote-track`, see `docs/quote-track/README.md` there).

## Milestone 0: Foundations (done)

**Contracts now in code**

| Contract | Where | What it guarantees |
| --- | --- | --- |
| Versioned URL state | `src/v3/state/url.ts`, `src/v3/nav/schemas.ts` | One schema per screen (player, team, stat, game, props). Decoding never throws and falls back per field; encoding omits defaults and is deterministic; `v=1` is written whenever a field is. Parameters without `v` are version 0 and migrate forward (`?tab=rankings&team=DAL` becomes `ranking`, `sel=DAL`). Unknown and shell parameters pass through. |
| In-place changes never add history | `useRouteState`, `useQueryPatch` | Tab, window, line, filter, sort and typed text replace the entry; Back therefore leaves the screen, and the entry below keeps its own state. Several updates in one handler compose. |
| Sheets are history entries | `src/v3/ui/Sheet.tsx`, `nav/sheetBridge.ts` | Opening pushes one entry; Back, the X, the backdrop and Escape all close it and leave no ghost entry. Links inside a sheet replace the sheet entry with the destination, so Back lands on the screen underneath with every sheet closed. A state change made inside a sheet is applied to the screen underneath after the sheet closes. Addressed sheets (`?sheet=contract&tk=...`) are deep-linkable and registered with `registerSheet`. |
| Scroll memory | `src/v3/state/scroll.ts` | Per history entry; committed on arrival before anything scrolls; in-place changes never move the page; a new screen starts at the top; reload falls back to the address; shell parameters are not part of the page key. |
| One route builder, one set of targets | `src/v3/nav/routes.ts`, `nav/Targets.tsx` | `TeamLink`, `PlayerLink`, `StatLink`, `GameLink`, `PropsLink`, `PriceTap`, `NavRow` (stretched row link with independent raised targets, never an anchor inside an anchor). Every target carries `data-tap` and `data-dest`; hit areas are at least 44 points without changing layout. |
| Saved research | `src/v3/model/saved.ts`, `state/prefs.ts` | The existing record (route with query, title, subtitle, snapshot) is kept and extended with `v`, `kind`, `sport`, `chips`, `sv`. Every stored record is validated and migrated on read (`reviveSaved`); unopenable records are dropped, routes are canonicalised, duplicates collapse, ids stay unique. First-build records open unchanged. |
| Sport capabilities | `src/v3/model/capabilities.ts` | Per sport, per section: `ready`, `gated` (published but not shown, with the reason) or `none`. NFL full; NHL Overview and Form for team research; MLB team research gated (late-August cache); no sport is hard-coded into a screen. |
| Ink and graphite tokens | `src/v3/v3.css` and the screen stylesheets | The locked palette applies app-wide (shell, Home, Games as well as research screens) so there is one visual system. Cyan, semantic colours and team colours unchanged. |
| Shared atoms | `src/v3/ui/atoms.tsx`, `atoms.css` | Lane marks and the three-lane readout (Market square, History ring, SIFT model diamond, never blended), ladder track, percentile track, tabs, segmented control, chips, locked row. Chart-specific atoms (hit bars, league dot plot, margin bars) arrive with their screens. |
| Tap matrix | `tests/v3/tapmatrix.ts` | The walkthrough's 78 targets as data, each assigned to its milestone. A milestone is complete only when its rows pass against the real components. |

**Tests (all run in this environment)**

- `tsc -b` and `eslint .` clean. Full `vitest run`: 147 files passed, 3 skipped; 1694 tests passed, 3 skipped (baseline before this work: 1653).
- New unit and integration tests in `tests/v3`: URL state (13), saved research (10), routes and capabilities (6), tap matrix integrity (2), history and sheet behaviour against a real router (11).
- Playwright, Chromium phone (390x844), dev server: `e2e/v3.spec.ts` 18/18 and `e2e/v3-foundations.spec.ts` 6/6 (scroll through Back, in-place state keeps scroll and adds no history, sheet closes on Back, apply-from-sheet lands underneath, saved record shape).
- WebKit engine (WebKitGTK, real WebKit, not iOS Safari): `scripts/v3-qa/journeys.py` 48 interaction checks. Playwright's own WebKit build cannot be downloaded in this sandbox (policy blocks the host), so `playwright.v3.config.ts` includes the iPhone projects only where the browser is installed (and always in CI).
- Not yet done: on-device iPhone Safari; pixel baselines (arrive with each locked screen).

**Honest notes**

- The existing screens still use their pre-lock layouts and tab names; they are rebuilt to the locked designs in milestones 2 to 6. Until a screen is rebuilt, its URL still decodes through the migrations.
- Legacy-vocabulary links keep working. Saved routes are rewritten to the current vocabulary on read.

## Milestone 1: Data layer (done, in `src/v3/data/research/`)

Typed, tested normalizers over the real published documents, and lazy cached hooks. Screens read these; none reads a contract document directly.

| Piece | What it gives |
| --- | --- |
| `normalizeTeamProfile` / `useTeamProfile` | One team document answers the whole statistic list: every metric and window with the published rank, universe size (28 NFL teams in the current packet, not 32), percentile, ranking id and higher-is-better flag. Games with results from the team side, availability, players, series refs. |
| `teamRecord` | NFL: counted from completed regular-season results of the current season. NHL: wins, regulation losses and overtime losses separately; the publication's own stated record is used when it carries one (`7-4-2` for 2026-27 today), else derived from the official points percentage, else none (never an unreconcilable guess). |
| `buildRankingCatalog` / `useRankingCatalog` | (metric, window) to ranking id, read from the profiles' own ranking lists (authoritative), not from label matching. |
| `normalizeRanking` / `useRankingDoc` | A ranking fetched only when a statistic is opened, with its universe, summary, limitations and adjusted flag. |
| `scheduleOf` / `useSchedule` / `nextGame` | The schedule authority: explorer start times; Kalshi event times are never used as a start. |
| `deriveRelated` (temporary) | Related statistics from stable ids, validated against the sport's registry, raw and adjusted typed apart, never crossing sport or entity type. Replaced by backend backlog item 1. |

Not in this milestone, by design: the cross-game prop index (Prop Discovery, milestone 6, where its consumer is), and quote usability wiring (waits on the separately reviewed quote branch; screens use one seam, `src/v3/data/quoteGate.ts`, so swapping in `quoteUsable` is a one-file change).

Real-document test tooling: `e2e/support/realFeeds.ts` answers feed requests from a disk cache of real published documents (`V3_REAL_FEEDS=live` fills it with curl through the environment proxy); `scripts/v3-qa/shot.mjs` takes phone screenshots (`REAL=1` for real data). Fixtures in `tests/v3/fixtures` are trimmed real documents captured 2026-10-26.

## Milestone 2: Stat Detail and League Rankings (SD1 to SD7)

Branch `claude/sift3-m2-stat`. `/v3/stat/:slug/:statId?win=&sel=&opp=&tab=...` with the metric's SHORT id; the first build's ranking id (`rnk_...`) resolves through the catalog and the address is rewritten with a REPLACE; `sample-N` renders the labelled sample view model (`?demo=1`).

| Piece | Where |
| --- | --- |
| Screen and tabs (Ranking, Trend, Compare, About, side by side) | `src/v3/screens/Stat.tsx`, `src/v3/screens/stat/*`, `src/v3/screens/stat.css` |
| Pure view models (resolve, windows, visible rows, bars, compare blocks, limits) | `src/v3/model/statDetail.ts`, `src/v3/model/statDecl.ts` (per-sport declarations: NFL, NHL; MLB gated) |
| Hooks over the research data layer (catalog, series, next opponent) | `src/v3/data/useStatDetail.ts` |
| Chart atoms | `src/v3/ui/charts/` (dot plot, observation bars, rank and gap tracks, player bars) |
| Tests | `tests/v3/stat-detail.test.ts`, `e2e/v3-stat.spec.ts` (real documents), `scripts/v3-qa/stat_wk.py` (WebKit) |
| Visual comparison against `out/sd*.png` | `docs/sift3/qa/impl/stat/` |

Notes: the screen carries no SIFT model lane and no price (statistics are team values and ranks), so the approval ledger has nothing to gate here. Historical ranks and player-level league ranks are not published (backend backlog item 2): the screen shows "rank —" and a locked row naming the reason. Related statistics are still derived in the client (backlog item 1) and are labelled so. `V3Root` now passes `aria-current` through a plain `Link` so the Explore tab is lit on detail screens (react-router's NavLink overwrote it).
