# Lane A · Visual system & navigation — repair sprint report (2026-10-11)

Branch `sprint/lane-a` (worktree `/home/user/lanes/a`), from `66aad3f`. Screens checked in a real browser against the
live publications at 1440×900 and 390×844 (`docs/screenshots/2026-10-11/lane-a/`).

## Issues

### 1 · Improved hero presentations — IMPLEMENTED
- **Home featured hero** (`FeaturedHero`, `src/views/broadcast/parts.tsx`; styles `src/styles/lane-a-hero.css`):
  both clubs dominate (logo, city, name in Barlow Condensed capitals, a rule in each club's colour, a two-colour foot
  edge and side glows); one scoreboard strip with only published numbers — Sift projection (score, spread, total),
  Market (spread, total, to-win), Model win chance (bar in both club colours), Key matchup + most likely script.
  "SIFT MODEL · SHADOW-0.4.0" and the caveat paragraph are gone from the surface: one plain phrase
  ("Research model · behind the closing market", `src/lib/hero/copy.ts`) with the publication's verbatim caveat,
  model version and market basis behind info buttons; the weather-not-in-projection note is an info button too.
  Phone: photo on top (masked fade), the clubs face each other, two-column board.
- **Game hero** (`src/views/game/Hero.tsx`, outside `WeatherBlock`): a rule in each club's colour under its code and
  a two-colour foot edge; accents from `accentOnDark`. HeroStats (lane C) untouched.
- Tests: `tests/heroAccent.test.ts` (copy phrases, accents). No number changed; every figure is a published field.

### 9 · Team-colour-responsive design — IMPLEMENTED (heroes, game page, script cards); team page left to lane C
- `src/lib/hero/accent.ts`: authentic club colour as an accent on the dark surface — the primary when it reaches 3:1
  (WCAG 1.4.11 for graphical objects), else the primary lifted ≤ 30 % toward white (Cardinals stay red), else the
  secondary, else a lifted best colour. Text is never set on team colour. Test: all 32 NFL clubs reach 3:1.
- Used by the featured hero, the game hero (`--fx-home/--fx-away` now accessible, was "brighter of two") and the
  script-card branded frames. Team page (`views/Team.tsx`) is lane C's file; `accentOnDark` is ready for it.

### 11 · Relevant game imagery & 36 · imagery quality / branded graphics — IMPLEMENTED
- **Venue photos:** all 100 approved hero photos re-checked on contact sheets — all venue/game frames of the home
  team at its building; no change needed (documented in `docs/HEROES.md`).
