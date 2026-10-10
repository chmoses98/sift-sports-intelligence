# Fidelity B — Props, Scripts, Players, Markets vs approved references 03–08

Real-browser captures (Chromium via Playwright, production build) at 1440×900 (`-desktop`), 390×844 (`-phone`) and
360×780 (`-small`), full page. NFL screens run on the bundled same-run snapshot (NE @ BUF, week 4) at the e2e clock
(2026-10-04 15:00 UTC), so quotes read "captured 14h ago" — that is the honest freshness state, not a bug. CFB
`cfb-*` screens are the live publication for Texas A&M at Missouri (`evt_03ae795dcfb6056381a6`, kicked off during
the capture, so the page says "pregame research frozen"); `cfbfix-*` use the committed CFB fixture (Georgia at
Alabama) because the live A&M–Missouri game has no mapped script-to-market expressions. On phones the fixed bottom bar
and sport sheet were hidden for the capture only (full-page captures otherwise stitch them mid-page). WebKit is not
installed in this container, so no iPhone/WebKit capture was made; no 360/390/1440 capture has horizontal overflow.

Iterations: (1) first pass found a phone overflow of 7,686px (the player carousel widened the grid), a broken script
layout (the old `.stab` grid wrapped the theater), illegible margin-map labels, an over-styled "no probability" note,
and a stacked compare header; (2) fixed those, enlarged chart type, moved narrow-segment labels outside their bars, and
fixed 360px overflow in the script-sensitivity and CFB compare tables; (3) cleaned the mobile compare cards' badge
overlap and added stroke behind chart labels.

## 03 Combined Prop Explorer — `prop-explorer-*`, `prop-explorer-allen-*`, `nfl-props-tab-*`
Matches: left player rail (team toggle with logos, search, prop-type chips, faces, line + read), selected-player header
with Market line / SIFT projection / Gap tiles, game context card, large distribution with line and projection marked
and a side legend, SIFT read with Key risk, recent-performance bars with today's line drawn, matchup table (unit ranks
side by side), game-script sensitivity, market ladder with the main line lit and its capture age. Phone: chips scroll,
players become a swipe carousel, panels stack (ref 03 phone).
Remaining differences and why:
- The distribution is drawn from the **five published quantiles** (blocks), not a smooth many-bar histogram: the
  publication ships p05–p95 only, no samples. The 5% beyond each end is written, not drawn.
- "Probability over/under 58%/42%" is shown only as the shadow model's research P(over) where the publication priced
  it; otherwise "No validated probability is published". No probability is read off the chart.
- "Game script sensitivity" shows **team** pass/rush attempts per script, not a player's projected yards per script —
  script-conditional player projections are not published (upstream work).
- "Related props & correlated angles" with correlation coefficients is omitted: no correlations are published.
- MLB/NHL (`unsupported-mlb-props-*`): honest capability card listing what each publication carries and what is not
  published; NFL is the only full Combined Prop Explorer.

## 04 Script Theater — `nfl-script-theater-*`, `cfb-script-theater-*`
Matches: theater header with Single/Compare toggle, cinematic script cards in four identity colours carried by the
script's centerpiece player (licensed Wikimedia photos already in the app; team logo when none), selected-script card
with Game flow / Volume impact / Markets to investigate / How this script fails, key game metrics, impacted players,
markets that win/lose here. CFB: role cards (Primary/Secondary/Alternate/Danger, "#n by evidence") with the lead team's
logo, causal chain, outcome shape, "no probability published".
Remaining differences and why:
- No "Expected scoring progression" by quarter: score-state paths are not simulated. Replaced by **Where it ends** — the
  scripts on the final-margin axis over the simulation's published margin bands.
- NFL shares read "36% of simulated games", never "probability". CFB shows no percentage at all; descriptive bands are
  labelled research only.
- Player impact cards show team volume deltas (+x% vs all games), not per-player projections (not published).
- No dramatic AI player scenes: only licensed photos and logos. CFB has no licensed player photography, so CFB cards
  use team marks.

## 05 Script comparison — `nfl-script-compare-*`, `cfb-script-compare-*`, `cfbfix-script-compare-*`
Matches: A vs B header, chips to pick A and B and swap (address-backed `?view=compare&a=&b=`), side-by-side metrics with
bars, "how the game ends" chart, key player impacts A vs B, markets that win in one and lose in the other; focused
stacked phone layout.
Remaining differences: no projected score or win probability per script (not published); CFB compare is
evidence-ranked rows (rank, archetype, lean, stated margin, finding counts, data confidence) — never a likelihood.

## 06 Player profile — `player-profile-*`
Matches: hero with licensed photo on the team colour, broadcast name, position/role/status, next game, season
per-game stat strip from the real game log, player prop markets table (line, over ask, projection, proj − line),
projection-vs-line with the quantile distribution, game-by-game bars against today's line, matchup ranks, usage.
Remaining: no "matchup grade A-" (Sift does not combine ranks into a grade); "Game script impact" is an honest
capability card (player projections by script not published); no fair price / edge column (prop pricing is research,
behind the market).

## 07 Market Intelligence — `nfl-market-intel-*`, `cfb-market-intel-*`, `cfbfix-market-intel-*`
Matches: Market views rail, best-supported expression cards (lead lit green) with price, model research probability,
script-fit cells and quote freshness; game thesis panel; model projections (projected score + simulated total
distribution vs market centre); win-probability rings; script distribution bars; full board below.
Remaining: no letter grades (B/B-/C+) or "confidence" labels — the publication does not grade expressions. The NFL
publication flags no opportunity on this game, so cards say "research comparisons, not recommendations"; the thesis
panel is the publication's numbers side by side because it writes no prose thesis. Three rings carry three authorities
(market midpoints, shadow model research, simulation share). CFB: engine BEST_EXPRESSION survivors, no fair price.

## 08 Comparison Studio — studio section in the market-intel captures
Matches: three coloured market cards (1/2/3) each replaceable, price + break-even, model probability, gap, script fit,
shared-script relations, freshness; CFB uses published correlations between expressions.
Remaining: no payoff/risk curve and no correlation coefficients (neither is published); "both win in …" is exact
settlement logic over the published scripts, not a correlation.

## Not redesigned in this pass
Single-contract Market page (`src/views/Market.tsx`) and the Intelligence → Markets board (`src/views/Markets.tsx`)
keep their current look; the game hero, tab bar and Overview belong to Journey A.
