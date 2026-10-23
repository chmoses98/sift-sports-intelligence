// Joint NBA activation verdict: the repository's `nba.live.activation_check` and SIFT's `scripts/verify-nba-activation.ts` judged on ONE feed.
// Read-only. It changes no approval and cannot promote: promotion is a reviewed edit of src/lib/projectionApprovals.ts by a person, and only when
// this reads READY.
//
//   node scripts/nba-activation-joint.mjs --feed FEED.json --activation ACTIVATION.json --sift SIFT.json [--audit AUDIT.json] [--out JOINT.json]
//
// FEED.json        the published projections/nba/latest.json both verifiers read (the same file bytes: its SHA-256 is recorded)
// ACTIVATION.json  `python -m nba.live.activation_check --archive A --roster-audit AUDIT --json ACTIVATION.json`
// SIFT.json        `npx vite-node scripts/verify-nba-activation.ts --feed FEED.json --json > SIFT.json`
//
// READY only when BOTH read READY, both describe the same feed (same generated_utc), the roster audit that D5 relied on describes that feed
// (same generated_utc and slate), and the feed's inputs are current. Exit 0 = READY, 1 = anything else.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (k) => arg(k) ?? (console.error(`missing ${k}`), process.exit(2));
const read = (p) => readFileSync(p);
const json = (p) => JSON.parse(read(p).toString('utf-8'));

const feedPath = need('--feed');
const feedBytes = read(feedPath);
const feed = JSON.parse(feedBytes.toString('utf-8'));
const act = json(need('--activation'));
const sift = json(need('--sift'));
const audit = arg('--audit') ? json(arg('--audit')) : null;

const problems = [];
const gate = (name, ok, detail) => { if (!ok) problems.push(`${name}: ${detail}`); return { name, ok, detail }; };
const hoursSince = (iso) => (Date.now() - Date.parse(iso)) / 3.6e6;

const checks = [
  gate('repository activation check READY', act.verdict === 'READY', `verdict ${act.verdict}${act.remaining?.length ? ` · remaining: ${act.remaining.join(' | ')}` : ''}`),
  gate('SIFT verification READY', sift.ready === true, sift.ready ? 'S1-S9 pass' : `not ready: ${(sift.checks ?? []).filter((c) => c.status !== 'PASS').map((c) => `${c.id} ${c.status}: ${c.detail}`).join(' | ')}`),
  gate('both judged the same feed', act.projection_generated_utc === feed.generated_utc && String(sift.checks?.find((c) => c.id === 'S2')?.detail ?? '').includes(feed.generated_utc),
    `feed ${feed.generated_utc} · activation check read ${act.projection_generated_utc} · SIFT read "${sift.checks?.find((c) => c.id === 'S2')?.detail ?? 'no S2'}"`),
  gate('the feed is current', Number.isFinite(hoursSince(feed.data_asof_utc)) && hoursSince(feed.data_asof_utc) <= 6, `inputs ${hoursSince(feed.data_asof_utc).toFixed(1)} h old (limit 6 h for a joint verdict; SIFT itself allows 48 h)`),
  gate('a same-slate roster audit of this feed was used', !!audit && audit.feed_generated_utc === feed.generated_utc && audit.slate === feed.slate_date && !!audit.feed_sha256,
    audit ? `audit of feed ${audit.feed_generated_utc} slate ${audit.slate}; feed is ${feed.generated_utc} slate ${feed.slate_date}; ${audit.genuine_roster_errors} error(s)` : 'no audit supplied'),
  gate('the roster audit was run close to the check', !!audit && Math.abs(hoursSince(audit.checked_utc)) <= 6, audit ? `audit run ${audit.checked_utc}` : 'no audit'),
];

const ready = problems.length === 0;
const out = {
  schema: 'sift.nba_activation_joint.v1', checked_utc: new Date().toISOString(), ready,
  feed: { generated_utc: feed.generated_utc, data_asof_utc: feed.data_asof_utc, slate: feed.slate_date, games: feed.games?.length, rows: feed.players?.length, sha256: createHash('sha256').update(feedBytes).digest('hex') },
  activation_check: { verdict: act.verdict, remaining: act.remaining ?? [] },
  sift_verification: { ready: sift.ready, feedAgeHours: sift.feedAgeHours, checks: (sift.checks ?? []).map((c) => `${c.id} ${c.status}`) },
  roster_audit: audit ? { feed_generated_utc: audit.feed_generated_utc, slate: audit.slate, checked_utc: audit.checked_utc, errors: audit.genuine_roster_errors, error_list: audit.errors ?? [], feed_sha256: audit.feed_sha256 } : null,
  checks,
};
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
if (audit?.genuine_roster_errors) console.log(`\nroster audit errors (${audit.genuine_roster_errors}):\n${(audit.errors ?? []).slice(0, 20).map((e) => `  - ${e}`).join('\n')}`);
console.log(ready
  ? `\nJOINT: READY on feed ${feed.generated_utc}. Both gates independently read READY; promotion still needs a reviewed edit of projectionApprovals.ts and the owner's approval.`
  : `\nJOINT: NOT READY on feed ${feed.generated_utc}. Keep the research previews; change nothing in projectionApprovals.ts.\n- ${problems.join('\n- ')}`);
process.exit(ready ? 0 : 1);
