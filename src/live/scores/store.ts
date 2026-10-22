// The browser-side score store: which events the screens are showing, the provider chain's answers, and one read per event.
// A read is what a screen is allowed to show for that game right now (see scoreView): the matched provider game (or none), its
// freshness, and the sentence a chip may print. Matching is by identity evidence only (identity.ts), never by name similarity.
//
// It is display-only. It imports nothing from the research, opportunity, projection, market or Board layers, and they import
// nothing from it (tests/live/scores-isolation.test.ts), so a score can never change a model input, a signal or a freeze.
import { LiveScoreService, type SportSnapshot } from './service';
import { scoreView } from './freshness';
import { TeamDirectory, canonicalizeGame, pairGames } from './identity';
import type { LiveGame, LiveScoreProvider, LiveScoreView, LiveSport, MatchResult, ObservedEvent } from './types';

export interface ScoreRead {
  /** The matched provider game, or null (not matched, no data, or a refused identity). */
  game: LiveGame | null;
  view: LiveScoreView;
  /** Why the game was or was not matched, for diagnostics. */
  match: MatchResult | null;
  /** The id of the provider whose answer this is (or would be), for the source line. */
  source: string | null;
}

export interface ScoreDiagnostics {
  providers: string[];
  status: Partial<Record<LiveSport, SportSnapshot['status']>>;
  observed: number;
  /** Provider games offered, how many were attached to an event, and how many events were refused (by reason). */
  offered: number;
  matched: number;
  refused: Record<string, number>;
  anomalies: string[];
  /** The newest successful provider answer across the sports on screen (epoch ms), or null if none yet. */
  lastSuccessAt: number | null;
}

export interface StoreOptions {
  /** The chain to ask. Called each refresh, so a mode change takes effect without rebuilding the store. */
  providers: () => LiveScoreProvider[];
  /** Changes whenever the service must start from nothing (demo restarted or switched off). */
  generation: () => string;
  now: () => number;
}

export class ScoreStore {
  private observers = new Map<string, ObservedEvent[]>();
  private service: LiveScoreService;
  private gen: string;
  private reads = new Map<string, ScoreRead>();
  private paired = new Map<LiveSport, { snap: SportSnapshot; key: string; byEvent: Map<string, { game: LiveGame | null; result: MatchResult }> }>();
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private version = 0;
  private diag: ScoreDiagnostics = { providers: [], status: {}, observed: 0, offered: 0, matched: 0, refused: {}, anomalies: [], lastSuccessAt: null };

  constructor(private o: StoreOptions) {
    this.gen = o.generation();
    this.service = this.newService();
  }

  private newService() {
    return new LiveScoreService({ providers: this.o.providers(), now: this.o.now });
  }

  /** Every event any screen is showing right now (the demo provider describes exactly these). */
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

  /** Refresh now, ignoring the provider's minimum interval and any back-off: for a deliberate change (the demo's feed scenario). */
  refreshNow(): Promise<void> {
    this.service.allowNow();
    return this.tick();
  }

  private inflight: Promise<void> | null = null;
  private again = false;

  /**
   * Refresh every sport on screen (the service never polls faster than its provider allows), then recompute the reads. A call made
   * while a refresh is running is not dropped: the refresh runs once more when it finishes, and the returned promise covers both.
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
    if (g !== this.gen) { this.gen = g; this.service = this.newService(); this.paired.clear(); this.reads.clear(); }
    if (typeof document !== 'undefined' && document.hidden) return;
    const sports = [...new Set(this.allObserved().map((e) => e.ref.sport))];
    await Promise.all(sports.map((s) => this.service.refresh(s).catch(() => undefined)));
    this.recompute();
  }

  private recompute() {
    const now = this.o.now();
    const next = new Map<string, ScoreRead>();
    const diag: ScoreDiagnostics = { providers: this.o.providers().map((p) => p.id), status: {}, observed: 0, offered: 0, matched: 0, refused: {}, anomalies: [], lastSuccessAt: null };
    const sports = [...new Set(this.allObserved().map((e) => e.ref.sport))];
    for (const sport of sports) {
      const evs = this.eventsFor(sport);
      const snap = this.service.snapshot(sport);
      diag.status[sport] = snap.status;
      if (snap.lastSuccessAt != null) diag.lastSuccessAt = Math.max(diag.lastSuccessAt ?? 0, snap.lastSuccessAt);
      diag.observed += evs.length;
      diag.offered += snap.games.length;
      diag.anomalies.push(...snap.anomalies.map((a) => `${a.kind}: ${a.detail}`));
      const key = evs.map((e) => e.ref.eventId).join(',');
      let p = this.paired.get(sport);
      if (!p || p.snap !== snap || p.key !== key) {
        const dir = new TeamDirectory(sport, evs.flatMap((e) => [e.home, e.away]));
        const games = snap.games.map((g) => canonicalizeGame(g, dir));
        const by = new Map(pairGames(evs.map((e) => e.ref), games).map((x) => [x.event.eventId, { game: x.game, result: x.result }]));
        p = { snap, key, byEvent: by };
        this.paired.set(sport, p);
      }
      const down = snap.status === 'OUTAGE' || snap.status === 'DISABLED';
      for (const e of evs) {
        const hit = p.byEvent.get(e.ref.eventId);
        const game = hit?.game ?? null;
        if (game) diag.matched++; else if (hit && !hit.result.ok) diag.refused[hit.result.reason] = (diag.refused[hit.result.reason] ?? 0) + 1;
        next.set(e.ref.eventId, {
          game, match: hit?.result ?? null, source: game?.provenance.provider ?? snap.answeredBy ?? this.o.providers()[0]?.id ?? null,
          view: scoreView(game, now, { providerDown: down }),
        });
      }
    }
    this.reads = next;
    this.diag = diag;
    this.version++;
    this.subs.forEach((f) => f());
  }
}
