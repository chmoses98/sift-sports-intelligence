// Wires the score store to the app: today the Live Score Demo is the only provider, and only while the viewer has it switched on.
// A real feed is added here (behind its own flag) and the Demo stays the way to see every state; nothing else changes.
import { ScoreStore } from './store';
import { DemoProvider, type ObservedEvent } from './demo/provider';
import { demoNow, demoState, subscribeDemo } from './demo/state';
import type { LiveScoreProvider, LiveSport } from './types';

let observed: () => ObservedEvent[] = () => [];

const demo = new DemoProvider({
  events: (sport: LiveSport) => observed().filter((e) => e.ref.sport === sport),
  state: demoState,
  now: demoNow,
});

export const scoreStore = new ScoreStore({
  providers: (): LiveScoreProvider[] => (demoState().on ? [demo] : []),
  generation: () => (demoState().on ? `demo:${demoState().epoch}` : 'off'),
  now: demoNow,
});
// The demo provider reads the events the store is showing, so it can only describe games that are on a screen.
observed = () => scoreStore.allObserved();
// A change of mode or scenario is felt at once, not on the next second.
subscribeDemo(() => { void scoreStore.tick(); });
