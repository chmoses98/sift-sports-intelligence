// Semantic targets must never steal each other's taps. `.v3-tap::after` grows every target to a 44 pt hit area; where two targets sit close
// together (stacked text links in a dense row) the grown areas can cover a sibling's own text. This samples several points INSIDE each target's
// own box (centre and the quarter points of its first line box) with `elementFromPoint` and reports every point that resolves to another
// semantic target (`[data-tap]`, or a row's own button). Use it on any screen: `await expectNoStolenTaps(page, '.pd-row')`.
import type { Page } from '@playwright/test';

export interface Steal { target: string; at: [number, number]; stolenBy: string }

export async function stolenTaps(page: Page, scope: string): Promise<Steal[]> {
  return page.evaluate((sc) => {
    const label = (e: Element) => `${e.getAttribute('data-tap') ?? e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}`;
    // A target scrolled under a sticky or fixed header/bar is hidden by that chrome, not stolen by a neighbour.
    const pinned = (e: Element) => { for (let n: Element | null = e; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'sticky' || p === 'fixed') return true; } return false; };
    const targetOf = (e: Element | null) => e?.closest('[data-tap]') ?? null;
    const out: { target: string; at: [number, number]; stolenBy: string }[] = [];
    const scopes = [...document.querySelectorAll(sc)];
    for (const root of scopes) {
      for (const t of root.querySelectorAll<HTMLElement>('[data-tap]')) {
        // A row's stretched main link spans the whole row by design; the raised targets inside it are meant to win over it.
        if (t.classList.contains('v3-navrow__main')) continue;
        const rects = [...t.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
        const r = rects[0];
        if (!r || r.bottom < 0 || r.top > innerHeight) continue;
        const pts: [number, number][] = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5]];
        for (const [fx, fy] of pts) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit) continue;
          const owner = targetOf(hit);
          if (owner === t || t.contains(hit)) continue;
          // Hitting a non-target (plain text, the row's own button) is fine; only another semantic target is a theft.
          if (owner && owner !== t && !(pinned(owner) && !pinned(t))) out.push({ target: label(t), at: [Math.round(x), Math.round(y)], stolenBy: label(owner) });
        }
      }
    }
    return out;
  }, scope);
}

export async function expectNoStolenTaps(page: Page, scope: string): Promise<void> {
  const s = await stolenTaps(page, scope);
  if (s.length) throw new Error(`taps stolen by a neighbouring target:\n${s.map((x) => `  ${x.target} at ${x.at} -> ${x.stolenBy}`).join('\n')}`);
}
