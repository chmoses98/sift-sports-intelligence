// A decorative image (stadium photo, team logo) held in memory once loaded, so a screen re-opened later in the
// session — including offline — shows it again without a network request. Fails quietly to "no image".
import { useEffect, useState } from 'react';

const pending = new Map<string, Promise<string | null>>();
const ready = new Map<string, string | null>();

function load(src: string): Promise<string | null> {
  let p = pending.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
      .then((u) => {
        ready.set(src, u);
        if (!u) pending.delete(src); // a failure may be retried on a later mount
        return u;
      });
    pending.set(src, p);
  }
  return p;
}

export function useHeldImage(src: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (src ? ready.get(src) ?? null : null));
  useEffect(() => {
    if (!src) return;
    let live = true;
    const known = ready.get(src);
    if (known) setUrl(known);
    else load(src).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [src]);
  return src ? url : null;
}

/** True once the element has come within `margin` of the viewport (then stays true). */
export function useInView<T extends Element>(margin = '300px') {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, margin]);
  return [setEl, seen] as const;
}

/** True while `query` matches (read synchronously on first render, so the right file is fetched first time). */
export function useMediaQuery(query: string): boolean {
  const mq = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
  const [on, setOn] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return on;
}
