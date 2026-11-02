// Audit: run the real props parser over a published event_detail and count every excluded contract by reason.
import { readFileSync } from 'node:fs';
import { parseGameProps, statOf, rungOf, subjectOf, isTeamSubject } from '../src/v3/data/props/parse';
import { isTradableWord } from '../src/v3/model/marketStatus';
const [file, away, home] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(file, 'utf8'));
const t = (abbr: string) => ({ id: abbr, slug: 'nfl', sport: 'NFL', name: abbr, nick: abbr, abbr, logo: null, colors: ['#000', '#000'] as [string, string] });
const g = { slug: 'nfl', sportLabel: 'NFL', eventId: doc.event.event_id, key: 'nfl:' + doc.event.event_id, startMs: 0, away: t(away), home: t(home), awayId: doc.event.away_participant, homeId: doc.event.home_participant };
const reasons: Record<string, number> = {};
const bump = (r: string) => (reasons[r] = (reasons[r] ?? 0) + 1);
for (const m of doc.markets) {
  const stat = statOf(m);
  if (!stat) { bump('not a player stat ladder'); continue; }
  if (!isTradableWord(m.market_status)) { bump('status ' + m.market_status); continue; }
  if (!(m.period == null || /^full(_game)?$/i.test(m.period))) { bump('period ' + m.period); continue; }
  const a = m.yes_ask; if (a == null || !(a > 0 && a < 1)) { bump('no valid ask'); continue; }
  if (rungOf(m) == null) { bump('no rung'); continue; }
  const who = subjectOf(m); if (!who) { bump('no subject'); continue; }
  if (isTeamSubject(who, g)) { bump('team subject'); continue; }
  bump('kept contract');
}
const props = parseGameProps(g, doc.markets);
console.log(JSON.stringify({ markets: doc.markets.length, reasons, propRows: props.length, contracts: props.reduce((n, p) => n + p.rungs.length, 0), noTeam: props.filter((p) => !p.team).length, sample: props.slice(0, 3).map((p) => [p.name, p.team, p.label, p.rungs.map((r) => r.k + '@' + r.ask)]) }, null, 1));
