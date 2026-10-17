# NBA integrity report (2026-10-17)

**Status: INSUFFICIENT_EVIDENCE.** 0 joinable settled rows; no accuracy or betting claim is made.
Adapter: `research/intelligence/adapters/nba.py`. Run:
`python -m research.intelligence.adapters.nba <nba-shadow-pure checkout> <data-archive checkout> out.json [arm]`
(default arm `sim_rotation`, conditional-on-playing rows). Tests: `research/intelligence/tests/test_adapter_nba.py` (10 pass).

## Funnel (real run, 2026-10-17 snapshot of both branches)

| stage | count | note |
|---|---|---|
| PURE forecast rows (points/reb/ast/threes, sim_rotation conditional) | 5,168 | all `preseason`; 0 regular season |
| ladder rungs P(stat>=k) in those rows | 34,884 | minutes rows (1,292) not market-listed, skipped |
| shadow hash chain over files read | ok | 9 files, 0 sha mismatch, 0 unlisted, 0 chain breaks |
| prop market tickers (PTS/REB/AST/3PT) in archive | 336 | PTS 110, REB 75, 3PT 83, AST 68 |
| ... with a quote observation | 336 | 464 checkpoint rows + 2,539 delta observations replayed |
| ... event dated before / from 2026-10-20 | 24 / 312 | 312 are the opening-night books, not yet played |
| last quote status of those tickers | TOO_WIDE 250, PLACEHOLDER_BOOK 51, ONE_SIDED 28, VALID 7 | quarantined by `integrity.quote_status`, kept |
| shadow `market/listings` rows (ticker -> player_id) | 0 | `listings_status`: n_listings 0, n_unresolved_player 0 |
| prop settlement records | 24 | YES 6, NO 6, UNSETTLEABLE 12 (all 24 are 2026-10-05 preseason NYK-PHI) |
| tickers mapped to a forecast player | 0 | all 336 stop at `NO_SHADOW_LISTING_FOR_EVENT` |
| forecast x pre-tip quote matches | 0 | |
| settled rows in frame | 0 | |

Reasons for the unmatched 336: the shadow store has never captured a player-prop listing (no preseason prop
market existed on its 2026-10-12..16 games), so no event or player identity exists to map tickers to. The only 24
settled prop tickers belong to 2026-10-05 games that predate the first forecast (2026-10-12), so they cannot be
joined without reconstructing a forecast, which is not allowed.

## Join rules
- **Ticker <-> player is exact.** Only from the shadow store's own `market/listings` rows (resolved at forecast time
  by Kalshi player UUID alias, else unique name on the team). A ticker without a row is mapped only when its
  `event_ticker` appears in a listing AND its `custom_strike.basketball_player` UUID maps to exactly one player_id
  in listings. Everything else is counted (`NO_SHADOW_LISTING_FOR_EVENT`, `PLAYER_UNRESOLVED_OR_AMBIGUOUS`), never guessed.
- Stat from the series (PTS/REB/AST/3PT); at_least = floor+1 for `greater` strikes; the rung must match the forecast
  ladder exactly (`NO_MATCHING_LADDER_RUNG` otherwise). No interpolation.
- Quote = last observation strictly before kickoff (checkpoint + hash-chained deltas replayed in order). Forecast =
  latest with `as_of` strictly before that quote and before tip; none -> `AS_OF_NOT_BEFORE_QUOTE`.
- Outcome = settlement YES/NO; UNSETTLEABLE counted and excluded; players with `played=False` excluded as DNP.
- Quarantined, never deleted: `PLACEHOLDER_BOOK` (0.00 bid / 0.98 ask), other non-VALID quote states, and preseason rows
  (kept in the frame, not scored).
- Excluded: `prop_walk_forward_v3.csv` (older simulator, retroactive) is not scored.

## Automatic accumulation
Nothing to configure: as regular-season props (opening 2026-10-20) are listed by the shadow collector, quoted in
`data-archive`, and settled, the same command produces joined rows. `evaluate_frame` still returns
INSUFFICIENT_EVIDENCE until >= 300 independent player-stat-games are scored, then the standard chronological
discovery/validation/holdout diagnosis runs.

## Caveats
- The shadow collector must write `market/listings` before tip for the mapping to exist; if it stays at 0 listings on
  regular-season nights the funnel will show `NO_SHADOW_LISTING_FOR_EVENT` and the adapter will not guess.
- Treatment of a prop on a DNP player by Kalshi is unverified; those rows are excluded, not scored as NO.
