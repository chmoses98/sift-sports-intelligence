// Production-path verification of the NBA projection feed for the seven approved-but-held families (minutes, points, rebounds,
// assists, threes, PRA, FGA). Reads the SAME URL SIFT's browser reads, through SIFT's own decoder and authority (in PREVIEW mode:
// "what would a reader see if these families were promoted today?"), and checks the invariants that must hold before they are.
// Read-only. It changes nothing and cannot promote: see src/lib/nbaActivation.ts.
//
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx vite-node scripts/verify-nba-activation.ts [--feed FILE] [--json]
//
// Exit code 0 when every check PASSes, 1 otherwise (PENDING counts as not ready: the evidence is not there yet).
import { readFileSync } from 'node:fs';
import { decodeProjections, projectionsUrl } from '../src/lib/projections';
import { verifyNbaFeed } from '../src/lib/nbaActivation';

async function main() {
  const i = process.argv.indexOf('--feed');
  const raw = i > 0 ? JSON.parse(readFileSync(process.argv[i + 1], 'utf-8')) : await (await fetch(projectionsUrl('NBA'), { cache: 'no-cache' })).json();
  const doc = decodeProjections(raw);
  const now = Date.now();
  const r = verifyNbaFeed(doc, now);
  const ageH = doc?.dataAsOf ? Math.round(((now - Date.parse(doc.dataAsOf)) / 3.6e6) * 10) / 10 : null;
  const out = { checkedAt: new Date(now).toISOString(), url: i > 0 ? process.argv[i + 1] : projectionsUrl('NBA'), feedAgeHours: ageH, ready: r.ready, checks: r.checks, ifPromoted: r.tally };
  console.log(JSON.stringify(out, null, 1));
  if (!process.argv.includes('--json')) {
    for (const c of r.checks) console.error(`${c.status.padEnd(7)} ${c.id}  ${c.title}: ${c.detail}`);
    console.error(r.ready ? 'READY: the published feed behaves as the seven families need.' : 'NOT READY: see PENDING / FAIL above.');
  }
  process.exit(r.ready ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
