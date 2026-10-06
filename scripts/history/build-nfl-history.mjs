#!/usr/bin/env node
// NFL player and team HISTORY for Sift — game logs, usage, QB starts and charted scheme rates.
//
// Why: the NFL publication commits no 2026 player game logs (capability player_game_logs = RESEARCH) and no
// per-game team stats, so player pages had no history and season rankings could not be put in context
// (e.g. a quarterback change). nflverse publishes the season's play-by-play, weekly player stats, snap
// counts and FTN charting as public release files; this script turns them into small static documents that
// Sift reads like the rest of its research (same origin, cached by the service worker).
//
// Nothing is modelled: every number is a count, a sum or a ratio of published rows, with its sample size.
// Team-level scheme data is written PER WEEK (numerators and denominators) so a game page can aggregate
// only the weeks before that game's kickoff — no result leaks into pregame research.
//
//   node scripts/history/build-nfl-history.mjs [out_dir] [season]
//   SIFT_NFLVERSE_DIR=/path/with/csvs  (optional: read already-downloaded files instead of fetching)
//
// Sources (https://github.com/nflverse/nflverse-data/releases):
//   stats_player/stats_player_week_<season>.csv   weekly player box scores
//   pbp/play_by_play_<season>.csv.gz              play-by-play (EPA, dropbacks, targets, longest plays)
//   snap_counts/snap_counts_<season>.csv          offensive snaps (PFR)
//   ftn_charting/ftn_charting_<season>.csv        FTN charting: blitzers, box count, play action, motion
// FTN charting is © FTN Data, published by nflverse under CC-BY-SA 4.0; nflverse data under CC-BY 4.0.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = process.argv[2] ?? join(ROOT, 'public', 'data', 'nfl', 'history');
const SEASON = Number(process.argv[3] ?? 2026);
const REL = 'https://github.com/nflverse/nflverse-data/releases/download';
const SOURCES = {
  stats: `stats_player/stats_player_week_${SEASON}.csv`,
  pbp: `pbp/play_by_play_${SEASON}.csv.gz`,
  snaps: `snap_counts/snap_counts_${SEASON}.csv`,
  ftn: `ftn_charting/ftn_charting_${SEASON}.csv`,
};

