# Real live scores for SIFT: evidence, permissions and what is connected

Status: **draft PR, not deployed.** Written 2026-10-22. Everything below comes from first-hand reads: requests made from a GitHub Actions runner
(`.github/workflows/live-scores-probe.yml`, `scripts/live-scores/probe.mjs`, results on the `live-scores-probe` branch) and the providers' own terms
pages saved verbatim by the probe. Nothing is from memory or search summaries unless marked.

## 1. What the feeds are and what their own terms say

SIFT today is a personal, non-commercial early-access project, so each feed's terms are read for **that** use. A feed answering a request is not
permission; the column "Covers this use?" is the terms' answer.

| Feed | Sports | Browser can read it (CORS) | Update lifetime | Terms (quoted) | Covers this use? |
|---|---|---|---|---|---|
| **SportScore** free API | NBA (and other basketball), soccer, tennis, cricket | yes, `*` | edge-cached 60 s | "free to use… personal projects, hobby sites… early-stage commercial projects that display the attribution badge"; "Cache API responses in your own infrastructure"; one condition: a visible dofollow "Powered by SportScore" link; ~10,000 requests/24 h/IP; no SLA; "cannot guarantee" accuracy | **Yes, in writing**, with the badge |
| **MLB** `statsapi.mlb.com` | MLB | yes, `*` | 20 s | every response: "Use of any content on this page acknowledges agreement to the terms posted here" → "Only individual, non-commercial, non-bulk use of the Materials is permitted and any other use… is prohibited without prior written authorization" | **Yes for individual, non-commercial, non-bulk use** (each person's own device); not for SIFT to relay |
| **ESPN** `site.api.espn.com/.../scoreboard` | NFL, CFB, NBA, CBB, NHL, MLB, MLS, soccer, tennis | yes, `*` | 1 to 10 s | Disney Terms of Use §2A: "limited… license to access and use… for your personal, noncommercial use only… with no right to reproduce, distribute, communicate to the public, make available to the public"; §3: you may not "access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means… or otherwise compiling… any collection of data" | **No. Removed from SIFT.** The adapter is kept only as development reference (`src/live/scores/reference/espn.ts`); nothing imports it, there is no switch for it, and no SIFT build contacts ESPN (enforced by `tests/live/scores-isolation.test.ts`). It is also no longer used as a verification oracle |
| **NHL** `api-web.nhle.com` | NHL | **no** (no CORS header) | 17 to 19 s | NHL Terms: "You may access, use, and display the Services, but only for non-commercial, informational, personal use… " and no "unauthorized… scraping… or other unauthorized automated means" | Personal display yes, automation unclear; and a browser cannot read it anyway |
| **NBA** `cdn.nba.com` | NBA | not measured (403 from the runner's network) | n/a | NBA Terms (read via a browser user-agent): NBA Statistics "may only be used, displayed, or published for legitimate news reporting or private, non-commercial purposes", with "a prominent attribution to NBA.com", and "may not be used in connection with any gambling activity (including legal gambling activity)" or "any fantasy game or other commercial product" | Unverified from here; and the gambling clause needs the owner's judgement because SIFT shows Kalshi prices. Not used |
| **TheSportsDB** free key | broad | not measured (403 from the runner's network) | n/a | free key: non-commercial | Unverified from here |
| **Realtime Sports API** | NFL/CFB focus | not tested | "typically 20 to 30 seconds behind" | free tier 125 calls/month (1,000 the first month); "Resell or redistribute API data without authorization" prohibited | Too small to poll; not used |
| **SportBusy** widgets | NFL/CFB/NBA/NHL/MLB (embed only) | embed | n/a | Terms of Service restrict commercial reuse and public display of league data; widgets have no data feed | Cannot drive native cards; not used |

Terms pages and dates read: Disney (`disneytermsofuse.com/english/`), NHL (`nhl.com/info/terms-of-service`), MLB (`gdx.mlb.com/components/copyright.txt`,
`mlb.com/official-information/terms-of-use`), SportScore (`/developers/terms/`, "Last updated 23 April 2026"), Realtime Sports API (`/terms`, 7 October 2026).

## 2. What this means for the four priority sports

| Sport | A feed whose own terms cover this use | Status |
|---|---|---|
| NBA | **SportScore** | connected, opt-in |
| NHL | none that a browser can read | **no real scores**; the honest "score unavailable" state stays |
| NFL | none found | **no real scores**; same |
| CFB | none found | **no real scores**; same |
| Tennis | SportScore (finished matches only, see section 3) | connected, opt-in |
| MLB, soccer | MLB official (individual use), SportScore (soccer, 200-row cap) | not connected |

## 2a. SportScore: exactly what its terms cover

Read first-hand (`sportscore.com/developers/terms/`, "Last updated 23 April 2026"; the OpenAPI spec at `sportscore.com/developers/openapi.yaml`; the developer portal).

- **Who may use the free tier:** "Personal projects, hobby sites, learning exercises … Early-stage commercial projects that display the attribution badge." SIFT today is a personal, non-commercial early-access project.
- **The endpoint.** Terms §1: "The SportScore public API (**endpoints under /api/widget/**) is free to use under the terms on this page." SIFT reads `/api/v1/fixtures/` (one UTC day of games, filterable by sport and date), which the terms text does **not** name. The OpenAPI spec does list it, under "REST v1 — Documented public REST API", with "Anonymous use allowed", and its `info` block states "Free tier: ~10,000 requests / 24h / IP, CORS-open, no API key. Requires a visible 'Powered by SportScore' dofollow backlink on pages that use the data" and names the same Terms of Use as its licence. **Verdict: covered by the spec's own description of the free tier, but not by the Terms page's explicit wording. Not confirmed in writing.** A one-line email to `api@sportscore.com` closes it (draft below). Until then, the explicitly named `/api/widget/matches/` is measured alongside it every minute during the NBA verification, as the fallback.
- **Attribution (§2):** a real `<a>` "discoverable by crawlers", `rel="dofollow"`, visible, not hidden by CSS, and **not "behind a client-side-only render that bots don't execute"**. SIFT is a React app, so the link is in the static `index.html` (what a crawler that runs no script reads) and also in the app on every screen that shows a SportScore score (Home and Games note, Game header on every tab, the Live card, early access). Tests: `tests/liveScoresAttribution.test.ts`, `e2e/v4-live-scores.spec.ts`.
- **Limits (§3):** "approximately 10,000 requests per 24 hours per IP", "edge-cached for 60 seconds — aim to cache on your side too". SIFT polls at most once a minute per UTC day shown, at most two days, only while a game is in its window and the tab is visible, with a per-device allowance of 1,500 requests a day (the tier is shared by everyone behind one IP). After a failure it backs off at least 60 s.
- **Acceptable use (§5):** may not "scrape, mirror, or rehost raw API responses", "redistribute bulk datasets", or "evade rate limits by rotating IPs". SIFT fetches from each viewer's own device, stores nothing server-side and relays nothing. The same section forbids using the API to power tools that facilitate "match-fixing, illegal gambling jurisdictions". SIFT is research-only, shows no wagering controls, and scores never touch prices, projections or signals (enforced by tests), but the owner should read that clause against SIFT's Kalshi pages.
- **Accuracy (§6):** "cannot guarantee it — scorelines … can and do change after publication. Do not use the API as the sole source of truth for anything financial". SIFT never uses a score in any financial or research decision.

Draft to send (not sent):

> To: api@sportscore.com. Subject: Confirming /api/v1/fixtures/ is covered by the free tier.
> I run SIFT, a personal, non-commercial sports research app (https://chmoses98.github.io/sift-sports-intelligence/). In the browser, on the viewer's own device, it reads `GET /api/v1/fixtures/?sport=basketball&date=YYYY-MM-DD&limit=200&src=sift-personal` at most once a minute per day shown, and displays "Powered by SportScore" (rel=dofollow, in the page's static HTML and next to every score). Your Terms §1 names endpoints under /api/widget/; your OpenAPI spec lists /api/v1/fixtures/ as part of the documented public REST API under the same terms. Can you confirm /api/v1/fixtures/ is covered by the free tier on those terms?

## 3. Verification results so far

Run from a GitHub runner with real internet (the build sandbox blocks these hosts; see `docs/LIVE_SCORES_VERIFY.md` for the same checks on a Mac).

**The built app in real browsers** (`scripts/live-scores/real-browser.mjs`: the production build, live scores switched on, real published boards, real feeds;
Chromium as Pixel 7 and desktop, WebKit as iPhone 15 Pro; 2026-10-22 16:00 to 16:10 UTC):

- SportScore answered every request `200` with `access-control-allow-origin: *` and `cache-control: max-age=60`; the app's own cadence is one request per 30 s per UTC day shown.
- Home, Games, Game and each sport's Home rendered with the source line "Scores from SportScore · 2 of 6 games in play window matched · feed answered 8 s ago · Powered by SportScore" (and "SportScore, ESPN" with the ESPN switch on). No page errors and no horizontal overflow on any profile or screen.
- The only console errors are 404s for the pre-existing Kalshi quote files (`live-quotes/games/*.json`), which the app already tolerates; none come from the score code.
- ESPN made no requests in this window: no NFL, CFB, NBA or NHL game was within 45 minutes of its start. That is by design (nothing is fetched for games that are not about to play); ESPN is exercised by the evening run below.

**Live games observed through the production adapter and matcher** (45 minutes, one poll every 20 s, 135 cycles, afternoon of 2026-10-22; only tennis was in play):

| What was checked | Result |
|---|---|
| Games matched to the published schedule (name, orientation, start window) | 3 of 11 tennis matches the feed listed for the day; the other 8 were refused `NO_EVENT` because SIFT does not publish them (correct, not an error) |
| Updates | 9 changes across 4 matches, each logged with the previous state |
| Accuracy problem found | a finished match was first reported **0-0** and corrected to **2-1** about four minutes later; a live match in its "2nd set" went 0-0, 1-0, 0-0 (one score decrease). The feed's tennis score is sets won and is not reliable in play |
| Fix | the SportScore parser now shows **no score for a live tennis match** (set label only) and shows a finished one only when it has a winner with at least two sets (`tests/live/realFixtures.test.ts`) |

Not yet verified, and therefore not claimed: live NBA from SportScore (period and clock fields), and every ESPN sport in play (NHL, NBA, NFL Thursday night NE at CHI, CFB). The evening run
covers exactly these games (NHL 23:00 UTC, NBA 23:00 to 02:30, NFL 00:15, CFB 23:00).
