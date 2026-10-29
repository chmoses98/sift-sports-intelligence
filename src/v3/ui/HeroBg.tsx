import { useState } from 'react';
import type { V3Game } from '../model/types';

/**
 * The hero backdrop. A verified venue photograph (src/lib/hero, with its credit) when one exists for this game; otherwise the
 * photo-free layout: both teams' own colours lit from either side over the ink ground. Never a stock or generated image.
 */
export function HeroBg({ g, cover = false }: { g: Pick<V3Game, 'away' | 'home' | 'photo'>; cover?: boolean }) {
  const [a, h] = [g.away.colors, g.home.colors];
  const [bad, setBad] = useState(false);
  const glow = (c: [string, string]) => (c[0].toLowerCase() === '#000000' || c[0].toLowerCase() === '#ffffff' ? c[1] : c[0]);
  return (
    <div className={`v3-herobg${cover ? ' v3-herobg--cover' : ''}`} aria-hidden="true" style={{ ['--ga' as string]: glow(a), ['--gh' as string]: glow(h) }}>
      {g.photo && !bad && (
        <img className="v3-herobg__img" src={g.photo.src} srcSet={g.photo.srcset} sizes="430px" alt="" decoding="async" onError={() => setBad(true)} style={g.photo.focus ? { objectPosition: g.photo.focus } : undefined} />
      )}
      <i className="v3-herobg__glow v3-herobg__glow--a" />
      <i className="v3-herobg__glow v3-herobg__glow--h" />
      <i className="v3-herobg__lights" />
      <i className="v3-herobg__scrim" />
      {g.photo?.credit && !bad && <small className="v3-herobg__credit">Photo: {g.photo.credit}</small>}
    </div>
  );
}
