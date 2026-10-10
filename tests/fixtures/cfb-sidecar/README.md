# CFB research sidecar fixture: Texas A&M at Missouri (2026-10-10)

Real cfb-edge-finder files for `evt_03ae795dcfb6056381a6` (`26OCT10TXAMMIZZ`; Missouri home, Texas A&M away, kickoff 2026-10-10T16:00Z).

- `evt_03ae795dcfb6056381a6.published-2026-10-10.json`: the event exactly as published on main at 15:16Z. The Script Engine payload was trimmed to the event budget, so `metric_registry`, both teams' `metrics` and `matchup_profile.dimensions` are empty, and nothing links to the trimmed detail.
- `evt_03ae795dcfb6056381a6.json` and `script_research/evt_03ae795dcfb6056381a6.json`: the same run (`run_d2bfb507554be40f3f56`, same frozen artifact `239ca1dbd1fd…`) re-exported by cfb-edge-finder's `scripts/research_export.py` with the research sidecar (cfb-edge-finder PR #127). The event links the sidecar by sha256. The sidecar's sections are the frozen payload `data/scripting/live/sift/26OCT10TXAMMIZZ.json.gz` copied byte for byte.

These are not hand-edited. Regenerate them with `python scripts/research_export.py --out <copy of app/latest> --force` in cfb-edge-finder.
- `untrimmed-evt_00e6e5d0563aa046ddef.json`: a small event from the same run, published whole with no trim and no sidecar.
