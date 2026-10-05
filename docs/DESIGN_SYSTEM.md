# Sift design system — *graphite & sand*

Sift guides the eye from **game → probable scripts → evidence → market fit → deeper research** through
hierarchy alone: the matchup and its scripts dominate, evidence sits one step quieter, diagnostics live at
the bottom or behind an info icon. A living reference renders at `#/design`. The approved owner mockup's
composition is the layout target; the palette and type below are locked by the owner (visual reset).

## 1. Surfaces & color (`src/styles/tokens.css`)

Locked palette: **Graphite** `#0F1115` · **Slate** `#1A1F26` · **Deep Blue** `#2A3B4F` · **Sand** `#D8C9AB`
· **Gold** `#C9A96A` · **Ice** `#6FA8C9` · **Ivory** `#F5F2EA`. No royal blue, no navy card soup, no neon.

| Role | Tokens | Use |
|---|---|---|
| Strata | `--graphite`, `--rail`, `--navy-1…4` (slate → deep blue) | Graphite page with a faint deep-blue light; each raised layer one step lighter. |
| Panel | `--panel`, `--panel-line`, `--shadow-1` | Slate gradient with a warm sand hairline. Not every block is a panel: the hero, the featured band, the model read and the script cards each have their own surface. |
| Glass | `.btn--glass`, `.wx`, top bar | Selective: only over photography (hero, featured band) and the sticky top bar. |
| Accent | `--gold` (`--cobalt` aliases it), `--sand` | Primary action, active navigation and tab underline, the price token, eyebrows. |
| Signal | `--ice` (`--cyan`) | Links and live/quiet status dots. |
| Text | `--text-hi` ivory … `--text-3` | All four steps ≥ 4.5:1 on slate. |
| Model vs market | `--pos`, `--neg` | Quiet sage / clay for the sign of a model–market gap. |
| Game scripts | `--script-1…4` (rose, ochre, teal, violet) | Four fixed roles: favourite pulls away · favourite controls · one-score game · underdog controls. Always with a name and a glyph. |
| Chart marks | `--mark-focus`, `--mark-opp`, `--mark-compare` | Home / away / third series. |
| Freshness | `--fresh` `--aging` `--stale` `--unknown` | Only as a small dot tint on a quote chip (see §6). |

Script and chart colours are validated with the dataviz validator on slate `#1A1F26` (lightness band,
chroma, CVD ΔE, normal-vision floor, contrast — all pass). The locked palette colours are deliberately
muted, so they are never used to encode data. Team colours are brand presentation only (hero washes).

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
| **Game hero** | Hand-picked venue photo pinned in `scripts/stadiums/venues.json` (night / bowl / golden hour), graded under a dark overlay with each team's colour washing in from its side; a venue without a good photo gets the floodlit fallback (radial lights, field glow), never a poor picture. Kickoff weather is a glass block: temperature in the serif, condition, wind, precipitation; a condition that plausibly matters (wind ≥ 15 mph, precipitation ≥ 50 %, ≤ 32 °F, ≥ 90 °F) gets a gold flag. Indoor / roof closed says so. Photo credit links to Data & provenance. |
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
