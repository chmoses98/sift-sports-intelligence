// Opportunity integrity: a card's price and probability must belong to the same contract (identity), "robust" means the
// publication's own robustness check passed at a current price (never a substring match, never a model the market
// beats), a live price change re-bases or withdraws every number that depended on the old price, and two positions
// that cannot both win are named as contradicting each other. Each case below reproduces a defect seen on the live
// publications on 2026-10-09.
import { describe, expect, it } from 'vitest';
import type { BoardDoc, ItemsDoc, Recommendation, Thesis } from '../src/contract/types';
import { codePosition, mlbOrientation, scoreOf, soccerOrientation, tennisOrientation, tickerParts } from '../src/opportunity/identity';
import { contradicts, scoreRulesExclusive, soccerScoreRule } from '../src/opportunity/correlation';
import { repriceWithLive } from '../src/opportunity/live';
import { compareOpportunities, featureOpportunities, tierOf } from '../src/opportunity/rank';
import { soccerOpportunities, tennisOpportunities } from '../src/opportunity/sources';
import type { Opportunity } from '../src/opportunity/types';
import { quote } from './live/fakes';
import { readSoccer, readTennis } from './helpers';

const NOW = Date.parse('2026-10-09T06:10:00Z');
const ARS = 'KXEPLGAME-26OCT10ARSLEE-ARS';
const soccerInputs = (recs?: Recommendation[]) => ({
  sport: { code: 'SOCCER' as const, slug: 'soccer', label: 'Soccer' },
  board: readSoccer<BoardDoc>('board.json').items,
  recommendations: (recs ?? readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items) as never,
  theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items,
  now: NOW,
});
const soccer = () => soccerOpportunities(soccerInputs());
const ars = () => soccer().find((o) => o.ticker === ARS)!;
/** A research row whose model has no market-beats-model record, so the robust tier is reachable. */
const research = (o: Opportunity, support = 'ROBUST'): Opportunity => {
  const confidence = { ...o.confidence, calibration: 'RESEARCH' as const, support };
  const tier = tierOf({ status: o.status, support, worstCaseEdge: o.rank.worstCaseEdge, highVariance: o.rank.highVariance, priceCurrent: o.rank.priceCurrent, calibration: 'RESEARCH' });
  return { ...o, confidence, rank: { ...o.rank, tier } };
};

