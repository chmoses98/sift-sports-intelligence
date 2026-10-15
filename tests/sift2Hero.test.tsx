import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CinematicHero } from '../src/components/sift2/CinematicHero';
import { Sift2HeroPreview } from '../src/views/Sift2HeroPreview';

afterEach(cleanup);

describe('SIFT 2.0 cinematic hero', () => {
  it('renders semantic title and supplied content without inventing scores or prices', () => {
    const { container } = render(
      <CinematicHero eyebrow="NFL" title="Visitors at Hosts" subtitle="Verified data supplied by parent">
        <p>Published research</p>
      </CinematicHero>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Visitors at Hosts' })).toBeTruthy();
    expect(screen.getByText('Published research')).toBeTruthy();
    expect(container.querySelector('.sift2-hero__image')).toBeNull();
    expect(container.textContent).not.toMatch(/\d+%|\$\d+/);
  });

  it('supports an embedded secondary heading without losing the hero label', () => {
    render(<CinematicHero eyebrow="NFL" title="Visitors at Hosts" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Visitors at Hosts' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders a supplied image decoratively and respects caller focus', () => {
    const { container } = render(
      <CinematicHero eyebrow="NFL" title="Visitors at Hosts"
        imageUrl="/approved-venue.webp" imageAlt="Verified venue photograph"
        desktopFocus="60% 30%" mobileFocus="70% 20%" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/approved-venue.webp');
    expect(img?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelector('section')?.getAttribute('style')).toContain('--sift2-focus-mobile: 70% 20%');
  });

  it('keeps the design preview visibly labelled as illustrative', () => {
    render(<Sift2HeroPreview />);
    expect(screen.getByText(/illustrative, not live or verified/i)).toBeTruthy();
    expect(screen.getByText(/No projected result or betting edge is implied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview phone width' })).toBeTruthy();
  });
});
