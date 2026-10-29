#!/usr/bin/env bash
# Publish the SIFT 3.0 preview to its OWN GitHub repository (never this one), for free hosting on GitHub Pages.
#   1. On github.com create an EMPTY public repository, e.g. chmoses98/sift3-preview (no README, no .gitignore).
#   2. From a checkout of this branch:  scripts/publish-v3-preview.sh chmoses98/sift3-preview
#   3. In that repository: Settings -> Pages -> Build and deployment -> Deploy from a branch -> main / (root) -> Save.
#   4. Open https://<owner>.github.io/<repo>/ on the iPhone (about a minute after step 3).
# It touches nothing in the production app, its Pages site or its workflows: it builds into dist-v3-preview/ and force-pushes that
# folder as the only content of the target repository's main branch.
set -euo pipefail
target="${1:?usage: scripts/publish-v3-preview.sh <owner>/<repo>}"
here="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
if [ "$target" = "$here" ] || [ "$target" = "chmoses98/sift-sports-intelligence" ]; then echo "refusing: the preview must go to its own repository, not the app's" >&2; exit 1; fi
npm ci --no-audit --no-fund
node scripts/build-v3-preview.mjs
cd dist-v3-preview
rm -rf .git
git init -q -b main
git add -A
git -c user.name="SIFT preview" -c user.email="preview@invalid" commit -q -m "SIFT 3.0 preview $(sed -n 2p BUILD.txt)"
git remote add origin "https://github.com/${target}.git"
git push --force -u origin main
echo
echo "Pushed. Now enable Pages: https://github.com/${target}/settings/pages  (Deploy from a branch -> main / root)"
echo "Then open: https://${target%%/*}.github.io/${target##*/}/"
