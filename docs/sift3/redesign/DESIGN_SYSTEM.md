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
