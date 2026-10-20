# Live sports data: audit and recommendation

Status: **audit only.** No feed, relay path, workflow or contract change was made. Design samples that show scores, clocks and plays are labelled as samples and are not data.

SIFT is a sports companion first. The refined Home and Game screens need live state, score, period and clock, possession, plays, box score and player stats. This page records what the repository has today, what is missing, and how to supply it without inventing anything.

## 1. What exists today (verified in the repository)

| Capability | State | Evidence |
|---|---|---|
| Schedule, start time, venue | **Have** | `EventDoc` (`src/contract/types.ts`): `status`, `start_time_utc`, `effective_start_time_utc`, `start_time_confidence`, `venue`, `broadcast`. |
| Game phase (upcoming, started, final) | **Partial** | `src/opportunity/lifecycle.ts` derives it from the caller's clock first and the publisher's status word second. A started game with a stale `SCHEDULED` word is named as stale. |
| Score, period, clock | **Missing** | `docs/DATA_GAPS.md` §7: "No publication or Kalshi endpoint carries them." `EventDoc` has no score fields. `Market.period` is the period a contract covers, not the game's period. |
| Possession, down and distance, plays, box score | **Missing** | Same note. `docs/NHL.md`: "A live score is never shown (a periodic publication's live score is stale by construction)." |
| Final scores | **Partial, NFL only** | `src/history/league.ts` (`home_score`, `away_score`, `isFinal`) from nflverse. This is post-game history, not a live feed. |
| Live prices | **Have** | Read-only Vercel relay (15 to 60 s quotes, 5 s shared cache, `X-Sift-Observed-At`) with a GitHub Actions loop as fallback (every 3 min). |
| Research after kickoff | **Have, frozen** | Pregame research freezes at start. The NHL publication says so explicitly ("Frozen at puck drop"). |
| Team and event identity across sources | **Partial** | `source_ids` carries `espn_event_id` for soccer, nflverse team codes for NFL; sport-specific logo and id maps exist. No cross-source game identity check for scores. |
| Followed teams | **Missing** | No accounts. Needs client storage. |
| Push alerts | **Missing, and hard** | A static PWA has no server to send from. iOS web push needs an installed PWA and a push service. Out of scope for the first live release. |

Three repository facts shape the recommendation:

1. The quote loop works but its host is weak for live play. GitHub Actions cron was measured unreliable on 2026-10-04 (a 15:17 deploy cron never fired and a new */5 cron did not start for 40+ minutes). The workflow already works around it with a self-dispatching 55 minute loop. A 3 minute cadence is fine for prices as a fallback and too slow for a clock.
2. The relay is the right shape for live data. It is read-only, holds no secret, answers only SIFT's origins, stamps observation time, passes upstream 429 through, and "never invents data" (`relay/README.md`). It is hosted on Vercel Hobby, which the README describes as non-commercial.
3. The integrity rules already forbid manufacturing live state (`docs/sift-2.0/BLUEPRINT.md`). Any live feed must carry its own observation time, provenance and an "unavailable" state.

## 2. What the refined designs need

| Need | Minimum data | Sports where it matters first |
|---|---|---|
| Live rows on Home | status (live, final), both scores, period label, clock text, observed-at | NFL, CFB, MLB, NHL, NBA, soccer |
| Scoreboard hero | the same plus possession, down and distance or count, timeouts | NFL, CFB, MLB, NHL |
| Play-by-play | ordered plays with id, clock, text, scoring flag, team | NFL, CFB, MLB, NHL, NBA |
| Team stats | a handful of comparable totals (yards, first downs, turnovers, shots) | all |
| Player live stats | per-player counting stats keyed to the same player ids props use | NFL, MLB, NHL, NBA |
| Finals and yesterday | final score, box score | all |

Each of these must arrive with `observed_at`, a provider name and a game identity that has been checked against SIFT's own event.

## 3. Provider options

| Option | Fit | Risk |
|---|---|---|
| **Public scoreboard endpoints** (ESPN's undocumented site API; league sites such as MLB's Stats API) | Broad coverage, no cost, easy to prototype | Undocumented or restricted. Sources found in this audit describe the ESPN endpoints as unofficial and changeable without notice, and say nothing authoritative about commercial use. Secondhand reports describe MLB's notice as limiting use to individual, non-commercial, non-bulk use. **Terms are unverified.** Good for an internal spike, not a public launch. |
| **Licensed data provider** (Sportradar, SportsDataIO, Genius Sports, API-Sports or Sportmonks for soccer) | Explicit display rights, documented contract, play-by-play, support | Cost and contract. Third-party reviews put real-time tiers from about $100 a month (developer plans) to $1,000+ a month (enterprise). **No official price sheet was found.** Display and redistribution terms must be read per provider. |
| **Derived from existing sources** (nflverse and similar) | Free, reliable, already in the repo | Post-game only. Cannot supply live state. Right for finals and history. |
| **Scraping or direct browser calls** | None | Origin blocking, terms, fragility. Do not use. |

