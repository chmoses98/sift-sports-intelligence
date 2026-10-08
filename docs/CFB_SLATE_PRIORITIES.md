# CFB Slate Priorities, school names and type

The CFB home answers, in about five seconds: what SIFT is most interested in, which game has the strongest usable
evidence, where SIFT and the market disagree, which game to open first — and whether any of it is actually a
**value** signal or only an interesting **football read**. It does that with a **Slate Priorities** rail: the same
visual pattern as the NFL rail (`docs/SLATE_PRIORITIES.md`), with CFB's own evidence and rules. It adds no model and
no score.

Code: `src/lib/cfbPriorities.ts` (pure, deterministic rules) · `src/views/cfb/CfbPriorities.tsx` (the rail) ·
`src/views/cfb/CfbHome.tsx` (layout) · tests `tests/cfbPriorities.test.tsx` (real fixture `tests/fixtures/cfb`),
`tests/cfbIdentity.test.ts`, `e2e/cfb.spec.ts` · production `scripts/cfb-production-check.mjs` (section 5).

## Data path

```
cfb-edge-finder
  main/app/latest/board.json                         status, start_time_utc, participants (code + name)
  research-signals/signals/cfb_research_signals.json cfb_research_signals/1.x, per game:
      status (CLAIMS_PUBLISHED / NO_SUPPORTED_CLAIM / NOT_BUILT), data_quality (HIGH / MEDIUM / LOW),
      claims.control {side, strength MODERATE|STRONG, tier, team}, claims.closeness, pace, scoring,
      defensive_suppression, disruption[], historical {median, central_50, wins, n},
      market {is_control_side, price {status, yes_ask, captured_at, market_ticker}}
    and once for the slate: signals.moderate_control.status (VALUE_WATCH …), signals.strong_control.status
    (NO_EDGE: "market approximately efficient"), signals.market_disagreement {rule.below_cents, status}
        │
live quotes (feed / relay) for each CONTROL side's own ticker — wins only when newer than the contract's capture
        ▼
lib/cfbSignals.ts slateGame()  →  SlateGame {item, g, price, disagreement, valueWatch, tier}  (the home already
                                  builds these for Top CFB Signals and the cards; the rail reuses them)
lib/cfbPriorities.ts cfbPriorities()  →  the rail
```

No change to `cfb-edge-finder` was needed.

## Who is eligible

