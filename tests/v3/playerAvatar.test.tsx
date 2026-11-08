// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PlayerAvatar, initialsOf } from '../../src/v3/ui/PlayerAvatar';

const team = { logo: null, abbr: 'BOS', colors: ['#007a33', '#222'] as [string, string], name: 'Boston Celtics' };
const photo = { src: '/p/x.webp', focus: '50% 10%', credit: 'A. Photographer · CC BY 2.0' };

describe('PlayerAvatar fallback chain', () => {
  it('shows a verified photo with its credit', () => {
    const { container } = render(<PlayerAvatar photo={photo} team={team} name="Jayson Tatum" />);
    const el = container.querySelector('[data-pav]')!;
    expect(el.getAttribute('data-pav')).toBe('photo');
    expect(el.getAttribute('title')).toContain('CC BY 2.0');
  });
  it('falls to the team mark when the photo fails, and never to a guessed face', () => {
    const { container } = render(<PlayerAvatar photo={photo} team={team} name="Jayson Tatum" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-pav]')!.getAttribute('data-pav')).toBe('team');
  });
  it('team mark with no photo; initials with neither', () => {
    expect(render(<PlayerAvatar team={team} name="X" />).container.querySelector('[data-pav]')!.getAttribute('data-pav')).toBe('team');
    const r = render(<PlayerAvatar name="Nikola Jokić" />).container.querySelector('[data-pav]')!;
    expect(r.getAttribute('data-pav')).toBe('initials');
    expect(r.textContent).toBe('NJ');
  });
  it('initials handle suffixes and empty names', () => {
    expect(initialsOf('Jimmy Butler III')).toBe('JB');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf(null)).toBe('?');
  });
});
