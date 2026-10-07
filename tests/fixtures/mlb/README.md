MLB TEST FIXTURE — the real edge-finder-api publication of 2026-10-07, plus synthetic player-prop objects.

Built by `python3 scripts/make_mlb_fixture.py` from the live `chmoses98/edge-finder-api` `app/latest` publication
(run_cd3df33ae386ca222d6e, generated 2026-10-07T20:03:39Z): board, events, event details, markets, model prices,
recommendations, theses, manifest, health and the explorer (index, capabilities, metrics, search index, event research,
market history, team and player profiles), trimmed to the four postseason games CLE@CWS, LAD@ATL, TB@NYY and MIL@SD.

SYNTHETIC: only `market.extensions.player_prop` (schema `mlb.player_prop.v1`) and `market.player_id` on LAD@ATL's
player-prop markets — the shape the MLB exporter is about to publish. Every projection number in them is SYNTHETIC
TEST DATA, not model output. Stolen-base markets carry none (an "Other player markets" example), Andy Pages is left
unresolved (no profile link), and the other three games carry none (today's production shape). Never shipped in the
app bundle.
