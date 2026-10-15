import type { HeroSpec } from '../../lib/hero/types';
const BASE = `${import.meta.env.BASE_URL}sift2/venues/`;
/** A licence/source check and a broadcast art-direction check are separate gates. */
const NOT_FEATURE_QUALITY = new Set(['nfl-chi-soldier-field','nfl-bal-mt-bank-stadium','nfl-gb-lambeau-field']);
export function broadcastHeroSpec(spec: HeroSpec): HeroSpec {
  // The original resolver must first establish home identity, physical venue and era. Never use KC art away.
  if (spec.context === 'home' && spec.home?.code === 'KC' && spec.venue?.id === 'arrowhead-stadium' && spec.photo) {
    return { ...spec, photo: {
      id: 'sift2-arrowhead-night', srcset: [2400,1200].map((w) => ({ src: `${BASE}arrowhead-night-${w}.webp`, w })),
      card: `${BASE}arrowhead-night-720.webp`, width: 2400, height: 1800,
      focus: { desktop: '50% 66%', mobile: '58% 64%' }, identity: 'Chiefs end zone, Arrowhead bowl and Chiefs midfield flag during a night-game entrance',
      credit: { artist: 'Kj1595', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'https://commons.wikimedia.org/wiki/File:Arrowhead_Stadium_(October_27,_2019_-_7).jpg', file: 'File:Arrowhead Stadium (October 27, 2019 - 7).jpg', modifications: 'Resized to WebP by SIFT. CSS contrast and saturation for presentation; no relighting or synthetic content.' },
    } };
  }
  // Retain the truthful venue/team metadata, but do not feature flat field-level or washed-out frames.
  if (spec.photo && NOT_FEATURE_QUALITY.has(spec.photo.id)) return { ...spec, kind: 'branded', photo: null, reason: 'branded:featured-asset-quality-pending' };
  return spec;
}
