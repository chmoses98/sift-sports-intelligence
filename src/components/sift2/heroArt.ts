import type { CSSProperties } from 'react';
import type { HeroSpec, HeroPhoto } from '../../lib/hero/types';
import { heroVars } from '../HeroArt';
import { VENUE_ART, type ArtSurface } from './venueArt';
import { canonicalTeam } from '../../lib/hero/registry';

export const venueArtProfile = (spec: HeroSpec) => spec.context === 'home'
  ? VENUE_ART.find((p)=>p.sport===spec.sport && p.team===canonicalTeam(spec.sport,spec.home?.code) && p.venue===spec.venue?.id) ?? null : null;

export function broadcastHeroSpec(spec: HeroSpec, surface: ArtSurface = 'hero'): HeroSpec {
  const profile=venueArtProfile(spec);
  // Core resolver remains authoritative for identity/era. No override of branded/neutral/unverified outcomes.
  if (!profile || !spec.photo || spec.kind !== 'photo') return spec;
  if (profile.quality==='replacement-needed' || profile.quality==='context' && surface==='hero')
    return {...spec,kind:'branded',photo:null,reason:'branded:featured-asset-quality-pending'};
  return {...spec,photo:{...(profile.photo ?? spec.photo),focus:profile[surface]}};
}

export function broadcastArtVars(spec: HeroSpec, surface: ArtSurface = 'hero'): CSSProperties {
  const focus=venueArtProfile(spec)?.[surface] ?? spec.photo?.focus;
  return {...heroVars(spec),['--focus-d' as string]:focus?.desktop ?? '50% 45%', ['--focus-m' as string]:focus?.mobile ?? '50% 45%'};
}

/** Container-aware resolution; cap DPR at two and tolerate only a 2.5% up-scale. */
export function venueImageSource(photo: HeroPhoto, width: number, dpr: number): string {
  const sources=[...photo.srcset,{src:photo.card,w:720}].sort((a,b)=>a.w-b.w);
  const need=Math.max(1,width)*Math.min(2,Math.max(1,dpr));
  return (sources.find((s)=>s.w*1.025>=need) ?? sources[sources.length-1]).src;
}
