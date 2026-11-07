import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script
import { auditPlayers } from '../scripts/nba-player-audit.mjs';

const NOW = Date.parse('2026-11-06T20:00:00Z');
const cols = ['date_et', 'event_id', 'season', 'season_type', 'team', 'opp', 'home', 'played', 'min', 'pts', 'reb', 'ast', 'fg3m'];
const row = (date: string, id: string, o: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = { date_et: date, event_id: id, season: '2026-27', season_type: 'regular', team: 'PHX', opp: 'ORL', home: true, played: true, min: 30, pts: 10, reb: 1, ast: 1, fg3m: 1, ...o };
  return cols.map((c) => base[c]);
};
const doc = (rows: unknown[][], season = '2026-27') => ({ season, entity: { display_name: 'P' }, extensions: { game_log: { columns: cols, rows } } });
const idx = { generated_at: '2026-11-06T19:00:00Z', quality: { data_as_of: '2026-11-06T03:00:00Z' } };

describe('nba player audit', () => {
  it('passes a current, complete publication', () => {
    expect(auditPlayers(idx, [doc([row('2026-11-05', 'a')])], NOW).ok).toBe(true);
  });
  it('fails a stale index', () => {
    const r = auditPlayers({ ...idx, generated_at: '2026-10-31T00:00:00Z', quality: { data_as_of: '2026-10-31T00:00:00Z' } }, [doc([row('2026-11-05', 'a')])], NOW);
    expect(r.ok).toBe(false);
  });
  it('fails last season’s logs and does not count preseason as current', () => {
    expect(auditPlayers(idx, [doc([row('2026-04-30', 'a', { season: '2025-26' })], '2025-26')], NOW).ok).toBe(false);
    expect(auditPlayers(idx, [doc([row('2026-10-10', 'a', { season_type: 'preseason' })])], NOW).ok).toBe(false);
  });
  it('flags missing minutes, opponents, duplicates and future rows', () => {
    const r = auditPlayers(idx, [doc([row('2026-11-05', 'a', { min: null }), row('2026-11-04', 'b', { opp: '' }), row('2026-11-03', 'b'), row('2026-12-30', 'c')])], NOW);
    for (const re of [/minutes/, /opponent/, /duplicate/, /future/]) expect(r.fails.some((f: string) => re.test(f))).toBe(true);
  });
});