Recommendation: put every provider behind one adapter (`ScoreProvider`: scoreboard, game, plays, box) so the choice can change without touching screens. Prototype on a public scoreboard for NFL, MLB and NHL only, internally. Choose and license a provider before any public live release. The owner decides the provider and accepts its terms.

## 4. Recommended architecture (not started)

```
provider (licensed or public)
   └─ SIFT scores relay  (extend relay/: GET /scores, read-only, allowlisted origins, 5 to 10 s shared cache, X-Sift-Observed-At)
        └─ normalized sift.live.v1  (scoreboard, game_live, plays, box)  — a new contract, edge_finder.app.v1 untouched
             ├─ app: live overlay on Home and Game, polling by phase
             └─ fallback: scores-only snapshot on the quote-feed loop (3 min, labelled with its age)
```

Rules the feed must follow:

* **Observation time on everything.** The UI shows a state, not a promise: Live (under 30 s), Delayed (with the age) or Unavailable. Past a limit the score is hidden and the row falls back to start time and "In play", exactly as today.
* **Identity before display.** A provider game is attached to a SIFT event only when team ids and start time agree. A mismatch shows no score (the same rule `src/opportunity/identity.ts` applies to contracts).
* **Phase authority.** A fresh provider LIVE or FINAL overrides the clock-based phase. A stale one does not.
* **Research stays frozen after kickoff.** No live win probability or live model price is shown until a live model is validated. Pregame figures after kickoff are labelled "Pregame" and dimmed. Prices stay live.
* **Cadence by phase.** Live game 10 to 20 s, today's slate 30 to 60 s, upcoming and final 5 to 15 minutes. The relay's shared cache keeps provider calls independent of the number of viewers.
* **Failure is designed.** Provider 429 or outage passes through with `Retry-After`. The app backs off and degrades. Corrections (a changed play or stat) replace by play id.
* **Monitoring.** Reuse the pattern of `live-provider-smoke.yml`: a scheduled smoke test per sport that fails on staleness, shape change or identity mismatch, plus recorded fixtures for contract tests (as in `tests/fixtures/`).
* **Hosting.** The relay is on Vercel Hobby, described as non-commercial. A public companion app with live scores likely needs a paid host plan. Confirm before launch.

## 5. Phased plan (documentation only; nothing here is started)

1. **Decide** provider, terms and budget (owner). Read the display and redistribution clauses for each candidate.
2. **Spike** (internal, NFL, MLB, NHL): `ScoreProvider` adapter, `/scores` on the relay, `sift.live.v1` fixtures, identity checks, staleness states. No UI change.
3. **UI behind a flag** on the SIFT 2.0 route: live rows, scoreboard hero, plays. The design already carries the three states (Live, Delayed, Published only).
4. **Widen** to CFB, NBA, soccer. Add box score and player live stats. Evaluate push alerts separately.

Until step 2 passes its monitoring, Home and Game ship in the "published only" state (start time, frozen research, no score).

## 6. Sources

* ESPN endpoints described as unofficial and unstable: [Zuplo guide](https://zuplo.com/learning-center/espn-hidden-api-guide), [sportsapis.dev](https://sportsapis.dev/espn-api).
* MLB data notice reported secondhand as non-commercial: [python-mlb-statsapi](https://pypi.org/project/python-mlb-statsapi/0.8.0/), [MiLB terms of use](https://www.milb.com/about/terms-of-use).
* Provider price ranges (third-party reviews, unverified): [Sportradar review](https://sportsapis.dev/apis/sportradar), [SportsData.io review](https://sportsapis.dev/apis/sportsdata-io).
* Repository: `docs/DATA_GAPS.md` §7, `docs/NHL.md`, `docs/sift-2.0/BLUEPRINT.md`, `relay/README.md`, `.github/workflows/live-quotes.yml`, `src/opportunity/lifecycle.ts`, `src/history/league.ts`, `src/contract/types.ts`.
