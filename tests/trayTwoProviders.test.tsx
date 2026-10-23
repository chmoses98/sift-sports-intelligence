// The app mounts one TrayProvider for the classic interfaces and v4 mounts its own inside it. When one provider writes the tray, the other
// adopts it from storage; adopting must not be written back, or a provider that has only echoed the tray can later overwrite a newer write
// made in between (a save from another screen), and the row it showed vanishes. Seen as a WebKit-only e2e flake in v4 Board Undo.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveStored, TRAY_KEY, TrayProvider, useTray } from '../src/state/tray';
import { makeTray, makeTrayItem } from '../src/packet/tray';

const A = makeTrayItem({ ref_kind: 'EVENT', sport: 'NFL', id: 'evt_a', added_at: '2026-10-04T13:00:00Z' });
const B = makeTrayItem({ ref_kind: 'EVENT', sport: 'NFL', id: 'evt_b', added_at: '2026-10-04T13:10:00Z' });
const lab = (label: string) => ({ label, href: '/x' });

let inner!: ReturnType<typeof useTray>;
function Grab() { inner = useTray(); return null; }
const raw = () => JSON.parse(localStorage.getItem(TRAY_KEY)!);
const ids = () => raw().tray.items.map((i: { item_id: string }) => i.item_id);

describe('two TrayProviders in one page', () => {
  beforeEach(() => { localStorage.clear(); saveStored({ tray: makeTray([A, B], new Date()), labels: { [A.item_id]: lab('A'), [B.item_id]: lab('B') } }); });
  afterEach(cleanup);

  it('a removal made in the inner provider reaches storage and the outer provider', () => {
    let outer!: ReturnType<typeof useTray>;
    const Out = () => { outer = useTray(); return null; };
    render(<TrayProvider><Out /><TrayProvider><Grab /></TrayProvider></TrayProvider>);
    act(() => inner.remove(A.item_id));
    expect(ids()).toEqual([B.item_id]);
    expect(outer.tray.items.map((i) => i.item_id)).toEqual([B.item_id]);
  });

  it('the provider that only adopted a removal does not overwrite a newer save made before its effect ran', () => {
    render(<TrayProvider><TrayProvider><Grab /></TrayProvider></TrayProvider>);
    // Runs on the first tray-changed event, after both providers' own listeners (registered at mount): the moment the outer provider has queued
    // the tray it adopted but not yet run its effect. The newer save lands in storage right then.
    let wrote = false;
    window.addEventListener('sift:tray-changed', () => {
      if (wrote) return;
      wrote = true;
      const s = raw();
      s.tray.items.push({ ...A, added_at: '2026-10-04T14:59:00Z' });
      s.labels[A.item_id] = lab('A again');
      localStorage.setItem(TRAY_KEY, JSON.stringify(s));
    }, { once: false });
    act(() => inner.remove(A.item_id));
    expect(wrote).toBe(true);
    expect(ids()).toEqual([B.item_id, A.item_id]);
    expect(raw().labels[A.item_id].label).toBe('A again');
  });
});
