// Team accents on the dark hero keep the club's own colour and reach 3:1 against the surface (WCAG 1.4.11).
import { describe, expect, it } from 'vitest';
import { accentOnDark, contrast } from '../src/lib/hero/accent';
import { teamColors } from '../src/lib/teams';
import { modelTag, marketTag } from '../src/lib/hero/copy';

describe('accentOnDark', () => {
  it('keeps a bright club colour unchanged', () => {
    expect(accentOnDark(['#0076b6', '#b0b7bc'])).toBe('#0076b6'); // Lions: Honolulu blue reads on near-black
    expect(accentOnDark(['#0B162A', '#C83803'])).toBe('#c83803'); // Bears: navy disappears, orange carries the identity
    expect(accentOnDark(['#ffb612', '#101820'])).toBe('#ffb612');
  });
  it('a deep primary is lifted before falling back to the secondary (Cardinals stay red, not gold)', () => {
    const c = accentOnDark(['#97233F', '#FFB612']);
    expect(contrast(c, '#02080e')).toBeGreaterThanOrEqual(3);
    const [r, g] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16)];
    expect(r).toBeGreaterThan(g * 1.4);
  });
  it('lifts a dark club colour just enough to be visible', () => {
    const c = accentOnDark(['#0b162a', '#0b162a']);
    expect(contrast(c, '#02080e')).toBeGreaterThanOrEqual(3);
    expect(c).not.toBe('#ffffff');
  });
  it('every NFL club accent reaches 3:1 on the hero surface', () => {
    for (const t of ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LA', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS']) {
      expect(contrast(accentOnDark(teamColors('NFL', t)), '#02080e'), t).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('hero copy', () => {
  it('turns the publication’s model caveat into one plain phrase (the caveat stays one tap away)', () => {
    expect(modelTag('The model has been shown redundant to the closing market on player props and behind it on game outcomes. Treat it as structure, not as a superior forecast.')).toBe('Research model · behind the closing market');
    expect(modelTag('Shadow model; not used for decisions.')).toBe('Research model');
    expect(modelTag(null)).toBeNull();
  });
  it('names the market source in a word', () => {
    expect(marketTag('Market-implied from contract midpoints (research, not executable)')).toBe('Midpoint estimate, not a live price');
    expect(marketTag('Game-winner contracts, publication capture')).toBe('Game-winner contracts');
    expect(marketTag(null)).toBeNull();
  });
});
