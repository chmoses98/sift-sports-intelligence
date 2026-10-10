# Journey A: comparison with approved references 01 (option 1) and 02

These screenshots come from a real Chromium build of this branch (`vite build` and `vite preview`). The research
data is the live publication on raw.githubusercontent.com, read on 2026-10-10 between 17:08 and 17:20 UTC. Kalshi
quotes come from the live relay where it answered. Phone captures use 2x DPR. The references are concept art: none of
their players, prices, probabilities or scores were copied. Every number here comes from a publication.

| File | Screen |
|---|---|
| `home-desktop-1440.jpg`, `home-phone-390.jpg`, `home-phone-360.jpg` | Home |
| `nfl-game-desktop-1440.jpg` (full page), `nfl-game-phone-390.jpg`, `nfl-game-phone-390-full.jpg`, `nfl-game-phone-360.jpg` | NFL HOU @ TEN overview (`evt_1c0466d60c38da2ebd99`) |
| `nfl-sfsea-game-desktop-1440.jpg` | NFL SF @ SEA, the reference's own matchup, with real data |
| `cfb-mizzou-desktop-1440.jpg`, `cfb-mizzou-phone-390.jpg`, `cfb-mizzou-phone-360.jpg` | CFB Texas A&M at Missouri (`evt_03ae795dcfb6056381a6`, Missouri HOME), live |
| `cfb-mizzou-recovered-*.jpg` | The same game served from the verified same-run sidecar fixture (`tests/fixtures/cfb-sidecar`) |
| `degraded-cfb-mizzou-sidecar-missing-*.jpg` | Degraded: the sidecar answers 404 |
| `degraded-offline-*.jpg` | Degraded: every external host blocked |

WebKit (iPhone) captures are missing: this container has no WebKit build (`/opt/pw-browsers/webkit-*` is absent, and
installing browsers is not allowed here). The iPhone visual baselines come from CI's
`.github/workflows/visual-baselines.yml` run instead.

## Game hero (ref 02, top)

**Matches**
- The venue's licensed photo is now a darkened, directionally lit backdrop: a key light from above, with each
  team's colour glowing in from its own side.
- Each team's identity sits left and right: the city in small condensed capitals, a very large condensed code,
  the record underneath, and the logo turned toward the centre.
- The matchup line sits in the centre: `NFL · WEEK 5` / day and time with a countdown / venue and city.
- A row of lit glass stat tiles runs along the foot of the hero. NFL shows the SIFT projected score, market spread,
  market total, model win probability (two rings), the YES ask to win with its quote age, and kickoff weather.
- Phone (ref 02 phone): the matchup block is about 210px tall, followed by three stat tiles, then full-width rows
  for win probability, prices and weather.

**Differences, and why**
- Win probability is the publication's own research model (`model_view`, shadow-0.4.0). The tile says "research
  only", and the model's caveat appears on hover. The market figures are labelled "Implied". Nothing is presented as
  calibrated, and no win probability is derived from scripts.
- CFB has no win probability, projection or weather. The Script Engine publishes none of them, and Missouri's event
  carries no weather. The CFB strip shows the published CONTROL claim ("research, not a chance"), each team's
  game-winner ask with its age, and the engine's data confidence.
- Several venues have no licensed photo, including Lumen Field (SF @ SEA) and Faurot Field. Those heroes use the
  designed team-branded art, not a stadium image. Ref 02's helmet and player renders are not reproduced, because
  the app holds no licensed photo of that kind.
- The phone hero shows the photo credit under the strip (licence requirement); the reference has none.

## Game tabs (ref 02)
- Matches: an illuminated glass bar with icons (Overview, Matchups, Scripts, Props, Players, Markets, Trends,
  Injuries). The active tab is lit blue. The bar is sticky and scrolls horizontally on phones. Keys, routes, query
  parameters and accessible names are unchanged, and the NHL and MLB game pages use the same bar.
- Difference: the reference's "Similar Games", "Add to Board" and "Share" buttons are not added. No
  similar-games data is published, and save/share already live elsewhere on the page.

## Overview: Visual Intelligence Dashboard (ref 01 option 1, ref 02 body)

**NFL: matches.** The bento layout follows ref 02's arrangement:
- SIFT Game Read: a condensed headline and four icon rows. Each row is a published edge, the most-simulated script,
  or a context note, with a "View full analysis" button.
- Likely Game Scripts: image-backed cards in the four script identity colours, each with its sim share and a lit
  share bar.
