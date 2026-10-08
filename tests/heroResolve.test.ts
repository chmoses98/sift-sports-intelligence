// resolveHero: what every game hero shows, decided once from stated facts. These cases are the contract: the Saints
// regression, shared buildings, neutral and international sites, unconfirmed home sides, venue moves and history.
// The photo registry is replaced by a synthetic one here so tenant-specific photos can be tested for every sport.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/hero/photos.json', () => ({
  default: {
    photos: [
      { id: 'nfl-no-superdome', sport: 'NFL', team: 'NO', venue: 'caesars-superdome', identity: 'Saints end zones', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Saints.jpg', modifications: 'm' } },
      { id: 'nfl-nyg-metlife', sport: 'NFL', team: 'NYG', venue: 'metlife-stadium', identity: 'Giants end zones', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Giants.jpg', modifications: 'm' } },
      { id: 'nba-bos-td-garden', sport: 'NBA', team: 'BOS', venue: 'td-garden', identity: 'Celtics parquet', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Celtics.jpg', modifications: 'm' } },
      { id: 'nfl-mia-hard-rock', sport: 'NFL', team: 'MIA', venue: 'hard-rock-stadium', identity: 'Dolphins end zones', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Dolphins.jpg', modifications: 'm' } },
      { id: 'nfl-ten-nissan-1999', sport: 'NFL', team: 'TEN', venue: 'nissan-stadium', to: '2027-06-01', identity: 'Titans', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Titans.jpg', modifications: 'm' } },
      { id: 'nfl-lar-sofi', sport: 'NFL', team: 'LAR', venue: 'sofi-stadium', identity: 'Rams end zones', w: 2400, h: 1600, widths: [2400, 1200], focus: { desktop: '50% 50%', mobile: '50% 50%' }, credit: { artist: 'A', license: 'CC BY 2.0', licenseUrl: null, source: 's', file: 'File:Rams.jpg', modifications: 'm' } },
    ],
  },
}));

const { resolveHero } = await import('../src/lib/hero/resolve');
const { heroInputFromResearch, heroTeam, publishedVenue } = await import('../src/lib/hero/input');
import type { HeroInput } from '../src/lib/hero/types';
import type { EventResearchDoc } from '../src/contract/types';

import names from '../scripts/heroes/team-names.json';
// Publications always carry display names ("New Orleans Saints"); the helper does too.
const NAMES = names as unknown as Record<string, Record<string, string>>;
const T = (sport: string, code: string) => heroTeam(sport, code, NAMES[sport]?.[code === 'LA' ? 'LAR' : code] ?? code)!;
const input = (sport: string, home: string, away: string, over: Partial<HeroInput> = {}): HeroInput => ({
  sport, date: '2026-10-11T17:00:00Z', home: T(sport, home), away: T(sport, away), homeVerified: true, venueName: null, neutral: null, ...over,
});

describe('the Saints regression', () => {
  it('a Saints home game at the Superdome is the Saints’ identity — never another event’s photo', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { venueName: 'Caesars Superdome', neutral: false }));
    expect(h.context).toBe('home');
    expect(h.home?.code).toBe('NO');
    expect(h.venue?.id).toBe('caesars-superdome');
    expect(h.photo?.id).toBe('nfl-no-superdome');
    expect(h.label).toBe('Saints home game');
  });
  it('the Superdome hosting someone else never borrows the Saints photo', () => {
    // A neutral-site game at the Superdome (a Super Bowl, a bowl game): both teams, no Saints identity, no Saints photo.
    const sb = resolveHero(input('NFL', 'KC', 'PHI', { venueName: 'Caesars Superdome', neutral: true }));
    expect(sb.context).toBe('neutral');
    expect(sb.photo).toBeNull();
    // Tulane played at the Superdome before 2014; not since: a 2026 Tulane game there is not a Tulane home venue.
    const tulane = resolveHero(input('CFB', 'TULN', 'MEM', { venueName: 'Caesars Superdome', neutral: false }));
    expect(tulane.context).toBe('home-elsewhere');
    expect(tulane.photo).toBeNull();
    expect(resolveHero(input('CFB', 'TULN', 'MEM', { date: '2010-10-02T17:00:00Z', venueName: 'Louisiana Superdome', neutral: false })).context).toBe('home');
  });
  it('former names still resolve (Mercedes-Benz Superdome)', () => {
    expect(resolveHero(input('NFL', 'NO', 'TB', { date: '2019-09-15T17:00:00Z', venueName: 'Mercedes-Benz Superdome' })).venue?.id).toBe('caesars-superdome');
  });
});

