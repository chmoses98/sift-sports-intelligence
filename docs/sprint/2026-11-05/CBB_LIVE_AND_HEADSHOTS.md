# CBB live scores and player headshots: investigation (2026-11-05)

No code shipped for either: nothing could be validated for accuracy, freshness and rights, and the rules forbid guessing.

## CBB live score and play-by-play
* Candidates probed from the sandbox: `sportscore.com`, `ncaa-api.henrygd.me` (an unofficial wrapper of ncaa.com), ESPN `site.api.espn.com`. All three were refused by the environment's network proxy (no response), so **no payload, no freshness or accuracy evidence could be gathered**.
* Rights (from `docs/LIVE_SCORES_REAL.md` section 1, not changed): ESPN is removed for good (Disney terms: personal use, no automated access). The NCAA wrapper and ncaa.com publish no licence for this use. SportScore is the only feed whose written terms cover SIFT's use, but SIFT's approval, `rights.ts` and the parser name NBA and tennis only; no recorded decision extends it to college basketball and no NCAA payload exists to test team-name matching.
* Play-by-play: none of the three offers play-by-play under terms covering this use. SIFT shows no plays today and keeps showing none.
* Result: CBB in-play games keep "Score unavailable". To unblock: owner decision to extend SportScore to college basketball, a probe-workflow run on a game day committing a real `sport=basketball` capture with NCAA games, then the competition filter, name matching and a `rights.ts` entry.

## Player headshots
* Implemented already: NFL, from Wikimedia Commons only, free licences only (`scripts/players/fetch.mjs`: author, licence and modification recorded, blocklist, human pin, never fetched at runtime).
* Not adopted for other sports: the league and publisher image CDNs (ESPN, NHL `assets.nhle.com`, MLB `img.mlbstatic.com`, NBA `cdn.nba.com`) belong to the leagues, and their terms (`docs/LIVE_SCORES_REAL.md`: Disney, NHL, MLB, NBA) grant personal, non-commercial display, not redistribution or committing the files into SIFT. Commons coverage for active NBA, NHL, MLB and college players is thin and not curated.
* Path that is appropriate if wanted: extend the same Commons pipeline (add players with a pinned free-licence file to `scripts/players/players.json`, per sport output directory). It needs a human to pin frames (the script renders contact sheets) and the product call on a text-initial fallback for players without one. SIFT keeps its initials mark where no cleared image exists.
