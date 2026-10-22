# Verifying free live-score feeds (and getting past the sandbox's network block)

## Why the build environment could not test any feed

Claude's cloud sandbox answers **403 to CONNECT** for every score host (its network policy is an allow-list; only GitHub, npm and a few
package hosts are on it). That is a property of the sandbox, not of the feeds. Two ways round it, both $0:

1. **A GitHub Actions runner** has normal internet. `.github/workflows/live-scores-probe.yml` runs `scripts/live-scores/probe.mjs` there,
   saves the real responses and the terms pages to the `live-scores-probe` branch, and the sandbox reads them through `raw.githubusercontent.com`
   (which it can reach). This is how the evidence in `docs/LIVE_SCORES_REAL.md` was gathered.
2. **Allow the hosts for the sandbox** (so it can call the feeds directly). In the cloud environment menu → *Edit* → *Network access*, either choose a
   broader level or add these under *Allowed domains* (leave "Allow package managers" ticked):

   ```
   site.api.espn.com   site.web.api.espn.com   cdn.espn.com   sports.core.api.espn.com   www.espn.com   disneytermsofuse.com
   api-web.nhle.com    www.nhl.com
   cdn.nba.com         www.nba.com
   statsapi.mlb.com    gdx.mlb.com             www.mlb.com
   www.thesportsdb.com sportscore.com          www.realtimesportsapi.com   www.sportbusy.com
   ncaa-api.henrygd.me www.ncaa.com            static.nfl.com
   ```
   Steps: <https://code.claude.com/docs/en/cloud-environments#network-access>.

## Verify on your Mac (nothing to install)

```bash
cd sift-sports-intelligence
bash scripts/live-scores/verify-on-mac.sh
```

It makes one read-only request per feed and prints a table:

| Column | Meaning |
|---|---|
| `HTTP` | `200` = the feed answered you. `000`, `403`, `429` = blocked or rate-limited from your network |
| `CORS` | `*` (or `https://chmoses98.github.io`) = a browser on the SIFT site may read the feed directly. `-` = it may not |
| `GAMES` | how many games the feed lists right now (0 is fine when nothing is scheduled) |

It saves every response in `feed-check-<date>/`. `zip -r feed-check.zip feed-check-*` and send the zip to have the real payloads read.
For the full probe (terms pages included, and a live-game *watch* mode): `node scripts/live-scores/probe.mjs once --out probe-out`
(Node 20+). The terms links it prints are the pages that decide what SIFT may do with each feed; read them.
