# B. SIFT Visual Identity Guide

Status: **proposal for owner approval, 2026-10-18.** Nothing here is implemented. Conventions: [V] verified in the repository, [R] recommendation, [U] unverified.

This guide extends, and does not replace, the approved SIFT 2.0 foundation: deep navy canvas, thin electric-blue borders, Barlow / Barlow Condensed, limited glass (`src/styles/sift2-tokens.css`, `docs/DESIGN_SYSTEM.md`, `docs/sift-2.0/BLUEPRINT.md` "Approved visual standard"). It changes **what fills the art slots**, never the layouts, the text, or the analytics.

---

## 1. The idea: *a night broadcast, drawn from light*

ESPN Primetime, a Nike campaign and an EA Sports menu all get their drama from the same three things, and none of them is a recognisable face:

| Reference | What carries the drama | What SIFT takes (creative reference, not reproduction) |
|---|---|---|
| **ESPN Primetime** | Hierarchy: one dominant matchup, team colour as light, a dark channel for text | Two team-colour light sources at the frame edges, a deliberate dark centre channel, bold condensed type (already in SIFT 2.0) |
| **Nike campaigns** | High-contrast single-source lighting, tight crops, texture, motion, restraint | A strict contrast grade, grain, speed/rim light, equipment as hero object, one idea per frame |
| **EA Sports cinematic** | Atmosphere with depth: haze, volumetric light, lens flare, a surface in perspective | Layered depth: surface plane → haze → light cones → particles → vignette, per sport |

SIFT's own signature, which no reference owns: **light the sport, not the person.** Every hero is a sport-specific stage (turf, hardwood, ice, clay) lit in the two teams' colours, with real photography where a verified frame is good and a clean stage where it is not. The viewer should recognise a SIFT frame by its lit-glass navy, cold key light, team-colour rim and condensed numerals before reading any text.

This is also the answer to the "fake athlete" problem (section 4): the stage carries the emotion, so the system never needs an invented person.

---

## 2. The art stack: layers, not posters

Artwork is **assembled at runtime from separable layers**. No poster contains UI, team names, scores, dates, odds or analytics: SIFT keeps rendering those as text (`BroadcastHero.tsx` already does). [V] the current stack is `HeroArt` (wash, rays, livery, logo watermark, outlined name) with a photo layered over it in `VenueArt`, then `s2-venue-art__atmosphere` and `s2-venue-art__shade` (`sift2-assets.css:2-11`).

Proposed stack [R], bottom to top. New layers are marked **new**; everything else exists.

| z | Layer | Source | Baked or runtime | When shown |
|---:|---|---|---|---|
| 0 | Canvas `#030a14 → #07111f` | CSS token | runtime | always |
| 1 | **Sport stage plate** (neutral, no team colour, no people, no text) | F1 asset, wide or tall master | file, art-directed focus | when no verified photo **and** the stage is approved for the sport; reduced to ≤ 25 % when a photo is present |
| 2 | **Team light fields**: home colour at one edge, visitors at the other (`--hc1/--hc2/--ac1/--ac2`, already produced by `heroVars`, `HeroArt.tsx:27-38`) | CSS gradients | runtime | always; split frame for neutral / matchup (`context`) |
| 3 | Verified venue photograph (existing `hart__photo`) | F4 | file | only when `resolveHero` says `photo` |
| 4 | **Effects**: floodlight cones, bokeh, haze, grain, livery stripes | F2, SVG/CSS | runtime | tone-dependent |
| 5 | Existing shade / atmosphere gradients (`sift2-assets.css:7-10`) | CSS | runtime | always; text protection |
| 6 | Logos, names, scores, kickoff, venue | real interface elements | runtime | always |

Rules:

1. **Photographs stay pure.** Never bake generated pixels, colour fills or logos into a venue or player photograph. 64 of 100 hero photos are CC BY-SA (`photos.json`); baking would make the composite an adaptation under share-alike. Colour grading is done by CSS at render time, as `ASSET-POLISH.md` already does ("CSS contrast/saturation and readability gradients; no synthetic scene content").
2. **The resolver stays authoritative.** `resolveHero` decides identity, era, neutral site, home-elsewhere. Art layers never override a `branded` or `neutral` outcome and never claim a venue. The sport stage is *not a venue* and must not look like one (section 5, "no bowl").
3. **Identity before atmosphere.** `docs/HEROES.md` priority order stays: (1) correct home identity, (2) authentic venue, (3) atmosphere. The stage is priority 3.
4. **Decorative, `aria-hidden`.** Everything the art says is also in text, as today.
5. **First paint never waits on art.** Layers 0, 2, 4, 5 are CSS and paint immediately; the plate fades in (the existing `useHeldImage` holds the previous image and avoids flashing). Explicit `aspect-ratio`/height means no layout shift.