describe('contract identity', () => {
  it('reads Kalshi game tickers: date, optional start time, participant pair and contract code', () => {
    expect(tickerParts('KXBRASILEIROGAME-26OCT10VDGCR-CR')).toEqual({ series: 'KXBRASILEIROGAME', pair: 'VDGCR', suffix: 'CR' });
    expect(tickerParts('KXMLBGAME-26OCT081700CLECWS-CLE')).toEqual({ series: 'KXMLBGAME', pair: 'CLECWS', suffix: 'CLE' });
    expect(tickerParts('KXBUNDESLIGAGAME-26OCT10M05LEV-M05')?.pair).toBe('M05LEV');
    expect(tickerParts('KXNHLGOAL-26OCT09SEADET-SEARWINTERTON26-1')).toBeNull();
    expect(codePosition('VDGCR', 'CR')).toBe('second');
    expect(codePosition('VDGCR', 'CR3')).toBe('second');
    expect(codePosition('VDGCR', 'VDG')).toBe('first');
    expect(codePosition('M05LEV', 'M05')).toBe('first');
    expect(codePosition('M05LEV', 'LEV2')).toBe('second');
    expect(codePosition('ARSLEE', 'TIE')).toBe('tie');
    expect(codePosition('ABAB', 'AB')).toBeNull(); // fits both sides: never read as a side
    expect(scoreOf('PUELEO', 'PUE1LEO0')).toEqual([1, 0]);
    expect(scoreOf('M05LEV', 'M052LEV1')).toEqual([2, 1]);
  });

  it('soccer: Clube do Remo’s contract labelled "Result: home" for Vasco da Gama is a mismatch (live, 2026-10-09)', () => {
    const names = { home: 'Vasco da Gama', away: 'Remo' };
    const bad = soccerOrientation('KXBRASILEIROGAME-26OCT10VDGCR-CR', 'Result: home', names);
    expect(bad.state).toBe('MISMATCH');
    expect(bad.reason).toMatch(/Remo’s contract/);
    expect(soccerOrientation('KXBRASILEIROSPREAD-26OCT10VDGCR-CR3', 'home wins by more than 2.5', names).state).toBe('MISMATCH');
    expect(soccerOrientation('KXBRASILEIROGAME-26OCT10VDGCR-VDG', 'Result: home', names).state).toBe('VERIFIED');
    expect(soccerOrientation('KXBRASILEIROGAME-26OCT10VDGCR-TIE', 'Result: draw', names).state).toBe('VERIFIED');
    expect(soccerOrientation('KXBRASILEIROGAME-26OCT10VDGCR-TIE', 'Result: away', names).state).toBe('MISMATCH');
    expect(soccerOrientation('KXLIGAMXSCORE-26OCT09PUELEO-PUE1LEO0', 'Exact score 1-0 (home-away)', names).state).toBe('VERIFIED');
    expect(soccerOrientation('KXLIGAMXSCORE-26OCT09PUELEO-PUE1LEO0', 'Exact score 0-1 (home-away)', names).state).toBe('MISMATCH');
    // No side code: totals and both-teams-to-score are not checked, never failed.
    expect(soccerOrientation('KXLIGAMXTOTAL-26OCT09PUELEO-3', 'Total goals over 2.5', names).state).toBe('UNVERIFIED');
  });

  it('soccer: a mismatched row is a PASS with the reason, never a featured card; correct rows are untouched', () => {
    type Row = Recommendation & { source_ids?: Record<string, string> | null };
    const recs = readSoccer<ItemsDoc<Row>>('recommendations.json').items;
    const arsRow = recs.find((r) => r.source_ids?.kalshi_ticker === ARS || r.market_id === `mkt_kalshi_${ARS}`)!;
    // The same row pointed at Leeds' contract while still saying "Result: home".
    const swapped: Row = { ...arsRow, recommendation_id: 'rec_swapped', market_id: 'mkt_kalshi_KXEPLGAME-26OCT10ARSLEE-LEE', source_ids: { ...(arsRow.source_ids ?? {}), kalshi_ticker: 'KXEPLGAME-26OCT10ARSLEE-LEE' } };
    const opps = soccerOpportunities(soccerInputs([...recs, swapped]));
    const bad = opps.find((o) => o.id === 'SOCCER:rec_swapped')!;
    expect(bad.orientation).toBe('MISMATCH');
    expect(bad.status).toBe('PASS');
    expect(bad.statusReason).toMatch(/Contract identity failed/);
    expect(featureOpportunities(opps.filter((o) => o.status !== 'PASS')).some((f) => f.lead.id === bad.id || f.related.some((r) => r.id === bad.id))).toBe(false);
    expect(opps.find((o) => o.ticker === ARS)!.orientation).toBe('VERIFIED');
  });

  it('MLB and tennis: the contract code must be the side the publication names', () => {
    expect(mlbOrientation('KXMLBGAME-26OCT081700CLECWS-CLE', 'away', { home: 'CWS', away: 'CLE' }).state).toBe('VERIFIED');
    expect(mlbOrientation('KXMLBTEAMTOTAL-26OCT081700CLECWS-CWS4', 'home', { home: 'CWS', away: 'CLE' }).state).toBe('VERIFIED');
    expect(mlbOrientation('KXMLBGAME-26OCT081700CLECWS-CLE', 'home', { home: 'CWS', away: 'CLE' }).state).toBe('MISMATCH');
    expect(tennisOrientation('KXITFMATCH-26OCT09COVDED-DED', 'Felipe De Dios', 'Matteo Covato').state).toBe('VERIFIED');
    expect(tennisOrientation('KXATPEXACTMATCH-26OCT10UGOAUG-AUG21', 'Felix Auger-Aliassime', 'Camilo Ugo Carabelli').state).toBe('VERIFIED');
    expect(tennisOrientation('KXITFMATCH-26OCT09COVDED-DED', 'Matteo Covato', 'Felipe De Dios').state).toBe('MISMATCH');
  });
});

