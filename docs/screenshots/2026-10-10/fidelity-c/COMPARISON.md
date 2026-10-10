# Fidelity pass C — Terminal, Explore, Season, My Board, Model Pulse/Lab vs approved references 09–11

Real-browser screenshots (Chromium, live publications through the session proxy, 2026-10-10 ~16:00–17:00 UTC) at
1440×900, 390×844 and 360×780. WebKit is not installed in this container; the CI `iphone` project renders the
visual baselines in WebKit. Concept references: `09-my-board.png`, `10-intelligence-terminal.png`,
`11-explore-hub.png` (illustrative — none of their numbers, players or prices are copied).

Iterations: Terminal 3 (first pass → fixed a 1px page overflow from screen-reader text escaping the board's scroll
region, the dim unit labels, the truncated kickoff times and the half-rounded model/market numbers that read
"46.5 vs 46.5, −0.1"; then shrank the phone hero logos), Explore 2 (success column re-labelled as opponent-adjusted
±pts, Stats Lab collapsed to 9 per group, phone ranking table cut to rank/team/value and 5 rows, phone game tiles to
one column), My Board 2 (the "what changed" box moved above the items so the item rows get the width; masthead photo
from the first saved game that has an approved venue photograph), Pulse/Lab 1 + calibration sizing.

## Files

| Screen | Desktop 1440 | Phone 390 | 360 |
|---|---|---|---|
| Terminal (selection: CHI @ GB mismatch) | `terminal-desktop.jpg` (full), `terminal-desktop-viewport.jpg` | `terminal-phone.jpg`, `terminal-focus-phone.jpg`, `terminal-focus-panels-phone.jpg` | `terminal-360.jpg` |
| Terminal presets | `terminal-matchups-desktop.jpg`, `terminal-nhl-markets-desktop.jpg` (NHL priced candidate, Markets preset) | | |
| Explore hub (NFL) | `explore-desktop.jpg` (full), `explore-desktop-viewport.jpg` | `explore-phone.jpg`, `explore-rankings-phone.jpg` | `explore-360.jpg` |
| Season (Arizona Cardinals, NFL) | `season-ari-desktop.jpg` | `season-ari-phone.jpg` | `season-ari-360.jpg` |
| My Board (saved items: NHL market + NFL prop + 3 findings) | `my-board-desktop.jpg` | `my-board-phone.jpg` | |
| My Board (empty) | `my-board-empty-desktop.jpg` | `my-board-empty-phone.jpg` | `my-board-empty-360.jpg` |
| Model Pulse / Advanced Model Lab | `model-pulse-desktop.jpg`, `model-lab-desktop.jpg` | `model-pulse-phone.jpg` | `model-lab-360.jpg` |
| Degraded / unsupported | `degraded-explore-soccer-desktop.jpg` (no team rankings, no player index, no market win prices: each tile/panel says so; no photo → glass masthead), `degraded-explore-tennis-desktop.jpg` | | |

No page scrolls sideways at 1440, 1280 (e2e), 390 or 360.

## Ref 10 — Intelligence Terminal

Matches: photo masthead "SIFT TERMINAL" with layout presets (Discovery · Matchups · Markets, kept in `?layout=` and
in this browser), sport chips with counts, a Discovery Board table (Sport · Matchup with both logos and kickoff ·
Type chip · Insight · Importance bars) with type tabs, a selected-matchup hero card (venue photograph or branded
art, both logos, kickoff, venue, Overview/Scripts/Matchups/Markets links, Key Insight box with importance, Why? /
Research / Markets / Save / Pin), and connected panels that all follow the selection: opponent-adjusted matchup
(headline duel + rank-vs-rank bars for every area, offense switchable), projection vs market (model vs market
total or home margin over the simulation's published 50%/90% ranges; for priced contracts the ask / break-even /
fair / bet-up-to scale), game scripts (NFL simulation shares; CFB ranked evidence, never a percentage), relevant
markets (publication candidates with their own Back/Watch/No Edge word, then the main lines; YES ask, model fair
labelled publication vs research-only, quote age as fresh/aging/stale), context & risks, model evidence, more on
the same game, and the Market Comparison Studio when a game has two or more priced candidates. Phones: discovery
cards (logos, type chip, insight, importance), then a focused discovery with a way back.

Remaining differences and why:
- **Type filters** show only what the publications produce today: Mismatches, Model vs market, Data freshness.
  "Market moves" and "Usage shifts" from the concept are not offered — no publication emits them as findings
  (the NFL `market_baseline.game_line_moves` field exists but its units are undocumented, so it is not surfaced).
- **Projection vs market** draws ranges, not a histogram: the publications ship quantile ranges (p50/p90 bands)
  and means, not simulation samples. A histogram would have to invent bin heights.
