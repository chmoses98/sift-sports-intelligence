# Visual fidelity milestone — not design acceptance

Baseline: draft PR #93, commit 494e653. The three original 1536×1024 desktop and 1024×1536 two-phone mockups are the composition standard. Earlier implementation screenshots were rejected. Tests establish behavior, not visual acceptance.

## Ten largest differences (measured/observed before editing)

| # | Gap | Required correction |
|---|---|---|
| 1 | Games feature starts at y226 versus reference y154; a full-width technical notice consumes the missing 72px. | Match the masthead/filter heights; move partial-coverage details alongside the slate count. Keep total publication failure prominent. |
| 2 | Games feature is 570px high versus reference 502px; matchup cards begin at y866 versus y722 and extend beyond the screen. | Fixed desktop composition: 502px feature, compact 74px rows, four 274px matchup cards. |
| 3 | Flat, grey Soldier Field photo lacks contrast, colour separation and useful negative space; reference has a wide dusk bowl with luminous sky. | Review originals, use genuinely strong licensed frames where available; document missing venue assets. Never fabricate a sunset, sky or stadium. |
| 4 | Desktop command hero is inset 24px; rail is too wide and functions as a long model-stat column. | Full-bleed hero from x128, 454px tall; 180px right rail with weather, real market quotes and quick research links. |
| 5 | Research starts at y650 versus y509; More research and publication notices interrupt the primary hierarchy. | Put research immediately after tabs. Move secondary research and restrictions into accessible disclosures after the primary composition. |
| 6 | Game Read is a long tiny-type icon list; reference is a short readable paragraph plus three visual insight tiles. | Use existing ranked insight/context data in that exact paragraph-and-tiles composition. |
| 7 | Script rows have inherited coloured cards, uneven heights and oversized gaps. | Four equal 53px rows, white percentages, blue/purple/gold/red bars; always label simulation shares, never calibrated probabilities. |
| 8 | Matchup intelligence uses dense truncated rank bars; reference has three image-led driver rows. | Three team/player-led evidence links with clear titles and actual opponent-adjusted ranks; full rank charts remain in Matchups. |
| 9 | Featured players are below the first screen and read as charts with small portraits; reference shows four photographic horizontal cards at y862. | Compact four-card row under Read/Scripts, prioritizing available approved player photography without inventing missing portraits. |
| 10 | Mobile has a separate utility bar, inset hero, two technical disclosures before research, oversized cards and tiny prices. Reference puts hero/tabs directly into readable research and shorter player rows. | Integrate actions into the hero; remove redundant utility bar on Game only; responsive compact hero on Players, 112–130px player rows, visible market snapshot; no technical disclosure before Game Read. |

## Comparison protocol

Desktop: capture 1536×1024, CSS scale 1. Mobile: extract the display content from each supplied phone mockup (exclude decorative hardware/status bar), then render the app at the equivalent CSS aspect ratio/width. Publish side-by-side reference and implementation without stretching either image; report crops/dimensions. Also test ordinary 390×844 Chromium and 393×852 / 375×667 WebKit layouts. Screenshots use bundled publications, not current prices.

## Asset quality gate

An authentic photograph is not automatically a cinematic featured asset. Approve only after inspecting the full frame for identity, useful composition, contrast, resolution and license. Existing weak frames must be recorded as unresolved art direction, not relabelled as approved cinematic art. Do not substitute another team's stadium or generated venue/player imagery. All existing integrity, accessibility and research functionality remains required.

## Iteration results

The new presentation components reuse the existing insight, script, market and prop readers. They are opt-in adapters, not replacement research/model pipelines. Production Game rendering remains on its existing branch of the component.

| Anchor at 1536×1024 | Approved reference | Previous implementation | Revised implementation |
|---|---:|---:|---:|
| Games hero top | 154px | 226px | 159px |
| Games hero height | 502px | 570px | 502px |
| Games matchup cards top | 722px | 866px | 726px |
| Game hero left / top | 128 / 0px | 156 / 0px | 128 / 0px |
| Game hero height | 454px | 460px | 454px |
| Primary research top | 509px | 650px | 508px |
| Featured Players section top | 814px | below viewport | 814px |

The first matched render exposed driver cards overlapping the Featured Players header. The header is now constrained to the first two columns, with the player cards spanning the full width below the drivers. Games card buttons clipped their containers; reducing image-to-team spacing fixed the overflow. The first mobile Players render still placed Model & source context before the list because the legacy child-order rule won; an explicit direct-child rule moves it below primary content. The initial list is four players, prioritizing existing reviewed photography, with all remaining players one tap away and the market snapshot immediately below.

