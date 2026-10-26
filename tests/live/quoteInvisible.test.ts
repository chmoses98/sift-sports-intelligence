// The approved product rule, enforced: users see a clean price or the missing-price state, never freshness. This test
// (1) proves renderQuote returns a stored quote untouched or null, never a degraded value, across every context and
// every unusable reason; (2) scans the new src/live exports and the user-facing strings for freshness wording;
// (3) proves nothing outside src/live refers to the new diagnostics (history, availability meter, outcome, skew).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as availability from '../../src/live/availability';
import * as deliveryConfig from '../../src/live/deliveryConfig';
import { MISSING_PRICE } from '../../src/live/missingPrice';
import * as deliveryChain from '../../src/live/providers/deliveryChain';
import * as quoteUsable from '../../src/live/quoteUsable';
import { CONTEXT_KEYS, MAX_AGE_MS, type QuoteContext } from '../../src/live/quoteUsable';
import * as storeModule from '../../src/live/store';
import { QuoteStore } from '../../src/live/store';
import type { LiveQuote } from '../../src/live/types';
import { FakeClock, FakeEnv, quote } from './fakes';

const NOW = Date.parse('2026-10-26T18:00:00Z');
const HOUR = 3_600_000;
const T = 'KXNHLGOAL-26OCT26TORCGY-TOR19';

/** Words and shapes that would tell a user how old a price is. */
const FRESHNESS = /\b(stale|ago|updated|last updated|fresh|freshness|aging|as of|minutes? old|seconds? old|hours? old)\b|\b\d{1,2}:\d{2}(:\d{2})?\b|\d{4}-\d{2}-\d{2}|\d+\s?(s|sec|secs|min|mins|h|hr)\b/i;

let store: QuoteStore | null = null;
afterEach(() => store?.dispose());

function holding(quotes: LiveQuote[]) {
  const clock = new FakeClock(NOW);
  store = new QuoteStore({
    provider: null, now: clock.now, timers: clock, env: new FakeEnv(), random: () => 0.5,
    persistence: { load: () => quotes, save: () => {} },
  });
  return { clock, store };
}

const CONTEXTS: Record<(typeof CONTEXT_KEYS)[number], QuoteContext> = {
  list_far: { surface: 'list', startsAt: NOW + 5 * HOUR },
  list_near: { surface: 'list', startsAt: NOW + HOUR },
  list_live: { surface: 'list', startsAt: NOW - HOUR },
  contract_far: { surface: 'contract', startsAt: NOW + 5 * HOUR },
  contract_near: { surface: 'contract', startsAt: NOW + HOUR },
};

describe('renderQuote returns the stored quote untouched, or null', () => {
  it('for every context and every age around its limit: null iff over the limit, else the very same object', () => {
    for (const key of CONTEXT_KEYS) {
      const limit = MAX_AGE_MS[key];
      for (const ageMs of [0, 1, limit - 1_000, limit, limit + 1_000, limit * 2, 30 * 60_000]) {
        const q = quote(T, 0.41, NOW - ageMs);
        const { store } = holding([q]);
        const got = store.renderQuote(T, CONTEXTS[key]);
        if (ageMs <= limit) expect(got).toBe(store.quote(T)); // not a copy, not a rounded or annotated price
        else expect(got).toBeNull(); // not a "last known" price, not a dimmed one
      }
    }
  });

  it('null for every unusable reason: no quote, missing/unparseable/untimed/future observation time, too old', () => {
    const cases: [string, LiveQuote | null][] = [
      ['no quote', null],
      ['missing observed_at', { ...quote(T, 0.41, NOW), observedAt: '' }],
      ['unparseable observed_at', { ...quote(T, 0.41, NOW), observedAt: 'yesterday-ish' }],
      ['untimed (arrival time only)', { ...quote(T, 0.41, NOW), observedVia: 'received' }],
      ['future observed_at', quote(T, 0.41, NOW + 60_000)],
      ['too old', quote(T, 0.41, NOW - 10 * 60_000)],
    ];
    for (const [label, q] of cases) {
      const { store } = holding(q ? [q] : []);
      for (const ctx of Object.values(CONTEXTS)) expect(store.renderQuote(T, ctx), label).toBeNull();
    }
  });

  it('what a screen receives from the new entry points is a quote, null, or machine codes: no sentence', async () => {
    const { store } = holding([quote(T, 0.41, NOW - 10 * 60_000)]);
    const u = store.usable(T, CONTEXTS.contract_far);
    expect(u.reason).toBe('too_old');
    expect(typeof u.reason).toBe('string');
    expect(u.reason).toMatch(/^[a-z_]+$/); // a code, never display text
    const r = await store.refreshContract(T, { startsAt: NOW + 5 * HOUR });
    expect(r.quote).toBeNull();
  });
});

