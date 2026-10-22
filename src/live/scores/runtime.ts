// Wires the score store to the app. Providers are listed in priority order: for each game the first one that holds it with certainty
// supplies the score. A feed whose own terms cover this use comes first; ESPN's unofficial scoreboard (wider coverage, no permission
// for automated access) only if the viewer has separately turned it on. Replacing any of them with a licensed professional feed later
// means writing one adapter and changing the list below: the contract, identity matching, freshness rules, store and screens do not change.
import { ScoreStore } from './store';
import { espnProvider } from './providers/espn';
import { sportscoreProvider } from './providers/sportscore';
import { espnEnabled, feedEnabled, subscribeFeed } from './feed';
import type { LiveScoreProvider, LiveSport } from './types';

const forSport = (sport: LiveSport) => scoreStore.allObserved().filter((e) => e.ref.sport === sport);
const sportscore = sportscoreProvider({ events: forSport });
const espn = espnProvider({ events: forSport });

export const scoreStore: ScoreStore = new ScoreStore({
  providers: (): LiveScoreProvider[] => (feedEnabled() ? (espnEnabled() ? [sportscore, espn] : [sportscore]) : []),
  generation: () => (feedEnabled() ? (espnEnabled() ? 'on+espn' : 'on') : 'off'),
  now: Date.now,
});
// Turning a feed on or off is felt at once, not on the next second.
subscribeFeed(() => { void scoreStore.refreshNow(); });
