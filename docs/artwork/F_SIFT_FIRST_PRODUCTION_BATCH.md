# F. SIFT First Production Batch

Status: **proposal for owner approval, 2026-10-18.** Nothing in this batch has been produced. Conventions: [V] verified in the repository, [R] recommendation, [U] unverified.

**Size: 24 assets**, produced in **two gates** so the style is approved on one sport before it is scaled. Gate 1 is 7 assets. Gate 2 is the remaining 17 and must not start until the owner approves Gate 1 in writing.

Why this set: it is the smallest collection that (a) removes the empty-void fallback from every hero in all eight sports, (b) replaces the hard-coded one-team mastheads on cross-sport pages, (c) gives the Prop Explorer and Matchup Drivers a visual vocabulary without any person, and (d) fixes the missing brand surfaces. It does **not** include photographs, players, logos or crests (section 3).

**Common to every asset** (not repeated below): no people, faces, hands, text, numbers, logos or league marks (D §7 AU5/AU6/AU8); free local production only (C §2); Apache-2.0/MIT model or no model (C §2.2); sidecar metadata and a human approval record (D §4, §10); budgets from D §6; decorative `aria-hidden`; no change to any layout, hero height or text position.

**Common integration** (done **after** approval, small and additive, authorised by decision D12): a plate layer inside `src/components/sift2/VenueArt.tsx:9-28` between the branded layer and the photo, a pure registry resolver in `src/lib/art/`, a registry test, an `/art/` cache rule in `vite.config.ts`. The resolver never overrides `resolveHero`.

---

## 1. Gate 1: prove the look on NFL (assets 1-7)

All seven are reviewed together on the **real heroes**: BUF/NE (no photo), KC (photo), at 1352 × 454 and 390 × 250, with real text, against the existing baselines `e2e/__screenshots__/desktop/sift2-game.png` and `phone/sift2-game.png`.

### 1. `env.nfl.night-turf.signature.v1` (stage plate)
* **Destination:** the branded-fallback slot of the hero in `src/components/sift2/BroadcastHero.tsx:37` (`VenueArt`) for Home featured (`Sift2HomePreview.tsx:63`), Games feature (`Sift2Games.tsx:24-37`) and NFL/CFB Command Center (`views/game/Hero.tsx:176-183`).
* **Type:** raster plate, forms `d` (1920/1200), `m` (780/540), `c` (720); neutral cool, no team colour.
* **Concept:** empty night turf in low-camera perspective, yard and hash lines receding, cold blue-white floodlight cones from both upper corners, haze at the horizon, turf grain. **No seating bowl, no scoreboard, no end-zone text, no goalpost detail that could imply a venue.** Team colour arrives from `--hc1/--ac1` at runtime.
* **Desktop:** 3 : 1 master; energy zones left 0-28 % and right 72-100 %; dark text channel centre 36 % × lower 60 %; must survive 2.7 : 1 (454 px) and 2.5 : 1 (502 px).
* **Mobile:** separate 4 : 5 master; light and cones in the top 45 %; lower 55 % dark for the matchup block; top 44 px and bottom 56 px clear; must survive 1.56 : 1 (250 px), 1.93 : 1 (202 px Props tab) and 0.9 : 1 (405 px Games).
* **Method:** (a) Blender: a surface plane + area lights + volumetric haze, scripted and headless; or (b) FLUX.1 schnell locally from template `templates/prompts/env.nfl.md` with the mandatory negatives (B §10); finish in GIMP; assemble the wide and tall masters separately. Procedural floor already proven (A §8).
* **Acceptance:** CO1 text-channel mean luminance ≤ 0.06 ◇ / p95 ≤ 0.12 ◇; AU5 faces = 0 and OCR hits = 0; CO2 all five crops keep the energy zone; CO3 margins clear; sizes d1920 ≤ 150 KB, d1200 ≤ 90 KB, m780 ≤ 100 KB, c720 ≤ 40 KB; IN1 contrast ≥ 4.5 : 1 / 3 : 1 on the rendered BUF–NE hero; IN6 fallback verified; owner approves the look on the real component.

### 2-6. Effects kit (five small assets, shared by every sport)
All **SVG or CSS, ≤ 20 KB each**, original work, hand-written in Inkscape and code; used by `.s2-venue-art` (`sift2-assets.css`); colours resolved from `--hc1/--hc2/--ac1/--ac2`.

