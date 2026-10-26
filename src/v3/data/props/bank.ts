// The History bank: player game logs, fetched on demand and kept for the session. Prop Discovery never reads every player's log up front:
// a log is requested only for a row that is on screen (or expanded), for the players of a shelf, or when the viewer explicitly asks
// History to rank or filter the whole list. A log already held (the same player, any statistic, any game) is never fetched twice.
import { useSyncExternalStore } from 'react';
import { readBoxLog, type BoxRow } from '../../../history/boxLog';
import { playerHistory } from '../../../history/load';
import { SportRepo } from '../../../data/repo';
import { resolveSource } from '../../../data/source';
import { sportBySlug } from '../../../data/sports';
import { demoLogFor } from '../../demo/props';
import type { PlayerLog } from './history';
import type { HistorySpec, Prop } from './types';

export type BankEntry = { state: 'loading' } | { state: 'ready'; log: PlayerLog } | { state: 'none' } | { state: 'error' };

export interface LogRef { key: string; slug: string; kind: 'nfl' | 'nhl'; id: string }

/** The log a prop reads, or null when its statistic has no log in this sport (baseball) or the contract names no player id. */
export function logRefOf(p: Pick<Prop, 'slug' | 'histId' | 'history'>): LogRef | null {
  const h: HistorySpec | null = p.history;
  if (!h || !p.histId) return null;
  return { key: `${h.kind}:${p.histId}`, slug: p.slug, kind: h.kind, id: p.histId };
}

export type LogFetcher = (ref: LogRef) => Promise<PlayerLog | null>;

/** The published logs: the NFL history layer (same-origin, one small file per player) and the NHL player profile's game log. */
export const publishedLog: LogFetcher = async (ref) => {
  // Sample mode: a deterministic sample log (ids are `sample-…~statistic~mean`), never a network request.
  if (ref.id.startsWith('sample-') && ref.id.includes('~')) { const [id, col, mu] = ref.id.split('~'); return demoLogFor(id, col, Number(mu)); }
  if (ref.kind === 'nfl') {
    const doc = await playerHistory(ref.id);
    return doc ? { kind: 'nfl', doc } : null;
  }
  const sport = sportBySlug(ref.slug);
  if (!sport) return null;
  const repo = new SportRepo(await resolveSource(sport));
  if (!repo.hasExplorer) return null;
  const prof = await repo.profile(ref.id);
  const rows: BoxRow[] | null = readBoxLog((prof.extensions as { game_log?: unknown } | null)?.game_log);
  return rows ? { kind: 'nhl', rows } : null;
};

const CONCURRENCY = 6;
const RETRY_MS = 30_000;

export class HistoryBank {
  private entries = new Map<string, BankEntry>();
  private queue: LogRef[] = [];
  private active = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private errAt = new Map<string, number>();
  /** Logs requested over the session (a measure for tests and the report; the UI never shows it). */
  requested = 0;

  constructor(private fetcher: LogFetcher = publishedLog) {}

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  get = (key: string): BankEntry | undefined => this.entries.get(key);
  private bump() { this.version++; this.listeners.forEach((l) => l()); }

  /** Queue the logs that are not held or in flight. Returns how many were newly queued. */
  ensure(refs: LogRef[]): number {
    let n = 0;
    for (const r of refs) {
      const cur = this.entries.get(r.key);
      // A failed log is retried once the retry delay has passed (a flaky connection must not poison the session).
      if (cur && !(cur.state === 'error' && Date.now() - (this.errAt.get(r.key) ?? 0) > RETRY_MS)) continue;
      this.entries.set(r.key, { state: 'loading' });
      this.queue.push(r);
      this.requested++;
      n++;
    }
    if (n) { this.bump(); this.pump(); }
    return n;
  }

  /** How many of these refs are not yet held (what an explicit "load history for all" would cost, in documents). */
  missing(refs: LogRef[]): number {
    return new Set(refs.filter((r) => !this.entries.has(r.key)).map((r) => r.key)).size;
  }

  /** How many of these refs are still on their way. */
  pending(refs: LogRef[]): number {
    return new Set(refs.filter((r) => this.entries.get(r.key)?.state === 'loading').map((r) => r.key)).size;
  }

  private pump() {
    while (this.active < CONCURRENCY && this.queue.length) {
      const r = this.queue.shift()!;
      this.active++;
      this.fetcher(r).then(
        (log) => this.entries.set(r.key, log ? { state: 'ready', log } : { state: 'none' }),
        () => { this.entries.set(r.key, { state: 'error' }); this.errAt.set(r.key, Date.now()); },
      ).finally(() => { this.active--; this.bump(); this.pump(); });
    }
  }

  /** Tests only. */
  reset() { this.entries.clear(); this.errAt.clear(); this.queue = []; this.requested = 0; this.bump(); }
}

export const historyBank = new HistoryBank();

/** Re-render when any log arrives. */
export function useHistoryBank(bank: HistoryBank = historyBank): HistoryBank {
  useSyncExternalStore(bank.subscribe, bank.getVersion, bank.getVersion);
  return bank;
}
