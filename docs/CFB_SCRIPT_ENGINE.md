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
