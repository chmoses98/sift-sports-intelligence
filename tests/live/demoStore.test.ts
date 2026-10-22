import { describe, expect, it } from 'vitest';
import { DemoProvider, type ObservedEvent } from '../../src/live/scores/demo/provider';
import { buildTimeline, fractionAt, kickoffMs, stateAt } from '../../src/live/scores/demo/sim';
import type { DemoScenario, DemoState } from '../../src/live/scores/demo/state';
import { ScoreStore } from '../../src/live/scores/store';
import { teamKey, TeamDirectory } from '../../src/live/scores/identity';
import type { LiveSport } from '../../src/live/scores/types';

const T0 = Date.parse('2030-01-01T12:00:00Z');
const MIN = 60_000;

const TEAMS: Record<string, [string, string][]> = {
  NFL: [['Buffalo Bills', 'BUF'], ['New England Patriots', 'NE'], ['Kansas City Chiefs', 'KC'], ['Washington Commanders', 'WSH']],
  NBA: [['Boston Celtics', 'BOS'], ['Detroit Pistons', 'DET'], ['Golden State Warriors', 'GS'], ['New York Knicks', 'NY']],
  NHL: [['Pittsburgh Penguins', 'PIT'], ['Florida Panthers', 'FLA'], ['Tampa Bay Lightning', 'TB'], ['Boston Bruins', 'BOS']],
  TENNIS: [['Jannik Sinner', 'SIN'], ['Carlos Alcaraz', 'ALC'], ['Novak Djokovic', 'DJO'], ['Taylor Fritz', 'FRI']],
};

/** Events as a screen would hand them over: refs resolved through the publication's own directory. */
function events(sport: LiveSport, n = 2): ObservedEvent[] {
  const teams = TEAMS[sport];
  const dir = new TeamDirectory(sport, teams.map(([name, abbr]) => ({ name, abbr })));
  return Array.from({ length: n }, (_, i) => {
    const [an, aa] = teams[i * 2]; const [hn, ha] = teams[i * 2 + 1];
    const start = new Date(T0 + (i + 1) * 3600_000).toISOString();
    return {
      ref: { eventId: `evt_${sport}_${i}`, sport, startUtc: start, home: { key: dir.resolve({ abbr: ha, name: hn })!, name: hn }, away: { key: dir.resolve({ abbr: aa, name: an })!, name: an } },
      home: { abbr: ha, name: hn }, away: { abbr: aa, name: an },
    };
  });
}

function rig(opts: { scenario?: DemoScenario; gameMinutes?: 2 | 5 | 12 } = {}) {
  let now = T0;
  const st: DemoState = { on: true, scenario: opts.scenario ?? 'normal', gameMinutes: opts.gameMinutes ?? 5, epoch: T0, skewMs: 0, frozenAt: null };
  let evs: ObservedEvent[] = [];
  const provider = new DemoProvider({ events: (s) => evs.filter((e) => e.ref.sport === s), state: () => st, now: () => now });
  const store = new ScoreStore({ providers: () => [provider], generation: () => `demo:${st.epoch}`, now: () => now });
  return {
    st, store,
    show(list: ObservedEvent[]) { evs = list; store.observe('screen', list); },
    async at(ms: number) { now = ms; await store.tick(); },
    get now() { return now; },
  };
}

