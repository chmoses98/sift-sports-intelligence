// A small keyed loader for documents Prop Discovery reads only when a row needs them: a game's availability document, a league ranking.
// Entries are fetched at most once (a failure is retried after a delay), a few at a time, and `ensure(keys, { latest })` drops requests that
// have not started yet and are no longer wanted (a viewer who scrolled on does not wait behind rows that left the screen).
import { useSyncExternalStore } from 'react';

export type BankState<V> = { state: 'loading' } | { state: 'ready'; value: V } | { state: 'none' } | { state: 'error' };

export class LazyBank<V> {
  private entries = new Map<string, BankState<V>>();
  private queue: string[] = [];
  private active = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private errAt = new Map<string, number>();
  /** Documents requested over the session (a measure for tests; the UI never shows it). */
  requested = 0;

  constructor(private fetcher: (key: string) => Promise<V | null>, private concurrency = 3, private retryMs = 30_000) {}

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  get = (key: string): BankState<V> | undefined => this.entries.get(key);
  private bump() { this.version++; this.listeners.forEach((l) => l()); }

  /** Queue the keys that are neither held nor in flight. With `latest`, keys still waiting that are not in this call are forgotten. Returns how many were queued. */
  ensure(keys: string[], o: { latest?: boolean } = {}): number {
    const want = new Set(keys);
    let changed = false;
    if (o.latest && this.queue.length) {
      const keep: string[] = [];
      for (const k of this.queue) { if (want.has(k)) keep.push(k); else { this.entries.delete(k); changed = true; } }
      this.queue = keep;
    }
    let n = 0;
    for (const k of want) {
      const cur = this.entries.get(k);
      if (cur && !(cur.state === 'error' && Date.now() - (this.errAt.get(k) ?? 0) > this.retryMs)) continue;
      this.entries.set(k, { state: 'loading' });
      this.queue.push(k);
      this.requested++;
      n++;
    }
    if (n || changed) { this.bump(); this.pump(); }
    return n;
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const k = this.queue.shift()!;
      this.active++;
      this.fetcher(k).then(
        (v) => this.entries.set(k, v == null ? { state: 'none' } : { state: 'ready', value: v }),
        () => { this.entries.set(k, { state: 'error' }); this.errAt.set(k, Date.now()); },
      ).finally(() => { this.active--; this.bump(); this.pump(); });
    }
  }

  /** Tests only. */
  reset() { this.entries.clear(); this.errAt.clear(); this.queue = []; this.requested = 0; this.bump(); }
}

/** Re-render when anything in the bank changes; returns the version (a memo key for values derived from the bank). */
export function useBankVersion(bank: { subscribe: (fn: () => void) => () => void; getVersion: () => number }): number {
  return useSyncExternalStore(bank.subscribe, bank.getVersion, bank.getVersion);
}
