// The broadcast masthead for the research hubs (Terminal, Explore, My Board, Model Pulse): one licensed stadium
// photograph from the hero registry (src/lib/hero/photos.json — every file carries its own credit and licence,
// shown on the banner), a deep shade so text always reads, a condensed display title and a slot for the hub's own
// controls. Without a photo (sports the registry has none for) it falls back to Sift's lit-glass wash: never a
// stand-in image. The photograph is decorative (alt=""); everything it might say is in the text.
import type { ReactNode } from 'react';
import { PHOTOS } from '../lib/hero/registry';
import { photoOf } from '../lib/hero/resolve';
import type { HeroPhoto } from '../lib/hero/types';

/** A registry photograph by id, or null when the id is unknown (the masthead then draws its glass wash). */
export function hubPhoto(id: string | null | undefined): HeroPhoto | null {
  const p = id ? PHOTOS.find((x) => x.id === id) : undefined;
  return p ? photoOf(p) : null;
}

export function HubMast({
  title,
  brand,
  eyebrow,
  sub,
  photo,
  children,
  aside,
  className,
}: {
  /** The page's h1 text (kept plain so its accessible name is exactly the destination's name). */
  title: string;
  /** A decorative word drawn before the title ("SIFT"), hidden from assistive tech. */
  brand?: string;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  photo?: HeroPhoto | null;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const src = photo ? [...photo.srcset].sort((a, b) => a.w - b.w) : [];
  return (
    <header className={`hubm${photo ? ' hubm--photo' : ''}${className ? ` ${className}` : ''}`} style={photo ? { ['--hubm-focus' as string]: photo.focus.desktop, ['--hubm-focus-m' as string]: photo.focus.mobile } : undefined}>
      {photo && (
        <span className="hubm__art" aria-hidden="true">
          <img src={src[0]?.src} srcSet={src.map((s) => `${s.src} ${s.w}w`).join(', ')} sizes="(max-width: 700px) 100vw, 1400px" alt="" decoding="async" fetchPriority="high" draggable={false} />
        </span>
      )}
      <span className="hubm__shade" aria-hidden="true" />
      <div className="hubm__in">
        <div className="hubm__top">
          <div className="hubm__id">
            {eyebrow && <span className="hubm__eye">{eyebrow}</span>}
            <h1 className="hubm__t">{brand && <span className="hubm__brand" aria-hidden="true">{brand} </span>}{title}</h1>
            {sub && <p className="hubm__sub">{sub}</p>}
          </div>
          {aside && <div className="hubm__aside">{aside}</div>}
        </div>
        {children && <div className="hubm__ctl">{children}</div>}
      </div>
      {photo && <small className="hubm__credit">Photo: {photo.credit.artist.slice(0, 40)} · {photo.credit.license}</small>}
    </header>
  );
}