async function load(path) {
  const local = process.env.SIFT_NFLVERSE_DIR ? join(process.env.SIFT_NFLVERSE_DIR, path.split('/').pop()) : null;
  let buf;
  if (local && existsSync(local)) buf = readFileSync(local);
  else {
    const r = await fetch(`${REL}/${path}`, { redirect: 'follow' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  if (path.endsWith('.gz')) buf = gunzipSync(buf);
  return parseCsv(buf.toString('utf-8'));
}

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

const num = (v) => (v === '' || v == null || v === 'NA' ? null : Number(v));
const int = (v) => num(v) ?? 0;
const yes = (v) => v === '1' || v === 'TRUE' || v === 'true' || v === '1.0';
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const norm = (s) => (s ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const SKILL = new Set(['QB', 'RB', 'FB', 'WR', 'TE']);

const [stats, pbp, snaps, ftn] = await Promise.all([load(SOURCES.stats), load(SOURCES.pbp), load(SOURCES.snaps), load(SOURCES.ftn).catch(() => [])]);
console.log(`rows: stats ${stats.length}, pbp ${pbp.length}, snaps ${snaps.length}, ftn ${ftn.length}`);

// ------------------------------------------------------------------ games (from play-by-play)
const games = new Map();
for (const p of pbp) {
  if (!games.has(p.game_id)) games.set(p.game_id, { game_id: p.game_id, week: int(p.week), season_type: p.season_type, date: p.game_date, home: p.home_team, away: p.away_team, home_score: null, away_score: null });
  const g = games.get(p.game_id);
  if (num(p.home_score) != null) { g.home_score = int(p.home_score); g.away_score = int(p.away_score); }
}

// ------------------------------------------------------------------ plays, joined with FTN charting
const ftnBy = new Map(ftn.map((x) => [`${x.nflverse_game_id}|${x.nflverse_play_id}`, x]));
const positionOf = new Map(stats.map((s) => [s.player_id, s.position]));
const isRealPlay = (p) => p.play_deleted !== '1' && p.two_point_attempt !== '1' && p.aborted_play !== '1' && p.posteam && (p.play_type === 'pass' || p.play_type === 'run' || p.play_type === 'qb_kneel' || p.play_type === 'qb_spike');

const longest = new Map(); // gsis|game -> { rec, rush }
const teamWeek = new Map(); // team|week -> counters
const qbGame = new Map(); // game|team|gsis -> { dropbacks, epa }
const playerBlitz = new Map(); // gsis -> { tgt_blitz, tgt_noblitz, db_blitz, epa_blitz, db_noblitz, epa_noblitz }
const tw = (team, week, game) => {
  const k = `${team}|${week}`;
  if (!teamWeek.has(k)) teamWeek.set(k, { team, week, game_id: game, off: blank(), def: blank() });
  return teamWeek.get(k);
};
function blank() {
  return {
    plays: 0, dropbacks: 0, db_epa: 0, rushes: 0, rush_epa: 0, rush_success: 0,
    charted_db: 0, blitz_db: 0, blitz_db_epa: 0, noblitz_db: 0, noblitz_db_epa: 0,
    blitz_targets: 0, blitz_rb_targets: 0, noblitz_targets: 0, noblitz_rb_targets: 0,
    charted_plays: 0, play_action: 0, motion: 0, charted_rushes: 0, stacked_box_rushes: 0,
  };
}
for (const p of pbp) {
  if (!isRealPlay(p)) continue;
  const g = games.get(p.game_id);
  const week = int(p.week);
  const off = tw(p.posteam, week, p.game_id).off;
  const def = tw(p.defteam, week, p.game_id).def;
  const epa = num(p.epa) ?? 0;
  const db = yes(p.qb_dropback);
  const rush = p.play_type === 'run' && !yes(p.qb_scramble);
  const ch = ftnBy.get(`${p.game_id}|${p.play_id}`);
  for (const u of [off, def]) {
    u.plays++;
    if (db) { u.dropbacks++; u.db_epa += epa; }
    if (rush) { u.rushes++; u.rush_epa += epa; u.rush_success += yes(p.success) ? 1 : 0; }
  }
  if (db && p.passer_player_id) {
    const k = `${p.game_id}|${p.posteam}|${p.passer_player_id}`;
    const q = qbGame.get(k) ?? { gsis: p.passer_player_id, name: p.passer_player_name, team: p.posteam, game_id: p.game_id, week, dropbacks: 0, epa: 0 };
    q.dropbacks++; q.epa += epa; qbGame.set(k, q);
  }
  if (yes(p.complete_pass) && p.receiver_player_id) {
    const k = `${p.receiver_player_id}|${p.game_id}`;
    const l = longest.get(k) ?? { rec: 0, rush: 0 };
    l.rec = Math.max(l.rec, int(p.receiving_yards ?? p.yards_gained)); longest.set(k, l);
  }
  if (p.play_type === 'run' && p.rusher_player_id) {
    const k = `${p.rusher_player_id}|${p.game_id}`;
    const l = longest.get(k) ?? { rec: 0, rush: 0 };
    l.rush = Math.max(l.rush, int(p.rushing_yards ?? p.yards_gained)); longest.set(k, l);
  }
  if (!ch) continue;
  for (const u of [off, def]) {
    u.charted_plays++;
    if (yes(ch.is_play_action)) u.play_action++;
    if (yes(ch.is_motion)) u.motion++;
    if (rush) { u.charted_rushes++; if (int(ch.n_defense_box) >= 8) u.stacked_box_rushes++; }
    if (db) {
      u.charted_db++;
      const blitz = int(ch.n_blitzers) > 0;
      const target = p.receiver_player_id && yes(p.pass_attempt) && !yes(p.sack);
      const rbTarget = target && ['RB', 'FB'].includes(positionOf.get(p.receiver_player_id) ?? '');
      if (blitz) { u.blitz_db++; u.blitz_db_epa += epa; if (target) u.blitz_targets++; if (rbTarget) u.blitz_rb_targets++; }
      else { u.noblitz_db++; u.noblitz_db_epa += epa; if (target) u.noblitz_targets++; if (rbTarget) u.noblitz_rb_targets++; }
    }
  }
  if (db) {
    const blitz = int(ch.n_blitzers) > 0;
    if (p.passer_player_id) {
      const s = playerBlitz.get(p.passer_player_id) ?? newSplit();
      if (blitz) { s.db_blitz++; s.epa_blitz += epa; } else { s.db_noblitz++; s.epa_noblitz += epa; }
      playerBlitz.set(p.passer_player_id, s);
    }
    if (p.receiver_player_id && yes(p.pass_attempt) && !yes(p.sack)) {
      const s = playerBlitz.get(p.receiver_player_id) ?? newSplit();
      if (blitz) s.tgt_blitz++; else s.tgt_noblitz++;
      playerBlitz.set(p.receiver_player_id, s);
    }
    // Team dropbacks in each state, for the receiver's share of targets against the blitz.
    const k = `team:${p.posteam}`;
    const t = playerBlitz.get(k) ?? newSplit();
    if (p.receiver_player_id && yes(p.pass_attempt) && !yes(p.sack)) { if (blitz) t.tgt_blitz++; else t.tgt_noblitz++; }
    playerBlitz.set(k, t);
  }
}
function newSplit() { return { db_blitz: 0, epa_blitz: 0, db_noblitz: 0, epa_noblitz: 0, tgt_blitz: 0, tgt_noblitz: 0 }; }

// ------------------------------------------------------------------ snaps (PFR ids → join by name + team + week)
const snapBy = new Map(snaps.map((s) => [`${norm(s.player)}|${s.team}|${s.week}`, s]));

// ------------------------------------------------------------------ player game logs
const byPlayer = new Map();
for (const s of stats) {
  if (!SKILL.has(s.position) || s.season_type === '') continue;
  const g = games.get(s.game_id);
  const sn = snapBy.get(`${norm(s.player_display_name)}|${s.team}|${s.week}`);
  const l = longest.get(`${s.player_id}|${s.game_id}`);
  const row = {
    week: int(s.week), game_id: s.game_id, season_type: s.season_type, date: g?.date ?? null, team: s.team, opp: s.opponent_team,
    home: g ? g.home === s.team : null,
    score: g && g.home_score != null ? { for: g.home === s.team ? g.home_score : g.away_score, against: g.home === s.team ? g.away_score : g.home_score } : null,
    snaps: sn ? { off: int(sn.offense_snaps), pct: r3(num(sn.offense_pct)) } : null,
    passing: s.position === 'QB' || int(s.attempts) > 0 ? { att: int(s.attempts), cmp: int(s.completions), yds: int(s.passing_yards), td: int(s.passing_tds), int: int(s.passing_interceptions), sacks: int(s.sacks_suffered), epa: r3(num(s.passing_epa)) } : null,
    rushing: { car: int(s.carries), yds: int(s.rushing_yards), td: int(s.rushing_tds), long: l?.rush ?? null },
    receiving: { tgt: int(s.targets), rec: int(s.receptions), yds: int(s.receiving_yards), td: int(s.receiving_tds), long: l?.rec ?? null, target_share: r3(num(s.target_share)), air_share: r3(num(s.air_yards_share)) },
  };
  const p = byPlayer.get(s.player_id) ?? { gsis: s.player_id, name: s.player_display_name, position: s.position, team: s.team, games: [] };
  p.team = s.team; // most recent row wins (rows are week-ordered below)
  p.games.push(row);
  byPlayer.set(s.player_id, p);
}

// ------------------------------------------------------------------ write
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'players'), { recursive: true });
const index = {};
for (const p of byPlayer.values()) {
  p.games.sort((a, b) => a.week - b.week);
  const b = playerBlitz.get(p.gsis);
  const t = playerBlitz.get(`team:${p.team}`);
  const blitz = b && (b.db_blitz + b.db_noblitz > 0 || b.tgt_blitz + b.tgt_noblitz > 0)
    ? {
        dropbacks_blitz: b.db_blitz, epa_per_db_blitz: b.db_blitz ? r3(b.epa_blitz / b.db_blitz) : null,
        dropbacks_no_blitz: b.db_noblitz, epa_per_db_no_blitz: b.db_noblitz ? r3(b.epa_noblitz / b.db_noblitz) : null,
        targets_blitz: b.tgt_blitz, targets_no_blitz: b.tgt_noblitz,
        team_targets_blitz: t?.tgt_blitz ?? null, team_targets_no_blitz: t?.tgt_noblitz ?? null,
      }
    : null;
  writeFileSync(join(OUT, 'players', `${p.gsis}.json`), JSON.stringify({ kind: 'sift_player_history', sport: 'NFL', season: SEASON, gsis: p.gsis, name: p.name, position: p.position, team: p.team, games: p.games, vs_blitz: blitz }));
  index[p.gsis] = { name: p.name, position: p.position, team: p.team, games: p.games.length };
}

const qbs = [...qbGame.values()].map((q) => ({ ...q, epa: r3(q.epa) }));
const teams = {};
for (const u of teamWeek.values()) {
  const t = (teams[u.team] ??= { team: u.team, weeks: [] });
  const g = games.get(u.game_id);
  const qs = qbs.filter((q) => q.game_id === u.game_id && q.team === u.team).sort((a, b) => b.dropbacks - a.dropbacks);
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r3(v) : v]));
  t.weeks.push({
    week: u.week, game_id: u.game_id, date: g?.date ?? null, opp: g ? (g.home === u.team ? g.away : g.home) : null, home: g ? g.home === u.team : null,
    qbs: qs.map((q) => ({ gsis: q.gsis, name: q.name, dropbacks: q.dropbacks, epa: q.epa })),
    off: round(u.off), def: round(u.def),
  });
}
for (const t of Object.values(teams)) t.weeks.sort((a, b) => a.week - b.week);
// Full display names for the quarterbacks (play-by-play carries "M.Penix").
const fullName = new Map(stats.map((s) => [s.player_id, s.player_display_name]));
for (const t of Object.values(teams)) for (const w of t.weeks) for (const q of w.qbs) q.name = fullName.get(q.gsis) ?? q.name;
writeFileSync(join(OUT, 'teams.json'), JSON.stringify({ kind: 'sift_team_history', sport: 'NFL', season: SEASON, teams }));