| # | ID | Concept | Destination | Desktop / mobile |
|---:|---|---|---|---|
| 2 | `fx.all.floodlight-cones.cold.v1` | Soft diagonal cone beams from the upper corners, screen-blended | layer 4 of the hero stack | desktop 2 beams per side; phone 1 per side, shorter |
| 3 | `fx.all.haze-floor.v1` | Low-lying horizon haze band | layer 4 | scales with `aspect-ratio`; phone band is taller as a fraction of height |
| 4 | `fx.all.grain.v1` | Tileable film grain (SVG turbulence or ≤ 6 KB tile) at 8-16 % overlay | layer 4 | same file; opacity lower on phone |
| 5 | `fx.all.bokeh-edge.v1` | Sparse distant light points near the top corners | layer 4 | 6 points desktop, 3 phone, never in the text channel |
| 6 | `fx.all.rim-sweep.v1` | Team-colour diagonal rim light along each outer edge; the "ESPN split" | layer 2/4 | outer 20 % only; phone sweep is vertical along the sides |

* **Method:** hand SVG/CSS, validated in Chromium (the PoC `docs/artwork/img/poc-light-field.html` is the starting point).
* **Acceptance (all five):** each ≤ 20 KB; no animation unless it stops under `prefers-reduced-motion`; no layout shift; CO4 centre darker than edges after composition; IN1 passes over the rendered text; looks correct with an unknown team (default `#1d2d52/#3f5079`) and with high-chroma pairs (e.g. gold/black) without clipping to white.

### 7. `obj.football.hero-3q.v1` (sport object, with alpha)
* **Destination (after approval, Phase 3 wiring):** Key Matchup Drivers card art for run-game / pass units (`src/components/sift2/CommandOverview.tsx:48`, 85 px tall / 80 px phone), featured-player *fallback* (`src/components/sift2/CommandOverview.tsx:54-58`, 126 px cards), Prop Explorer NFL sport card (`props/PropsHub.tsx:70`), Home top-props fallback (`home/HomeTopProps.tsx:220`).
* **Type:** transparent PNG/WebP, forms `o` 800 and 400 px; three-quarter angle, rim-lit.
* **Concept:** an **unbranded** football (generic laces, no logo, no league mark) lit by the cold key and a neutral rim; team colour is added by CSS behind it, not baked in.
* **Desktop / mobile:** one asset; sized by the slot (the 85 px driver slot and the 126 px card slot both read at 400 px).
* **Method:** Blender (GPL, Metal on Apple Silicon [V]), scripted headless, native alpha; no background removal and no AI.
* **Acceptance:** alpha edge clean at 400 px (no halo against `#07111f` and against a bright team colour); ≤ 60 KB at 800 px; AU6 no mark; geometry plausible by human review (VQ7); reproducible from the committed script.

**Gate 1 exit:** owner approves the look. If not, iterate Gate 1 only.

---

## 2. Gate 2: every sport, every hub (assets 8-24)

### Stage plates for the other seven sport slots (assets 8-15)
Each: forms `d`/`m`/`c`, same measurements and acceptance as asset 1; wired into the hero of that sport's game page and the sport's masthead. All are **non-venue stages**.

| # | ID | Concept | Destination (exact) | Sport-specific acceptance |
|---:|---|---|---|---|
| 8 | `env.cfb.saturday-dusk.v1` | Turf grammar of asset 1 with a warmer dusk-to-night gradient, heavier haze, crowd bokeh at the edges | CFB hero: `Game.tsx:396-409` (`GameHero cinematic`), `views/cfb/CfbHome.tsx` masthead | Palette stays inside the cool-neutral range (VQ4); visibly distinct from asset 1 in a side-by-side (VQ6) |
| 9 | `env.nba.hardwood-spot.v1` | Glossy hardwood in perspective, key and arc line-art, overhead spot cones, floor reflection | `views/nba/NbaGame.tsx:59` (`HeroArt` is always branded today), `NbaHome.tsx:84` | Reflection does not brighten the text channel above CO1; **no logo or text on the court** (AU6) |
| 10 | `env.nhl.ice-sheet.v1` | Ice sheet, face-off circle arc and blue line, specular reflections, cold cyan key, ice mist | `views/nhl/NhlGame.tsx:289` (`GameHero`), `NhlHome.tsx:122` | No readable board ads; mist never fills the text channel |
| 11 | `env.mlb.infield-twilight.v1` | Infield diamond arcs and base lines in perspective, mowing stripes, abstract twilight, park-light bokeh | `views/mlb/MlbGame.tsx:99-101` (`GameHero`) | Abstract sky only: not a real park, not graded onto a photo |
| 12 | `env.soccer.pitch-lights.v1` | Striped pitch, penalty-arc line-art, floodlights with mild flare, mist | `views/soccer/SoccerMatch.tsx:206` (`HeroArt`, default navy with no watermark today), `SoccerHome.tsx` header | No advertising boards, no crest or competition mark; flare ≤ 15 % of frame area |
| 13 | `env.tennis.hard.v1` | Hard-court baseline perspective, side light, long net shadow | `views/tennis/TennisMatch.tsx:126` (surface tint already at `:94-98`), `TennisHome.tsx` | Keyed to the existing `surface` value; no sponsor boards or tournament text |
| 14 | `env.tennis.clay.v1` | Terracotta court, dust haze | same | as 13 |
| 15 | `env.tennis.grass.v1` | Grass court, soft low sun shafts | same | as 13 |

