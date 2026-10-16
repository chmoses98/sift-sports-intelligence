import { useEffect, useRef, useState } from 'react';
import type { HeroSpec } from '../../lib/hero/types';
import { useHeldImage } from '../../lib/useImage';
import { HeroArt } from '../HeroArt';
import { venueArtProfile, venueImageSource } from './heroArt';
import type { ArtSurface } from './venueArt';

/** Same physical layout; art direction belongs to the verified venue, not to a global photo filter. */
export function VenueArt({ spec, surface='hero' }: {spec: HeroSpec;surface?: ArtSurface}) {
  const frame=useRef<HTMLSpanElement>(null);
  const [width,setWidth]=useState(surface==='card' ? 300 : typeof window==='undefined' ? 1200 : Math.min(window.innerWidth,1200));
  useEffect(()=>{
    if (!frame.current || typeof ResizeObserver==='undefined') return;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)));
    observer.observe(frame.current);return ()=>observer.disconnect();
  },[]);
  const src=spec.photo ? venueImageSource(spec.photo,width,typeof window==='undefined' ? 1 : window.devicePixelRatio) : null;
  const image=useHeldImage(src);
  const [failed,setFailed]=useState<string|null>(null);
  const visible=image && failed!==src;
  const profile=venueArtProfile(spec);
  const fallback: HeroSpec={...spec,kind:'branded',photo:null};
  return <span ref={frame} className={`s2-venue-art${visible ? ' is-loaded' : ''}`} data-art-status={src && failed===src ? 'unavailable' : visible ? 'loaded' : 'fallback'} data-art-tone={profile?.tone ?? 'neutral'} data-art-surface={surface} data-art-quality={profile?.quality ?? 'registry'} data-art-source={src ?? undefined} aria-hidden="true">
    <HeroArt spec={fallback} variant={surface==='card' ? 'card' : 'hero'} />
    {visible && <img className="hart__photo" src={image} onError={()=>setFailed(src)} alt="" decoding="async" draggable={false} />}
    <span className="s2-venue-art__atmosphere" /><span className="s2-venue-art__shade" />
  </span>;
}
