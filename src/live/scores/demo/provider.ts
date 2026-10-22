// The Live Score Demo as an ordinary score PROVIDER: it answers `fetchScoreboard(sport)` with games in the provider-independent
// contract, exactly as a real feed will, so the identity matching, freshness rules, outage handling and screens above it are the
// code that will run on real scores. Replace this one adapter with a real one and nothing above it changes.
//
// It simulates what a feed really does: answer fast, answer late, stop changing, fail, or know nothing; and it deliberately
// includes games that are NOT the event on screen (the same teams a day later, a reversed pairing) so the matcher is exercised
// on every refresh. Every game it emits says `provider: 'demo'` and carries a DEMO attribution.
import { ScoreProviderError, LIVE_SPORTS, type LiveGame, type LiveScoreProvider, type LiveSport, type ProviderBatch, type SiftEventRef } from '../types';
import { teamKey } from '../identity';
import { buildTimeline, fractionAt, kickoffMs, stateAt } from './sim';
import type { DemoState } from './state';

export interface ObservedTeam { abbr: string | null; name: string }
/** A SIFT event the screens are showing, with its teams as the publication names them. */
export interface ObservedEvent { ref: SiftEventRef; home: ObservedTeam; away: ObservedTeam }

export const DEMO_PROVIDER_ID = 'demo';
export const DEMO_ATTRIBUTION = 'DEMO · simulated, not a real game';
/** How far behind the "delayed" feed runs. Inside the 5-minute window, past the 60-second live one. */
export const DEMO_DELAY_MS = 75_000;

const team = (sport: LiveSport, t: ObservedTeam) => ({ key: teamKey(sport, t.name), name: t.name, abbr: t.abbr, providerTeamId: null });

export class DemoProvider implements LiveScoreProvider {
  readonly id = DEMO_PROVIDER_ID;
  readonly label = 'Live Score Demo (simulated)';
  readonly minIntervalMs = 2000;
  readonly sports = LIVE_SPORTS;

  constructor(private o: { events: (sport: LiveSport) => ObservedEvent[]; state: () => DemoState; now: () => number }) {}

  async fetchScoreboard(sport: LiveSport): Promise<ProviderBatch> {
    const st = this.o.state();
    const now = this.o.now();
    const fetchedAt = new Date(now).toISOString();
    if (st.scenario === 'outage') throw new ScoreProviderError('network', 'The demo feed is down (simulated outage)');
    if (st.scenario === 'nodata') return { provider: this.id, games: [], fetchedAt };
    // The instant the feed's answer was true: now, a little earlier (delayed), or frozen (stalled).
    const at = st.scenario === 'delayed' ? now - DEMO_DELAY_MS : st.scenario === 'stalled' ? (st.frozenAt ?? now) : now;
    const L = st.gameMinutes * 60_000;
    const evs = this.o.events(sport);
    const games: LiveGame[] = evs.map((e) => {
      const tl = buildTimeline(sport, e.ref.eventId);
      const s = stateAt(tl, fractionAt(at, kickoffMs(e.ref.eventId, st.epoch, L), L), { home: e.home.name, away: e.away.name });
      return {
        schema: 'sift.live_game/1', sport, league: 'DEMO', startUtc: e.ref.startUtc,
        home: team(sport, e.home), away: team(sport, e.away),
        phase: s.phase, rawStatus: s.phase === 'SCHEDULED' ? 'pre' : s.phase === 'FINAL' ? 'post' : 'in',
        score: s.score, clock: s.clock, situation: s.situation, recentPlays: s.plays,
        provenance: { provider: this.id, providerGameId: `demo:${e.ref.eventId}`, providerUpdatedAt: new Date(at).toISOString(), fetchedAt, attribution: DEMO_ATTRIBUTION },
      };
    });
    // Games that are not any event on screen. A correct matcher refuses every one.
    const [a, b] = evs;
    const stamp = { providerUpdatedAt: new Date(at).toISOString(), fetchedAt, attribution: DEMO_ATTRIBUTION, provider: this.id };
    if (a) games.push({ ...games[0], startUtc: new Date(Date.parse(a.ref.startUtc) + 24 * 3600_000).toISOString(), phase: 'LIVE', score: { home: 88, away: 87 }, provenance: { ...stamp, providerGameId: 'demo-decoy:next-day' } });
    if (b) games.push({ ...games[1], home: games[1].away, away: games[1].home, phase: 'LIVE', score: { home: 77, away: 76 }, provenance: { ...stamp, providerGameId: 'demo-decoy:reversed' } });
    return { provider: this.id, games, fetchedAt };
  }
}
