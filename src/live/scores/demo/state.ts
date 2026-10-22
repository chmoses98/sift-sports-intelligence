// The Live Score Demo's own state: whether the viewer has switched it on, which feed behaviour is being simulated, how long a
// demo game lasts, and a demo clock. It is device-local (localStorage), opt-in and off by default; turning it off removes every
// simulated score from every screen at once. It stores nothing but these few fields and never touches research, quotes or the Board.
import { useSyncExternalStore } from 'react';

export type DemoScenario = 'normal' | 'delayed' | 'stalled' | 'outage' | 'nodata';
export const DEMO_SCENARIOS: { id: DemoScenario; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'The feed answers every couple of seconds.' },
  { id: 'delayed', label: 'Delayed', hint: 'The feed runs about 75 seconds behind: scores show with their age and never say live.' },
  { id: 'stalled', label: 'Stalled', hint: 'The feed answers but stops changing. Use Skip ahead to watch it age to stale.' },
  { id: 'outage', label: 'Outage', hint: 'The feed fails. The last scores stay, with their real age and a provider-unavailable note.' },
  { id: 'nodata', label: 'No data', hint: 'The feed has no games: screens fall back to "score unavailable".' },
];

export interface DemoState {
  on: boolean;
  scenario: DemoScenario;
  /** How long one simulated game takes, in minutes of real time. */
  gameMinutes: 2 | 5 | 12;
  /** The demo clock reading when the demo was (re)started. Kickoffs are spread around it. */
  epoch: number;
  /** Added to the real clock to make the demo clock: "Skip ahead" moves it, and every demo age moves with it. */
  skewMs: number;
  /** For the stalled feed: the demo time its last answer was true. */
  frozenAt: number | null;
}

const KEY = 'sift.v4.livedemo';
const OFF: DemoState = { on: false, scenario: 'normal', gameMinutes: 5, epoch: 0, skewMs: 0, frozenAt: null };

const read = (): DemoState => {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DemoState> | null;
    if (!j || j.on !== true) return OFF;
    const scenario = DEMO_SCENARIOS.some((s) => s.id === j.scenario) ? (j.scenario as DemoScenario) : 'normal';
    const gameMinutes = j.gameMinutes === 2 || j.gameMinutes === 12 ? j.gameMinutes : 5;
    const skewMs = Number.isFinite(j.skewMs) ? (j.skewMs as number) : 0;
    const epoch = Number.isFinite(j.epoch) ? (j.epoch as number) : Date.now() + skewMs;
    const st: DemoState = { on: true, scenario, gameMinutes, epoch, skewMs, frozenAt: Number.isFinite(j.frozenAt) ? (j.frozenAt as number) : null };
    // A demo left running for a long time has finished every game: start it afresh so the slate is alive again.
    if (Date.now() + skewMs - epoch > gameMinutes * 60_000 * 2.6) return { ...st, epoch: Date.now() + skewMs, frozenAt: scenario === 'stalled' ? Date.now() + skewMs : null };
    return st;
  } catch { return OFF; }
};

let state: DemoState = read();
const subs = new Set<() => void>();
const set = (next: DemoState) => {
  state = next;
  try { if (next.on) localStorage.setItem(KEY, JSON.stringify(next)); else localStorage.removeItem(KEY); } catch { /* the choice lasts for this page view only */ }
  subs.forEach((f) => f());
};

export const demoState = () => state;
/** The demo clock: real time plus any "skip ahead". All demo ages and kickoffs are measured on it. */
export const demoNow = () => Date.now() + state.skewMs;
export const demoLengthMs = () => state.gameMinutes * 60_000;

export const enableDemo = () => set({ ...OFF, on: true, epoch: Date.now() });
export const disableDemo = () => set(OFF);
export const restartDemo = () => set({ ...state, epoch: demoNow(), frozenAt: state.scenario === 'stalled' ? demoNow() : null });
export const setScenario = (scenario: DemoScenario) => set({ ...state, scenario, frozenAt: scenario === 'stalled' ? demoNow() : null });
export const setGameMinutes = (gameMinutes: 2 | 5 | 12) => set({ ...state, gameMinutes, epoch: demoNow(), frozenAt: state.scenario === 'stalled' ? demoNow() : null });
export const skipAhead = (ms: number) => set({ ...state, skewMs: state.skewMs + ms });

export function subscribeDemo(cb: () => void): () => void {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) { state = read(); cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
}
export const useDemoState = (): DemoState => useSyncExternalStore(subscribeDemo, demoState, () => OFF);

/** For tests: forget the in-memory state and re-read storage. */
export function __reloadDemoState() { state = read(); subs.forEach((f) => f()); }
