// Owner items 14 and 16 on the real NE @ BUF publication: multi-script survivors are margin contracts that always win in
// two or more scripts, ordered by script count then simulated-game share; each script lists only priced contracts that
// exist, with the link's basis (exact margin fit, or a team-volume lean for props) and the families it cannot link.
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc, Market } from '../src/contract/types';
import { marketLabel, priceRow } from '../src/lib/gamedata';
import { gameScripts, scriptFit } from '../src/lib/scripts';
import { multiScriptSurvivors, scriptExpressions, survivalWords, tradable } from '../src/lib/scriptExpressions';
import { readSnapshot } from './helpers';

const r = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
const detail = readSnapshot<{ markets: Market[] }>('event_detail/evt_0cb333291f580a201a70.json');
const HOME = 'prt_16bee2e0460c651b4bca';
const AWAY = 'prt_3d9358b1e2ac7256767d';
const set = gameScripts(r)!;
const abbr = (pid: string | null) => (pid === HOME ? 'BUF' : pid === AWAY ? 'NE' : null);
const rows = detail.markets.map((m) => priceRow(m, new Map(), marketLabel(m, abbr, () => null), scriptFit(m, set, HOME, AWAY)));

describe('multi-script survivors (item 16)', () => {
  const surv = multiScriptSurvivors(rows, set);
  it('lists only priced margin contracts that always win in 2+ scripts, most scripts first', () => {
    expect(surv.length).toBeGreaterThan(0);
    for (const x of surv) {
      expect(['game_winner', 'spread']).toContain(x.row.m.market_family);
      expect(x.full).toBeGreaterThanOrEqual(2);
      expect(tradable(x.row.ask)).toBe(true);
      expect(x.fits.filter((f) => f === 'yes').length).toBe(x.full);
    }
    for (let i = 1; i < surv.length; i++) {
      expect(surv[i - 1].full * 10 + surv[i - 1].coverage).toBeGreaterThanOrEqual(surv[i].full * 10 + surv[i].coverage - 1e-9);
    }
  });
  it('folds ladder rungs with the same script pattern on the same side into one row', () => {
    const keys = surv.map((x) => `${x.row.m.participant_id}|${x.row.m.market_family}|${x.fits.join('')}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(survivalWords(surv[0])).toMatch(/^Survives 2 of 4 scripts · \d+% of simulated games$/);
  });
});

describe('market expressions per script (item 14)', () => {
  it('the favourite-wins-big script: moneyline + spreads that always win, only real priced contracts', () => {
    const x = scriptExpressions(r, rows, set, 'fav-big', set.names);
    const i = set.scripts.findIndex((s) => s.id === 'fav-big');
    const fit = x.items.filter((e) => e.basis === 'fit');
    expect(fit.some((e) => e.kind === 'moneyline')).toBe(true);
    expect(fit.some((e) => e.kind === 'spread')).toBe(true);
    for (const e of fit) {
      expect(e.row.fit!.fits[i]).toBe('yes');
      expect(tradable(e.ask)).toBe(true);
      expect(detail.markets.some((m) => m.market_id === e.row.m.market_id)).toBe(true);
    }
    // Totals are never linked: the simulation publishes no points by script.
    expect(x.items.some((e) => ['total', 'team_total'].includes(e.row.m.market_family))).toBe(false);
    expect(x.missing.join(' ')).toMatch(/no points by script/);
  });
  it('props are a volume lean on the side the team volume moves, priced at that side', () => {
    for (const s of set.scripts) {
      const x = scriptExpressions(r, rows, set, s.id, set.names);
      for (const e of x.items.filter((y) => y.kind === 'prop')) {
        expect(e.basis).toBe('volume');
        expect(e.why).toMatch(/A direction, not a script price/);
        expect(e.ask).toBe(e.side === 'YES' ? e.row.m.yes_ask : e.row.m.no_ask);
        expect(e.why).toMatch(e.side === 'YES' ? /\+\d+%/ : /−\d+%/);
      }
    }
  });
  it('a one-score script links no spread and says why', () => {
    const x = scriptExpressions(r, rows, set, 'close', set.names);
    expect(x.items.some((e) => e.kind === 'spread' || e.kind === 'moneyline')).toBe(false);
    expect(x.missing.join(' ')).toMatch(/either team can win it/);
  });
});
