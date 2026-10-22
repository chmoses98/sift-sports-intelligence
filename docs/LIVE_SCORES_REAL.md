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
| **ESPN** `site.api.espn.com/.../scoreboard` | NFL, CFB, NBA, CBB, NHL, MLB, MLS, soccer, tennis | yes, `*` | 1 to 10 s | Disney Terms of Use §2A: "limited… license to access and use… for your personal, noncommercial use only… with no right to reproduce, distribute, communicate to the public, make available to the public"; §3: you may not "access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means… or otherwise compiling… any collection of data" | **No.** Personal use of ESPN's products is licensed; scripted access is prohibited and the scoreboard API has no developer licence |
| **NHL** `api-web.nhle.com` | NHL | **no** (no CORS header) | 17 to 19 s | NHL Terms: "You may access, use, and display the Services, but only for non-commercial, informational, personal use… " and no "unauthorized… scraping… or other unauthorized automated means" | Personal display yes, automation unclear; and a browser cannot read it anyway |
| **NBA** `cdn.nba.com` | NBA | not measured (403 from the runner's network) | n/a | NBA Terms (read via a browser user-agent): NBA Statistics "may only be used, displayed, or published for legitimate news reporting or private, non-commercial purposes", with "a prominent attribution to NBA.com", and "may not be used in connection with any gambling activity (including legal gambling activity)" or "any fantasy game or other commercial product" | Unverified from here; and the gambling clause needs the owner's judgement because SIFT shows Kalshi prices. Not used |
| **TheSportsDB** free key | broad | not measured (403 from the runner's network) | n/a | free key: non-commercial | Unverified from here |
| **Realtime Sports API** | NFL/CFB focus | not tested | "typically 20 to 30 seconds behind" | free tier 125 calls/month (1,000 the first month); "Resell or redistribute API data without authorization" prohibited | Too small to poll; not used |
| **SportBusy** widgets | NFL/CFB/NBA/NHL/MLB (embed only) | embed | n/a | Terms of Service restrict commercial reuse and public display of league data; widgets have no data feed | Cannot drive native cards; not used |

Terms pages and dates read: Disney (`disneytermsofuse.com/english/`), NHL (`nhl.com/info/terms-of-service`), MLB (`gdx.mlb.com/components/copyright.txt`,
`mlb.com/official-information/terms-of-use`), SportScore (`/developers/terms/`, "Last updated 23 April 2026"), Realtime Sports API (`/terms`, 7 October 2026).

## 2. What this means for the four priority sports

| Sport | A feed whose own terms cover this use | Wider-coverage feed |
|---|---|---|
| NBA | **SportScore** (connected) | ESPN (optional, off by default) |
| NHL | none that a browser can read | ESPN (optional, off by default) |
| NFL | none found | ESPN (optional, off by default) |
| CFB | none found | ESPN (optional, off by default) |
| MLB, soccer, tennis | MLB official (individual use), SportScore (soccer, tennis) | ESPN |

## 3. Verification results

(See section 4 once the verification runs have completed.)
