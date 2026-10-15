# SIFT 2.0 research workspace — first integration pass

This is an isolated, reviewable extension of Home PR #92. Production main remains untouched. These screens are opt-in adapters over existing production research, not new model pipelines or a claim of final owner-approved visual design.

## Routes

- Home: `#/design/sift2/home`
- NFL Game Command Center: `#/design/sift2/nfl/game/<published event id>`
- Player Prop Explorer hub: `#/design/sift2/props`
- Full sport Prop Explorer: `#/design/sift2/<sport>/props`
- Intelligence: `#/design/sift2/intelligence`
- Research Lab: `#/design/sift2/lab`

Home links lead into this workspace. Deeper existing specialist research links remain usable. Preview navigation does not replace the production navigation or its routes.

## Behavior

NFL game primary navigation is Overview / Matchups / Players / Markets. Scripts, trends, injuries and player usage remain available through More game research. Repeated full matchup evidence moves behind an accessible native disclosure so the first view is shorter. Four primary tabs fit narrow phone widths. Production GameRoute and GameView default to their existing behavior; the opt-in flag affects only preview routes. Specialist sport dispatch stays unchanged.

Prop Explorer, Intelligence and Research Lab reuse their current complete views inside a shared preview shell with navy surfaces, blue accents, Barlow typography and keyboard focus treatment. Research authority, simulated shares, market timestamps, fees, publication failures, player distributions and unsupported states are not reinterpreted by the shell.

## Verification

- Lint, production TypeScript build and dist/base-path check passed.
- Unit/integration regression: 94 files, 1,073 tests passed.
- Home/hero browser checks: 8 checks across desktop Chromium, phone Chromium, iPhone WebKit and iPhone SE WebKit passed.
- Workspace checks: 16 across those four projects passed. A subsequent combined run passed 20 non-game checks; its four game tests exposed an ambiguous nested-summary selector. After correcting that selector, all four game checks passed on the final build.
- Full workspace axe WCAG A/AA scans passed for Prop Explorer hub, Intelligence and Research Lab; the Game overview scan passed in all four projects. Home also passed WCAG 2.1 AA checks.
- Tested Game navigation to Matchups, Players and Scripts; confirmed detailed matchup evidence opens and closes; preserved deep research.
- Desktop and mobile captures were inspected for hierarchy, overflow, readability and disclosure behavior. Screenshots use bundled NFL fixtures and a fixed October 4 clock, not today's odds or game state. Other feeds are intentionally blocked by the shared test fixture.

The local WebKit runtime uses extracted Linux dependencies as described in VERIFICATION.md. No package-lock or production runtime dependency changes.

## Remaining release gates

Owner visual approval of Home and the research workspace; final approved-mockup comparison; remote CI completion; representative live-publication and specialist-sport visual review before release. No production merge/deployment is authorized. Passing fixtures and axe checks do not establish model accuracy or betting edge.
