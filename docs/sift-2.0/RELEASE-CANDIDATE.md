# SIFT 2.0 integration candidate — verification in progress

Owner direction: retain current layouts; stop repeated visual micro-iterations. Photography procurement is a separate process; ASSET-POLISH.md remains the asset requirements ledger. No merge or deployment authorized.

## Integration restored after interrupted session

- Shared public-router adapter scopes native Link/NavLink hrefs and programmatic navigation only within `/design/sift2/`. Legacy production addresses remain unchanged. Queries, fragments, new-tab links and explicit design/external destinations are preserved.
- Workspace routes now cover all existing supported sport homes, game dispatch, team/player profiles, metrics, rankings, markets, seasons, comparisons, props, slate, parlays and scorecards. Specialist research components and underlying pipelines are reused.
- My Board, packets, search, settings, source diagnostics and Intelligence subpages retain workspace scope. Saved research is not migrated or discarded.
- Navigation selection follows logical destination, including specialist research. Research Lab prop entry retains its selected sport.
- Player/stat links from Command Center focus the requested published prop. Unknown identities do not silently substitute another player. Invalid price-band query parameters no longer crash filtering.
- Sport/type filters clear incompatible Intelligence selection. Publication failures in Props and Research Lab have explicit unavailable states, not a no-opportunity conclusion.
- Specialist mobile gutter fix aligns inherited edge-scrolling tabs/filter rails. Games and NFL Command Center compositions are not redesigned.

## Verification gates

The previous pushed asset-polish baseline (`4fec53d`) completed full remote CI successfully (38753103276). That result does not verify this integration change.

- [ ] Fresh lint, TypeScript, unit/integration and production/base-path checks
- [ ] New eight-sport workspace journeys and primary-screen captures, desktop/mobile Chromium and available WebKit
- [ ] Existing Home/workspace/reference integrity and accessibility regressions
- [ ] Saved-research persistence, search and market navigation journey
- [ ] Representative current live-publication review (fixtures do not establish current availability)
- [ ] Final remote CI and owner review

Fixture captures reuse existing publications, not current odds. Existing CBB and MLB prop fixture extensions are test-only, not live research. Unsupported upstream capabilities remain explicitly unavailable. No invented scores, odds, projections, conditional prop probabilities or research findings.

Not yet a fully verified release candidate. The interrupted run and its lost local artifacts must not be counted as a completed acceptance matrix. Source is checkpointed in the existing draft PR before further verification.
