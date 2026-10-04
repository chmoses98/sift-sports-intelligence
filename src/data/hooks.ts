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

/**
 * Run a loader keyed by `key`. Results are memoised per key so going BACK through the research graph
 * renders instantly instead of flashing skeletons. A memo older than the research revalidation period
 * is shown immediately AND re-loaded in the background (stale-while-revalidate); a failed re-load keeps
 * what is on screen. Market quotes do not use this (src/live/ keeps its own clock).
 */
export function useAsync<T>(key: string | null, loader: () => Promise<T>): Async<T> {
  const initial = key != null && memo.has(key) ? (memo.get(key) as T) : undefined;
  const [state, setState] = useState<Async<T>>({ data: initial, error: undefined, loading: key != null && initial === undefined });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    if (key == null) {
      setState({ data: undefined, error: undefined, loading: false });
      return;
    }
    let alive = true;
    if (memo.has(key)) {
      setState({ data: memo.get(key) as T, error: undefined, loading: false });
      if (Date.now() - (memoAt.get(key) ?? 0) <= RESEARCH_REVALIDATE_MS) return;
      memoAt.set(key, Date.now()); // one background re-load per period, however many screens mount
      loaderRef.current().then(
        (data) => {
          memo.set(key, data);
          if (alive) setState({ data, error: undefined, loading: false });
        },
        () => {
          /* keep the copy on screen */
        },
      );
      return () => {
        alive = false;
      };
    }
    setState((s) => ({ data: s.data, error: undefined, loading: true }));
    loaderRef.current().then(
      (data) => {
        memo.set(key, data);
        memoAt.set(key, Date.now());
        if (alive) setState({ data, error: undefined, loading: false });
      },
      (error: Error) => {
        if (alive) setState({ data: undefined, error, loading: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
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
