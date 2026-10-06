# Sift design system — *night stadium, sampled from the mockup*

Sift guides the eye from **game → probable scripts → evidence → market fit → deeper research** through
hierarchy alone: the matchup and its scripts dominate, evidence sits one step quieter, diagnostics live
behind the Source control and on Status. A living reference renders at `#/design`.

**The approved mockup image is the source of truth.** The tokens below were obtained by sampling its pixels
(median of each region; brightest/most saturated 5–10 % for text and accents), then adjusted only where
contrast or the data-viz validator required it.

## 1. Surfaces & color (`src/styles/tokens.css`)

Surfaces are a **blue-black hierarchy**: every level is a cyan/blue luminance step, never a gray or white wash.

| Level / role | Rendered (sampled from the app) | Use |
|---|---|---|
| 0 · App background | `#000a11` (`--ink-1` `#010b13`) | The page. |
| 1 · Sidebar / bars | `#020f18` (`--rail`); top bar, tabs, phone tab bar solid `#010b13` | Navigation. |
| 2 · Primary panel | `#05131d` (`--panel`) | Survivors, Team Form, home panels. |
| 2− · Recessed panel | `#04121a` (`--panel-deep`) | Evidence lists: markets, line history, head to head, injuries; the scripts field. |
| 3 · Raised | `#0c1d2f` (`--panel-raised`) | Model tiles, team cards, hover. |
| 4 · Lead / selected | Model Read `#061a2d` with a blue light; selected script glow; active nav `#1e8cf2` | What comes forward. |
| Hairline | `#092434` (`--panel-line` `rgba(38,150,214,.24)`) | Cyan, crisp. |
| Text | primary `#f7f9fb` (data and titles in white, heavier); secondary `#acbece`–`#b4c6d6` | |
| Gold | price chips `#f6cf62→#e2ad2e`, rendered `#e3b23a` | Older prices keep the gold and add a corner tick. |
| Cyan / ice | `#1fb2ec` | Signals, coverage. |
| Blue (navigation) | `#1e8cf2` | Active tab (with glow), pills, sidebar. |
| Green / red | `#1fe08f` / `#ff5165` (rendered `#1eda8b` / `#e1495c`) | Model − Market sign, W/L. |
| Script identity (edges, glow) | `#ff4f6e` · `#ffb522` · `#2f9bff` · `#a974ff` | Over deep fields `#7a0f2a` · `#6e4600` · `#08408a` · `#3f1a86` with a near-black centre. |

`scripts/dev/color-audit.py` (development only) compares a rendered screenshot with the mockup by dark-field
hue, blue-black vs neutral share, luminance, vivid-accent share, bright-text share and dominant dark clusters.

Two tiers for script colour: **mark** colours (survival cells, script bars, dots) pass the dataviz validator
on `#081622` with no warnings (worst adjacent deutan ΔE 9.0); **identity** colours (card edges, glows, the
big share figure) are brighter, as in the mockup, and are always shown beside the script's name. Chart
marks `#2a8fe6` / `#e8505f` / `#9264ef` pass all checks. Team colours are brand presentation only.

## 2. Type (self-hosted via `@fontsource`; no runtime Google Fonts)

| Face | Use |
|---|---|
| **Instrument Serif** 400 (+ italic) | Selective display and editorial moments only: page mastheads, team nicknames in the hero and featured band, the model read, the script share figure, panel titles on the homes. Never body text, tables or controls. |
| **Instrument Sans** (variable) | All UI: navigation, tabs, panel titles inside the game, labels, body, table text. |
| **Roboto Mono** (variable) | Prices, model values, records, ranks, times — anywhere alignment helps (`.num`, `.price`, tabular). |

## 3. Space, shape, motion

4 px grid (`--s-1`…`--s-12`), radii 4/8/12 px (crisp, not bubbly), 44 px touch targets. Motion is
120/220 ms and off under `prefers-reduced-motion`.

## 4. Shell & navigation

* **Desktop ≥ 1100 px** — left sidebar (220 px): serif Sift wordmark, Home, every sport (NFL, CFB, MLB, NBA,
  NHL, Soccer, Tennis, MMA, PGA, More), then Research, Parlays, News, Search, and Settings at the foot.
  Top bar: breadcrumb, search, research tray.
* **Tablet 720–1099 px** — the same sidebar as a 78 px icon rail with small labels.
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
| **Game hero** | Hand-picked venue photo pinned in `scripts/stadiums/venues.json` only when it meets the hero bar (inside the bowl, atmosphere, composition, resolution), colour graded and credited with the modification; otherwise the designed **StadiumFallback** (floodlight banks and beams, lit pitch, stands with crowd speckle, the venue on an LED fascia, a breath of home colour, grain) — never a mediocre picture. Kickoff weather is a glass block: temperature in the serif, condition, wind, precipitation; a condition that plausibly matters (wind ≥ 15 mph, precipitation ≥ 50 %, ≤ 32 °F, ≥ 90 °F) gets a gold flag. Indoor / roof closed says so. Photo credit links to Data & provenance. |
| **Script card** | Name, sim share (whole %), one-line description, glyph. Click = select (deep-linked `?script=`); "All scripts" returns to the uncertainty view. |
| **Survival grid** | Four cells per market, one per script: filled = wins in every game of that script, half = some, empty = loses. Coverage = sim share of the scripts it always wins. Exact only for margin-settled markets. |
| **Price token** | Gold-framed YES ask; dashed/dimmed when the quote is aging/stale; exact age in its title. |
| **Model − Mkt** | Model probability minus the market midpoint in points, quiet green/coral. Never called "edge". |
| **Quote chip** | Says "Updated 4m ago"; the FRESH/AGING/STALE/UNKNOWN state (unchanged thresholds) is the dot tint, `data-quote-state`, the accessible name and the popover. |
| **Team logo** | The team's actual logo (`public/teams/nfl/`, fetched once by `scripts/teams/fetch-logos.mjs`; licensing to be settled by the owner). No initial shields. A sport without logos falls back to its abbreviation. |
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
