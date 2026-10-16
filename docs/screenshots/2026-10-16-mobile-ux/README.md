# SIFT 2.0 mobile UX stabilization — before / after

Captured in Chromium with iPhone 15 Pro emulation (393×852 @2x; one at iPhone SE 375 wide), a fixed clock (2026-10-04 10:00 CDT)
and a synthetic 71-game multi-sport slate (NBA 40, NHL 10, MLB 15, CFB 6) on top of the bundled NFL snapshot (`e2e/slates.ts`).
WebKit could not be installed in the authoring sandbox (egress policy), so WebKit runs of the new `@smoke` specs are CI-only.

| Area | Before | After |
|---|---|---|
| Home, first screen | `before-home-top.jpg` | `after-home-top.jpg` |
| Home, Top Props | `before-home-top-props.jpg` | `after-home-top-props.jpg`, `after-home-top-props-iphone-se.jpg` |
| Games | `before-games-top.jpg` | `after-games-top.jpg`, `after-games-large-slate-scrolled.jpg` |
| Market board | `before-market-board.jpg` | `after-market-board.jpg`, `after-market-board-filter-sheet.jpg` |
| Game tabs while scrolled | `before-game-tabs-scrolled.jpg` | `after-game-tabs-scrolled-with-notch-inset.jpg` (a 47px status-bar inset is simulated) |
| Prop explorer game choice | native `<select>` (see `docs/screenshots/2026-10-10`) | `after-prop-explorer-game-sheet.jpg` |
