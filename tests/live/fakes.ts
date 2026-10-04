// Deterministic doubles for the live-quote store: a provider whose prices the test controls and that
// records every call, a manual clock + timer queue, and a controllable visibility/online environment.
import type { Env, Timers } from '../../src/live/store';
import { ProviderError, type Availability, type LiveQuote, type ProviderResult, type QuoteProvider } from '../../src/live/types';

export class FakeClock implements Timers {
  t: number;
  private q: { at: number; fn: () => void; id: number }[] = [];
  private id = 1;
  constructor(start = Date.parse('2026-10-04T16:00:00Z')) {
    this.t = start;
  }
  now = () => this.t;
  set = (fn: () => void, ms: number) => {
    const id = this.id++;
    this.q.push({ at: this.t + Math.max(0, ms), fn, id });
    return id;
  };
  clear = (h: unknown) => {
    this.q = this.q.filter((x) => x.id !== h);
  };
  /** Advance time, running due timers in order (and awaiting the microtasks they start). */
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
    await flush();
  }
  pending() {
    return this.q.length;
  }
}

export async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export class FakeEnv implements Env {
  visible = true;
  online = true;
  private cbs = new Set<() => void>();
  isVisible = () => this.visible;
  isOnline = () => this.online;
  onChange = (cb: () => void) => {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  };
  set(v: { visible?: boolean; online?: boolean }) {
    if (v.visible != null) this.visible = v.visible;
    if (v.online != null) this.online = v.online;
    for (const cb of this.cbs) cb();
  }
}

export interface Call {
  kind: 'tickers' | 'events';
  ids: string[];
  at: number;
}

export function quote(ticker: string, yesBid: number, observedAt: string | number, extra: Partial<LiveQuote> = {}): LiveQuote {
  return {
    ticker, eventTicker: ticker.split('-').slice(0, 2).join('-'), seriesTicker: ticker.split('-')[0],
    yesBid, yesAsk: yesBid + 0.02, noBid: 1 - yesBid - 0.02, noAsk: 1 - yesBid, lastPrice: yesBid, volume: 100, openInterest: 50,
    availability: 'OPEN', rawStatus: 'active', closeTime: null, observedAt: new Date(observedAt).toISOString(), source: 'fake',
    title: null, yesSubTitle: null, strike: null, ...extra,
  };
}

export class FakeProvider implements QuoteProvider {
  readonly id = 'fake';
  readonly label = 'Fake provider';
  maxBatch = 100;
  minIntervalMs = 0;
  calls: Call[] = [];
  prices = new Map<string, number>();
  status = new Map<string, Availability>();
  /** Tickers listed under each event (inventory). */
  events = new Map<string, string[]>();
  failWith: ProviderError | null = null;
  /** Resolve after this many ms of the fake clock (a slow provider); null = immediately. */
  delayMs: number | null = null;
  constructor(private clock: FakeClock) {}

  private wait(signal?: AbortSignal) {
    if (this.delayMs == null) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const h = this.clock.set(resolve, this.delayMs!);
      signal?.addEventListener('abort', () => {
        this.clock.clear(h);
        reject(new ProviderError('aborted', 'aborted'));
      });
    });
  }

  private answer(tickers: string[]): ProviderResult {
    const quotes = tickers.filter((t) => this.prices.has(t)).map((t) => quote(t, this.prices.get(t)!, this.clock.now(), { availability: this.status.get(t) ?? 'OPEN' }));
    return { quotes, missing: tickers.filter((t) => !this.prices.has(t)), requests: 1, latencyMs: 0 };
  }

  async fetchQuotes(tickers: string[], signal?: AbortSignal): Promise<ProviderResult> {
    this.calls.push({ kind: 'tickers', ids: [...tickers], at: this.clock.now() });
    await this.wait(signal);
    if (this.failWith) throw this.failWith;
    return this.answer(tickers);
  }

  async fetchEventMarkets(events: string[], signal?: AbortSignal): Promise<ProviderResult> {
    this.calls.push({ kind: 'events', ids: [...events], at: this.clock.now() });
    await this.wait(signal);
    if (this.failWith) throw this.failWith;
    const r = this.answer(events.flatMap((e) => this.events.get(e) ?? []));
    return { ...r, missing: [] };
  }

  tickerCalls() {
    return this.calls.filter((c) => c.kind === 'tickers');
  }
}
