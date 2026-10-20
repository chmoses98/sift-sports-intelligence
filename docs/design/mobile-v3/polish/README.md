# SIFT mobile design, v3.2 polish

Status: **design only, for review.** This is a visual refinement of the approved mobile-v3 prototype. Structure, navigation, the live game presentation, the signal sheets and the UX are unchanged. Nothing under `src/`, `public/`, any workflow, the live-score work or the deployed site was touched. No merge, no deploy.

Branch `design/mobile-v3-polish`, branched from `design/mobile-v3-refinement` (both earlier design branches are untouched). The refinement canvas on claude.ai is also untouched; this pass lives in `source/` and is not published there.

* Sources: `source/` (same artboards as the refinement, plus `sift.css`). Changed files: `sift.css`, `Main.dc.html`, `Game.dc.html`, `System.dc.html`.
* Captures: `screenshots/` (390 by 844 and 375 by 667), and `screenshots/before-after/` (v3.1 on the left, v3.2 on the right).
* The design language board (`screenshots/20-design-language-board.jpg`) carries the new type scale and a sixth rule.

## What was weak, and what changed

| Weakness in v3.1 | Change in v3.2 |
|---|---|
| Flat ink ground, no depth; headers were opaque slabs. | Ground is ink with a faint ice horizon. Headers and the tab bar are frosted glass. Grouped surfaces get a top highlight. Ink ramp slightly deeper (`--bg #05080D`). |
| The game hero was a generic blue wash; the clubs had no presence. | The hero is lit by the two clubs: coral from the top left, blue from the top right, ink between. Crests 60 to 68 px, leading score has a soft halo. Ruled lines quieter. |
| Segmented controls (All 5 / Bills 3, All / Scoring / Big, cents / % / US / Dec, Why / Sources) barely showed which option was on. | One selected state everywhere: a raised tile lit from above on a darker inset track, white text. |
| Selected chip and day were flat white blocks, the loudest things on Home, louder than the scores. | A lit paper tile with a soft shadow. Same contrast, less shout. |
| Active tab was only a colour change. | Lit indicator on the bar edge, glow on the active icon, bold 12 px label, press response on the icon. Game tabs have one underline that slides between tabs. |
| Captions at 11 px, secondary text at weight 400 on near-black. | Captions 12 px (the floor) with one shared label style. Secondary text and notes at weight 500. |
| Play time column wrapped inconsistently (`Q02 4:12` on one line, `Q02 4:50` on two). | Fixed 80 px column, never wraps. |
| The signal chip overshot the 16 px gutter on Home rows. | Row padding corrected; the chip's pill now ends on the gutter. |
| Market tiles flat; the "line" row in a ladder was a faint tint. | Tiles have a gradient and lit edge, bigger crest, price glow, and a gold progress bar with glow. The line row carries a gold edge. |
| Primary button flat. | Ice gradient with a lit top edge and a soft glow; presses in. |
| Nothing moved except the sheet height. | Live dots and the followed live ring pulse; rows rise in; scrim fades in; chips, days, tabs, buttons and rows answer a press; selected states cross-fade. All stops under `prefers-reduced-motion` (the existing global rule). |

Not changed on purpose: layout, copy, navigation, the data states and "Sample" labelling, colour roles (model is ice, market is gold, risk is coral), imagery.

## Checks

| Check | Result |
|---|---|
| axe-core, WCAG 2.0 to 2.2 A and AA plus best practice, 12 states (`source/review-scripts/axe.mjs`) | **0 violations** in every state |
| Overflow, truncation, 390 by 844, 375 by 812, 375 by 667 (`layout.mjs`) | None, in 9 states each. One regression was caught and fixed: with a larger crest, the Final scoreboard overflowed at 375. The scoreboard now steps down with a container query on the app width (so it also works in the canvas frame). |
| Touch targets | Unchanged from v3.1: 44 px or more, except the segmented controls, which are 38 px tall with a 44 px hit area, and the sheet handle at 40 px. |
| WebKit (WebKitGTK 2.52, `wk.py`) | No overflow in 8 states. Tabs move panels, the sheet opens to 612 px, closes on Escape, expands to 764 px and drags back to 612 px, as before. Glass headers, container query and the sliding underline work. |
| Contrast | Text tokens are unchanged or lighter (`--tx3` is a touch lighter). Secondary text moved to weight 500. axe reports no contrast violations. |

## Limits

* WebKitGTK is WebKit, not iOS Safari. Safe-area insets, rubber-banding, the keyboard and the iOS touch pipeline were not exercised. **Test on a real iPhone.** `backdrop-filter` frosting and the animations should be felt on a device, not judged from stills.
* Motion was checked by reading the CSS and by the screenshots after load (rows have finished rising). No recording was made. Reduced motion was not exercised in a browser.
* VoiceOver, Dynamic Type and a light theme: not done.
* Score, clock, play and stat values remain labelled samples. Nothing here changes what data exists.

## Decisions for review

1. Keep the selected chip and day as a lit paper tile, or move selection to a neutral raised surface like the segmented controls (quieter, a little less legible at a glance).
2. Keep coral top-left and blue top-right in the hero as stand-ins for the clubs. In production they would come from the club colours, with a fallback for clubs without one.
3. Frosted headers and tab bar show scrolling content faintly. Raise the opacity if that feels busy on a device.
4. Whether to publish this pass to the canvas as a new version.
