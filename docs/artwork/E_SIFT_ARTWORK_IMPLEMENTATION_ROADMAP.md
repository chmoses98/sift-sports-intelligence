# E. SIFT Artwork Implementation Roadmap

Status: **proposal for owner approval, 2026-10-18.** Nothing is scheduled or started. Conventions: [V] verified in the repository, [R] recommendation, [U] unverified. Effort figures are order-of-magnitude [R], not commitments.

---

## 1. What the audit says about priorities (checking the brief's expectation)

The brief expected Game Command Center, Home, Player Prop Explorer and Games to be the major priorities. Verified result:

| Brief's expectation | Finding |
|---|---|
| Game Command Center, Home, Games: major | **Confirmed, and they are one fix.** All three render the *same* component stack (`BroadcastHero` → `VenueArt` → `HeroArt`, `Sift2HomePreview.tsx:63`, `Sift2Games.tsx:24-37`, `Hero.tsx:176-183`) and fail the same way: 22 of 32 NFL home teams and every NBA, Soccer and Tennis game fall to the branded wash with a void above the logos (A §1.1). One new layer in that stack lifts all three at once. |
| Player Prop Explorer: major | **High, not first.** It is the weakest *art* surface (text-only masthead, 25 photos total, logo faces), but it is a working tool where art competes with numbers. Its gain comes mostly from *object and category art*, which depends on the first batch's objects. Phase 3. |
| (not in the brief) | **Three sports have no hero identity at all** (NBA, Soccer, Tennis), and **hub mastheads reuse one team's building** on cross-sport pages (Intelligence → Soldier Field, Board → SoFi). Both outrank Prop Explorer polish. |
| (not in the brief) | **Rights hygiene** (credits gap, prune-loop hazard, no NOTICE, logo provenance) blocks adding any new asset class safely. Phase 0. |

---

## 2. Prioritisation method

Criteria from the brief, scored 1 (worst) to 5 (best) per candidate, where *higher is better* (so production difficulty, cost and performance cost are scored as ease / cheapness / lightness):

| Candidate (sorted by total) | Visual impact | Frequency | Reuse | Ease | Cost | Perf | Total /30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| NFL stage plate + effects kit under the hero stack | 5 | 5 | 5 | 4 | 5 | 4 | **28** |
| Neutral masthead art replacing hard-coded team photos (Intel, Pulse, Lab, Board) | 4 | 4 | 5 | 5 | 5 | 5 | **28** |
| Unified sport glyph family | 3 | 5 | 5 | 4 | 5 | 5 | 27 |
| NBA, Soccer, Tennis hero plates (sports with zero hero art) | 5 | 3 | 5 | 4 | 5 | 4 | 26 |
| Rights hygiene (credits, prune, NOTICE): an enabler, not art; done first | 1 | 5 | 5 | 5 | 5 | 5 | 26 |
| CFB, NHL, MLB plates | 4 | 3 | 5 | 4 | 5 | 4 | 25 |
| State illustrations (empty board, no slate, feed down) | 3 | 3 | 4 | 5 | 5 | 5 | 25 |
| Unit and prop-category object art (drivers, prop cards, hub cards) | 4 | 4 | 4 | 3 | 5 | 4 | 24 |
| Brand: splash set, OG image | 2 | 2 | 5 | 4 | 5 | 5 | 23 |
| Tone variants (day/indoor), more plates, CBB plates | 3 | 2 | 4 | 4 | 5 | 4 | 22 |
| Player photo expansion (**blocked** by likeness decision D2) | 5 | 4 | 1 | 1 | 5 | 4 | 20 |
| Commons photo gap-fill (NBA, 17 NFL teams, more CFB/CBB) | 5 | 3 | 1 | 2 | 5 | 3 | 19 |

Reading: the plate-under-the-hero fix and the neutral mastheads dominate; photo gap-fill and player photos are the *hardest and least reusable*, which is the reverse of where a "make it look premium" instinct points.

---

## 3. Phases

### Phase 0: decisions, hygiene and the spike (no new art shown to users)

Goal: make it safe and measurable to add art.

| # | Work | Why | Size |
|---|---|---|---|
| 0.1 | Owner answers the decisions in F §4 (D1 stage-plate rule, D2 likeness policy, D3 existing AI art, D5 repo layout, D6 hardware, D7 model policy, D8 approver) | Everything below depends on them | 1 sitting |
| 0.2 | Fix the Hero-images prune loop (`fetch.mjs:77-81`) | Otherwise the next run deletes `public/heroes/art/` and any new class placed there | S (hours) |
| 0.3 | Register the Arrowhead photo in the credits table and licence tests; add `NOTICE`; widen the credit chip from 9 px to ≥ 11 px with full artist + licence link | A §7.2-7.4 | S |
| 0.4 | Decide the LAR–BUF AI image: retire, or add provenance | A §1.6, §7.6 | XS |
| 0.5 | Reconcile `docs/ARCHITECTURE.md` stale image section; add an image budget row and a dist check (`scripts/check-dist.mjs`) | A §7.9 | S |
| 0.6 | **Run the spike** (C §9): ComfyUI/mflux + FLUX.1 schnell, Blender object render, pre-check scripts, publish-refusal test | Converts "documented" into "measured" before committing | 1 day |
| 0.7 | Pull exact container widths from the existing geometry capture (`e2e/sift2-fidelity-capture.spec.ts`) for the Home hero (`height:auto`) and 720-1250 px | A §9 open items | XS |

