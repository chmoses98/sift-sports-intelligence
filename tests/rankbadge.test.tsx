// Rank colour follows the reader: a unit's own rank is green when strong; an opposing unit (a prop's defense) is
// red when strong — the tough side of the matchup — while its rank and tier words still describe the unit.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankBadge } from '../src/components/insight';
import { rankView } from '../src/lib/rank';

describe('RankBadge', () => {
  const strong = rankView({ rank: 3, universe_size: 32, higher_is_better: true })!;
  const middle = rankView({ rank: 16, universe_size: 32, higher_is_better: true })!;
  it('colours a strong unit favourably for its own team, and as a tough matchup for the opponent', () => {
    expect(render(<RankBadge rank={strong} />).container.querySelector('.rk')!.className).toMatch(/rk--elite/);
    const against = render(<RankBadge rank={strong} against />).container.querySelector('.rk')!;
    expect(against.className).toMatch(/rk--poor/);
    expect(against.getAttribute('title')).toBe('Tough matchup for this player');
    expect(against.textContent).toContain('#3');
    expect(against.textContent).toContain('Top 3');
  });
  it('keeps the middle tier amber either way', () => {
    expect(render(<RankBadge rank={middle} against />).container.querySelector('.rk')!.className).toMatch(/rk--average/);
  });
});
