// Wires the score store to the app. The chain is one provider today (ESPN's public scoreboard, read by this device), and only while the
// viewer has live scores switched on. Replacing it with a licensed professional feed later means writing one adapter and changing the
// list below: the contract, identity matching, freshness rules, store and screens do not change.
import { ScoreStore } from './store';
import { espnProvider } from './providers/espn';
import { feedEnabled, subscribeFeed } from './feed';
import type { LiveScoreProvider } from './types';

const espn = espnProvider();

export const scoreStore: ScoreStore = new ScoreStore({
  providers: (): LiveScoreProvider[] => (feedEnabled() ? [espn] : []),
  generation: () => (feedEnabled() ? 'on' : 'off'),
  now: Date.now,
});
// Turning the feed on or off is felt at once, not on the next second.
subscribeFeed(() => { void scoreStore.refreshNow(); });
