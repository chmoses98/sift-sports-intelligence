import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadStored, saveStored, TRAY_KEY, TrayProvider, useTray } from '../src/state/tray';
import { makeTray, makeTrayItem } from '../src/packet/tray';

function Probe() {
  const t = useTray();
  return (
    <div>
      <span data-testid="n">{t.tray.items.length}</span>
      <button onClick={() => t.add({ ref_kind: 'MARKET', sport: 'NFL', id: 'mkt_kalshi_X', extra: { market_id: 'mkt_kalshi_X', event_id: 'evt_1' }, label: { label: 'X', href: '/x' } })}>add</button>
      <button onClick={() => t.add({ ref_kind: 'TEAM', sport: 'NFL', id: 'prt_1', label: { label: 'T', href: '/t' } })}>team</button>
      <button onClick={() => t.remove(t.tray.items[0].item_id)}>rm</button>
      <button onClick={() => t.clear()}>clear</button>
      <span data-testid="has">{String(t.has('MARKET', 'mkt_kalshi_X', { market_id: 'mkt_kalshi_X', event_id: 'evt_1' }))}</span>
    </div>
  );
}

describe('research tray', () => {
  beforeEach(() => localStorage.clear());

  it('adds references (deduplicated), persists them locally and survives a remount', () => {
    const a = render(<TrayProvider><Probe /></TrayProvider>);
    act(() => screen.getByText('add').click());
    act(() => screen.getByText('add').click());
    act(() => screen.getByText('team').click());
    expect(screen.getByTestId('n').textContent).toBe('2');
    expect(screen.getByTestId('has').textContent).toBe('true');
    const stored = JSON.parse(localStorage.getItem(TRAY_KEY)!);
    expect(stored.tray.kind).toBe('research_tray');
    expect(stored.tray.items[0]).toMatchObject({ ref_kind: 'MARKET', id: 'mkt_kalshi_X', extra: { market_id: 'mkt_kalshi_X', event_id: 'evt_1' } });
    expect(Object.keys(stored.tray.items[0]).sort()).toEqual(['added_at', 'extra', 'id', 'item_id', 'note', 'ref_kind', 'sport']);
    a.unmount();
    render(<TrayProvider><Probe /></TrayProvider>);
    expect(screen.getByTestId('n').textContent).toBe('2');
    act(() => screen.getByText('rm').click());
    expect(screen.getByTestId('n').textContent).toBe('1');
    act(() => screen.getByText('clear').click());
    expect(screen.getByTestId('n').textContent).toBe('0');
  });

  it('starts empty from a corrupt store', () => {
    localStorage.setItem(TRAY_KEY, '{not json');
    expect(loadStored().tray.items).toEqual([]);
  });

  it('round-trips through storage unchanged', () => {
    const tray = makeTray([makeTrayItem({ ref_kind: 'METRIC', sport: 'nfl', id: 'met_nfl.adj_def_db_epa', added_at: '2026-10-04T00:00:00Z' })], '2026-10-04T00:00:00Z');
    saveStored({ tray, labels: {} });
    expect(loadStored().tray).toEqual(tray);
  });
});

describe('providers in one page share one tray', () => {
  it('a save written by one TrayProvider appears in another without a reload', async () => {
    const { render: r, screen: sc, fireEvent: fe, act, cleanup } = await import('@testing-library/react');
    cleanup();
    const { TrayProvider: TP, useTray: useT } = await import('../src/state/tray');
    localStorage.clear();
    const Probe = ({ tag }: { tag: string }) => { const t = useT(); return <><span data-testid={`n-${tag}`}>{t.tray.items.length}</span>{tag === 'a' && <button onClick={() => t.add({ ref_kind: 'MARKET', sport: 'NFL', id: 'mkt_x', extra: { market_id: 'mkt_x' }, label: { label: 'X', href: '/x' } })}>add</button>}</>; };
    r(<><TP><Probe tag="a" /></TP><TP><Probe tag="b" /></TP></>);
    expect(sc.getByTestId('n-b').textContent).toBe('0');
    await act(async () => { fe.click(sc.getByText('add')); });
    expect(sc.getByTestId('n-a').textContent).toBe('1');
    expect(sc.getByTestId('n-b').textContent).toBe('1');
  });
});