- **Player photos (the integrator's DET @ ARI finding):** every file in `src/lib/player-images.json` was reviewed
  against the image. 30 of 55 were not game action in the current uniform (press conferences incl. Jeremiyah Love's
  "Great Clips" podium, post-draft/FA announcements, sportsbook interviews, training camp, charity softball, college
  and former-team uniforms). They are removed from the manifest and `public/players/nfl/`, and listed with reasons in
  `src/lib/player-image-blocklist.json`. Enforcement: `src/lib/players.ts` (runtime filter + non-game file-name
  rule), `scripts/players/fetch.mjs` (never re-downloads a blocked pin, deletes leftovers, never auto-re-picks a
  rejected player), `tests/playerImages.test.ts` (5 tests). 25 game-day photos remain.
- **Fallback:** script cards without an approved photo get a team-branded frame (both colours, livery bands, a
  legible logo — `src/styles/lane-a-brand.css`; one surgical line in lane C's `CastLayer`). Branded `HeroArt` now
  sets the home club's name large in outline and answers with the visitors' colour band and glow.

### 12 · Cleaner typography and hierarchy — IMPLEMENTED
- `tokens.css`: `--font-cond` and the type scale (`--fs-page`, `--fs-section`, `--fs-panel`, `--fs-eyebrow`,
  tracking). `src/styles/lane-a-type.css` (loaded last) applies one hierarchy everywhere: page titles, section
  titles, panel titles and eyebrows in Barlow Condensed capitals; reading text Barlow. `docs/DESIGN_SYSTEM.md` §2
  rewritten (it still said Barlow Condensed was unused).
- Two e2e checks read heading `innerText` (which reflects CSS capitals); they now compare the words
  (`allTextContents`, case-insensitive) — same assertion, not weakened.

### 15 · Reduced unnecessary copy — IMPLEMENTED for the shell and hero surfaces
- Featured hero: caveat paragraph, model version, market-basis sentence and weather note moved into info buttons.
- Footer: "Reads the published `edge_finder.app.v1` contract…" → "Projections and model prices are research, not bets."
- Limitations remain one tap away; nothing removed from the record.

### 27 · Correct scroll and navigation behaviour — IMPLEMENTED
- Root cause: react-router's `<ScrollRestoration/>` scrolled to the top on **every** navigation, including
  `setSearchParams({replace:true})` filter taps, `?script=` selections and `?tab=` switches; back-navigation restored
  before lazy screens/data loaded, so positions clamped short.
- `src/components/ScrollManager.tsx` replaces it (rules pure in `src/lib/scroll.ts`): new screen → top; same screen,
  new query → keep the reader's place; tab change → the section tabs sit just under the header; back/forward →
  restore as the page grows (ResizeObserver, 4 s cap, stops on wheel/touch/key); `#anchor` honoured;
  `navigate(to, { state: { scroll: 'top' | 'keep' } })` overrides. Positions persist in sessionStorage.
- Sticky header + sticky game/team tabs no longer cover anchors (`scroll-padding-top` on pages with `.gtabs`,
  `nav.tabs`, `.cbbg__toc`). Top bar is solid (bright text ghosted through it before).
- Tests: `tests/scroll.test.ts` (7); `e2e/game-scroll.spec.ts` +4 (tab switch keeps tabs in view; selection deep in
  the Scripts tab does not reset; new screen at top and back restores; scroll padding clears header+tabs). The tab
  and selection checks fail on the old `<ScrollRestoration/>` (verified).

### 20 · Home structure and continuity (shared with E) — PARTIAL (A's part done)
Featured hero and shell are visually continuous with the new type scale; Home composition is lane E's.

### Navigation for other lanes — IMPLEMENTED
- `src/lib/destinations.ts`: Explore → **Research Lab** (route `/explore` unchanged); new **Props** destination →
  `/props` (lane B adds the route; `/:sport/props` also lights Props). `PROPS_PATH`, `PHONE_TABS`, `short` labels.
- Desktop: six header tabs. Phone: five tabs (Home · Games · Props · Lab · Intel; accessible names are the full
  labels) and My Board as a header bookmark with its count (also in the Sports sheet).
- `src/state/trail.tsx`: `EXPLORE_STEP` label "Research Lab"; new `PROPS_STEP` (`/props`, "Props") for lane B.
- Tests updated: `tests/rebuild.test.ts`, `tests/seasonNavigator.test.ts`, `e2e/rebuild.spec.ts` (asserts six/five
  tabs, `#/props` href), `e2e/closure2.spec.ts` and `e2e/journey.spec.ts` (phone board count/link in the header).

## Test evidence
- `npm run lint` clean · `npm run typecheck` clean · `npx vitest run` **811/811** (70 files; baseline 793).
- Playwright, desktop + phone, non-visual, whole suite: 387 passed, 4 failed → the 2 specs that read heading
  `innerText` were updated and re-run green (closure2 + nhl: 72 passed). Targeted: game-scroll 10/10, rebuild,
  journey, smoke, context, hero all green. WebKit/iphone and @visual not run locally (baselines change: nav, hero,
  typography — re-render on CI).
- Note: a stale `test-results/` folder (Playwright traces) in the worktree slowed vitest enough to time out one CFB
  test; with the folder removed (or in a clean checkout) the full suite passes.

## Screenshots (`docs/screenshots/2026-10-11/lane-a/`)
before-home-hero_1440/_390 (hero before; nav already new) · after-home-hero_1440/_390 · after-game-hero-photo_1440 ·
after-game-hero-branded_1440/_390 · after-script-cards-branded-fallback_1440 · after-games-typography_1440.

## Cross-lane edits (surgical)
- `src/views/game/panels.tsx` (C): `CastLayer` frame gets `scard__frame--brand` + `--tc2` when there is no photo (1 line).
- `src/state/trail.tsx` (unowned): `EXPLORE_STEP` label, new `PROPS_STEP`.
- `src/lib/players.ts`, `scripts/players/fetch.mjs`, `src/lib/player-images.json` (unowned imagery pipeline).
- `src/main.tsx`: three CSS imports appended (`lane-a-brand.css`, `lane-a-hero.css`, `lane-a-type.css`).
- e2e specs owned by others: `closure2.spec.ts`, `journey.spec.ts` (phone My Board location; clipboard origin now
  follows `SIFT_E2E_PORT`), `nhl.spec.ts` (case-insensitive heading text), `rebuild.spec.ts`.

## For the integrator
- **Lane B:** link target is `/props`; use `PROPS_STEP` as the prop explorer's crumb parent. Until the route lands,
  the Props tab opens NotFound.
- **Lane E:** `ExploreView` still titles itself "Explore" and calls `useVisit('Explore', …)`; e2e accepts
  "Research Lab|Explore" for the heading — tighten once E renames. Lane E's `fidelity-home.css` `.fhero__*` rules no
  longer drive the featured hero (it uses `fh2__*` classes).
- **Lane F:** the featured hero reads `gameWeather()`; State Farm Stadium (retractable) still shows outdoor weather
  ("Patchy Blowing Dust") — F's roof fix will flow through.
- Seen, not mine: aria-labels like "New York Jets Jets" / "Los Angeles Rams Rams" on NFL sport-home tiles (E).
- Player-photo coverage dropped from 55 to 25 files; 30 players need a human-pinned game-day frame
  (`scripts/players/players.json` → `commons_file`), then the Player images workflow.
- Visual baselines must be re-rendered (navigation, heroes, typography).
