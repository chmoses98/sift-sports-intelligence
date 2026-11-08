#!/usr/bin/env node
// NBA player game-log freshness and completeness, read from the live nba-edge-finder explorer (no auth).
// Fails (exit 1) when the publication is stale or its logs are structurally incomplete. It never "repairs" anything: a gap is reported, not hidden.
//   node scripts/nba-player-audit.mjs [--max-days 3] [--season 2026-27] [--min-current 0.9]
// Checks: the index is fresh (generated_at and quality.data_as_of within --max-days); every profile carries the season; at least --min-current of
// profiles have a played regular-season row of that season (the rest are named: injured or not yet played); no profile lacks the columns the
// Player screens read; played rows have minutes and an opponent; no duplicate event ids; no row dated in the future.
import { pathToFileURL } from 'node:url';

const REQUIRED = ['date_et', 'event_id', 'season', 'season_type', 'team', 'opp', 'home', 'played', 'min', 'pts', 'reb', 'ast', 'fg3m'];
const DAY = 86_400_000;

/** Pure: `index` and `docs` (profile documents) in, a report out. `now` is epoch ms. */
export function auditPlayers(index, docs, now, { maxDays = 3, season = '2026-27', minCurrent = 0.9 } = {}) {
  const fails = [];
  const notes = [];
  const age = (iso) => (Number.isFinite(Date.parse(iso)) ? (now - Date.parse(iso)) / DAY : Infinity);
  if (age(index.generated_at) > maxDays) fails.push(`index generated_at ${index.generated_at} is older than ${maxDays} d`);
  if (age(index.quality?.data_as_of) > maxDays) fails.push(`index data_as_of ${index.quality?.data_as_of ?? 'missing'} is older than ${maxDays} d`);
  let current = 0;
  const idle = [];
  let newest = '';
  let playedRows = 0, noMin = 0, noOpp = 0, dups = 0, future = 0;
  for (const d of docs) {
    const name = d.entity?.display_name ?? '?';
    if (d.season !== season) fails.push(`${name}: profile season ${d.season}, want ${season}`);
    const gl = d.extensions?.game_log;
    if (!gl || !Array.isArray(gl.columns) || !Array.isArray(gl.rows)) { fails.push(`${name}: no game_log`); continue; }
    const missing = REQUIRED.filter((c) => !gl.columns.includes(c));
    if (missing.length) { fails.push(`${name}: game_log lacks ${missing.join(', ')}`); continue; }
    const ix = Object.fromEntries(gl.columns.map((c, i) => [c, i]));
    const ids = new Set();
    let last = null;
    for (const r of gl.rows) {
      if (ids.has(r[ix.event_id])) dups++; else ids.add(r[ix.event_id]);
      const date = r[ix.date_et];
      if (Date.parse(`${date}T12:00:00Z`) > now + DAY) future++;
      if (r[ix.played] === true) {
        playedRows++;
        if (r[ix.min] == null) noMin++;
        if (!r[ix.opp]) noOpp++;
        if (r[ix.season] === season && r[ix.season_type] === 'regular' && (!last || date > last)) last = date;
      }
    }
    if (last) { current++; if (last > newest) newest = last; } else idle.push(name);
  }
  const share = docs.length ? current / docs.length : 0;
  if (share < minCurrent) fails.push(`only ${current}/${docs.length} players have a played ${season} regular-season game (want ${Math.round(minCurrent * 100)}%)`);
  if (dups) fails.push(`${dups} duplicate event rows`);
  if (future) fails.push(`${future} rows dated in the future`);
  if (noMin) fails.push(`${noMin} played rows without minutes`);
  if (noOpp) fails.push(`${noOpp} played rows without an opponent`);
  if (newest && age(`${newest}T12:00:00Z`) > Math.max(maxDays + 2, 5)) fails.push(`newest played game ${newest} is stale`);
  notes.push(`${docs.length} profiles, ${current} with ${season} regular-season games, newest ${newest || '—'}, ${playedRows} played rows`);
  if (idle.length) notes.push(`no ${season} regular-season game yet (shown honestly, never padded): ${idle.join(', ')}`);
  return { ok: fails.length === 0, fails, notes };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const BASE = 'https://raw.githubusercontent.com/chmoses98/nba-edge-finder/data-archive/app/latest/explorer/';
  const get = async (p) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
  const index = await get('index.json');
  const paths = Object.keys(index.files).filter((k) => k.startsWith('players/'));
  const docs = [];
  for (let i = 0; i < paths.length; i += 12) docs.push(...(await Promise.all(paths.slice(i, i + 12).map(get))));
  const rep = auditPlayers(index, docs, Date.now(), { maxDays: Number(arg('--max-days', 3)), season: arg('--season', '2026-27'), minCurrent: Number(arg('--min-current', 0.9)) });
  for (const n of rep.notes) console.log(n);
  for (const f of rep.fails) console.log(`FAIL ${f}`);
  console.log(rep.ok ? 'CURRENT: NBA player logs pass.' : 'STALE or INCOMPLETE.');
  process.exit(rep.ok ? 0 : 1);
}
