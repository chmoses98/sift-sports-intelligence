import { describe, expect, it } from 'vitest';
import { resolveHero } from '../src/lib/hero/resolve';
import { heroTeam } from '../src/lib/hero/input';
import { broadcastHeroSpec } from '../src/components/sift2/heroArt';
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
});
