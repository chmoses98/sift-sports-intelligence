// Why a document could not be shown, in words a viewer reads, and whether asking again can help. One vocabulary for every v3 screen.
// Pure. The errors are the ones src/data/fetcher.ts throws (NotFoundError, FetchTimeoutError, SchemaVersionError) plus the browser's own
// (a failed request is a TypeError; a body that is not JSON is a SyntaxError).
import { FetchTimeoutError, NotFoundError, SchemaVersionError } from '../../data/fetcher';

export type FailureKind = 'not-published' | 'timeout' | 'unreadable' | 'unsupported' | 'unreachable';

export function failureKind(err: unknown): FailureKind {
  if (err instanceof NotFoundError) return 'not-published';
  if (err instanceof FetchTimeoutError) return 'timeout';
  if (err instanceof SchemaVersionError) return 'unsupported';
  if (err instanceof SyntaxError) return 'unreadable';
  const name = (err as { name?: string } | null)?.name;
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  if (name === 'NotFoundError') return 'not-published';
  if (name === 'FetchTimeoutError') return 'timeout';
  if (name === 'SchemaVersionError') return 'unsupported';
  if (/timed out/i.test(msg)) return 'timeout';
  if (/not published|HTTP 404/i.test(msg)) return 'not-published';
  if (name === 'SyntaxError' || /JSON|Unexpected (token|end)/i.test(msg)) return 'unreadable';
  return 'unreachable';
}

/** Why, as the second half of a sentence: "The ranking could not be shown: <why>". */
export function whyUnavailable(err: unknown): string {
  switch (failureKind(err)) {
    case 'not-published': return 'it is not published yet';
    case 'timeout': return 'it did not answer in time';
    case 'unreadable': return 'what was published could not be read';
    case 'unsupported': return 'it is in a format this version of SIFT cannot read';
    default: return 'the connection to it failed';
  }
}

/** Asking again can help for a connection that failed, a request that timed out or a file caught mid-update; not for a document that is not published or in a format the app cannot read. */
export const canRetry = (err: unknown): boolean => {
  const k = failureKind(err);
  return k === 'unreachable' || k === 'timeout' || k === 'unreadable';
};