describe('shared buildings show the ACTUAL home team', () => {
  it('MetLife: the Giants photo is the Giants’, never the Jets’', () => {
    expect(resolveHero(input('NFL', 'NYG', 'DAL', { venueName: 'MetLife Stadium' })).photo?.id).toBe('nfl-nyg-metlife');
    const jets = resolveHero(input('NFL', 'NYJ', 'GB', { venueName: 'MetLife Stadium' }));
    expect(jets.home?.code).toBe('NYJ');
    expect(jets.context).toBe('home');
    expect(jets.photo).toBeNull();
    expect(jets.label).toBe('Jets home game');
  });
  it('SoFi: the Rams under either code; the Chargers get their own identity', () => {
    expect(resolveHero(input('NFL', 'LA', 'SF', { venueName: 'SoFi Stadium' })).photo?.id).toBe('nfl-lar-sofi');
    const lac = resolveHero(input('NFL', 'LAC', 'LV', { venueName: 'SoFi Stadium' }));
    expect(lac.photo).toBeNull();
    expect(lac.label).toBe('Chargers home game');
  });
  it('TD Garden: the Bruins never get the Celtics’ parquet', () => {
    const b = resolveHero(input('NHL', 'BOS', 'MTL', { venueName: 'TD Garden', neutral: false }));
    expect(b.context).toBe('home');
    expect(b.venue?.id).toBe('td-garden');
    expect(b.photo).toBeNull();
    expect(b.label).toBe('Bruins home game');
  });
  it('Hard Rock Stadium: a Miami Hurricanes game never shows the Dolphins', () => {
    const um = resolveHero(input('CFB', 'MIA', 'FSU', { venueName: 'Hard Rock Stadium' }));
    expect(um.context).toBe('home');
    expect(um.photo).toBeNull();
    // With no venue published, the Hurricanes' tenancy still finds Hard Rock — and still not the Dolphins photo.
    const um2 = resolveHero(input('CFB', 'MIA', 'FSU'));
    expect(um2.venue?.id).toBe('hard-rock-stadium');
    expect(um2.photo).toBeNull();
    expect(resolveHero(input('NFL', 'MIA', 'BUF')).photo?.id).toBe('nfl-mia-hard-rock');
  });
  it('hockey and football never trade buildings for shared abbreviations', () => {
    expect(resolveHero(input('NHL', 'CAR', 'NYR')).venue?.id).toBe('lenovo-center');
    expect(resolveHero(input('NFL', 'CAR', 'NO')).venue?.id).toBe('bank-of-america-stadium');
    expect(resolveHero(input('NHL', 'SEA', 'VAN')).venue?.id).toBe('climate-pledge-arena');
  });
});

describe('neutral sites and international games', () => {
  it('a stated neutral site shows both teams and nobody at home', () => {
    const h = resolveHero(input('NFL', 'WAS', 'IND', { venueName: 'Tottenham Hotspur Stadium', neutral: true }));
    expect(h.context).toBe('neutral');
    expect(h.kind).toBe('branded');
    expect(h.photo).toBeNull();
    expect(h.label).toBe('International game');
  });
  it('a neutral venue is neutral even when the feed does not flag it (MLB in Tokyo)', () => {
    const h = resolveHero(input('MLB', 'LAD', 'CHC', { venueName: 'Tokyo Dome' }));
    expect(h.context).toBe('neutral');
    expect(h.label).toBe('International game');
  });
  it('“location: Neutral” and accent-free spellings resolve (Maracana Stadium)', () => {
    expect(resolveHero(input('NFL', 'DAL', 'BAL', { venueName: 'Maracana Stadium', neutral: true })).venue?.id).toBe('maracana');
  });
  it('standing neutral rivalries never show a campus stadium, even with no venue published', () => {
    expect(resolveHero(input('CFB', 'OKLA', 'TEX', { date: '2026-10-10T16:00:00Z' })).context).toBe('neutral');
    expect(resolveHero(input('CFB', 'UGA', 'FLA', { date: '2026-10-31T19:30:00Z' })).context).toBe('neutral');
    expect(resolveHero(input('CFB', 'NAVY', 'ARMY', { date: '2026-12-12T20:00:00Z' })).context).toBe('neutral');
    // The same schools in another month (a home-and-home) are an ordinary home game.
    expect(resolveHero(input('CFB', 'TEX', 'OKLA', { date: '2026-09-12T16:00:00Z' })).context).toBe('home');
  });
  it('a named neutral event carries its own name (CBB tournaments)', () => {
    const h = resolveHero(input('CBB', 'VILL', 'ND', { venueName: 'Palazzo dello Sport', neutral: true, eventName: 'Eternal City Tip-Off' }));
    expect(h.context).toBe('neutral');
    expect(h.label).toBe('Eternal City Tip-Off');
  });
});

