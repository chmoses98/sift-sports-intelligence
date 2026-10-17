# Projection Foundation — project tracker

Branch `claude/loving-davinci-53ho9c` in all six repos. Nothing is merged or deployed; betting authority unchanged.

| Stage | NFL | CFB | NBA | MLB | NHL | SIFT |
|---|---|---|---|---|---|---|
| Shared core (`pf_core` 1.1.0, vendored, manifest-pinned) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ canonical |
| Data inventory | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Walk-forward dataset | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Model ladder A–F | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Root-cause studies | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Quality gate on backtests | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ client re-check |
| Forward projections (`sift.projections.v1`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ consumer |
| Automation workflow (inert until merged) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| App integration (Explorer, Game props, Research Lab) | — | — | — | — | — | ✅ |
| Report | RESULTS_NFL.md | RESULTS_CFB.md | RESULTS_NBA.md | RESULTS_MLB.md | RESULTS_NHL.md | ✅ docs/PROJECTION_FOUNDATION_REPORT.md |

Conventions: results in `<repo>/research/projection_foundation/results/summary.json` (`sift.projection_foundation.sport_summary.v1`);
workflows publish to each repo's `projection-data` branch (`projections/<sport>/latest.json`, `summary/<sport>/latest.json`).

## Handoff — next steps (owner decisions first)

1. Owner: approve merging the six branches (PRs not opened yet). Workflows then publish to `projection-data`; SIFT shows shadows.
2. After 3–4 weeks of live record: owner approves promotions via `PROMOTED_FAMILIES` (`src/lib/projections.ts`).
3. Owner: approve replacing CFB script-engine defensive ranks (production change).
4. Engineering backlog, ranked: docs/PROJECTION_FOUNDATION_REPORT.md §12.
