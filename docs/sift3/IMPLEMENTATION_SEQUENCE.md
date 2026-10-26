# From approved designs to the working app: sequence and dependencies

Status: proposal for review. Nothing here is started. Everything below stays on `#/v3` (opt-in), behind PR review, with no production merge or deploy until its own review gate passes. PR #147 stays a draft.

## What is approved and what the walkthrough proved

Approved and locked: Player Research P1 to P4, Game Matchup G1 to G3, Prop Discovery PD1 to PD6, Team Research TR1 to TR6, Stat Detail and League Rankings SD1 to SD7, the ink and graphite design system, the navigation contract, and the quote policy (`QUOTE_DELIVERY.md`).

The interactive walkthrough (`docs/sift3/redesign/walkthrough.html`) joins them on real published data and was checked in Chromium by `walk.test.mjs` (320 assertions): five journeys, 78 tap targets, each landing on the correct destination, and Back restoring filters, tabs, windows, lines, expanded rows, comparison selections, selected games and scroll. It proves the **navigation model and state model**, not the production code. Not proven: iPhone Safari behaviour, hockey tabs beyond Overview and Form, completed-game pages beyond a score stand-in, performance at full data size.

## What already exists in v3 (so we build on it, not around it)

`src/v3` already has Home, Games, Game Detail, Team, Stat, Player, Explore, Following, Settings; data hooks (`useSlate`, `useTeam`, `useStat`, `usePlayer`, `useGameExtras`, `useSearch`); a Lens component; a Sheet; bar and line charts; scroll memory keyed by path and query (`state/scroll.ts`); saved research (`saveResearch` in `state/prefs.ts`); and the live quote store with relay-first, feed-fallback providers (`src/live`). The work is therefore mostly **re-composition and new data joins**, not a new app.

## Principles for every step

1. **State lives in the address.** Every screen's selections (tab, window, line, filters, selected team or highlight, expanded prop, comparison ids, sort) are encoded in the URL query. The existing scroll memory is keyed by path plus query, so Back restores scroll and state with no new mechanism, and Saved research becomes "route plus query" (an extension of what `saveResearch` stores today). Sheets are open or closed by a query flag that Back clears.
2. **One navigation component set.** Team, player, statistic, prop, game and price targets are shared components that render the right link and carry the right query; screens never hand-build a route. This is how the navigation contract is enforced and tested.
3. **One quote rule.** Every price on every screen goes through `quoteUsable(quote, context)` (maximum ages as approved) and renders "—" or the contract's unavailable state otherwise. No screen reads a price directly.
4. **Honest data gating.** Each sport declares what it publishes and whether it is current. A section renders only when supplied and current. The approval ledger still gates the SIFT model lane. MLB team pages stay off until current.
5. **Design parity is checked, not eyeballed.** Each screen gets a Playwright pixel and structure baseline against the locked mockup state, plus the walkthrough's tap-target matrix ported to the real components.

## Sequence

| # | Milestone | Delivers | Depends on | Size |
| --- | --- | --- | --- | --- |
| 0 | **Foundations** | Ink and graphite tokens in `v3.css`; shared atoms (lane marks and the three-lane readout, percentile track, league dot plot, margin bars, hit bars, sheets, segmented control, locked-row and note patterns); the navigation components; URL-state helpers; the sport capability declaration; test harness for baselines and the tap matrix | Nothing | M |
| Q | **Quote items 1 to 3** (parallel track, its own branch and review) | `quoteUsable`; relay-first scopes for visible rows and the selected contract; forced refresh on contract open; feed heartbeat; 15-minute monitor; reliable-price-availability measurement | Foundations for the shared function only; no UI | M |
| 1 | **Data layer** | Ranking documents by metric and window; metric registry and definitions; team profiles with windows (season, last 6, last 34); per-game series; availability; schedule as the start-time authority; derived related statistics (temporary); cross-game prop index joined from the per-game quote feeds | 0 | L |
| 2 | **Stat Detail and League Rankings (SD1 to SD7)** | Ranking with highlight and next opponent, Trend, Compare (teams; players from game logs), About with all limits and methodology reachable, hockey ranking | 0, 1 | M |
| 3 | **Team Research (TR1 to TR6)** | Overview, Profile, Form, Schedule, Players for NFL; Overview and Form for NHL; W–L–OT record; MLB gated | 0, 1, 2 (every rank links to SD) | L |
| 4 | **Game Detail and Matchup (G1 to G3)** | Header and tabs, tilt rows with the 15-point Even rule, expanded unit, SIFT Lens collapsed with evidence, key matchups, Overview and Props tabs for every game | 0, 1, 2, 3 | L |
| 5 | **Player Research (P1 to P4)** | Overview with three lanes, windows, bars, alt-line sheet, research filters with live counts, Matchup tab, saved state; MLB shown as price-only | 0, 1, 2, Q for the contract sheet | L |
| 6 | **Prop Discovery (PD1 to PD6)** | Home shelves, list with search, sort, filters and 335-row virtualised list, expanded prop, comparison, exact-contract sheet with fee and break-even and the missing-price state | 0, 1, Q, 2 to 5 as destinations | L |
| 7 | **Saved research and shell** | Saved list restoring route plus query; Home and Games integration; bottom-nav roots; Back behaviour across roots | 2 to 6 | S |
| 8 | **Hardening and review** | iPhone Safari pass with the existing WebKit QA scripts; accessibility (44 point targets, labels, focus); performance budgets; baselines frozen; regression run of classic and v4 | All | M |

