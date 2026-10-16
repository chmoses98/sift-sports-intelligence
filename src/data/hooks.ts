import { useEffect, useMemo, useRef, useState } from 'react';
import { RESEARCH_REVALIDATE_MS } from './fetcher';
import { SportRepo } from './repo';
import { resolveSource, type SportSource } from './source';
import type { SportConfig } from './sports';

export interface Async<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

const memo = new Map<string, unknown>();
const memoAt = new Map<string, number>();

/** How often a screen that asked for `revalidate` checks its memo's age while it stays mounted and visible. */
export const REVALIDATE_CHECK_MS = 60_000;

/**
 * Run a loader keyed by `key`. Results are memoised per key so going BACK through the research graph
 * renders instantly instead of flashing skeletons. A memo older than the research revalidation period
 * is shown immediately AND re-loaded in the background (stale-while-revalidate); a failed re-load keeps
 * what is on screen. Market quotes do not use this (src/live/ keeps its own clock).
 *
 * `revalidate`: a screen that stays open (Home) applies the same rule while it is mounted: every
 * REVALIDATE_CHECK_MS, and when the tab becomes visible again, a memo older than the research revalidation
 * period is re-loaded in the background and replaces what is on screen. Same period, same "keep the copy on
 * failure" rule; nothing is re-read sooner than the research clock allows.
 */
export function useAsync<T>(key: string | null, loader: () => Promise<T>, opts: { revalidate?: boolean } = {}): Async<T> {
  const initial = key != null && memo.has(key) ? (memo.get(key) as T) : undefined;
  const [state, setState] = useState<{key: string | null; result: Async<T>}>({ key, result: {data: initial, error: undefined, loading: key != null && initial === undefined} });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    if (key == null) {
      setState({ key, result: {data: undefined, error: undefined, loading: false} });
      return;
    }
    let alive = true;
    if (memo.has(key)) {
      setState({ key, result: {data: memo.get(key) as T, error: undefined, loading: false} });
      if (Date.now() - (memoAt.get(key) ?? 0) <= RESEARCH_REVALIDATE_MS) return;
      memoAt.set(key, Date.now()); // one background re-load per period, however many screens mount
      loaderRef.current().then(
        (data) => {
          memo.set(key, data);
          if (alive) setState({ key, result: {data, error: undefined, loading: false} });
        },
        () => {
          /* keep the copy on screen */
        },
      );
      return () => {
        alive = false;
      };
    }
    setState((s) => ({ key, result: {data: s.key === key ? s.result.data : undefined, error: undefined, loading: true} }));
    loaderRef.current().then(
      (data) => {
        memo.set(key, data);
        memoAt.set(key, Date.now());
        if (alive) setState({ key, result: {data, error: undefined, loading: false} });
      },
      (error: Error) => {
        if (alive) setState({ key, result: {data: undefined, error, loading: false} });
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const revalidate = !!opts.revalidate;
  useEffect(() => {
    if (key == null || !revalidate) return;
    let alive = true;
    const check = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!memo.has(key) || Date.now() - (memoAt.get(key) ?? 0) <= RESEARCH_REVALIDATE_MS) return;
      memoAt.set(key, Date.now()); // one background re-load per period, however many screens hold the key
      loaderRef.current().then(
        (data) => {
          memo.set(key, data);
          if (alive) setState({ key, result: {data, error: undefined, loading: false} });
        },
        () => {
          /* keep the copy on screen */
        },
      );
    };
    const id = setInterval(check, REVALIDATE_CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [key, revalidate]);
  // Stale-while-revalidate applies only to the same research identity. A new game,
  // player or sport must never briefly inherit the previous key's research/errors.
  return state.key === key ? state.result : {data: initial, error: undefined, loading: key != null && initial === undefined};
}

export function clearAsyncMemo(): void {
  memo.clear();
  memoAt.clear();
}

/** Tests: pretend every memo was loaded `ms` ago. */
export function ageAsyncMemo(ms: number): void {
  for (const k of memoAt.keys()) memoAt.set(k, (memoAt.get(k) ?? 0) - ms);
}

export function useSportSource(sport: SportConfig | undefined): Async<SportSource> {
  return useAsync(sport ? `source:${sport.code}` : null, () => resolveSource(sport!));
}

export function useRepo(sport: SportConfig | undefined): Async<SportRepo> {
  const src = useSportSource(sport);
  const repo = useMemo(() => (src.data ? new SportRepo(src.data) : undefined), [src.data]);
  return { data: repo, error: src.error, loading: src.loading };
}