Exit: decisions recorded; spike pass/fail recorded; hygiene merged; **no user-visible change**.
Kill/redirect rule: if the spike's S2-S4 fail, Phase 1 uses Blender and procedural plates instead of diffusion (C §8); nothing else changes.

### Phase 1: prove the look (the smallest collection with the biggest visible change)

Goal: remove the void from the three Critical surfaces and **get the style approved on one sport before scaling**. The brief forbids making hundreds of images before the style is approved; this phase makes **7 assets**.

| Assets (document F, assets 1-7) | Destination |
|---|---|
| `env.nfl.night-turf.signature.v1` (desktop, phone, card) | Home featured hero, Games feature hero, Command Center hero, in the branded-fallback slot |
| Effects: floodlight cones, haze floor, grain, bokeh edge, rim sweep (5 small SVG/CSS) | Same stack |
| `obj.football.hero-3q.v1` | First object, used in Phase 3 but approved here for the grade |

Code change required (**only after approval**; small and additive; layouts untouched): add the plate layer inside `VenueArt` between the branded layer and the photo, a pure registry resolver, one test file, one SW cache rule. [R] Estimated ½ to 1 day. This is the only production code touched in Phase 1 and it needs explicit owner authorisation.

Review: render the real hero for **both an NFL team without a photo (e.g. BUF, NE) and a team with one (KC)**, at 1352 × 454 and 390 × 250, with real text, using the existing capture spec. Compare against the current baselines (`sift2-game.png`, `phone/sift2-game.png`).

Exit criteria (all measurable):

* Every NFL hero render has either a verified photo or the plate; zero void bands in the capture.
* D §7 rows pass on the rendered component (text contrast, no overflow, fallbacks).
* Bytes added on first hero view ≤ 250 KB; LCP delta ≤ 100 ms ◇.
* **Owner approves the look in writing.** If not approved, iterate Phase 1 only. Do not start Phase 2.

### Phase 2: every sport and every hub

Goal: all eight sports have a hero identity; no cross-sport page shows one team's building.

| Work | Assets | Notes |
|---|---|---|
| Sport stage plates: CFB, NBA, NHL, MLB, Soccer, Tennis (hard, clay, grass) | 8 plates | F assets 8-15 |
| Neutral masthead art for Intelligence, Pulse, Research Lab, Prop hub, My Board fallback | 1 abstract signal field (+ CSS variants) | Replaces `TerminalView.tsx:172`, `PulseView.tsx:102,191`, `BoardView.tsx:250` fallbacks |
| Wire sport plates into the six non-NFL game heroes | code | `NbaGame.tsx:59`, `SoccerMatch.tsx:206`, `TennisMatch.tsx:126` (surface-keyed), `NhlGame`, `MlbGame`, `cbb/Game.tsx:171`; same layer, no layout change |

Exit: capture matrix (Chromium desktop + phone, WebKit iPhone + SE) shows plate or photo on every sport's hero; D §7 passes; owner sign-off per batch of sports.

### Phase 3: distinctive cards (objects, unit art, glyphs, states)

| Work | Assets |
|---|---|
| Object art for Key Matchup Drivers, featured-player fallback, prop-category keys, Prop hub sport cards | 3 objects in batch 1 (football, baseball, puck); basketball, soccer ball, tennis ball + unit/category variants after |
| Unified sport glyph family replacing the logo/SVG mix in `SportMark.tsx` | 1 sprite |
| State illustrations | 3 |
| Route Prop Explorer through the reviewed crop layer (`PropExplorerView.tsx:148,237` uses classic `PlayerFace`, not `PlayerArt`) | code, small |

This is where the Prop Explorer improves. Exit: no driver row is "three identical logos"; Prop hub no longer text-only.

### Phase 4: photographs (long tail, uncertain yield)

A *curation* workstream, not generation, using the existing `hero-candidates.yml` → `pins.json` → `hero-images.yml` flow and the rules in `docs/HEROES.md`:

