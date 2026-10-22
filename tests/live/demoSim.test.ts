import { describe, expect, it } from 'vitest';
import { buildTimeline, fractionAt, hash32, kickoffMs, stateAt } from '../../src/live/scores/demo/sim';
import { LIVE_SPORTS, type LiveSport } from '../../src/live/scores/types';

const teams = { home: 'Home', away: 'Away' };
const seeds = Array.from({ length: 60 }, (_, i) => `evt_${i}`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const totalsFor = (sport: LiveSport) => seeds.map((s) => { const f = buildTimeline(sport, s).final; return f.home + f.away; });

describe('Live Score Demo simulation', () => {
  it('plays the same game on every call (same sport and seed)', () => {
    for (const sport of LIVE_SPORTS) {
      const a = buildTimeline(sport, 'evt_x'); const b = buildTimeline(sport, 'evt_x');
      expect(b).toBe(a);
      expect(stateAt(a, 0.5, teams)).toEqual(stateAt(b, 0.5, teams));
    }
  });

  it('is not started below 0, in play between, and final at 1 with the timeline\'s final score', () => {
    for (const sport of LIVE_SPORTS) {
      const tl = buildTimeline(sport, 'evt_y');
      expect(stateAt(tl, -0.01, teams)).toMatchObject({ phase: 'SCHEDULED', score: null, clock: null });
      const end = stateAt(tl, 1, teams);
      expect(end.phase).toBe('FINAL');
      expect(end.score).toEqual(tl.final);
      expect(stateAt(tl, 7, teams).score).toEqual(tl.final);
    }
  });

  it('never lets a score or a period go backwards, and never ends level where a winner is required', () => {
    for (const sport of LIVE_SPORTS) {
      for (const seed of seeds) {
        const tl = buildTimeline(sport, seed);
        let prev = { home: 0, away: 0 }; let prevPeriod = 0;
        for (let i = 0; i <= 200; i++) {
          const st = stateAt(tl, i / 200, teams);
          expect(st.score!.home).toBeGreaterThanOrEqual(prev.home);
          expect(st.score!.away).toBeGreaterThanOrEqual(prev.away);
          prev = st.score!;
          const p = st.clock?.period ?? prevPeriod;
          expect(p).toBeGreaterThanOrEqual(prevPeriod);
          prevPeriod = p;
        }
        if (sport !== 'SOCCER') expect(tl.final.home).not.toBe(tl.final.away);
      }
    }
  });

  it('gives each sport its own scoring pattern', () => {
    const avg = (s: LiveSport) => mean(totalsFor(s));
    expect(avg('NBA')).toBeGreaterThan(190); expect(avg('NBA')).toBeLessThan(260);
    expect(avg('CBB')).toBeGreaterThan(120); expect(avg('CBB')).toBeLessThan(170);
    expect(avg('NFL')).toBeGreaterThan(30); expect(avg('NFL')).toBeLessThan(65);
    expect(avg('CFB')).toBeGreaterThan(38); expect(avg('CFB')).toBeLessThan(80);
    expect(avg('NHL')).toBeGreaterThan(3.5); expect(avg('NHL')).toBeLessThan(8.5);
    expect(avg('SOCCER')).toBeGreaterThan(1.2); expect(avg('SOCCER')).toBeLessThan(4.2);
    // Football scores arrive in football amounts; hockey and soccer one goal at a time.
    const fb = buildTimeline('NFL', 'evt_1').events.map((e) => e.pts);
    expect(fb.every((p) => [2, 3, 6, 7, 8].includes(p))).toBe(true);
    expect(buildTimeline('NHL', 'evt_1').events.every((e) => e.pts === 1)).toBe(true);
  });

  it('keeps each sport\'s clock in its own terms', () => {
    const at = (sport: LiveSport, f: number) => stateAt(buildTimeline(sport, 'evt_c'), f, teams);
    const nfl = at('NFL', 0.2); expect(nfl.clock).toMatchObject({ direction: 'down', running: true }); expect(nfl.clock?.display).toMatch(/^\d+:\d\d$/);
    const soc = at('SOCCER', 0.3); expect(soc.clock?.display).toMatch(/^\d+'$/); expect(soc.clock?.direction).toBe('up');
    expect(at('MLB', 0.3).clock?.display).toBeNull(); expect(at('MLB', 0.3).clock?.periodLabel).toMatch(/^(Top|Bot) /);
    expect(at('TENNIS', 0.3).clock?.periodLabel).toMatch(/^Set /);
    // Halftime is a break with no running clock.
    const tl = buildTimeline('NFL', 'evt_c');
    const half = tl.starts[2] + 10;
    const st = stateAt(tl, half / tl.total, teams);
    expect(st.phase).toBe('BREAK'); expect(st.clock).toMatchObject({ periodLabel: 'Halftime', running: false, display: null });
  });

  it('reports recent scoring plays newest first, each with the score after it', () => {
    const tl = buildTimeline('NFL', 'evt_p');
    const st = stateAt(tl, 0.9, teams);
    expect(st.plays.length).toBeGreaterThan(0);
    expect(st.plays[0].home).toBe(st.score!.home); expect(st.plays[0].away).toBe(st.score!.away);
    expect(st.plays[0].text).toMatch(/^(Home|Away): /);
  });

  it('spreads kickoffs so a fresh demo shows pregame, live and final games, deterministically', () => {
    const L = 300_000;
    const phases = seeds.map((s) => { const f = fractionAt(1_000_000, kickoffMs(s, 1_000_000, L), L); return f < 0 ? 'pre' : f >= 1 ? 'final' : 'live'; });
    for (const p of ['pre', 'live', 'final']) expect(phases).toContain(p);
    expect(kickoffMs('a', 5, L)).toBe(kickoffMs('a', 5, L));
    expect(hash32('a')).toBe(hash32('a'));
  });
});
