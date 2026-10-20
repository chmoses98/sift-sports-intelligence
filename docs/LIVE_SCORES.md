# Live scores — audit, provider decision, contract and plan

Status: **proposal, nothing deployed, nothing purchased, nothing merged.** Written 2026-10-20 on branch
`claude/live-scores-infrastructure`. Production UI, projection models, the Kalshi relay and the quote feed are untouched;
everything added is new files (`src/live/scores/`, two test files, fixtures, this document).

## 0. Read this first: what is and is not verified

The session that produced this document had **no network path to any score provider**: every provider host
(ESPN, MLB, NHL, NBA, TheSportsDB, API-Sports, Sportradar, Sportmonks, The Odds API, SportsDataIO, football-data.org,
RapidAPI, Patreon) was refused by the environment's network policy (HTTP 403 from the proxy / DNS failure). Consequences:

* Every provider fact below (price, rate limit, coverage, latency, terms) comes from **web-search summaries and
  third-party pages, not from the providers' own pages or from measurement.** Where a source is third-party or
  contradicts another, it is marked *unverified*. Prices must be re-read on the official page before any purchase.
* **No update frequency was measured.** "Claimed" latency is a vendor or blog claim.
* **No fixture is recorded.** The fixtures in `tests/fixtures/live-scores/` are hand-written and labelled synthetic; they
  test code, not providers. Phase 0 below replaces them with recorded samples.
* **No licence text was read first-hand.** The rights column is a screening, not legal advice.

