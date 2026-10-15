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

## Verification gates — October 15 checkpoint

Current integrated source: `d26e128f0997acd222e02d90d577ce68bbb5b115`. [CI run 38785099321](https://github.com/chmoses98/sift-sports-intelligence/actions/runs/38785099321) completed, rather than remaining pending at the previous handoff.

- [x] Lint, TypeScript, production build and base-path checks passed in CI.
- [x] Full unit/integration suite: **99 files / 1,105 tests passed**.
- [x] Eight-sport workspace home/game/deep-research journeys: **32/32 passed**, desktop and phone Chromium, iPhone and iPhone SE WebKit. The previously interrupted local NBA/SE check passed in this complete CI run.
- [x] Connected Home, Games, Props, Intelligence, Lab and Board, saved-research fresh-load persistence, scoped search, failure states, existing Home/workspace/reference accessibility and responsive checks passed on all four projects.
- [x] Reference-size imagery/crop/geometry and corrupt-photo fallback checks: **8/8 passed** across those projects. Full suite: **826 passed, 3 failed, 5 existing skips** out of 834 tests. No accessibility checks or timeout budgets were weakened.
- [x] Representative live-publication review recorded separately: October 15 checks found NFL/Tennis healthy, MLB stale, and CFB/NBA/NHL/Soccer/CBB research-only. This is dated source-health evidence, not a current opportunity verdict.
- [ ] Full CI rerun after the three reviewed Terminal baseline updates.
- [ ] Owner visual/release approval. No merge or deployment.

### Terminal screenshot diagnosis

All three failing tests are `terminal @visual` in `e2e/visual.spec.ts`; no other test failed. Expected, actual and diff PNGs from the CI artifact were inspected directly for desktop, phone and iPhone. The difference is the intentional unavailable-publication notice inside Discovery Board, introduced by `9879d96`. It moves the existing rows down; masthead, navigation, typography, imagery, selected matchup and card styles are unchanged. Desktop changed 42,746 pixels (about 4%), phone 15,503 (about 5%), iPhone 4,499 (about 2%). On the short iPhone visual-test viewport the new notice moves most of the first card below the fold; the notice remains confined to the board, not the primary hero.

The notice must remain: failed publications are not evidence of no opportunities. Only the three Terminal PNG baselines are refreshed, using their reviewed Linux CI captures. All other screenshot goldens, 1% diff tolerance and assertions are retained. The Terminal visual test now explicitly waits for the partial-publication alert under its deliberately blocked-publication fixture, avoiding an intermediate loading-state capture. This is acceptance of a specific truthful state change, **not owner design approval**.

### Runtime and handoff

The local execution server has recovered; the cleared scratch checkout was restored from the pushed branch without losing source. The previous `exec-server transport closed` blocker is no longer the current status. Standard local browser dependency installation encountered restricted OS user/group operations; browser-only downloads succeeded, and the two revised Chromium Terminal screenshot tests **passed locally without snapshot updating** against the reviewed CI baselines. Fresh local production build and base-path checks also passed. Complete four-project execution and screenshots are independently available from the CI run above. Local verification outcomes and the post-baseline CI result must be reported separately, not inferred from an earlier run.

Fixture captures reuse existing publications, not current odds. Existing CBB and MLB prop fixture extensions are test-only, not live research. Unsupported upstream capabilities remain explicitly unavailable. No invented scores, odds, projections, conditional prop probabilities or research findings.

This is a reviewable integration candidate, not yet an approved release. The completed CI evidence supersedes the earlier interrupted local matrix, but its three screenshot failures must be resolved by a clean rerun. Photography procurement remains documented in `ASSET-POLISH.md`; no additional imagery is invented or substituted. The portable screenshot review includes dated fixture labels and source/licence registers.
