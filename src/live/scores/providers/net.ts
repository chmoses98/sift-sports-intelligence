// One request, one deadline. A provider that never answers must not hold a screen: every fetch is aborted after `ms`, and a caller's own
// signal (a screen closing) still aborts it sooner.
export function withDeadline(parent: AbortSignal | undefined, ms = 12_000): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('score feed timed out', 'TimeoutError')), ms);
  const onParent = () => ctl.abort(parent?.reason);
  if (parent) { if (parent.aborted) ctl.abort(parent.reason); else parent.addEventListener('abort', onParent, { once: true }); }
  return { signal: ctl.signal, done: () => { clearTimeout(timer); parent?.removeEventListener('abort', onParent); } };
}
