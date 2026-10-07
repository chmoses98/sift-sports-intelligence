# Sift — Sports Intelligence

**Live:** https://chmoses98.github.io/sift-sports-intelligence/ (installable on iPhone: Share → Add to Home Screen)

Sift is a sports research web, not a picks app. Open a game and follow the evidence: team → opponent →
metric → the full league comparison → a historical game → a player → his markets → save what matters to the
research tray → **COPY FOR CHATGPT** a compact handicap packet for the final judgment.

> Projections and model prices are evidence, never recommendations. Sift never ranks "best bets".

Sift is the consumer layer over the Edge Finder research infrastructure. It reads the published
`edge_finder.app.v1` contract (authored in `chmoses98/kalshi-bet-router`) straight from each sport repository —
no server, no database, $0/month.

Sift runs on **two clocks**: research (the sport publications, hours) and markets (current Kalshi quotes,
seconds to minutes, refreshed without any redeploy). Every quote shows its availability, its real age
(FRESH < 15 min ≤ AGING ≤ 30 min < STALE) and whether it is live or the publication's capture, and every
packet refreshes its markets before it is built. See docs/ARCHITECTURE.md → *The market clock*.

## V1 scope

* **NFL** — the complete vertical slice: slate, game, team, metric, league ranking, historical games, player,
  compare, market, research tray, handicap packet.
* **MLB** — beta, on its live publication (`chmoses98/edge-finder-api` `main`): home, slate, team, player and metric
  screens through the generic views, and a game page built from the generic parts (`src/views/mlb/`): game lines in
  baseball language (moneyline, run line, totals, first five innings, run in the 1st) with the live market clock, the
  publication's model inputs side by side, price history, an innings section, and **Player Props** — pitchers then
  hitters, by player and stat, a ladder of thresholds with the market's implied probability and, only where the
  publisher released a projection (`market.extensions.player_prop`, `mlb.player_prop.v1`, `*_PROJECTION` statuses),
  the model's probability labelled "Model" / "Model (research)"; every other status is shown with its reason. No edge
  is derived for a prop. MLB is in the live-quote feed and the Production check. Tests: `tests/mlb.test.tsx`,
  `tests/live/feed-mlb.test.ts`, `e2e/mlb.spec.ts` on `tests/fixtures/mlb` (the real 2026-10-07 publication; only the
  player-prop objects are synthetic).
* **CFB** — beta. The game page is the CFB Script Engine read: a market-blind, opponent-adjusted matchup,
  Primary/Secondary/Alternate/Danger scripts (ranked, no likelihoods) and the contracts that survive them
  (`docs/CFB_SCRIPT_ENGINE.md`).
* **NHL** — a research vertical on its live publication: NHL_SCRIPT_V1 game scripts, script survival,
  RESEARCH-ONLY research candidates, opponent-adjusted team strength, skater and goalie pages and a
  learning scorecard (`docs/NHL.md`).
* **CBB** (NCAA Division I men's basketball) — its own sport, on the CBB repo's `app-data` publication (built from
  its immutable pre-tip projection archive): sport home with the prospective research status, the real D-I slate
  ("projection pending" until a game enters the 30-hour capture window), game pages (projected score with model
  uncertainty, roster truth and the expected rotation, opponent-adjusted matchup, model comparison with frozen roles,
  integrity verdicts, provenance), team pages, metrics and full D-I rankings. Research only: no recommendations,
  no wagers, no market rows until real Kalshi game contracts map to games. Screens: `src/views/cbb/` (a presentation
  adapter behind the generic routes); tests: `tests/cbb.test.ts`, `e2e/cbb.spec.ts` on synthetic fixtures in
  `e2e/data/cbb/`.
* **NBA, Soccer, Tennis** — real live health and capability manifests; explorer screens come later.

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173/sift-sports-intelligence/
npm run lint && npm run typecheck && npm test
npm run build:e2e && node scripts/check-dist.mjs
npx playwright test    # Chromium phone/desktop + WebKit iPhone: journey, market gates, degraded, a11y, visual, smoke
                       # (WebKit needs `npx playwright install webkit`; CI runs everything)
```

## Docs

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack choice, hash routing on GitHub Pages, data access,
  live vs snapshot sources, performance budget, the packet port, PWA, deployment, accessibility.
* [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — the *signal from noise* visual system (live at `#/design`).
* [docs/INSIGHTS.md](docs/INSIGHTS.md) — the insight layer: matchup edges, context notes, scheme pairings,
  props to watch, news importance, research findings, and the nflverse history layer behind them.
* [docs/NHL.md](docs/NHL.md) — the NHL vertical: data consumed, screens, script survival, research candidates,
  raw vs opponent-adjusted, learning gates, scorecard.
* [docs/DATA_GAPS.md](docs/DATA_GAPS.md) — what the publications cannot support yet, and the upstream NFL
  explorer defect Sift works around.

## Data refresh scripts

* `scripts/refresh-nfl-snapshot.sh` — rebuild the NFL research snapshot from the live NFL publication with NFL's
  own exporter (the deploy workflow runs it every 3 hours; it is a no-op once NFL publishes its explorer).
* `scripts/make_golden_packets.py` — regenerate the golden packets with the contract's Python builder after a
  snapshot refresh.
* `scripts/history/build-nfl-history.mjs` — the player/team history layer from nflverse (run by every deploy).
* `scripts/make_nhl_fixture.py` — trim a real NHL `app/latest` publication to a few games for the NHL tests
  (`tests/fixtures/nhl`); rerun it when the NHL research payload changes shape.
* `scripts/make-icons.mjs` — render the PWA icons.
* `scripts/publish-live-quotes.mjs` — the live-quote feed (NFL, NHL and MLB; run every 3 minutes by `live-quotes.yml`).
  Staleness is per sport: a stale or unreadable sport is left out (its games are not written; `index.json`
  `sport_status[]` / `excluded_sports[]` say why) while the healthy sports publish; nothing is written (last-known-good
  stays) only when no sport carries a current game with markets. See docs/ARCHITECTURE.md → *Quote feed*.
* `scripts/make_mlb_fixture.py` — build `tests/fixtures/mlb` from the real MLB publication (synthesized postseason
  board and `mlb.player_prop.v1` examples where production has none yet; see the script's docstring).
* `scripts/kalshi-probe.mjs` — read-only real-provider probe (run by `live-provider-smoke.yml`).
* `relay/` — the read-only Kalshi quote relay for sub-minute quotes (Vercel Function; the earlier Cloudflare Worker is legacy). Deploy steps and limits: `relay/README.md`.
