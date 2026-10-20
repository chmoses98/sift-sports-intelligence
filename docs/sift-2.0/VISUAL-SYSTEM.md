# SIFT 2.0 visual system: typography and appearance

Scope of this sprint: visual quality and typography only. Layouts, navigation, functionality and imagery are unchanged.
Live-score logic, data pipelines and model integrations are untouched (the live-score work lives on
`claude/live-scores-infrastructure`; this branch changes CSS, one effect in `Shell.tsx`, a codemod and its test).

## 1. What the audit found

Measured on the rendered SIFT 2.0 screens (21 screens, iPhone 393x852 and desktop 1280x900, Chromium, same fixtures before and after):

| | Before | After |
|---|---|---|
| Text rendered under 12px (iPhone, share of characters) | 27.5% | 0.4% |
| Text rendered under 12px (desktop) | 25.8% | 0.2% |
| Distinct rendered font sizes (iPhone / desktop) | 77 / 81 | 26 / 32 |
| Distinct `font-size` declarations in the stylesheets | 206 | 8 steps plus display tiers |
| Controls under 44px tall or wide on touch (iPhone) | 58% (854 of 1480) | 26% (388 of 1480) |
| Weight 500 (UI) as a share of characters | 6% | 22% |

Worst screens before: Intelligence 67% of text under 12px, Props 65%, Season 50%, Players 46%.

Causes:

- **No scale.** Sizes were chosen per rule: 9, 9.5, 10, 10.5, 11, 11.2, 11.8, 12.2, 12.5, 12.8, 13.8, 15.5 px and so on. 1,615 `font-size` declarations and 80 `font:` shorthands, 758 of them below 12px.
- **Three parallel systems.** The legacy `--fs-*`, `--panel*`, `--line*` tokens, the opt-in `--sift2-*` tokens (used by three previews only), and about 500 hard-coded hex colours. `sift2-*.css` alone carried 76 distinct text colours, 96 backgrounds and 54 border colours that differ by a few percent.
- **Thin small text.** Most small text was weight 400 on a near-black ground.
- **Literal Barlow stacks** in 81 places that skipped the metric-matched `Barlow Fallback`, so the font swap moved layout.
- **Radii** of 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 18 and 24px on the same kinds of control.
- **Touch targets** of 20 to 40px on chips, segmented controls, tabs and links.

## 2. The system

`src/styles/sift2-system.css` defines every token under `:root[data-ui='sift2']`. `Shell` sets that attribute for `/design/sift2/*` and removes it elsewhere, so the classic interface, which shares the component stylesheets, is not affected.

**Type scale**, rem on a 16px root: micro 12, caption 13, small 14, body 16, lead 18, h4 20, h3 24, h2 28, plus clamped display tiers for page titles, headline figures and scores. Nothing renders below 12px.

**Faces and weights.** Barlow is the reading face and Barlow Condensed the broadcast face for display numerals and names, both with the `Barlow Fallback` metric match. Weights are 400, 500, 600 and 700, the four that are self-hosted (800 and 900 were already rendering as 700). Caption-sized text takes 500. Scores, clocks, prices and statistics use tabular lining figures.

**Surfaces, borders, text.** Four surface steps, three border steps, three text steps and one accent, replacing the scattered near-duplicates. Text steps are all at least 4.5:1 on every surface.

**Shape.** Radii: 6 (chips, tags), 10 (controls, rows), 14 (cards), 18 (panels, sheets).

**Legacy names remapped.** `--fs-*`, `--line*`, `--panel-line*`, `--text-2/3`, `--r-1..3` take the SIFT 2.0 values inside the scope, so shared components pick them up without a rule of their own.

## 3. How it was applied (and why it is safe)

`scripts/sift2/css-type-snap.mjs` (unit-tested in `tests/css-type-snap.test.ts`) snaps `font-size` and `font:` shorthand values up to 28.8px onto the scale, nearest step with ties going up and anything below 12px raised to 12. `clamp()`, `calc()`, `var()`, `em` and larger display sizes are left alone.

- In files shared with the classic interface the original value stays as the fallback: `font-size: var(--sift2-fs-micro, 0.62rem)`. Outside `data-ui='sift2'` the variable is undefined, so classic renders exactly as before.
- In `sift2-*.css` there is no fallback, because those selectors only match SIFT 2.0 markup.
- Colours, border colours, solid dark backgrounds and radii in `sift2-*.css` were moved to tokens by property-aware rules: neutral blue-greys bucket by luminance, saturated blues map to the accent, and gold, green and coral signal colours are left alone.
- The codemod is idempotent and has a dry-run mode (no arguments).

## 4. Controls, accessibility and motion

- **Touch.** On `pointer: coarse`, primary controls (segmented controls, chips, tabs, buttons, selects, summaries) reach 44px. Small inline controls widen the hit area with padding and cancel it with a negative margin, so layout does not move. Desktop density is unchanged.
- **Press and focus.** `touch-action: manipulation`, no grey tap flash, a 0.97 press response on chips and tabs, one 2px focus ring (`--sift2-focus`) on every interactive element.
- **Motion.** One easing curve for controls, and a global `prefers-reduced-motion` rule for SIFT 2.0 that stops animation and transitions.
- **Contrast.** Token text steps measure 5.4:1 to 18:1 against every surface step (muted `#93abc4` is 7.1:1 to 8.3:1 on cards and the page ground, 5.4:1 on the selected state). Small muted labels that sat below 12px no longer exist.

## 5. Regressions found in review

- The 12px floor made the "Props on game pages" badge on the Props hub overflow its tile at 390px. It now wraps and centres.
- The first colour pass mapped saturated accent blues (eyebrows, links) to neutral text colours; the neutral test was tightened and the pass re-run from the original files. Accent labels and links are back to blue.

## 6. Not done, on purpose

- Layout, navigation, imagery and component structure.
- Pixel work on individual screens. Remaining oddities should be fixed by adjusting a token or a step, not by adding a rule.
- Classic-interface typography. It keeps its values and is reachable through the same fallbacks.
- Weight of display text above 28.8px (hero titles, kickoff times) keeps its authored size.

## 7. Verification

See the pull request for results of lint, typecheck, unit tests, the Chromium e2e suite including the axe specs, and the before/after captures in `docs/sift-2.0/visual-quality/`. WebKit (iPhone) renders are produced by the CI baseline workflow; local WebKit through Playwright is not available in this environment.
