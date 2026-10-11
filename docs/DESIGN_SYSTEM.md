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

## 2. Type — Barlow and Barlow Condensed (self-hosted via `@fontsource`; no runtime Google Fonts)

One family in two widths. **Barlow Condensed** (latin 600/700) is the broadcast voice for the *names of things*:
page titles, section titles, panel titles, eyebrows and display numerals, set in capitals with tracking.
**Barlow** carries everything people read: body, table text, labels, one-line reads. Hierarchy comes from these
two widths, size, weight and colour — never from a third face.

| Tier | Face · weight | Token | Classes |
|---|---|---|---|
| Page title (h1) | Condensed 700, capitals | `--fs-page` (2.2–3.4 rem) | `.h-display`, `.bhome__h`, `.hubm__t`, `.skh__h`, `.hbar__h` |
| Section title (h2) | Condensed 700, capitals, `--ls-section` | `--fs-section` (1.3–1.6 rem) | `.bsec__t`, `.gsec__t`, `.sksec__t`, `.stratum__title` |
| Panel / card title | Condensed 700, capitals | `--fs-panel` (1.06 rem) | `.phead__t`, `.fx-card__t` |
| Eyebrow | Condensed 600, capitals, `--ls-eyebrow` | `--fs-eyebrow` (0.78 rem) | `.eyebrow`, `.eyebrow2`, `.fx-eyebrow` |
| Reading text | Barlow 400–600 | `--fs-md` and below | everything else |

The scale lives in `tokens.css` and is applied once, for every screen, by `src/styles/lane-a-type.css` (loaded last;
a contextual size such as a rail title still wins through a more specific rule).

* **Loading.** `src/main.tsx` imports `@fontsource/barlow/{400,500,600,700}.css` and
  `@fontsource/barlow-condensed/latin-{600,700}.css`. No italics (`font-synthesis: none`). The build preloads the
  latin Barlow 400 and 600 files (`vite.config.ts` → `preloadBarlow`).
* **No layout shift.** `--font-sans` falls back to `'Barlow Fallback'` (Arial/Helvetica resized to Barlow's metrics).
* **Numbers.** `font-variant-numeric: tabular-nums` on `.num`, `.price`, `.gap`, `.bnum` and display numerals, so
  odds, percentages and scores align and do not jitter. Numbers are not monospaced.
* **Capitals** are for names of things (titles, eyebrows, club codes). Sentences, explanations and data stay in
  sentence case.
* **The one exception:** `--font-mono` (system `ui-monospace`) for `<code>`, Kalshi tickers and the plain-text packet.

## 3. Space, shape, motion

4 px grid (`--s-1`…`--s-12`), radii 4/8/12 px (crisp, not bubbly), 44 px touch targets. Motion is
120/220 ms and off under `prefers-reduced-motion`.

## 4. Shell & navigation

Six destinations, one search, no decorative masthead (`src/lib/destinations.ts`, `src/components/Shell.tsx`):
**Home · Games · Props · Research Lab · Intelligence · My Board**. Props is the top-level Player Prop Explorer
(`/props`); Research Lab is the research hub (route `/explore`).

* **Wide screens (≥ 720 px)** — one compact header: Sift wordmark · the six destination tabs · the search field ·
  Settings; a sport strip under it on Home, Games and sport screens.
* **Phones (< 720 px)** — the bottom tab bar holds five: Home · Games · Props · Lab · Intel (accessible names are
  the full labels). My Board is a bookmark (with its count) in the phone header; the Sports sheet lists every sport
  plus My Board, Model Pulse, News, Data & provenance and Settings.
* **Search** — one command palette for the whole app (header field, `/`, ⌘K / Ctrl-K). Enter goes to results.
* **Breadcrumb** — a slim line above the page (not sticky), the research path since the sport's home
  (`state/trail.tsx`, `nextTrail`). Hub tools name their hub: `EXPLORE_STEP` (Research Lab), `PROPS_STEP` (Props).
* **Scroll** (`src/components/ScrollManager.tsx`, rules in `src/lib/scroll.ts`): a new screen opens at the top; a
  filter, selection or tab change on the same screen keeps the reader's place (a tab change puts the section tabs
  just under the header); back/forward restores the position as the page loads and stops the moment the reader
  scrolls; `navigate(to, { state: { scroll: 'top' | 'keep' } })` overrides. `scroll-padding-top` clears the header
  and, on pages with sticky section tabs, the tabs too.
* **Phone tab bar inset** — reserved once, at the end of the document (the footer).

## 4a. Progressive layers (the rule for every screen)

Takeaway → why it matters → supporting matchup → rank → raw number → detail. Layer 1 is a sentence a casual
fan understands ("Bills rush offense has a major edge"); layer 2 the two ranks behind it; layer 3 (one tap,
a `details` disclosure) the season numbers, rank first; layer 4 (links) the league ranking, methodology and
raw tables. Layer 4 is never shown by default.

* **Rank first, number second** (`lib/rank.ts`, `RankBadge`): `#3` large with its tier in words (Top 3 · Top 10
  · Middle of the pack · Bottom 10 · Bottom 3), the raw value small beneath. #1 is always the best unit for its
  job (for "allowed" metrics, the one that allows the least); descriptive metrics say "Highest"/"3rd-lowest"
  instead. Counting stats (yards, points, targets) stay number-first.
* **Ranges are written out** (`RangeBar`): the typical range (middle half of simulations) as a band with its
  numbers, the low and high ends labelled at the ends, the projection as a dot and the market line as a gold tick.
* **Market language is quiet**: the market/model comparison lives in "The Lines" at the foot of the game, on
  prop cards (projection vs line) and in the Markets tab — not in every panel title.