CBB reuses the NBA plate with a warmer team tint until a CBB-specific plate is justified (Phase 5).

* **Method (all):** same as asset 1 (Blender first; FLUX.1 schnell or klein 4B locally as a candidate generator; GIMP finish); wide and tall masters separate; pre-checks C §4.1.
* **Desktop/mobile:** as asset 1.

### Hub and state art (assets 16-19)

| # | ID | Concept | Destination (exact) | Desktop / mobile | Method | Acceptance |
|---:|---|---|---|---|---|---|
| 16 | `intel.all.signal-field.masthead.v1` | Abstract SIFT signal field: layered blue-black fields, fine ledger lines, a few luminous trace curves (not data, not charts), cold key + gold accent used once | **Replaces the hard-coded team photos** at `views/intel/TerminalView.tsx:172` (Soldier Field), `PulseView.tsx:102` (Arrowhead) and `:191` (Scotiabank); Research Lab fallback `explore/photos.ts` / `ExploreView.tsx:99` for NBA/Soccer/Tennis; Prop hub masthead (`PropsHub.tsx:54-56`); My Board no-saved-game fallback (`BoardView.tsx:250`, today SoFi) | `d` 1920/1200 and `m` 780; CSS hue variants per destination | Code (SVG/canvas) + Inkscape; deterministic | **Contains no chart-like marks** that could be mistaken for data (human check); contrast IN1 for the masthead title; no hue from the reserved script palette (`#ff4f6e #ffb522 #2f9bff #a974ff`) |
| 17 | `state.board.empty.v1` | Calm illustration for an empty board (a lit blank slate-board, no characters) | `BoardView.tsx:179-187`, `BoardPreview.tsx:2,20` | SVG, 1 asset for both | Inkscape | ≤ 20 KB; the how-to text and CTA remain real text; works at 320 px |
| 18 | `state.all.feed-unavailable.v1` | Subdued "signal lost" illustration, neutral (never reads as "no opportunities") | Home/Intel/Props unavailable notices (`Sift2HomePreview.tsx:58-75`, `intel/TerminalView.tsx:203-214`, `PropsHub.tsx`) | SVG | Inkscape | Must not imply a research verdict (consistent with `RELEASE-CANDIDATE.md`: missing publications are not a no-opportunity verdict); accessible name states "data unavailable" |
| 19 | `state.games.no-slate.v1` | Empty schedule illustration | `Sift2Games.tsx:70` (`.s2-empty`), Home `Sift2HomePreview.tsx:64` | SVG | Inkscape | as 17 |

### Objects (assets 20-21; football is asset 7)

| # | ID | Concept | Destination | Method / acceptance |
|---:|---|---|---|---|
| 20 | `obj.baseball.hero-3q.v1` | Unbranded baseball, red stitching, no logo | `PropsHub.tsx:70` MLB card; MLB driver/prop fallbacks | Blender, alpha, as asset 7 |
| 21 | `obj.puck.hero-3q.v1` | Plain hockey puck on a hint of ice, no logo | `PropsHub.tsx:70` NHL card; NHL prop fallbacks | Blender, alpha, as asset 7 |

