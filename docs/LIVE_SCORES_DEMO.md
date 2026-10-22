# Live Score Demo (SIFT v4, opt-in)

Status: **draft PR, not deployed.** Phase 1 (the demo) is built and tested. Phase 2 (a real free feed) is **not connected**: no score
provider could be reached from the build environment, so no endpoint, coverage or term was verified. See "Phase 2" below.

## What it is

An opt-in preview that puts **simulated** scores, periods, clocks and scoring plays on SIFT v4's real games so the live-score experience can
be used and judged before a real feed exists. Every simulated number is labelled **DEMO** on every screen that shows it. It is off by
default, device-local, and one tap turns it off.

| | |
|---|---|
| Turn on | v4 early access sheet → **Turn on Live Score Demo**, or open `#/v4?livedemo=1` |
| Turn off | **Turn off** on the demo bar (top of every v4 screen), in the controls sheet, or `#/v4?livedemo=0` |
| Where it shows | Home (featured card, Live / Upcoming / Final groups, Live filter and count), Games (rows, status filters), Game Command Center (scoreboard, status badge, Live tab card with source, as-of time and recent scoring) |
| What it never touches | research, Kalshi markets, projections, signals, saves, the Board, or when pregame research freezes |

## Controls (the demo sheet)

* **The feed:** Normal · Delayed (about 75 s behind: shown with its age, never live) · Stalled (answers but stops changing) · Outage
  (fails: last scores stay, aged honestly, with "provider unavailable") · No data ("Live — score unavailable").
* **Pace:** a simulated game lasts 2, 5 or 12 minutes. **Skip ahead** 1 or 5 minutes moves the demo clock, so every simulated age moves with
  it (stall the feed, skip ahead, watch live → delayed → stale). **Restart demo.**
* **Identity check:** games on screen, feed games offered, matched, and refused by reason.

A fresh demo spreads kickoffs so some games are already final, some in play and some about to start; every phase change happens within a couple
of game lengths, so Pregame → Live → Final can be watched on a single screen.

## How it is built (and why it can be swapped)

```
 board rows ──► observedFor (identity from the publication's own participants)
                    │
   DemoProvider ◄───┘   one adapter of the provider-independent contract (sift.live_game/1)
        │
   LiveScoreService     provider chain, last-known-good, regression guards
        │
   ScoreStore           TeamDirectory → canonicalise → pairGames (identity evidence only) → scoreView (freshness)
        │
   v4 screens           read = what a screen may SHOW for that game (display only)
```

* `src/live/scores/demo/sim.ts` is the engine: deterministic per (sport, event id), so a game plays out the same way on every device and reload.
  Scoring follows each sport: NFL and CFB in touchdowns (6/7/8), field goals and safeties, four quarters with a halftime; NBA and CBB baskets,
  threes and free throws; NHL goals (some on the power play) in three periods with intermissions; soccer goals on an upward minute clock;
  MLB runs by half-inning with outs; tennis sets and games. Overtime or extra innings decide a level game where a winner is required.
* `demo/provider.ts` answers like a real feed (fast, late, frozen, failing, empty) and **deliberately offers games that are not on screen** (the same
  teams a day later, a reversed pairing). The matcher refuses each one on every refresh.
* A real provider replaces `DemoProvider` in `src/live/scores/runtime.ts`; the service, store, matching, freshness rules and screens do not change.
  Two unverified, unwired adapter drafts from the earlier infrastructure branch (`providers/espn.ts`, `providers/oddsapi.ts`) are included for that day.

## Rules held, and the tests that hold them

| Rule | How |
|---|---|
| Simulated scores never reach research, models, signals or the freeze | `GameRow.phase` is never overwritten: screens get a separate read. `tests/live/scores-isolation.test.ts` fails if any model/opportunity/projection/quote code imports the score module, or if v4's signal, props, Board, research-sheet or save code imports any score code |
| Every simulated number is labelled DEMO | rows, feature card and badge, scoreboard, game badge, the Live card heading, source line and note, the demo bar; e2e asserts each score row also carries DEMO |
| Never invent a score, clock or event | a field the feed did not report is null (no 0–0); unavailable, outage and refused-identity games show the publication's own status or "Live — score unavailable" |
| Game identity verified | provider id or sport + both teams + orientation + start window; decoys refused; `tests/live/demoStore.test.ts` |
| Freshness | LIVE under 60 s, DELAYED to 5 min, then last-known with its age; a badge says LIVE only for a live score (found and fixed by the e2e suite) |
| Real finals are not overwritten | games the publication already calls final, postponed, cancelled or suspended are never simulated |

## Not in the demo (deliberately)

Down and distance, possession, play-by-play beyond scoring plays, injuries, timeouts, and any real-time link to the actual game. Tennis shows
sets and games only. The demo clock runs at real speed (a game is compressed by the pace setting, not by speeding the clock).

## Phase 2: a free temporary feed (not connected)

**Nothing was verified.** Every provider host (ESPN, NHL, NBA, MLB, TheSportsDB, NCAA, SportScore, Realtime Sports API, SportBusy) is refused by the build
environment's network policy, so no real endpoint was called, no payload recorded, no term read first-hand. Search summaries (secondhand, undated)
are in `docs/LIVE_SCORES_FREE_AUDIT.md` and `docs/LIVE_SCORES.md` (on the audit branch). What decides the choice, and what it needs:

* **Non-commercial is not permission to redistribute.** The league and unofficial feeds publish personal-use language at best, and a public site is not
  personal use. A feed read **from the viewer's own browser** (so SIFT's servers redistribute nothing) is the more defensible shape for a
  non-commercial preview, but it needs CORS-open endpoints and a terms reading per provider: **to be verified.**
* **Per sport:** NFL, CFB, NBA, NHL each need an endpoint that returns score, status, period and clock with a state time. None is confirmed.
* **Gate before any public connection:** endpoints and CORS recorded; terms read and quoted; coverage and accuracy on a real slate; attribution
  wording; a kill switch. Until then the demo is the live-score experience and real scores stay "unavailable".

To unblock: add the provider hosts under *Network access → Allowed domains*
(<https://code.claude.com/docs/en/cloud-environments#network-access>), and say which you accept for a non-commercial public preview.
