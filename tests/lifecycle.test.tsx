// Post-kickoff freeze: once a game's scheduled kickoff has passed, nothing new from it can be saved as
// pregame research; what was saved before kickoff stays, can be removed, and still builds a packet.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveButton } from '../src/components/ui';
import { FROZEN_LABEL, isFrozen, researchPhase } from '../src/lib/lifecycle';
import { buildPacket } from '../src/packet/build';
import { renderText } from '../src/packet/render';
import { loadStored, TrayProvider, useTray } from '../src/state/tray';
import { nflRepo, useDiskFetch } from './helpers';

const EVENT = 'evt_0cb333291f580a201a70'; // NE @ BUF
const KICKOFF = '2026-10-04T17:00:00Z';
const MARKET = 'mkt_kalshi_KXNFLGAME-26OCT04NEBUF-BUF';
const BEFORE = new Date('2026-10-04T15:00:00Z');
const AFTER = new Date('2026-10-04T17:30:00Z');

function Count() {
  const t = useTray();
  return <span data-testid="n">{t.tray.items.length}</span>;
}

function Harness({ status }: { status?: string }) {
  return (
    <TrayProvider>
      <SaveButton ref_kind="MARKET" sport="NFL" id={MARKET} extra={{ market_id: MARKET, event_id: EVENT }} kickoff={KICKOFF} eventStatus={status}
        label={{ label: 'Bills to win', href: '/x' }} />
      <Count />
    </TrayProvider>
  );
}

const button = () => screen.getByRole('button');
const count = () => screen.getByTestId('n').textContent;

describe('research phase (lib/lifecycle)', () => {
  it('is pregame until the scheduled kickoff, frozen from kickoff on', () => {
    expect(researchPhase(KICKOFF, Date.parse('2026-10-04T16:59:59Z'))).toBe('pregame');
    expect(researchPhase(KICKOFF, Date.parse(KICKOFF))).toBe('frozen');
    expect(isFrozen(KICKOFF, AFTER.getTime())).toBe(true);
  });
  it('a FINAL event is frozen whatever the clock says; a missing kickoff never freezes', () => {
    expect(isFrozen('2099-01-01T00:00:00Z', BEFORE.getTime(), 'FINAL')).toBe(true);
    expect(isFrozen(null, AFTER.getTime())).toBe(false);
  });
});

describe('post-kickoff freeze in the research tray', () => {
  beforeAll(() => useDiskFetch());
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('1. a market can be added before kickoff', () => {
    vi.setSystemTime(BEFORE);
    render(<Harness />);
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button());
    expect(count()).toBe('1');
    expect(button()).toHaveAttribute('aria-pressed', 'true');
  });

  it('2. the same market cannot be newly added after kickoff, and pressing changes nothing', () => {
    vi.setSystemTime(AFTER);
    render(<Harness />);
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    expect(button()).toHaveTextContent(FROZEN_LABEL);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(count()).toBe('0');
    expect(loadStored().tray.items).toHaveLength(0);
  });

  it('3–4. an item saved before kickoff stays after kickoff, shows its saved state and can be removed', () => {
    vi.setSystemTime(BEFORE);
    render(<Harness />);
    fireEvent.click(button());
    expect(count()).toBe('1');
    vi.setSystemTime(AFTER);
    act(() => vi.advanceTimersByTime(31_000));
    expect(count()).toBe('1');
    expect(button()).toHaveTextContent('Saved pregame');
    expect(button()).toHaveAttribute('aria-label', expect.stringContaining('saved before kickoff'));
    expect(button()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(button());
    expect(count()).toBe('0');
    // …and once removed it cannot be saved again after kickoff.
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button());
    expect(count()).toBe('0');
  });

  it('5. a pregame item saved before kickoff still builds a packet after kickoff', async () => {
    vi.setSystemTime(BEFORE);
    render(<Harness />);
    fireEvent.click(button());
    vi.setSystemTime(AFTER);
    const tray = loadStored().tray;
    expect(tray.items).toHaveLength(1);
    expect(loadStored().labels[tray.items[0].item_id].kickoff).toBe(KICKOFF);
    vi.useRealTimers();
    const pkt = await buildPacket(nflRepo(), { scope: 'CUSTOM', tray, generatedAt: '2026-10-04T17:30:00Z' });
    const text = renderText(pkt);
    expect(text).toContain('KXNFLGAME-26OCT04NEBUF-BUF');
    expect(pkt.quality.missing.join(' ')).not.toContain(MARKET);
  });

  it('6. the frozen control explains itself to assistive tech, on hover and on tap', () => {
    vi.setSystemTime(AFTER);
    render(<Harness />);
    const b = button();
    expect(b).toHaveAccessibleName(expect.stringContaining('can’t be saved after kickoff'));
    expect(b).toHaveAccessibleDescription(expect.stringContaining('New pregame research can’t be saved after kickoff'));
    expect(b.getAttribute('title')).toContain('kicked off');
    fireEvent.click(b);
    expect(screen.getByRole('status')).toHaveTextContent('items saved before kickoff stay in your tray');
  });

  it('7. a FINAL game rejects new pregame saves', () => {
    vi.setSystemTime(BEFORE);
    render(<Harness status="FINAL" />);
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button());
    expect(count()).toBe('0');
  });
});
