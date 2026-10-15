import { describe, expect, it } from 'vitest';
import { resolveHero } from '../src/lib/hero/resolve';
import { heroTeam } from '../src/lib/hero/input';
import { broadcastHeroSpec, venueArtProfile, venueImageSource } from '../src/components/sift2/heroArt';
import { VENUE_ART } from '../src/components/sift2/venueArt';
import { broadcastPlayerPhoto, playerFraming } from '../src/components/sift2/playerArt';
import { allPlayerImages } from '../src/lib/players';
import { venueById } from '../src/lib/hero/registry';
import type { HeroInput } from '../src/lib/hero/types';
const input = (home: string, away: string, venueName: string, neutral = false): HeroInput => ({ sport:'NFL',date:'2026-10-04T20:25:00Z', home:heroTeam('NFL',home,null),away:heroTeam('NFL',away,null),homeVerified:true,venueName,neutral });
describe('broadcast image curation',()=>{
  it('does not equate a licensed but flat frame with featured quality',()=>{
    const original=resolveHero(input('CHI','NYJ','Soldier Field'));
    expect(original.kind).toBe('photo');
    const curated=broadcastHeroSpec(original);
    expect(curated.kind).toBe('branded');
    expect(curated.photo).toBeNull();
    expect(curated.venue).toEqual(original.venue);
    expect(curated.home).toEqual(original.home);
  });
  it('uses the credited Arrowhead night frame only after the resolver validates a KC home venue',()=>{
    const curated=broadcastHeroSpec(resolveHero(input('KC','DEN','Arrowhead Stadium')));
    expect(curated.photo?.id).toBe('sift2-arrowhead-night');
    expect(curated.photo?.credit.license).toBe('CC BY-SA 4.0');
    for(const other of [input('LV','KC','Allegiant Stadium'),input('KC','DEN','Wembley Stadium',true)]) expect(broadcastHeroSpec(resolveHero(other)).photo?.id).not.toBe('sift2-arrowhead-night');
  });
  it('keeps venue profiles attached to registered physical venues and canonical team aliases',()=>{
    for(const p of VENUE_ART) expect(venueById(p.venue),p.venue).not.toBeNull();
    const rams=resolveHero(input('LA','SF','SoFi Stadium'));
    expect(venueArtProfile(rams)?.team).toBe('LAR');
  });
  it('uses separate hero and card crops without rewriting photography or event identity',()=>{
    const original=resolveHero(input('SF','DEN',"Levi's Stadium"));
    const hero=broadcastHeroSpec(original);const card=broadcastHeroSpec(original,'card');
    expect(hero.photo?.focus).not.toEqual(card.photo?.focus);
    expect(hero.photo?.credit).toEqual(original.photo?.credit);
    expect(hero.photo?.srcset).toEqual(original.photo?.srcset);
    expect(hero.venue).toEqual(original.venue);
    expect(venueArtProfile(resolveHero({...input('SF','DEN',"Levi's Stadium"),homeVerified:false}))).toBeNull();
  });
  it('keeps context-only photos out of heroes, but available to contextual cards',()=>{
    const original=resolveHero(input('CAR','DEN','Bank of America Stadium'));
    expect(broadcastHeroSpec(original).kind).toBe('branded');
    expect(broadcastHeroSpec(original,'card').kind).toBe('photo');
  });
  it('loads the smallest container-appropriate source including the 720px card file',()=>{
    const photo=broadcastHeroSpec(resolveHero(input('KC','DEN','Arrowhead Stadium'))).photo!;
    expect(venueImageSource(photo,340,2)).toContain('-720.webp');
    expect(venueImageSource(photo,390,3)).toContain('-1200.webp');
    expect(venueImageSource(photo,1224,1)).toContain('-1200.webp');
    expect(venueImageSource(photo,1224,2)).toContain('-2400.webp');
  });
  it('rejects id matches in the wrong uniform and uncurated warm-up frames',()=>{
    const p=allPlayerImages().find((p)=>p.id==='sf-brock-purdy')!;
    expect(broadcastPlayerPhoto(p.participant_id ?? '',p.name,'SF')).not.toBeNull();
    expect(broadcastPlayerPhoto(p.participant_id ?? '',p.name,'DEN')).toBeNull();
    expect(broadcastPlayerPhoto('','Tyson Bagent','CHI')).toBeNull();
    expect(broadcastPlayerPhoto('','Unpublished Player','SF')).toBeNull();
  });
  it('frames helmets and full-body portraits separately from landscape thumbnails',()=>{
    const nix=broadcastPlayerPhoto('','Bo Nix','DEN');
    expect(playerFraming(nix,'wide').focus).toBe('55% 0%');
    const kittle=broadcastPlayerPhoto('','George Kittle','SF');
    expect(playerFraming(kittle,'portrait').zoom).toBeGreaterThan(playerFraming(kittle,'driver').zoom);
    expect(playerFraming(null,'portrait').zoom).toBe(1);
  });
});
