# Discover beyond player props — real-data input matrix and plan (PR #172, review item C)

Discover is **player-props-only today** and now says so on its first screen. This is the matrix of what the publications actually carry, measured 2 Nov 2026 from one pregame event per sport (`event_detail.markets`, all `OPEN`).

| Family (published `market_family`) | NFL CHI@SEA (753) | NBA PHI@CHI (814) | CFB BUFF@MOH (110) |
|---|---|---|---|
| Player stat ladders | 376 (50%) | 200 (`player_points/rebounds/assists/threes/pra/steals/blocks/stocks/dd/td`) | 0 |
| Game spread / total | 98 / 87 (all periods) | 33 / 29 full game | 31 / 19 |
| Period spread / total | included above (1H 2H 1Q–4Q) | 90 / 90 (1H 2H 1Q–4Q) | 21 / 13 (first half) |
| Team total (full and period) | 49 | 38 + 22 | 21 |
| Moneyline / game winner | 2 | 2 | 2 (+3 first-half) |
| Period winner | 18 | 18 | — |
| Other (first TD, race-to-N, margin, BTTS, leader…) | ~120 | ~40 | 0 |

So **~half of an NFL game's contracts, and every CFB contract, are not player props**; the current Discover cannot reach them. (`player_unknown` in NBA = 185 `…PROT` ladder series that duplicate the named stat ladders; the parser excludes them on purpose — confirm with the publisher before treating them as separate markets.)

## What evidence each family can honestly be wired to today

| Family | Evidence available now (source) | Gap |
|---|---|---|
| Game total / team total | Team scoring history: team profile `games[].result` (NFL/NHL; NBA stale), projected scoring and pace in `event_research` / game Overview (`GameOverview`, `intel/`), CFB Script Engine totals | Need a chart of last-N combined/team points vs the line (same `HitBars` component) |
| Spread / moneyline | Margin history from the same `games[].result`; model vs market (shown on game Overview, kept apart) | Margin chart with the line; opponent-adjusted rating needs `adj_*` ranks (NFL only) |
| Period (1Q/1H/2H…) total / team total / winner | NBA: `game_log` has q1–q4 columns (stale). NFL/CFB: no per-period scoring history published | **Blocked on data**: period history is absent for NFL/CFB; only the script engine's 1H/1Q expressions exist (CFB) |
| First TD, race-to-N, margin buckets | None | Price-only; list but label "no research published" |

## Slices (each independently reviewable)

1. **M1 – Market model.** One normalized `MarketRow` (family, period, side, line, YES ticker, ask via the same gate) built from `event_detail.markets`, reusing `data/adapt.ts` line building and `research/gameMarkets.ts`. Unit tests on the three real documents above. No UI.
2. **M2 – Game markets inside Discover.** A Discover scope switch `Players | Game & team` (address `scope=`); rows grouped by family and period; selecting a row opens the same research panel (`Peek` pattern): line marker on a last-N points/margin chart, rung/line switcher, exact contract, price reason note (this PR). NFL and NHL first (scoring history exists), CFB totals via Script Engine, NBA only when the ingest lands.
3. **M3 – Period markets.** Needs published per-period scoring (upstream); until then show price + script-engine scenario only, labelled.
4. **M4 – Game page parity.** The Game Props tab becomes "Markets" with the same family switcher and the same research-in-context route.

Nothing in this PR claims M1–M4.
