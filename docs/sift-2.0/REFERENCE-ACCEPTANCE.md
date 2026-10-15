# Previous reference-driven SIFT 2.0 pass — visually rejected

The owner rejected this pass. Current visual-fidelity evidence and unresolved asset requirements are in VISUAL-FIDELITY.md; these historical test results do not imply design acceptance.

The owner's three supplied Games, Game Command Center and mobile mockups supersede the previous dashboard screenshots. The implementation is ready for visual review, not visually approved. This document supersedes the presentation status in WORKSPACE-ACCEPTANCE.md.

## Scope

All changes remain on the existing draft PR #93, stacked on #92, behind `/design/sift2/` routes. Production main has not been changed, merged or deployed.

- Games: week/date, sport and lifecycle filters; photographic featured matchup, selectable slate, venue-led game cards and deep research links. Publication errors remain distinct from empty filtered schedules.
- Command Center: approved venue hero, real team identity, kickoff, records and source attribution; desktop research/market rail; four primary tabs; compact opportunity disclosure; Game Read, simulation-share rows, matchup drivers and photographic featured players. Detailed evidence and existing specialist research remain available.
- Mobile: compact hero, sticky game tabs, five-destination bottom navigation, responsive research and grouped player snapshots with published lines, captured asks and capture ages. Alternate lines open the existing complete prop research without breaking hash routing.
- Home uses the shared cinematic matchup composition. Props, Intelligence and Lab retain complete production research views inside the same navy/blue/Barlow shell. These hubs are integrated and tested; their specialist workflows have not been rebuilt.

## Data and imagery

No illustrative odds, weather, scores, dates, fictional simulation shares or unsupported conditional probabilities from the mockups were copied into the application. Existing publication and quote pipelines supply displayed research. Simulation shares retain their restrictions; research/model disagreement is not a validated edge. A failed or unloaded opportunity publication now explicitly reports unavailability rather than implying no opportunities.

Only the existing approved venue/player assets are used. Missing or unverified photography uses team identity fallbacks. A neutral-site fixture does not inherit a team's home stadium. Browser captures use the bundled October 4 fixture, not today's prices; controlled external-feed failures demonstrate honest partial coverage. Quotes marked captured are before fees, and full prop research retains freshness and settlement restrictions.

## Verification

- ESLint, TypeScript/Vite E2E production build and dist/base-path validation passed.
- Unit/integration suite: 95 files, 1,076 tests passed.
- Combined SIFT browser matrix: 32 checks passed on desktop Chromium, mobile Chromium, iPhone 15 Pro WebKit and iPhone SE WebKit. Includes Home, Games, Game, Props, Intelligence and Lab, axe checks, overflow, navigation, date/sport/status filters, player search and opening full prop research.
- Real Playwright browsers ran through the repository's configuration. Locally extracted WebKit system libraries were used; package dependencies were not changed. Host-requirement preflight alone was bypassed because ldconfig cannot see the extracted libraries.
- Wider specialist sport suite: 155 checks passed, two skipped, three screenshot comparisons differed. All three also fail on the untouched previous commit d77d338 in an isolated worktree (CFB home, CFB Value Watch home, NHL game scripts). Differences concern local date/time formatting and lower-page snapshot layout. No screenshot baselines were overwritten; these remain a visual-baseline follow-up rather than a claimed green full suite.
- After the final link/desktop spacing polish, the eight reference-layout checks were rerun across all four browser projects.
- Previous remote CI for d77d338 completed successfully (run 38691626188). The new commit must receive its own full remote CI result.

## Review and release gates

Review the Games desktop, Command Center desktop and mobile overview/players captures first, then Home and research hubs. Owner visual approval is still required. Representative current live-publication review and successful final remote CI remain release gates. Fixture/browser checks establish UI behavior, not model accuracy or profitability. No merge or deployment is authorized.
