// @vitest-environment node
// The NFL Game Script view-model (src/v3/model/nflScript.ts) over REAL published NFL documents: DAL at PHI (fixtures/real, `game` family; the publication holds the
// close-game split back, so the pooled one-score script stands) and NE at BUF (tests/fixtures snapshot; the winner split is attached with the identities the upstream
// test pins, because no captured publication carries a SHOW gate yet). SIFT 2.0's script logic is reused, so these tests pin what v3 adds: the card list, the
// volume table against all games, the pass/run lean, the key players' team-volume lean, the margin map, and the priced rows the survivors and expressions read.
import { beforeAll, describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc, Market } from '../../src/contract/types';
import { multiScriptSurvivors, scriptExpressions } from '../../src/lib/scriptExpressions';
import { gameScripts } from '../../src/lib/scripts';
import { attemptLean, deltaOf, keyPlayers, leanSentences, leanWord, marginBand, marginPos, marginSegs, marginWords, pickScript, playerLeans, rangeText, readNflScript, readScripts, scriptCards, scriptRows, volumeRows } from '../../src/v3/model/nflScript';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';
import { readSnapshot } from '../helpers';

const B = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest';
const EVT = 'evt_cd335cc6d5f5b8d8f7b3';
let research: EventResearchDoc, detail: EventDetailDoc;

beforeAll(async () => {
  const fam = openBundle().family('game');
  const read = async (p: string) => JSON.parse(Buffer.from((await fam.get(`${B}/${p}`))!.body).toString('utf8'));
  research = await read(`explorer/events/${EVT}.json`);
  detail = await read(`event_detail/${EVT}.json`);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => structuredClone(x);

describe('the script cards (DAL at PHI, pooled one-score script)', () => {
  it('lists the scripts most likely first, each with a whole-percent simulation share, and marks only the first', () => {
    const set = readScripts(research)!;
    expect(set).not.toBeNull();
    const cards = scriptCards(set);
    expect(cards.length).toBe(4);
    expect(cards.map((c) => c.share)).toEqual([...cards.map((c) => c.share)].sort((a, b) => b - a));
    expect(cards.filter((c) => c.mostLikely).map((c) => c.id)).toEqual([cards[0].id]);
    for (const c of cards) {
      expect(c.pct).toMatch(/^\d+%$/);
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.line).toMatch(/\.$/);
      expect([1, 2, 3, 4, 5]).toContain(c.tone);
    }
    // the shares are the whole simulation (one pooled one-score script, so no tie is split out)
    expect(cards.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 2);
    expect(set.tie).toBeNull();
  });

  it('holds the close-game split back unless the publication authorises it: the gate on this publication is SUPPRESS', () => {
    const set = readScripts(research)!;
    expect(set.closeSplit).toEqual({ shown: false, gate: 'SUPPRESS' });
    expect(set.scripts.map((s) => s.id)).toContain('close');
    expect(set.scripts.map((s) => s.id)).not.toContain('fav-close');
  });

  it('returns null, never an estimate, when the research carries no simulation', () => {
    const r = clone(research) as any;
    delete r.extensions.game_script_inputs;
    expect(readScripts(r)).toBeNull();
    expect(readNflScript(r, detail.markets)).toBeNull();
    expect(readScripts(null)).toBeNull();
    expect(readScripts(undefined)).toBeNull();
  });

  it('picks the address’s script, else the most likely; an unknown id falls back to the most likely', () => {
    const set = readScripts(research)!;
    expect(pickScript(set, null).id).toBe(set.scripts[0].id);
    expect(pickScript(set, 'nope').id).toBe(set.scripts[0].id);
    expect(pickScript(set, 'dog').id).toBe('dog');
  });
});

describe('how a script plays', () => {
  it('prints each team’s simulated volume in the script against all simulated games, with the move in percent (pass rate in points)', () => {
    const set = readScripts(research)!;
    for (const s of set.scripts) {
      const rows = volumeRows(s, set);
      expect(rows.map((r) => r.label)).toEqual(['Offensive plays', 'Pass attempts', 'Rush attempts', 'Pass rate']);
      for (const side of ['away', 'home'] as const) {
        const v = s.volume[side];
        const plays = rows[0].cells[side];
        expect(plays.value).toBe(v.plays != null ? v.plays.toFixed(1) : 'unavailable');
        const rate = rows[3].cells[side];
        expect(rate.value).toBe(v.passRate != null ? `${Math.round(v.passRate * 100)}%` : 'unavailable');
        if (rate.delta) expect(rate.delta.text).toMatch(/pts$/);
        if (plays.delta) expect(plays.delta.text).toMatch(/%$/);
      }
    }
  });

  it('words the move from the all-games average, and says nothing when a number is not published', () => {
    expect(deltaOf(36, 30)).toEqual({ text: '+20%', dir: 'up' });
    expect(deltaOf(27, 30)).toEqual({ text: '−10%', dir: 'down' });
    expect(deltaOf(30.1, 30)).toEqual({ text: '±0%', dir: 'flat' });
    expect(deltaOf(0.62, 0.58, true)).toEqual({ text: '+4 pts', dir: 'up' });
    expect(deltaOf(null, 30)).toBeNull();
    expect(deltaOf(30, null)).toBeNull();
    expect(deltaOf(30, 0)).toBeNull();
  });

  it('states the pass/run lean as words, "not published" when the publication has no number, and "about the same" inside 3%', () => {
    expect(leanWord(null)).toBe('not published');
    expect(leanWord(0.02)).toBe('about the same');
    expect(leanWord(0.12)).toBe('more (+12%)');
    expect(leanWord(-0.07)).toBe('less (−7%)');
    const set = readScripts(research)!;
    const s = set.scripts[0];
    const [away, home] = leanSentences(s, set);
    expect(away).toContain(set.names.away);
    expect(home).toContain(set.names.home);
    const l = attemptLean(s, set, 'away', 'passAtt');
    expect(away).toContain(`pass ${leanWord(l)}`);
  });

  it('describes the margin range in words for every script', () => {
    const set = readScripts(research)!;
    const fav = set.names[set.fav];
    expect(rangeText(set.scripts.find((s) => s.id === 'fav-big')!, set)).toBe(`The ${fav} win by 14 or more points.`);
    expect(rangeText(set.scripts.find((s) => s.id === 'close')!, set)).toMatch(/6 points or fewer either way/);
  });
});

describe('key players: team volume in the script, never a player projection', () => {
  it('picks each team’s lead passer, runner and receiver from the publication’s own distributions', () => {
    const set = readScripts(research)!;
    const ps = keyPlayers(research, set);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.name).toBeTruthy();
      expect(p.pid).toMatch(/^prt_/);
      expect(['passAtt', 'rushAtt']).toContain(p.vol);
      expect(p.volLabel).toMatch(/^Team (pass|rush) att$/);
      expect(research.players.some((x) => x.participant_id === p.pid)).toBe(true);
    }
    expect(ps.filter((p) => p.role === 'QB').length).toBeGreaterThan(0);
  });

  it('shows his team’s attempts in the script against all games, as the same number the volume table prints', () => {
    const set = readScripts(research)!;
    const s = set.scripts[0];
    const table = volumeRows(s, set);
    for (const l of playerLeans(research, set, s)) {
      const row = table.find((r) => r.key === l.p.vol)!;
      expect(l.value).toBe(row.cells[l.p.side].value);
    }
  });
});