Mobile comparison: the left/right mock app display areas are cropped from the supplied 1024×1536 image at (24,80)-(498,1496) and (535,80)-(1008,1496), excluding decorative device hardware/status bars. They are normalized to a 390×1165 CSS app viewport; rounding changes the source aspect ratio by less than 0.4%. The implementation is rendered at that viewport, not stretched from a shorter screenshot. Ordinary phone and small iPhone viewports are tested separately. Source technical disclosures no longer precede Game Read or the primary player list.

## Curation and unresolved visual gaps

- Arrowhead: new authentic corner-bowl night frame, Kj1595, CC BY-SA 4.0. Its lighting and fireworks are in the original photograph. No sky replacement or synthetic relighting. Credit, source, modification and share-alike terms accompany the served image files in `public/sift2/venues/LICENSE.md`. The core resolver must validate KC at Arrowhead before the curated image can be selected. A unit regression and archived-home browser capture verify this; it is never shown for the current KC away fixture.
- No suitable dusk interior equivalent to the mockup was found for Soldier Field. Its former washed-out frame, Baltimore's grey-sky frame and Lambeau's field-level frame are rejected for featured use; honest team identity is the fallback. They remain available in the established source registry and secondary context rather than being silently relabelled as premium assets.
- The new Arrowhead night photo is stronger than the old daytime image, but still has haze and less dramatic colour separation than the mockup. An editorial-quality, licensed dusk corner-bowl photo remains the exact missing asset. The current publication has no fully researched KC home fixture: the available KC home example is archival and has honest missing-research states. No research values were copied into that example from another game.
- Player action portraits are incomplete. Denver–San Francisco is used for the main comparison because it has approved Bo Nix, Brock Purdy and George Kittle imagery; Christian McCaffrey remains team-branded. Purdy's available warm-up portrait is weaker than the reference's helmeted action portraits. Chicago's wide Tyson Bagent warm-up frame is excluded by the featured-player curation layer. Many Miami/Minnesota players and Kansas City stars have no approved current-team assets in the existing manifest.
- Branded cards cannot match the reference's photographic four-card slate where approved venue photography is missing. These are visible asset gaps, not a claim that the reference lighting has been achieved.
- Actual supported data determines captions, scripts, market asks and available insights. The reference's percentages, CBS/network labels, game states, scores and illustrative betting prices are not implementation fixtures. No unsupported conditional probabilities were introduced.

## Acceptance separation

Design remains NOT APPROVED. Geometry/density is substantially closer; featured imagery coverage and premium action photography remain unresolved. This pass does not authorize expansion to additional screens. Tests, axe scans and CI are engineering evidence only. No production merge or deployment is authorized.

## Engineering verification

- Unit/integration suite: 96 files, 1,078 tests passed, including two new art-direction regressions. The licensed core registry is preserved; the featured curation layer rejects inadequate frames without changing their identity or inventing a different venue.
- ESLint, TypeScript, E2E production build and dist/base-path checks passed.
- Combined SIFT matrix: 36 checks passed across desktop Chromium, mobile Chromium, iPhone 15 Pro WebKit and iPhone SE WebKit. Includes previous Home/workspace regression checks; no new screen redesign was added.
- After final mobile density/source-disclosure changes: all 12 reference-layout and matched-capture checks were rerun across the same four projects, including axe scans of overview and player snapshots, overflow, primary/deep navigation, filtering, empty search and opening full prop research.
- WebKit ran locally after extracting its required Linux/GLES libraries. No browser or production dependency version was changed. Host requirement preflight was skipped because it cannot inspect that private library location; the actual browser rendered and completed the checks.
- Previous remote CI for baseline 494e653 succeeded (run 38695701787). This milestone requires its own remote CI result. No screenshot baselines were overwritten. Prior specialist baseline discrepancies remain documented in REFERENCE-ACCEPTANCE.md.

Reproduce the comparison with `scripts/sift2/compare.py`, the three original mockups and the matched capture outputs from `e2e/sift2-fidelity-capture.spec.ts`. Review artifacts include source dimensions/crops, geometry JSON, matched desktop/mobile images, normal phone captures and the separate archival Arrowhead asset example. The source snapshot clock is October 4; these are not current odds or live recommendations.
