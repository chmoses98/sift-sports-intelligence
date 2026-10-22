#!/usr/bin/env bash
# Verify the candidate free score feeds from YOUR machine. Needs only macOS (curl is built in). Read-only GET requests, one per URL.
#
#   bash scripts/live-scores/verify-on-mac.sh            # prints a table; saves responses in ./feed-check-<date>/
#   zip -r feed-check.zip feed-check-*                   # send that zip if you want me to read the real responses
#
# What to look for:
#   HTTP       200 = the feed answered you.      000 / 403 / 429 = blocked or rate-limited from this network
#   CORS       "*" (or https://chmoses98.github.io) = a browser on the SIFT site may read it directly. "-" = it may not.
#   GAMES      how many games the feed lists right now (rough count; fine if it is 0 when no games are scheduled)
set -u
DAY=$(date -u +%Y%m%d); DASH=$(date -u +%Y-%m-%d)
OUT="feed-check-$DAY"; mkdir -p "$OUT"
UA="SIFT-personal-feed-probe/1.0 (+https://github.com/chmoses98/sift-sports-intelligence; read-only evaluation)"
ORIGIN="https://chmoses98.github.io"
E="https://site.api.espn.com/apis/site/v2/sports"
FEEDS=(
  "espn-nfl|$E/football/nfl?dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "espn-cfb|$E/football/college-football?groups=80&limit=400&dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "espn-nba|$E/basketball/nba?dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "espn-nhl|$E/hockey/nhl?dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "espn-mlb|$E/baseball/mlb?dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "espn-mls|$E/soccer/usa.1?dates=$DAY|\"id\":\"[0-9]*\",\"uid\""
  "nhl-official|https://api-web.nhle.com/v1/score/now|\"gameState\""
  "nba-official|https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json|\"gameId\""
  "mlb-official|https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=$DASH&hydrate=linescore,team|\"gamePk\""
  "thesportsdb|https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=$DASH&l=4380|\"idEvent\""
  "ncaa-fbs|https://ncaa-api.henrygd.me/scoreboard/football/fbs|\"gameID\""
)
printf '%-14s %-5s %-8s %-9s %-6s %s\n' FEED HTTP TIME_S BYTES GAMES CORS
for row in "${FEEDS[@]}"; do
  IFS='|' read -r id url pat <<<"$row"
  hdr="$OUT/$id.headers"; body="$OUT/$id.json"
  line=$(curl -sS -m 25 -A "$UA" -H "Origin: $ORIGIN" -D "$hdr" -o "$body" -w '%{http_code} %{time_total} %{size_download}' "$url" 2>/dev/null) || line="000 0 0"
  code=${line%% *}; rest=${line#* }; t=${rest%% *}; sz=${rest#* }
  cors=$(grep -i '^access-control-allow-origin' "$hdr" 2>/dev/null | head -1 | tr -d '\r' | cut -d' ' -f2-); [ -z "$cors" ] && cors="-"
  games=$(grep -o "$pat" "$body" 2>/dev/null | wc -l | tr -d ' ')
  printf '%-14s %-5s %-8s %-9s %-6s %s\n' "$id" "$code" "$t" "$sz" "$games" "$cors"
done
echo
echo "Saved responses in $OUT/. Terms pages (open these and read them; they decide what SIFT may do):"
echo "  ESPN        https://disneytermsofuse.com/"
echo "  NHL         https://www.nhl.com/info/terms-of-service"
echo "  NBA         https://www.nba.com/termsofuse"
echo "  MLB         https://gdx.mlb.com/components/copyright.txt"
echo "  TheSportsDB https://www.thesportsdb.com/terms"
echo "  SportScore  https://sportscore.com/developers/terms/"
