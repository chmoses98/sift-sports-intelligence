import { describe, expect, it } from 'vitest';
import { buildDirectory } from '../../src/v3/data/teamDirectory';
import { allTeams, confShort } from '../../src/views/cbb/identity';
import { unifyLabel } from '../../src/v3/model/conference';

const rows = allTeams().map((t) => {
  const l = confShort(t.conference);
  return { abbr: t.abbr, name: t.name, full: t.full, conference: l ? unifyLabel(l) : null };
});

describe('favorites directory: NCAAB', () => {
  const cbb = buildDirectory({ games: [], cfbCodes: [], college: null, cbbConferences: [], cbbRows: rows }).find((l) => l.slug === 'cbb')!;

  it('lists every supported team without any published game, one per follow key', () => {
    expect(rows.length).toBeGreaterThanOrEqual(363);
    expect(cbb.teams).toHaveLength(new Set(rows.map((r) => r.abbr)).size);
    expect(new Set(cbb.teams.map((t) => t.key)).size).toBe(cbb.teams.length);
  });

  it('keys a team by the publication short_name, so the card star and the picker write the same follow', () => {
    const t = cbb.teams.find((x) => x.name === 'Duke')!;
    expect(t.key).toBe(`cbb:${t.abbr}`);
    expect(t.logo).toMatch(/teams\/cbb\/\d+\.webp$/);
    expect(t.conference).toBeTruthy();
  });

  it('keeps conferences for conference following', () => {
    const withConf = buildDirectory({ games: [], cfbCodes: [], college: null, cbbConferences: [{ label: 'ACC', count: 18 }], cbbRows: rows }).find((l) => l.slug === 'cbb')!;
    expect(withConf.conferences.map((c) => c.label)).toContain('ACC');
  });

  it('a slate team with the same id is not listed twice', () => {
    const t = cbb.teams[0];
    const game = { away: { ...t, id: t.abbr, sport: 'NCAAB' }, home: { ...cbb.teams[1], id: cbb.teams[1].abbr, sport: 'NCAAB' } } as never;
    const merged = buildDirectory({ games: [game], cfbCodes: [], college: null, cbbConferences: [], cbbRows: rows }).find((l) => l.slug === 'cbb')!;
    expect(merged.teams).toHaveLength(cbb.teams.length);
  });
});
