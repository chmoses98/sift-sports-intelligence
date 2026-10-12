// Publication box logs (history/boxLog.ts), NHL contracts against the game log (history/nhlProps.ts) and the NBA
// game log / posted-line record (history/nbaLog.ts), read against the real fixtures in tests/fixtures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResearchMarket } from '../src/contract/types';
import { logHit, logHitText, nameKey, readBoxLog } from '../src/history/boxLog';
import { nhlContractHistory, nhlLine, nhlPlayerMarkets, nhlPregame, nhlSeasonLabel, nhlSeasonOf, nhlSubject, rowSeason } from '../src/history/nhlProps';
import { nbaLatestSeason, nbaSeasonAverages, postedRecord, readPropLog } from '../src/history/nbaLog';

const fx = (p: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', p), 'utf8'));

const mk = (over: Partial<ResearchMarket> & { extensions?: unknown }): ResearchMarket & { extensions?: unknown } => ({
  market_id: 'm', kalshi_ticker: 't', event_id: 'e', market_family: 'player_goals', yes_description: 'Andrei Svechnikov: 1+ goals',
  yes_bid: null, yes_ask: null, market_probability: null, captured_at: null, participant_id: null, player_id: null, period: 'FULL', line: null, threshold: 0.5,
  ...over,
});

describe('boxLog', () => {
  it('reads columns/rows as records and rejects malformed logs', () => {
    expect(readBoxLog({ columns: ['a', 'b'], rows: [[1, 2], [3]] })).toEqual([{ a: 1, b: 2 }, { a: 3, b: null }]);
    expect(readBoxLog(null)).toBeNull();
    expect(readBoxLog({ columns: ['a'] })).toBeNull();
  });
  it('counts the newest games over, under and push against a line', () => {
    const h = logHit([0, 1, 2, 0, 1, 3, 0], 0.5, 5);
    expect(h).toMatchObject({ n: 5, over: 3, under: 2, push: 0, wanted: 5 });
    expect(h.results).toEqual(['over', 'under', 'over', 'over', 'under']);
    expect(logHit([2, 3, 2], 2, null)).toMatchObject({ n: 3, over: 1, under: 0, push: 2 });
    expect(logHitText(logHit([2, 3, 2], 2, null))).toBe('1/3 · 2P');
    expect(logHitText(logHit([], 0.5, 5))).toBe('—');
  });
  it('matches names regardless of accents and punctuation', () => {
    expect(nameKey('Tim Stützle')).toBe(nameKey('Tim Stutzle'));
    expect(nameKey("Ryan O'Reilly")).toBe('ryan oreilly');
  });
});

describe('NHL contracts against the game log', () => {
  it('reads the line from the threshold, else from "N+"', () => {
    expect(nhlLine(mk({ threshold: 1.5 }))).toBe(1.5);
    expect(nhlLine(mk({ threshold: null, yes_description: 'Sam Reinhart: 2+ points' }))).toBe(1.5);
    expect(nhlLine(mk({ threshold: null, yes_description: 'no count' }))).toBeNull();
  });
  it('names the subject from the extension, else the description', () => {
    expect(nhlSubject(mk({ extensions: { entity_name: 'Andrei Svechnikov' } }))).toBe('Andrei Svechnikov');
    expect(nhlSubject(mk({ yes_description: 'Full Game: Sam Reinhart: 1+ assists' }))).toBe('Sam Reinhart');
  });
  it('links contracts by player id, or by name when the live feed leaves player_id empty', () => {
    const ms = [
      mk({ market_id: 'a', player_id: 'prt_1', yes_description: 'Someone Else: 1+ goals' }),
      mk({ market_id: 'b', player_id: null, extensions: { entity_name: 'Andrei Svechnikov' } }),
      mk({ market_id: 'c', player_id: null, yes_description: 'Andrei Svechnikov: 2+ points', market_family: 'player_points' }),
      mk({ market_id: 'd', player_id: 'prt_2', yes_description: 'Andrei Svechnikov: 1+ goals' }),
      mk({ market_id: 'e', player_id: null, yes_description: 'Andrei Svechnikov wins', market_family: 'game_winner' }),
    ];
    expect(nhlPlayerMarkets(ms, 'prt_1', 'Andrei Svechnikov').map((m) => m.market_id)).toEqual(['a', 'b', 'c']);
  });
  it('dates seasons from the autumn and from the NHL game id', () => {
    expect(nhlSeasonOf('2026-10-11T23:00:00Z')).toBe(2026);
    expect(nhlSeasonOf('2027-03-01T00:00:00Z')).toBe(2026);
    expect(nhlSeasonLabel(2026)).toBe('2026-27');
    expect(rowSeason({ game_id: '2026020061' })).toBe(2026);
  });
  it('measures a real skater against today’s count, before kickoff only', () => {
    const p = fx('nhl/app/latest/explorer/players/prt_9e5d52ad51ba0c6a2f60.json');
    const rows = readBoxLog(p.extensions.game_log)!;
    const kick = p.games[0].start_time_utc as string;
    const pre = nhlPregame(rows, kick);
    expect(pre.length).toBeGreaterThan(10);
    const cut = new Date(kick).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    expect(pre.every((r) => String(r.date) < cut)).toBe(true);
    const h = nhlContractHistory(mk({ market_family: 'player_goals', threshold: 0.5 }), pre, nhlSeasonOf(kick))!;
    const goals = pre.map((r) => r.g as number);
    expect(h.last10.n).toBe(10);
    expect(h.last10.over).toBe(goals.slice(-10).filter((g) => g >= 1).length);
    expect(h.last5.over).toBe(goals.slice(-5).filter((g) => g >= 1).length);
    // this season's games only
    const cur = pre.filter((r) => rowSeason(r) === nhlSeasonOf(kick));
    expect(h.season?.n ?? 0).toBe(cur.length);
  });
  it('measures nothing the log cannot settle', () => {
    expect(nhlContractHistory(mk({ market_family: 'first_goal' }), [{ g: 1, date: '2026-01-01' }], 2025)).toBeNull();
    expect(nhlContractHistory(mk({ market_family: 'player_goals' }), [], 2025)).toBeNull();
  });
  it('drops goalie appearances with no ice time', () => {
    expect(nhlPregame([{ date: '2026-01-01', toi_s: 0 }, { date: '2026-01-02', toi_s: 3600 }, { date: '2026-01-03', toi_s: null }], null)).toHaveLength(2);
  });
});

describe('NBA game log and posted lines', () => {
  const p = fx('nba/app/latest/explorer/players/prt_9a64cfe911b69f694ade.json');
  const rows = readBoxLog(p.extensions.game_log)!;
  it('averages regular-season games he played', () => {
    const season = nbaLatestSeason(rows)!;
    expect(season).toBe('2025-26');
    const a = nbaSeasonAverages(rows, season);
    const games = rows.filter((r) => r.season === season && r.season_type === 'regular' && r.played === true);
    expect(a.games).toBe(games.length);
    expect(a.avg.pts).toBeCloseTo(games.reduce((s, r) => s + (r.pts as number), 0) / games.length, 9);
    expect(nbaSeasonAverages([{ season: 'x', season_type: 'regular', played: false, pts: 0 }], 'x')).toMatchObject({ games: 0, avg: { pts: null } });
  });
  it('reads posted lines newest first and counts settled overs per stat', () => {
    const lines = readPropLog(p.extensions.prop_log);
    expect(lines.length).toBe(p.extensions.prop_log.rows.length);
    expect(lines[0].tip >= lines[lines.length - 1].tip).toBe(true);
    const rec = postedRecord(lines);
    const pts = rec.find((x) => x.stat === 'pts')!;
    const raw = (p.extensions.prop_log.rows as unknown[][]).filter((r) => r[2] === 'pts');
    expect(pts.n).toBe(raw.length);
    expect(pts.over).toBe(raw.filter((r) => r[7] === 1).length);
    expect(pts.over + pts.under).toBe(pts.n);
  });
  it('the published outcome agrees with his box score against the posted line', () => {
    const byEv = new Map(rows.map((r) => [r.event_id, r]));
    for (const l of readPropLog(p.extensions.prop_log)) {
      const g = byEv.get(l.eventId);
      if (!g || l.outcome == null) continue;
      expect((g[l.stat] as number) > l.line ? 1 : 0).toBe(l.outcome);
    }
  });
  it('skips unsettled lines and returns nothing for an absent log', () => {
    expect(postedRecord([{ tip: 'a', eventId: 'e', stat: 'pts', line: 20.5, mid: 0.5, ask: 0.51, outcome: null }])).toEqual([]);
    expect(readPropLog(undefined)).toEqual([]);
  });
});