describe('home side not stated', () => {
  it('a display-order convention never makes anyone the home team', () => {
    const h = resolveHero(input('CFB', 'SHSU', 'NMSU', { homeVerified: false }));
    expect(h.context).toBe('matchup');
    expect(h.photo).toBeNull();
    expect(h.label).toBe('');
  });
  it('the CFB feed’s title-order games are read as unverified; stated ones are not', () => {
    const doc = (conf: string) => ({
      event: { event_id: 'e', start_time_utc: '2026-10-10T16:00:00Z', competition: 'FBS', status: 'SCHEDULED', venue: null, participants: [{ participant_id: 'a', short_name: 'MOSU', display_name: 'Missouri St.' }, { participant_id: 'h', short_name: 'DEL', display_name: 'Delaware' }], extensions: { home_away_confidence: conf, home_away_source: conf === 'stated' ? 'milestone_title_at' : 'event_title_order' } },
      participants: [{ participant_id: 'a', display_name: 'Missouri St.', home_away: 'AWAY' }, { participant_id: 'h', display_name: 'Delaware', home_away: 'HOME' }],
      context: null,
    }) as unknown as EventResearchDoc;
    expect(resolveHero(heroInputFromResearch(doc('convention'), 'CFB')).context).toBe('matchup');
    expect(resolveHero(heroInputFromResearch(doc('stated'), 'CFB')).context).toBe('home');
  });
  it('the home team comes from the stated home_away, never from the order participants are listed in', () => {
    const doc = (order: 'home-first' | 'away-first') => {
      const parts = [{ participant_id: 'h', display_name: 'New Orleans Saints', home_away: 'HOME' }, { participant_id: 'a', display_name: 'Atlanta Falcons', home_away: 'AWAY' }];
      return {
        event: { event_id: 'e', start_time_utc: '2026-10-06T00:15:00Z', status: 'SCHEDULED', venue: null, participants: [{ participant_id: 'a', short_name: 'ATL', display_name: 'Atlanta Falcons' }, { participant_id: 'h', short_name: 'NO', display_name: 'New Orleans Saints' }] },
        participants: order === 'home-first' ? parts : [...parts].reverse(),
        context: { venue: { name: 'Caesars Superdome', neutral_site: false } },
      } as unknown as EventResearchDoc;
    };
    for (const o of ['home-first', 'away-first'] as const) expect(resolveHero(heroInputFromResearch(doc(o), 'NFL')).home?.code).toBe('NO');
  });
});

describe('dates decide venues and photo eras', () => {
  it('old and new Highmark Stadium share a name; the date picks the building', () => {
    expect(resolveHero(input('NFL', 'BUF', 'MIA', { date: '2023-10-01T17:00:00Z' })).venue?.id).toBe('highmark-stadium-1973');
    expect(resolveHero(input('NFL', 'BUF', 'MIA', { date: '2023-10-01T17:00:00Z', venueName: 'Highmark Stadium' })).venue?.id).toBe('highmark-stadium-1973');
    expect(resolveHero(input('NFL', 'BUF', 'MIA', { venueName: 'Highmark Stadium' })).venue?.id).toBe('highmark-stadium');
  });
  it('the 1999 Titans photo never appears for the enclosed 2027 stadium', () => {
    expect(resolveHero(input('NFL', 'TEN', 'HOU', { date: '2026-11-01T18:00:00Z' })).photo?.id).toBe('nfl-ten-nissan-1999');
    const y27 = resolveHero(input('NFL', 'TEN', 'HOU', { date: '2027-11-07T18:00:00Z', venueName: 'Nissan Stadium' }));
    expect(y27.venue?.id).toBe('nissan-stadium-2027');
    expect(y27.photo).toBeNull();
  });
  it('clubs that moved: the Athletics and the Rays', () => {
    expect(resolveHero(input('MLB', 'ATH', 'SEA', { date: '2024-06-01T02:00:00Z' })).venue?.id).toBe('oakland-coliseum');
    expect(resolveHero(input('MLB', 'OAK', 'SEA', { date: '2024-06-01T02:00:00Z' })).venue?.id).toBe('oakland-coliseum');
    expect(resolveHero(input('MLB', 'ATH', 'SEA', { date: '2025-06-01T02:00:00Z' })).venue?.id).toBe('sutter-health-park');
    expect(resolveHero(input('MLB', 'TB', 'NYY', { date: '2025-06-01T23:00:00Z' })).venue?.id).toBe('steinbrenner-field');
    expect(resolveHero(input('MLB', 'TB', 'NYY', { date: '2026-06-01T23:00:00Z' })).venue?.id).toBe('tropicana-field');
  });
  it('a split season (Kansas 2024: Arrowhead and Children’s Mercy Park) never guesses which one', () => {
    const h = resolveHero(input('CFB', 'KU', 'TCU', { date: '2024-09-28T16:00:00Z' }));
    expect(h.context).toBe('home');
    expect(h.venue).toBeNull();
    expect(h.reason).toBe('branded:home:split-season');
  });
  it('Northwestern’s three homes', () => {
    expect(resolveHero(input('CFB', 'NW', 'IOWA', { date: '2022-10-01T16:00:00Z' })).venue?.id).toBe('ryan-field-1926');
    expect(resolveHero(input('CFB', 'NW', 'IOWA', { date: '2025-10-04T16:00:00Z' })).venue?.id).toBe('martin-stadium-nw');
    expect(resolveHero(input('CFB', 'NW', 'IOWA', { date: '2026-10-03T16:00:00Z' })).venue?.id).toBe('ryan-field');
  });
});

