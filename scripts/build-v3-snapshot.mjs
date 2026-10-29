// Superseded: the captured-snapshot preview (real published documents, labelled, now all four tabs and every research route) is built by
// scripts/build-v3-captured-preview.mjs (see docs/sift3/PREVIEW.md). This forwards there so existing commands keep working.
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['scripts/build-v3-captured-preview.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