To unblock Phase 0, an owner adds the provider hosts under *Network access → Allowed domains* in the cloud
environment settings (<https://code.claude.com/docs/en/cloud-environments#network-access>).

## 1. Audit of what exists

| Area | What it does | Live score/clock? |
|---|---|---|
| `src/live/*` + `relay/` + `scripts/publish-live-quotes.mjs` + `.github/workflows/live-quotes.yml` | The **market clock**: Kalshi quotes only. Vercel Hobby relay (15–60 s, 5 s shared cache, CORS allow-list, no secret) with the GitHub-Actions "quote feed" (every 3 min → `live-quotes` branch → raw.githubusercontent.com) as fallback. Own freshness rule (15/30 min). | **No.** Prices, volume, open interest, availability only. |
| ESPN in the repo | **Build time only**: team logos, team colours, ids (`scripts/teams/*.mjs`, committed as WebP/JSON; "the app never fetches a logo from a third party at runtime"). ESPN ids appear in publications (CBB `espn_game_id`, NBA `espn:<id>`, CFB `espn_event_id`, CBB schedule `ESPN_FALLBACK`). | **No runtime ESPN call exists.** |
| Scores on screen today | Final scores only, from the **publications** (`extensions.result.{home_score,away_score}`, NHL postmortem `final_score`, CBB `result`) and nflverse (`src/history/league.ts`). | `src/views/broadcast/lifecycle.ts` states it: *"The contract has NO live score, period or clock, so a game in play reads 'Live — score unavailable'."* |
| Game state | `eventPhase()` (`src/opportunity/lifecycle.ts`) decides PREGAME/STARTED/FINAL from the **clock and the publication's status word**; STARTED >4 h without a final = "awaiting result". Research freeze depends on it. | n/a — and must stay independent of live scores. |
| Docs | `docs/DATA_GAPS.md` §6 already names the gap and the intended shape: *"extend the read-only Vercel relay … with a `scores` path that reads one public scoreboard source server-side and stamps observation time … provider choice and terms are an owner decision."* | This document is that decision memo. |

Findings that matter for the design:

1. **Game identity is not uniform across the eight sports.** An NFL event carries `nflverse_game_id` (`2026_04_NE_BUF`)
   and team abbreviations, **no ESPN id**; CBB/NBA/CFB carry ESPN ids; MLB, NHL, Soccer, Tennis carry team ids of their own
   publications. A provider-id join would work for some sports and not others, so matching must be by evidence
   (sport + both teams + orientation + start window), with provider ids as a verified shortcut where they exist.
2. **GitHub-Actions + raw.githubusercontent is the wrong transport for scores.** The quote feed publishes every 3 min and
   raw.githubusercontent.com caches ~5 min, so scores would be up to ~8 min old. Fine as an *outage fallback*, not as the
   primary.
3. **A browser cannot hold a provider key** and most providers are not CORS-open, so any keyed provider needs the
   server-side relay pattern the repo already has.
4. **Vercel Hobby is non-commercial.** If SIFT is or becomes commercial, relay hosting moves to Pro ($20/month) — see §6.

## 2. Provider comparison (all provider facts *unverified* unless stated; see §0)

Coverage columns: ● claimed live score, ◐ partial/unclear, ○ none found.

| Provider | NFL | CFB | NBA | CBB | NHL | MLB | Soccer | Tennis | Clock / period | PBP / player stats | Cost (reported) | Claimed latency | Public-display rights |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **TheSportsDB** premium | ● | ○ | ● | ○ | ● | ● | ● (leagues?) | ○ | unverified (progress string likely) | no (unverified) | ~$9/mo (Patreon, via the site's own page); business tier price not retrieved | "2 min livescores" | Free key is non-commercial; commercial users "expected to join" the paid tier (moderator, forum). Paid-tier display/attribution terms unverified. |
| **API-Sports** (per-sport products) | ● | ◐ ("NFL & NCAA" doc title) | ● | ○ | ● | ● | ● | ○ | expected | partial (events/box) | free 100 req/day/API; ~$10–$39/mo **per product**; 5 products ≈ $75–$95 | "15 s" (blog, secondary) | Terms paraphrase: **no licence granted to publish the data in apps/sites**; permission must come from the relevant authorities; league restrictions possible. Unfavourable. |
| **Sportmonks** | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | yes | yes | free (2 leagues), €29/€99/€249 | ~15 s (blog) | unverified |
| **The Odds API** `/scores` | ● | ◐ | ● | ◐ | ● | ● | ◐ | ◐ | **no clock/period expected** (score, completed, last_update) | no | free 500 credits/mo; ~$30–59/mo (sources conflict) | "~30 s" (aggregator) | Terms bar reselling the data as a product; display wording unverified |
| **Sportradar** | ● (per-sport APIs) | ● | ● | ● | ● | ● | ● | ● | yes | yes | **sales-only**; trial 30 d / 1,000 calls / 1 QPS is **"non-commercial … internal testing"** — a public SIFT page is not a permitted trial use | 2/10/25/50 s expected-latency field; push feeds on top | Licensed B2B; display is the intended use under a contract. |
| **SportsDataIO** | ● | ● | ● | ● | ● | ● | live tier only | live tier only | yes | yes | $99–$149/mo tiers are **1-day delayed, "not for live"**; live Leagues API is sales-quoted (secondhand median ~$16.5k/yr); trial data "scrambled", not for display | real-time (live tier) | Licence says displaying scores in your licensed product is standard use. |
| **Goalserve** | ● | ● (NFL/NCAA pkg) | ● | ◐ | ● | ● | ● | ● | yes | yes | tennis $150/mo; NFL/NCAA $300/mo; all-sports from ~$800/mo | unverified | unverified |
| **api-tennis.com** | | | | | | | | ● | yes | point-by-point | $40/$60/$80 (third-party listing) | unverified | unverified |
| **football-data.org** free | | | | | | | ● 12 comps | | delayed scores | no | free (10 req/min); live add-on ~€12 (conflicting) | "delayed" | unverified; likeliest to allow display with attribution |
| **ESPN unofficial** | ● | ● | ● | ● | ● | ● | ● | ◐ | yes | yes | $0 | seconds (unmeasured) | **No published licence.** Disney terms reportedly bar automated access. |
| **MLB Stats API** | | | | | | ● | | | yes | yes | $0 | seconds | Copyright notice reported as individual, non-commercial, **non-bulk** use only. |
| **NHL `api-web`** | | | | | ● | | | | yes | yes | $0 | seconds | No API terms published; site terms reportedly bar scraping. |
| **NBA `liveData`** | | | ● | | | | | | yes | yes | $0 | seconds | No API licence; site terms: personal, non-commercial. |
| **NCAA (henrygd wrapper over ncaa.com)** | | ● | | ● | | | | | yes | yes | $0 (3 req/s/IP shared instance) | unmeasured | No data licence; the MIT licence covers the wrapper only. |

What the table says, honestly:

* **No provider I could screen gives all eight sports, with clock/period, under $100/month, with a clearly published
  right to display on a public site.** The free/official feeds have the best data and **no** granted permission; the
  licensed feeds that grant permission are sales-quoted and aimed at businesses.
* The widest *free* coverage (ESPN) is the one the owner's own publications already lean on for ids, but it is the one
  with the weakest legal footing. It is therefore treated as a **kill-switched, server-side-only** adapter, not as the plan.
* **CFB, CBB and Tennis have no low-cost source with both live data and a licence that I could find.** Plan for them to
  stay on today's honest "Live — score unavailable" (finals still come from the publications) until the owner chooses
  to spend more or to ask a vendor for written permission.

## 3. Recommendation

**Preferred provider (conditional): TheSportsDB premium — about $9/month — for NFL, NBA, NHL, MLB and Soccer.**

Why it over the others: one subscription instead of five (API-Sports); its own site says paying supporters get a
production key and "2 min livescores" across exactly those five sports; the free test key is documented as
non-commercial, which implies the paid key is the sanctioned route for a real site; and its terms read friendlier than
API-Sports' "no licence to publish" language. Sportradar/SportsDataIO are the *correct* long-term answer if SIFT ever
becomes a commercial product, and are priced accordingly.

**It is conditional on three gates, all unmet today** (each is Phase 0):

* **G1 Rights.** Read TheSportsDB's current terms for the paid tier, and ask in writing (support/Patreon message) whether
  a public, free-to-view web page may show livescores with attribution. If *no*, fall back to the Odds API ($30–59,
  score-only) or stay on "unavailable".
* **G2 Latency and accuracy.** Record the livescore endpoint for a full slate and compare against the publications'
  finals. "2 minutes" must be observed, not assumed. If real latency is worse than ~3 min the chip is simply honest
  ("Updated 4m ago"), but the value of the feature drops.
* **G3 Fields.** Confirm what the livescore response contains (score, period/progress string, a state-as-of time). The
  adapter is written to survive a feed with none of the clock fields; the UI promise is limited to what G3 shows.

**Not covered and not hidden:** CFB, CBB, Tennis (and any soccer league TheSportsDB does not stream). They keep the
existing "Live — score unavailable" wording. Options if the owner wants them: api-tennis.com ($40–$80, terms
unverified), an API-Sports NFL/NCAA subscription (~$15–$35) after a written rights answer, or a Sportradar quote.

**Estimated monthly cost (steady state)**

| Item | Cost |
|---|---|
| TheSportsDB premium (5 sports) | ~$9 (price from the site's own text via search; re-read before buying; business tier unpriced) |
| Relay hosting (Vercel Hobby, existing) | $0 — *non-commercial only*; $20 if Pro is required |
| GitHub Actions fallback feed | $0 (public repo) |
| **Total** | **~$9/month; ~$29/month if Pro hosting is needed.** Add ~$40 for tennis, ~$15–35 for CFB, if chosen. Upper realistic bound ≈ $85. |

## 4. The contract: `sift.live_game/1` (`src/live/scores/types.ts`)

One normalised game, whatever the provider.

* **Identity.** Sport, league, `startUtc`, home/away as `{ key, name, abbr, providerTeamId }`. `key` is the canonical,
  sport-scoped team key resolved through the **publication's own team directory** (`TeamDirectory`): by abbreviation
  after explicit aliases (`WSH→WAS`, `JAC→JAX`, …) or exact normalised name; anything else is `?unresolved:` and cannot
  match. Provider id + provider game id live in `provenance`.
* **State.** `phase` (SCHEDULED, LIVE, BREAK, DELAYED, SUSPENDED, FINAL, POSTPONED, CANCELLED, **UNKNOWN**), the raw
  status word, `score` (**null** until the provider reports one — never 0‑0 by default), `clock` (`period`,
  `periodLabel`, `display`, `seconds`, `direction`, `running` — null where a sport has no clock; ESPN's baseball
  "0:00" is dropped), sparse `situation` (down/distance, possession, outs, bases, last play, tennis sets).
* **Time.** `provenance.providerUpdatedAt` (when the provider says it was true, or null) and `fetchedAt` (always
  present). Freshness uses the provider time when sane (a provider time far in the future is distrusted), else the
  fetch time; a client retry never makes data younger.
* **Freshness** (`freshness.ts`, the *score* clock — separate from the market clock): LIVE < 60 s, DELAYED to 5:00
  inclusive, STALE beyond; a FINAL never ages; scheduled/postponed/cancelled have nothing to age; a live game with no
  usable timestamp is UNKNOWN and shows nothing. `liveBeforeMs` may be widened **only** to a provider's own documented
  cadence (a 2‑minute feed would otherwise never say LIVE).
* **Display mode** (`scoreView`): `LIVE` → `DELAYED` → `LAST_KNOWN` (provider down, with real age) → `FINAL` (provider
  final) → `PUBLICATION_FINAL` (the publication's own result) → `UNAVAILABLE` ("Live — score unavailable", today's wording).
  A score is shown only when one exists *and* the mode is not UNAVAILABLE. Each mode has one chip sentence.
* **Strict matching** (`identity.ts`). Accepted: a known provider id whose teams and start still agree, or same sport +
  both teams + orientation + start within the sport's window (NFL/CFB/CBB 90 min, NBA/NHL/MLB 60, Soccer 45, Tennis 24 h).
  Refused with a stated reason: sport mismatch, one team wrong/unknown, reversed home/away (allowed only for a
  declared neutral site), start outside the window, an id that now describes another pairing (`ID_CONFLICT`), two
  provider games within 90 minutes of each other for one event (`AMBIGUOUS`), one provider game claimed by two events.
  Doubleheaders pair to their own event; an event between the two games is refused rather than guessed.
* **Guards and outage** (`service.ts`): a provider chain per sport; failures recorded as fallback notes; all failing →
  last-known-good with its **real** timestamp and status OUTAGE; a FINAL that flips back to live is held one refresh
  before it is believed; score decreases and period regressions are surfaced as anomalies; minimum poll interval and
  `Retry-After` respected; an owner **kill switch** disables a provider instantly.

Prototype status: `src/live/scores/` — types, identity, freshness, service, and two adapters (ESPN scoreboard shape,
The Odds API shape: one with a clock, one without) against synthetic fixtures. **27 new tests; the full suite (1,374
tests), typecheck and lint pass.** Not wired into any screen or route. No TheSportsDB adapter exists yet **on purpose**: its
response shape is unverified and must be written from a recorded sample (Phase 0), not from memory.

## 5. Integration into Home and the Game Command Center — without touching models or betting

Principles, enforced by `tests/live/scores-isolation.test.ts` (it fails if `opportunity/`, `packet/`, `intelligence/`,
`insights/`, `history/`, `data/`, any projection module, or the quote store/overlay/preflight imports the score module, or
if the score module imports any of them):

* Scores flow through their own store and their own network path. They never enter `overlay.ts`, `store.ts` (quotes),
  `preflight.ts`, the handicap packet, `opportunity/`, or any projection/model feed. A live score is display-only.
* `eventPhase()` / `researchPhase()` keep deciding the research freeze from the clock and the publication. A live score
  never unfreezes pregame research or changes an opportunity's lifecycle.
* The Kalshi relay (`relay/core.ts`, `api/markets.ts`) and the quote feed are not modified. Scores get a separate
  function and cache.

Existing slots (all currently read the publication only; each changes **only when live data exists**, and output is
byte-identical to today when the score view is null):

1. `src/views/broadcast/lifecycle.ts` `featuredView()` — the Home featured hero. Add an optional third argument
   `live: LiveScoreView | null`; when present and `mode ∈ {LIVE, DELAYED, LAST_KNOWN, FINAL}` fill `scores` and `word`
   instead of "Live — score unavailable". `tests/featuredLifecycle.test.ts` pins the null path.
2. `src/views/broadcast/GameCard.tsx` (`SideFacts.score`) — rail/cards on Home and Games: score + chip.
3. `src/views/game/Hero.tsx` `GameHero` — today `status='Live — score unavailable · pregame research frozen'` and
   `score={final ? … : null}`; both Side score props and the cinematic `BroadcastHero` `away.score/home.score` take the
   live value. The "pregame research frozen" phrase stays: it describes research, not the score.
4. `src/views/Slate.tsx`, `src/views/nhl/NhlSlate.tsx` (`PhaseChip`), `src/views/cbb/Slate.tsx` — slate rows.
5. A status line in *Data & provenance* (like *Live market quotes*): provider, answered-by, fallback reason, age, mode.

Client side: a `useLiveScores(events, cadence)` hook backed by a small store modelled on `src/live/store.ts` (one scheduler,
visibility/online pause, backoff, last-known-good) polling the relay's `/scores?sport=` only for sports with a game
inside **kickoff −30 min … +5 h or a live status** (Home: 30 s; Game Command Center: 15 s; hidden tab: paused). Matching
runs **in the browser** from the board items already loaded (`eventRefFromBoardItem` + `TeamDirectory`), so the server
never needs the publication.

Server side: `relay/api/scores.ts` + `relay/scores-core.ts` (separate from the Kalshi core): reads the provider key from a
Vercel environment variable, runs `LiveScoreService`, edge-caches ~10 s, returns `sift.live_scores/1`
(`{ sport, status, answeredBy, fetchedAt, games[], fallback[] }`) with the same CORS allow-list and the same
`Retry-After` passthrough. *Check before building:* the relay deploys with Root Directory `relay`, which by default cannot
import `../src/live/scores`; either enable "Include source files outside of the Root Directory", or copy the shared files
in a prebuild step. Fallback tier: a Phase-3 Actions publisher to a `live-scores` branch, rendered as DELAYED/LAST_KNOWN
("Updated 6m ago"), never as live.

E2E determinism follows the existing rule: external hosts blocked, the e2e build points `VITE_SIFT_SCORE_RELAY_URL` at a
reserved-TLD host answered from fixtures; default **off**, so every current visual baseline is unchanged until the flag is on.

## 6. Implementation plan (each phase needs the owner's go-ahead; none has started)

**Phase 0 — verify before spending (no cost, ~1 day).** Owner allow-lists provider hosts. (a) Read TheSportsDB's and the
chosen alternates' terms pages; send the written rights question (G1). (b) With the documented free test key only: record
livescore + event payloads for a live slate into `tests/fixtures/live-scores/recorded/`, measure update interval for an
hour per sport, diff against publication finals (G2/G3). (c) Replace the synthetic fixtures; write
`providers/thesportsdb.ts` from the recorded shape. *Exit:* G1–G3 answered in this document with evidence, or the plan
changes.

**Phase 1 — relay path (still no UI).** `relay/scores-core.ts`, `api/scores.ts`, `vercel.json` function entry, env var
for the key, 10 s cache, allow-list, 429 passthrough; relay smoke extended to `/scores`. Unit tests on fixtures. *Exit:* the
endpoint answers a recorded slate; the kill switch works; `/markets` behaviour and tests byte-identical.

**Phase 2 — client store and hook (no UI).** `src/live/scores/store.ts`, `hooks.ts`, `config.ts`
(`VITE_SIFT_SCORE_RELAY_URL`, unset = off), diagnostics. Tests mirror `tests/live/store.test.ts` (cadence, sharing,
visibility, offline, backoff, LKG).

**Phase 3 — UI behind the flag (the first production-UI change; needs explicit approval).** The five slots in §5, one PR
each, null-path tests first, e2e fixtures, `@visual` baselines regenerated only for the flagged build.

**Phase 4 — fallback feed and monitoring.** Actions publisher to `live-scores`, Production check gains a
score-freshness assertion for current games (slate-aware, like the quote check), provider-smoke workflow records real
latency/shape drift weekly.

**Phase 5 — expansion (only on evidence/owner choice).** Tennis, CFB/CBB sources; second provider for cross-checking
finals; play-by-play and player live stats (out of scope for the first release: no low-cost source was verified).

**Maintenance cost:** one adapter per provider (~150 lines), one alias table to extend when an unresolved team shows up
in diagnostics, one kill switch. Matching refusals are logged by reason, so a new alias is a one-line data fix.

## 7. Decisions needed from the owner

1. Is SIFT (or will it be) commercial? It decides Vercel Hobby vs Pro and weighs on every provider's terms.
2. Approve Phase 0 and allow-list the provider hosts for the session environment.
3. Authorise a written rights inquiry to TheSportsDB (and, if wanted, API-Sports / api-tennis.com).
4. Is "unavailable" acceptable for CFB, CBB and Tennis for now?
5. Is an unofficial, unlicensed feed (ESPN) ever acceptable as a *private-use* source? Recommendation: **no** for the public
   site; the adapter stays kill-switched and unused.
