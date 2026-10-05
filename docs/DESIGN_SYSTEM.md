# Sift design system — *stadium night*

Sift guides the eye from **game → probable scripts → evidence → market fit → deeper research** through
hierarchy alone: the matchup and its scripts dominate, evidence sits one step quieter, diagnostics live at
the bottom or behind an info icon. A living reference renders at `#/design`. The approved owner mockup is
the visual target; this document is its production translation.

## 1. Surfaces & color (`src/styles/tokens.css`)

| Role | Tokens | Use |
|---|---|---|
| Strata | `--ink-0/1`, `--navy-1…4`, `--rail` | Deep navy/graphite base; each raised layer one step lighter. |
| Glass panel | `--panel`, `--panel-line`, `--shadow-1` | The one card primitive (`.panel`): translucent, hairline border, inner light. Not used for everything — tables and lists sit flat inside it. |
| Energy | `--cobalt`, `--cobalt-hi`, `--cobalt-glow` | Primary action, active navigation, active tab underline. |
| Price | `--gold`, `--gold-line` | The live-price token (`.price`) and the research tray. |
| Model vs market | `--pos`, `--neg` | Quiet green/coral for the sign of a model–market gap. Never "casino green". |
| Game scripts | `--script-1…4` | Four fixed roles: favourite pulls away · favourite controls · one-score game · underdog controls. Always with a name and a glyph. |
| Chart marks | `--mark-focus`, `--mark-opp`, `--mark-compare` | Home / away / third series. |
| Freshness | `--fresh` `--aging` `--stale` `--unknown` | Only as a small dot tint on a quote chip (see §6). |

Script and chart palettes are validated with the dataviz validator on the panel surface `#0d1424`
(lightness band, chroma, CVD ΔE, normal-vision floor, contrast — all pass). Team colors are brand
presentation only (crests, hero glow) and never color data.

## 2. Type (self-hosted, `@fontsource/barlow*`)

| Face | Use |
|---|---|
| **Barlow Condensed** 600–800 | Display: team nicknames in the hero, page titles, big numbers (script shares, model tiles). Uppercase. |
| **Barlow Semi Condensed** 500–700 | Panel titles, tabs, navigation, table heads, and every number (`.num`, tabular + lining figures). |
| **Barlow** 400–700 | Running UI text and reads. |
| JetBrains Mono | Tickers, packet text, diagnostics only. |

One family in three widths gives the broadcast/editorial feel of the mockup with consistent figures.

## 3. Space, shape, motion

4 px grid (`--s-1`…`--s-12`), radii 4/6/10 px (crisp, not bubbly), 44 px touch targets. Motion is
120/220 ms and off under `prefers-reduced-motion`.

## 4. Shell & navigation

* **Desktop ≥ 1100 px** — left sidebar (216 px): SIFT wordmark, Home, every sport (NFL, CFB, MLB, NBA,
  NHL, Soccer, Tennis, MMA, PGA, More), then Research, Parlays, News, Search, and Settings at the foot.
  Top bar: breadcrumb, search, research tray.
* **Tablet 720–1099 px** — the same sidebar as a 76 px icon rail with small labels.
* **Phone < 720 px** — no sidebar. Bottom tab bar: Home · current sport · Sports (a sheet with every sport
  and the workspace) · Search · Tray. The top bar carries the wordmark, the breadcrumb and search.
* **Breadcrumb** — the research path. It resets at the global Home (cleared) and at a sport home (starts
  at that sport); deeper screens append; a tab change on the same entity replaces its step.

## 5. Screens

* **Global Home** — today across Sift: the featured game, up next, every sport's real status, your research.
* **Sport home** (`/nfl`) — the sport's landing page: featured game, this week's tiles (stadium strip,
  model line, script bar), Script Outlook, Model vs Market on game lines, recent results, structures. The
  full slate is `/nfl/slate`.
* **Game** — hero over the real home stadium (or the published neutral site) with kickoff-time forecast,
  then tabs: Overview · Game Script · Markets · Matchup · Players · Trends · Injuries.

## 6. Components

| Component | Rule |
|---|---|
| **Game hero** | Curated venue photo (`scripts/stadiums/`), desaturated, under a dark gradient with each team's color glowing from its side. Indoor/closed roof says "Indoor" / "Roof closed", never a blank forecast. Photo credit links to Data & provenance. |
| **Script card** | Name, sim share (whole %), one-line description, glyph. Click = select (deep-linked `?script=`); "All scripts" returns to the uncertainty view. |
| **Survival grid** | Four cells per market, one per script: filled = wins in every game of that script, half = some, empty = loses. Coverage = sim share of the scripts it always wins. Exact only for margin-settled markets. |
| **Price token** | Gold-framed YES ask; dashed/dimmed when the quote is aging/stale; exact age in its title. |
| **Model − Mkt** | Model probability minus the market midpoint in points, quiet green/coral. Never called "edge". |
| **Quote chip** | Says "Updated 4m ago"; the FRESH/AGING/STALE/UNKNOWN state (unchanged thresholds) is the dot tint, `data-quote-state`, the accessible name and the popover. |
| **Team crest** | Sift's own shield in the team's two colors with its abbreviation (no league or club marks). |
| **Info icon** | Definitions (EPA, success rate, sim share) in a popover; no inline lectures. |
| **Ranks** | `#4 NFL`, never percentiles (32 teams). |
| **Head to head** | Winner's score first, winner bold; framed as context, not model evidence. |

## 7. Charts

Every chart answers one question and has a text alternative. New: **MiniLines** (line history: YES
midpoint of the favourite's moneyline, the spread and total rungs nearest 50¢, crosshair readout) and the
**matchup board**, where each unit's rank bar sits under its own label so direction can never contradict
the label (no combined "advantage" figure — see `docs/MATCHUP_MATH.md`). Existing charts (RankBars,
DotStrip, TrendChart, LadderChart, PriceHistory, RangeStrip) keep their specs and inherit the new tokens.

## 8. Voice

Evidence, not picks. "Model read", "sim share", "Model − Market", "survives". Never "lock", "best bet",
"edge" for an unvalidated model gap, or "probability" for an uncalibrated share. Technical limitations
live in info popovers, the publication-notes drawer and Data & provenance — not across the main hierarchy.
