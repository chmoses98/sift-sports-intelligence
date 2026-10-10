# Weather audit — is weather in the projections? (2026-10-10)

Owner checklist item 5. Each sport model repository was searched for weather, wind, temperature, precipitation,
roof and dome usage, and each hit was traced to whether it feeds the production projection or is captured for
display and context only.

| Sport | Weather in the production projection? | Evidence | Notes |
|---|---|---|---|
| NFL | **No** | `nfl-edge-finder/nfl_edge/sim/script_v2.py:283-285` — `"weather_model_status": "NOT_IN_MODEL"`, "weather does not enter the simulation; shown for manual/contextual interpretation only". `scripts/sim/project_week.py:63` — "weather never enters a probability". | The handicap packet builds a weather block and raises a question for the human handicapper when wind or rain is material (`nfl_edge/handicap/packet.py:655-800`). A dome/indoor flag is a feature of the shadow three-arm model only (`nfl_edge/arms/data_only.py`). Game-day measured weather is explicitly rejected as hindsight in research code (`nfl_edge/sim/rushing.py:40-43`). |
| CFB | **No** | `cfb-edge-finder/src/cfb_edge_finder/scripting/confidence.py:166` — "weather, travel distance … are not part of the V1 evidence". | ESPN weather is copied into the context and the analysis packet; a wind change marks a stale handicap (`execution/context.py:416-418`). A `venue_dome` feature exists only in the V2 shadow research features. |
| MLB | **Partial** | Hitter props: `edge-finder-api/lib/research/hitter_contact_model.py:240-242` adds a wind component toward centre field to fly-ball distance (home-run vs not), wired into the production hitter engine (`scripts/build_hitter_projection_board.py:434-459`). | Game and team run totals take no weather input (`api/slate.js:741-742`, park adjustment only). The wind table in `MODEL_CORE.md:665-672` is documented but not implemented; `scripts/risk_gate.py` always reports `weatherAdjustment: None`. |
| Soccer | **No** | `soccer-edge-finder/src/soccer_edge/model/worlds.py:221-222` — `"not_modelled": ["weather", …]`; `providers/open_meteo.py:1,7` — "CONTEXT ONLY … Nothing here feeds pricing." | Captured and exported for display. |
| Tennis | **No** | `Tennis-Edge-Finder/docs/MODELING.md:54` — indoor and weather "not implemented"; `tennis_edge/research_export.py:1087`. | Court surface is the only venue input. |
| NHL · NBA · CBB | Not applicable | Indoor sports (`research_export.py` / `sift_app/build.py` say so). | — |

## What Sift does with this

* Every outdoor kickoff-weather tile now carries **"Context only · not in the projection"** (`src/views/game/Hero.tsx`
  `WeatherBlock`, with the audit in its tooltip), and the featured hero on Home says "weather shown for context, not
  in the projection" beside the forecast.
* Sift's own copy never claims weather moves a forecast. The MLB game page shows no weather (its publication carries
  no weather record for the game page), so the hitter-prop wind input is not displayed; that is a data gap, not a
  claim.

## Open upstream questions (not changed tonight)

1. MLB: the documented totals wind table is not implemented, and `lib/handicap_runtime.py:407-409` says the slate
   pipeline captures no weather record while the hitter engine reads `data/weather.json`. The documentation and the
   runtime disagree.
2. NFL and CFB flag "material" weather to the human handicapper, but nothing checks whether that flag was acted on.
