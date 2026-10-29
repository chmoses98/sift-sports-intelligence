import { describe, expect, it } from 'vitest';
import { pickFeatured, stripGames } from '../../src/v3/model/feature';
import { isFavorite, switcherGames } from '../../src/v3/model/switcher';
import type { V3Game, V3Team } from '../../src/v3/model/types';

const team = (id: string, logo = '/l.png'): V3Team => ({ id, slug: 'cfb', sport: 'CFB', name: id, nick: id, abbr: id, logo, colors: ['#000', '#fff'] });
const game = (a: string, h: string, o: Partial<V3Game> = {}): V3Game => ({ key: `cfb:${a}_${h}`, slug: 'cfb', sport: 'CFB', eventId: `${a}_${h}`, league: 'NCAAF', phase: 'pregame', startMs: Date.parse('2026-10-25T20:00:00Z'), away: team(a), home: team(h), score: null, lines: [], signals: 0, provenance: 'publication', ...o });
const now = Date.parse('2026-10-25T15:00:00Z');
const none = { teams: [], games: [] };

describe('featured game (Home)', () => {
  it('prefers a followed live game with a score, then any scored live game', () => {
    const live = game('A', 'B', { phase: 'live', score: { away: 1, home: 0, clock: 'Q1', source: 'score-feed', asOf: null } });
    const fol = game('C', 'D', { phase: 'live', score: { away: 3, home: 3, clock: 'Q2', source: 'score-feed', asOf: null } });
    expect(pickFeatured([live, fol], { teams: ['cfb:C'], games: [] }, now)!.key).toBe(fol.key);
    expect(pickFeatured([live, fol], none, now)!.key).toBeDefined();
  });
  it('a game in play with no score never beats a coming kickoff, and a game without logos goes last', () => {
    const noScore = game('A', 'B', { phase: 'live' });
    const soon = game('C', 'D', { startMs: now + 3600_000 });
    const noLogo = game('E', 'F', { startMs: now + 1800_000, away: team('E', ''), home: { ...team('F'), logo: null } });
    expect(pickFeatured([noScore, soon, noLogo], none, now)!.key).toBe(soon.key);
  });
  it('never repeats the featured game in the strip', () => {
    const g = [game('A', 'B'), game('C', 'D'), game('E', 'F')];
    const f = pickFeatured(g, none, now)!;
    expect(stripGames(g, none, f).some((x) => x.key === f.key)).toBe(false);
  });
});

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