describe('honest tiers', () => {
  const base = { status: 'RESEARCH_CANDIDATE' as const, worstCaseEdge: 0.05, highVariance: false, priceCurrent: true, calibration: 'RESEARCH' as const };
  it('robust needs an exact strong support word: AGREES_WITH_KALSHI (sharp books side with the market) is not one', () => {
    expect(tierOf({ ...base, support: 'ROBUST' })).toBe(2);
    expect(tierOf({ ...base, support: 'AGREES_WITH_MODEL' })).toBe(2);
    expect(tierOf({ ...base, support: 'AGREES_WITH_KALSHI' })).toBe(3);
    expect(tierOf({ ...base, support: 'NOT_ROBUST' })).toBe(3);
    expect(tierOf({ ...base, support: 'BEST_EXPRESSION' })).toBe(3);
  });
  it('robust needs a current price and a published, positive worst case', () => {
    expect(tierOf({ ...base, support: 'ROBUST', priceCurrent: false })).toBe(3);
    expect(tierOf({ ...base, support: 'ROBUST', worstCaseEdge: null })).toBe(3);
    expect(tierOf({ ...base, support: 'ROBUST', worstCaseEdge: -0.01 })).toBe(3);
    expect(tierOf({ ...base, support: 'ROBUST', highVariance: true })).toBe(3);
  });
  it('a model the market beats is a model disagreement (tier 4), never a research candidate in front of the others', () => {
    expect(tierOf({ ...base, support: 'AGREES_WITH_MODEL', calibration: 'MARKET_BEATS_MODEL' })).toBe(4);
    const tennis = tennisOpportunities({ sport: { code: 'TENNIS', slug: 'tennis', label: 'Tennis' }, board: readTennis<BoardDoc>('board.json').items, recommendations: readTennis<ItemsDoc<Recommendation>>('recommendations.json').items as never, now: Date.parse('2026-10-09T06:00:00Z') });
    for (const o of tennis.filter((x) => x.status === 'RESEARCH_CANDIDATE')) {
      expect(o.rank.tier).toBe(4);
      expect(o.rank.tierWord).toBe('Model disagreement');
    }
  });
  it('a smaller edge from a research model outranks a bigger gap from a model the market beats; gap size never orders the latter', () => {
    const beaten = ars();
    expect(beaten.confidence.calibration).toBe('MARKET_BEATS_MODEL');
    const small: Opportunity = { ...research(beaten, 'BEST_EXPRESSION'), id: 'SOCCER:small', rank: { ...beaten.rank, tier: 3, worstCaseEdge: 0.001, evPerContract: 0.01 } };
    expect(compareOpportunities(small, beaten)).toBeLessThan(0);
    const later = { ...beaten, id: 'SOCCER:later', rank: { ...beaten.rank, kickoff: '2026-10-11T00:00:00Z', worstCaseEdge: 0.4 } };
    expect(compareOpportunities(beaten, later)).toBeLessThan(0); // earlier kickoff first, though its gap is smaller
  });
});

describe('live repricing re-bases or withdraws every price-dependent number', () => {
  it('worst case = worst-case probability − break-even: re-based on the live break-even; posterior share withdrawn', () => {
    const o = research(ars());
    expect(o.rank.tier).toBe(2);
    // NO ask 31¢ (yesBid 0.69): break-even 31¢ + 2¢ Kalshi fee = 33¢ vs 30.4413¢ at the run.
    const r = repriceWithLive(o, quote(ARS, 0.69, NOW - 60_000), NOW);
    expect(r.price.ask).toBeCloseTo(0.31, 6);
    expect(r.rank.worstCaseEdge).toBeCloseTo(0.055519 + 0.304413 - 0.33, 6);
    expect(r.rank.edgeShare).toBeNull();
    expect(r.confidence.edgeShare).toBeNull();
    expect(r.priceNote).toMatch(/29¢ at the research run → 31¢ now/);
    expect(r.rank.tier).toBe(2); // still positive and current
  });
  it('a worst case the live price pushes to zero or below drops the robust tier', () => {
    const o = research(ars());
    const r = repriceWithLive(o, quote(ARS, 0.67, NOW - 60_000), NOW); // NO ask 33¢: break-even 35¢ > worst-case prob 35.99¢? -> 0.0099
    expect(r.rank.worstCaseEdge).toBeCloseTo(0.359932 - 0.35, 6);
    const r2 = repriceWithLive(o, quote(ARS, 0.66, NOW - 60_000), NOW); // NO ask 34¢: worst-case 35.99 − 36 < 0
    expect(r2.rank.worstCaseEdge!).toBeLessThan(0);
    expect(r2.rank.tier).toBe(3);
    expect(r2.status).toBe('RESEARCH_CANDIDATE');
  });
  it('a research candidate whose live ask passes its bet-up-to, or whose edge after fee is gone, is a PASS', () => {
    const above = repriceWithLive(ars(), quote(ARS, 0.6, NOW - 60_000), NOW); // NO ask 40¢ > 34¢
    expect(above.status).toBe('PASS');
    expect(above.statusReason).toMatch(/above the publication’s bet-up-to/);
    expect(above.rank.tier).toBe(5);
    const noLimit: Opportunity = { ...ars(), reprice: { ...ars().reprice, betUpTo: null } };
    const gone = repriceWithLive(noLimit, quote(ARS, 0.5, NOW - 60_000), NOW); // NO ask 48¢ + 2¢ > fair 47.3%
    expect(gone.status).toBe('PASS');
    expect(gone.statusReason).toMatch(/edge after fee is gone/);
  });
  it('the publication’s freshness word describes its own price, not a newer live quote', () => {
    const o: Opportunity = { ...ars(), reprice: { ...ars().reprice, publishedPriceState: 'STALE' } };
    const r = repriceWithLive(o, quote(ARS, 0.71, NOW - 60_000), NOW);
    expect(r.price.state).toBe('CURRENT');
  });
});

