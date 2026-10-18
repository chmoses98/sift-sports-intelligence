// Production-path check of the published projection feeds. Reads the SAME URLs SIFT's browser reads, through SIFT's own fetcher,
// decoder, authority and row builders, against the live research publications — and reports what a reader would see for the
// current games and for games outside the feed's publication window. Read-only; writes nothing.
//
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx vite-node scripts/verify-projection-feeds.ts [--json]
//
// (The proxy variables are only for sandboxes that reach the internet through one; a normal machine needs none.)
import { getJson } from '../src/data/fetcher';
import { SportRepo } from '../src/data/repo';
import { sportByCode } from '../src/data/sports';
import type { BoardItem, EventDetailDoc, EventResearchDoc, HealthDoc } from '../src/contract/types';
import { propBoard as nflBoard } from '../src/insights/propBoard';
import { readFileSync } from 'node:fs';
import { cfbTeam } from '../src/lib/cfbTeams';
import { decodeProjections, findTeamProjections, projectionsUrl, type ProjectionDoc, type ProjSport } from '../src/lib/projections';
import { makeAuthority, type ProjectionAuthority } from '../src/lib/projectionAuthority';
import { applyAuthority, propBoard as mlbBoard } from '../src/views/mlb/PlayerProps';

const NOW = Date.now();
const asJson = process.argv.includes('--json');
const out: Record<string, unknown> = { checkedAt: new Date(NOW).toISOString() };

async function feed(sport: ProjSport) {
  const url = projectionsUrl(sport);
  const res = await fetch(url, { cache: 'no-cache' });
  const cors = res.headers.get('access-control-allow-origin');
  const doc: ProjectionDoc | null = res.ok ? decodeProjections(await res.json()) : null;      // exactly what useProjections() does
  const ageH = doc?.dataAsOf ? (NOW - Date.parse(doc.dataAsOf)) / 3.6e6 : null;
  return {
    url, http: res.status, cors, cacheControl: res.headers.get('cache-control'), decoded: !!doc, doc,
    summary: doc && { generatedAt: doc.generatedAt, dataAsOf: doc.dataAsOf, ageHours: ageH == null ? null : Math.round(ageH * 10) / 10, players: doc.players.length, teamRows: doc.teams.length,
      ready: Object.entries(doc.families).filter(([, v]) => v.readiness === 'READY').map(([k]) => k) },
  };
}

async function repoFor(code: string) {
  const sport = sportByCode(code)!;
  const liveHealth = await getJson<HealthDoc>(`${sport.rawBase}/health.json`);
  return new SportRepo({ sport, mode: 'live', root: sport.rawBase, liveHealth, liveError: null, snapshot: null, reason: 'verify' });
}

/** Games a reader could open: not final, starting from three hours ago to eight days out (the explorer's own window). */
const upcoming = (items: BoardItem[]) => items.filter((b) => Date.parse(b.start_time_utc) > NOW - 3 * 3600_000 && Date.parse(b.start_time_utc) < NOW + 8 * 86_400_000 && !/FINAL|CANCEL|POSTPON/i.test(b.status))
  .sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));

const tally = () => new Map<string, number>();
const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const obj = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort());

async function nfl(authority: ProjectionAuthority, doc: ProjectionDoc | null) {
  const repo = await repoFor('NFL');
  const games = upcoming((await repo.board()).items);
  const feedTeams = new Set((doc?.players ?? []).map((p) => `${p.team}`));
  const perGame: unknown[] = [];
  for (const g of games) {
    const [r, d] = await Promise.all([repo.eventResearch(g.event_id), repo.eventDetail(g.event_id)]);
    const b = nflBoard(r as EventResearchDoc, d as EventDetailDoc, undefined, authority);
    const per: Record<string, Map<string, number>> = { receptions: tally(), completions: tally(), other: tally() };
    for (const row of b.rows) {
      const st = row.projectionStatus;
      const bucket = row.def.stat === 'receptions' ? 'receptions' : row.def.stat === 'completions' ? 'completions' : 'other';
      add(per[bucket], st.kind === 'withheld' ? `withheld:${st.code}` : st.kind === 'fallback' ? `fallback:${st.trigger}` : st.kind);
    }
    const names = g.participants.map((p) => p.short_name);
    perGame.push({ game: names.join(' @ '), start: g.start_time_utc, inFeed: names.some((n) => [...feedTeams].some((t) => t === n || t === (n === 'LAR' ? 'LA' : n))),
      receptions: obj(per.receptions), completions: obj(per.completions), otherStats: obj(per.other) });
  }
  return { upcomingGames: games.length, perGame };
}