**Owner decision D1 (see document F):** `docs/HEROES.md` says the hero "never falls back to a generic stadium". A neutral *stage* (surface + light + haze, no seating bowl, no scoreboard, no signage) respects the intent of that rule (never imply a place), but is a visible change of the rule's letter. It needs an explicit yes.

---

## 3. Colour and light

Neutral plates, coloured light. Plates are authored in a **cool blue-black, low-chroma** range so the same file serves every team; the team's colours arrive from CSS layer 2. This is what allows ~18 plates to cover 700-plus teams.

| Token | Value | Source [V] | Role in art |
|---|---|---|---|
| Canvas | `#07111f` (2.0) / `#000a11`-`#05131d` (classic) | `sift2-tokens.css`, `DESIGN_SYSTEM.md` §1 | base, shadows |
| Electric blue | `#60b8ff` (2.0 accent), `#1e8cf2` nav | same | SIFT key light, effects accent |
| Ice cyan | `#1fb2ec` | `DESIGN_SYSTEM.md` | haze tint, rim on cold sports |
| Price gold | `#f6cf62 → #e2ad2e` | same | single warm accent: sparingly, never as team colour |
| Script identity | `#ff4f6e` `#ffb522` `#2f9bff` `#a974ff` | same | **reserved for data**; do not use as art colour |
| Team colours | from `heroVars` (`--hc1`...) | `HeroArt.tsx:27-38` | light fields and livery only |

Light rules:

* **One key, one rim.** Cold SIFT blue key from above; team colour as rim/edge light. No rainbow glows, no full-saturation neon fills.
* **Lowest-luminance centre.** The centre channel (where text sits) must be darker than either edge. This is measurable (section 7).
* **Contrast is graded, not filtered into fantasy.** One SIFT grade for photographs: the existing `contrast(1.06-1.14) saturate(1.05-1.13) brightness(.87-.96)` per tone (`sift2-assets.css:4-6`, `fidelity.css:33`). Daylight stays daylight. No fictional sunsets over real photos (`ASSET-POLISH.md`).
* **Team colours are brand presentation only** (as already stated in `DESIGN_SYSTEM.md`); unknown teams use the existing neutral default (`#1d2d52 / #3f5079`).
* **Colour-blind safe adjacency.** Home and visitors light fields must stay separable by side, not only by hue; they are always on opposite edges.

---

## 4. Athletes: the policy ladder

The brief is explicit: no fake-looking athletes, no generated real players as the primary solution. The audit adds a second constraint: rights of publicity (document A §7.5). The ladder, highest authority first:

| Tier | Treatment | Allowed when | Notes |
|---|---|---|---|
| **A. Authentic photograph** | Existing gate: game-day frame, current team kit, verified identity, blocklist, tests | Frame passes the quality checklist (D §7) **and** the owner has cleared likeness rights for that sport | Today only NFL has any (25). Treat as removable per sport: a manifest flag, not hard-wired |
| **B. Role / unit art** | A sport object (ball, puck, glove, racquet) or equipment *without marks*, lit in team colours, labelled by function: "Run game", "Pass protection", "Takeaways", "Receiving yards" | Always | Makes Key Matchup Drivers and prop cards distinctive without a person. Matches the existing rule that a QB photo must not illustrate a run defence (`ASSET-POLISH.md`) |
| **C. Team-branded fallback** | Existing: team logo over team-colour light | Always | Keep, but upgraded with layer 4 effects so it stops reading as "a logo on stripes" |
| **D. Never** | Generated athletes; generated jerseys with numbers or marks; a silhouette presented as a *specific* player; face-swaps; upscaled/AI-"restored" faces | — | Consistent with `players.ts:1-4`, `ASSET-POLISH.md:7` |

A Nike-style editorial *look* is available without Tier D: apply one consistent photographic grade (contrast, grain, rim light from layer 4) to tier A photographs so that quality variation between Commons frames is masked rather than amplified. It does not fix a weak frame; the checklist still rejects those.

**What can be authentic and free:** stadium and arena photography (Commons), empty fields/courts/ice, equipment close-ups, crowd/light bokeh from properly licensed stock [U: licence texts for stock sites were unreachable here, see C §6], and team-colour systems. **What cannot:** premium action photography of identifiable named athletes without a licence. That limitation is real; tier B/C are the visually strong alternative the brief asks for.

---

## 5. Per-sport stage direction (F1 signature plates)

All stages are **non-venue**: surface, perspective, light, haze. No seating bowl, scoreboard text, banners, signage, logos or people. They are marks of the *sport*, never of a place.

