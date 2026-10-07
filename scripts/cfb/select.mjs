// Which current CFB games prove the Script Engine path end to end, chosen from the LIVE publication every run
// (never pinned: a pinned game goes stale the week it is played).
//
// Two upstream documents must agree for every game the check uses:
//   data/scripting/live/index.json        the script engine's own per-game status (game_key -> status)
//   app/latest/explorer/events/<id>.json  the exported event research Sift reads (extensions.script_engine)
// A positive status in the index whose exported payload is missing, empty or different is an upstream export
// failure, reported as such, before any browser is opened.

/** Statuses whose exported payload must carry at least one script, and the count the status implies. */
export const POSITIVE = { SCRIPTS_GENERATED: (n) => n >= 2, SINGLE_SCRIPT: (n) => n === 1 };
export const NEGATIVE = 'NO_SCRIPT_CLEARED_EVIDENCE';
/** Index statuses that are not a script verdict of their own (the export carries the frozen or failed state). */
const NOT_A_VERDICT = new Set(['KICKED_OFF_FROZEN', 'IDENTITY_FAIL']);

/** Upcoming board items, earliest first. A game counts until kickoff (its page is research, not a box score). */
export function upcoming(board, nowMs) {
  return (board?.items ?? [])
    .filter((i) => i.status === 'SCHEDULED' && Date.parse(i.start_time_utc) > nowMs)
    .sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc) || a.event_id.localeCompare(b.event_id));
}

/** explorer/index.json -> the app-root path of an event's research document (the same table Sift builds). */
export function researchPath(explorerIndex, eventId) {
  for (const [rel, f] of Object.entries(explorerIndex?.files ?? {})) {
    if (f.kind === 'event_research' && f.entity_id === eventId) return `explorer/${rel}`;
  }
  return null;
}

/** What one exported research document says about its script engine payload. */
export function payloadOf(doc) {
  const se = doc?.extensions?.script_engine ?? null;
  const scripts = Array.isArray(se?.game_scripts) ? se.game_scripts : [];
  const parts = doc?.event?.participants ?? [];
  const slot = (ha) => parts.find((p) => p.participant_id === doc?.participants?.find((x) => x.home_away === ha)?.participant_id);
  return {
    eventId: doc?.event?.event_id ?? null,
    gameKey: doc?.event?.extensions?.game_key ?? null,
    title: doc?.event?.extensions?.title ?? null,
    start: doc?.event?.start_time_utc ?? null,
    present: !!se,
    status: se?.status ?? null,
    hasGeneration: !!se?.script_generation,
    scripts: scripts.map((s) => ({ id: s.script_id, role: s.role, title: s.title, rank: s.rank })),
    sections: se ? ['matchup_profile', 'matchup_findings', 'script_market_map', 'script_survivors', 'theses', 'data_confidence', 'script_generation'].filter((k) => se[k] == null) : [],
    home: slot('HOME')?.short_name ?? null,
    away: slot('AWAY')?.short_name ?? null,
  };
}

/**
 * Does the exported payload faithfully carry what the script index says? Returns problems (empty = agrees).
 * A positive verdict must arrive with its scripts and every section Sift renders; a negative verdict must carry
 * no script (Sift must never be handed an invented one).
 */
export function agreement(indexStatus, p) {
  const out = [];
  if (!p.present) return [`${p.gameKey ?? p.eventId}: index says ${indexStatus} but the exported research has no extensions.script_engine`];
  if (NOT_A_VERDICT.has(indexStatus)) return out;
  if (p.status !== indexStatus) out.push(`${p.gameKey}: index says ${indexStatus}, export says ${p.status}`);
  if (POSITIVE[indexStatus]) {
    if (!p.hasGeneration) out.push(`${p.gameKey}: ${indexStatus} exported without script_generation`);
    if (!POSITIVE[indexStatus](p.scripts.length)) out.push(`${p.gameKey}: ${indexStatus} exported with ${p.scripts.length} scripts`);
    if (p.sections.length) out.push(`${p.gameKey}: ${indexStatus} exported without ${p.sections.join(', ')}`);
  }
  if (indexStatus === NEGATIVE && p.scripts.length) out.push(`${p.gameKey}: ${NEGATIVE} exported with ${p.scripts.length} scripts`);
  return out;
}

/**
 * Walk the upcoming slate (earliest first) and keep the first game of each kind whose export agrees with the
 * index: one SCRIPTS_GENERATED, one SINGLE_SCRIPT and one NO_SCRIPT_CLEARED_EVIDENCE. `readDoc(path)` returns
 * the exported research document. Every disagreement met on the way is returned too: it is an upstream failure.
 */
export async function selectGames({ board, explorerIndex, scriptIndex, readDoc, nowMs, want = ['SCRIPTS_GENERATED', 'SINGLE_SCRIPT', NEGATIVE], maxScan = 80 }) {
  const games = scriptIndex?.games ?? {};
  const picked = {};
  const problems = [];
  let scanned = 0;
  for (const item of upcoming(board, nowMs)) {
    if (want.every((w) => picked[w])) break;
    if (scanned >= maxScan) break;
    const path = researchPath(explorerIndex, item.event_id);
    if (!path) {
      problems.push(`${item.event_id}: on the board but no event_research in the explorer index`);
      continue;
    }
    scanned++;
    const p = payloadOf(await readDoc(path));
    const st = games[p.gameKey]?.status;
    if (!st) continue; // not (yet) in the script engine's index: nothing to compare
    const bad = agreement(st, p);
    if (bad.length) {
      problems.push(...bad);
      continue;
    }
    if (want.includes(st) && !picked[st]) picked[st] = { ...p, path, indexStatus: st };
  }
  return { picked, problems, scanned };
}
