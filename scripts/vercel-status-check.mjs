// The relay deploys from main through the Vercel GitHub integration, which reports its outcome on the commit as the "Vercel" status.
// A failed or rate-limited deployment of the commit that is live is the failure that left the relay on October 9's build (#150's Date header
// never reached production): nothing in the app fails when the relay is merely old, so this says it loudly.
//
//   SIFT_EXPECT_SHA=<deployed commit> node scripts/vercel-status-check.mjs     (GITHUB_TOKEN optional)
//
// What matters is the NEWEST Vercel production deployment, not an older attempt: a commit whose deployment was rate limited and was then
// superseded by a later successful production deployment leaves the relay current, so that is a PASS (noted), not a failure. Exit 1 when the
// newest Vercel production deployment's latest status is failure or error, or, when the Deployments API gives no verdict (none yet, still
// building, API refused), when Vercel's commit status for this commit is failure or error. A pending or absent status passes (a commit that does
// not touch relay/ may be skipped); the live Date check (scripts/relay-live-date-check.mjs) proves what the relay actually serves.
const sha = (process.env.SIFT_EXPECT_SHA ?? '').trim();
const repo = process.env.GITHUB_REPOSITORY ?? 'chmoses98/sift-sports-intelligence';
if (!sha) {
  console.log('N/A: SIFT_EXPECT_SHA is not set (not a post-deploy run)');
  process.exit(0);
}
const headers = { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const getJson = async (path) => {
  try {
    const r = await fetch(`${api}${path}`, { headers });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};
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
// The newest Vercel production deployment decides (newest first from the API); an older failed attempt does not.
let newest = null;
const deployments = await getJson(`/repos/${repo}/deployments?environment=Production&per_page=10`);
const latest = Array.isArray(deployments) ? deployments.find((d) => /vercel/i.test(d?.creator?.login ?? '')) : null;
if (latest) {
  const history = await getJson(`/repos/${repo}/deployments/${latest.id}/statuses?per_page=5`);
  const state = Array.isArray(history) && history[0] ? history[0].state : null;
  if (state) newest = { sha: String(latest.sha ?? ''), state };
}
let bad = 0;
if (newest && ['success', 'failure', 'error'].includes(newest.state)) {
  const ok = newest.state === 'success';
  const own = vercel.filter((s) => ['failure', 'error'].includes(s.state));
  const note = ok && own.length && newest.sha !== sha ? ` (the ${sha.slice(0, 7)} attempt "${own[0].description ?? own[0].state}" was superseded)` : '';
  console.log(`${ok ? 'PASS' : 'FAIL'} newest Vercel production deployment ${newest.sha.slice(0, 7)}: ${newest.state}${note}`);
  process.exit(ok ? 0 : 1);
}
for (const s of vercel) {
  const ok = !['failure', 'error'].includes(s.state);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.context}: ${s.state}, ${s.description ?? ''}`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
