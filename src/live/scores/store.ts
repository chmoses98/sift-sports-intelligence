// The browser-side score store: which events the screens are showing, every enabled provider's answers, and one read per event.
// A read is what a screen is allowed to show for that game right now (see scoreView): the matched provider game (or none), its
// freshness, and the sentence a chip may print. Matching is by identity evidence only (identity.ts), never by name similarity.
//
// Providers run independently (each in its own LiveScoreService, so one provider's outage or back-off never holds another's answer).
// For each event the FIRST provider, in the order given, whose feed holds a game that matches it with certainty supplies the read, so
// a feed with explicit permission can be listed ahead of one that has only wider coverage. No provider's games are ever blended.
//
// It is display-only. It imports nothing from the research, opportunity, projection, market or Board layers, and they import
// nothing from it (tests/live/scores-isolation.test.ts), so a score can never change a model input, a signal or a freeze.
import { LiveScoreService, type SnapshotStatus, type SportSnapshot } from './service';
import { scoreView } from './freshness';
import { TeamDirectory, canonicalizeGame, pairGames } from './identity';
import type { LiveGame, LiveScoreProvider, LiveScoreView, LiveSport, MatchResult, ObservedEvent } from './types';

export interface ScoreRead {
  /** The matched provider game, or null (not matched, no data, or a refused identity). */
  game: LiveGame | null;
  view: LiveScoreView;
  /** Why the game was or was not matched, for diagnostics. */
  match: MatchResult | null;
  /** The id of the provider whose answer this is (null when no provider holds the game). */
  source: string | null;
}

export interface ProviderDiagnostics {
  status: Partial<Record<LiveSport, SnapshotStatus>>;
  /** Games the provider listed (for the sports on screen), and how many were attached to an event. */
  offered: number;
  matched: number;
  /** Why events were not matched by this provider, by reason. */
  refused: Record<string, number>;
  lastSuccessAt: number | null;
  lastError: string | null;
}

export interface ScoreDiagnostics {
  providers: string[];
  byProvider: Record<string, ProviderDiagnostics>;
  /** Events on screen, and how many have a read with a game. */
  observed: number;
  matched: number;
  /** The newest successful provider answer across everything (epoch ms), or null if none yet. */
  lastSuccessAt: number | null;
  anomalies: string[];
}

export interface StoreOptions {
  /** The providers to ask, in priority order. Called each refresh, so a mode change takes effect without rebuilding the store. */
  providers: () => LiveScoreProvider[];
  /** Changes whenever the services must start from nothing (a feed switched off and on). */
  generation: () => string;
  now: () => number;
}

type Pairing = Map<string, { game: LiveGame | null; result: MatchResult }>;

export class ScoreStore {
  private observers = new Map<string, ObservedEvent[]>();
  private services = new Map<string, LiveScoreService>();
  private gen: string;
  private reads = new Map<string, ScoreRead>();
  private paired = new Map<string, { snap: SportSnapshot; key: string; byEvent: Pairing }>();
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private version = 0;
  private diag: ScoreDiagnostics = { providers: [], byProvider: {}, observed: 0, matched: 0, lastSuccessAt: null, anomalies: [] };

  constructor(private o: StoreOptions) {
    this.gen = o.generation();
  }

  private service(p: LiveScoreProvider): LiveScoreService {
    let s = this.services.get(p.id);
    if (!s) { s = new LiveScoreService({ providers: [p], now: this.o.now }); this.services.set(p.id, s); }
    return s;
  }

  /** Every event any screen is showing right now (a provider describes, and is matched against, exactly these). */
  allObserved(): ObservedEvent[] {
    const seen = new Map<string, ObservedEvent>();
    for (const list of this.observers.values()) for (const e of list) seen.set(e.ref.eventId, e);
    return [...seen.values()];
  }
  private eventsFor(sport: LiveSport): ObservedEvent[] { return this.allObserved().filter((e) => e.ref.sport === sport); }

  /** Register the events a screen is showing. Replaces that screen's previous set. */
  observe(token: string, evs: ObservedEvent[]) {
    this.observers.set(token, evs);
    this.paired.clear();
    this.start();
    void this.tick();
  }
  release(token: string) {
    this.observers.delete(token);
    this.paired.clear();
    if (!this.observers.size) this.stop();
    this.recompute();
  }

