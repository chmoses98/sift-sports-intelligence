# Owner-review closure audit

The owner's review had no numbered list. These 19 rows consolidate the original brief's sections J–AH.
Each row gives two statuses:

- **Sift-side**: work this repository can do.
- **Upstream**: work only the NFL publication or other infrastructure can do.

"n/a" means there is no upstream part.

| # | Owner request | Overall | Sift-side | Upstream | Remaining requirement |
|---|---|---|---|---|---|
| 1 | Script fit and multi-script survivors (J, K) | UPSTREAM BLOCKED | COMPLETE | BLOCKED | A joint margin × total × team-points simulation, for exact fit on totals, team totals, props and periods. |
| 2 | Neutral language instead of "edge" (L) | COMPLETE | COMPLETE | n/a | — |
| 3 | Team form with ranks, not percentiles (M) | COMPLETE | COMPLETE | n/a | — |
| 4 | Historical data and game logs (N) | UPSTREAM BLOCKED | COMPLETE | BLOCKED | Publish 2026 player game logs and per-game team box stats. |
| 5 | Head to head, winner first (O) | COMPLETE | COMPLETE | n/a | — |
| 6 | Closing-line history (P) | COMPLETE | COMPLETE | n/a | — |
| 7 | Injuries on Overview; no Key Information card (Q, R) | COMPLETE | COMPLETE | n/a | — |
| 8 | Position-aware player pages without internal jargon (S, V) | COMPLETE | COMPLETE | n/a | — (game logs are row 4) |
| 9 | Projection distribution and market vs projection (T, U) | COMPLETE | COMPLETE | n/a | — |
| 10 | Matchup charts that can't contradict their labels (W) | COMPLETE | COMPLETE | n/a | — |
| 11 | Matchup maths (X) | UPSTREAM BLOCKED | COMPLETE | BLOCKED | Fix the sign of `advantage_to_offense` in nfl-edge-finder (see `MATCHUP_MATH.md`). |
| 12 | Raw vs opponent-adjusted (Y) | COMPLETE | COMPLETE | n/a | Shown only where the publication has both versions. |
| 13 | Plain metric labels and short definitions (Z) | COMPLETE | COMPLETE | n/a | New registry metrics need a glossary entry. Until they have one, Sift shows the registry's own text and never an invented definition. |
| 14 | Remove "Against whom" (AA) | COMPLETE | COMPLETE | n/a | — |
| 15 | Quiet price freshness (AB) | PARTIAL | COMPLETE | n/a | Owner approval of the visual baselines; this is the reason it was PARTIAL last time, and nothing has changed it. |
| 16 | Trust, model performance, past wagers (AC, AH) | PARTIAL | COMPLETE | BLOCKED | Out-of-sample, per-period model reporting beyond the cumulative scorecard. The owner's wager ledger stays private. |
| 17 | Game Script deep view (AD) | PARTIAL | COMPLETE | BLOCKED | Sift shows every published script input. Fuller team impacts and fit for non-margin markets need row 1's joint simulation. |
| 18 | Wong teasers and parlays (AE) | PARTIAL | COMPLETE | BLOCKED | Leg-level combined pricing and a correlation model. |
| 19 | Game lifecycle and live data (AF, AG) | UPSTREAM BLOCKED | COMPLETE | BLOCKED | A live provider for score, clock, quarter, possession and live stats. The Sift-side pregame freeze is done. |

## Outside Sift: upstream and infrastructure

1. A joint margin × total × team-points simulation output.
2. The `advantage_to_offense` sign fix in nfl-edge-finder.
3. 2026 player game logs and per-game team box stats.
4. A live data provider and its wiring: score, clock, quarter, possession, live stats.
5. Out-of-sample, per-period model reporting, with the scorecard's CLV sign convention documented.
6. Teaser and parlay correlation modelling, and combined pricing.
