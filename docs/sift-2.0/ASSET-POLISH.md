# Cinematic asset quality and final polish

Continuation of `e9dab5e` on draft PR #93. Layout is intentionally preserved, not redesigned. Design acceptance remains the owner's decision, separate from engineering checks.

## Implemented

- `venueArt.ts` is a reviewed art-direction layer over the existing identity/licence/era resolver. Each of the 15 existing NFL venue photographs has a quality decision, lighting class, desktop/mobile hero crop and card crop. Neutral sites, unverified home sides, shared venues and historical tenancy still obey the core resolver; a photograph is never reassigned to another venue or tenant. Other sports retain their existing registered assets.
- `VenueArt` measures its container instead of downloading a desktop-sized photograph for every card. It selects the smallest sufficient existing 720/1200/2400 source, caps resolution selection at 2× DPR and permits at most 2.5% upscaling before selecting a larger source. Decorative images retain the existing held-blob/offline cache, team-branded first paint and failure fallback. Image identity is keyed to prevent a cached previous venue flashing during navigation.
- Daylight is not graded into a fictional sunset. Night, indoor and daylight photographs receive separate restrained contrast/saturation treatment, edge atmosphere and text-protection gradients. Original lighting, roof, field and crowd remain intact. No sky replacement, synthetic floodlights, generated venue imagery or player retouching.
- `PlayerArt` uses reviewed portrait/landscape/thumbnail framing. Helmet cropping is corrected for Bo Nix; George Kittle's full-body frame has a tighter portrait crop; Purdy's face is retained in wide cards. Player selection validates the publication team even when a participant ID matches. Weak Bagent framing remains excluded. Unknown/missing/unloadable images show a contained genuine team crest over team-colour light and subtle jersey-like stripes, never a substitute face or silhouette.
- Matchup thumbnail selection respects the researched unit: a quarterback cannot illustrate a run defense. When a matching current-team photograph is unavailable, the team-branded fallback is used. Opponent-adjusted ranks, evidence, game scripts and their ordering are unchanged.
- Small type, numeric alignment, market-cell lighting, card border highlights and portrait separators are refined in an isolated final stylesheet. Hero heights, research placement, desktop column structure, player-list density, accessible controls and disclosure order are preserved.

## Curation / procurement ledger

All served photographs remain the existing approved, locally hosted Commons assets. Source/artist/licence/derivative information remains in `src/lib/hero/photos.json`, `src/lib/player-images.json`, Data & provenance and `public/sift2/venues/LICENSE.md`. No new external photograph was added in this milestone. Repository curation is not a claim of final owner visual approval.

| Venue | Current decision / framing | Specific missing asset |
|---|---|---|
| Arrowhead, KC | Existing credited Kj1595 CC BY-SA 4.0 night corner bowl; separate desktop/mobile crop | Editorial-quality dusk corner bowl with skyline, 2400px+; existing night frame has entrance haze |
| Levi's, SF | Preserve genuine daylight, field and home identity | Licensed high-contrast dusk corner-bowl alternative, 2400px+ |
| U.S. Bank, MIN | Indoor crop lowers focus from roof to crowd/field | None required for current treatment; stronger editorial alternative welcome |
| AT&T, DAL | Indoor frame retains star and videoboard | None required for current treatment |
| SoFi, LAR | Indoor crop retains Rams home configuration and oval board | None required for current treatment |
| State Farm, ARI | Preserve genuine night/roof lighting | None required for current treatment |
| Nissan, TEN | Genuine night frame, core era gate retained | Future building requires a new independently verified asset, not this frame |
| Superdome, NO | Preserve actual dome lighting | None required for current treatment |
| MetLife, NYJ | Jets home configuration; original night entrance | Separate Giants home imagery cannot reuse Jets branding |
| EverBank, JAX | Preserve original night frame and end-zone identity | None required for current treatment |
| Bank of America, CAR | Context-only anthem frame in cards; hero is team-branded | Unobstructed corner bowl with field and sky |
| Northwest, WAS | Context-only field-level image in cards; hero is team-branded | Wide corner-bowl night photograph with Commanders identity |
| Soldier Field, CHI | Grey/washed-out frame rejected on heroes and cards | High-contrast night/dusk interior, wide corner bowl, Bears identity |
| M&T Bank, BAL | Flat grey-sky frame rejected on heroes and cards | High-contrast night/dusk corner bowl, Ravens identity |
| Lambeau, GB | Field-level composition rejected on heroes and cards | Unobstructed wide corner-bowl game-day frame |

