// Scroll rules (src/lib/scroll.ts): a filter or tab tap never throws the page back to the top; a new screen starts
// at the top; back/forward returns to where the reader was.
import { describe, expect, it } from 'vitest';
import { scrollDecision, tabScrollTarget } from '../src/lib/scroll';

const at = (pathname: string, search = '', hash = '', state?: unknown) => ({ pathname, search, hash, state });

describe('scrollDecision', () => {
  it('a new screen starts at the top', () => {
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl'), next: at('/nfl/game/e1'), saved: undefined })).toEqual({ kind: 'top' });
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl/game/e1'), next: at('/nfl/game/e2'), saved: 900 })).toEqual({ kind: 'top' });
  });

  it('a filter or selection on the same screen keeps the reader where they are (push or replace)', () => {
    expect(scrollDecision({ navType: 'REPLACE', prev: at('/games', '?sport=nfl'), next: at('/games', '?sport=nhl'), saved: undefined })).toEqual({ kind: 'keep' });
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl/game/e1', '?tab=overview'), next: at('/nfl/game/e1', '?tab=overview&script=fav'), saved: undefined })).toEqual({ kind: 'keep' });
  });

  it('a tab change aligns to the section tabs', () => {
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl/game/e1'), next: at('/nfl/game/e1', '?tab=props'), saved: undefined })).toEqual({ kind: 'tab' });
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl/game/e1', '?tab=props'), next: at('/nfl/game/e1', '?tab=markets'), saved: undefined })).toEqual({ kind: 'tab' });
  });

  it('back and forward return to the saved position', () => {
    expect(scrollDecision({ navType: 'POP', prev: at('/nfl/game/e1'), next: at('/nfl'), saved: 1240 })).toEqual({ kind: 'restore', y: 1240 });
    expect(scrollDecision({ navType: 'POP', prev: null, next: at('/nfl'), saved: 300 })).toEqual({ kind: 'restore', y: 300 });
  });

  it('back to an entry with no saved position behaves like a fresh visit', () => {
    expect(scrollDecision({ navType: 'POP', prev: at('/nfl/game/e1'), next: at('/nfl'), saved: undefined })).toEqual({ kind: 'top' });
    expect(scrollDecision({ navType: 'POP', prev: null, next: at('/nfl'), saved: undefined })).toEqual({ kind: 'none' });
  });

  it('an explicit request and a section anchor win', () => {
    expect(scrollDecision({ navType: 'PUSH', prev: at('/props', '?player=a'), next: at('/props', '?player=b', '', { scroll: 'top' }), saved: undefined })).toEqual({ kind: 'top' });
    expect(scrollDecision({ navType: 'PUSH', prev: at('/nfl'), next: at('/nfl/game/e1', '', '', { scroll: 'keep' }), saved: undefined })).toEqual({ kind: 'keep' });
    expect(scrollDecision({ navType: 'PUSH', prev: at('/status'), next: at('/status', '', '#photo-credits'), saved: undefined })).toEqual({ kind: 'anchor', id: 'photo-credits' });
  });
});

describe('tabScrollTarget', () => {
  it('puts the tabs under the header only when the reader is below them', () => {
    expect(tabScrollTarget(2000, 600, 58)).toBe(542);
    expect(tabScrollTarget(300, 600, 58)).toBeNull();
    expect(tabScrollTarget(542, 600, 58)).toBeNull();
  });
});
