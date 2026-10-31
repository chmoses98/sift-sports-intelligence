// CFB conference membership, derived ONCE from the CFB publication and committed to src/lib/cfb-conferences.json.
//
//   node scripts/teams/fetch-cfb-conferences.mjs [--publication <dir|url>]
//
// SIFT's Home filters CFB games by conference. The board rows carry no conference and the CFBD rankings licence is unresolved, so the only
// stated source is each event research document's `event.extensions.conference` (a conference game names its conference; see
// scripts/teams/cfb-conferences.mjs). Teams are keyed by their contract code (the same key as src/lib/cfb-teams.json). The committed map is
// merged with what is already there, so coverage only grows; a team the publication places in two conferences stops the run.
// Basketball conferences (src/lib/cbb-teams.json) are NOT used: they differ for football (Army, Navy, North Dakota State, Northern Illinois...).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conferencePairs, mergeConferences } from './cfb-conferences.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const JSON_OUT = join(ROOT, 'src', 'lib', 'cfb-conferences.json');
const LIVE = 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const pub = arg('--publication') ?? LIVE;

async function read(rel) {
  if (/^https?:/.test(pub)) {
    const r = await fetch(`${pub.replace(/\/$/, '')}/${rel}`);
    if (!r.ok) throw new Error(`${r.status} ${rel}`);
    return r.json();
  }
  return JSON.parse(readFileSync(join(pub, rel), 'utf-8'));
}

const index = await read('explorer/index.json');
const paths = Object.entries(index.files).filter(([, f]) => f.kind === 'event_research').map(([rel]) => `explorer/${rel}`);
const pairs = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < paths.length) pairs.push(...conferencePairs(await read(paths[next++])));
}));
const previous = existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, 'utf-8')).teams ?? {} : {};
const { teams, conflicts } = mergeConferences(previous, pairs.sort((a, b) => a.event.localeCompare(b.event) || a.code.localeCompare(b.code)));
if (conflicts.length) {
  console.error(`CFB conference conflicts (nothing written):\n- ${[...new Set(conflicts)].join('\n- ')}`);
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])));
const lines = Object.entries(sorted).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
writeFileSync(JSON_OUT, `{"generated_at":${JSON.stringify(new Date().toISOString())},"source":"CFB publication event research documents: event.extensions.conference of a conference game applies to both of its participants (contract short_name -> publication conference label)","teams":{\n${lines.join(',\n')}\n}}\n`);
console.log(`${Object.keys(sorted).length} teams in ${new Set(Object.values(sorted)).size} conferences from ${paths.length} events`);