Player priorities: helmeted current-team action portrait for Brock Purdy; current-team Christian McCaffrey portrait; stronger face-forward Bo Nix frame; current-team Miami/Minnesota player coverage and Kansas City star portraits. Aim for a sharp 1000px+ portrait with helmet, face and upper torso, space around the head and no foreground obstructions. Verify uniform/team, author, source, licence and derivative terms before adding it to the established fetch manifest. Preserve the original and record focal points per surface. Do not use Getty/team editorial images without an applicable licence.

Reviewed and rejected: Commons `File:Brockpurdyrams.jpg` (Bentheeditior, CC BY-SA 4.0). The original is a distant phone photograph of the field with foreground camera equipment; Purdy is too small for a crisp player crop. It is not integrated. The existing credited CC0 warm-up portrait is retained honestly; it does not match the reference's helmeted action quality.

## Visual review and iteration

Original mockups and the previous milestone captures are compared at identical 1536×1024 desktop / 390×1165 app-display dimensions. Mobile reference device hardware is excluded using the existing documented crop, not recreated. Normal phone/iPhone/SE captures verify shorter viewports separately. Images show the bundled October 4 publication, not current prices; the archived Arrowhead example never borrows another game's research.

First inspection caught inherited `.hart__photo` opacity hiding the new image layer despite image visibility checks, and an oversized landscape fallback crest. Both were corrected; opacity has an explicit browser assertion. Second inspection improved Kittle's landscape framing and tightened genuine night contrast. A later before/after check caught a photo fade-in race on Games; the unnecessary transition is removed, and capture requires loaded status and full opacity. Corrupt image bytes are tested separately from unavailable HTTP responses: native decode failure also yields clean team artwork. Final artifacts include approved-reference/current comparisons, previous/current comparisons, ordinary phone captures, source geometry JSON, and separate night/indoor examples.

Unresolved: the mockups' dramatic dusk sky, consistent helmeted action portraits and fully photographic slate cannot be matched with the current licensed inventory. CSS does not solve those procurement gaps. Branded fallbacks are intentional and visible. No reference odds, scores, simulation shares, network labels or research were copied to achieve fidelity.

## Verification

Verified: lint, TypeScript, E2E build and dist/base-path check passed. All 96 unit/integration files / 1,084 tests passed under both UTC and America/Chicago. The combined SIFT matrix passed all 40 checks across desktop Chromium, mobile Chromium, iPhone and iPhone SE WebKit, including axe, overflow, filters, primary/deep navigation, source disclosures, truthful missing states and corrupt-photo fallback. The final opacity-only polish is followed by a fresh reference/capture matrix and recapture. Eight art-direction unit checks cover registered venues, canonical aliases, identity/neutral gates, contextual quality, resolution selection, current-team imagery and portrait framing. Matched browser captures assert the retained 454px desktop / 310px mobile hero, research y508 / y361 and desktop Featured Players y814.

Local WebKit runs with privately extracted Ubuntu libraries because this container lacks some browser host dependencies. No dependency versions or production setup were changed. The actual WebKit process and pages render; only the system-library preflight is skipped. Unit results are recorded with `TZ=America/Chicago`: the unrelated existing price-movement string assertion is host-timezone-dependent (this host defaults to Pacific/Auckland, receiving Oct 4 where the test expects Oct 3); the research implementation is not changed to accommodate that test.

No merge, production change or deployment. No additional screen redesign.
