// Which interface answers the classic (root) addresses. SIFT 2.0 lives under /design/sift2/; a build made with
// default sends every classic address to its SIFT 2.0 equivalent (a build made with VITE_SIFT_UI=classic keeps the
// classic interface, as the legacy acceptance suite and a rollback build do). The classic interface stays in the bundle
// and is reachable with `?ui=classic` (remembered in this browser), which is also the instant in-browser comparison and
// the post-deploy monitor's way to keep proving the shared data layer. `?ui=default` forgets the choice.
export type UiMode = 'sift2' | 'classic';
const KEY = 'sift.ui';
export const BUILD_UI: UiMode = import.meta.env.VITE_SIFT_UI === 'classic' ? 'classic' : 'sift2';

const read = (): UiMode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'sift2' || v === 'classic' ? v : null;
  } catch {
    return null;
  }
};

/** The mode for an address: an explicit `?ui=` wins (and is remembered), then the remembered choice, then the build's. */
export function resolveUi(search: string): UiMode {
  const q = new URLSearchParams(search).get('ui');
  try {
    if (q === 'classic' || q === 'sift2') localStorage.setItem(KEY, q);
    else if (q === 'default') localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the query still applies to this load */
  }
  if (q === 'classic' || q === 'sift2') return q;
  if (q === 'default') return BUILD_UI;
  return read() ?? BUILD_UI;
}
