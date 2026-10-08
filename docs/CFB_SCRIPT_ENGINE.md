# CFB on Sift: the CFB Script Engine game page

CFB uses the same Sift product — hero, tabs, panels, script cards, survival cells, the live price token,
the market board — driven by a different depth of data: the CFB Script Engine published by
`chmoses98/cfb-edge-finder` (`docs/SCRIPT_ENGINE.md` there has the methodology).

## Where the data comes from

`event_research.extensions.script_engine` on each CFB event document. `extensions` is the contract's
open slot, so no contract type changed and other sports are untouched. `src/lib/scriptEngine.ts` decodes
it (metric tables with interned legends, compatibility strings, ladders) into typed objects. A payload
without `script_generation` (`{status, reason}`) means the engine could not build a read; the page keeps
the generic view and says why.

Prices are **not** in the payload. Each expression (a contract side) is joined by ticker to the published
market row, overlaid with live quotes exactly like every other sport, and the side's own ask is shown
(YES ask for YES, NO ask for NO).

## The page answers three questions, separately

| Section | Question | Source |
|---|---|---|
| **SIFT Read** | What does the football matchup say? | `sift_read` — sentences generated upstream from structured findings, before any price was read |
| **Matchup Edges** / Matchup tab | Where are the unit mismatches? | `matchup_profile` — every metric with raw, adjusted, rank, universe, direction, games, prior weight, source, observation time, window, quality |
| **Likely Game Scripts** / Game Script tab | How can the game unfold? | `game_scripts` — Primary, Secondary, Alternate, Danger; causal chain steps cite the findings behind them |
| **Bets That Survive Multiple Scripts** | Which contracts express those paths? | `script_market_map` — per-script compatibility (supported / partly / contradicted / no claim), survival counts, fit labels; ladder rungs with identical support collapse to one row |
| **Why this bet** | Why this row? | scripts supported and contradicted, the settlement condition in team names, the findings and metrics behind them, the side's price, correlation with the other featured rows |
| **Data Confidence** | What is and is not known? | the evidence gates, known / unknown lists, artifact hash, data cutoff, methodology version |

## The CFB home and the V2 Quick Read (research-signals contract)

The CFB home (`src/views/cfb/CfbHome.tsx`) and the V2 game overview (`src/views/game/CfbOverview.tsx`) read one more
document beside the board: `cfb_research_signals/1.x`, published by the cfb-edge-finder conductor at
`research-signals/signals/cfb_research_signals.json` (`SportConfig.researchSignalsUrl`, re-read every 4 minutes
while a CFB screen is open; `src/data/cfbSignals.ts`). `src/lib/cfbSignals.ts` decodes it and holds every rule:

* **Home** — Top CFB Signals (Value Watch = every Moderate CONTROL game while `moderate_control.status` is
  `VALUE_WATCH`; Strongest football edges; Market Disagreement; close games; pace / scoring spots), the
  research-signals status, single-select filters and SIFT priority / time sort persisted as `?f=…&sort=time`,
  one compact card per game of the slate (the earliest season week with a game to play) and the complete
  schedule. No per-game research document is read. Without the signals document the schedule still renders
  with a notice.
* **SIFT priority** — 1 Value Watch · 2 Strong CONTROL · 3 Market Disagreement · 4 other CONTROL · 5 close or two
  environment claims · 6 other claims · 7 no read; kickoff order within a tier. Never return, popularity or price.
* **Prices** — only the CONTROL side's own game-winner YES ask (a live quote when newer than the contract's
  capture), never 1 − the other side; `PRICE_1_00` reads "No offer below $1", anything else without an
  executable ask "Price unavailable". **Market Disagreement**: Strong CONTROL and that ask below
  `market_disagreement.rule.below_cents` (85¢); no price, no flag; Moderate CONTROL never.
* **Game page (claims_v2 payloads)** — Quick Read (the contract's one-sentence read, claim chips, the price, the
  signal), Best Research (historical empirical range: median, Middle 50%, Middle 80%, wins as "N of M past
  games"; 2–4 ✓ edges), and a Deep Dive whose six sections start closed and hold every earlier panel. A payload
  without claims_v2 keeps the earlier overview.

Tests: `tests/cfbSignals.test.ts`, `tests/cfbHome.test.tsx`, `tests/cfbGamePage.test.tsx` (fixture
`tests/fixtures/cfb/signals/cfb_research_signals.json`, ten games matching the app fixture) and `e2e/cfb.spec.ts`.

## Scoring markets are research only

The engine's margin ranges define its archetypes ("control" = wins by 7–24), so moneyline and spread
contracts can be supported or contradicted by a script. Its total and team-points ranges are drawn
around a descriptive, uncalibrated scoring baseline (`band_authority: UNCALIBRATED_DESCRIPTIVE`), and a
retrospective check found them mis-placed (cfb-edge-finder `docs/SCRIPT_ENGINE.md` §15). Until they
pass that repository's promotion gate, every total and team-total contract arrives as
`RESEARCH_UNCALIBRATED` with the single label *Scoring: research only*, and Sift:

* never lists one under **Bets That Survive Multiple Scripts** and says so in a note under the table;
* shows the scoring environment (*Elevated* / *Suppressed*) on the script tab, but marks the point
  ranges "descriptive" with a caption that they do not support any total or team-total market;
* shows a total-band market disagreement as an observation, never as evidence of value.

Margin markets (moneyline, spread) can be supported only by a script whose margin band is authorised. Each
script publishes `margin_authority_evidence`: the matchup findings that let it state its margin. Scoring and
pace findings never qualify. The script tab shows them under **Margin authority**. A script that states no
margin (for example a shootout whose closeness the data cannot resolve) says so instead.

## Language rules (enforced by tests)

* Scripts are **ranked, never given likelihoods** — V1 publishes none and Sift shows no percentage.
  "3 of 4 scripts" is never "75%".
* Labels describe fit with the frozen scripts: Best expression, Multi-script, Script aligned, Aggressive,
  Script dependent, Narrow script, Contradicted, Low data confidence, Market disagreement. Never "+EV",
  "edge", "value", "lock" or a fair price (`tests/scriptEngine.test.tsx`, `e2e/cfb.spec.ts`).
* Every page carries "Research only": no validated CFB pricing source exists.
* Data confidence describes the evidence, never how strongly a side is favoured.

## Tests and fixtures

`tests/fixtures/cfb/app/latest` is a trimmed real CFB publication (Georgia at Alabama, LSU at Kentucky,
Stanford at Notre Dame, Tennessee at Arkansas, and a game the engine could not match), produced by
`scripts/make_cfb_fixture.py` from a cfb-edge-finder `app/latest`. Vitest reads it from disk
(`disk://cfb`); Playwright serves it in place of `raw.githubusercontent.com` (`e2e/cfb.spec.ts`), with
smoke, journey, axe and no-horizontal-overflow checks and visual baselines for the overview, script and
matchup tabs on phone, desktop and iPhone.