| Sport | Surface and perspective | Light | Texture / motif | Hero object (F3) | Avoid |
|---|---|---|---|---|---|
| **NFL** | Night turf, yard-line and hash perspective, low camera at the 30 | Cold blue-white floodlight cones from both upper corners, haze at the horizon | Turf grain, kicked-up spray, subtle goalpost silhouette | Unbranded football, laces forward | NFL shield, any real end-zone text, helmet decals |
| **CFB** | Same turf grammar, **warmer** dusk gradient, heavier haze | Mixed sodium and LED, crowd bokeh at the edges | Rougher grain, "Saturday" warmth | Football | Any school colours baked in; real stadium shapes |
| **NBA** | Glossy hardwood, key and three-point arc line-art, strong floor reflection | Overhead spot cones, arena haze, scoreboard glow *blurred beyond legibility* | Wood grain, specular streaks | Unbranded basketball | Logos on court, readable scoreboard text |
| **CBB** | Court, tighter and warmer than NBA, lower haze | Gym-light warmth, banner shapes as plain rectangles | Slight film grain | Basketball (distinct from NBA mark treatment, see `SportMark.tsx:50`) | School banners, mascots |
| **NHL** | Ice sheet in perspective, face-off circle arc, blue-line, specular reflections | Cold cyan key, mist at ice level | Scratches/skate marks, boards as plain dark verticals | Puck, stick blade silhouette | Glass-ad text, logos at centre ice |
| **MLB** | Infield diamond arcs, base lines in perspective, grass mowing stripes | Twilight gradient (abstract, not a specific sky), park lights | Dirt/grass texture | Ball, bat silhouette | Real park skylines, outfield-wall ads |
| **Soccer** | Pitch with mowing stripes, penalty-arc line-art | Floodlights with mild lens flare, European-night mist | Wet-pitch sheen | Plain panel ball (generic, no brand) | Real club crests, UEFA/FIFA marks, advertising boards |
| **Tennis** | **Three plates**: hard (blue/green), clay (terracotta, dust), grass; baseline perspective | Side light with long net shadow | Court texture; `TennisMatch.tsx:94-98` already tints by surface (`SURFACE_LIGHT`), so the plate should key off the same value | Ball, racquet silhouette without a brand | Tournament names, sponsor boards, player likeness |
| MMA / PGA | Not supported | — | **No art.** | — | — |

Sport glyph family (F7): a single outline-plus-fill system replacing the current mix of league logos and hand-drawn symbols (`SportMark.tsx`). No league marks are needed for navigation, which removes ongoing trademark exposure from the chrome.

---

## 6. Per-surface direction

| Surface | Art role | Recipe | Density rule |
|---|---|---|---|
| **Game Command Center** (NFL/CFB; classic heroes for the other six) | The cinematic moment | Stage plate + team light fields + effects, or verified photo + effects; unit art in driver cards; prop-card art in featured players | The one place for full-strength effects |
| **Games** feature | Cinematic, calmer | Same stack, 2.5:1 crop, less haze | Schedule rows stay quiet (`GameList.tsx:32` "paints no hundred photographs") |
| **Home** | Brand and sport range | Featured hero as above; sport tint per row; illustrated promo cards | Two art moments above the fold, no more |
| **Player Prop Explorer** | Stat vocabulary | Masthead stage; prop-category object keys; faces only when approved | Art identifies a category, never competes with the line/projection numbers |
| **Intelligence** | Signal, not stadium | Abstract signal-field masthead; per-signal glyphs; charts untouched | No photograph of any team's building on a cross-sport page |
| **Research Lab** | Craft, instruments | Per-tool illustration, ledger/grid motifs | Lowest intensity |
| **My Board** | Personal | Stage of the saved sport in the saved team's colours; a designed empty state | Personal, calm |
| **Sports homes** | Identity of the sport | Signature stage + glyph + hero object | One per sport |

**Do not decorate:** evidence, confidence, simulation shares, price and market tables, filters, date strips, skeletons. Script percentages are not calibrated probabilities (`BLUEPRINT.md`); art must never make a script or a price look more certain.

---

## 7. Desktop and mobile composition rules

Two compositions, never one image stretched [R, from the measured geometry in A §3]:

| | Desktop master | Phone master |
|---|---|---|
| Format | **3 : 1** wide (2400 × 800), delivered 1920 / 1200 | **4 : 5** tall (1080 × 1350), delivered 780 / 540 |
| Crops it must survive | 2.7 : 1 (Command 454 px), 2.5 : 1 (Games 502 px), ≥1800 px width at 550 px height | 1.56 : 1 (Command 250 px), 1.93 : 1 (Props tab 202 px), 0.9 : 1 (Games 405 px) |
| Energy zones | Left 0-28 % and right 72-100 % (light fields, objects, athletes if tier A) | Top 0-45 % (light, cones, object) |
| **Text channel** | Centre 36 % wide × lower 60 % tall: darkest region of the frame | Lower 55 % full width (matchup block sits at the bottom, `fidelity.css:67,74`) |
| Reserved margins | Top 12 % (tab, credit) | Top **44 px** (safe area; the hero has no inset of its own, A §3), bottom 56 px (bottom nav `env(safe-area-inset-bottom)`) |
| Focus | `--focus-d` per asset (already supported) | `--focus-m` per asset |
| Athletes / objects, if used | Near opposite edges, never touching the centre channel | Larger, top-anchored, never below the 45 % line |

Responsive rules:

* Choose the source by **measured container width and DPR**, not viewport, as `venueImageSource` already does (`heroArt.ts:25-29`, capped at 2× DPR, 2.5 % upscale tolerance). Extend the same function to plates.
* One plate = one art-directed pair (desktop + phone master) plus a card crop (720 × 360) for rows and tiles. Tablet uses the desktop master with the phone breakpoint at 719/720 as today.
* ≥1800 px: hero grows to 550 px (`sift2-reference.css:32`); the 3 : 1 master has enough headroom.
* Dynamic assembly (layers 2 and 4) handles team colour and per-state intensity; only the plate and photographs are files.
* The phone hero heights are small (250 and 202 px). **At 202 px, art must read as colour and light only.** Detail is wasted there.

---

## 8. Typography and text over art

* Barlow Condensed for names and numerals, Barlow for reading (`DESIGN_SYSTEM.md` §2). Art never introduces a third face and never contains letters; a plate containing a legible glyph is rejected.
* Text colour `#f2f7ff` (`--sift2-text`). Required contrast against the **rendered** background behind each text element: **≥ 4.5 : 1** for text under 24 px or under 700 weight, **≥ 3 : 1** for numerals and names at 24 px bold and above (WCAG 2.x thresholds). Measured on screenshots, not assumed (D §7).
* Text keeps its existing `text-shadow`/glass treatment (`.sift2-command .s2-player__name`, `sift2-assets.css`) as a backstop, not as the primary method.
* Photo credits: legally required, currently 9 px / 7 px phone (`sift2-fidelity.css:34,68`). Artwork must leave a clear, higher-contrast corner for a credit chip that is at least 11 px. [R] Not a layout change.

---

## 9. Motion and performance

* Default: **static art**. Optional: a slow (≥ 40 s) CSS drift of the light cones and bokeh, on `transform`/`opacity` only, paused by `prefers-reduced-motion` (the stylesheets already honour it: `sift2-tokens.css:50-55`, `sift2-hero.css:48`).
* No autoplaying video, no WebGL, no canvas shaders on hero surfaces in the first phase. Cost, battery and Pages bandwidth are not worth it.
* Budgets (D §6): hero plate ≤ 150 KB desktop, ≤ 100 KB phone, effects ≤ 20 KB each.

---

## 10. Prompt and brief principles (for plates only)

Used by the factory (document C) when a plate is generated locally; they are also the brief for a Blender scene.

* **Positive vocabulary:** "empty `<sport surface>` at night, low camera, floodlight cones, atmospheric haze, shallow depth, cool blue-black palette, 3:1 panoramic, large dark central area, film grain, photographic, no people".
* **Mandatory negatives:** people, faces, hands, text, letters, numbers, logos, signage, scoreboards, banners, jersey, brand marks, watermark, stadium seating bowl (for the neutral stage).
* **Automatic rejects** (checked by the factory before a human sees them, D §7): any detected face, any OCR hit, mean luminance in the text channel above the limit, palette outside tolerance.
* Record every generation: model + licence, seed, prompt, workflow JSON, date. Required by the library spec (D §3).

---

## 11. Anti-patterns (explicit)

* An AI render of a named quarterback, any generated jersey, number, helmet logo or league shield (the LAR–BUF art, A §1.6, is the cautionary example).
* A poster that contains the matchup text, odds, a score or a date.
* Stretching one wide image to a phone hero or cropping a phone image into a desktop hero.
* A generic stadium bowl presented as the home team's venue.
* One team's photograph on a cross-sport page (A §5.5 I1, §5.7 B1).
* Using a script identity colour (`#ff4f6e`, `#ffb522`, `#2f9bff`, `#a974ff`) as decoration, which would collide with data meaning.
* Art behind dense data: tables, ladders, evidence panels.
* Any feature-shaped art for unsupported sports (MMA, PGA) or non-existent features (onboarding).
