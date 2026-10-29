import { describe, expect, it } from 'vitest';
import { findSaved, kindOfRoute, normalizeRoute, reviveSaved, reviveSavedList, SAVED_VERSION } from '../../src/v3/model/saved';

// The record exactly as the first build stored it: no version, no kind, no chips.
const legacy = { id: 'rabc', title: 'CeeDee Lamb · Receptions', subtitle: 'L10 · Away · line 6', route: '/v3/player/nfl/p1?stat=rec&win=L10&site=away&line=6', savedAt: 1_700_000_000_000, snapshot: [{ label: 'Hit rate', value: '6/10', asOf: '2026-10-25' }] };

describe('saved research schema', () => {
  it('upgrades a first-build record without losing anything the viewer saved', () => {
    const r = reviveSaved(legacy)!;
    expect(r.v).toBe(SAVED_VERSION);
    expect(r).toMatchObject({ id: 'rabc', title: legacy.title, subtitle: legacy.subtitle, savedAt: legacy.savedAt, kind: 'player', sport: 'nfl', sv: 0 });
    expect(r.snapshot).toEqual(legacy.snapshot);
    // The route still carries the line, the window and the filter, now in the versioned vocabulary.
    expect(r.route).toBe('/v3/player/nfl/p1?v=2&stat=rec&line=6&site=away');
  });
  it('migrates legacy statistic routes to the current vocabulary', () => {
    const r = reviveSaved({ ...legacy, route: '/v3/stat/nfl/adj_off_epa?tab=rankings&team=PHI' })!;
    expect(r.route).toBe('/v3/stat/nfl/adj_off_epa?v=1&sel=PHI');
    expect(r.kind).toBe('stat');
  });
  it('keeps a record saved under the current version as it is', () => {
    const r = reviveSaved({ ...legacy, route: '/v3/player/nfl/p1?v=2&stat=rec&line=6' })!;
    expect(r.sv).toBe(2);
    expect(reviveSaved(r)).toEqual(r);
  });
  it('rejects what cannot be opened and never throws', () => {
    for (const bad of [null, undefined, 3, 'x', [], {}, { route: 5 }, { route: 'https://evil.example/v3/x' }, { route: '//evil.example/v3' }, { route: '/classic/home' }]) expect(reviveSaved(bad)).toBeNull();
  });
  it('accepts the hash and bare spellings of an in-app route', () => {
    expect(normalizeRoute('#/v3/team/nfl/DAL')).toBe('/v3/team/nfl/DAL');
    expect(normalizeRoute('v3/team/nfl/DAL')).toBe('/v3/team/nfl/DAL');
    expect(normalizeRoute('/v3')).toBe('/v3');
  });
  it('bounds every text field and the snapshot', () => {
    const r = reviveSaved({ ...legacy, title: 'x'.repeat(1000), subtitle: 'y'.repeat(1000), chips: Array.from({ length: 20 }, (_, i) => `c${i}`), snapshot: Array.from({ length: 20 }, () => ({ label: 'a', value: 'b', asOf: null })) })!;
    expect(r.title.length).toBeLessThanOrEqual(120);
    expect(r.subtitle.length).toBeLessThanOrEqual(160);
    expect(r.chips).toHaveLength(6);
    expect(r.snapshot).toHaveLength(6);
  });
  it('drops malformed snapshot items but keeps the record', () => {
    const r = reviveSaved({ ...legacy, snapshot: [{ label: 'ok', value: '1', asOf: null }, { label: '', value: '2' }, 'junk', null] })!;
    expect(r.snapshot).toEqual([{ label: 'ok', value: '1', asOf: null }]);
    expect(reviveSaved({ ...legacy, snapshot: 'nope' })!.snapshot).toBeUndefined();
  });
  it('never keeps a frozen price: a saved ask is an old price, shown only through the quote gate, so it is dropped on read', () => {
    const r = reviveSaved({ ...legacy, snapshot: [{ label: 'Hit rate', value: '6/10', asOf: null }, { label: 'Market ask', value: '49¢', asOf: null }, { label: 'Price', value: '54¢', asOf: null }] })!;
    expect(r.snapshot).toEqual([{ label: 'Hit rate', value: '6/10', asOf: null }]);
  });
  it('a price in a title, subtitle line or chip is dropped too (a saved card carries the setup, never a price)', () => {
    const r = reviveSaved({ ...legacy, title: 'Lamb 7+ · 56¢', subtitle: 'L10 · ask 56¢ · vs PHI · implied 56%', chips: ['L10', '56¢', 'Away', 'odds -120'] })!;
    expect(r.title).toBe('Lamb 7+');
    expect(r.subtitle).toBe('L10 · vs PHI');
    expect(r.chips).toEqual(['L10', 'Away']);
  });
  it('revives a stored list: drops the unusable, de-duplicates routes, makes ids unique', () => {
    const list = reviveSavedList([legacy, { ...legacy, id: 'rzzz' }, { ...legacy, route: '/v3/team/nfl/DAL', id: 'rabc' }, { nonsense: true }, null]);
    expect(list.map((x) => x.route)).toEqual(['/v3/player/nfl/p1?v=2&stat=rec&line=6&site=away', '/v3/team/nfl/DAL']);
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    expect(reviveSavedList('garbage')).toEqual([]);
  });
  it('finds a saved record however its route is spelled', () => {
    const list = reviveSavedList([legacy]);
    expect(findSaved(list, '/v3/player/nfl/p1?site=away&stat=rec&line=6&win=L10')?.id).toBe('rabc');
    expect(findSaved(list, '#/v3/player/nfl/p1?v=2&stat=rec&line=6&site=away')?.id).toBe('rabc');
    expect(findSaved(list, '/v3/player/nfl/p1?stat=rec&line=7')).toBeUndefined();
  });
  it('classifies routes', () => {
    expect(['/v3/player/nfl/x', '/v3/team/nfl/x', '/v3/stat/nfl/x', '/v3/game/nfl/x', '/v3/props?v=1', '/v3/explore'].map(kindOfRoute)).toEqual(['player', 'team', 'stat', 'game', 'props', 'other']);
  });
});