async function mlb(authority: ProjectionAuthority) {
  const repo = await repoFor('MLB');
  const games = upcoming((await repo.board()).items);
  const perGame: unknown[] = [];
  for (const g of games) {
    const d = (await repo.eventDetail(g.event_id)) as EventDetailDoc;
    const away = g.participants.find((p) => p.participant_id === g.away_participant)?.short_name ?? null;
    const home = g.participants.find((p) => p.participant_id === g.home_participant)?.short_name ?? null;
    const abbrOf = (pid: string | null) => (pid === g.home_participant ? home : pid === g.away_participant ? away : null);
    const b = applyAuthority(mlbBoard(d.markets, [away, home].filter((x): x is string => !!x), abbrOf), authority);
    const t = tally();
    const sample: unknown[] = [];
    for (const p of b.pitchers) for (const f of p.families) {
      if (f.family !== 'pitcher_strikeouts' && f.family !== 'pitcher_outs') continue;
      const s = f.selected;
      add(t, !s ? 'legacy' : s.kind === 'withheld' ? `withheld:${s.code}` : s.kind === 'fallback' ? `fallback:${s.trigger}` : s.kind);
      if (s?.kind === 'authoritative' && sample.length < 2) sample.push({ pitcher: p.name, family: f.family, expected: f.expected?.mean, reliability: s.value.reliability });
    }
    perGame.push({ game: `${away} @ ${home}`, start: g.start_time_utc, pitcherStats: obj(t), sample });
  }
  return { upcomingGames: games.length, perGame };
}

async function cfb(authority: ProjectionAuthority) {
  const repo = await repoFor('CFB');
  const board = (await repo.board()).items;
  const games = upcoming(board);
  const short = (g: BoardItem, pid?: string | null) => g.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const ids = (g: BoardItem) => ({ home: short(g, g.home_participant), away: short(g, g.away_participant), homeId: cfbTeam(short(g, g.home_participant))?.e ?? null, awayId: cfbTeam(short(g, g.away_participant))?.e ?? null });
  const tallyPoints = tally();
  const sample: unknown[] = [];
  for (const g of games) {
    const q = ids(g);
    const r = authority.resolveTeams({ family: 'team_points', ...q, startUtc: g.start_time_utc });
    add(tallyPoints, r.kind === 'withheld' ? `withheld:${r.code}` : r.kind);
    if (sample.length < 4 || r.kind === 'authoritative') sample.push({ game: `${q.away} @ ${q.home}`, start: g.start_time_utc, teamPoints: r.kind === 'withheld' ? `withheld: ${r.reason}` : r.kind });
  }
  // identity coverage: can SIFT name every upcoming team by the ESPN id the feed uses?
  const withIds = games.filter((g) => ids(g).homeId && ids(g).awayId).length;
  // the join on real feed-shaped data: a feed document from a past slate (--cfb-sample) against the board's games of those days
  let join: unknown = null;
  const arg = process.argv.indexOf('--cfb-sample');
  if (arg > 0) {
    const doc = decodeProjections(JSON.parse(readFileSync(process.argv[arg + 1], 'utf-8')));
    if (doc) {
      // per feed game: does SIFT list it (the board has a game that day with one of its two ESPN ids), and does the join find it?
      const feedGames = new Map<string, { homeId: string | null; awayId: string | null; day: string; home: string; away: string }>();
      for (const t of doc.teams) feedGames.set(t.gameId, { homeId: t.homeId, awayId: t.awayId, day: (t.startUtc ?? '').slice(0, 10), home: t.home, away: t.away });
      let listed = 0, matched = 0;
      const sameDay = (day: string, g: BoardItem) => Math.abs(Date.parse(day) - Date.parse(g.start_time_utc.slice(0, 10))) <= 86_400_000;
      for (const f of feedGames.values()) {
        const cands = board.filter((g) => sameDay(f.day, g) && [ids(g).homeId, ids(g).awayId].some((x) => x && (x === f.homeId || x === f.awayId)));
        if (!cands.length) continue;
        listed++;
        if (cands.some((g) => !!findTeamProjections(doc, { ...ids(g), startUtc: g.start_time_utc }))) matched++;
      }
      join = { feedGames: feedGames.size, listedOnSiftBoard: listed, matchedByEspnId: matched, note: 'games the board does not list have no SIFT page, so they are not misses' };
    }
  }
  return { upcomingGames: games.length, teamPoints: obj(tallyPoints), teamsNamedByEspnId: `${withIds}/${games.length}`, joinOnRealFeedShape: join, sample: sample.slice(0, 6) };
}

async function main() {
  for (const code of ['NFL', 'CFB', 'MLB'] as ProjSport[]) {
    const f = await feed(code);
    const authority = makeAuthority(code, f.doc, NOW);
    const detail = code === 'NFL' ? await nfl(authority, f.doc) : code === 'MLB' ? await mlb(authority) : await cfb(authority);
    const { doc: _doc, ...feedInfo } = f;
    void _doc;
    out[code] = { feed: feedInfo, ...detail };
  }
  console.log(asJson ? JSON.stringify(out, null, 1) : JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
