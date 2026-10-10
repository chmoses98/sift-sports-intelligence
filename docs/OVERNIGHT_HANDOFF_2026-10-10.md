# SIFT overnight rebuild — handoff, 2026-10-10

Starting point: `main` @ `ef993ab` (PR #42). Work: PR [#43](https://github.com/chmoses98/sift-sports-intelligence/pull/43),
branch `claude/sift-overnight-rebuild-wmble8`. Screenshots (real browser, live publications, 1440 px and 390 px):
`docs/screenshots/2026-10-10/`. Ledger: `docs/IMPLEMENTATION_LEDGER.md`. Weather audit: `docs/WEATHER_AUDIT.md`.

Production deployment and verification facts (deploy run, production-check run, deployed SHA) are recorded in the
PR conversation and the final report, because they happen after this file is merged.

## What changed

**Five destinations** replace the sport-first header: Home · Games · Explore · Intelligence · My Board (glass tabs on
desktop, a 5-tab bar on phones; sports through one strip on desktop and a sheet on phones; one search).
Breadcrumbs collapse when going back up a path.

**Home** is a broadcast command centre:
- today's games rail;
- a featured matchup hero (licensed venue photo first, model and market glass panels from published fields only);
- an intelligence preview;
- research lab shortcuts;
- a My Board preview.

The previous home (the full opportunity board) is now **Intelligence → Market board**.

**Games** is a day × sport grid with venue art. **Explore** has:
- the research tools;
- a team grid;
- the Stats Lab (every published ranking, opponent-adjusted first);
- a player finder;
- the **Season navigator** (NFL 18-week grid; daily calendar elsewhere);
- the **Combined Prop Explorer** (NFL).

**Game pages** gain:
- the compact Player Prop Explorer (in place of "Props to Watch");
- the Script Comparison Studio;
- the Market Comparison Studio on the verdict strip.

**Intelligence**:
- the **Terminal** (discoveries with significance and betting evidence rated separately, connected panels, presets, pins);
- **Model Pulse** and the **Advanced Model Lab** (each publication's own evaluation records).

**My Board** replaces the research tray UX:
- saves grouped by game, with notes;
- saved-market snapshots compared only with the same contract;
- game-status and newer-research notices;
- a per-game analysis packet;
- one-tap "Run NFL / MLB / …" slate packets.

## Owner fix list (23 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Green/yellow/red matchup rankings | DONE | Top 30% green, middle 40% amber, bottom 30% red, with dot + tier words (`src/styles/insight.css`, `RankBadge`); opposing units coloured from the player's side (`against`), tested in `tests/rankbadge.test.tsx`. |
| 2 | Remove duplicate search bars | DONE | One search control (header button / phone icon → palette); Home's separate filter field removed; production check asserts exactly one. |
| 3 | (originally unspecified) | — | Left blank by the owner; no requirement invented. |
| 4 | Reproduce "Run NFL", "Run MLB" | DONE | My Board → Run a full analysis: one tap builds each sport's current slate packet (same packet contract, markets refreshed first). |
| 5 | Is weather in the projections? | DONE (audit) | No for NFL, CFB, Soccer, Tennis; partial for MLB (wind in hitter props only); indoor sports N/A. Tiles say "Context only · not in the projection". `docs/WEATHER_AUDIT.md`. |
| 6 | Connect mismatches to props, scripts, markets | PARTIAL | Terminal discoveries link a mismatch to its game, matchup tab, same-game findings and model evidence; prop explorer shows each prop's opposing-unit rank; game overview pairs edges, scripts and props. No automatic mismatch → specific contract mapping (needs the market-expression engine). |
| 7 | Premium season navigator | DONE (NFL) | 18-week grid, selected team's results, week tiles, weekly EPA trend; daily calendar for other sports. |
| 8 | UI closer to approved mockups | PARTIAL | Glass tokens, illuminated active states, broadcast hero, rails, tiles, discovery cards, studios. Judged against the written spec; no mockup images were available in this session. |
| 9 | Extensively filterable props | DONE (NFL) | Prop explorer filters: game, team, position, category, projection vs line, over-price band, priced only; compact explorer on the game overview; player page stat selector drives every section. |
| 10 | Bet/unit size when supported | BLOCKED (by evidence) | No publication publishes authoritative sizing; nothing is invented. The UI shows the publication's bet-up-to where published. |
| 11 | Over/Under and conventional language | PARTIAL | Prop surfaces use Over/Under; contracts keep the publications' own titles (team to win, spreads). A full Kalshi YES/NO → betting-term rewrite of every market label was not done. |
| 12 | Replace PASS with No Edge / Watch / Fade | DONE | Back · Watch · No Edge on cards, verdict strips, discoveries and comparisons (`src/lib/decision.ts`); Fade never shown (no publication supports an opposite side). |
| 13 | Unattended monitoring and diagnostics | PARTIAL | Freshness discoveries (stale capture, unreadable publication); production check extended to every new destination. No new scheduled model diagnostics. |
| 14 | Hierarchical breadcrumbs that collapse | DONE | `nextTrail` truncates below a reopened screen; destination crumbs; tested (`tests/trail.test.ts`, `e2e/rebuild.spec.ts`). |
| 15 | Explain rationale in plain language | PARTIAL | NHL thesis keys in plain words; decision word with its basis; terminal "how this could be wrong". Other publications' rationale text is unchanged. |
| 16 | Stop implausible projections becoming confident recommendations | DONE (guard) | A model–ask gap of 25+ points is flagged with identity / start / quote / model-record checks and never strengthens the evidence word (`src/opportunity/scrutiny.ts`). |
| 17 | Tennis extreme edges | DONE (guard) | Market-beats-model rows read No Edge; extreme-gap scrutiny; the live settled record (n 35,448, Brier 0.1865 market vs 0.2145 model on 2026-10-10) replaces stale hard-coded numbers. |
| 18 | Replace the research tray with My Board | DONE | `src/views/board/*`; contract tray and packets unchanged. |
| 19 | Premium slate layouts | DONE | Games grid, Home rail, season week tiles. |
| 20 | Projection credibility and public trust | DONE | Model Pulse / Model Lab from published records; per-sport verdicts; never the wager ledger. |
| 21 | Less "research only" jargon, limitations kept | PARTIAL | New screens use plain words with limitations one tap away; older sport screens keep their wording. |
| 22 | Today's games near the top | DONE | Home rail directly under the masthead. |
| 23 | Higher-quality, more prominent visuals | PARTIAL | Featured venue hero, venue-art tiles, charts (calibration, trends, price ladder, matchup strength, comparison bars). No new photography was added. |

## Eight sports (verified in a real browser on live publications, 2026-10-10)

- **NFL**: Home hero (Texans at Titans, licensed Nissan Stadium photo, shadow-model and market panels). Game overview with compact prop explorer, Scripts tab with the comparison studio, prop explorer, season navigator, Model Pulse/Lab (payout error 0.1679 model vs 0.1502 market, n 25,324).
- **NHL**: games grid and rail, plain-word thesis lines on candidates, Model Pulse/Lab (calibration_v1 by family).
- **CFB**: rail and grid; Script Engine pages unchanged; Pulse says the model publishes no probabilities.
- **MLB**: no games on 2026-10-10. Pulse explains that its record scores wagers, not the model.
- **NBA**: grid; Pulse reads the out-of-sample study (market better in every family).
- **CBB**: grid and rail filter; Pulse reports the prospective state (N = 0).
- **Soccer**: grid, rail, discoveries; Pulse reads calibration rows (validated pool preferred).
- **Tennis**: grid, rail, live settled record on cards and pages; Pulse/Lab with the Pinnacle benchmark and the v2 walk-forward.

## Model and data integrity

- No recommendation, probability, stake, limit or historical result was invented. Every number on the new screens is a published field or a stated arithmetic on one (the fee-aware break-even).
- Authority limits are unchanged: research-only rows stay research; "Back" appears only for ACTIONABLE rows.
- Quote freshness, settlement semantics and the live-quote clock are unchanged. Saved-market changes compare the same ticker only.
- Script shares are labelled as simulation shares; CFB scripts stay ranked, without probabilities.
- Model Pulse reads only evaluation records, never `performance.json` or `settlements.json` (the owner's wager ledger).

## Tests

- `npm run lint`, `npm run typecheck`: clean.
- `npm test`: 60 files, 749 tests, all passing.
- Playwright (local Chromium phone + desktop, non-visual): 381 passed, 2 failed. The failures were fixed and the affected specs re-ran green (86/86).
- WebKit iPhone and the visual baselines run on CI (see PR #43).

## Known limitations

- The prop explorer is NFL-only; MLB and NHL props stay on their game pages.
- The season navigator shows scores only for the selected team.
- Model Lab has no feature ablations or score time series, because none are published.
- My Board is local to the browser, with no sync, and it says so.
- No new venue photography was added.

## Next, in order

1. **Market-expression engine contract.** An upstream document that names the game thesis and ranks contracts. The Market Comparison Studio is ready to read it.
2. **Script-conditional player distributions.** The prop explorer can switch by script once the simulator publishes them.
3. **MLB and NHL prop explorers.** Extend the combined explorer to their prop structures.
4. **Model-evidence time series.** Publish scorecards per week so Pulse can show trends.
5. **League-wide season scores.** A light league results document so the season grid shows every score.
