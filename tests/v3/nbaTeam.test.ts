import { describe, expect, it } from 'vitest';
import type { EntityProfileDoc } from '../../src/contract/types';
import { compareTeams, factorLine, nbaCurrency, nbaTeamView, seasonAt, signed } from '../../src/v3/model/nbaTeam';
import chi from './fixtures/nba/team-CHI.json';
import phi from './fixtures/nba/team-PHI.json';

// The fixtures are an REAL 2026-27 box scores exported by nba-edge-finder (see their `_fixture` field), trimmed.
// They test the screen's logic on the real document shape; they are never shown as data.
const asDoc = (d: unknown) => d as unknown as EntityProfileDoc;
const profile = (over: Record<string, unknown> = {}) => asDoc({ ...(chi as object), ...over });

describe('seasonAt', () => {
  it('assigns dates to the NBA season they fall in', () => {
    expect(seasonAt(Date.parse('2026-11-02T12:00:00Z'))).toBe('2026-27');
    expect(seasonAt(Date.parse('2027-03-01T12:00:00Z'))).toBe('2026-27');
    expect(seasonAt(Date.parse('2027-07-02T12:00:00Z'))).toBe('2027-28');
  });
});

describe('nbaCurrency: the gate is the data, not a flag', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const fresh = (o: Record<string, unknown> = {}) => profile({ season: '2026-27', quality: { ...(chi as { quality: object }).quality, data_as_of: '2026-11-02T03:00:00Z' }, ...o });
  it('opens for this season, with blended and current ratings built from games, observed recently', () => {
    const c = nbaCurrency(fresh(), now);
    expect(c.ok).toBe(true);
    expect(c.games).toBeGreaterThan(0);
  });
  it('stays locked for last season’s statistics however complete they are, and says why', () => {
    const c = nbaCurrency(fresh({ season: '2025-26' }), now);
    expect(c.ok).toBe(false);
    expect(c.reasons.join(' ')).toMatch(/2025-26, not 2026-27/);
  });
  it('locks when the newest data is older than three days', () => {
    const c = nbaCurrency(fresh({ quality: { data_as_of: '2026-10-20T00:00:00Z' } }), now);
    expect(c.ok).toBe(false);
    expect(c.reasons.join(' ')).toMatch(/2026-10-20/);
  });
  it('locks when the blended or current-season ratings are absent', () => {
    const c = nbaCurrency(fresh({ metrics: (chi as { metrics: { metric_id: string }[] }).metrics.filter((m) => !/blend_|cur_adj/.test(m.metric_id)) }), now);
    expect(c.ok).toBe(false);
  });
  it('locks with no profile at all', () => {
    expect(nbaCurrency(null, now).ok).toBe(false);
  });
});

describe('nbaTeamView on a real exporter document', () => {
  const v = nbaTeamView(profile({ season: '2026-27' }));
  it('keeps raw current-season ratings and the blended estimate apart, with the weight on this season', () => {
    expect(v.cur.net).not.toBeNull();
    expect(v.blend.net).not.toBeNull();
    expect(v.cur.net).not.toBe(v.blend.net);                       // two different numbers, two different labels
    expect(v.blend.weightCurrent).toBeGreaterThan(0.5);
    expect(v.blend.weightCurrent).toBeLessThan(1);
    expect(v.priorSeason).toBe('2025-26');
    expect(v.games).toBeGreaterThanOrEqual(3);
  });
  it('ranks strengths and weaknesses only on statistics with a direction (never style)', () => {
    expect(v.strengths.length + v.weaknesses.length).toBeGreaterThan(0);
    for (const f of [...v.strengths, ...v.weaknesses]) expect(f.hib).not.toBeNull();
    for (const f of v.strengths) expect(f.rank!).toBeLessThanOrEqual(Math.max(3, Math.round(f.n! / 4)));
    for (const f of v.weaknesses) expect(f.rank!).toBeGreaterThan(f.n! - Math.max(3, Math.round(f.n! / 4)));
  });
  it('describes a factor in words with its rank', () => {
    const f = v.factors.find((x) => x.rank != null)!;
    expect(factorLine(f)).toMatch(/^\d+(st|nd|rd|th) of 30 · /);
  });
  it('lists recent form from this season’s games only', () => {
    expect(v.form.length).toBeLessThanOrEqual(10);
    for (const g of v.form) expect(g.date >= '2026-07-01' || g.date >= '2025-07-01').toBe(true);
  });
  it('compares two real profiles with a direction on every ranked row', () => {
    const rows = compareTeams(v, nbaTeamView(asDoc({ ...(phi as object), season: '2026-27' })));
    expect(rows[0].label).toBe('SIFT blended net');
    expect(rows.length).toBeGreaterThan(6);
    const eg = rows.find((r) => r.label === 'Shooting (eFG%)');
    expect(eg && ['mine', 'theirs', 'even']).toContain(eg!.edge);
  });
  it('formats signed ratings', () => {
    expect(signed(4.46)).toBe('+4.5');
    expect(signed(-2.04)).toBe('−2.0');
    expect(signed(null)).toBe('—');
  });
});
