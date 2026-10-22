# Real feed excerpts (recorded 2026-10-22 from a GitHub Actions runner)

`espn-*.json`: the first one or two events of ESPN's public scoreboard for the day, with fields SIFT never reads removed (links, logos, odds, leaders).
`sportscore-basketball.json`: the first two matches of SportScore's `/api/widget/matches/` for basketball (NBA results from 2026-10-21).
Real payloads, nothing invented. The games are scheduled or finished, so they exercise identity, timing and final scores; live-state (period, clock)
fixtures are added from recorded live games. Source terms: docs/LIVE_SCORES_REAL.md.
