// The relay deploys from main through the Vercel GitHub integration, which reports its outcome on the commit as the "Vercel" status.
// A failed or rate-limited deployment of the commit that is live is the failure that left the relay on October 9's build (#150's Date header
// never reached production): nothing in the app fails when the relay is merely old, so this says it loudly.
//
//   SIFT_EXPECT_SHA=<deployed commit> node scripts/vercel-status-check.mjs     (GITHUB_TOKEN optional)
//
// Exit 1 only when Vercel reports failure or error for the commit. A pending or absent status passes (a commit that does not touch relay/ may
// be skipped); the live Date check (scripts/relay-live-date-check.mjs) proves what the relay actually serves.
const sha = (process.env.SIFT_EXPECT_SHA ?? '').trim();
const repo = process.env.GITHUB_REPOSITORY ?? 'chmoses98/sift-sports-intelligence';
if (!sha) {
  console.log('N/A: SIFT_EXPECT_SHA is not set (not a post-deploy run)');
  process.exit(0);
}
const headers = { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const res = await fetch(`${api}/repos/${repo}/commits/${sha}/status`, { headers });
if (!res.ok) {
  // Not a verdict on Vercel: the GitHub API itself said no (rate limit, outage). The live Date check still runs.
  console.log(`N/A: could not read the commit status for ${sha.slice(0, 7)} (HTTP ${res.status})`);
  process.exit(0);
}
const { statuses = [] } = await res.json();
const vercel = statuses.filter((s) => /vercel/i.test(s.context));
if (!vercel.length) {
  console.log(`PASS no Vercel status on ${sha.slice(0, 7)} (the relay was not part of this commit's deployments)`);
  process.exit(0);
}
let bad = 0;
for (const s of vercel) {
  const ok = !['failure', 'error'].includes(s.state);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.context}: ${s.state}, ${s.description ?? ''}`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
