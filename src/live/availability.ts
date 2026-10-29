// Reliable price availability (internal diagnostics ONLY: nothing here is ever rendered to a user).
//
// Every time a screen renders a price slot it records: which context applied (src/live/quoteUsable.ts),
// whether a quote within that context's maximum age was available, which provider the quote came from
// and how old its observation was. The meter reports availability % per context and per provider plus
// the median and 95th-percentile observation age at render. The target is set after the first measured
// week (docs/sift3/QUOTE_DELIVERY.md).
//
// Memory is bounded: counts are exact; ages are kept in a ring of the last `ageWindow` samples per
// bucket, so percentiles describe recent renders.
import type { ContextKey } from './quoteUsable';

/** Provider label when no quote existed for the slot at all. */
export const NO_PROVIDER = 'none';

export interface RenderSample {
  context: ContextKey;
  usable: boolean;
  /** The quote's source ("kalshi-relay", "quote-feed", "publication"), or NO_PROVIDER. */
  provider: string;
  /** Observation age at render; null when the quote had no believable timestamp. */
  ageMs: number | null;
  /**
   * The provider positively reported the market as not tradable (closed, settled, ...): the withheld ask is correct, not
   * a delivery failure, so the render is counted apart and is NOT part of renders / usable / the availability percentage.
   */
  nonTradable?: boolean;
}

export interface AvailabilityRow {
  /** null = all contexts. */
  context: ContextKey | null;
  /** null = all providers. */
  provider: string | null;
  renders: number;
  usable: number;
  /** Renders of markets reported not tradable (excluded from renders and usable). */
  nonTradable: number;
  /** usable / renders * 100, one decimal; null with no renders. */
  availabilityPct: number | null;
  p50AgeMs: number | null;
  p95AgeMs: number | null;
}

interface Bucket {
  renders: number;
  usable: number;
  nonTradable: number;
  ages: number[];
  next: number;
}

/** Nearest-rank percentile (p in 0..100) of unsorted values; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

export class AvailabilityMeter {
  private buckets = new Map<string, Bucket>();
  private total = 0;

  constructor(private ageWindow = 500, private maxBuckets = 200) {}

  private bucket(context: ContextKey, provider: string): Bucket {
    let key = `${context}|${provider}`;
    let b = this.buckets.get(key);
    if (!b) {
      // Context x provider is a small closed set; the cap is a guard against a provider-id explosion.
      if (this.buckets.size >= this.maxBuckets) key = `${context}|other`;
      b = this.buckets.get(key);
    }
    if (!b) {
      b = { renders: 0, usable: 0, nonTradable: 0, ages: [], next: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  private add(b: Bucket, s: RenderSample) {
    if (s.nonTradable) {
      b.nonTradable++;
      return;
    }
    b.renders++;
    if (s.usable) b.usable++;
    if (s.ageMs != null) {
      if (b.ages.length < this.ageWindow) b.ages.push(s.ageMs);
      else {
        b.ages[b.next] = s.ageMs;
        b.next = (b.next + 1) % this.ageWindow;
      }
    }
  }

  record(s: RenderSample): void {
    if (!s.nonTradable) this.total++;
    this.add(this.bucket(s.context, s.provider), s);
  }

  get renders(): number {
    return this.total;
  }

  reset(): void {
    this.buckets.clear();
    this.total = 0;
  }

  /**
   * Rows for every (context, provider) seen, then per context, then per provider, then the overall row.
   * Context-level rows cover all providers (including `none`, a slot with no quote at all).
   */
  report(): { overall: AvailabilityRow; byContext: AvailabilityRow[]; byProvider: AvailabilityRow[]; byContextProvider: AvailabilityRow[] } {
    const entries = [...this.buckets].map(([k, b]) => {
      const [context, provider] = k.split('|') as [ContextKey, string];
      return { context, provider, b };
    });
    const merge = (sel: (e: (typeof entries)[number]) => boolean, context: ContextKey | null, provider: string | null): AvailabilityRow => {
      let renders = 0;
      let usable = 0;
      let nonTradable = 0;
      const ages: number[] = [];
      for (const e of entries.filter(sel)) {
        renders += e.b.renders;
        usable += e.b.usable;
        nonTradable += e.b.nonTradable;
        ages.push(...e.b.ages);
      }
      return {
        context, provider, renders, usable, nonTradable,
        availabilityPct: renders ? Math.round((usable / renders) * 1000) / 10 : null,
        p50AgeMs: percentile(ages, 50),
        p95AgeMs: percentile(ages, 95),
      };
    };
    const contexts = [...new Set(entries.map((e) => e.context))].sort();
    const providers = [...new Set(entries.map((e) => e.provider))].sort();
    return {
      overall: merge(() => true, null, null),
      byContext: contexts.map((c) => merge((e) => e.context === c, c, null)),
      byProvider: providers.map((p) => merge((e) => e.provider === p, null, p)),
      byContextProvider: entries
        .map((e) => merge((x) => x.context === e.context && x.provider === e.provider, e.context, e.provider))
        .sort((a, b) => `${a.context}|${a.provider}`.localeCompare(`${b.context}|${b.provider}`)),
    };
  }
}
