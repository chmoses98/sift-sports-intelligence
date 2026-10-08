# NHL fixture: a started and finished slate

`app/latest` is the real NHL-edge-finder publication of the 2026-10-07 slate (WSH–PIT, WPG–COL, ANA–EDM), exported by
`nhl research-export` with the frozen-pregame layer (`nhl_scripts_v1.frozen`, `extensions.sim_frozen`) and trimmed by
`scripts/make_nhl_fixture.py`. After the games ended, WSH–PIT and WPG–COL were marked FINAL in the v1 documents
(manifest hashes updated) so the export attached the real script postmortems (`nhl_scripts_v1.outcome`); WPG–COL's
schedule score was then set to its real final (WPG 3, COL 2). ANA–EDM keeps status SCHEDULED with a start in the past:
the "publication lags puck drop" case. Everything else is byte-for-byte the real publication.
