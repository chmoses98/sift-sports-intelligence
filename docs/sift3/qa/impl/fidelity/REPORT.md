# Screenshot fidelity against the locked designs

Reference: `docs/sift3/redesign/out/<id>.png` (780x1688, 390x844 at 2x). The four root tabs have no locked image.
Implementation: production build (`npm run build:e2e`, served by `vite preview`), Chromium (Linux) with the Pixel 7 profile at 390x844, and again at 375x667 for all 30 scenes. America/New_York, en-US.
Data: the committed real-document fixtures only (`fixtures/real` through `e2e/support/feedSource`, each design on its own family and pinned clock; `freshQuotes` restamps quote observation times only). Offline.

Left = locked reference, right = implementation:

* `390x844/<ID>-390x844.jpg` (30)
* `375x667/<ID>-375x667.jpg` (30; the 390 reference is shown beside it as a hierarchy check only)
* `before/<ID>-390x844.jpg` (the seven screens changed by the fixes below, as they were)

Scene table: `e2e/support/fidelityScenes.ts` (30 scenes). It drives the baselines and the comparison images.

Regenerate:

```
V3_FIDELITY_OUT=/tmp/f390 V3_PROJECTS=v3-phone V3_SERVER=preview V3_PORT=4391 SIFT_CHROMIUM=<chrome> \
  ./node_modules/.bin/playwright test -c playwright.v3.config.ts --workers=1 e2e/v3-fidelity.spec.ts
# optional: V3_FIDELITY_VIEWPORT=375x667   V3_FIDELITY_ONLY=P1,SD2
python3 scripts/v3-qa/fidelity-compare.py /tmp/f390 <out>
```

Classes: (a) data differs from the mockup's placeholder data, expected; (b) owner-approved change, expected; (c) genuine defect. Only (c) was changed.

## Fixes (class c)

