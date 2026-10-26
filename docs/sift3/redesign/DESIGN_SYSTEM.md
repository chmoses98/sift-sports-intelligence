# SIFT 3.0 research design system (locked)

Status: **locked** after the P1 to P4 and G1 to G3 review. This file records decisions only; it is design documentation, not code. Source of truth for the mockups is `theme-b.css` (tokens) and `mock.js` / `pd.js` (components).

## Palette: ink and graphite

| Role | Token | Value |
| --- | --- | --- |
| Foundation | `--bg` | `#080B10` |
| Card surface | `--card` | graphite gradient `#181C21` to `#131619` |
| Chip / raised surface | `--s-chip`, `--s-raise` | `#1B1F25`, `#1F242B` |
| Borders | `--s-bd`, `--s-hair` | slate hairlines `#272B32`, `#21252B`; never cyan |
| Text | `--text`, `--muted`, `--dim` | `#F3F6F9`, `#A4ACB6`, `#7D8895` |
| Selection, primary action, SIFT highlight | `--cyan` | `#19CDE0` (restrained; never decoration) |
| Foreground on any bright cyan fill | | `#04202C` (8.7 : 1, checked by `check-contrast.mjs`) |
| Offense indicator | `--off` | ice `#EAF1F7` |
| Defense indicator | `--def` | amber `#FF9B52` |
| Historical hit / miss | | green `#46E49B` to `#1C9A62` / coral `#FF7468` to `#CF453C` |

Team-specific hero lighting and verified, credited photography keep their own colour; they are the loudest thing on a screen.

## Evidence lanes (names locked)

Three lanes, always shown separately, always in this order, always with these names and marks.

| Lane | Mark | Colour | Meaning |
| --- | --- | --- | --- |
| **Market** | square | periwinkle `#93A9FF` | Pre-fee market-implied probability (Kalshi YES ask in cents). |
| **History** | ring | ivory `#F0F2F5` | Observed frequency (hit count over the shown window, for example 4 of 10). |
| **SIFT model** | diamond | cyan | The approved model-estimated outcome probability, only where the approval ledger lets SIFT display it. |

Rules:

1. Lanes are never blended, averaged or subtracted into an "edge", "value" or "mispricing" figure. No screen sorts or colours by model minus market.
2. A missing SIFT model estimate is shown as "—" with the reason ("not approved yet"). It is never estimated, rounded up from History, or back-filled from Market.
3. A missing History or matchup is shown as "—" or "no matchup rows". Raw statistics are never turned into a probability, recommendation, price or value signal.

## Matchup tilt (descriptive heuristic)

Tilt = offense league percentile minus opposing-defense league percentile, with percentile = (n − rank) / (n − 1) × 100.

- Compare the gap **as displayed (rounded to a whole percentile point)**. `|gap| <= 15` is **Even**: slate fill, no arrow, pill reads "Even". A gap of exactly 15 is Even.
- Only `|gap| > 15` receives a directional tilt: the fill takes the role colour (ice for offense, amber for defense), the arrow ends at the advantaged unit's marker (the one further right), and the pill names the team logo, abbreviation and role ("DAL offense +48", "PHI defense +45").
- Summary counts (for example "[DAL] 5 · even 1 · [PHI] 1") use exactly the same rule as the rows, so they always add up to the number of units shown.
- This is a **descriptive visual heuristic** comparing season-long unit strength. It is not a prediction and not a validated betting edge, and the product copy says so where the tilt is explained (G3 "How to read it").

## Data-status layer

Every mockup has a status overlay (`?annot=1`, "Show data status" on the boards):

- **BUILT**: implemented in v3 with real data today.
- **WIRE**: published by SIFT already; v3 does not read it yet (integration work only, no new source).
- **NEW**: needs data or a feed SIFT does not publish.

A screen may promise only what its status layer shows. Anything marked NEW appears as a visibly locked, honestly labelled state, never as a working control.

## Progressive disclosure

Default views carry the main observation and a concise counter-case. Full evidence is one tap away and never removed (G3 SIFT Lens collapsed by default, evidence on tap). Layout of approved screens is not reflowed to add content.

## Prices and freshness (decided 2026-10-26)

Prices are shown clean and update automatically. The interface never shows stale-quote warnings, freshness badges, ages or last-updated labels (Prop Discovery PD1 to PD6 and Team Research are locked on this). Freshness is handled internally: automatic refresh, a forced refresh when an exact contract opens, internal observation timestamps, reliability checks and monitoring. A price is never invented or estimated: if no reliable quote exists the price pill shows "—", and the exact-contract sheet shows a single plain "Price unavailable right now" state with Retry and hides the fee and break-even rows that derive from the price. See `docs/sift3/QUOTE_DELIVERY.md`.

## Team pages

Same system: ice for offense, amber for defense, cyan for selection only. Opponent-adjusted and raw statistics are never mixed in one list. Ranks are shown with the universe the publication used (for example "of 28" teams in the current packet). A statistic SIFT does not publish is shown as a locked row with the reason. Team pages carry no SIFT model lane.

## Universal semantic navigation (locked 2026-10-26)

Every identity, number and object is a tap target with one meaning, on every screen:

| Tap | Goes to |
| --- | --- |
| A team (logo, name, abbreviation, team pill) | Team Research for that team |
| A statistic, rank, value or percentile | Stat Detail for that statistic, ranking tab, with the selected team or player highlighted |
| A player (photo, name) | Player Research |
| A prop, a prop count, "props today" | Prop Discovery, filtered to the team, player or stat in view |
| A price on a contract | The exact-contract sheet |
| A game, score, result row or matchup strip | Game Detail |

When one row holds several targets, the row body opens the row's main object and each logo, rank, player and price opens its own. Hit areas are at least 44 points. **Back restores the previous state exactly**: scroll position, selected tab, window, filters, sort, compare selection, and any expanded row; sheets are closed.

## Sports and extensibility

Each sport declares what it publishes (team statistics and windows, rankings, per-game series, availability, players, schedule) and whether that data is current. A section appears only when the sport supplies it **and it is current**; otherwise the section is absent or a locked row says why. NFL and NHL are supported first. MLB team profiles exist but the publication says they are a one-off cache that stops in late August, so MLB Team Research is not shown until its data is current; the late-August cache is never presented as current. A new sport adds a declaration and its documents, not new screens.

## Hockey records

NHL records are always wins, losses and overtime losses, shown separately (for example 7–4–2). Overtime losses are derived from the official points percentage (points = percentage × 2 × games played) because per-game overtime flags are not published.

## Game times

Start times come from the league schedule (the explorer publication), never from Kalshi event metadata. A contract's closing time is separate and not shown as the start.

## Statistic screens

Ranking, Trend, Compare and About share one header. Raw and opponent-adjusted versions of a statistic are separate statistics with their own rankings and windows and are never mixed in one list or subtracted into a derived "effect". A selected team or player is highlighted with a cyan outline; a next opponent with a dashed outline. Player-level league rankings are not published, so player comparisons use game-log values and show the missing rank as a locked row.
