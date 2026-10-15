# SIFT 2.0 — Design and implementation guardrails

Status: planning baseline; not authorization to deploy or replace existing screens.

## Branch strategy
- Production remains on `main`.
- Integrate reviewed, narrowly scoped feature PRs into `sift-2.0`; do not merge into `main` until release acceptance.
- Keep existing deep links, research publications, specialist sport views, and accessible keyboard navigation working.
- Do not overwrite production assets or existing venue imagery without review.

## Approved visual direction
- Premium cinematic broadcast + rigorous sports intelligence.
- Barlow typography, deep navy, restrained electric-blue highlights, layered glass surfaces, authentic team identity.
- Venue imagery must be architecturally faithful and compositionally suitable for desktop and mobile crops; no invented venue details passed off as real.
- Home, Games, Game Command Center, and Player Prop Explorer share a coherent responsive system.
- Primary destinations: Home / Games / Explore / Intelligence; My Board remains readily accessible.
- Game primary tabs: Overview / Matchups / Players / Markets; deeper sport-specific research remains reachable.

## Research integrity
- Never present a projection gap as a proven edge.
- Script simulation shares are not calibrated probabilities.
- Current margin-script fit does not establish player-prop or totals survival; conditional player distributions require independent validation.
- Respect calibration gates, model authority, opponent adjustment and uncertainty.
- Distinguish quote freshness, publication freshness, score freshness and provenance.
- The existing publication contract lacks live score/period/clock; never manufacture them.
- Keep research frozen after kickoff when required; preserve sport-specific panels.

## Market and odds experience
- Offer cents, American, decimal, and implied-percentage display preferences.
- Preserve each provider's native price and the underlying contract identity.
- Alternate lines and both sides should be browsable when captured and verified.
- Compare providers only for genuinely equivalent settlement rules, period, side, line, player/stat identity, overtime and push/void conditions.
- Account for fees, executable size, bid/ask and quote timestamp before naming a best offer.
- Kalshi initially; sportsbook adapters later. Missing quotes are unavailable, not zero or inferred.
- Multi-script survivors should display supported scenario evidence, not fabricated hit probabilities.

## Implementation acceptance
1. Establish design tokens and reusable components without changing published research semantics.
2. Create responsive navigation and cinematic visual shells without removing existing routes.
3. Redesign Home and Games, then NFL Game Command Center, before adapting specialist sports.
4. Upgrade Player Prop Explorer, alt ladders and market comparison with explicit unsupported states.
5. Verify typecheck, lint, unit tests, Playwright mobile/desktop, accessibility and screenshot comparisons before release.
6. Keep implementation PRs small, reversible, and reviewable; no automatic production merges.

## Reference
The approved mockups in the SIFT 2.0 design conversation are visual targets. Do not treat their illustrative prices, scores, or projections as real data.

## Approved visual standard — October 15 owner correction

The three owner-supplied references (Games desktop, Game Command Center desktop, and paired mobile Overview/Players) are the visual acceptance standard. Earlier technical-pass screenshots are explicitly **not visually approved**. Do not carry their generic panel composition forward as an approved design.

Required composition: a restrained desktop left navigation rail; venue-led cinematic hero with actual home identity; two team marks and a centered kickoff/venue block; compact slate beside the Games feature; photographic/branded matchup cards; four directly reachable phone game tabs; the game read, simulation-share rows and matchup drivers directly below; player-first photographic cards, with full research one layer deeper. Dark navy, thin blue borders, focused electric-blue selection, Barlow body typography, and limited glass effects support that hierarchy.

Reference prices, schedules, scores, records, broadcast networks, weather and script percentages are illustrative and must not be copied. Existing conservative venue/neutral-site and licensed-photo resolution wins over a reference's visual example. Never substitute the mockup stadium picture for another game. Owner visual approval remains a release gate.

### Visual fidelity milestone after second rejected implementation

The owner has not approved the prior screenshots. Freeze expansion into other screens while Games and Game Command Center are compared directly with the original three mockups. `VISUAL-FIDELITY.md` records the ten largest differences, matched viewport measurements, successive visual corrections, imagery quality gates and unresolved assets. Technical tests and design acceptance are explicitly separate. All work remains in draft PR #93, with no production merge/deployment authorization.
