// The shared chip rail's pure rules (ui/ChipRail.tsx): which edges fade, and where to scroll so the active chip is in view with a peek of its neighbour.
import { describe, expect, it } from 'vitest';
import { railFade, scrollTarget } from '../../src/v3/ui/ChipRail';

describe('railFade', () => {
  it('has no fade when everything fits', () => { expect(railFade(0, 390, 390)).toBe('none'); expect(railFade(0, 390, 391)).toBe('none'); });
  it('fades the end at the start of an overflowing rail', () => expect(railFade(0, 320, 600)).toBe('end'));
  it('fades both edges in the middle', () => expect(railFade(100, 320, 600)).toBe('both'));
  it('fades the start at the end of the rail', () => expect(railFade(280, 320, 600)).toBe('start'));
  it('tolerates sub-pixel rounding at either end', () => { expect(railFade(1, 320, 600)).toBe('end'); expect(railFade(279, 320, 600)).toBe('start'); });
});

describe('scrollTarget', () => {
  const view = (scrollLeft: number) => ({ scrollLeft, clientWidth: 320, scrollWidth: 800 });
  it('does nothing when the active chip already sits inside the view with room to spare', () => expect(scrollTarget({ left: 100, width: 80 }, view(0))).toBeNull());
  it('scrolls right so a chip hidden at the end is shown with a peek of what follows', () => expect(scrollTarget({ left: 500, width: 90 }, view(0))).toBe(500 + 90 + 44 - 320));
  it('scrolls left so a chip hidden at the start is shown with a peek of what precedes', () => expect(scrollTarget({ left: 200, width: 80 }, view(400))).toBe(156));
  it('never scrolls past either end of the rail', () => {
    expect(scrollTarget({ left: 10, width: 80 }, view(400))).toBe(0);
    expect(scrollTarget({ left: 760, width: 40 }, view(0))).toBe(480);
  });
  it('a chip half clipped at the right edge counts as hidden', () => expect(scrollTarget({ left: 290, width: 80 }, view(0))).not.toBeNull());
});
