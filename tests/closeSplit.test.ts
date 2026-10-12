// WHO WINS THE CLOSE GAME (sim-script-1.1.0 `by_close_result`). The pooled one-score script ("Patriots Keep It Close",
// 36% on NE @ BUF) holds BOTH teams' one-score wins. When the publication splits those rows by winner, Sift shows two
// winner-specific scripts, keeps every bit of probability mass (scripts + ties = the whole simulation), and re-derives
// every margin fit from the exact integer ranges. Without a valid split, nothing is guessed: the pooled script stays.
//
// The publication on disk predates 1.1.0, so the split is attached here with shares that satisfy the same identities
// the upstream test pins: win1-6 + tie + lose1-6 = within6, one team's close win is the other's close loss, and
// lead7+ + win1-6 + tie/2 = the published p_home_win (0.7293 − 0.2577 − 0.2445 = 0.2271 = 0.2259 + 0.0024/2).
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc, Market } from '../src/contract/types';
import { gameScripts, oneScoreShare, scriptFit, sharePct } from '../src/lib/scripts';
import { marketLabel, priceRow } from '../src/lib/gamedata';
import { multiScriptSurvivors, scriptExpressions, survivalWords } from '../src/lib/scriptExpressions';
import { readSnapshot } from './helpers';

const base = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
const detail = readSnapshot<{ markets: Market[] }>('event_detail/evt_0cb333291f580a201a70.json');
const HOME = 'prt_16bee2e0460c651b4bca'; // BUF
const AWAY = 'prt_3d9358b1e2ac7256767d'; // NE
const market = (t: string) => detail.markets.find((m) => m.kalshi_ticker === t)!;

const BUF = { 'win1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.5871, pass_att_mean: 32.4, rush_att_mean: 29.6, plays_mean: 64.4 }, tie: { share_of_rows: 0.0024, n_rows: 48, note: 'too few rows' }, 'lose1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6281, pass_att_mean: 34.4, rush_att_mean: 27.0, plays_mean: 64.2 } };
const NE = { 'win1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6012, pass_att_mean: 31.2, rush_att_mean: 28.4, plays_mean: 62.8 }, tie: { share_of_rows: 0.0024, n_rows: 48, note: 'too few rows' }, 'lose1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.6355, pass_att_mean: 32.6, rush_att_mean: 26.9, plays_mean: 62.5 } };

/* eslint-disable @typescript-eslint/no-explicit-any */
function withSplit(buf: unknown, ne: unknown): EventResearchDoc {
  const r = structuredClone(base) as any;
  const tv = r.extensions.game_script_inputs.team_volume;
  if (buf) tv.BUF.by_close_result = buf;
  if (ne) tv.NE.by_close_result = ne;
  return r as EventResearchDoc;
}

