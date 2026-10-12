import { describe, expect, it } from 'vitest';
import { heroArtwork } from '../src/lib/hero/artwork';

describe('heroArtwork', () => {
  it('is only the Rams–Bills matchup, in either order and under either Rams code', () => {
    expect(heroArtwork('NFL', 'LA', 'BUF')?.src).toMatch(/nfl-lar-buf/);
    expect(heroArtwork('NFL', 'BUF', 'LAR')).not.toBeNull();
  });
  it('is never shown for another game or sport', () => {
    expect(heroArtwork('NFL', 'LA', 'PHI')).toBeNull();
    expect(heroArtwork('NFL', 'NE', 'BUF')).toBeNull();
    expect(heroArtwork('NHL', 'LA', 'BUF')).toBeNull();
    expect(heroArtwork('NFL', null, 'BUF')).toBeNull();
  });
});
