import type { CSSProperties, ReactNode } from 'react';
import '../../styles/sift2-hero.css';

export interface CinematicHeroProps {
  eyebrow: string;
  /** Heading hierarchy is supplied by the host page. */
  headingLevel?: 1 | 2;
  title: string;
  subtitle?: string;
  /** Only use a verified/licensed venue photo. No background image is required. */
  imageUrl?: string;
  imageAlt?: string;
  /** Explicit image focus for responsive art direction. */
  desktopFocus?: string;
  mobileFocus?: string;
  homeColor?: string;
  awayColor?: string;
  children?: ReactNode;
  className?: string;
}

/** Visual shell only: callers supply verified event identity, score, venue, and market data. */
export function CinematicHero({
  eyebrow, title, headingLevel = 1, subtitle, imageUrl, imageAlt = '', desktopFocus = 'center 45%',
  mobileFocus = 'center 45%', homeColor = '#245f9a', awayColor = '#12334f',
  children, className = '',
}: CinematicHeroProps) {
  const style = {
    '--sift2-home': homeColor,
    '--sift2-away': awayColor,
    '--sift2-focus-desktop': desktopFocus,
    '--sift2-focus-mobile': mobileFocus,
  } as CSSProperties;
  return (
    <section className={`sift2-hero ${className}`.trim()} style={style} aria-label={title}>
      <div className="sift2-hero__art" aria-hidden="true">
        {imageUrl ? <img className="sift2-hero__image" src={imageUrl} alt={imageAlt} loading="eager" /> : null}
      </div>
      <div className="sift2-hero__content">
        <div className="sift2-hero__copy">
          <span className="sift2-hero__eyebrow">{eyebrow}</span>
          {headingLevel === 1 ? <h1 className="sift2-hero__title">{title}</h1> : <h2 className="sift2-hero__title">{title}</h2>}
          {subtitle && <p className="sift2-hero__subtitle">{subtitle}</p>}
        </div>
        {children && <div className="sift2-hero__details">{children}</div>}
      </div>
    </section>
  );
}