describe('Live Score Demo through the real identity, freshness and service code', () => {
  it('attaches each simulated game to its own event, and refuses every decoy', async () => {
    for (const sport of ['NFL', 'NBA', 'NHL', 'TENNIS'] as const) {
      const r = rig(); const list = events(sport);
      r.show(list);
      await r.at(T0 + 3 * MIN);
      for (const e of list) {
        const read = r.store.read(e.ref.eventId)!;
        expect(read.game, `${sport} ${e.ref.eventId}`).not.toBeNull();
        expect(read.game!.provenance.providerGameId).toBe(`demo:${e.ref.eventId}`);
        expect(read.game!.provenance.provider).toBe('demo');
        expect(read.game!.provenance.attribution).toMatch(/DEMO/);
        expect(read.demo).toBe(true);
      }
      const d = r.store.diagnostics();
      expect(d.matched).toBe(2);
      expect(d.offered).toBe(4); // two real games plus the two decoys
    }
  });

  it('shows the score the simulation says at that instant, and nothing else', async () => {
    const r = rig(); const list = events('NFL', 1); r.show(list);
    const e = list[0];
    const now = T0 + 2 * MIN;
    await r.at(now);
    const L = 5 * MIN;
    const expected = stateAt(buildTimeline('NFL', e.ref.eventId), fractionAt(now, kickoffMs(e.ref.eventId, T0, L), L), { home: e.home.name, away: e.away.name });
    const got = r.store.read(e.ref.eventId)!;
    expect(got.game!.phase).toBe(expected.phase);
    expect(got.game!.score).toEqual(expected.score);
    expect(got.game!.clock).toEqual(expected.clock);
  });

  it('plays pregame to live to final as the clock advances, and a final stays final', async () => {
    const r = rig(); const list = events('NBA', 1); r.show(list);
    const e = list[0]; const L = 5 * MIN; const k = kickoffMs(e.ref.eventId, T0, L);
    const seen: string[] = [];
    for (let t = k - 2 * MIN; t <= k + L + 2 * MIN; t += 5_000) { await r.at(t); seen.push(r.store.read(e.ref.eventId)!.view.mode); }
    const order = seen.filter((m, i) => m !== seen[i - 1]);
    expect(order[0]).toBe('UNAVAILABLE'); // pregame: nothing to show yet (the screen shows its start time)
    expect(order).toContain('LIVE');
    expect(order[order.length - 1]).toBe('FINAL');
    expect(order.indexOf('LIVE')).toBeLessThan(order.indexOf('FINAL'));
    expect(seen.lastIndexOf('LIVE')).toBeLessThan(seen.indexOf('FINAL'));
  });

  it('delayed: the score is shown with its age and is never called live', async () => {
    const r = rig({ scenario: 'delayed' }); const list = events('NHL'); r.show(list);
    await r.at(T0 + 4 * MIN);
    const modes = list.map((e) => r.store.read(e.ref.eventId)!);
    for (const m of modes.filter((x) => x.game && x.game.phase !== 'FINAL' && x.game.phase !== 'SCHEDULED')) {
      expect(m.view.mode).toBe('DELAYED'); expect(m.view.label).toMatch(/^Updated 1m ago$/);
    }
    expect(modes.some((m) => m.view.mode === 'LIVE')).toBe(false);
  });

  it('stalled: live, then delayed, then stale (last known, no live label) as the demo clock moves on', async () => {
    const r = rig({ scenario: 'stalled' }); const list = events('NBA', 1);
    const e = list[0]; const L = 5 * MIN; const k = kickoffMs(e.ref.eventId, T0, L);
    r.st.frozenAt = k + 0.4 * L; // the feed's last answer was mid-game
    r.show(list);
    await r.at(k + 0.4 * L + 10_000);
    expect(r.store.read(e.ref.eventId)!.view.mode).toBe('LIVE');
    await r.at(k + 0.4 * L + 3 * MIN);
    expect(r.store.read(e.ref.eventId)!.view.mode).toBe('DELAYED');
    await r.at(k + 0.4 * L + 6 * MIN);
    const stale = r.store.read(e.ref.eventId)!;
    expect(stale.view.mode).toBe('LAST_KNOWN');
    expect(stale.view.label).toMatch(/^Last update 6m ago/);
    expect(stale.game!.score).toEqual(stateAt(buildTimeline('NBA', e.ref.eventId), 0.4, { home: '', away: '' }).score); // the same frozen score, never advanced
  });

  it('outage: the last scores stay, aged honestly, with the provider-unavailable note; recovery returns to live', async () => {
    const r = rig(); const list = events('NFL', 1); const e = list[0]; const L = 5 * MIN; const k = kickoffMs(e.ref.eventId, T0, L);
    r.show(list);
    await r.at(k + 0.3 * L);
    const before = r.store.read(e.ref.eventId)!;
    expect(before.view.mode).toBe('LIVE');
    r.st.scenario = 'outage';
    await r.at(k + 0.3 * L + 2 * MIN);
    const down = r.store.read(e.ref.eventId)!;
    expect(down.view.mode).toBe('LAST_KNOWN');
    expect(down.view.label).toMatch(/provider unavailable/);
    expect(down.game!.score).toEqual(before.game!.score);
    expect(down.view.ageMs!).toBeGreaterThan(110_000);
    r.st.scenario = 'normal';
    await r.at(k + 0.3 * L + 4 * MIN);
    expect(r.store.read(e.ref.eventId)!.view.mode).not.toBe('LAST_KNOWN');
  });

  it('outage before any data, and a feed with no games, both say unavailable and never invent a score', async () => {
    for (const scenario of ['outage', 'nodata'] as const) {
      const r = rig({ scenario }); const list = events('NFL'); r.show(list);
      await r.at(T0 + 3 * MIN);
      for (const e of list) {
        const read = r.store.read(e.ref.eventId)!;
        expect(read.game).toBeNull();
        expect(read.view.mode).toBe('UNAVAILABLE');
        expect(read.view.label).toBe('Live — score unavailable');
      }
    }
  });

  it('a deliberate scenario change takes effect at once, even inside an outage back-off', async () => {
    const r = rig(); const list = events('NFL', 1); const e = list[0]; const L = 5 * MIN; const k = kickoffMs(e.ref.eventId, T0, L);
    r.show(list);
    await r.at(k + 0.3 * L);
    r.st.scenario = 'outage';
    await r.at(k + 0.3 * L + 3_000); // the service now backs off for 15 s
    expect(r.store.read(e.ref.eventId)!.game).not.toBeNull();
    r.st.scenario = 'nodata';
    await r.at(k + 0.3 * L + 4_000);
    expect(r.store.read(e.ref.eventId)!.game).not.toBeNull(); // still inside the back-off: a normal tick must not hammer a failing feed
    await r.store.refreshNow();
    expect(r.store.read(e.ref.eventId)!.game).toBeNull();
    expect(r.store.read(e.ref.eventId)!.view.label).toBe('Live — score unavailable');
  });

  it('restarting the demo (a new generation) forgets last-known scores', async () => {
    const r = rig(); const list = events('NFL', 1); const e = list[0]; const L = 5 * MIN; const k = kickoffMs(e.ref.eventId, T0, L);
    r.show(list);
    await r.at(k + 0.5 * L);
    expect(r.store.read(e.ref.eventId)!.game).not.toBeNull();
    r.st.epoch += 1; r.st.scenario = 'outage';
    await r.at(k + 0.5 * L + 30_000);
    expect(r.store.read(e.ref.eventId)!.game).toBeNull();
  });

  it('reads nothing when no provider is switched on (the default): screens show only what the publication says', async () => {
    let now = T0;
    const store = new ScoreStore({ providers: () => [], generation: () => 'off', now: () => now });
    store.observe('screen', events('NFL'));
    now += 5000; await store.tick();
    expect(store.read('evt_NFL_0')).toBeNull();
  });

  it('a name the directory cannot resolve is never matched (WSH resolves, an unknown club does not)', () => {
    const dir = new TeamDirectory('NFL', TEAMS.NFL.map(([name, abbr]) => ({ name, abbr })));
    expect(dir.resolve({ abbr: 'WSH', name: 'Washington Commanders' })).toBe(teamKey('NFL', 'WSH'));
    expect(dir.resolve({ abbr: null, name: 'Springfield Isotopes' })).toBeNull();
  });
});