describe('unknown and incomplete venue data fail safe', () => {
  it('an unregistered building: the stated non-neutral home keeps its identity, never a photo', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { venueName: 'Somewhere Field', neutral: false }));
    expect(h.context).toBe('home');
    expect(h.photo).toBeNull();
    expect(h.venue?.name).toBe('Somewhere Field');
  });
  it('an unregistered building with no neutral flag is not claimed as the home venue', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { venueName: 'Somewhere Field' }));
    expect(h.context).toBe('home-elsewhere');
    expect(h.photo).toBeNull();
    expect(h.label).toBe('Hosted by the Saints');
  });
  it('a known building that is not the home team’s that day', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { venueName: 'Lambeau Field' }));
    expect(h.context).toBe('home-elsewhere');
    expect(h.photo).toBeNull();
  });
  it('postseason with no venue: the host’s identity, never its stadium photo', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { postseason: true }));
    expect(h.context).toBe('home-elsewhere');
    expect(h.photo).toBeNull();
  });
  it('a postseason game AT the home venue is still a home game (CFP first round, NFL playoffs)', () => {
    expect(resolveHero(input('NFL', 'NO', 'ATL', { postseason: true, venueName: 'Caesars Superdome', neutral: false })).photo?.id).toBe('nfl-no-superdome');
  });
  it('research not read yet: identity only, no venue guessed', () => {
    const h = resolveHero(input('NFL', 'NO', 'ATL', { pending: true }));
    expect(h.reason).toBe('branded:pending');
    expect(h.photo).toBeNull();
  });
  it('no home team at all (tennis): the event is the identity', () => {
    const h = resolveHero({ sport: 'TENNIS', date: '2026-10-08T10:00:00Z', home: null, away: null, homeVerified: false, venueName: 'Shanghai', neutral: null, eventName: 'Shanghai Masters' });
    expect(h.context).toBe('event');
    expect(h.label).toBe('Shanghai Masters');
  });
});

describe('every publication shape for venue and neutral site', () => {
  const doc = (context: unknown, evVenue: unknown = null, ext: unknown = {}) => ({ event: { venue: evVenue, extensions: ext }, context } as unknown as EventResearchDoc);
  it('NFL packet: venue.name + neutral_site', () => expect(publishedVenue(doc({ venue: { name: 'Soldier Field', neutral_site: false } }))).toEqual({ name: 'Soldier Field', neutral: false }));
  it('NFL schedule cache: venue.stadium + location', () => {
    expect(publishedVenue(doc({ venue: { stadium: 'Maracana Stadium', location: 'Neutral' } }))).toEqual({ name: 'Maracana Stadium', neutral: true });
    expect(publishedVenue(doc({ venue: { stadium: 'Ford Field', location: 'Home' } }))).toEqual({ name: 'Ford Field', neutral: false });
  });
  it('weather capture: weather.stadium', () => expect(publishedVenue(doc({ weather: { stadium: 'Lumen Field' } })).name).toBe('Lumen Field'));
  it('NHL: event.venue + the neutral_site extension', () => expect(publishedVenue(doc(null, 'United Center', { neutral_site: false }))).toEqual({ name: 'United Center', neutral: false }));
  it('MLB: event.venue string, no neutral flag', () => expect(publishedVenue(doc({ venue: { name: 'Petco Park', dome: false } }, 'Petco Park'))).toEqual({ name: 'Petco Park', neutral: null }));
  it('CFB: nothing published', () => expect(publishedVenue(doc(null))).toEqual({ name: null, neutral: null }));
});
