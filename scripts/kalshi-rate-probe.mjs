// Read-only measurement of Kalshi's unauthenticated rate limit from one IP (public GET /markets).
// Open-loop schedules (requests start on a fixed clock, not after the previous answer), each
// separated by a cool-down: burst capacity, then 5/8/10/15/20 per second, then recovery after a 429.
// Every query is distinct (limit varies) and tiny. Run: node scripts/kalshi-rate-probe.mjs
const API = 'https://api.elections.kalshi.com/trade-api/v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 1000;
let first429 = null;
async function hit() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}/markets?series_ticker=KXNFLGAME&status=open&limit=${(n = n > 1 ? n - 1 : 999)}`, { headers: { Accept: 'application/json' } });
    await res.arrayBuffer();
    if (res.status === 429 && !first429) first429 = Object.fromEntries(res.headers);
    return { status: res.status, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { status: 0, ms: Math.round(performance.now() - t0), error: String(e) };
  }
}
const summary = (name, rs, wall) => {
  const bad = rs.map((r, i) => (r.status === 200 ? null : i)).filter((i) => i != null);
  console.log(`${name.padEnd(28)} n=${rs.length} ok=${rs.length - bad.length} 429=${rs.filter((r) => r.status === 429).length} other=${rs.filter((r) => r.status !== 200 && r.status !== 429).length} first-non-200=#${bad[0] ?? '-'} wall=${wall}ms`);
};
async function paced(name, perSecond, count) {
  const t0 = performance.now();
  const ps = [];
  for (let i = 0; i < count; i++) {
    const at = t0 + (i * 1000) / perSecond;
    await sleep(Math.max(0, at - performance.now()));
    ps.push(hit());
  }
  const rs = await Promise.all(ps);
  summary(name, rs, Math.round(performance.now() - t0));
}

console.log(`Kalshi rate probe ${new Date().toISOString()}`);
{
  const t0 = performance.now();
  const rs = [];
  for (let i = 0; i < 40; i++) rs.push(await hit()); // closed loop: as fast as one client can go
  summary('sequential, no pause', rs, Math.round(performance.now() - t0));
}
for (const [rate, count] of [[5, 40], [8, 48], [10, 50], [12, 48], [15, 45], [20, 60]]) {
  await sleep(20_000);
  await paced(`open-loop ${rate}/s`, rate, count);
}
await sleep(20_000);
{
  const rs = await Promise.all(Array.from({ length: 30 }, hit));
  summary('30 at once (burst capacity)', rs, 0);
  const t0 = performance.now();
  let tries = 0;
  while ((await hit()).status !== 200 && tries++ < 120) await sleep(250);
  console.log(`recovery after the burst: first 200 after ${Math.round(performance.now() - t0)} ms (${tries} retries at 250 ms)`);
}
console.log('first 429 headers:', JSON.stringify(first429));
