// One finger, on any engine.
//
// Chromium: real touch input through the DevTools protocol (Input.dispatchTouchEvent), the same path a finger takes into the browser, so the browser's own rules
// (touch-action, panning, pointer capture) apply. `native` is true.
//
// WebKit has no DevTools-protocol touch input (`newCDPSession` throws "only available in Chromium") and Playwright offers no touch drag there, so on WebKit:
//   tap                 a real tap through `page.touchscreen.tap` (the engine's own touch input, hit testing and pointer events);
//   down / move / up    a pointer sequence of pointerType "touch" dispatched at the element under the finger, which stays the target until the finger lifts, as pointer
//                       capture makes it for a real one. It exercises the page's own handlers and the engine's layout and hit testing, but the BROWSER takes no part: it
//                       cannot start a native pan or cancel the gesture. `native` is false, and a test whose point is that browser behaviour says so and checks it only
//                       where `native` is true (docs/sift3/DEVICE_CHECKLIST.md lists what a real iPhone must still confirm).
import type { CDPSession, Page } from '@playwright/test';

export interface Finger {
  /** The browser's own touch input drives the page (Chromium). False: pointer events dispatched into the page (WebKit). */
  native: boolean;
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(): Promise<void>;
  tap(x: number, y: number): Promise<void>;
}

// V3_FINGER=pointer forces the WebKit path on Chromium: how that path is exercised where Playwright's WebKit cannot be installed.
const engine = (page: Page) => (process.env.V3_FINGER === 'pointer' ? 'webkit' : page.context().browser()?.browserType().name() ?? 'chromium');

type Op = 'down' | 'move' | 'up';

/** Pointer events of one touch finger, dispatched in the page; the element under the press stays the target until the lift. */
function dispatchFinger({ op, x, y }: { op: Op; x: number; y: number }) {
  const w = window as unknown as { __finger?: { target: Element | null; x: number; y: number } };
  const f = (w.__finger ??= { target: null, x: 0, y: 0 });
  const fire = (type: string, px: number, py: number, buttons: number) => {
    if (!f.target) return;
    f.x = px; f.y = py;
    f.target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, button: 0, buttons, width: 1, height: 1, pressure: buttons ? 0.5 : 0 }));
  };
  if (op === 'down') { f.target = document.elementFromPoint(x, y); fire('pointerdown', x, y, 1); }
  else if (op === 'move') fire('pointermove', x, y, 1);
  else { fire('pointerup', f.x, f.y, 0); f.target = null; }
}

export async function finger(page: Page): Promise<Finger> {
  if (engine(page) === 'chromium') {
    const s: CDPSession = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
      s.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] }).then(() => undefined);
    return {
      native: true,
      down: (x, y) => touch('touchStart', x, y),
      move: (x, y) => touch('touchMove', x, y),
      up: () => touch('touchEnd'),
      tap: async (x, y) => { await touch('touchStart', x, y); await touch('touchEnd'); },
    };
  }
  const send = (op: Op, x = 0, y = 0) => page.evaluate(dispatchFinger, { op, x, y });
  return {
    native: false,
    down: (x, y) => send('down', x, y),
    move: (x, y) => send('move', x, y),
    up: () => send('up'),
    tap: (x, y) => page.touchscreen.tap(x, y),
  };
}
