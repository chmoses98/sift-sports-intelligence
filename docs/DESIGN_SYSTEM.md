# Sift design system — *signal from noise*

Sift separates signal from noise. The visual language says the same thing: deep strata of ink and navy,
**muted context**, and **one lit signal**. A living reference renders at `#/design`.

## 1. Color (`src/styles/tokens.css`)

| Role | Tokens | Use |
|---|---|---|
| Strata (surfaces) | `--ink-0/1`, `--navy-1…4` | Background is deepest; each raised stratum is one step lighter. Never gray-on-gray: surfaces are blue-black. |
| Energy | `--cobalt`, `--cobalt-hi` | Primary actions, team-adjacent emphasis. |
| Signal | `--cyan` | Focus rings, active state, "you are here", the entity being researched. |
| Highlight | `--gold` | The opponent, the research tray, attention. |
| Chart marks | `--mark-focus` #0EA2B6, `--mark-opp` #C2881C, `--mark-compare` #5F7CF2, `--mark-context` | Validated with the dataviz palette validator against the `#0A1222` surface (lightness band, chroma, CVD ΔE ≥ 18, contrast ≥ 3:1). |
| Freshness | `--fresh` `--aging` `--stale` `--unknown` | Always with a glyph and a word. |
| Quality | `--q-verified` `--q-partial` `--q-research` `--q-unavailable` | RESEARCH is also *dashed*. |

Team colors are brand presentation only (`src/lib/teams.ts`): a monogram tile and a 3 px stripe. They
never color data marks; Sift's own palette stays in charge. No purple gradients, no casino green.

## 2. Type

| Face | Use |
|---|---|
| **Big Shoulders Display** (variable) | Uppercase display: matchup headers, entity names, section titles, the hero rank ("18th"). |
| **Archivo** (variable) | UI and long-form text (metric descriptions at 15 px / 1.55). |
| **JetBrains Mono** (variable) | Numbers, prices, tickers, ranks in tables: tabular figures so columns align. |

Eyebrows (11 px, 0.14em tracking, uppercase) carry context above every title ("NFL · METRIC · DEFENSE").

## 3. Space, shape, motion

4 px grid (`--s-1`…`--s-12`), radii 4/8/14 px, 44 px minimum touch target (`--tap`). Motion is short
(120/220 ms) and disabled under `prefers-reduced-motion`.

## 4. Layout primitives

* **Stratum** — a section: hairline top rule with a cyan lead-in, mono section number, display title, one-line
  purpose. Replaces "endless identical cards".
* **Entity header** — monogram, eyebrow path, display name, meta chips, actions (Tray, Copy).
* **Matchup header** — two display-size team names, the away team ringed gold, the home team cyan.
* **Sticky tabs / jump links** — only where a screen is long (team, game).
* Phone: bottom navigation (Home · NFL · Search · Tray), tray as a bottom sheet, no sideways scroll (asserted
  by the acceptance test). Desktop ≥ 720 px: search and tray in the top bar; ≥ 1040 px: sport rail.

## 5. Components

| Component | Rule |
|---|---|
| **EntityLink** | Every entity reference is a link with a kind glyph: ◆ team, ● player, ⟷ game, ∿ metric, ≡ ranking, ¢ market. |
| **FreshnessChip** | State + age, recomputed in the browser with the publication's thresholds; tap for the exact timestamp and rule. |
| **QualityBadge** | VERIFIED ● / PARTIAL ◐ / RESEARCH ◌ (dashed) / UNAVAILABLE ○; tap for provenance (source, method, generated, as-of, coverage, limitations). |
| **RankPill** | "18th / 32" with a left tick: cyan top quartile, coral bottom quartile, neutral when no direction is better. |
| **ContextMeter** | worst ← → best track with mean │ and median ┊ ticks, the team's dot lit, the opponent's in gold. |
| **SaveButton** | Dashed gold "+ Tray" → solid "✓ In tray". Saves a reference, never a copy. |
| **MarketBoard** | Ladders as rows of rung cells (line, bid/ask, ◆ model fair); singletons as rows. Model fair is labelled research evidence everywhere. |
| **SourceBanner** | LIVE or RESEARCH SNAPSHOT, health, market/model freshness, and the full provenance on tap. |
| **COPY FOR CHATGPT** | The one cyan, full-width action in the app. |

## 6. Charts

Every chart answers one question, is navigation, and has a text alternative.

| Chart | Question | Interaction |
|---|---|---|
| **RankBars** | Where does every team stand? | Rows link to that team on the same metric; + pins comparisons (URL-encoded). Mean/median drawn through the universe. |
| **DotStrip** | Where does this team sit among all 32 values? | Dots are links; best always on the right. |
| **TrendChart** | How has this gone game by game? | Columns are games; tap/←→ selects; detail opens the game, the opponent, or saves the chart point. Season boundaries, trailing mean, W/L tint, table view. |
| **MatchupBoard** | Which unit has the edge where? | Each cell links to the metric with team, opponent and game context. |
| **LadderChart** | Where along the ladder do market and projection disagree? | Rungs link to the contract; simulated quantiles share the x axis. |
| **PriceHistory** | How has this contract moved? | Crosshair readout; bid–ask band, mid, model fair reference, kickoff. |
| **RangeStrip** | What range does the simulation give vs the market's centre? | — |

Specs: thin marks (≤ 24 px bars, 2 px lines, ≥ 8 px markers with a 2 px surface ring), hairline solid grid,
legends whenever two or more series, text in text tokens (never in the series color), dashed lines only for
reference thresholds (model fair).

## 7. Voice

Evidence, not picks. Sift says "model evidence", "research signal", "market-implied", "projection". It never
says lock, hammer, best bet, or ranks bets.
