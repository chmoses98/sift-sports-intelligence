# CI-native fidelity baselines

The committed `e2e/v3-fidelity.spec.ts-snapshots/<scene>-v3-phone-linux.png` set was rendered in the build sandbox (Chrome for Testing 153). CI renders with
Playwright's pinned Chromium on `ubuntu-latest`, which differs by rasteriser and font stack, so CI needs its own set: `<scene>-v3-phone-ci-linux.png`.

How it is made (no manual dispatch needed, nothing is committed by CI):

1. Push a commit to the pull request whose message contains `[ci-baselines]`.
2. `.github/workflows/v3-baselines.yml` builds the same production bundle as `v3-ci.yml`, installs the same Playwright Chromium, writes the 30 images with
   `V3_BASELINES=ci --update-snapshots`, re-runs the spec without `--update-snapshots` (30 of 30 must pass), and pushes an orphan branch
   `ci-baselines/run-<run id>` holding only the PNGs and a `MANIFEST.txt` (head sha, OS, Playwright version, sha256 of every image).
3. A person fetches that branch, compares every image with the locked design (`docs/sift3/redesign/out/<id>.png`) and with the sandbox set, and commits the
   accepted images as `<scene>-v3-phone-ci-linux.png`. Differences from the locked designs are classified exactly as in `REPORT.md` (data, owner-approved
   change, defect); a defect is fixed in the app, not accepted.

Requested for head `65cfaa63` plus this commit, after the market-status, validation, sheet header, PD6 avatar, Props recapture and quote-rule merges.
