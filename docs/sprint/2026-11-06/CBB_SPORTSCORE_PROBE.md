# CBB live scores via SportScore: game-day probe (2026-11-06) — NOT ENABLED

Evidence: `live-scores-probe` branch, run 20 (`mode=once`), read-only GETs from a GitHub runner at 22:32 UTC on a Friday CBB slate. The build sandbox cannot reach sportscore.com (proxy 403).

## What the real payload shows
* **Coverage exists.** `/api/v1/fixtures/?sport=basketball&date=2026-11-06` returned `count 200`; `status=live` returned 13 games. Competition strings: `National Collegiate Athletic Association` (men) and `Women's National Collegiate Athletic Association`; women's teams are also marked "(W)" / "Women" in team names and share the same feed and sport filter.
* **Live games carry scores** (e.g. Boston College 51, Massachusetts 42) with `status: live`.
* **Period labels are wrong for the sport.** Live college games say "2nd quarter" / "4th quarter"; NCAA men's basketball plays two halves. Displaying that label would be false, and no clock field was observed.
* **Placeholder times.** Finished games carry `time 00:00:00Z`, so kickoff cannot be trusted for matching or freshness.
* **Names are SportScore's** ("Central Connecticut State", "Massachusetts", "Utah State Women"), not the publication's `short_name`s; a curated alias table is required, and a wrong match prints a wrong score.
* **Only two matches per feed were saved in the evidence sample**, and there is no licensed oracle to cross-check scores (ESPN/NCAA.com are not licensed, `docs/LIVE_SCORES_REAL.md` §1), so accuracy is unmeasured.

## Rights
SportScore's written terms (free tier, attribution badge) are not sport-specific, but SIFT's recorded approval (2026-10-22), `rights.ts` and the parser name NBA and tennis only. Extension to college basketball needs an explicit owner decision. Not assumed.

## Decision
Not enabled: accuracy unverified, period labelling defective, men/women not separable without name heuristics, owner approval absent. CBB in-play games keep "Score unavailable". Play-by-play: no licensed source (unchanged).

## To unblock
1. Owner approves SportScore for CBB. 2. A `verify-watch` run during a full slate saving all games (not a 2-row sample) and a second licensed reference to measure accuracy. 3. Parser: men's-only competition filter, halves labels, alias table built from the publication's 363 `short_name`s, ignore `00:00` times; rights entry in `src/v3/data/live/rights.ts`.