describe('the close game, split by winner', () => {
  const pooled = gameScripts(base)!;
  const set = gameScripts(withSplit(BUF, NE))!;
  const byId = (id: string) => set.scripts.find((s) => s.id === id)!;

  it('replaces the pooled one-score script with one script per winner, each naming its team', () => {
    expect(pooled.scripts.map((s) => s.id)).toContain('close');
    expect(set.scripts.map((s) => s.id).sort()).toEqual(['dog', 'dog-close', 'fav', 'fav-big', 'fav-close']);
    expect(byId('fav-close').name).toBe('Bills Win a Close One');
    expect(byId('dog-close').name).toBe('Patriots Win a Close One');
    expect(byId('fav-close').canonical).toBe('BUF by 1–6');
    expect(byId('dog-close').canonical).toBe('NE by 1–6');
    expect(byId('fav-close').line).toBe('Bills by 1 to 6.');
    expect(byId('dog-close').summary).toBe('Patriots win by 1 to 6.');
    expect(byId('fav-close').leader).toBe('home');
    expect(byId('dog-close').leader).toBe('away');
    expect(byId('fav-close').index).toBe(3);
    expect(byId('dog-close').index).toBe(5);
  });

  it('keeps every bit of probability mass: the five scripts plus ties are the whole simulation, the one-score share is unchanged', () => {
    expect(set.scripts.reduce((a, s) => a + s.share, 0) + set.tie!).toBeCloseTo(1, 3);
    expect(oneScoreShare(set)).toBeCloseTo(oneScoreShare(pooled), 4);
    expect(oneScoreShare(pooled)).toBeCloseTo(0.3641, 4);
    expect(pooled.tie).toBeNull();
    expect(set.tie).toBe(0.0024);
    // The other three scripts are the same buckets as before.
    for (const id of ['fav-big', 'fav', 'dog']) expect(byId(id).share).toBe(pooled.scripts.find((s) => s.id === id)!.share);
    expect(sharePct(byId('fav-close').share)).toBe('23%');
    expect(sharePct(byId('dog-close').share)).toBe('14%');
    // Most likely first: BUF by 14+ (26%) leads; the pooled 36% script no longer outranks it.
    expect(set.scripts[0].id).toBe('fav-big');
  });

  it('places each close script on its exact integer margin range, and re-derives every fit from it', () => {
    expect(byId('fav-close').home).toEqual({ lo: 1, hi: 6 });
    expect(byId('dog-close').home).toEqual({ lo: -6, hi: -1 });
    const fitOf = (t: string) => {
      const f = scriptFit(market(t), set, HOME, AWAY)!;
      return Object.fromEntries(set.scripts.map((s, i) => [s.id, f.fits[i]]));
    };
    // The moneylines: each winner's moneyline always wins in its own close script and never in the other's.
    expect(fitOf('KXNFLGAME-26OCT04NEBUF-BUF')).toEqual({ 'fav-big': 'yes', fav: 'yes', 'fav-close': 'yes', 'dog-close': 'no', dog: 'no' });
    expect(fitOf('KXNFLGAME-26OCT04NEBUF-NE')).toEqual({ 'fav-big': 'no', fav: 'no', 'fav-close': 'no', 'dog-close': 'yes', dog: 'yes' });
    // BUF by more than 6.5 never wins a close game; BUF by more than 2.5 wins part of BUF's close wins.
    expect(fitOf('KXNFLSPREAD-26OCT04NEBUF-BUF7')['fav-close']).toBe('no');
    expect(fitOf('KXNFLSPREAD-26OCT04NEBUF-BUF3')['fav-close']).toBe('part');
    expect(fitOf('KXNFLSPREAD-26OCT04NEBUF-BUF3')['dog-close']).toBe('no');
    // NE by more than 1.5: part of NE's close wins, all of NE by 7+.
    expect(fitOf('KXNFLSPREAD-26OCT04NEBUF-NE2')).toMatchObject({ 'dog-close': 'part', dog: 'yes', 'fav-close': 'no' });
    // Under the pooled script the BUF moneyline was only "part" in the one-score game; now it is exact.
    const pf = scriptFit(market('KXNFLGAME-26OCT04NEBUF-BUF'), pooled, HOME, AWAY)!;
    expect(pf.fits[pooled.scripts.findIndex((s) => s.id === 'close')]).toBe('part');
    expect(scriptFit(market('KXNFLGAME-26OCT04NEBUF-BUF'), set, HOME, AWAY)!.coverage).toBeCloseTo(0.2577 + 0.2445 + 0.2259, 4);
  });

  it('lists the winner’s moneyline as a way to bet each close script (no more "either team can win it")', () => {
    const abbr = (pid: string | null) => (pid === HOME ? 'BUF' : pid === AWAY ? 'NE' : null);
    const doc = withSplit(BUF, NE);
    const rows = detail.markets.map((m) => priceRow(m, new Map(), marketLabel(m, abbr, () => null), scriptFit(m, set, HOME, AWAY)));
    let moneylines = 0;
    for (const id of ['fav-close', 'dog-close'] as const) {
      const x = scriptExpressions(doc, rows, set, id, set.names);
      expect(x.missing.join(' ')).not.toMatch(/either team can win/);
      for (const i of x.items.filter((i) => i.kind !== 'prop')) {
        expect(i.row.m.participant_id).toBe(id === 'fav-close' ? HOME : AWAY);
        if (i.kind === 'moneyline') moneylines++;
      }
    }
    expect(moneylines).toBeGreaterThan(0);
    // Survivors are counted over five scripts now.
    const surv = multiScriptSurvivors(rows, set);
    expect(surv.length).toBeGreaterThan(0);
    expect(survivalWords(surv[0])).toMatch(/^Survives [2-5] of 5 scripts · \d+% of simulated games$/);
  });

  it('takes conditional volume from the same rows on both sides (the winner’s win1-6 is the loser’s lose1-6)', () => {
    expect(byId('fav-close').volume.home.passRate).toBe(0.5871);
    expect(byId('fav-close').volume.away.passRate).toBe(0.6355);
    expect(byId('dog-close').volume.home.passRate).toBe(0.6281);
    expect(byId('dog-close').volume.away.passRate).toBe(0.6012);
  });

  it('never guesses a split: missing, one-sided, inconsistent or malformed splits keep the pooled script', () => {
    const ids = (r: EventResearchDoc) => gameScripts(r)!.scripts.map((s) => s.id);
    expect(ids(withSplit(BUF, null))).toContain('close');
    expect(ids(withSplit(null, NE))).toContain('close');
    // does not add up to within6
    expect(ids(withSplit({ ...BUF, 'win1-6': { ...BUF['win1-6'], share_of_rows: 0.25 } }, NE))).toContain('close');
    // the two teams disagree about who won
    expect(ids(withSplit(BUF, { ...NE, 'win1-6': { ...NE['win1-6'], share_of_rows: 0.15 }, 'lose1-6': { ...NE['lose1-6'], share_of_rows: 0.2117 } }))).toContain('close');
    // a share is missing
    expect(ids(withSplit({ 'win1-6': BUF['win1-6'], 'lose1-6': BUF['lose1-6'] }, NE))).toContain('close');
    expect(gameScripts(withSplit(BUF, null))!.tie).toBeNull();
  });
});