A game is eligible only while its board status is `SCHEDULED`, its start time parses and is still in the future on
the app clock, and the contract has a published read for it (`status === 'CLAIMS_PUBLISHED'` with claims). Live,
final, kicked-off and unknown-time games never appear. A price is usable only when it is executable (a YES ask
strictly between 0 and 1) and observed within 30 minutes (FRESH < 15 min or AGING ≤ 30 min, the app's quote policy).

## Sections (at most five items; a game appears once)

Selection order (for de-duplication): Value → Disagreement → Read → Watch → Look. Display order: Value, Read,
Disagreement, Watch, Look.

| Section | Selected when | Fields | Ordering (presentation only) | Disappears / says |
|---|---|---|---|---|
| ⭐ **Top Value Signal** | A **Value Watch** game: Moderate CONTROL while `signals.moderate_control.status === 'VALUE_WATCH'`, with a usable price | `claims.control.strength`, `moderate_control.status`, `market.price` / live quote | data quality (HIGH → LOW), then kickoff, then event id | Always shown. Value Watch games with only stale prices → **"Waiting for updated prices"**. Framework not at VALUE_WATCH → **"No strong value signal yet"** (no active value signal). Value Watch games with no executable price → "No strong value signal yet" (nothing priced). No Value Watch game → "No strong value signal yet … not enough market separation". **Never** filled with a Strong CONTROL read. |
| 🏈 **Strongest Game Read** | A Strong CONTROL read | `claims.control`, `historical.median`, `data_quality` | widest historical winning margin for the tier (`historical.median`), then data quality, kickoff, event id | Omitted when no Strong CONTROL game is still to play. Needs no price. Labelled **"Football read · not a bet"** with the contract's own market summary ("Market approximately efficient so far"). |
| ⚠️ **Biggest Market Disagreement** | The contract's own flag: Strong CONTROL with the CONTROL side's executable ask below `rule.below_cents` (85¢), on a usable price | `market_disagreement.rule`, `market.price` / live quote | furthest below the line first (lowest ask), then data quality, kickoff, event id | Omitted when nothing is flagged; **"Waiting for updated prices"** when flagged games have only stale prices. Labelled **"Exploratory · not a bet"**: the contract's status for this cut is INSUFFICIENT_DATA and its retrospective basis is negative. |
| 🔥 **Game to Watch** | A close-game profile carrying at least `WATCH_MIN_CLAIMS` (2) research claims in all | `claims.closeness`, `pace`, `scoring`, `defensive_suppression`, `disruption[]` | most claims, then data quality, kickoff, event id | Omitted when none qualifies. One plain line from the claims ("Profiles as a close game, with a slow pace and elevated scoring."). Labelled "Interesting · not a bet". |
| 👀 **Worth a Look** | One more, only when one exists: the next Value Watch game on a usable price, else the next Strong CONTROL read | as above | as in its own section | Omitted otherwise. Carries the same Value / Football-read mark as its kind. |

Rail states: "Reading this slate's research…" while the contract loads; "Research signals unavailable" when it
cannot be read; "No upcoming games" when everything on the slate has kicked off; "Research still building" when no
game still to play has a published read.

Every item links to its game (`/cfb/game/<event>`); the value item also offers the existing Value Watch filter
(`/cfb?f=value-watch`). Routes, deep links and Back are the app's own.

### Value vs CONTROL — the hard line

* **Value** is what the contract's value framework says: a Value Watch game (Moderate CONTROL while the framework's
  status is VALUE_WATCH) on a fresh executable price. Only value items are gold, carry the **"Value signal"** mark
  and lead with a price.
* **Strong CONTROL** is a football read. The contract says the market already prices it about right (NO_EDGE), so
  the rail never calls it value, never shows it in the value slot and shows it without a price.
* **Market Disagreement** is an exploratory flag. It is shown with its price (the price *is* the disagreement) and
  "Exploratory · not a bet — the market may be right".

### What the orderings are not

They decide which *qualifying* game is shown first; they never decide whether a game qualifies, are never shown
as a number, and are not a validated predictive model. All thresholds are named constants or the contract's own
values (`rule.below_cents`), asserted in `tests/cfbPriorities.test.tsx`.

## Desktop / tablet / phone

* Desktop (≥ 1100 px): Top CFB Signals and the research-signals tiles on the left, the rail on the right, both
  starting on the same line; This Slate's cards and the Full Schedule run full width below. The other signal lists
  (Strongest Football Edges, Market Disagreement, Close Game Profiles, Pace / Scoring Spots) pack into balanced
  columns, and the two longest are capped at eight rows with "See all" (the filter shows every game), so neither
  column leaves a hole.
* Tablet (720–1099 px): the rail first, its items in two columns.
* Phone: the slate line, then the rail, then Top CFB Signals, the cards and the schedule.

## School names (why "St. at St." happened, and the fix)

Two things combined:

1. **The publication's names are abbreviated.** The board's `display_name` is Kalshi's: "Iowa St.", "Michigan St.",
   "Mississippi St.", "Miami (FL)"; one live row was even malformed ("University" vs "Albany at Stony Brook").
2. **NFL "City Nickname" logic ran on college names.** `splitName().nick` (cards, featured game, slate rows,
   model-vs-market panel), `lib/priorities.ts nickOf`, `lib/scripts.ts nick` and `insights/game.ts gameSides` took
   the *last word*: "Iowa St." → "St.", "Utah St." → "St." (so "St. at St."), "Southern Miss" → "Miss" (so
   "Miss at Troy").

