// CFB team identity from the CFB publication's own identity-verified games (pure; used by
// scripts/teams/fetch-cfb-teams.mjs and tests/cfbTeams.test.ts).

/**
 * The verified (code -> ESPN team) pairs one exported research document carries, or [] when its identity check
 * did not pass.
 */
export function pairsOf(doc) {
  const se = doc?.extensions?.script_engine;
  const idt = se?.script_generation?.identity;
  if (!idt || !['PASS', 'RESOLVED'].includes(idt.status)) return [];
  const teams = se.matchup_profile?.teams ?? {};
  const swapped = idt.orientation_swapped === true;
  const out = [];
  for (const p of doc.participants ?? []) {
    const side = p.home_away === 'HOME' ? 'home' : p.home_away === 'AWAY' ? 'away' : null;
    if (!side) return [];
    const t = teams[swapped ? (side === 'home' ? 'away' : 'home') : side];
    const code = doc.event?.participants?.find((x) => x.participant_id === p.participant_id)?.short_name;
    if (!t?.team_id || !code) return [];
    out.push({ code, espn: String(t.team_id), name: t.name ?? p.display_name, participant: p.participant_id, event: doc.event.event_id });
  }
  return out.length === 2 ? out : [];
}

/** Merge pairs into a code -> team map, refusing any code or ESPN id that would map two ways. */
export function mergePairs(base, pairs) {
  const teams = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { ...v }]));
  const byEspn = new Map(Object.entries(teams).map(([code, t]) => [t.e, code]));
  const conflicts = [];
  for (const p of pairs) {
    const have = teams[p.code];
    if (have && have.e !== p.espn) conflicts.push(`${p.code}: ESPN ${have.e} (committed or earlier) vs ${p.espn} (${p.event})`);
    const other = byEspn.get(p.espn);
    if (other && other !== p.code) conflicts.push(`ESPN ${p.espn}: ${other} vs ${p.code} (${p.event})`);
    if (conflicts.length) continue;
    teams[p.code] = { ...(have ?? {}), e: p.espn, n: p.name };
    byEspn.set(p.espn, p.code);
  }
  return { teams, conflicts };
}
