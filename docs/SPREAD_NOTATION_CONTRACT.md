# SIFT spread notation contract — all sports and all surfaces

**Effective standard:** Every public-facing or owner-facing spread string is
**TEAM -X** when that team is projected to win by X (pregame), or **TEAM -X**
when it actually won by X (postgame). For example, `PHI -6.5` is a PHI
6.5-point favourite; final `PHI -3` means PHI won by 3. An underdog
handicap may appear as `PHI +6.5` only when the data explicitly refers to
the *wager on PHI*, not the predicted winner or winning margin.

## Two numerical conventions — do not confuse them

| Source field | Internal math | Example | Public label |
| --- | --- | --- | --- |
| Projected scores | `home_score - away_score` | PHI 116, TOR 109.5 | `PHI -6.5` |
| Final scores | `home_score - away_score` | PHI 103, TOR 100 | `PHI -3` |
| Simulator raw home margin | `home_pts - away_pts` | -1.7 for TOR at PHI | `TOR -1.7` |
| Published market HOME handicap | `home_handicap` (points added to HOME) | -6.5 at home PHI | `PHI -6.5` |
| Published market HOME handicap | `home_handicap` | +6.5 at home PHI | `TOR -6.5` |
| Team-specific betting line | explicitly team + signed handicap | PHI +6.5 | `PHI +6.5` (betting line only) |

All new output fields must explicitly document whether they represent
`home_margin`, `home_handicap`, `team_handicap`, or a winner-facing display
string. A plain signed field named `spread` with unknown orientation must **not**
be converted by sign guessing. Withhold its display until provenance is established.

## Glyph, rounding and ties

- Every UI label uses U+2212 MINUS SIGN (`PHI −6.5`), exported as `MINUS`; screen readers announce it as "minus".
  Python/Markdown producer reports may use ASCII `PHI -6.5`; both read identically.
- Ties and lines that round to zero render `PICKEM` ("Pick’em"). Final ties render Pick’em, never a team.
- Model/market handicaps snap to the half point where the surface did so before; final margins are integers.

## Implementation

- `src/lib/spreadNotation.ts` is the sole SIFT public display converter.
- `spreadFromScores` and `spreadFromHomeMargin` translate raw model and actual
  home-minus-away margins **without changing model maths, simulations or grading**.
- `spreadFromHomeHandicap` translates verified home-side market handicaps.
- `teamFavouriteLine` labels a contract that is already named for its team
  ("PHI wins by more than 6.5" => `PHI −6.5`).
- `homeMarginFromHomeHandicap` converts a home handicap into margin units for
  evaluation (error, cover); it is never a display path.

### Surfaces routed through the boundary

| Surface | File | Native input |
| --- | --- | --- |
| v3 projection card / model spread | `src/v3/model/spread.ts` | projected scores |
| v3 game cards (final margin) | `src/v3/ui/GameCard.tsx` | final scores |
| v3 Kalshi spread line + alternates | `src/v3/data/adapt.ts` | team-named contract |
| v4 game result / live score card | `src/v4/Game.tsx`, `src/v4/LiveScoreCard.tsx` | final scores |
| Game page model-vs-market table | `src/views/Game.tsx` | home handicap |
| Game overview Model Read tiles | `src/views/game/panels.tsx` | home handicap (model and market each name their own favourite) |
| Lines panel | `src/views/game/lines.tsx` | home handicap |
| Market intel rows | `src/views/game/MarketIntel.tsx` | home handicap |
| Slate hooks | `src/views/Slate.tsx` | home handicap |
| Prop explorer game context | `src/views/explore/PropExplorerView.tsx` | home handicap |
| Home model line, top-gap labels | `src/views/home/cards.tsx` | home handicap / contract |
| Broadcast hero + card facts | `src/views/broadcast/numbers.ts`, `cardFacts.ts` | home handicap |
| Historical ATS (season week, hub, historical game) | `src/history/league.ts` | nflverse `spread_line` (positive = home favoured) |
| CBB slate / game / team / viz / intel | `src/views/cbb/*`, `src/v3/data/intel/sports/cbb.ts` | home-minus-away margin |
| NBA / NHL / MLB / soccer / generic market labels | `src/lib/{nba,marketLabel,mlb,soccer,gamedata}.ts` | team-named contract |

Not spreads (deliberately unchanged): script margin *bands* (`PHI by 1–7`), a team's own
recent-results bars (`+5`/`−3` from that team's view), and season point-differential stats.

- Display ties as `Pick'em`; never turn a missing/infinite score into an
  invented favourite. Show the team *name* as well as the negative line.
- For matchup reviews report **predicted favourite / final winner / absolute
  point-margin error** separately. E.g. TOR -1.7 projected vs PHI -11 final:
  absolute margin error = `|(-1.7) - (+11)| = 12.7` when both are evaluated
  in home-minus-away margin units.

## Producer requirements

Sports producers may continue storing raw margins for modeling/evaluation.
Whenever their human-readable report emits a spread, it must include the
named team and conventional betting sign. Preserve raw numbers with explicitly
named direction for auditability; do not rewrite historical immutable captures.
Apply the same rule to NBA, NFL, CFB, CBB, NHL, MLB, soccer and other sports
where a point/goal/run margin exists. The common renderer is unit-agnostic.

## Release gates

- Unit tests prove home/away sign conversion, full/integer/half-point labels,
  missing input fail-closed behaviour, and market handicap sign inversion.
- Confirm pregame and final score labels on game cards, model/market projection
  lanes, compact slate, CBB projection/slider and postgame review.
- Compare against published historical examples in every sport.
- No merge or deploy until final-head CI and visual smoke checks pass.