describe('contradiction and correlation', () => {
  it('reads soccer full-time contract words as a rule over the final score', () => {
    expect(soccerScoreRule('Result: away')).toEqual({ k: 'result', who: 'away' });
    expect(soccerScoreRule('away team total over 0.5')).toEqual({ k: 'teamTotal', team: 'away', over: 0.5 });
    expect(soccerScoreRule('Exact score 1-0 (home-away)')).toEqual({ k: 'exact', h: 1, a: 0 });
    expect(soccerScoreRule('First-half total goals over 1.5')).toBeNull();
    expect(soccerScoreRule('First team to score: away')).toBeNull();
  });
  it('two positions contradict when no final score pays both', () => {
    // YES away win and NO away team total over 0.5 (away scores nothing): cannot both win.
    expect(scoreRulesExclusive({ k: 'result', who: 'away' }, 'YES', { k: 'teamTotal', team: 'away', over: 0.5 }, 'NO')).toBe(true);
    expect(scoreRulesExclusive({ k: 'result', who: 'away' }, 'YES', { k: 'result', who: 'draw' }, 'YES')).toBe(true);
    expect(scoreRulesExclusive({ k: 'exact', h: 1, a: 0 }, 'YES', { k: 'result', who: 'home' }, 'NO')).toBe(true);
    // The fixture's 1-0 thesis: NO btts, YES 1-0, NO total over 1.5 all win together.
    expect(scoreRulesExclusive({ k: 'btts' }, 'NO', { k: 'exact', h: 1, a: 0 }, 'YES')).toBe(false);
    expect(scoreRulesExclusive({ k: 'total', over: 1.5 }, 'NO', { k: 'exact', h: 1, a: 0 }, 'YES')).toBe(false);
  });
  it('the fixture: within a thesis group the expressions that cannot win with the lead are marked as the opposite outcome', () => {
    const opps = soccer().filter((o) => o.status !== 'PASS');
    const f = featureOpportunities(opps);
    for (const g of f) {
      for (const id of g.opposed) expect(contradicts(g.lead, g.related.find((r) => r.id === id)!)).toBe(true);
      for (const r of g.related.filter((x) => !g.opposed.includes(x.id))) expect(contradicts(g.lead, r)).toBe(false);
    }
    // Arsenal v Leeds: NO Arsenal leads; YES Leeds and YES draw are each a way NO Arsenal wins, not its opposite.
    const arsGroup = f.find((g) => g.related.some((r) => r.ticker === ARS) || g.lead.ticker === ARS)!;
    const draw = [arsGroup.lead, ...arsGroup.related].find((o) => /TIE$/.test(o.ticker ?? ''));
    const away = [arsGroup.lead, ...arsGroup.related].find((o) => /LEE$/.test(o.ticker ?? ''));
    expect(draw && away && contradicts(draw, away)).toBe(true); // YES draw and YES Leeds cannot both win
  });
  it('same ticker, opposite sides contradict; featured leads on one game are one exposure', () => {
    const o = ars();
    const flip: Opportunity = { ...o, id: 'SOCCER:flip', group: 'other', what: { ...o.what, side: 'YES' } };
    expect(contradicts(o, flip)).toBe(true);
    const f = featureOpportunities([o, flip]);
    expect(f).toHaveLength(2);
    expect(f[0].sameGame.map((x) => x.id)).toEqual([f[1].lead.id]);
    expect(f[0].conflicts).toHaveLength(1);
  });
});
