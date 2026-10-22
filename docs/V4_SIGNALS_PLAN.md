# Milestone 2B plan: the native v4 Signals feed

Status: **built** in Milestone 2B (see `docs/V4.md`, "Signals (milestone 2B)"). Owner decisions applied: passes shown in a collapsed group with the publication's reason; every sport `useAllOpportunities` returns; only the app's own ranking and grouping; side-aware Board comparisons approved; NBA projection engines untouched. Board is not part of it.

## What the tab is

A phone-first ranked feed of the app's published opportunities: the contracts and sides a sport publication itself flags for
research (or, where its authority permits, as actionable), each with the same research sheet the rest of v4 already opens.
It replaces the Signals hand-off screen (`V4Handoff tab="signals"`). It does not create, score, re-rank or re-label anything: the
opportunity layer produces the rows and their order, and v4 draws them.

## Data: reuse only

| Need | Existing piece |
| --- | --- |
| All sports' opportunities, repriced by live quotes | `useAllOpportunities(now)` (`src/opportunity/load.ts`) |
| Order | `compareOpportunities`, `featureOpportunities` (`src/opportunity/rank.ts`): tier, price current, variance, calibration, worst-case edge, EV, edge share, kickoff |
| What counts as live | `isLive` (not PASS); PASS rows are first-class and are shown in a "Passed" group, not hidden |
| Per-sport verdict when nothing qualifies | `SportVerdict` / `passReasonFor` (the precise missing prerequisite, in the publication's words) |
| Exact side and eligibility | `matchSignal` / `ineligibleWhy` (`src/v4/signal.ts`, from PR #113): the same rules the prop sheet uses, so a row can never be "valid" in one place and not in another |
| Detail | `ResearchSheet` and `useResearch` (`src/v4/ResearchSheet.tsx`), unchanged |
| Chips | `SignalChip` and the v4 authority words (`src/v4/words.ts`) |
| Save | `SaveControl` with `sideExtra` (`src/v4/saveSide.ts`): the selected side is always recorded |
| Lifecycle, freshness | `lib/lifecycle`, `live/freshness` (15 / 30 minute quote rule) |

No new data pipeline, storage, endpoint or projection. The only new modules are view code and a pure feed model.

## Screen

1. **Header:** "Signals", the count of live research signals and passes, and the oldest research/quote capture on screen
   ("Prices as of …"), stated as a time, not a colour.
2. **Filters** (one row, 44px controls, state in the URL like Props): sport, game, status (Actionable / Research candidate /
   Watch / Passed), and a side filter only where it is meaningful.
3. **Feed:** one card per `Featured` thesis group (the app's own grouping), lead first, related expressions collapsed under it
   with their opposed/same-game flags exactly as `featureOpportunities` computes them. Each card shows: the contract in bet
   words (`contractWords`), the side (YES/NO) in text, the game and kickoff, the publication's authority word, the price
   (ask, fee-inclusive break-even, quote age) and the publication's fair value as separate labelled figures. Never one blended number.
4. **Tap** opens `ResearchSheet`. Save is in the card and the sheet, side-aware.
5. **Groups:** Live signals, Watch, Passed (collapsed by default, with each pass reason).
6. **Empty and error states:** a sport that publishes nothing shows its `passReasonFor` sentence; a feed that cannot be read says so
   per sport and is never rendered as "no signals".

## Integrity rules (all inherited, restated)

- A signal is shown as valid only when `matchSignal`'s rules hold *now* (clock-driven, not just at load): a card whose price
  goes stale or whose window expires moves to "no longer qualifies" with the reason, live, while the screen is open.
- YES and NO are different positions. A NO opportunity is never labelled with the YES contract's title, and its Save is a different item.
- Kalshi prices and the publication's model value are always labelled apart; the difference is a number with its sign, never graded by size.
- No new positive-edge claim: v4 prints only the publication's own fair value, EV and bet-up-to, and only beside a verified price,
  fee, and the publication's uncertainty/calibration note. Where the publication reports `MARKET_BEATS_MODEL`, the card says so first.
- Pregame research is frozen after kickoff: started games leave the live group and Save is disabled with the standard explanation.
- Orientation `MISMATCH` or unverified identity is never presented as a signal (the opportunity layer already passes these).

## Build order

1. `src/v4/signalsModel.ts` (pure): filter/group helpers over `Featured[]` plus `matchSignal`-based "valid now" state. Unit tests first.
2. `Signals.tsx`: header, filters (URL state), feed cards, groups, empty/error states; reuse `ResearchSheet`.
3. Cross-links: Home and Game signal chips deep-link to the feed filtered to that game; the prop research sheet links to
   the feed card for the same contract when one exists.
4. Tests: unit (grouping, filters, side-aware save, staleness), Playwright at 390×844 / 375×812 / 375×667 phone + desktop
   (feed, filters, sheet, side-aware save, stale-while-open, PASS group, empty sport), axe, 44px targets, overflow.
   Fixtures reuse `e2e/propSignals.ts`-style route interception (`recommendations.json`) and the NHL fixture that already carries
   real research candidates.
5. Docs and screenshots; draft PR targeting `feat/v4-props-explorer`'s branch lineage, stop for review.

## Decisions for the owner

1. **Passed rows:** shown in a collapsed "Passed" group (recommended, because PASS is a first-class result) or hidden from v4?
2. **Sports:** every sport `useAllOpportunities` returns, or NFL, NHL and MLB first? (CFB Value Watch rows are `WATCH`, not priced signals.)
3. **Sort control:** only the app's published order (recommended), or also "by kickoff"? No sort by a derived edge.
4. **Side-aware My Board:** PR #113 changes the classic Board's saved-price comparison to read the saved side. Confirm that is
   acceptable before Board work begins.

Out of scope for 2B: the v4 Board, push alerts, any new ranking, any approval or projection change.