describe('where it ends', () => {
  it('places each script on the HOME final margin, marks the selected one, and reads the simulation’s band from the document', () => {
    const set = readScripts(research)!;
    const segs = marginSegs(set, 'dog');
    expect(segs.filter((x) => x.on).map((x) => x.id)).toEqual(['dog']);
    expect(segs.map((x) => x.label)).toEqual(set.scripts.map((s) => s.canonical));
    const band = marginBand(research);
    expect(band).not.toBeNull();
    expect(band!.r50![0]).toBeLessThan(band!.r50![1]);
    expect(band!.r50![0]).toBeGreaterThanOrEqual(band!.r90![0]);
    const r = clone(research) as any;
    delete r.extensions.game_script_inputs.game_environment.home_margin;
    expect(marginBand(r)).toBeNull();
  });

  it('positions a margin on the axis, clamped, and words the ranges from either team’s side', () => {
    expect(marginPos(0, 28)).toBe(50);
    expect(marginPos(-28, 28)).toBe(0);
    expect(marginPos(99, 28)).toBe(100);
    expect(marginWords(14, null, 'PHI', 'DAL')).toBe('PHI by 14 or more');
    expect(marginWords(7, 13, 'PHI', 'DAL')).toBe('PHI by 7 to 13');
    expect(marginWords(null, -14, 'PHI', 'DAL')).toBe('DAL by 14 or more');
    expect(marginWords(-13, -7, 'PHI', 'DAL')).toBe('DAL by 7 to 13');
    expect(marginWords(-6, 6, 'PHI', 'DAL')).toBe('within 6 either way');
  });
});

