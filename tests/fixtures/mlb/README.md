MLB TEST FIXTURE — real market rows, synthesized slate and projections.

Built by `python3 scripts/make_mlb_fixture.py` from the live `chmoses98/edge-finder-api` publication of
2026-10-07 (whose board was empty that day). REAL: manifest, health, model_prices (empty), every market row,
the explorer index / capabilities / metrics / search index and the team and player profiles. SYNTHESIZED: the
four-game board, events and event details (LAD@ATL, TB@NYY, MIL@SD, CLE@CWS on 2026-10-07), and on LAD@ATL the
`market.extensions.player_prop` (`mlb.player_prop.v1`) objects and `market.player_id` values. Every projection
number in them is SYNTHETIC TEST DATA, not model output. Never shipped in the app bundle.
