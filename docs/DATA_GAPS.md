# Data gaps found while building Sift V1

Sift renders what the publications contain and labels the rest. These are the gaps that shape the NFL
experience today, with their source. None was "fixed" by changing a sport model.

## 1. NFL publishes no research explorer (blocking upstream defect)

* **Symptom:** `https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/explorer/index.json`
  returns 404, although nfl-edge-finder#92 (explorer adapter) is merged and RUN NFL ran on that commit.
* **Cause:** `scripts/research_export.py`, `collect_players()`:
  ```python
  for team, lst in ((g.get("game_script_inputs") or {}).get("player_opportunity") or {}).items():
      for x in lst or []:
          opp_by_id[x.get("player")] = {**x, "team": team}   # TypeError: 'str' object is not a mapping
  ```
  For `2026_04_PIT_CLE`, `player_opportunity` is a status object (`{"state": "UNAVAILABLE", …}`), not
  per-team lists. The run-nfl workflow marks the explorer step `continue-on-error`, so the v1 payload
  publishes and the explorer silently does not.
* **Fix (upstream, two lines):** skip non-list values (`if not isinstance(lst, list): continue`).
* **What Sift does meanwhile:** builds the explorer with NFL's own exporter and that guard, from the same
  run's committed inputs, verifies it with the contract, and serves it as a labelled RESEARCH SNAPSHOT
  (`scripts/refresh-nfl-snapshot.sh`, every deploy and every 3 hours). Once NFL publishes its explorer,
  the refresh becomes a no-op and Sift reads the live explorer.

## 2. NFL capability limits (from NFL's own capability manifest)

| Capability | Status | Effect in Sift |
|---|---|---|
| player_game_logs | RESEARCH (2026 rows not committed) | No player game log or historical box score; player trend lens hidden; historical games say so. |
| team_game_logs | PARTIAL | Per-game *series* exist only for points for/against/margin (schedule-derived); EPA metrics are current snapshots without history. |
| rankings / time_series | PARTIAL | Rankings are current-snapshot; no "last 5" for EPA-type metrics. |
| opponent_adjustment | PARTIAL | Ridge ratings are a current snapshot; shown as such. |
| schedule_strength, play_by_play, venue_effects | UNAVAILABLE | Not shown. |
| situational_splits | PARTIAL (pressure splits for QBs only; home/away UNAVAILABLE) | QB pressure splits only. |
| usage | RESEARCH (projected shares) | Labelled "projected, not observed usage". |
| market_price_history | VERIFIED, game-level families only | Player-prop tickers have no history; Sift says so on the market screen. |

## 3. Historical games

Only games on the current packet or referenced by the wager ledger have event-research documents (51
events in this publication); each team profile lists ~55 games across four seasons. Other historical games are reconstructed only from both teams'
published game lists and series (score, date, home/away, points series, trailing mean, form around the
game). No per-game EPA, no player lines.

## 4. Smaller data quirks

* Some team display names repeat the nickname in the published data ("New York Jets Jets", "Los Angeles
  Rams Rams", "Los Angeles Chargers Chargers", "New York Giants Giants"). Sift drops the repeated word for
  display only; ids and packets keep the published name.
* One event (`2026_04_PIT_CLE`) has status `UNKNOWN` in the board.
* QB profile metrics have `unit: null` in the registry; Sift formats them generically.
* Packet text formats JSON integers as Python would only when it can tell them from floats: every NFL
  value is a float, so NFL packets are byte-identical to the Python builder; a sport publishing integer
  observation values would print `47.000` where Python prints `47`.

## 5. Other sports

MLB is explorable as a beta through the same screens. CFB, NBA, NHL, Soccer and Tennis publish explorers
and are shown with real health and capability manifests, but Sift V1 does not open explorer screens for
them (their entity shapes — tennis players as participants, soccer clubs — were not validated in this pass).

## 6. Live market data (market clock) — what remains impossible or limited

* **No direct browser access to Kalshi.** Kalshi's public API refuses any browser `Origin` other than
  kalshi.com (HTTP 403, no CORS headers; evidence in ARCHITECTURE.md → *The market clock*). Sift reads
  quotes from the GitHub Actions quote feed (published every 3 minutes, typically 3–8 minutes old) and, once the owner deploys it, from the
  read-only relay (15–60 s). Without the relay, quotes are near-live, not sub-minute; their real age is
  always shown.
* **No per-quote timestamp from Kalshi.** Market objects carry `updated_time`, which is a metadata time
  (e.g. listing), not when the price last changed. Sift's quote time is when the provider answered
  (Kalshi's `Date` minus `Age`, rounded down) — the time the price was known to be current.
* **Newly listed contracts have no research.** A rung or alternate line listed after the research run
  appears with Kalshi's own wording and live quote only. The publication has no `market_family`, subject
  ids, model price or price history for it, so Sift shows none and does not put it in packets (the packet's
  market rows require the publication's metadata). It becomes a full market at the next publication run.
* **Inventory is bounded by the publication's series.** The feed sweeps the Kalshi series the publication
  already uses; a brand-new series type is invisible until the sport repository maps it.
* **Availability in the packet text.** The canonical packet text has no per-market status column, so
  closed / suspended / not-listed contracts are named on the packet's MISSING line rather than per row.
* **Feed cadence is bounded by GitHub.** The feed publishes every 3 minutes from a self-chaining workflow
  loop (GitHub's cron is undependable here), and raw.githubusercontent.com caches for up to 5 minutes;
  quotes from the feed are typically 3–8 minutes old. Sub-minute quotes need the relay.
* **The live NFL publication is ahead of the bundled snapshot.** The feed maps against the live NFL
  publication (e.g. 801 markets on NE @ BUF) while research screens read the snapshot (796); the extra
  live contracts appear as *Listed on Kalshi after this research run* until the NFL explorer is repaired.
