#!/usr/bin/env node
// Is NBA team research current enough to open the gate in src/v3/model/capabilities.ts (NBA_STALE)?
// Reads the live nba-edge-finder explorer (no auth) and checks, for every team profile: season label, newest observation (`as_of`) and the newest
// completed game in `games`. Exit 0 only when ALL teams carry the current season and data no older than --max-days (default 3).
// Usage: node scripts/probe-nba-freshness.mjs [--max-days 3] [--season 2026-27]
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const maxDays = Number(arg('--max-days', 3));
const season = arg('--season', '2026-27');
const BASE = 'https://raw.githubusercontent.com/chmoses98/nba-edge-finder/data-archive/app/latest/explorer/';
const get = async (p) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const idx = await get('index.json');
const now = Date.now();
const rows = [];
for (const t of idx.teams) {
  const d = await get(t.path.replace(/^explorer\//, ''));
  const asOfs = (d.metrics ?? []).map((m) => Date.parse(m.as_of)).filter(Number.isFinite);
  const asOf = asOfs.length ? Math.max(...asOfs) : null;
  const done = (d.games ?? []).filter((g) => g.result).map((g) => Date.parse(g.start_time_utc)).filter(Number.isFinite);
  rows.push({ team: t.short_name, season: d.season, asOf, lastGame: done.length ? Math.max(...done) : null });
}
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');
const bad = rows.filter((r) => r.season !== season || r.asOf == null || now - r.asOf > maxDays * 86_400_000);
console.log(`explorer generated ${idx.generated_at}; ${rows.length} teams; want season ${season}, as_of within ${maxDays} d`);
for (const r of rows.slice(0, 5)) console.log(` ${r.team}: season ${r.season}, newest as_of ${day(r.asOf)}, last completed game ${day(r.lastGame)}`);
console.log(bad.length ? `STALE: ${bad.length} of ${rows.length} teams fail (newest as_of in file: ${day(Math.max(...rows.map((r) => r.asOf ?? 0)))}). Keep the gate.` : 'CURRENT: every team passes. The NBA_STALE gate may be reviewed for removal.');
process.exit(bad.length ? 1 : 0);
