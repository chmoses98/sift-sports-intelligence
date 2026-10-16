import type { HeroPhoto } from '../../lib/hero/types';

export type ArtTone = 'daylight' | 'night' | 'indoor' | 'neutral';
export type ArtSurface = 'hero' | 'card';
export interface VenueArtProfile {
  sport: string; team: string; venue: string;
  quality: 'featured' | 'context' | 'replacement-needed';
  tone: ArtTone;
  hero: { desktop: string; mobile: string };
  card: { desktop: string; mobile: string };
  review: string;
  replacement?: string;
  photo?: HeroPhoto;
}
const BASE = `${import.meta.env.BASE_URL}sift2/venues/`;
const focal = (desktop: string, mobile = desktop) => ({ desktop, mobile });
/** Art-direction review is separate from the core registry's venue, tenancy, era and licence gates. */
export const VENUE_ART: VenueArtProfile[] = [
  { sport:'NFL',team:'KC',venue:'arrowhead-stadium',quality:'featured',tone:'night',hero:focal('50% 59%','58% 63%'),card:focal('50% 65%'),review:'Wide corner bowl; Chiefs identity and original night lighting. Dusk skyline still missing.',photo:{
    id:'sift2-arrowhead-night',srcset:[2400,1200].map((w)=>({src:`${BASE}arrowhead-night-${w}.webp`,w})),card:`${BASE}arrowhead-night-720.webp`,width:2400,height:1800,
    focus:focal('50% 59%','58% 63%'),identity:'Chiefs end zone, Arrowhead bowl and Chiefs midfield flag during a night-game entrance',
    credit:{artist:'Kj1595',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',source:'https://commons.wikimedia.org/wiki/File:Arrowhead_Stadium_(October_27,_2019_-_7).jpg',file:'File:Arrowhead Stadium (October 27, 2019 - 7).jpg',modifications:'Resized to WebP. CSS contrast/saturation and readability gradients; no synthetic scene content.'},
  } },
  { sport:'NFL',team:'SF',venue:'levis-stadium',quality:'featured',tone:'daylight',hero:focal('50% 39%','53% 44%'),card:focal('50% 47%'),review:'Authentic corner bowl and strong home identity; preserve daylight and natural whites.',replacement:'Licensed dusk corner-bowl alternative, at least 2400px wide.' },
  { sport:'NFL',team:'MIN',venue:'us-bank-stadium',quality:'featured',tone:'indoor',hero:focal('50% 72%','57% 70%'),card:focal('52% 70%'),review:'Prefer the field and crowd over the large roof; preserve enclosed-stadium lighting.' },
  { sport:'NFL',team:'DAL',venue:'att-stadium',quality:'featured',tone:'indoor',hero:focal('50% 54%','44% 58%'),card:focal('50% 58%'),review:'Keep star, crowd and real videoboard in frame.' },
  { sport:'NFL',team:'LAR',venue:'sofi-stadium',quality:'featured',tone:'indoor',hero:focal('50% 62%','46% 65%'),card:focal('50% 65%'),review:'Rams home configuration; preserve the oval scoreboard and field.' },
  { sport:'NFL',team:'ARI',venue:'state-farm-stadium',quality:'featured',tone:'night',hero:focal('50% 55%','55% 58%'),card:focal('50% 60%'),review:'Real roof lighting and Cardinals end zone; retain original ambience.' },
  { sport:'NFL',team:'TEN',venue:'nissan-stadium',quality:'featured',tone:'night',hero:focal('49% 55%','45% 58%'),card:focal('50% 60%'),review:'Original outdoor night frame; core registry limits it to the 1999 building.' },
  { sport:'NFL',team:'NO',venue:'caesars-superdome',quality:'featured',tone:'indoor',hero:focal('50% 55%','50% 57%'),card:focal('50% 58%'),review:'Saints home identity and actual dome lighting.' },
  { sport:'NFL',team:'NYJ',venue:'metlife-stadium',quality:'featured',tone:'night',hero:focal('50% 44%','52% 46%'),card:focal('50% 50%'),review:'Jets home configuration; lighting and fireworks are in the original photograph.' },
  { sport:'NFL',team:'JAX',venue:'everbank-stadium',quality:'featured',tone:'night',hero:focal('50% 48%','55% 50%'),card:focal('50% 55%'),review:'Verified Jaguars identity; keep end zone visible without excessive shadow.' },
  { sport:'NFL',team:'CAR',venue:'bank-of-america-stadium',quality:'context',tone:'daylight',hero:focal('50% 45%'),card:focal('50% 44%'),review:'Anthem/flag composition is usable context, not a premium featured frame.',replacement:'Unobstructed corner-bowl game-day image with field and sky.' },
  { sport:'NFL',team:'WAS',venue:'northwest-stadium',quality:'context',tone:'night',hero:focal('50% 50%'),card:focal('50% 46%'),review:'Field-level context; not a wide cinematic hero.',replacement:'Wide corner-bowl night image showing Commanders identity.' },
  ...([
    ['CHI','soldier-field','Washed-out interior; licensed but below featured quality.','High-contrast corner-bowl night/dusk interior with Bears identity.'],
    ['BAL','mt-bank-stadium','Grey, flat frame with little useful negative space.','Licensed night/dusk corner bowl with Ravens identity.'],
    ['GB','lambeau-field','Field-level players rather than a stadium composition.','Unobstructed wide corner-bowl game-day frame.'],
  ] as const).map(([team,venue,review,replacement]): VenueArtProfile=>({sport:'NFL',team,venue,quality:'replacement-needed',tone:'neutral',hero:focal('50% 50%'),card:focal('50% 50%'),review,replacement})),
];
