# SIFT mobile design, refinement

Status: **design only, for approval.** Nothing under `src/`, `public/` or any workflow was changed. No merge, no deploy. The first v3 branch (`design/mobile-v3-direction`) is untouched. This work sits on `design/mobile-v3-refinement`, branched from it.

Interactive canvas (Claude Design, private to the owner): https://claude.ai/artifact/HhTd3AprDr8CtBV8V3dvE4
Captures: `screenshots/` (390, 375 by 812, 375 by 667) and `screenshots/webkit/`. Artboard sources: `source/`. Live data findings: [`../LIVE_DATA_AUDIT.md`](../LIVE_DATA_AUDIT.md).

## What changed

SIFT is a sports companion first and betting intelligence second. The models run in the background and speak only through a small chip that opens a sheet.

| Request | Result |
|---|---|
| Home around live and upcoming games, scores, schedules, favorite teams | The hero is gone. From the top: followed teams (live ring, score or next time), a seven-day strip, filters (Following, All, sports), then **Live now** (five games fit on the first screen at 390 by 844), **Upcoming** with times, **Final**. A day with no games says so. |
| Signals throughout, explanations in a sheet | A 44 px chip (pulse icon and count) on any game row or game that has a signal. One shared sheet component opens from Home, Game and Signals, half or full height, with Copy for ChatGPT pinned. It handles market candidates (gauge, fee equation, risks) and matchup reads (rank duel). A game with two signals gets a switcher. After kickoff the chip dims and the sheet says "Frozen at kickoff". |
| Game Command Center as a live experience | Scoreboard hero with big numerals, period and clock, possession line, and a header that collapses to a score bar. Live tab: down, distance and a field strip, signal row, plays (All, Scoring, Big), team stats. Pregame and final variants of the same tab. |
| Four tabs: Live, Matchups, Players, Markets | Live, Matchups (mismatches, scripts, injuries, trends, full research), Players (prop tracker: stat so far against line, pregame projection, Kalshi ladder), Markets (to win, spread, total, price format). Swipe left or right moves between tabs. |
| Ice, gold, coral; Intel becomes Signals | Colors unchanged from v3. The tab bar reads Home, Games, Props, Signals, Board, with a pulse icon. |
| Audit of missing live data | [`../LIVE_DATA_AUDIT.md`](../LIVE_DATA_AUDIT.md) and the "Live data audit" board. No feed was built. |

## Honesty about samples

No score, clock, play, box score or player stat exists in any SIFT source. The live and final views show **sample** values, labelled "Sample" on screen. Each screen has a data state, switchable in the canvas through Tweaks (`feed` on Home, `phase` on Game):

* **Live** (sample): scores, period, clock, plays.
* **Published only** (what exists today): start time and "In play". No score appears. The canvas carries this as its own board.
* **Pregame / final** game variants, each with its own board.

After kickoff, pregame research is dimmed and labelled "Pregame". Prices stay live. No live win probability or live model price is shown. The "Sample" labels are design-only and must not ship.

## Review

Automated and manual checks on the final files. The tools are in `source/review-scripts/`.

| Check | Result |
|---|---|
| Accessibility (axe-core, WCAG 2.0 to 2.2 A and AA plus best practice) | **0 violations** in 12 states (Home live, with sheet, published; Game live, four tabs, pregame, with sheet; Signals with sheet half, full, list). First run found one issue (content outside landmarks). Fixed by making the scroll area `main`. |
| 390 by 844, 375 by 812, 375 by 667 (iPhone SE) in Chromium | No horizontal overflow and no truncated names in 9 states. Home still shows three live rows above the tab bar at 667 high. |
| WebKit | A real WebKit engine (WebKitGTK 2.52, `WebKitWebDriver`, installed with apt because Playwright's WebKit download is blocked in this environment). All CSS used is supported (`backdrop-filter`, `inset`, `gap`, `position: sticky`, `text-wrap`, `overscroll-behavior`, `inert`). Fonts load. No overflow at 390 or 375. Sheet opens (612 px), expands (764 px), drags back, closes on Escape. Tab buttons and swipe work both ways. |
| Touch targets | Chips, tabs, the signal chip and rows are 44 px or more. The sheet handle is 40 px. Segmented controls are 38 px tall with a 44 px hit area (`::after`), which the measuring script reports as 38. |
| Keyboard and focus | Sheet is a modal dialog: the page behind is `inert`, focus moves to Close on open, Escape closes. Visible focus ring on every control. |
| Reduced motion | All transitions are disabled under `prefers-reduced-motion`. Not exercised in a browser. |

Fixes made because of review: chip height 40 to 44, handle 34 to 40, landmark structure, descendant `span` selectors (the runtime wraps text holes in a `span`, which broke a pill and a status dot), the footer line wrapping at 375, "Research frozen" shown before kickoff (now "Research 14h"), duplicated time headers (now one "Upcoming" header), and the type scale (back to ten sizes: 11, 12, 13, 15, 16, 20, 24, 28, 44, 56).

## Limits

* WebKitGTK is WebKit, not iOS Safari. It does not exercise safe-area insets on a device, rubber-band scrolling, the on-screen keyboard, or the iOS touch pipeline. Swipes were driven with pointer events. **Test on a real iPhone before approving.**
* VoiceOver was not run. Labels, roles and live text were checked with axe only.
* Dynamic Type and a light theme were not designed or tested. The design is dark only.
* On 375 by 667 the header, followed teams, day strip and filters take most of the first screen. A short-screen variant (smaller followed-team rings) is worth considering.
* Followed teams are static in the prototype. The Add button does nothing. Storage and sync are not designed.
* Soccer crests are monogram discs and Cook and Moore have initials, because no image exists in the repository.
* Non-NFL rows, scores, plays, team stats and the Sunday live set are examples.

## Decisions for approval

1. Ship the "published only" Home and Game first, and treat the live overlay as a separate release behind the data work.
2. Choose a score provider and accept its terms (see the audit). The owner decides.
3. Keep "Following" as a filter chip plus a strip, or choose one.
4. Accept the signal chip as the only visible sign of the models on game rows.
5. Approve moving the old Scripts, Props, Injuries and Trends tabs inside Matchups, Players and Markets.
