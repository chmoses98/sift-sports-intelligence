# Sift — Sports Intelligence

**Live:** https://chmoses98.github.io/sift-sports-intelligence/ (installable on iPhone: Share → Add to Home Screen)

Sift does the research so the viewer doesn't have to. It identifies, evaluates, explains and prioritizes
evidence-supported betting opportunities across eight sports, makes uncertainty transparent, and leaves the
decision with the viewer. Every screen is built as progressive disclosure: the opportunity (or an honest PASS) →
the plain-English reason → the evidence and the counter-case → the complete research (team → opponent → metric →
league comparison → history → player → markets → research tray → **COPY FOR CHATGPT** packet).

> A PASS is a successful outcome when the evidence is insufficient. Sift never manufactures a recommendation: an
> opportunity is shown only with the publication's own authority (actionable, research candidate, research only),
> its executable price, the fee-aware break-even and the strongest reason it could lose. Unvalidated models stay
> research-only until their publication promotes them.

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
* **NHL** — a first-class research vertical on its live publication: a hockey slate (all 32 club logos, goalies,
  win probability, projected total, most likely script), and a game page that tells the story — how the game is most
  likely to play, the seven NHL_SCRIPT_V1 game scripts, the goalie matchup, market fit with a contradiction check,
  special teams and player research — with honest freshness, frozen pregame research after puck drop and a review
  of finals. RESEARCH ONLY; skater and goalie pages and a learning scorecard (`docs/NHL.md`).
* **CBB** (NCAA Division I men's basketball) — its own sport, on the CBB repo's `app-data` publication (built from
  its immutable pre-tip projection archive): sport home with the prospective research status, the real D-I slate
  ("projection pending" until a game enters the 30-hour capture window), game pages (projected score with model
  uncertainty, roster truth and the expected rotation, opponent-adjusted matchup, model comparison with frozen roles,
  integrity verdicts, provenance), team pages, metrics and full D-I rankings. Research only: no recommendations,
  no wagers, no market rows until real Kalshi game contracts map to games. Screens: `src/views/cbb/` (a presentation
  adapter behind the generic routes); tests: `tests/cbb.test.ts`, `e2e/cbb.spec.ts` on synthetic fixtures in
  `e2e/data/cbb/`.
* **Soccer** — a first-class vertical on its live publication: a home organised by competition (every fixture with
  the model's 1X2 read and its research candidates) and a match page that leads with the strongest research
  expression from the soccer script engine (fee-aware break-even, fair probability, worst-case edge, the script that
  beats it) or an honest PASS, then six scripts with simulation shares, the opponent- and schedule-adjusted matchup,
  every market by family with the model beside the price, rest, head-to-head and settled calibration. RESEARCH_ONLY
  throughout (`src/lib/soccer.ts`, `src/views/soccer/`; tests on `tests/fixtures/soccer`, a trimmed real publication).
* **Tennis** — an individual sport with its own home (tours, tiers, tournaments; matches as two players with the
  model's chance where one exists), match pages (three model generations, sharp-reference triangulation, serve and
  return evidence, every market, the publication's research candidates and why they are not bets), and player pages
  (surface-aware Elo, serve/return ability). Doubles carry no model by the publication's rule (`src/lib/tennis.ts`,
  `src/views/tennis/`; `tests/fixtures/tennis`).
* **NBA** — a home and game pages on its live publication: the slate with club identity, the opponent-ranked
  matchup, the injury report, projected rosters and every market as prices only, with the publication's own
  out-of-sample study (the market beats the model in 8 of 8 families) shown as the reason no NBA opportunity is
  surfaced (`src/lib/nba.ts`, `src/views/nba/`; `tests/fixtures/nba`). Logos are fetched once by
  `scripts/teams/fetch-nba-logos.mjs` in the team-logos workflow.

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
* [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — the *signal from noise* visual system (live at `#/design`); Barlow is the
  one typeface.
* [docs/SLATE_PRIORITIES.md](docs/SLATE_PRIORITIES.md) — the NFL home's Slate Priorities rail (every rule, field and
  threshold) and the plain-English game-script titles.
* [docs/CFB_SLATE_PRIORITIES.md](docs/CFB_SLATE_PRIORITIES.md) — the CFB home's Slate Priorities rail (value vs CONTROL,
  every rule and field), CFB school names (one identity, applied at the data layer) and the CFB Barlow weights.
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
* `scripts/make_sport_fixture.py` — trim any real `app/latest` publication (URL or directory) to a few events for
  the tests (used for `tests/fixtures/{soccer,tennis,nba}`).
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