The fix is one identity, applied once:

* `src/lib/cfbTeams.ts cfbName(code, published)` — the sports-facing name from the committed identity map
  (`cfb-teams.json`, built from the publication's identity-verified ESPN pairs): "ISU" → Iowa State, "MISS" → Ole
  Miss, "USM" → Southern Miss, "MOH" → Miami (OH), "MIA" → Miami, "NCST" → NC State, "APP" → App State, plus four
  public-name overrides (Penn, UMass, LIU, Albany). Every name in the map is unique (tested). A code outside the
  map keeps the published name with "St." spelled out; a fragment or a whole matchup in one row is never shown as
  a school (`TBD`).
* `normalizeCfbNames()` — run by `SportRepo` on every CFB document (and on CFB `health.json`): participant names by
  code, code-less name fields by what a coded row taught it, "A at B" labels both halves. Market descriptions are
  left exactly as published. Idempotent (the fetch cache can hand out the same object again).
* The research-signals contract and the Script Engine payload name teams by the football schedule; both are
  re-named through the ESPN id (`cfbCodeOfEspn`) so a CONTROL line, a price token and the matchup always agree.
* Every last-word helper is now sport-aware: for CFB the whole name is the name.
* `cfbMatchupNames()` guarantees the two sides of a header differ (a code is appended if two fallbacks ever collide).

## CFB script titles

The CFB home shows no script titles (it shows the contract's card lines). On game pages, three game-environment
archetypes had names that need decoding — "Competitive grind" (72 live scripts), "Competitive shootout" (65),
"Pace-driven scoring" (8). They are now said from the script's own `outcome_shape`, only what it states:
"Close, Low-Scoring Game" (one-score margin + suppressed total), "Low-Scoring Game", "Close, High-Scoring Game",
"High-Scoring Game", "Fast-Paced, High-Scoring Game" (more possessions). Team-named titles ("Memphis pulls away",
"Kent State hangs around", "Missouri controls") were already plain and are unchanged. The engine's title stays on
the card as `data-canonical` (the production check still requires exactly the published scripts).

## Typography

Barlow is installed at 400 / 500 / 600 / 700 (`src/main.tsx`). The CFB styles asked for 650, 750 and 800 in 14
places (browsers render the nearest installed face, so the hierarchy was not what the CSS said) and one italic (no
Barlow italic is installed, so it was synthesized). Mapped by role:

| Selector | Was | Now | Role |
|---|---|---|---|
| `.cfpx` | 650 | 600 | price token (matches `.prio__px`) |
| `.cfbadge` | 750 | 700 | tiny uppercase badge |
| `.cfs__h` | 750 | 700 | signal-section header |
| `.cfs__all` | 650 | 600 | "See all" link |
| `.cfrs__v--sm` | 650 | 600 | small status value |
| `.cff` | 650 | 600 | filter chips |
| `.cfc__teams` | 650 | 600 | card matchup (matches `.prio__teams`) |
| `.cfsch__more` | 650 | 600 | schedule subheading |
| `.cfsig__t b` | 800 | 700 | signal label on the Quick Read |
| `.cfrange__dl dd` | 650 | 600 | range values |
| `.cfdd__h` | 650 | 600 | Deep Dive section titles |
| `.v2chip__k` (engine.css) | 650 | 600 | V2 chip key |
| `.v2range__h` (engine.css) | 650 | 600 | V2 range heading |
| `.v2range__dl dd` (engine.css) | 650 | 600 | V2 range values |
| `.cfc__none` | italic | normal | "No clear SIFT read" — already muted by colour |

No unsupported weight or italic declaration remains anywhere in `src/` (CSS or inline). The e2e and production
checks sweep every text element on the CFB home for computed weights outside 400–700 and any non-normal style.
