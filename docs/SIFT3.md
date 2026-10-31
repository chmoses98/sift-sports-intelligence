# SIFT 3.0 — development build

SIFT 3.0 is the premium mobile-first interface designed in the *SIFT 3 Visual Implementation Kit* (29 approved mockups, a visual
contract and a universal click map). This document is the engineering handoff for the first overnight build. Nothing here is
live: it is an **opt-in route inside the existing app, on a feature branch, behind `#/v3`**.

* Visual verification, reference-versus-implementation comparisons and test results: [VISUAL_QA.md](./sift3/VISUAL_QA.md)
* Design authority: the kit's `VISUAL_IMPLEMENTATION_CONTRACT.md`, `UX_CLICK_MAP_APPROVED.md`, `REFERENCE_INDEX.md`
  (not vendored here; they are the owner's design documents).

## Production protection

| Concern | State |
|---|---|
| `main`, GitHub Pages deploy, v4, SIFT 2.0, classic | **Untouched.** The only edit outside `src/v3` is one route entry in `src/App.tsx` (lazy `#/v3` subtree). No classic address redirects into v3 and v3 is not the build's default. |
| Existing workflows, schedules, approval ledgers, projection promotion (PR #143) | Untouched. No workflow file was edited. |
| Models | No model activated, no projection created. v3 reads published research as-is. |
| Spending / paid services | None. Score feed use is the repository's existing free-tier SportScore adapter (NBA only, same on/off switch as v4). |
| Notifications | Never requested. The bell records a choice on the device only. |
| Isolation test | `tests/v3/isolation.test.ts` fails if anything outside `src/v3` imports it (except `App.tsx`), if sample fixtures leak into non-demo code, or if v3 touches an unlicensed score host or the notification-permission API. |

## How to run it

```bash
npm ci
npm run dev
# real published data:   http://localhost:5173/sift-sports-intelligence/#/v3
# labelled sample data:  http://localhost:5173/sift-sports-intelligence/#/v3?demo=1   (?demo=0 turns it off again)
```

Sample mode shows an unmistakable "Sample data" strip on every screen, labels every sample score/price/stat, and is the
deterministic fixture set the screenshot and Playwright tests use. **Real mode is the default.**

## Architecture

```
src/v3/
  V3Root.tsx        shell: three-tab bottom nav (Home, Props, Following), sheet host, slate provider, sample-data strip, scroll memory
  routes.tsx        children of /v3 (each screen is its own lazy chunk)
  v3.css            tokens (contract §2), shell, shared primitives, sheets   — everything scoped under .v3
  model/            pure view-model + logic: types, price/fee formatting, research engine, game priority (priority.ts), Home feed grouping (homeFeed.ts), conferences, switcher rules
  data/             adapters from the existing publications/contracts to the view-model; hooks; sample-data-free
    adapt.ts          board rows -> V3Game; Kalshi ladders -> compact lines; player props
    useSlate.tsx      one cached slate for every screen (real via the opportunity layer, or sample)
    useGameExtras.ts  lazy per-game documents + the app's live-quote overlay (a quote is only ever replaced by a newer one)
    useTeam/useStat/usePlayer/useSearch.ts   explorer profiles, rankings, game logs, search indexes
    lens.ts           SIFT Lens from the publication's own matchup rows (observation + counter-case + source age)
  demo/fixtures.ts  SAMPLE DATA ONLY (real team identities/logos, fictional scores, prices, stats)
  state/            device-local stores: follows, alerts (separate), saved research, recents, preferences, scroll memory
  ui/               Icon, TeamLogo, Sheet, Controls (star/bell), Switcher (rail + picker), GameCard, BarChart, LineChart, …
  screens/          Home (the games feed), GameDetail (+GameTabs), Team, Stat, Player, Props, Search, Following, Settings
```

Key rules the code enforces:

* A screen reads only the **view-model**. The adapters decide what a field is and leave it `null` when the publication
  does not state it; screens then print an honest "unavailable" state. No screen invents a number.
* **Follow (star) and alerts (bell) are separate stores.** Starring never subscribes to anything.
* Every price is a Kalshi YES ask in **cents with the venue's implied %** ("52¢ · 52% implied", pre-fee). The market
  detail sheet shows exact ticker, side, line, bid/ask, taker fee, fee-aware break-even and the quote's true age. Quotes
  older than 30 minutes are dimmed, labelled "last known", and never shown as a current price. SIFT shows no bet buttons.
  Kalshi threshold ladders are reduced to the rung nearest 50¢ and labelled Kalshi, never sportsbook odds.
* Tap regions are independent (card body / team / lines / star / bell). Icons never take the tap (a WebKit quirk).
* Back restores tab, filters, search query, chart state (all in the address) and **scroll offset** (`state/scroll.ts`).
* A game remembers where it was opened from (`nav/origin.ts`, `nav/useGameNav.ts`): switching games (rail, prev/next bar, picker) *replaces* the entry, and Back from a game returns straight to the screen that opened it (Home, Props, Following, search, a team), however many games were switched through. A deep link has no origin: Back goes Home (`/v3`) with replace.
* Skeletons reserve their final height; nothing is inserted above a tappable control after first paint (Lens and market
  rows are reserved slots).

## Real-versus-sample status by screen

"Real" = driven by the repository's published research/market data today; verified by loading it in WebKit on 2026-10-25.

| Screen | Real data | Sample (`?demo=1`) | Honest gaps |
|---|---|---|---|
| Home (games feed) | every published sport's games for a day: sport rail, NCAAF/NCAAB conference chips (CFB conference from `src/lib/cfb-conferences.json`, CBB from its team identity), day strip + calendar sheet, time-grouped sections ordered by `model/priority.ts`, Kalshi spread/total/moneyline chips (cents) | full (25-game CFB card with ranks) | **no AP/CFP rank exists in any publication today** (CFBD licence unresolved): the Top 25 chip and rank boosts appear only when a source states a rank. **NFL/CFB/NHL have no licensed live score feed**: in-play games show "Score unavailable" |
| Game Detail + Switcher | hero (photo or logo-led), phase-aware tabs, switcher rail + picker (favourites pinned), markets with live overlay, Lens from matchup rows, matchup/stats from published ranks, props from Kalshi contracts, script from published theses. **CFB (and any game whose research carries a Script Engine payload): the Overview shows the SIFT Read, the top three opponent-adjusted matchup advantages, the Primary / Secondary / Alternate / Danger scripts (causal chain citing findings), Bets That Survive Multiple Scripts with each side's own Kalshi price, Why this bet (findings for and against) and data confidence; Game Script and Matchup tabs hold the detail** | adds drive card, play-by-play, 6 matchup rows | live drive/play-by-play need a play feed that does not exist; box scores are not wired into this view; a CFB game whose research carries no payload keeps the generic Overview and Props and shows the engine's own status and reason |
| Team | explorer profile: record from completed games, metric ranks (raw and opponent-adjusted kept apart), results, roster, injuries, schedule | sample record/ranks | CFB has no explorer metrics yet (empty-state wording says so) |
| Stat Detail | real ranking documents (sortable, windows, definition sheet, related stats, team history chart, per-opponent list) | 6 sample rankings | splits beyond windows are not published; compare mode not built |
| Player research | NFL (history layer) and NBA/NHL (profile box log) game logs; his Kalshi ladder for the coming game; filters computed from the logs | sample NBA guard | teammate with/without, pace and "projected minutes" filters are **not** offered (no data); adjusted what-if in Replay is explicitly "not available" |
| Search (`/v3/search`, header icon on every primary screen) | search index of NFL/NBA/NHL/MLB + slate teams/games; statistics without a market open Stat Detail | sample stats/player | no props category tile (no cross-game props index) |
| Following | every followed sport together (optional sport chips filter only, kept in the address): live games (starred game, followed teams, followed players' teams) as the app's game card; player updates from the published game log (NFL history layer, NBA/NHL profile box log) with the coming game's Kalshi lines (lines only, no price); upcoming by day; recent finals from the published slate; unfollow and per-item alerts (separate stores); saved research with frozen snapshot | same | notifications are choices only. **No live player-stat feed exists**, so a player in a live game shows his last games and says so. Results come only from the published slate (no per-team results archive) |
| Settings | price format, text size, reduce motion, clear data | same | no accounts / sync |

## Not built (prioritised next steps)

1. The offline/degraded full-state set (the degraded wording and an offline strip exist inline; there is no dedicated screen). The first-run welcome sheet is built.
2. Stat comparison mode (`27_stat_comparison.png`).
3. Box scores inside Game Detail (the CFB Script Engine is restored there, see below). Still missing for CFB: the research-signals rail (Value Watch, Market Disagreement) and the two-script Compare mode of the Game Script tab.
4. A licensed live-score source for NFL/CFB/NHL (blocked on data rights, not on UI).
5. Photographic hero art beyond the verified venue photos already pinned in `src/lib/hero` (the mockup photography is not usable).
6. Virtualised long lists if a day ever exceeds a few hundred cards (Home renders every game of the selected sport and day; each card reads its extras only once near the screen).

## CFB Script Engine in Game Detail

The SIFT 2.0 engine ([CFB_SCRIPT_ENGINE.md](./CFB_SCRIPT_ENGINE.md)) is reused, not rewritten: `src/lib/scriptEngine.ts` decodes `event_research.extensions.script_engine` (and the verified research sidecar of a trimmed event, `src/data/scriptResearch.ts`), `src/lib/scriptMarkets.ts` builds the per-script market cards. v3 adds only presentation and gating:

* `src/v3/data/research/scriptEngine.ts` states the payload per game: `ready` (carries `script_generation`), `unavailable` (the engine's own status and reason), `none`, `loading`.
* `src/v3/model/capabilities.ts`: CFB's `gameScript` and `gameMatchup` are declared `gated`; `gameCapability(slug, section, { scriptEngine })` opens them for **a game** only when its research carries the payload, for any sport. `tabsFor` (GameDetail.tsx) follows: Overview, Game Script, Matchup, Props for a Script Engine game; Overview and Props otherwise (NFL keeps its five).
* `src/v3/model/scriptRead.ts`: matchup advantages (the engine's MATCHUP findings, strongest first; an even matchup, which states none, shows its largest published adjusted gaps labelled "no finding"), script cards with causal chains citing findings, surviving bets (scoring contracts excluded), why-this-bet evidence for and against.
* `src/v3/data/research/scriptPrices.ts`: a script row is a contract **side**. YES is priced by the YES ask, NO by the NO ask (never 1 minus the other), both through the quote gate and the live-quote overlay; a price that fails the gate prints a dash. A tap opens the addressed contract sheet; for a NO row the sheet says its numbers are the contract's YES side.
* `src/v3/screens/cfb/`: Overview block, Game Script tab, Matchup tab, `cfb.css`.

Language rules hold (tests/v3/scriptOverview.test.tsx, e2e/v3-cfb.spec.ts): scripts are ranked, never given a probability; no +EV, lock or fair price; total and team-total contracts read "Scoring: research only" and are never listed as surviving; every block says "Research only".