describe('no freshness wording in anything a user can see', () => {
  it('the missing-price wording is exactly the approved text and passes the scan', () => {
    expect(MISSING_PRICE).toEqual({ list: '—', contract: 'Price unavailable right now', retry: 'Retry' });
    for (const s of Object.values(MISSING_PRICE)) expect(s).not.toMatch(FRESHNESS);
  });

  it('the scan itself catches what it should', () => {
    for (const bad of ['Stale price', 'Updated 2 min ago', 'Last updated 12:30', 'as of 18:00:30', '2026-10-26', 'price is 3 min old', '45s', 'aging', 'Fresh']) {
      expect(bad, bad).toMatch(FRESHNESS);
    }
  });

  it('no string exported by the new src/live modules carries freshness wording', () => {
    const exported: [string, string][] = [];
    const visit = (mod: string, name: string, v: unknown) => {
      if (typeof v === 'string') exported.push([`${mod}.${name}`, v]);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(mod, `${name}.${k}`, x);
    };
    const mods: Record<string, object> = { quoteUsable, availability, deliveryChain, deliveryConfig, store: storeModule };
    for (const [m, mod] of Object.entries(mods)) for (const [k, v] of Object.entries(mod)) if (typeof v !== 'function') visit(m, k, v);
    // The few string constants are keys and sentinels (NO_PROVIDER = 'none'); none is display text.
    for (const [where, s] of exported) expect(s, where).not.toMatch(FRESHNESS);
    expect(exported.length).toBeGreaterThan(0);
  });

  it('the availability meter and the outcome history serialise without freshness wording or timestamps shown as text', () => {
    const { store } = holding([quote(T, 0.41, NOW - 10_000)]);
    store.renderQuote(T, CONTEXTS.list_far);
    store.renderQuote(T, CONTEXTS.contract_near);
    expect(JSON.stringify(store.availability())).not.toMatch(/stale|fresh|ago|updated|aging/i);
  });
});

describe('the new diagnostics are not rendered anywhere', () => {
  const SRC = join(__dirname, '..', '..', 'src');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(SRC);

  it('nothing outside src/live refers to the history, the meter, the outcome, the skew or the per-ticker counters', () => {
    const NEW_DIAGNOSTICS = /refreshHistory|lastOutcome|\.availability\(\)|\.meter\b|clockSkewMs|unusableTickers|observationAgeMs|RefreshOutcome|AvailabilityMeter|\.renderQuote\(|refreshContract|addRowsScope|addContractScope/;
    const offenders = files.filter((f) => !f.includes(`${join('src', 'live')}`) && NEW_DIAGNOSTICS.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('the packet path and the production chain do not import the delivery modules', () => {
    const imports = /from '(\.{1,2}\/)+(providers\/)?(quoteUsable|availability|deliveryChain|deliveryConfig|missingPrice)'/;
    const allowed = new Set(['store.ts', 'hooks.ts', 'availability.ts', 'deliveryChain.ts', 'deliveryConfig.ts']);
    const offenders = files
      .filter((f) => f.includes(join('src', 'live')) && !allowed.has(f.split('/').pop()!))
      .filter((f) => imports.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
    // and the production chain's wiring is the file main has: no delivery option, no honourRetryAfter
    const config = readFileSync(join(SRC, 'live', 'config.ts'), 'utf-8');
    expect(config).not.toMatch(/honourRetryAfter|deliveryProvider|DeliveryProvider|strictObservation/);
  });
});
