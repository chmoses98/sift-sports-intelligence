// The live-score service: one provider chain per sport, last-known-good retention, and the guards that stop a
// provider glitch from putting a wrong score on a screen. It runs wherever the provider key lives (the relay or a
// publisher), never in the browser: the browser reads the service's normalised snapshot (sift.live_scores/1).
//
// Outage behaviour, in order:
//   1. the first provider that supports the sport and answers wins (its id is `answeredBy`);
//   2. an error moves to the next provider and is recorded as a fallback note, never swallowed;
//   3. every provider failing keeps the last-known-good games with their REAL observation times, so their freshness
//      keeps aging (scoreView turns them into LAST_KNOWN) and status is OUTAGE;
//   4. with no last-known-good the snapshot is empty and screens fall back to the publication's own final result or
//      today's "Live — score unavailable" wording. A score is never invented to fill a gap.
// A kill switch (owner-controlled) disables a provider entirely: the rights position of a feed can change overnight.
import { ScoreProviderError, type LiveGame, type LiveScoreProvider, type LiveSport } from './types';

export type SnapshotStatus = 'OK' | 'DEGRADED' | 'OUTAGE' | 'DISABLED';

export interface FallbackNote { provider: string; kind: string; message: string; at: number }

export interface Anomaly { key: string; kind: 'FINAL_REGRESSION_HELD' | 'SCORE_DECREASED' | 'PERIOD_REGRESSION'; detail: string; at: number }

export interface SportSnapshot {
  sport: LiveSport;
  status: SnapshotStatus;
  games: LiveGame[];
  answeredBy: string | null;
  /** Failures of providers earlier in the chain on the last refresh (empty when the first answered). */
  fallback: FallbackNote[];
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  /** The earliest time the next refresh may run (provider minimum interval, or a 429's Retry-After). */
  nextAllowedAt: number;
  anomalies: Anomaly[];
}

export interface ServiceOptions {
  /** The chain, first = primary. A provider that does not list the sport is skipped for it. */
  providers: LiveScoreProvider[];
  now?: () => number;
  /** Provider ids the owner has switched off (rights, cost, misbehaviour). */
  disabled?: () => ReadonlySet<string>;
}

const gameKey = (g: LiveGame) => `${g.provenance.provider}:${g.provenance.providerGameId}`;
const rank: Record<LiveGame['phase'], number> = { UNKNOWN: -1, SCHEDULED: 0, POSTPONED: 0, CANCELLED: 0, DELAYED: 1, SUSPENDED: 1, LIVE: 1, BREAK: 1, FINAL: 2 };

export class LiveScoreService {
  private snaps = new Map<LiveSport, SportSnapshot>();
  /** A FINAL game that a later observation says is live again: held for one refresh before it is believed. */
  private heldFinals = new Set<string>();
  private now: () => number;

  constructor(private o: ServiceOptions) {
    this.now = o.now ?? Date.now;
  }

  snapshot(sport: LiveSport): SportSnapshot {
    return this.snaps.get(sport) ?? { sport, status: 'OUTAGE', games: [], answeredBy: null, fallback: [], lastAttemptAt: null, lastSuccessAt: null, nextAllowedAt: 0, anomalies: [] };
  }

  /** Apply the regression guards between the previous observation of a game and the new one. */
  private guard(prev: LiveGame | undefined, next: LiveGame, anomalies: Anomaly[]): LiveGame {
    if (!prev) return next;
    const k = gameKey(next);
    const at = this.now();
    if (prev.phase === 'FINAL' && rank[next.phase] < rank.FINAL) {
      if (!this.heldFinals.has(k)) {
        this.heldFinals.add(k);
        anomalies.push({ key: k, kind: 'FINAL_REGRESSION_HELD', detail: `final ${prev.score?.away}-${prev.score?.home} now reads ${next.phase}; held one refresh`, at });
        return prev;
      }
      this.heldFinals.delete(k); // seen twice: believe it (a suspended game that resumed)
      return next;
    }
    this.heldFinals.delete(k);
    if (prev.score && next.score && (next.score.home < prev.score.home || next.score.away < prev.score.away)) {
      anomalies.push({ key: k, kind: 'SCORE_DECREASED', detail: `${prev.score.away}-${prev.score.home} -> ${next.score.away}-${next.score.home}`, at });
    }
    if (prev.clock?.period != null && next.clock?.period != null && next.clock.period < prev.clock.period && next.phase === 'LIVE') {
      anomalies.push({ key: k, kind: 'PERIOD_REGRESSION', detail: `period ${prev.clock.period} -> ${next.clock.period}`, at });
    }
    return next;
  }

  /** Forget every provider's minimum interval and back-off, so the next refresh runs at once (a mode or scenario change, never a retry loop). */
  allowNow() {
    for (const [k, s] of this.snaps) this.snaps.set(k, { ...s, nextAllowedAt: 0 });
  }

  async refresh(sport: LiveSport, signal?: AbortSignal): Promise<SportSnapshot> {
    const t = this.now();
    const prev = this.snapshot(sport);
    if (t < prev.nextAllowedAt) return prev; // never poll faster than the provider can change (or than it asked)
    const off = this.o.disabled?.() ?? new Set<string>();
    const chain = this.o.providers.filter((p) => p.sports.includes(sport));
    const live = chain.filter((p) => !off.has(p.id));
    const fallback: FallbackNote[] = [];
    let nextAllowedAt = t;
    if (!chain.length || !live.length) {
      const s: SportSnapshot = { ...prev, status: 'DISABLED', fallback, lastAttemptAt: t, nextAllowedAt: t + 60_000 };
      this.snaps.set(sport, s);
      return s;
    }
    for (const p of live) {
      try {
        const batch = await p.fetchScoreboard(sport, signal);
        const anomalies: Anomaly[] = [];
        const before = new Map(prev.games.map((g) => [gameKey(g), g]));
        const games = batch.games.map((g) => this.guard(before.get(gameKey(g)), g, anomalies));
        const s: SportSnapshot = {
          sport, status: fallback.length ? 'DEGRADED' : 'OK', games, answeredBy: p.id, fallback, lastAttemptAt: t, lastSuccessAt: t,
          nextAllowedAt: t + Math.min(...live.map((x) => x.minIntervalMs), p.minIntervalMs), anomalies,
        };
        this.snaps.set(sport, s);
        return s;
      } catch (e) {
        const err = e instanceof ScoreProviderError ? e : new ScoreProviderError('network', String(e));
        fallback.push({ provider: p.id, kind: err.kind, message: err.message, at: t });
        if (err.retryAfterMs) nextAllowedAt = Math.max(nextAllowedAt, t + err.retryAfterMs);
      }
    }
    // Every provider failed: keep the last-known-good, honestly aged, and back off (at least 15 s, and at least the slowest provider's own
    // minimum interval, so an outage is never retried faster than the healthy feed is polled).
    const s: SportSnapshot = { ...prev, sport, status: 'OUTAGE', fallback, lastAttemptAt: t, nextAllowedAt: Math.max(nextAllowedAt, t + Math.max(15_000, ...live.map((x) => x.minIntervalMs))), anomalies: [] };
    this.snaps.set(sport, s);
    return s;
  }
}
