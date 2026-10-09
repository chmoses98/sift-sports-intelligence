# SIFT intelligence and decision-quality pass — handoff, 2026-10-09

Starting point: main `b4b4025` (PRs #39–#41). The method was to run Sift's own opportunity pipeline over the **live**
publications (18:40Z) and fix what it got wrong. Each defect below was seen on real data first and then covered by a
regression test.

## What was wrong on the live board, and what changed

| # | Live defect (2026-10-09 18:40Z) | Fix | Where |
|---|---|---|---|
| 1 | Global board cards 1–4 were tennis "Research candidate · robust" because `/AGREES/` matched `AGREES_WITH_KALSHI`, which means the sharp books side with the **market**. Prices were 3 h old (STALE), and the market beats this model on 15,117 settled rows. | Robust needs an exact strong support word, a current price, a published positive worst case and a contract that is not high variance | `rank.ts` `tierOf` |
| 2 | The soccer board's first card was "YES Vasco da Gama to win, 9.5¢, fair 57%, worst case +37 pts". The ticker `…VDGCR-CR` is Clube do Remo's contract. | Sift checks contract identity on soccer, MLB and tennis tickers; a mismatch is a PASS with the reason. Upstream: soccer-edge-finder#38 (merged) never prices a team leg on a guessed side. | `identity.ts` |
| 3 | Soccer rows were ranked by gap size. The soccer publication's own pre-registered study (12,248 walk-forward matches) finds the de-vigged market reliably better than `dc_laplace_v1` in 112 of 116 subgroups and the model better in none, with the model's error growing with the gap. | Market-beats-model models (tennis, soccer `dc_laplace_v1`) are shown as **model disagreements** (tier 4). They sort after every other model, and gap size does not order them. | `sources.ts`, `rank.ts` |
| 4 | After a live price change, the published worst-case edge and posterior share stayed on the card. The publication's STALE word overrode a fresh quote, and a candidate above its bet-up-to stayed a candidate. | The worst case is re-based exactly on the live break-even, and the posterior share is withdrawn. A live ask above the bet-up-to, or one with no edge left after the fee, makes the row a PASS. The tier is recomputed. | `live.ts` |
| 5 | YES Leeds and YES draw were listed as "related" to NO Arsenal, but they cannot both win. | Positions are read as settlement rules. "Opposite outcome", "same game" and "contradicts" labels appear on cards. | `correlation.ts` |
| 6 | Relay audit: a paused or unrecognised market kept an ACTIONABLE status; the publication's depth was shown beside a different live ask; a price with no clock counted as current; an aging quote could still be acted on; nothing guarded against in-play quotes. | Only OPEN is tradable. Depth is dropped once the ask is live. No clock means STALE. Acting needs a FRESH quote. A quote observed after the start makes the row a PASS (tennis excepted). | `live.ts`, `pricing.ts`, `sources.ts` |
| 7 | NHL cards said "nothing is validated yet" while the scorecard shows past player-goals candidates won 33.0% against 38.4% expected, with a closing line of −0.4¢. | Each NHL card shows its family's settled record and names an adverse record in its risk line | `record.ts` |

The board now has three sections: **Actionable · Research candidates · Signals without a validated bet**. When only
signals exist, it says so first.

## Upstream reliability

- **MLB (edge-finder-api#282).** 2026-10-09 has no MLB games (an off day in the Division Series). Market capture
  went STALE from 02:47Z for two reasons. First, health aged the previous slate's last quote and had no notion of
  "nothing to capture". Second, the conductor returned before the capture stage on a zero-game day, a circular gate,
  so it stopped probing after 11:12Z. The fix calls idle capture NOT_APPLICABLE only on positive evidence: an earlier
  slate that is all final, plus a complete zero-market capture under 2 h old. It also keeps capture and ingest
  running on zero-game days.
- **Soccer (soccer-edge-finder#38, merged).** Fixes the side mapping and adds duplicate-side, cache and republish
  guards. CI on main was already red for two environmental reasons, also fixed in that PR: a hard-coded test clock
  that expired at 2026-10-09 12:00Z, and schema drift under pydantic 2.14.

## Still needs live observation

- MLB: the conductor should probe on the next off day inside the capture window, health should flip to
  NOT_APPLICABLE, and the next game should be observed through Scheduled → In progress → Final.
- Soccer: the next model run should republish the Vasco v Remo legs correctly, or keep holding them back.
- Relay: in-play guard behaviour at a real kickoff with an open market.

## What is not claimed

Every test above checks a rule. **None of them shows a predictive edge.** By their own settled records or studies,
the market beats the soccer, tennis and NBA models, and the NFL model trails the market on game outcomes. NHL is
inconclusive at the game level (Brier 0.1636 market vs 0.1668 model, which the publication calls noise) and adverse
on settled candidates. CFB publishes no probabilities, and CBB maps no contract. A PASS remains the most common
honest answer.
