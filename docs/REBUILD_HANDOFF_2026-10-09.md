# SIFT rebuild — handoff, 2026-10-09

Decision-first reconstruction of Sift: "Sift does the research so the viewer doesn't have to." Three pull requests,
each merged on green CI and verified on the live site by the production check. Nothing here invents a
recommendation: every opportunity, price, fair probability and bet-up-to is a published field, and PASS is a result.

## Verdict

Sift now opens on what matters today across eight sports, says plainly when nothing qualifies and why, prices every
candidate after Kalshi's fee, and keeps each publication's own authority intact. The three sports that were
health-only (Soccer, Tennis, NBA) are first-class. The NFL props and CFB scripts surfaces are decision shaped.
What remains is upstream (see "Next"), not product scaffolding.

## What changed

| PR | Scope | Merge commit | CI on head | Production |
| --- | --- | --- | --- | --- |
| [#34](https://github.com/chmoses98/sift-sports-intelligence/pull/34) | Un-stuck the Scripts-tab selector (`.stab > .ov-scripts`) with a scroll regression test; Soccer, Tennis and NBA opened as first-class sports on trimmed real publications (`scripts/make_sport_fixture.py`); README philosophy; NBA logos via the team-logos workflow | 1b6ca1a | [37896418535](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37896418535) ✓ | deploy [37899214735](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37899214735) ✓ · production check [37901215846](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37901215846) ✓ |
| [#35](https://github.com/chmoses98/sift-sports-intelligence/pull/35) | Shared opportunity system (`src/opportunity`): WHAT / WHY / EVIDENCE / PRICE / CONFIDENCE / RISK / ALTERNATIVES, fee-aware pricing, documented ranking, PASS first-class; global home rebuilt around today's opportunities and games with filters; Opportunities panel on every sport home; Status page explanation; production check for the board | 4e5a3aa | [37901073908](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37901073908) ✓ (574 e2e) | deploy [37904155951](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37904155951) ✓ · production check [37906228252](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37906228252): 731 ok, 1 upstream failure (MLB publication stale, see below) |
| [#36](https://github.com/chmoses98/sift-sports-intelligence/pull/36) | NFL prop board by family; CFB script → market cards (pays when / loses in / price after fee / thesis rungs); Sift verdict strip on NFL, NHL, MLB, tennis and CBB game pages; CBB home panel; production checks for all three | 75ef16b | [37906030036](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/37906030036) ✓ | deploy and production check: see the final report (run after this document was written) |

Tests at the end: 55 unit files / 687 tests (Vitest), 21 e2e files on Chromium phone + desktop and WebKit iPhone
(CI: 596 acceptance tests passing on the #36 head), axe on every new surface, no sideways scroll at 360–1280 px.

## Eight sports

| Sport | Publication state | Model authority | What Sift shows | Opportunity layer |
| --- | --- | --- | --- | --- |
| NFL | Explorer snapshot, 51 events, 0 recommendations | Research-only. Scorecard: market payout error 0.146 vs model 0.167 on 15,832 player-prop contracts; behind the market on game outcomes; every shadow row `PROJECTABLE_NOT_YET_VALIDATED` | Verdict strip (PASS, with the reason), What Matters, scripts as simulation shares, prop board by family, markets, history layer | PASS by publication; no fair price presented as a limit |
| CFB | Script engine v1/v2 + research-signals contract | Market-blind football read; no probabilities; totals research-uncalibrated | Quick Read, Value Watch / Strong CONTROL / Disagreement, script → market cards, matchup metrics | Value Watch → WATCH; Strong CONTROL → PASS (market already prices it) |
| NHL | Scripts (7, with simulation probabilities), research candidates with bet-up-to and fee per contract | RESEARCH_ONLY; learning scorecard | Verdict cards (pregame), thesis, scripts, goalie matchup, market fit, players | RESEARCH_CANDIDATE with publication bet-up-to; goal props high variance |
| MLB | Board, markets, model prices on some games, 22 recommendation rows (21 PASS, 1 candidate) | HEALTHY; props research | Verdict strip, lines, pitcher and hitter props with statuses | 1 RESEARCH_CANDIDATE (no quote), rest PASS with the ledger's reason |
| Soccer | Script engine v1 (6 scripts), 13 research candidates, calibration | RESEARCH_ONLY | Home by competition, match page led by the engine's best robust expression or PASS, scripts, expressions, matchup, rest, h2h | RESEARCH_CANDIDATE with worst-case edge, bet-up-to, validity window → PASS after expiry |
| Tennis | fair_v1 / gen1 / gen2, external triangulation, 7 research candidates | RESEARCH_ONLY; Kalshi mid beats the model (Brier 0.1776 vs 0.2193 on 15,117 rows) | Home by tour and tournament, match page with model read and "why this is not a bet", serve/return, markets, players | RESEARCH_CANDIDATE, MARKET_BEATS_MODEL, no bet-up-to |
| NBA | 0 model prices; study: market beats model 8 of 8 families | RESEARCH_ONLY | Home slate, PASS card, ranked matchup, injuries, rosters, prices only | PASS (publication prices no contract) |
| CBB | Projections archived; no Kalshi contract mapped | Research status prospective | Home with Opportunities panel (PASS), game with verdict strip, projection, matchup, roster | PASS (no contract mapped) |

## Model and data quality, as published

* NFL pricing is not a validated edge: the publication's own cumulative scorecard has the market ahead on player
  props and on game outcomes. Sift shows the model only beside the market with its support word and never as a
  limit. Simulation distributions are RESEARCH.
* CFB publishes no likelihoods: scripts are ranked by evidence. Sift keeps survival as counts.
* NHL research candidates are RESEARCH_ONLY with a conservative haircut and a published bet-up-to; they stay
  candidates, never actionable, until the learning gate promotes them.
* Soccer and tennis publications say research only; tennis's settled record favours the market.
* NBA and CBB publish no priced opportunity.
* The MLB publication stopped refreshing on 2026-10-09 (a game still LIVE 8 h after first pitch); the production
  check flags this upstream condition as a failure by design.

## Operational notes

* `[update-visual-baselines]` in a commit message makes the Visual baselines workflow render and push baselines; CI
  does not run on that bot push automatically, so re-run the pull-request CI on the new head (Actions → re-run), or
  dispatch the workflow by hand when the marker was on an earlier commit of the branch.
* `e2e/nhl.spec.ts` "direct links, refresh and back/forward" failed once per full local sweep under parallel load
  (a browser error asserted by the fixture) and passed 4 of 4 in isolation; CI has not failed on it. Worth a root
  cause if it recurs.
* The production check cannot be run from a sandboxed container (the site is blocked); read its workflow run.

## Next improvements, in order

1. **NFL opportunities**: the publication recommends nothing; when it promotes a validated family, the opportunity
   layer already reads `recommendations.json` and the verdict strip will show it without UI work.
2. **CFB settlement outcomes**: research-signals capture is `CAPTURE_PENDING` for every game; once settled, the
   Value Watch track record can be shown on the CFB home and on each card.
3. **MLB freshness**: alert on the publication stalling (today's failure) and show the staleness on the MLB home.
4. **Soccer lineups**: candidates carry "lineups unknown" risk until kickoff; surface confirmed lineups when the
   publication adds them.
5. **Tennis start times**: Challenger/ITF rows list nominal times; show verified first-ball when published.
6. **Prop board history**: the history layer covers NFL only; MLB/NHL props would benefit from the same last-five
   games against today's line.
7. **Visual baselines workflow**: trigger CI on the bot's baseline commit (or render baselines in CI) to remove the
   manual re-run.
