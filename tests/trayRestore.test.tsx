// Undo for My Board rests on the tray's `restore`: a removed item goes back exactly as it was stored, so no identity, timestamp, note,
// side or price snapshot is ever re-created.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveStored, TRAY_KEY, TrayProvider, useTray, type RemovedEntry, type TrayLabel } from '../src/state/tray';
import { makeTray, makeTrayItem } from '../src/packet/tray';

const SAVED = '2026-10-04T13:00:00Z';
const snap = { ticker: 'KXNFLREC-X-7', yesAsk: 0.4, yesBid: null, noAsk: 0.62, noBid: null, observedAt: '2026-10-04T12:58:00Z', source: 'publication' };

const items = [
  makeTrayItem({ ref_kind: 'MARKET', sport: 'NFL', id: 'mkt_kalshi_KXNFLREC-X-7', extra: { market_id: 'mkt_kalshi_KXNFLREC-X-7', event_id: 'evt_1' }, added_at: SAVED }),
  makeTrayItem({ ref_kind: 'TEAM', sport: 'NFL', id: 'prt_falcons', note: '  padded legacy note  ', added_at: '2026-10-04T13:05:00Z' }),
  makeTrayItem({ ref_kind: 'MARKET', sport: 'NFL', id: 'mkt_kalshi_KXNFLREC-X-7', extra: { market_id: 'mkt_kalshi_KXNFLREC-X-7', event_id: 'evt_1', x: 'side=NO' }, added_at: '2026-10-04T13:10:00Z' }),
  makeTrayItem({ ref_kind: 'EVENT', sport: 'NFL', id: 'evt_1', added_at: '2026-10-04T13:20:00Z' }),
];
const labels: Record<string, TrayLabel> = {
  [items[0].item_id]: { label: 'Olave 7+', href: '/x', market: snap, savedAt: SAVED },          // legacy: no side recorded
  [items[1].item_id]: { label: 'Falcons', href: '/t', savedAt: '2026-10-04T13:05:00Z' },
  [items[2].item_id]: { label: 'Olave under 6.5', href: '/y', side: 'NO', market: snap, savedAt: '2026-10-04T13:10:00Z' },
  [items[3].item_id]: { label: 'ATL @ NO', href: '/g', kickoff: '2026-10-06T00:15:00Z', savedAt: '2026-10-04T13:20:00Z' },
};

let api!: ReturnType<typeof useTray>;
function Grab() { api = useTray(); return null; }
const mount = () => render(<TrayProvider><Grab /></TrayProvider>);
const raw = () => JSON.parse(localStorage.getItem(TRAY_KEY)!);
/** Everything the tray stores except the document's own updated_at, which any write moves. */
const content = () => { const s = raw(); return { items: s.tray.items, labels: s.labels }; };

/** What the Board does before it removes: capture the item, its label and its place. */
const capture = (id: string): RemovedEntry => {
  const index = api.tray.items.findIndex((i) => i.item_id === id);
  return { item: api.tray.items[index], label: api.labels[id], index };
};

