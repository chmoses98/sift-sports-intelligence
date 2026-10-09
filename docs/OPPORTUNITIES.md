# The opportunity layer

Sift does the research so the viewer doesn't have to. The opportunity layer (`src/opportunity/`) is how: one shape for
"something worth a viewer's attention" across every sport, fed only by what each sport publication itself flags, ranked
by a documented rule, and shown with the price, the fee-aware break-even, the publication's bet-up-to, the evidence and
the strongest reason it could lose. **A PASS is a first-class result.** Sift never manufactures a recommendation.

## What counts as an opportunity

| Source | Sport | Status | Price intelligence |
|---|---|---|---|
| `recommendations.json` rows with `status` RESEARCH_CANDIDATE (or an actionable status with a non-research authority) | Soccer, Tennis, NHL, MLB, NFL | `RESEARCH_CANDIDATE` (or `ACTIONABLE` when the publication permits a bet and the price is current and within its bet-up-to) | The row's `current_price` for the selected side, the publication's `fee_per_contract` (else Kalshi's schedule), break-even = ask + fee, the publication's `bet_up_to_price`, `worst_case_edge`, `available_size`, `expires_at` |
| `recommendations.json` rows with `status` PASS / NOT_PLAYABLE, expired validity, or a price above bet-up-to | same | `PASS` with the publication's own reason | shown, never featured |
| `cfb_research_signals` Moderate CONTROL while the contract's status is VALUE_WATCH, with a fresh executable price for the CONTROL side's own game-winner contract | CFB | `WATCH` | the CONTROL side's YES ask; no fair probability and no bet-up-to (the contract publishes none) |
| `cfb_research_signals` Strong CONTROL | CFB | `PASS` ("the market already prices it", the contract's own verdict) | — |
| nothing published | NBA, CBB | sport-level PASS with the publication's reason (NBA: 0 model prices, the market beats the model in 8 of 8 families; CBB: no Kalshi contracts mapped) | — |

Sift adds no probability, no bet-up-to and no stake. Where a publication publishes none (tennis, MLB research candidates,
CFB), the field is null and the card says so. A NO side is priced at the NO ask (1 − YES price as the publication reports
it), with fair = 1 − P(YES) and the NO bet-up-to; never 1 − the other side's bid.

## Fee model

`kalshiFee(p) = roundUp(0.07 × p × (1 − p), cent)` per contract — Kalshi's general taker schedule. A publication's own
`fee_per_contract` wins when it publishes one (soccer, NHL), because some series carry a multiplier.
`breakEven = ask + fee`; `evPerContract = fair − breakEven` unless the publication publishes its own fee-adjusted EV.

## Lifecycle (`lifecycle.ts`)

An opportunity is pregame research. `eventPhase(event, now)` decides, from the caller's clock first and the
publisher's status word second, whether it can still be acted on:

| Phase | Rule | Opportunity |
| --- | --- | --- |
| PREGAME | start (effective start when published) is in the future; or the publication verifies the start as still upcoming, for at most six hours past the nominal time (tennis day placeholders) | as the publication states it |
| STARTED | the start has passed, whatever the status word says (a stale SCHEDULED past kickoff is named as stale), or the publisher says LIVE | PASS: research frozen for review |
| FINAL | the publisher says the game is over | PASS: frozen for review |
| POSTPONED / CANCELLED / SUSPENDED | the publisher's word | PASS with that word |
| NO_START | no usable start time | never ACTIONABLE; a permitted bet is downgraded to a research candidate that says Sift cannot verify the game has not started |

`now` is always the caller's clock in epoch milliseconds (`useNow`); the evaluator throws on a zero or invalid clock
rather than treating every game as pregame. Price state is checked after the phase: an actionable row also needs a
current quote (younger than 30 minutes) at or under the publication's bet-up-to. The frozen rows keep their price,
fair probability and evidence so a game page can review them; the home board and sport panels never feature them.

## Live repricing (`live.ts`)

The price on a card is the publication's at its research run until a newer live quote exists for the same contract
(the relay's quote clock is at least as new as the publication's capture). Then the executable ask of the selected
side comes from the quote (YES ask or NO ask, never a midpoint or last trade), the fee from Kalshi's schedule (a
published fee belongs to the published ask), freshness from the quote's own clock, and the status is revalidated: an
actionable row needs a current executable quote at or under the bet-up-to; a closed, settled or unopened contract is a
PASS whatever the research said; research candidates keep their status and show the quote. The home board and every
sport panel subscribe to the live tickers of their non-PASS opportunities at slate cadence.

A publication that reports itself STALE or DEGRADED says so, with its own market-capture clock, on its pass card and
above its panel: its prices and statuses are as old as that capture.

## Price state

Decided in this order: `EXPIRED` (the publication's validity window has passed, or it says STALE_PRICE) →
`NO_QUOTE` → `STALE` (quote older than the market-quote policy: 30 min) → `ABOVE_BET_UP_TO` → `UNPRICED` (no fair
probability) → `CURRENT`. Only `CURRENT` counts as a current price in the ranking.

## Ranking (`rank.ts`)

1. Tier: Actionable (1) → robust research candidate with a current price and a positive worst-case edge (2) → other
   research candidates (3) → published watch signals (4) → passes (5). "Robust" is the publication's own support word
   (soccer script-robustness label ROBUST / VERY_ROBUST, NHL family reliability EVIDENCE_STRONGER, tennis external
   confirmation AGREES_WITH_MODEL); a high-variance single-event contract (goal scorer, exact score) never reaches tier 2.
2. Within a tier: a current price before a stale or missing one.
3. Then the publication's worst-case edge, then its fee-adjusted EV per contract, then the share of posterior draws with a
   positive edge (all descending).
4. High-variance contracts sort after everything else in their tier.
5. Kickoff, then id.

Correlation: at most one opportunity per thesis group (`event_id` + the publication's thesis / exposure key) is featured;
the others are attached as related expressions. Nothing here is a score and nothing is shown as one.

## Confidence

`calibration` is the publication's record, never Sift's opinion: `VALIDATED` only when the publication permits real money;
`RESEARCH` for research-only models with a published calibration record; `MARKET_BEATS_MODEL` when the publication's
own settled record shows the market as the better forecaster (tennis; NBA); `UNVALIDATED` when nothing is published.

## Tests

`tests/opportunity.test.ts` on the real trimmed publications (`tests/fixtures/{soccer,tennis,nhl,mlb,cfb}`): the fee
schedule, the price states, every adapter's authority and side handling, the ranking order and the PASS reasons.

## On a game page

Every game page opens with the **Sift verdict** strip (`views/game/GameOpportunities.tsx`): the sport's opportunities
filtered to that event, rendered as the same cards the home shows, or one line — "No published opportunity on this
game" — with the publication's precise reason (the sport verdict's pass reason, or the first judged candidate's status
reason). The NFL publication recommends nothing this season and its model is research-only, so every NFL game says so
before What Matters; the research below is for reading the game, not a pick. NHL, MLB, tennis and CBB game pages open
with the same strip (NHL and tennis show their research candidates as cards; MLB its one candidate beside the judged
passes; CBB says the publication maps no Kalshi contract), and the CBB home carries the Opportunities panel every other
sport home has. Soccer's match page leads with the script engine's own headline expression and NBA's with its PASS card,
which already say the same thing in the sport's own words.