| # | Defect | Fix |
|---|---|---|
| 1 | Games tab glyph was a basketball; the locked tab bar is a globe | `src/v3/ui/Icon.tsx` (also the Explore Games category tile) |
| 2 | **Bug:** the Player compact bar never appeared after the hero scrolled away on a fresh load (P2's locked image is that state). `useGone` attached its IntersectionObserver during the loading skeleton and never saw the hero | `useGone(ref, on, present)` in `player/Header.tsx` and `Player.tsx`. The `v3-player` bookmark test clicked `.first()` Save, which after a scroll is the hero's button now covered by the bar; it clicks `.last()` |
| 3 | Exact-contract sheet (PD6): four figures wrapped 3+1, ticker was a shrink-wrapped chip, neighbouring rungs two-line with a coloured price | `ui/ContractSheet.css`: tiles `minmax(76px,1fr)` on one row at 390 and 375, full-width ticker, single-line `label price history` rows, price in text colour |
| 4 | Game hero (G1): names, logos and status line too large and misaligned | names 22 to 19px, logos 66 to 56, muted 13.5px status, centred columns, min-height 232 to 196 (`screens/game.css`, `GameDetail.tsx`) |
| 5 | Game tabs: raised gradient and a 3px glowing underline; locked is cyan text with a thin underline | 2px underline, no glow |
| 6 | Team compact bar truncated "Dallas Cowbo..." | tighter gap, name 17px, smaller chip padding: fits at 390 (still ellipsises at 375) |
| 7 | Team availability "Out" chip was red; locked TR5 is neutral outlined (only IR tinted) | `team.css` |

Behaviour, URL state, 44pt targets, axe and the hit-target audit are unchanged by these.

## Per design

| Design | Differences |
|---|---|
| P1 | (a) rank, weather, total, Props badge, window counts; fifth statistic pill clipped as a scroll cue. (b) compact identity row and the five tabs. (c) Games glyph, fixed (1) |
| P2 | (a) 6.5 line, 11 rungs with a SIFT value on every rung. (c) compact bar missing in the scrolled state, fixed (2). The mid-drag handle is not a baseline; touch drag is covered by `v3-player` |
| P3 | (a) counts and chips. (c) shared sheet puts the 44pt close button where the mock has Reset and starts lower, **not fixed** (decision 2) |
| P4 | (a) Receiving yards "-, not approved yet" because the ledger HOLDS NFL receiving yards; "3 of 4 approved"; availability |
| G1 | (a) nicknames, no ESPN network. (c) hero scale and tab state, fixed (4, 5). (c?) the rail under the hero is the approved Signature Game Switcher (logo tiles) where the locked image has single-line text chips: decision 1 |
| G2 | (a) "Recent form" plus the locked "Weekly trend is locked" card, since no per-game series is published |
| G3 | sticky collapsed scoreboard with arrows replaces the locked compact header after scroll (decision 1); (a) "Plays per drive" vs "per game" |
| PD1 | (b) 48h/7d/All horizon bar and caption; (a) counts |
| PD2 | (b) horizon bar, header bookmark; (a) Soonest default vs Sort: History, the day's chips |
| PD3 | (a) different expanded prop, no compare tray |
| PD4 | (a) counts. (c) shared sheet close button and Reset on separate rows, sheet starts lower, **not fixed** (decision 2) |
| PD5 | (a) the day's props; structure and spacing identical |
| PD6 | (c) tiles, ticker and rungs, fixed (3). Remaining (c): the locked head shows a team logo circle left of "Player: line"; the shared sheet has no avatar slot (decision 3) |
| TR1 | (a) credited venue photo vs gradient, "Away" subtitle (no O/U published), prop counts |
| TR2 (Raw) | (c) bar truncation, fixed (6); (a) 12 offense and 11 defense published rows |
| TR3 | same bar fix; (a) extra locked "Home and away statistics" card |
| TR4 | identical beyond data |
| TR5 | (c) red Out chips, fixed (7); (a) players and prop counts |
| TR6 | (a) only Overview and Form tabs (Profile, Players and Schedule are not published for NHL; asserted by `v3-team`), venue photo |
| SD1 | identical; extra "Side by side" link (entry to SD3) (b?) |
| SD2 | (b) observation list and touch scrub, taller chart, 44pt By-season rows |
| SD3, SD4, SD7 | identical (SD7: "Maple Leafs" vs "Leafs", data) |
| SD5 | threshold stepper where the mock has a caption (b?, decision 4) |
| SD6 | (a) published related list |
| Roots | no overflow or clipped control at 390 or 375; long tennis names ellipsise by design |

375x667: no horizontal scroll; the Player hero yields to the compact bar by design; chip rails scroll; the Team bar still ellipsises "Dallas Cowboys".

## Baselines

`e2e/v3-fidelity.spec.ts`: 30 baselines in `e2e/v3-fidelity.spec.ts-snapshots/<ID>-v3-phone-linux.png`, 390x844 at 1x, viewport shots, 3.9 MB.
Generated in a Linux sandbox (Chromium 1243) against the production build; CI Linux is the same family, macOS or another Chromium build is not expected to match. WebKit projects skip the spec. No workflow was added.
Deterministic: fixtures only, family clocks, `freshQuotes`, Welcome dismissed in storage, time zone and locale pinned, animation, transition and caret removed, fonts ready and images decoded, sheets scrolled to top. Four consecutive runs gave 30/30 with 0 differing pixels. Threshold `maxDiffPixelRatio` 0.002 (about 660 of 329k pixels) for cross-machine anti-aliasing: a moved card, missing element, wrapped or truncated label or changed colour token exceeds it.

## Open decisions for the owner

1. **Game switcher vs locked G1/G3.** Locked: single-line text chips and a plain compact header. Implemented: the earlier-approved Signature Game Switcher (logo tiles, in-play scores, "Delayed", sticky collapsed scoreboard with arrows, picker). Replacing it changes behaviour pinned by `v3-game`, `v3-scores` and the tap matrix. Recommendation: keep.
2. **Shared sheet header (P3, PD4, PD6).** Always a 44pt close button with Reset inside the body; the sheet starts about 12% lower than drawn. Moving Reset onto the title row needs a header slot in `ui/Sheet.tsx` with state from the sheet body (touches four sheets, accessibility). Not done.
3. **PD6 avatar.** The shared contract sheet has no avatar slot.
4. **SD5 threshold stepper and SD1 "Side by side" link** are additions to the locked images: keep or remove?
5. NHL team page has two tabs (data); locked TR6 draws five.
6. No iOS status bar, home indicator or iOS Safari rendering (Chromium on Linux). The on-device pass in `DEVICE_CHECKLIST.md` is still required.