* **Narrow phones** (375 px and below): rank rows wrap (name, then rank) instead of truncating or pushing the
  page sideways; evidence tables stack the rank badge under 400 px. The iPhone SE smoke check enforces no
  horizontal overflow.

## 5. Screens

* **Global Home** — a one-line masthead, then the featured game (photo visible), the slate with each game's
  headline edge and most likely script, the week's biggest matchup edges, context that matters (quarterback
  changes), props to watch and your research.
* **Sport home** (`/nfl`) — the sport's landing page: featured game, props to watch, this week's tiles
  (stadium strip, headline edge, most likely script in words), Script Outlook (plain script names, most likely first), recent
  results, structures. Where prices and projections differ sits in a collapsed layer. The
  full slate is `/nfl/slate`.
* **Game** — a clean hero (teams, time or score, venue, conditions — nothing else on the photo), then
  Overview: the **Sift verdict** strip (what the sport's own candidate layer says about this game through the
  shared opportunity system — the opportunity cards, or "no published opportunity" with the precise reason) →
  **What Matters** (3–5 cards: matchup edges and context notes ordered together by importance,
  at most one scheme note — `insights/matters.ts`) → **How It Could
  Play Out** (scripts most likely first, each with the player who carries it) → **Props to Watch** → form and
  injuries that matter → The Lines. Deeper tabs: Matchups · Scripts · Props (the prop board, docs/INSIGHTS.md) · Players · Markets · Trends · Injuries.
  CFB's Scripts tab maps the selected script to exact contracts: each card says what the side pays when, what it
  costs after Kalshi's fee, the football it needs, the scripts it loses in and the other rungs of its thesis
  (`lib/scriptMarkets.ts`). Script survival stays a count; no card turns a rank into a probability.
* **Player** — research first, market second. Real photo, then **This game** (projection, labelled range, the
  line, the matchup rank), then **Game by Game**: windows Last 5 · Last 10 · this season · last season (last 5/10
  span seasons), a sentence ("3 of 5 above today's line of 89.5"), the window's average and range, where today's
  projection sits, the per-game league rank for the stat (cut before this game's week), and bars against
  **today's** line (historical lines are not published, and the page says so). Usage & role, splits, the full
  log and every stat's projected range are one layer down. Then Usage & Role, the matchup and availability
  (beside the research on screens ≥ 1200 px), and last **Market Context**: the main line and the
  market-implied average, with the fair-price ladder one tap down.
* **No decorative script bars.** A script distribution is written out ("Most likely: Close Game Either Way 36%");
  the segmented colour bar was removed everywhere.

## 6. Components

| Component | Rule |
|---|---|
| **Featured matchup (Home)** | Venue photo or branded graphic; both clubs in their own colours (name rules, a two-colour foot edge); one scoreboard strip — Sift projection, market, model win chance, key matchup. Each limitation is one short phrase ("Research model · behind the closing market"); the publication's full caveat, model version and market basis sit behind info buttons. |
| **Team colour** | Authentic club colours (`lib/teams.ts`, hero registry) as accents only — bars, rules, glows. `lib/hero/accent.ts` picks the primary colour when it reaches 3:1 on the dark surface, else lifts it slightly, else uses the secondary; text is never set on team colour. |
| **Game hero** | Hand-picked venue photo pinned in `scripts/stadiums/venues.json` only when it meets the hero bar (inside the bowl, atmosphere, composition, resolution), colour graded and credited with the modification; otherwise the designed **StadiumFallback** (floodlight banks and beams, lit pitch, stands with crowd speckle, the venue on an LED fascia, a breath of home colour, grain) — never a mediocre picture. Kickoff weather is a glass block: temperature as a Barlow display figure, condition, wind, precipitation; a condition that plausibly matters (wind ≥ 15 mph, precipitation ≥ 50 %, ≤ 32 °F, ≥ 90 °F) gets a gold flag. Indoor / roof closed says so. Photo credit links to Data & provenance. |
| **Script card** | Plain title a casual fan reads instantly ("Bills Win Big", "Bills Win Comfortably", "Close Game Either Way"; the canonical bucket stays in `GameScript.canonical`), sim share (whole %), one-line margin summary, the centerpiece player (photo + why: "BUF run 34 times in these games (28 on average)"). Always ordered most likely first; colour identity stays with the script. Click = select (deep-linked `?script=`). |
| **What Matters card** | Kind (Major/Clear edge · Context · Scheme), one-sentence headline, the two ranks, why it matters, "The numbers behind it" disclosure, Dig deeper. |
| **Dig deeper** | Saves one finding (not a game) to Research with its numbers as the packet note. |
| **Survival grid** | Four cells per market, one per script: filled = wins in every game of that script, half = some, empty = loses. Coverage = sim share of the scripts it always wins. Exact only for margin-settled markets. |
| **Price token** | Gold-framed YES ask; dashed/dimmed when the quote is aging/stale; exact age in its title. |
| **Model − Mkt** | Model probability minus the market midpoint in points, quiet green/coral. Never called "edge". |
| **Quote chip** | Says "Updated 4m ago"; the FRESH/AGING/STALE/UNKNOWN state (unchanged thresholds) is the dot tint, `data-quote-state`, the accessible name and the popover. |
| **Player photo** | Only a game-day frame in the player's current uniform; never a press conference, interview, draft or camp frame, off-field event, college or former-team uniform (`lib/player-image-blocklist.json`, enforced by `lib/players.ts` and `scripts/players/fetch.mjs`). No approved photo → the team-branded frame (both colours, livery bands, logo). |
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
