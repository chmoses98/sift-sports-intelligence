// Game scripts on the real NE @ BUF publication: the four scripts are exactly the simulator's five
// final-margin buckets regrouped (shares sum to 1), named from the favourite, and script fit is exact
// for margin-settled markets and unknown (null) for everything else.
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc, Market } from '../src/contract/types';
import { gameScripts, rangeFit, scriptFit, sharePct } from '../src/lib/scripts';
import { readSnapshot } from './helpers';

const r = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
const detail = readSnapshot<{ markets: Market[] }>('event_detail/evt_0cb333291f580a201a70.json');
const HOME = 'prt_16bee2e0460c651b4bca'; // BUF
const AWAY = 'prt_3d9358b1e2ac7256767d'; // NE
const market = (t: string) => detail.markets.find((m) => m.kalshi_ticker === t)!;

describe('game scripts', () => {
  const set = gameScripts(r)!;

  const byId = (id: string) => set.scripts.find((s) => s.id === id)!;

  it('regroups the simulation buckets, from the favourite (BUF, home), in plain words', () => {
    expect(set.fav).toBe('home');
    expect(byId('fav-big').name).toBe('Bills Win Big');
    expect(byId('fav').name).toBe('Bills Win Comfortably');
    expect(byId('close').name).toBe('Close Game Either Way');
    expect(byId('dog').name).toBe('Patriots Win Comfortably');
    // The canonical model bucket is kept beside the display title, unchanged by wording.
    expect(set.scripts.map((s) => [s.id, s.canonical])).toEqual(expect.arrayContaining([['fav-big', 'BUF by 14+'], ['fav', 'BUF by 7–13'], ['close', 'Within 6 either way'], ['dog', 'NE by 7+']]));
    expect(set.scripts.every((s) => !/\b(Fav|Dog)\b|\d+\+/.test(s.name))).toBe(true);
    expect(set.scripts.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 3);
    expect(byId('dog').home).toEqual({ lo: null, hi: -7 });
  });

  it('never uses insider wording in a title, and tells the story only from the conditional pass rates', () => {
    const insider = /going away|controls|game script|positive|negative|track meet|slugfest|from behind|gets away|one-score battle|environment|leverage/i;
    for (const s of set.scripts) {
      expect(s.name).not.toMatch(insider);
      expect(s.story.startsWith(s.summary)).toBe(true);
      expect(s.story).not.toMatch(insider);
    }
    expect(byId('close').story).toBe(byId('close').summary);
    // A clause appears only when a team's simulated pass rate in that script moves 3+ points from its average.
    for (const s of set.scripts.filter((x) => x.leader)) {
      const trail = s.leader === 'home' ? 'away' : 'home';
      const shift = (s.volume[trail].passRate ?? 0) - (set.overall[trail].passRate ?? 0);
      expect(/throw/.test(s.story)).toBe(shift >= 0.03);
    }
  });

  it('always lists scripts from most to least likely (colour identity stays with the script)', () => {
    expect(set.scripts.map((s) => s.id)).toEqual(['close', 'fav-big', 'fav', 'dog']);
    expect(set.scripts.map((s) => sharePct(s.share))).toEqual(['36%', '26%', '24%', '13%']);
    for (let i = 1; i < set.scripts.length; i++) expect(set.scripts[i - 1].share).toBeGreaterThanOrEqual(set.scripts[i].share);
    expect(byId('close').index).toBe(3);
    // Every game on the slate, not just this one.
    const board = readSnapshot<{ items: { event_id: string; status: string }[] }>('board.json');
    for (const i of board.items.filter((x) => x.status === 'SCHEDULED')) {
      const s = gameScripts(readSnapshot<EventResearchDoc>(`explorer/events/${i.event_id}.json`));
      if (!s) continue;
      for (let k = 1; k < s.scripts.length; k++) expect(s.scripts[k - 1].share).toBeGreaterThanOrEqual(s.scripts[k].share);
    }
  });

  it('carries the conditional team volume (BUF runs more when it pulls away)', () => {
    const big = byId('fav-big');
    const dog = byId('dog');
    expect(big.volume.home.rushAtt!).toBeGreaterThan(set.overall.home.rushAtt!);
    expect(dog.volume.home.passRate!).toBeGreaterThan(set.overall.home.passRate!);
    // NE's own trail14+ bucket is BUF's lead14+.
    expect(big.volume.away.passRate).toBeCloseTo(0.6982, 4);
  });

  it('fits margin markets exactly', () => {
    // Fits follow the (most-likely-first) script order: close, fav-big, fav, dog.
    expect(scriptFit(market('KXNFLGAME-26OCT04NEBUF-BUF'), set, HOME, AWAY)!.fits).toEqual(['part', 'yes', 'yes', 'no']);
    const buf65 = scriptFit(market('KXNFLSPREAD-26OCT04NEBUF-BUF7'), set, HOME, AWAY)!; // BUF by > 6.5
    expect(buf65.fits).toEqual(['no', 'yes', 'yes', 'no']);
    expect(sharePct(buf65.coverage)).toBe('50%');
    const ne95 = scriptFit(market('KXNFLSPREAD-26OCT04NEBUF-NE10'), set, HOME, AWAY)!; // NE by > 9.5
    expect(ne95.fits).toEqual(['no', 'no', 'no', 'part']);
    expect(ne95.coverage).toBe(0);
    expect(scriptFit(market('KXNFLSPREAD-26OCT04NEBUF-BUF14'), set, HOME, AWAY)!.fits).toEqual(['no', 'yes', 'no', 'no']); // > 13.5
  });

  it('never guesses a fit for markets that do not settle on the final margin', () => {
    expect(scriptFit(market('KXNFLTOTAL-26OCT04NEBUF-50'), set, HOME, AWAY)).toBeNull();
    expect(scriptFit(market('KXNFLTEAMTOTAL-26OCT04NEBUF-BUF28'), set, HOME, AWAY)).toBeNull();
    expect(scriptFit(market('KXNFL1HSPREAD-26OCT04NEBUF-BUF7'), set, HOME, AWAY)).toBeNull();
  });

  it('range fit boundaries', () => {
    expect(rangeFit({ lo: 7, hi: 13 }, { op: '>', v: 6.5 })).toBe('yes');
    expect(rangeFit({ lo: 7, hi: 13 }, { op: '>', v: 13.5 })).toBe('no');
    expect(rangeFit({ lo: -6, hi: 6 }, { op: '>', v: 0 })).toBe('part');
    expect(rangeFit({ lo: null, hi: -14 }, { op: '<', v: -9.5 })).toBe('yes');
    expect(rangeFit({ lo: -6, hi: 6 }, { op: '<', v: -9.5 })).toBe('no');
  });
});
