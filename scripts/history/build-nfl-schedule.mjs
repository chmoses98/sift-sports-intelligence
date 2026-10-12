#!/usr/bin/env node
// NFL LEAGUE SCHEDULE for Sift — every game of the season with its final score and, for completed games only, the
// closing spread and total as nflverse publishes them.
//
// Why: the NFL publication lists a rolling window of games, and a team profile carries only its own results, so the
// Season navigator could not show league-wide scores, and no screen could say whether the favourite covered. nflverse
// publishes the complete schedule (schedules/games.csv) with final scores and the closing lines. One small static
// document replaces 32 profile reads.
//
// Integrity:
//   * scores and lines are copied from the nflverse row, never derived;
//   * spread_line / total_line are written ONLY for games with a final score: nflverse documents them as the
//     closing lines, and before kickoff the same columns hold a moving pre-game line, which Sift does not show as a
//     closing line (or as an executable price);
//   * spread_line keeps nflverse's sign convention: POSITIVE = the HOME team was favoured by that many points.
//
//   node scripts/history/build-nfl-schedule.mjs [out_file] [season]
//   SIFT_NFLVERSE_DIR=/path/with/games.csv  (optional: read an already-downloaded file instead of fetching)
// nflverse data is CC-BY 4.0.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = process.argv[2] ?? join(ROOT, 'public', 'data', 'league', 'nfl', 'schedule.json');
const SEASON = Number(process.argv[3] ?? 2026);
const URL_ = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

/** RFC 4180 CSV → array of objects (header row keys). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
}

const num = (v) => (v === '' || v == null || v === 'NA' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** One nflverse schedule row → one Sift schedule game (lines only once the game has a final score). */
export function gameFrom(r) {
  const hs = num(r.home_score);
  const as = num(r.away_score);
  const final = hs != null && as != null;
  return {
    id: r.game_id,
    week: num(r.week),
    type: r.game_type || null,
    date: r.gameday || null,
    time_et: r.gametime || null,
    away: r.away_team,
    home: r.home_team,
    neutral: r.location === 'Neutral',
    div: num(r.div_game) === 1,
    away_score: final ? as : null,
    home_score: final ? hs : null,
    overtime: final ? num(r.overtime) === 1 : null,
    spread_line: final ? num(r.spread_line) : null,
    total_line: final ? num(r.total_line) : null,
  };
}

async function main() {
  const local = process.env.SIFT_NFLVERSE_DIR ? join(process.env.SIFT_NFLVERSE_DIR, 'games.csv') : null;
  let text;
  if (local && existsSync(local)) text = readFileSync(local, 'utf-8');
  else {
    const r = await fetch(URL_, { redirect: 'follow' });
    if (!r.ok) throw new Error(`games.csv: HTTP ${r.status}`);
    text = await r.text();
  }
  const rows = parseCsv(text);
  const games = rows.filter((r) => Number(r.season) === SEASON).map(gameFrom).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time_et ?? '').localeCompare(b.time_et ?? '') || a.id.localeCompare(b.id));
  // A regular season is 272 games; refuse to publish a thin or empty schedule (the committed copy stays).
  if (games.filter((g) => g.type === 'REG').length < 250) throw new Error(`refusing to publish a thin ${SEASON} schedule (${games.length} games)`);
  const doc = {
    kind: 'sift_league_schedule',
    sport: 'NFL',
    season: SEASON,
    built_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: { url: URL_, rows: rows.length, licence: 'nflverse data CC-BY 4.0' },
    notes: [
      'Scores and lines are copied from the nflverse schedule row; nothing is modelled.',
      'spread_line and total_line are the closing lines nflverse publishes, written only once a game has a final score.',
      'spread_line sign: positive = the home team was favoured by that many points (nflverse convention).',
      'time_et is the scheduled kickoff in US Eastern time, as nflverse publishes it.',
    ],
    games,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.tmp`, JSON.stringify(doc));
  renameSync(`${OUT}.tmp`, OUT);
  console.log(`wrote ${games.length} games (${games.filter((g) => g.home_score != null).length} final) to ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