(Basketball, soccer ball and tennis ball follow in the next batch; their sports are not on the Prop hub's explorer cards today, `PropsHub.tsx:70`.)

### Glyphs and brand (assets 22-24)

| # | ID | Concept | Destination | Method / acceptance |
|---:|---|---|---|---|
| 22 | `glyph.sports.v1` | One cohesive 24-grid outline+fill family for the 8 supported sports (replaces the league-logo/hand-drawn mix) | `src/components/SportMark.tsx:12-78` (`SportMark`), Games group headers (`GameList.tsx`), sport filter chips (`Sift2Games.tsx:68`), Board slate packet buttons | One SVG sprite or inlined symbols; 8 × ≤ 1.5 KB; **no league marks**, removing logo exposure from the chrome; legible at 16 px and 44 px; passes IN4 |
| 23 | `brand.all.og-image.v1` | 1200 × 630 social card: SIFT mark + stage lighting, **no matchup, odds or claims** | `index.html` (no OG/Twitter tags exist today [V]) | Playwright render (pattern of `scripts/make-icons.mjs`); ≤ 150 KB; contrast of any text ≥ 4.5 : 1 |
| 24 | `brand.all.splash-portrait.v1` | iOS PWA startup image set (canvas `#05070d`, SIFT mark), the current PWA has none [V `index.html`, `vite.config.ts:42-60`] | `index.html` `apple-touch-startup-image` links | Playwright render at the required device sizes; each ≤ 60 KB; background matches `theme_color #05070d` to avoid a flash |

---

## 3. Deliberately not in this batch

| Item | Why |
|---|---|
| Venue photographs (NBA, 17 NFL, CFB, CBB) | A **curation** workstream through the existing Commons flow, with uncertain yield (E Phase 4); not generated |
| Player photographs | Blocked by the likeness decision (D2). No generation, ever |
| Logos, official crests, competition marks | Third-party marks; provenance already an owner item (A §7.1). Soccer/tennis use monograms and flags (decision D10), not unlicensed crests |
| CBB plate, tone variants, extra poses, basketball/soccer/tennis objects | After the style is proven |
| MMA, PGA | Not supported by SIFT |
| Onboarding art | No onboarding exists |
| Any illustration containing UI text, scores, odds or team names | Violates the "art is not a poster" rule |

## 4. Production order, effort and review

1. Gate 1 (assets 1-7): ~1-2 days operator time after Phase 0; review of **one** combined contact sheet + the real-component captures.
2. Gate 2 in this order: assets 9, 12, 13-15 (the three sports with zero hero art), 16 (mastheads), 8, 10, 11, 17-19, 20-21, 22, 23-24. ~3-5 days; review per group.
3. Every asset: `saf check` auto-gates → contact sheet → real-component render → named human approval → publish; nothing reaches the app unapproved (D §10).

Estimated bytes of the whole batch: plates ≈ 4-6 MB, effects < 0.1 MB, objects < 0.3 MB, brand ≈ 1 MB: **≈ 6-8 MB**.

## 5. Decisions required from the owner

| # | Decision | My recommendation | Blocks |
|---|---|---|---|
| **D1** | May a neutral **stage** (surface + light, no seating bowl, no venue claim) be the hero fallback, given `docs/HEROES.md` says "never a generic stadium"? | **Yes**, strictly non-venue; otherwise only effects (assets 2-6) are added | Gate 1 |
| **D2** | Player photography: keep NFL's 25 as they are, expand, or hide pending legal review of right-of-publicity risk (A §7.5)? | Keep NFL, **do not expand to MLB/NHL/NBA**, add the `likeness` flag and per-sport kill-switch, ask counsel before a commercial launch | Phase 4 players |
| **D3** | The Rams–Bills AI hero art (`public/heroes/art/`): retire, or keep with provenance? | **Retire** (it contains fake marks and numbers, A §1.6); keep the composition as the target | Hygiene 0.4 |
| **D4** | Team-logo provenance and trademark review (~757 CDN logos, no licence record) | Owner/counsel item **before commercial launch**; independently, move chrome to SIFT sport glyphs (asset 22) so league marks are not needed in navigation | none for art |
| **D5** | Where the factory lives: separate `sift-artwork` repo, or `art/` inside this repo | **Separate repo** (keeps masters and tooling out of the Pages deploy; only outputs sync here) | Phase 0 |
| **D6** | The owner's Mac model and RAM, and permission to run the local spike | Needed to decide diffusion vs Blender-first (C §6) | Phase 0 spike |
| **D7** | Model policy: Apache-2.0/MIT only (FLUX.1 schnell, FLUX.2 klein 4B), SDXL only after its card is read; no dev/9B/community fine-tunes | **Approve** | Gate 1 |
| **D8** | Who is the named approver; is a second reviewer wanted for rights items | One named approver; second reviewer for any asset with a third-party input | Approval flow |
| **D9** | Replace the hard-coded team photos on Intelligence, Pulse, Research Lab and Board with neutral art (asset 16) | **Yes** | Gate 2 |
| **D10** | Soccer and tennis identity: SIFT monogram crests and MIT flags, versus seeking official crest licences | **Monograms and flags**; do not ship unlicensed crests | later |
| **D11** | Gate structure: approve the NFL pilot before any other sport | **Yes** | all |
| **D12** | Authorise the small additive code change (plate layer in `VenueArt`, registry, tests, `/art/` cache rule) once Gate 1 art exists | **Yes, after Gate 1 approval only**; nothing in this audit touched production code | Gate 1 integration |
| **D13** | Widen the photo-credit chip from 9 px to ≥ 11 px and show full artist + licence (a small visible change near the hero edge) | **Yes**: it is a licence-compliance fix, not decoration | Phase 0.3 |

If D1 is "no": assets 2-6 still remove part of the void; assets 8-15 become masthead-only plates. If D6's spike fails: Blender and procedural replace diffusion; the 24-asset list does not change.
