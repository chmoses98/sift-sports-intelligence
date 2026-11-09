// The app's school-name canonicalization for TEXT, for the CFB production check.
//
// The app rewrites every school spelling inside a CFB document's text at load time (src/lib/cfbTeams.ts
// `normalizeCfbNames` -> `cfbDisplayText`: "Massachusetts hangs around" -> "UMass hangs around") and keeps the
// published form beside it. The Script Engine card carries the rewritten title in `data-canonical`, so the check must
// compare it with the canonical form of the published title, not with the raw one. This module applies the app's own
// rules, seeded from the same two identity files (cfb-teams.json, cfb-public-names.json); tests/cfbProductionCheckNames.test.ts
// holds it equal to cfbDisplayText over every school in the map.

const FRAGMENT = /^(st\.?|state|miss\.?|tech|u\.?|univ\.?|university|college|a&m|the)$/i;
const MATCHUP_IN_NAME = /\s(at|vs\.?|v\.?|@)\s/i;
/** Abbreviations Kalshi prints that the "X St." rule cannot derive (src/lib/cfbTeams.ts EXTRA_ALIASES). */
const EXTRA_ALIASES = { 'Miss St.': 'MSST', 'Appalachian St.': 'APP' };
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param teams  cfb-teams.json `teams` (code -> { n: schedule name, ... })
 * @param names  cfb-public-names.json `names` (code -> public name where it differs from the schedule name)
 * @returns (text) => text with every known raw school spelling replaced by its canonical name
 */
export function makeCanonicalText(teams, names) {
  const canonical = (code) => names[code] ?? teams[code]?.n ?? null;
  const aliases = new Map();
  const contested = new Set();
  const add = (raw, name) => {
    const r = raw.trim().replace(/\s+/g, ' ');
    if (!r || r === name || contested.has(r) || aliases.get(r) === name) return;
    if (FRAGMENT.test(r)) return;
    if (aliases.has(r)) {
      aliases.delete(r);
      contested.add(r); // a spelling two schools claim is never rewritten
    } else aliases.set(r, name);
  };
  for (const [code, t] of Object.entries(teams)) {
    const name = canonical(code);
    add(t.n, name);
    const st = /^(.+) State$/.exec(t.n);
    if (st) add(`${st[1]} St.`, name);
  }
  for (const [raw, code] of Object.entries(EXTRA_ALIASES)) if (teams[code]) add(raw, canonical(code));
  if (!aliases.size) return (text) => text;
  const re = new RegExp(`(?<![\\w&'’-])(${[...aliases.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![\\w&-]|\\s\\()`, 'g');
  return (text) => (text ? text.replace(re, (m) => aliases.get(m) ?? m) : text);
}
