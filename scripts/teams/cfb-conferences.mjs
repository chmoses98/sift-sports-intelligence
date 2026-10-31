// CFB conference membership from the CFB publication's own statement (pure; used by scripts/teams/fetch-cfb-conferences.mjs and
// tests/cfbConferences.test.ts). An exported event research document that names a conference (`event.extensions.conference`,
// "BIG-TEN") states a conference game: both of its participants belong to that conference. A document with no conference
// (a non-conference game) says nothing about either team. Nothing here is guessed from a name or taken from basketball.

/** The (contract team code -> publication conference) pairs one event research document states, or [] when it states none. */
export function conferencePairs(doc) {
  const ev = doc?.event;
  const conf = ev?.extensions?.conference;
  if (typeof conf !== 'string' || !conf.trim()) return [];
  const codes = (ev.participants ?? []).map((p) => p?.short_name).filter((c) => typeof c === 'string' && c);
  if (codes.length !== 2 || codes[0] === codes[1]) return [];
  return codes.map((code) => ({ code, conference: conf.trim(), event: ev.event_id }));
}

/** Merge pairs into a code -> conference map, refusing any team the publication places in two conferences (nothing is written then). */
export function mergeConferences(base, pairs) {
  const out = { ...base };
  const conflicts = [];
  for (const p of pairs) {
    const have = out[p.code];
    if (have && have !== p.conference) conflicts.push(`${p.code}: ${have} (committed or earlier) vs ${p.conference} (${p.event})`);
    else out[p.code] = p.conference;
  }
  return { teams: out, conflicts };
}