Why this order: Stat Detail is the destination of every rank, so it goes first; Team Research and Game Detail then link into it; Player Research and Prop Discovery are the heaviest data consumers and depend on the quote work, so they come last, which also lets the quote track finish and be reviewed first.

## Dependency graph (what blocks what)

```
Foundations ──┬─> Data layer ──> Stat Detail ──> Team Research ──> Game Detail ──┐
              │                       │                                           ├─> Prop Discovery ──> Saved + shell ──> Hardening
              │                       └──────────────────────────> Player Research ┘          ^
              └─> quoteUsable ──> Quote track (items 1 to 3: scopes, heartbeat, monitor) ─────┘
```

## Data and backend dependencies

| Need | Needed by | Today | Plan |
| --- | --- | --- | --- |
| Rankings and registry for every statistic | SD, TR | Published (149 ranking documents for NFL and NHL used here) | Lazy per statistic; cache |
| Related-statistics list | SD6 | Empty in the registry | Derived in the client now; backend backlog item 1 replaces it |
| Player rankings, historical ranks | SD5, SD2, SD7 | Not published | Locked rows; backend backlog |
| One schedule source for start times | TR, G, PD | Explorer and Kalshi disagreed once | Use the explorer; Kalshi times never shown as start |
| Overtime flag per NHL game | TR6 | Not published | Record derived from points percentage; backlog |
| MLB current team data | TR | Cache stops in late August | Gated off |
| Game-log fan-out for 335 props | PD | Logs exist per player | Lazy for visible rows; cache; no up-front fetch |
| Prices | PD, P, G | Relay 0.7 s median; feed up to about 8.5 min | Quote track; the feed alone cannot meet the approved list limits |
| Bulk relay endpoint | PD at scale | Investigated, not built | Decide after the quote track ships (item 4) |

## Review gates (nothing merges or deploys without them)

1. **Per milestone:** unit and component tests; Playwright baseline against the locked mockup state; the ported tap-target matrix passing; lint and type-check; classic and v4 regression suites unchanged; WebKit pass for the milestone's screens.
2. **Quote track:** call volumes re-measured, failure behaviour demonstrated (relay down, 429, both down, old observation with HTTP 200), production isolation confirmed (no change to `live-quotes.yml` for items 1 and 3, a file addition only for item 2).
3. **Data honesty:** a check that no number appears without a published source, and that every locked row names its reason.
4. **Release:** v3 stays opt-in on `#/v3`; preview deployment first; the owner decides any default switch separately.

## Decisions needed before milestone 0

1. **URL-encoded state** as the single state mechanism (recommended), including the exact query vocabulary and a version tag so saved links survive changes.
2. **Saved research schema:** route plus query plus a title and chip summary, replacing the current route-only record (migration: old items open the route with defaults).
3. **Feature flag granularity:** one `#/v3` opt-in (recommended) or per-screen flags.
4. **Order preference:** the sequence above, or Player Research earlier if a price-led experience matters more than rankings.
5. **Quote track timing:** start now in parallel (recommended), since Player Research and Prop Discovery wait on it.
