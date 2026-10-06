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
* **MLB** — beta, through the same generic screens on its live publication.
* **CFB, NBA, NHL, Soccer, Tennis** — real live health and capability manifests; explorer screens come later.

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
* [docs/DATA_GAPS.md](docs/DATA_GAPS.md) — what the publications cannot support yet, and the upstream NFL
  explorer defect Sift works around.

## Data refresh scripts

* `scripts/refresh-nfl-snapshot.sh` — rebuild the NFL research snapshot from the live NFL publication with NFL's
  own exporter (the deploy workflow runs it every 3 hours; it is a no-op once NFL publishes its explorer).
* `scripts/make_golden_packets.py` — regenerate the golden packets with the contract's Python builder after a
  snapshot refresh.
* `scripts/history/build-nfl-history.mjs` — the player/team history layer from nflverse (run by every deploy).
* `scripts/make-icons.mjs` — render the PWA icons.
* `scripts/publish-live-quotes.mjs` — the live-quote feed (run every 5 minutes by `live-quotes.yml`).
* `scripts/kalshi-probe.mjs` — read-only real-provider probe (run by `live-provider-smoke.yml`).
* `relay/` — the read-only Kalshi quote relay for sub-minute quotes (Vercel Function; the earlier Cloudflare Worker is legacy). Deploy steps and limits: `relay/README.md`.
