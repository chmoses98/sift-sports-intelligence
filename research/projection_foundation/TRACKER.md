# Projection Foundation — project tracker

Branch `claude/loving-davinci-53ho9c` in all six repos. Nothing is merged or deployed; betting authority unchanged.

| Stage | NFL | CFB | NBA | MLB | NHL | SIFT |
|---|---|---|---|---|---|---|
| Shared core (`pf_core` 1.0.0, vendored, manifest-pinned) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ canonical |
| Data inventory | in progress | in progress | in progress | in progress | in progress | — |
| Walk-forward dataset | in progress | in progress | in progress | in progress | in progress | — |
| Model ladder A–F | in progress | in progress | in progress | in progress | in progress | — |
| Root-cause studies | in progress | in progress | in progress | in progress | in progress | — |
| Quality gate on backtests | in progress | in progress | in progress | in progress | in progress | ✅ client re-check |
| Forward projections (`sift.projections.v1`) | in progress | in progress | in progress | in progress | in progress | ✅ consumer |
| Automation workflow (inert until merged) | in progress | in progress | in progress | in progress | in progress | — |
| App integration (Explorer, Game props, Research Lab) | — | — | — | — | — | ✅ |
| Report | — | — | — | — | — | pending |

Conventions: results in `<repo>/research/projection_foundation/results/summary.json` (`sift.projection_foundation.sport_summary.v1`);
workflows publish to each repo's `projection-data` branch (`projections/<sport>/latest.json`, `summary/<sport>/latest.json`).
