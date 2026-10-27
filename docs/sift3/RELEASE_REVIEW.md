# SIFT 3.0 implementation: release review (draft, 2026-10-27)

Branch `claude/sift3-impl` (PR #149, draft, stacked on #147). Nothing here is merged or deployed. This is the owner's single page for what exists, what was proven, what was not, and what needs a decision. Per-milestone evidence is in `IMPLEMENTATION_STATUS.md`; visual comparisons are in `qa/impl/<screen>/`.

## What is built (locked designs, real published data)
Player Research P1-P4 (five tabs + Replay), Stat Detail SD1-SD7, Team Research TR1-TR6, Game Detail and Matchup G1-G3, Prop Discovery PD1-PD6, saved research, the shared contract sheet, one quote gate. Foundations (addresses, history, sheets, scroll, navigation targets, capabilities) and the data layer underneath.

## Evidence on the merged tree (a48b6fba and later)
| Check | Result |
| --- | --- |
| `tsc -b`, `eslint` | clean |
| Full `vitest run` | 161 files, 1917 passed, 3 skipped |
| Chromium phone, sample-data suites (v3, foundations, saved, accessibility) | 56/56 (axe on 13 screens: no critical, serious or moderate finding) |
| Chromium phone, real published documents (each against its own captured cache) | Game + quote gate + hit targets 57/57, Stat 32/32, Team 23/23, Player 31/31, Props 27/27 |
| WebKitGTK (real WebKit engine, not iOS Safari) | shared journeys 48/48; per-screen checks 19 to 48 each, run by the screen workers |
| Tap targets | every milestone's rows exercised against real components with Back restoring address and scroll; the cross-screen `elementFromPoint` audit proves no target's centre resolves to another target |
| Freshness | `tests/v3/noFreshness.test.ts` parses all of `src/v3` and fails on any age, "stale", "last known" or timestamp wording |

## Not proven
- iPhone Safari on a device (safe areas, momentum scroll, keyboard, touch on WebKit). WebKitGTK has no touch emulation; touch scrub is verified in Chromium emulation only.
- Playwright's own WebKit (the `v3-iphone` projects): its download host is blocked in the build sandbox; they run in CI.
- Performance on a phone and a mobile connection. Measured in Chromium on a desktop CPU: the Props list keeps ~14 rows in the DOM of ~800, scroll p95 18 ms; first paint loads ~113 documents (~40 are shell baseline) and transferred bytes were not measured.
- NHL and MLB Player screens on real documents; hockey Game Detail on real documents.
- Pixel baselines (visual parity is a side-by-side review, not a pixel diff).
- The real-document e2e specs read a disk cache of captured published documents (not committed, 1.4 to 7.8 MB compressed per family) on a fixed clock; another machine or CI cannot run them without a captured bundle. Decision below.

## Honest limits visible to users
Prices show only when a current Kalshi quote exists (approved age table); today the feed alone leaves most list prices at "—" until the relay-first quote track (PR #148) is reviewed and wired. NFL receptions (PROMOTED) shows a model estimate; receiving yards (HELD), NHL (RETAINED) and NBA (awaiting live inputs) show "—" with reasons. Related statistics are derived in the client until the backend backlog replaces them; player-level league ranks and historical ranks are locked rows. Trends, Log and Replay on Player have no locked mockup and are labelled as inferred.

## Decisions needed
1. **Graphite recolor** of Home, Games and the other pre-existing screens (one visual system) pending your iPhone approval; the Explore tab now roots at Prop Discovery as the walkthrough shows.
2. **Inferred Player tabs** (Trends, Log, Replay placement) and the **compact hero under 700 pt tall**.
3. **Prop Discovery default sort** is Soonest (no bulk History summary exists); History sort loads up to 30 logs, more on request. Universe horizon 48 h; the 5 MB of injury documents it fetches could be deferred.
4. **Stat Trend bars** are 27 pt wide (12 bars in 338 pt); 44 pt would need a scrolling chart.
5. **Delayed scores** are withheld rather than labelled "last known"; **saved prices** are not kept on saved cards (a saved price is an old price). Say if either should return, labelled.
6. **Committed real-document fixtures** (about 15 MB compressed in total) so CI and reviewers can run the real-data specs, or keep them local.
7. **PR #148 and #150**: relay `Date` exposure (wrapper beyond the one line?), closed-market price policy, the monitor drill in real CI (needs your approval), heartbeat in the live loop.

## Isolation
No change to `main`, v4, SIFT 2.0, classic, workflows, ledgers, model activation, `src/live` or `relay/` on this branch. Quote engineering is PR #148, the relay header is PR #150, each isolated and unmerged.