describe('tray restore (the basis of Board Undo)', () => {
  beforeEach(() => { localStorage.clear(); saveStored({ tray: makeTray(items, SAVED), labels }); });
  afterEach(cleanup);

  it('puts a removed item back verbatim: same identity, time, note, side, price snapshot and position', () => {
    mount();
    const before = content();
    for (const it of items) {
      const gone = capture(it.item_id);
      act(() => api.remove(it.item_id));
      expect(raw().tray.items.some((i: { item_id: string }) => i.item_id === it.item_id)).toBe(false);
      expect(raw().labels[it.item_id]).toBeUndefined();
      act(() => api.restore(gone));
      expect(content()).toEqual(before);
      // the items array and every label serialise identically, key order inside each included; only the label map's own insertion
      // order differs (the restored label is appended), which carries no meaning because labels are looked up by item_id
      expect(JSON.stringify(content().items)).toBe(JSON.stringify(before.items));
      for (const k of Object.keys(before.labels)) expect(JSON.stringify(content().labels[k])).toBe(JSON.stringify(before.labels[k]));
    }
  });

  it('keeps a legacy save legacy: restoring never adds a side or rewrites the padded note', () => {
    mount();
    const legacy = capture(items[0].item_id);
    act(() => api.remove(items[0].item_id));
    act(() => api.restore(legacy));
    expect(raw().labels[items[0].item_id].side).toBeUndefined();
    const noted = capture(items[1].item_id);
    act(() => api.remove(items[1].item_id));
    act(() => api.restore(noted));
    expect(raw().tray.items[1].note).toBe('  padded legacy note  ');
  });

  it('a NO save and the YES save on the same market are separate items and restore separately', () => {
    mount();
    const no = capture(items[2].item_id);
    act(() => api.remove(items[2].item_id));
    expect(api.tray.items.map((i) => i.item_id)).toEqual([items[0].item_id, items[1].item_id, items[3].item_id]);
    expect(api.labels[items[0].item_id].side).toBeUndefined();
    act(() => api.restore(no));
    expect(api.labels[items[2].item_id].side).toBe('NO');
    expect(api.labels[items[2].item_id].market).toEqual(snap);
  });

  it('restores to its old place even after the list changed around it, and clamps a place that no longer exists', () => {
    mount();
    const second = capture(items[1].item_id);
    act(() => api.remove(items[1].item_id));
    act(() => api.remove(items[3].item_id));
    act(() => api.restore(second));
    expect(api.tray.items.map((i) => i.item_id)).toEqual([items[0].item_id, items[1].item_id, items[2].item_id]);
    act(() => api.restore({ item: items[3], label: labels[items[3].item_id], index: 99 }));
    expect(api.tray.items.at(-1)!.item_id).toBe(items[3].item_id);
  });

  it('does not overwrite the same item if it was saved again meanwhile, nor duplicate it', () => {
    mount();
    const gone = capture(items[3].item_id);
    act(() => api.remove(items[3].item_id));
    const again = makeTrayItem({ ref_kind: 'EVENT', sport: 'NFL', id: 'evt_1', added_at: '2026-10-04T15:00:00Z' });
    act(() => { api.add({ ref_kind: 'EVENT', sport: 'NFL', id: 'evt_1', label: { label: 'ATL @ NO (again)', href: '/g' } }); });
    expect(again.item_id).toBe(items[3].item_id);
    const newer = api.tray.items.find((i) => i.item_id === items[3].item_id)!;
    expect(newer.added_at).not.toBe(items[3].added_at);
    act(() => api.restore(gone));
    expect(api.tray.items.filter((i) => i.item_id === items[3].item_id)).toHaveLength(1);
    expect(api.tray.items.find((i) => i.item_id === items[3].item_id)).toEqual(newer);
    expect(api.labels[items[3].item_id].label).toBe('ATL @ NO (again)');
  });

  it('an item that never had a label comes back without inventing one', () => {
    saveStored({ tray: makeTray(items, SAVED), labels: {} });
    mount();
    const bare = capture(items[0].item_id);
    expect(bare.label).toBeUndefined();
    act(() => api.remove(items[0].item_id));
    act(() => api.restore(bare));
    expect(raw().labels).toEqual({});
    expect(raw().tray.items[0]).toEqual(items[0]);
  });

  it('a note change touches only the note: ids, timestamps and every label stay', () => {
    mount();
    const before = content();
    act(() => api.setNote(items[3].item_id, 'new note'));
    const after = content();
    expect(after.labels).toEqual(before.labels);
    expect(after.items.map((i: { note: string | null }) => ({ ...i, note: null }))).toEqual(before.items.map((i: { note: string | null }) => ({ ...i, note: null })));
    expect(after.items[3].note).toBe('new note');
    act(() => api.setNote(items[3].item_id, '   '));
    expect(raw().tray.items[3].note).toBeNull();
  });
});
