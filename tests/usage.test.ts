import { describe, expect, it } from 'vitest';
import { usageFor, usageRole } from '../src/lib/usage';

const T = 'met_nfl.proj_target_share';
const C = 'met_nfl.proj_carry_share';
const obs = (target: number | null, carry: number | null) => [
  { metric_id: T, value: target },
  { metric_id: C, value: carry },
];
const ids = (xs: { metric_id: string }[]) => xs.map((x) => x.metric_id).sort();

describe('position-aware player usage', () => {
  it('classifies usage metrics by role from their id and name', () => {
    expect(usageRole(T, 'Projected target share')).toBe('receiving');
    expect(usageRole(C, 'Projected carry share')).toBe('rushing');
    expect(usageRole('met_nfl.proj_route_share')).toBe('receiving');
    expect(usageRole('met_nfl.proj_dropback_share')).toBe('passing');
  });

  it('a QB never shows receiving usage, even when a target share is published (Josh Allen: 0.98%)', () => {
    const shown = usageFor('QB', obs(0.0098, 0.1664));
    expect(ids(shown)).toEqual([C]);
    expect(shown.some((o) => usageRole(o.metric_id) === 'receiving')).toBe(false);
  });

  it('a QB keeps legitimate published rushing usage', () => {
    expect(ids(usageFor('QB', obs(0.002, 0.0541)))).toEqual([C]);
  });

  it('an RB shows rushing and receiving usage (James Cook III)', () => {
    expect(ids(usageFor('RB', obs(0.079, 0.6594)))).toEqual([C, T].sort());
  });

  it('a WR shows receiving usage and hides a token carry share (Khalil Shakir: 0.32% of carries)', () => {
    expect(ids(usageFor('WR', obs(0.1654, 0.0032)))).toEqual([T]);
  });

  it('a WR with a real rushing role keeps it (>= 5% of carries)', () => {
    expect(ids(usageFor('WR', obs(0.2, 0.08)))).toEqual([C, T].sort());
  });

  it('a TE shows receiving usage (Dalton Kincaid) and hides a zero carry share (Hunter Henry)', () => {
    expect(ids(usageFor('TE', obs(0.1533, 0.0023)))).toEqual([T]);
    expect(ids(usageFor('TE', obs(0.1545, 0)))).toEqual([T]);
  });

  it('kickers, defenders and unknown positions show no usage at all', () => {
    for (const pos of ['K', 'P', 'LB', 'CB', 'DEF', '', null]) expect(usageFor(pos, obs(0.1, 0.1))).toEqual([]);
  });

  it('never fabricates: unpublished (null) values are not shown', () => {
    expect(usageFor('RB', obs(null, null))).toEqual([]);
  });
});
