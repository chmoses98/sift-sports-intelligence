// Wires the score store to the app. Providers are listed in priority order: for each game the first one that holds it with certainty
// supplies the score. Today there is one, SportScore, whose own terms cover this use. Replacing it with a licensed professional feed
// later means writing one adapter and changing the list below: the contract, identity matching, freshness rules, store and screens do not change.
import { ScoreStore } from './store';
import { sportscoreProvider } from './providers/sportscore';
import { feedEnabled, subscribeFeed } from './feed';
import type { LiveScoreProvider, LiveSport } from './types';

const forSport = (sport: LiveSport) => scoreStore.allObserved().filter((e) => e.ref.sport === sport);
const sportscore = sportscoreProvider({ events: forSport });

export const scoreStore: ScoreStore = new ScoreStore({
  providers: (): LiveScoreProvider[] => (feedEnabled() ? [sportscore] : []),
  generation: () => (feedEnabled() ? 'on' : 'off'),
  now: Date.now,
});
// Turning the feed on or off is felt at once, not on the next second.
subscribeFeed(() => { void scoreStore.refreshNow(); });
