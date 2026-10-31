import { describe, expect, it } from 'vitest';
import { isFavorite, switcherGames } from '../../src/v3/model/switcher';
import type { V3Game, V3Team } from '../../src/v3/model/types';

const team = (id: string, logo = '/l.png'): V3Team => ({ id, slug: 'cfb', sport: 'CFB', name: id, nick: id, abbr: id, logo, colors: ['#000', '#fff'] });
const game = (a: string, h: string, o: Partial<V3Game> = {}): V3Game => ({ key: `cfb:${a}_${h}`, slug: 'cfb', sport: 'CFB', eventId: `${a}_${h}`, league: 'NCAAF', phase: 'pregame', startMs: Date.parse('2026-10-25T20:00:00Z'), away: team(a), home: team(h), score: null, lines: [], signals: 0, provenance: 'publication', ...o });
const none = { teams: [], games: [] };

describe('Game Switcher ordering', () => {
  const all = [game('A', 'B', { phase: 'final' }), game('C', 'D', { phase: 'pregame' }), game('E', 'F', { phase: 'live' }), game('G', 'H', { phase: 'live', startMs: Date.parse('2026-10-25T16:00:00Z') }), game('X', 'Y', { startMs: Date.parse('2026-10-27T20:00:00Z') })];
  it('favourites first, then live, then by kickoff, finals last; only the same sport and day', () => {
    const f = { teams: ['cfb:C'], games: [] };
    const list = switcherGames(all, all[2], f);
    expect(list[0].key).toBe('cfb:C_D');
    expect(list.map((g) => g.key).slice(1)).toEqual(['cfb:G_H', 'cfb:E_F', 'cfb:A_B']);
    expect(list.some((g) => g.key === 'cfb:X_Y')).toBe(false);
  });
  it('starring a game pins it without the current game changing', () => {
    const f = { teams: [], games: ['cfb:G_H'] };
    expect(isFavorite(all[3], f)).toBe(true);
    const list = switcherGames(all, all[2], f);
    expect(list[0].key).toBe('cfb:G_H');
    expect(list.some((g) => g.key === all[2].key)).toBe(true);
  });
  it('the current game is always present, even alone', () => {
    expect(switcherGames([], all[0], none).map((g) => g.key)).toEqual([all[0].key]);
  });
});