1. **NBA**: 30 clubs, `venues.json` already lists tenants; no photos exist. Highest value because NBA has zero hero photography.
2. NFL: the 17 teams without a registry photo (ATL, BUF, CIN, CLE, DEN, DET, HOU, IND, LAC, LV, MIA, NE, NYG, PHI, PIT, SEA, TB), then the 3 forced-branded (CHI, BAL, GB) and CAR/WAS, which `ASSET-POLISH.md` already specifies replacement frames for.
3. CFB and CBB programs by frequency of appearance.
4. Each candidate passes the existing gates (identity, era, not another event) **plus** D §7 AU/CO/IN rows and the licence verified at source.

Expected yield is uncertain: `HERO_COVERAGE.md` records 20 proposals rejected at full resolution and that "Commons often has no free-licence frame that shows a team's home identity in its current era". [V] Treat each success as a bonus on top of Phase 1-3, never a dependency. Keep every photograph pure (B §2 rule 1).

Player photography is **blocked on D2** (likeness). If the owner chooses to continue, extend the existing manifest with `likeness` and a per-sport kill-switch (D §8) and review the 21 heuristic picks pixel by pixel.

### Phase 5: polish and brand

* Splash set and OG image (`index.html` has neither, A §5.9 X3).
* Tone variants (daylight, indoor), CBB-specific plates, extra poses.
* Evaluate AVIF only if the budget is missed (D §5).
* Monthly licence re-check job (D §8).
* Annual re-check of ageing photographs (`HERO_COVERAGE.md` open gap 3).

---

## 4. Dependencies

```
Phase 0 (decisions, hygiene, spike)
   └─► Phase 1 (NFL plate + effects + football) ── owner style approval ──┐
                                                                          ▼
                                   Phase 2 (all sports + hub mastheads) ─► Phase 3 (objects, glyphs, states)
                                                                          │
Phase 4 (photographs) — independent after Phase 0.2/0.3; player photos blocked on D2
Phase 5 — after Phase 3
```

## 5. Performance guardrails (apply to every phase)

* Hero art on first view ≤ 250 KB; per page ≤ 400 KB (D §6). The existing 2400 px photographs (median 483 KB) are the heaviest assets; plates are deliberately lighter.
* CSS layers paint before any file arrives; no layout shift; no video, no WebGL.
* Source selection by measured width and DPR (existing `venueImageSource`), never "the largest".
* Plates are shared across all teams of a sport, so one plate is cached for the whole sport (`/art/` CacheFirst rule).
* Motion off under `prefers-reduced-motion`.

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Local generation quality or speed disappoints | Medium [U, unmeasured] | Spike first; Blender/procedural fallback (C §8); factory records are producer-agnostic |
| Plates read as "generic AI wallpaper" | Medium | They are *stages under team light with real text*, approved on the real component; style approval gate before scaling |
| Owner dislikes the stage-plate rule | Low-Medium | D1 is an explicit decision; without it, only effects are added (still removes the void partly) |
| Right-of-publicity or trademark claim | Low-Medium, high impact | New art contains no people or marks; player photos behind a kill-switch; logos' provenance flagged as an owner item (A §7) |
| Visual regression churn | Medium | Reviewed baseline updates; art isolated in `.app--sift2` scope as existing CSS is |
| Pages size growth | Low | 10-25 MB projected vs 129 MB `public/` today; verify limit (D §9) |
| Model licence changes or misread | Low-Medium | Apache/MIT-only rule, licence hash recorded, re-check on update |
| Scope creep into layout | Medium | Hard rule: layouts, hero heights and text positions are fixed by `docs/sift-2.0/*`; art fills slots only |

## 7. Success metrics

| Metric | Today [V] | Target |
|---|---|---|
| Hero renders with photo or plate (not void) | NFL 10/32 teams; NBA/Soccer/Tennis 0 | 100 % of eight sports |
| Cross-sport pages showing one team's building | 4 (Intel, Pulse, Lab, Board fallback) | 0 |
| Surfaces with text-only art slots among Home/Games/Command/Props | 5+ | 0 in the primary four |
| Player cards that are logo-on-gradient | most | designed fallback on all; photos where approved |
| Registry assets with a complete licence record | photos only; logos none | 100 % of art in the library |
| Text-over-art contrast failures | not measured | 0 (IN1) |
| Added bytes on first hero view | n/a | ≤ 250 KB |
| Unapproved assets reachable in production | n/a | 0 (CI-enforced) |

## 8. Rough effort [R]

| Phase | Owner time | Operator/dev time |
|---|---|---|
| 0 | decisions (1 sitting) | 1.5-2 days (hygiene + spike) |
| 1 | style review (1 hr) | 1-2 days (7 assets + ½-1 day integration) |
| 2 | review (2 hrs) | 2-3 days |
| 3 | review (2 hrs) | 2-3 days |
| 4 | per-photo review | open-ended, uncertain yield |
| 5 | review | 1-2 days |

Total to a coherent, premium-looking *first complete* SIFT 2.0 art layer (Phases 0-3): roughly 8-12 working days of operator time, spread over calendar weeks because of review gates. [R: assumes the spike passes.]
