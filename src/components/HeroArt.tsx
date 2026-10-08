// The art behind every game hero, card and tile, drawn from a HeroSpec (src/lib/hero/resolve.ts):
// - photo: the approved photograph of the home team's identity at its venue, chosen by size (phones never download
//   the 2400 px file), art-directed per breakpoint (--focus-d / --focus-m), over the team's branded wash so the
//   first paint is the team's colours rather than an empty box;
// - branded: Sift's designed identity — the home team's colours as light, its livery stripes and its logo as a
//   watermark (never a stadium it might not be playing in); neutral sites and unconfirmed home sides split the
//   frame between both teams so nobody is shown at home.
// Purely decorative (aria-hidden): what the hero says is in its text (the identity line), never only in the art.
import type { CSSProperties } from 'react';
import type { HeroSpec } from '../lib/hero/types';
import { useHeldImage } from '../lib/useImage';

export type HeroArtVariant = 'hero' | 'card' | 'tile';

/** The file a surface needs: tiles and cards the 720 px card file; the hero the smallest width that covers it. */
export function heroImageSrc(spec: HeroSpec, variant: HeroArtVariant): string | null {
  const p = spec.photo;
  if (!p) return null;
  if (variant === 'tile') return p.card;
  const need = typeof window === 'undefined' ? 2400 : Math.min(window.innerWidth, 1600) * Math.min(window.devicePixelRatio || 1, 2) * (variant === 'card' ? 0.7 : 1);
  const fit = [...p.srcset].sort((a, b) => a.w - b.w).find((s) => s.w >= need);
  return (fit ?? p.srcset[0]).src;
}

/** CSS custom properties that carry a hero's identity into its surface (colours, focus points). */
export function heroVars(spec: HeroSpec): CSSProperties {
  const h = spec.home?.colors ?? ['#1d2d52', '#3f5079'];
  const a = spec.away?.colors ?? ['#1d2d52', '#3f5079'];
  return {
    ['--hc1' as string]: h[0],
    ['--hc2' as string]: h[1],
    ['--ac1' as string]: a[0],
    ['--ac2' as string]: a[1],
    ['--focus-d' as string]: spec.photo?.focus.desktop ?? 'center 45%',
    ['--focus-m' as string]: spec.photo?.focus.mobile ?? 'center 45%',
  };
}

function Watermark({ src, side }: { src: string | null | undefined; side: 'home' | 'away' }) {
  const held = useHeldImage(src);
  return held ? <img className={`hart__logo hart__logo--${side}`} src={held} alt="" decoding="async" draggable={false} /> : null;
}

export function HeroArt({ spec, variant = 'hero', load = true }: { spec: HeroSpec; variant?: HeroArtVariant; load?: boolean }) {
  const src = load ? heroImageSrc(spec, variant) : null;
  const img = useHeldImage(src);
  const split = spec.context === 'neutral' || spec.context === 'matchup';
  const cls = `hart hart--${variant} hart--${spec.kind} hart--${split ? 'split' : 'home'}${img ? ' is-loaded' : ''}`;
  return (
    <span className={cls} aria-hidden="true" data-hero-art={spec.kind}>
      <span className="hart__wash" />
      {spec.kind === 'branded' && (
        <>
          <span className="hart__rays" />
          <span className="hart__livery" />
          {variant !== 'tile' && (split ? <><Watermark src={spec.away?.logo} side="away" /><Watermark src={spec.home?.logo} side="home" /></> : <Watermark src={spec.home?.logo} side="home" />)}
          <span className="hart__grain" />
        </>
      )}
      {img && <img className="hart__photo" src={img} alt="" decoding="async" draggable={false} />}
      <span className="hart__shade" />
    </span>
  );
}