const ftnWeeks = {};
for (const x of ftn) ftnWeeks[x.week] = (ftnWeeks[x.week] ?? 0) + 1;
const pbpWeeks = {};
for (const g of games.values()) pbpWeeks[g.week] = (pbpWeeks[g.week] ?? 0) + 1;
writeFileSync(join(OUT, 'index.json'), JSON.stringify({
  kind: 'sift_history_index', sport: 'NFL', season: SEASON, built_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  sources: Object.entries(SOURCES).map(([k, path]) => ({ key: k, url: `${REL}/${path}`, rows: { stats: stats.length, pbp: pbp.length, snaps: snaps.length, ftn: ftn.length }[k] })),
  licence: 'nflverse data CC-BY 4.0; FTN charting © FTN Data, CC-BY-SA 4.0 (via nflverse)',
  games_by_week: pbpWeeks, ftn_charted_plays_by_week: ftnWeeks,
  notes: [
    'Counts and ratios of published rows only; nothing is modelled or adjusted.',
    'Snap counts are joined to players by name, team and week (PFR rows carry no GSIS id).',
    'A blitz is an FTN-charted dropback with at least one blitzer. Man/zone coverage is not in any 2026 file published yet.',
  ],
  players: index,
}, null, 1));
console.log(`wrote ${Object.keys(index).length} players, ${Object.keys(teams).length} teams to ${OUT}`);
