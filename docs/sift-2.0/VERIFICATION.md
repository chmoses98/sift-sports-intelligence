# SIFT 2.0 Home verification — 2026-10-15

## Stack inspected

All seven PRs are open drafts. Dependency order is #86 → #87 → #88 → #89 → #90 → #91 → #92, rooted at `sift-2.0`. Latest branch inspected: `sift-2.0-accessibility-pass`, handoff c4f99d2fc31f257c31c78bcc9d63c55945eee098. No production merge or deployment authorized.

PR CI runs at inspection: #86 38687169840 in progress; #87 38687275304 queued; #88 38687650848 in progress; #89 38687730004 queued; #90 38687847904 queued; #91 38687931613 in progress; #92 38688619319 queued. These are observations, not passing results.

## Fixes in this continuation

- Detect per-sport publication failures, rather than relying only on the aggregate promise error. Complete failure cannot display an empty slate or no-findings verdict.
- Keep successful sport feeds visible with an explicit partial-coverage notice.
- Wait for the opportunity publication before mounting ranked player research.
- Explicitly clean up hero test renders; the original suite failed because an h1 from the previous test remained in the document.
- Use shared deterministic browser fixtures and clock for the SIFT 2.0 smoke tests. Add scoped axe checks and full-page screenshot collection to the Home test.
- Add regression tests for total feed failure, partial coverage and initial loading.

## Browser acceptance remains blocked

The managed environment has no control-browser capability or installed Chromium/WebKit binaries. The Sites workflow prohibits an alternate browser path in that environment. No preview server was started and no screenshots or browser/a11y passing results are claimed.

The existing Vercel bot on PR #92 reported its daily deployment limit. Pushing may automatically invoke that integration; changes remain local to avoid initiating deployments without authorization.

Home is **not visually accepted**. The Game Command Center remains an illustrative hero study; Explorer, Intelligence and Research Lab remain existing destinations. Do not label those SIFT 2.0 milestones complete.

Next: provide browser-capable verification, run `npm run build:e2e` and the four-project `e2e/sift2-smoke.spec.ts`, inspect screenshots and loading/empty/partial-failure states, fix observed UI issues, then continue Game Command Center. Keep production main untouched.

## Local check results

- `npm run lint`: passed after changes.
- `npm run typecheck`: passed; production build also completed its TypeScript check.
- `npm test`: 94 files, 1,073 tests passed after fixes.
- `npm run build:e2e`: passed; Vite reported existing mixed static/dynamic import warnings for BoardView, Markets and Scorecard.
- Focused Home/hero suite: 7 tests passed.
- `git diff --check`: passed.

## Direct Playwright verification completed (continuation)

The user explicitly authorized direct repository Playwright testing. Installed Chromium 1194 and WebKit 2215; the first download mirror returned invalid archives but the fallback mirror succeeded. The container disallows apt user switching and writes to its apt archive directory. Downloaded required Ubuntu libraries into `/tmp/sift-apt`, extracted them into `/tmp/sift-webkit-libs`, and added missing libraries to the downloaded WebKit bundle without overwriting existing bundle libraries. No repository or production runtime dependency changes were needed. Playwright's ldconfig preflight cannot detect these local libraries, so its host preflight was disabled for this run; real WebKit launched and executed the tests.

`e2e/sift2-smoke.spec.ts`: **8/8 passed** across Chromium desktop (1280×900), Chromium phone (390×844), WebKit iPhone 15 Pro and WebKit iPhone SE. Home passed scoped WCAG A/AA axe checks in all four projects, rendered without document overflow and generated full-page plus viewport screenshots. Screenshots use the committed NFL fixture and a fixed October 4 clock; they are not current game or quote claims. External feeds are deliberately blocked by the shared test fixture; the partial-coverage UI is expected.

Inspected desktop, phone and iPhone SE captures. Fixed the closed sports sheet showing in full-page captures, shortened the partial-feed notice through a native disclosure, reduced phone hero density, corrected singular sport wording, and reused the production team/venue resolver for names, marks, colors and approved imagery. The London fixture correctly uses both-team branding and no unverified stadium photo. Screenshots are in ignored `review/home/` for review delivery.

The earlier browser-blocked status above is superseded. Home passes local technical acceptance; visual design remains subject to owner approval. No merge or deployment performed. CLI push lacks credentials; use the connected GitHub app to transfer equivalent source changes onto the same PR branch. That transfer will have a different commit SHA than local 0674b2c.