  subscribe = (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  getVersion = () => this.version;
  /** The read for an event, or null when no provider is switched on (screens then show only what the publication says). */
  read(eventId: string): ScoreRead | null { return this.o.providers().length ? this.reads.get(eventId) ?? null : null; }
  diagnostics(): ScoreDiagnostics { return this.diag; }

  private start() { if (!this.timer && this.subs.size + this.observers.size > 0) this.timer = setInterval(() => { void this.tick(); }, 1000); }
  private stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** Refresh now, ignoring every provider's minimum interval and back-off: for a deliberate change (a feed switched on or off). */
  refreshNow(): Promise<void> {
    for (const s of this.services.values()) s.allowNow();
    return this.tick();
  }

  private inflight: Promise<void> | null = null;
  private again = false;

  /**
   * Refresh every provider for the sports on screen (each service never polls faster than its provider allows), then recompute the
   * reads. A call made while a refresh is running is not dropped: the refresh runs once more when it finishes.
   */
  tick(): Promise<void> {
    if (this.inflight) { this.again = true; return this.inflight; }
    this.inflight = (async () => {
      try { do { this.again = false; await this.once(); } while (this.again); } finally { this.inflight = null; }
    })();
    return this.inflight;
  }

  private async once() {
    const g = this.o.generation();
    if (g !== this.gen) { this.gen = g; this.services.clear(); this.paired.clear(); this.reads.clear(); }
    if (typeof document !== 'undefined' && document.hidden) return;
    const sports = [...new Set(this.allObserved().map((e) => e.ref.sport))];
    const jobs: Promise<unknown>[] = [];
    for (const p of this.o.providers()) {
      const svc = this.service(p);
      for (const sport of sports) if (p.sports.includes(sport)) jobs.push(svc.refresh(sport).catch(() => undefined));
    }
    await Promise.all(jobs);
    this.recompute();
  }

  private pairing(p: LiveScoreProvider, sport: LiveSport, evs: ObservedEvent[]): { snap: SportSnapshot; byEvent: Pairing } {
    const snap = this.service(p).snapshot(sport);
    const key = `${p.id}|${sport}`;
    const evKey = evs.map((e) => e.ref.eventId).join(',');
    let hit = this.paired.get(key);
    if (!hit || hit.snap !== snap || hit.key !== evKey) {
      const dir = new TeamDirectory(sport, evs.flatMap((e) => [e.home, e.away]));
      const games = snap.games.map((g) => canonicalizeGame(g, dir));
      const byEvent: Pairing = new Map(pairGames(evs.map((e) => e.ref), games).map((x) => [x.event.eventId, { game: x.game, result: x.result }]));
      hit = { snap, key: evKey, byEvent };
      this.paired.set(key, hit);
    }
    return { snap, byEvent: hit.byEvent };
  }

  private recompute() {
    const now = this.o.now();
    const providers = this.o.providers();
    const next = new Map<string, ScoreRead>();
    const diag: ScoreDiagnostics = { providers: providers.map((p) => p.id), byProvider: {}, observed: 0, matched: 0, lastSuccessAt: null, anomalies: [] };
    for (const p of providers) diag.byProvider[p.id] = { status: {}, offered: 0, matched: 0, refused: {}, lastSuccessAt: null, lastError: null };
    const sports = [...new Set(this.allObserved().map((e) => e.ref.sport))];
    for (const sport of sports) {
      const evs = this.eventsFor(sport);
      diag.observed += evs.length;
      const supporting = providers.filter((p) => p.sports.includes(sport));
      const pairs = supporting.map((p) => ({ p, ...this.pairing(p, sport, evs) }));
      for (const { p, snap, byEvent } of pairs) {
        const d = diag.byProvider[p.id];
        d.status[sport] = snap.status;
        d.offered += snap.games.length;
        if (snap.lastSuccessAt != null) {
          d.lastSuccessAt = Math.max(d.lastSuccessAt ?? 0, snap.lastSuccessAt);
          diag.lastSuccessAt = Math.max(diag.lastSuccessAt ?? 0, snap.lastSuccessAt);
        }
        if (snap.fallback[0]) d.lastError = `${snap.fallback[0].kind}: ${snap.fallback[0].message}`;
        diag.anomalies.push(...snap.anomalies.map((a) => `${p.id} ${a.kind}: ${a.detail}`));
        for (const e of evs) {
          const hit = byEvent.get(e.ref.eventId);
          if (hit?.game) d.matched++;
          else if (hit && !hit.result.ok) d.refused[hit.result.reason] = (d.refused[hit.result.reason] ?? 0) + 1;
        }
      }
      for (const e of evs) {
        // The first provider (in priority order) that holds this game with certainty.
        const chosen = pairs.find(({ byEvent }) => byEvent.get(e.ref.eventId)?.game);
        if (chosen) {
          const hit = chosen.byEvent.get(e.ref.eventId)!;
          const down = chosen.snap.status === 'OUTAGE' || chosen.snap.status === 'DISABLED';
          diag.matched++;
          next.set(e.ref.eventId, { game: hit.game, match: hit.result, source: chosen.p.id, view: scoreView(hit.game, now, { providerDown: down }) });
        } else {
          const first = pairs[0]?.byEvent.get(e.ref.eventId);
          next.set(e.ref.eventId, { game: null, match: first?.result ?? null, source: null, view: scoreView(null, now, { providerDown: pairs.length > 0 && pairs.every((x) => x.snap.status === 'OUTAGE' || x.snap.status === 'DISABLED') }) });
        }
      }
    }
    this.reads = next;
    this.diag = diag;
    this.version++;
    this.subs.forEach((f) => f());
  }
}