- Key Matchup Advantages: rank-vs-rank bars. The stronger unit is lit green and the weaker one red.
- Player Prop Explorer: team and prop-type dropdowns, and player cards with photo, O/U line and projection. Each card
  has a mini histogram of the player's real game logs against today's line; when too few games are logged, the
  card shows the projected range strip instead.
- Top Market Context: numbered contracts with the YES ask, the quote age, and the page's quote-freshness chip.
- Game Information and Related Research.

**NFL: differences.**
- Scripts are labelled "sim share", not "probability". The publication validates no calibration for them.
- The ref's "+12% vs SEA" edge chips on prop cards are not reproduced: they would be invented model-versus-market
  claims. Each card shows the line and the projection instead.
- The prop explorer card is wider than ref 02's 4-up row. It still shows 4 cards on desktop and swipes on phones.
- A "Sift verdict" strip (No Edge / Watch) sits above the bento because model-authority semantics must stay
  visible. The reference has no equivalent.
- What Matters stays below the bento. Form, injuries and the lines are one tap down, in a closed "Form, injuries
  and the lines" disclosure.

**CFB.** The Quick Read became the SIFT Read card. Around it sit:
- Ranked Game Scripts: role-coloured cards (Primary, Secondary, Danger) with **no probability**.
- Key Matchup Advantages, from the Script Engine's opponent-adjusted FBS ranks. For this trimmed event they come
  from the research sidecar.
- Best Research, with the historical empirical range drawn as a strip.

The Deep Dive is unchanged. It still holds the V1 read, the scripts, matchup edges, the V2 read, the markets and
provenance.

**CFB: differences.**
- No probabilities or shares are shown, because none are published.
- There is no separate market card. Both teams' asks and their ages are already in the hero, and the CONTROL
  side's ask is in the read. Dropping the card keeps the overview under its 180-visible-word budget.
- There is no Game Information card, because the hero carries every published fact (kickoff, venue).
- While the sidecar loads, or when it cannot be restored, the rank card says so in one line. The page's detail
  notice gives the reason (`degraded-cfb-mizzou-sidecar-missing-*`), and the card's state follows `engine.detail.gaps`.

## Home

**Matches**
- Desktop: a deliberate stage. The featured venue photo takes about two-thirds of the width; today's games sit
  beside it as a scrollable two-column grid of compact tiles with sport filters.
- Below the stage: a Matchup Edges card (rank bars for the featured game) next to the SIFT Intelligence cards,
  then the Research Lab as one row of six lit tiles, then My Board.
- Phone: compact game chips (no market footers, about 75px tall), so the featured hero starts at about 375px on a
  844px screen and its photo and team names are above the fold.

**Differences, and why**
- The featured hero's glass panels still carry the model's own caveat text. It is required next to model
  numbers, which makes them denser than a pure graphic.
- Discovery cards are still text-led, now clamped to two lines. Their numbers live in the linked Terminal.

## Iterations
1. First pass. The backdrop was too dark, the rank bars were too dim to read, all four matchup rows ran in one
   direction, the phone stat strip was about 700px tall, and the histogram tick text was illegible.
2. Fixes: a brighter backdrop with side team glows; lit green and red rank bars, at most two or three rows per
   offense; shorter stat labels and subtitles, with full-width rows on phones; hidden histogram ticks. The CFB
   bento was widened (the `.cfov` two-column grid had squeezed it), and CFB prices were read through `isFullGame`.
3. Home: hero above the fold on phones, a balanced stage on desktop, the photo credit moved clear of the team
   names. The win-probability rings now use each club's lighter colour so they read on the dark backdrop.
4. CI review. The phone stat strip became one sideways swipe row that takes keyboard focus (axe
   `scrollable-region-focusable`). On the iPhone markets board, the stuck tab bar was translucent, so the rows
   scrolling under it ghosted through; it is now opaque. The board's live freshness line ("updated Ns ago") is
   masked in its visual check because it changes every second. In the regenerated baselines only
   `game-markets` changed materially (the masked line and the opaque tab bar). Every other screen differs by
   0 px, or by sub-pixel antialiasing on `desktop/game-script`.
5. After merge (#53). The live production check on `ba69539` found the broadcast hero's caps applied to CFB schools
   ("UALBANY", "APP STATE", "UT MARTIN"). A school's canonical spelling is its identity, so CFB names now keep their
   published case; NFL, NHL and MLB club codes keep the broadcast caps. The CFB identity e2e now reads the rendered
   text too, because `toHaveText` reads `textContent`, which ignores `text-transform`.
