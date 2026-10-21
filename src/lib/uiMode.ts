// Which interface answers the classic (root) addresses. SIFT 2.0 lives under /design/sift2/; a build made with
// default sends every classic address to its SIFT 2.0 equivalent (a build made with VITE_SIFT_UI=classic keeps the
// classic interface, as the legacy acceptance suite and a rollback build do). The classic interface stays in the bundle
// and is reachable with `?ui=classic` (remembered in this browser), which is also the instant in-browser comparison and
// the post-deploy monitor's way to keep proving the shared data layer. `?ui=default` forgets the choice.
// `?ui=v4` opens the v4 phone preview (src/v4, under /v4): opt-in only, never the build's default.
export type UiMode = 'sift2' | 'classic' | 'v4';
const KEY = 'sift.ui';
export const BUILD_UI: UiMode = import.meta.env.VITE_SIFT_UI === 'classic' ? 'classic' : 'sift2';

const read = (): UiMode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'sift2' || v === 'classic' || v === 'v4' ? v : null;
  } catch {
    return null;
  }
};

/** The classic or SIFT 2.0 choice a viewer had before opting into v4, kept so leaving v4 can give it back. */
const BEFORE_V4 = 'sift.ui.before-v4';

/** The mode for an address: an explicit `?ui=` wins (and is remembered), then the remembered choice, then the build's. */
export function resolveUi(search: string): UiMode {
  const q = new URLSearchParams(search).get('ui');
  try {
    if (q === 'v4') {
      // v4 shares the one remembered key: keep a classic / SIFT 2.0 choice aside so exiting v4 restores it, not erases it.
      const cur = localStorage.getItem(KEY);
      if (cur === 'classic' || cur === 'sift2') localStorage.setItem(BEFORE_V4, cur);
      localStorage.setItem(KEY, 'v4');
    } else if (q === 'classic' || q === 'sift2') {
      localStorage.setItem(KEY, q);
      localStorage.removeItem(BEFORE_V4);
    } else if (q === 'default') {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BEFORE_V4);
    }
  } catch {
    /* storage unavailable: the query still applies to this load */
  }
  if (q === 'classic' || q === 'sift2' || q === 'v4') return q;
  if (q === 'default') return BUILD_UI;
  return read() ?? BUILD_UI;
}

/**
 * Leave v4 on purpose (a viewer chose "Open in SIFT 2.0"). A remembered v4 preference is dropped, so a later classic
 * address no longer redirects back into v4; the classic / SIFT 2.0 choice made before v4 comes back. Any other remembered
 * choice is left exactly as it is, and `#/v4` still opens v4 directly.
 */
export function exitV4(): void {
  try {
    if (localStorage.getItem(KEY) === 'v4') {
      const before = localStorage.getItem(BEFORE_V4);
      if (before === 'classic' || before === 'sift2') localStorage.setItem(KEY, before);
      else localStorage.removeItem(KEY);
    }
    localStorage.removeItem(BEFORE_V4);
  } catch {
    /* storage unavailable: nothing was remembered */
  }
}