- **"Edge" column** of the concept's markets table is not reproduced as a free-floating number; edge appears only
  as the publication's after-fee gap on its own candidates, beside its evidence word.
- **Market-only sports** (NHL, MLB, CFB Value Watch) have no offense-vs-defense pairing; the matchup panel shows
  same-metric team ranks where the research document carries them, otherwise an honest empty state.
- **Helmet artwork** in the concept is replaced by the licensed venue photograph or Sift's branded team art.

## Ref 11 — Explore hub

Matches: photo masthead per sport (licensed registry photos; glass wash where none exists), sport chips, visual
tool tiles (Team rankings, Players, Matchup tools, Prop explorer, Stats Lab, Season navigator/Schedule, Model
evidence) with honest "Not published" / "NFL only" states, the interactive team rankings table (Offense/Defense,
any published ranking as the metric, opponent-adjusted first; NFL adds adjusted success ±pts and points per game;
league percentile bars; top 10 with "Show all"), Key matchups this week (NFL biggest opponent-adjusted mismatches,
or closest games by the market's own win price), Quick stats (top-10 bar chart of any ranking, team colours,
bar = league percentile), Season timeline (18 compact week chips with published-game counts, game tiles with
logos; "—"/"Not listed" for empty weeks, never "Bye"), Stats Lab and player finder, all teams grid. Phones: 3-up
tool tiles, top-5 rankings.

Remaining differences: **Trending players** (EPA/dropback leaders) is not built — the NFL search index has no
player rankings, and deriving leaders from play-by-play would be a Sift-made statistic. **Scores on timeline
tiles** appear only in the Season navigator for the selected team (from its own profile); the league board carries
no scores. **Season/Week dropdowns** in the concept's masthead are the timeline chips instead.

## Season navigator (Arizona Cardinals)

Built on PR #46 semantics unchanged (`weekCell`, history-anchored weeks): W1–W3 "Completed" from the play-by-play
record (LAC, SEA, SF), W4 "@ NYG L 24–36", W5 current "vs DET", later weeks "—/Not listed"; a legend explains
Published / Completed / Not published / Not listed. Team header with logo, record and team select; week tiles with
large logos; weekly EPA trend. The masthead uses Arizona's own State Farm Stadium photograph.

## Ref 09 — My Board

Matches: masthead with item-type tabs (Games, Props, Markets, Findings…, only types you saved), Featured games
cards (logos, kickoff, saved count) that jump to the game, one card per game with a branded/photo header, "what
changed since saved", saved items with kind chip, saved YES ask → latest YES ask on the same ticker with the move
in cents and the quote's age, saved-ago, View/remove, notes; Key updates since saved; Slate research packets
("NFL slate packet" … labelled as research packets, explicitly not a complete betting analysis or a pick); empty
state.

Remaining differences: **per-item sparkline** (price history since save) — Sift keeps only the snapshot at save and
the latest quote, so it shows those two numbers, not a line. **Game Script Impact** matrix and **Related insights**
are not built: script fit is exact only for margin markets and saved props/findings carry no script mapping; any
arrow grid would be invented. **Injury/weather alerts since saved** are not tracked (no history of context
captures), so "Key updates" lists only price moves, lifecycle changes and newer research runs.

## Model Pulse / Advanced Model Lab

Masthead + stat strip (sports with a record, market leads, model leads, settled rows, families), one card per sport
with model/market/settled rows as display numerals, compare bars, a family-leader dot strip, family chips and an
honest capability card for MLB, CFB and CBB (no record published). The Lab adds a per-sport stat strip, headline
comparison, calibration curve (where bins exist, otherwise says so), a family table with shared-scale model/market
bars, closing-line value and the published studies; sports without a record are listed with the reason. Every
number is from `src/intelligence/evidence.ts` (publication evaluation records); nothing is computed or blended.

## Not verified here

- WebKit/iPhone rendering (no WebKit in this container) — CI renders the `iphone` visual baselines.
- Visual baselines are regenerated by the CI workflow, not locally; see the PR for the reviewed PNGs.

## Visual baselines (CI-rendered, reviewed)

Regenerated by the workflow twice (`2ba2fbf`, `012893b`). Intended redesigns: `terminal`, `board`, `season`, `pulse` in
phone, desktop and iphone. Other PNGs in those commits are either sub-threshold re-encoding noise (no pixel differs by
more than 16/255) or catch-up for changes already merged on main that had not been re-rendered: the NHL home and
game cards now use the conventional NO-side wording ("under 0.5 assist", #44/#48), the prop explorer breadcrumb
gained "Explore" (#46), and the NFL game page grew by 61 px in its markets section (#44). None of them is a screen
this PR changes.