describe('priced rows, survivors and ways to bet (the SIFT 2.0 logic, over this game’s published contracts)', () => {
  it('builds one row per published market, labelled in sports language, each with its fit against every script', () => {
    const set = readScripts(research)!;
    const rows = scriptRows(research, set, detail.markets);
    expect(rows.length).toBe(detail.markets.length);
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
    const ml = rows.find((r) => r.m.market_family === 'game_winner' && r.fit)!;
    expect(ml.label).toMatch(/ to win$/);
    expect(ml.fit!.fits.length).toBe(set.scripts.length);
    // player props settle on a player stat, never on the margin: no fit
    expect(rows.filter((r) => r.m.market_family === 'player_stat').every((r) => r.fit == null)).toBe(true);
  });

  it('survivors win in at least two scripts, the exact way (a margin contract), and are sorted by how many', () => {
    const nfl = readNflScript(research, detail.markets)!;
    const list = multiScriptSurvivors(nfl.rows, nfl.set, 2, 6);
    expect(list.length).toBeGreaterThan(0);
    for (const x of list) {
      expect(x.full).toBeGreaterThanOrEqual(2);
      expect(['game_winner', 'spread']).toContain(x.row.m.market_family);
      expect(x.fits.filter((f) => f === 'yes').length).toBe(x.full);
    }
    for (let i = 1; i < list.length; i++) expect(list[i - 1].full).toBeGreaterThanOrEqual(list[i].full);
  });

  it('lists ways to bet each script with the side that pays, and says what is not linked (totals are never linked)', () => {
    const nfl = readNflScript(research, detail.markets)!;
    for (const s of nfl.set.scripts) {
      const x = scriptExpressions(research, nfl.rows, nfl.set, s.id, nfl.set.names);
      for (const i of x.items) {
        expect(['YES', 'NO']).toContain(i.side);
        expect(['moneyline', 'spread', 'prop']).toContain(i.kind);
        expect(i.row.m.market_family === 'total' || i.row.m.market_family === 'team_total').toBe(false);
      }
      expect(x.missing.join(' ')).toMatch(/Totals and team totals/);
    }
  });

  it('reads rows from no contracts without failing (the list is still loading): the scripts stand, the bets are empty', () => {
    const nfl = readNflScript(research, [])!;
    expect(nfl.rows).toEqual([]);
    expect(multiScriptSurvivors(nfl.rows, nfl.set)).toEqual([]);
  });
});

describe('the close game split by winner (NE at BUF, with the publication’s explicit SHOW gate)', () => {
  const base = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
  const bd = readSnapshot<{ markets: Market[] }>('event_detail/evt_0cb333291f580a201a70.json');
  const BUF = { 'win1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.5871, pass_att_mean: 32.4, rush_att_mean: 29.6, plays_mean: 64.4 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6281, pass_att_mean: 34.4, rush_att_mean: 27.0, plays_mean: 64.2 } };
  const NE = { 'win1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6012, pass_att_mean: 31.2, rush_att_mean: 28.4, plays_mean: 62.8 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.6355, pass_att_mean: 32.6, rush_att_mean: 26.9, plays_mean: 62.5 } };
  const withGate = (status: string, displayable: boolean) => {
    const r = clone(base) as any;
    r.extensions.game_script_inputs.team_volume.BUF.by_close_result = BUF;
    r.extensions.game_script_inputs.team_volume.NE.by_close_result = NE;
    r.extensions.game_script_inputs.calibration_gates = { version: 'calibration-gates-1.0.0', close_win_split: { status, displayable } };
    return r as EventResearchDoc;
  };

  it('shows five scripts and the tie share on SHOW, and the pooled four on SUPPRESS', () => {
    const shown = readScripts(withGate('SHOW', true))!;
    expect(scriptCards(shown).length).toBe(5);
    expect(shown.tie).toBe(0.0024);
    expect(scriptCards(shown).reduce((a, c) => a + c.share, 0) + shown.tie!).toBeCloseTo(1, 3);
    expect(scriptCards(shown).map((c) => c.tone).sort()).toEqual([1, 2, 3, 4, 5]);
    const held = readScripts(withGate('SUPPRESS', false))!;
    expect(scriptCards(held).length).toBe(4);
    expect(held.tie).toBeNull();
  });

  it('keeps the close-script volume table and ways to bet working for the winner-specific scripts', () => {
    const r = withGate('SHOW', true);
    const nfl = readNflScript(r, bd.markets)!;
    expect(gameScripts(r)!.scripts.length).toBe(5);
    const close = nfl.set.scripts.find((s) => s.id === 'dog-close')!;
    expect(volumeRows(close, nfl.set)[0].cells.home.value).toBe(close.volume.home.plays!.toFixed(1));
    const x = scriptExpressions(r, nfl.rows, nfl.set, 'dog-close', nfl.set.names);
    expect(x.items.some((i) => i.kind === 'moneyline')).toBe(true);
  });
});
