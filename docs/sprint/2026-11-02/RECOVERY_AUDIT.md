# SIFT recovery sprint — audit and status (2026-11-02, issue #171)

All counts below were measured against the live publications on 2026-11-02 ~06:00 UTC, not assumed.

## 1. NFL player props — "absent" is not a parser defect

Method: `npx vite-node scripts/audit-props.ts <event_detail.json> AWAY HOME` runs the app's own `parseGameProps` over a published `event_detail` and counts every excluded contract by reason.

| Stage | Count |
|---|---|
| NFL board rows | 103 (89 FINAL, 13 `UNKNOWN` = Sunday games already played, 1 `SCHEDULED`) |
| Pregame NFL games with markets | **1** (CHI @ SEA, Mon night) — the other 13 are past kickoff, so props are correctly withheld |
| Markets in CHI @ SEA document | 753; **376** are `player_stat` ladders, all `OPEN`, all with a valid ask |
| Contracts parsed into props | 372 (4 are duplicate rungs removed by the parser) → **84 prop rows** in Discover |
| Rows with no team resolved | 0 |

Root cause of the viewer's experience: the Discover default horizon is 48 h and `eligibleGames` keeps only `pregame` games. On a Tue–Wed (next NFL slate > 48 h away) or after the Sunday slate, **no NFL chip existed and nothing said why**. Fixed in this branch: Discover now lists each sport whose props start after the chosen window, with its next game and a one-tap jump to the horizon that reaches it (`sportsBeyond`, tested).

Not a defect but worth knowing: the `UNKNOWN` board status lags (board generated 02:29Z, markets captured 01:53Z); finished Sunday games show as "Awaiting result" on Home until the publication marks them FINAL.

## 2. NBA team research — blocked upstream (not fixable in this repo)

`nba-edge-finder` `explorer/teams/*.json` (30 teams, generated 2026-10-31) are **season 2025-26** with every metric `as_of 2026-06-14`; the 2026-27 board holds only 2 FINAL games. The profile's own `quality.limitations` say: *"Nothing that feeds the research tables runs on a schedule; the ESPN history was last pulled 2026-09-19."* No current pace / ORtg / DRtg exists to wire. The Team screen's lock stays; we do not label last season as current.
**Needed (upstream):** a scheduled box-score ingest in nba-edge-finder that rebuilds team metrics through the latest game. Once `as_of` is current, flip `NBA_STALE` in `src/v3/model/capabilities.ts`.

## 3. Live games

`src/v3/data/live/rights.ts` admits only NBA score/period (SportScore); NFL/CFB/NHL detail and MLB are rights-blocked. Home shows live games as "In play · Score unavailable" with the licensed-feed note. No code change this slice; needs a licensed source decision (see punch list).

## 4. What already worked (reuse, do not rebuild)

The integrated research experience exists: Discover → prop → game-log chart with the threshold line, rung switcher (16+/21+/26+), market vs history vs SIFT-model, opponent unit rank, tap-through to the exact Kalshi contract (`ContractSheet`). Verified on real data: Caleb Williams completions 21+ (48¢ ask, 4/10 last 10, SIFT 47%, SEA pass D 2nd of 28).

## 5. Shipped in this branch

1. **Home All games | Following** filter (`?view=following`): followed teams/games from *all* sports in one time-grouped feed, no sport rail, empty states that explain what to do, Back preserves the filter. Card star is filled when a game is followed through a team.
2. **Navigation Home | Discover | My SIFT** (was Home | Props | Following); "Props" screen renamed Discover; Following screen retitled My SIFT.
3. **Discover horizon hints** for sports whose props start after the window.
4. **Game → Props → research in context**: a prop row on Game Detail opens the Discover research view (history chart with the line drawn, rungs, opponent unit, exact contract) scoped to that game and rung. Verified on real data: AJ Barner receiving yds 30+ (4 of 10 cleared, CHI pass D 13th of 28).

## 5b. Price freshness (observed, important for the demo)

The NFL publication's Kalshi capture for CHI @ SEA is `2026-11-02T01:53:14Z`. About 4.5 h later the quote gate (`src/v3/data/quoteGate.ts`) stopped printing those asks — Discover cards that showed `48¢ ask` at 06:12Z showed `—` at 06:37Z, by design ("never present a stale price as current"). In production the quote relay refreshes the contract; a preview without the relay shows `—` for market price while history and SIFT-model values still render. Screenshots `01`–`04` were taken with fresh captures; `05` shows the gated state. Follow-up: make the "price withheld — capture is N h old" reason visible on the card instead of a bare dash.

## 6. Not done / punch list

- CFB Script Engine presentation review: not started this session.
- Live-state layout for NFL/CFB: blocked on a rights-compliant source.
- NBA team research: blocked upstream (above).
- WebKit: Playwright WebKit cannot be downloaded in this sandbox; only Chromium (Pixel 7, 390×844) was run. iPhone WebKit runs in CI (`playwright.v3.config.ts`).
- Human first-time-user tests (issue acceptance) have not been run.
- Market-centered Game screen: related prop cards inside Game Detail should use the same chart component as Discover.
