// Indoor/outdoor weather and roof facts (issues 3 and 18). The publication rows below are copied from the live NFL
// publication of 2026-10-11 (week 5): a retractable roof published with a blank roof field, a London game carrying the
// home team's Jacksonville forecast, domes, open-air stadiums; plus the nflverse quirks (open-air international
// stadiums listed as domes) and the MLB / CFB / NHL shapes.
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { VENUES } from '../src/lib/hero/registry';
import { resolveHero } from '../src/lib/hero/resolve';
import { heroInputFromResearch, heroTeam } from '../src/lib/hero/input';
import { forecastMismatch, isoOffset, publishedRoof, resolveRoof, venueWeather, venueWeatherLine, zoneOffset } from '../src/lib/venue';
import { homeVenueFact, VENUE_FACTS, venueFact } from '../src/lib/venueFacts';
import { MLB_CLUBS } from '../src/lib/mlb';

/* eslint-disable @typescript-eslint/no-explicit-any */

const KICK = '2026-10-11T20:25:00Z';
const doc = (ctx: { venue?: any; weather?: any }, start = KICK): Pick<EventResearchDoc, 'context'> & { event: { start_time_utc: string } } =>
  ({ context: { injuries: [], lineups: [], notes: [], venue: ctx.venue ?? null, weather: ctx.weather ?? null } as any, event: { start_time_utc: start } });
const wxRow = (over: Record<string, unknown>) => ({ available: true, temperature_f: 85, short_forecast: 'Patchy Blowing Dust', wind: '25 mph', wind_direction: 'SSW', precipitation_probability: 39, period_start: '2026-10-11T13:00:00-07:00', ...over });
const v = (id: string) => { const r = VENUES.find((x) => x.id === id)!; return { id: r.id, name: r.name, roof: r.roof }; };

const NFL_2026 = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LA', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];

describe('venue facts table', () => {
  it('covers every NFL club and every MLB club with roof, city and time zone', () => {
    for (const t of NFL_2026) {
      const f = homeVenueFact('NFL', t);
      expect(f, t).toBeTruthy();
      expect(f!.city && f!.tz && f!.roof, t).toBeTruthy();
    }
    expect(Object.keys(MLB_CLUBS)).toHaveLength(30);
    for (const t of Object.keys(MLB_CLUBS)) expect(homeVenueFact('MLB', t), t).toBeTruthy();
  });

  it('knows the NFL roofs that matter (domes, retractables) and the open-air rest', () => {
    const roof = (t: string) => homeVenueFact('NFL', t)!.roof;
    for (const t of ['DET', 'LV', 'LAC', 'LA', 'MIN', 'NO']) expect(roof(t), t).toBe('dome');
    for (const t of ['ARI', 'ATL', 'DAL', 'HOU', 'IND']) expect(roof(t), t).toBe('retractable');
    expect(NFL_2026.filter((t) => roof(t) === 'open')).toHaveLength(32 - 11);
  });

  it('agrees with the hero venue registry on every venue both know (no silent disagreement)', () => {
    const norm = (r: string) => (r === 'outdoor' ? 'open' : r);
    const diffs = VENUE_FACTS.flatMap((f) => {
      const reg = VENUES.find((x) => x.id === f.id);
      return reg && norm(reg.roof) !== f.roof ? [`${f.id}: registry ${reg.roof}, table ${f.roof}`] : [];
    });
    expect(diffs).toEqual([]);
  });

  it('ids are unique and every row names a valid IANA zone', () => {
    expect(new Set(VENUE_FACTS.map((f) => f.id)).size).toBe(VENUE_FACTS.length);
    for (const f of VENUE_FACTS) expect(zoneOffset(f.tz, KICK), f.id).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it('resolves nflverse spellings and former names', () => {
    expect(venueFact('Reliant Stadium')!.id).toBe('nrg-stadium');
    expect(venueFact('Bernabeu')!.roof).toBe('retractable');
    expect(venueFact('FC Bayern Munich Stadium')!.roof).toBe('open');
    expect(venueFact('Tottenham Stadium')!.country).toBe('GB');
    expect(venueFact('Estadio Banorte')!.id).toBe('estadio-azteca');
    expect(venueFact('Carrier Dome')!.roof).toBe('dome');
    expect(venueFact('Nowhere Field')).toBeNull();
  });
});

describe('roof resolution', () => {
  it('reads the publication roof words; blank means not published', () => {
    expect(publishedRoof('')).toBeNull();
    expect(publishedRoof(null)).toBeNull();
    expect(publishedRoof('Dome')).toBe('dome');
    expect(publishedRoof('outdoors')).toBe('outdoors');
    expect(publishedRoof('closed')).toBe('closed');
  });

  it('publication status wins for a retractable roof; construction wins a contradiction, which is reported', () => {
    expect(resolveRoof('closed', 'retractable')).toMatchObject({ state: 'roof-closed', conflict: null, source: 'publication' });
    expect(resolveRoof('open', 'retractable')).toMatchObject({ state: 'roof-open', conflict: null });
    expect(resolveRoof('', 'retractable')).toMatchObject({ state: 'retractable', conflict: null });
    expect(resolveRoof('dome', 'open').state).toBe('outdoors');
    expect(resolveRoof('dome', 'open').conflict).toMatch(/lists this game as a dome; the venue is open-air/);
    expect(resolveRoof('outdoors', 'dome').state).toBe('indoor');
    expect(resolveRoof('outdoors', 'dome').conflict).toMatch(/fixed-roof dome/);
    expect(resolveRoof('outdoors', 'retractable')).toMatchObject({ state: 'retractable' });
    expect(resolveRoof('outdoors', 'retractable').conflict).toBeTruthy();
    expect(resolveRoof('dome', null)).toMatchObject({ state: 'indoor', source: 'publication' });
    expect(resolveRoof(null, null)).toMatchObject({ state: 'unknown', source: null });
  });
});

describe('kickoff weather by venue', () => {
  it('the reported defect: Lions at Cardinals, State Farm Stadium, roof field blank → retractable, forecast as context only', () => {
    const wx = venueWeather(doc({ venue: { name: 'State Farm Stadium', roof: '', neutral_site: false }, weather: wxRow({ roof: '', stadium: 'State Farm Stadium', material: true }) }), v('state-farm-stadium'));
    expect(wx.kind).toBe('retractable');
    expect(wx.condition).toBe('Retractable roof');
    expect(wx.flag).toBeNull(); // 25 mph wind is not a game condition under a roof that may be closed
    expect(wx.note).toMatch(/Roof status not announced/);
    expect(wx.outside).toMatch(/85° Patchy Blowing Dust · wind 25 mph SSW · 39% precipitation/);
    const line = venueWeatherLine(wx)!;
    expect(line).toMatch(/^Retractable roof · roof status not announced/);
    expect(line).not.toMatch(/Blowing Dust|wind 25/);
  });

  it('a retractable roof the publication says is closed is indoors; open shows the forecast as context', () => {
    const closed = venueWeather(doc({ venue: { name: 'Lucas Oil Stadium', roof: 'closed' }, weather: wxRow({ period_start: '2026-10-11T13:00:00-04:00' }) }), v('lucas-oil-stadium'));
    expect(closed).toMatchObject({ kind: 'indoor', condition: 'Roof closed', temp: null, flag: null });
    const open = venueWeather(doc({ venue: { name: 'AT&T Stadium', roof: 'open' }, weather: wxRow({ period_start: '2026-10-11T15:00:00-05:00', wind: '6 mph' }) }), v('att-stadium'));
    expect(open.kind).toBe('outdoor');
    expect(open.note).toMatch(/^Roof open · context only/);
    expect(venueWeatherLine(open)).toMatch(/^Roof open · 85°/);
  });

  it('domes never show outdoor weather, even when a forecast row exists', () => {
    for (const [id, name] of [['sofi-stadium', 'SoFi Stadium'], ['caesars-superdome', 'Caesars Superdome'], ['ford-field', 'Ford Field']]) {
      const wx = venueWeather(doc({ venue: { name, roof: '' }, weather: wxRow({ period_start: '2026-10-11T13:00:00-07:00' }) }), v(id));
      expect(wx, id).toMatchObject({ kind: 'indoor', condition: 'Indoors · dome', temp: null, wind: null, flag: null });
      expect(venueWeatherLine(wx)).toBe('Indoors · dome');
    }
  });

  it('open-air stadiums show the forecast labelled as context, with the material-weather flag', () => {
    const wx = venueWeather(doc({ venue: { name: 'MetLife Stadium', roof: 'outdoors' }, weather: wxRow({ temperature_f: 61, short_forecast: 'Rain', wind: '10 mph', precipitation_probability: 84, period_start: '2026-10-11T13:00:00-04:00' }) }, '2026-10-11T17:00:00Z'), v('metlife-stadium'));
    expect(wx).toMatchObject({ kind: 'outdoor', roof: 'outdoors', temp: 61, flag: 'Rain likely', note: 'Context only · not in the projection' });
  });

  it('international game: a London kickoff carrying the home team\'s US (Eastern) forecast is withheld, not shown', () => {
    const r = doc({ venue: { name: 'Tottenham Hotspur Stadium', roof: 'outdoors', neutral_site: false }, weather: wxRow({ temperature_f: 76, short_forecast: 'Chance Showers And Thunderstorms', period_start: '2026-10-11T09:00:00-04:00', stadium: 'Tottenham Hotspur Stadium' }) }, '2026-10-11T13:30:00Z');
    const wx = venueWeather(r, v('tottenham-hotspur-stadium'));
    expect(wx.kind).toBe('none');
    expect(wx.temp).toBeNull();
    expect(wx.withheld).toMatch(/different place .*UTC-04:00.*London, UK is in UTC\+01:00/);
    expect(venueWeatherLine(wx)).toBeNull();
  });

  it('time-zone check: Arizona (no DST) matches, an Eastern forecast for Phoenix does not', () => {
    const f = venueFact('State Farm Stadium');
    expect(forecastMismatch({ period_start: '2026-10-11T13:00:00-07:00' }, f, KICK)).toBeNull();
    expect(forecastMismatch({ period_start: '2026-10-11T16:00:00-04:00' }, f, KICK)).toMatch(/different place/);
    expect(isoOffset('2026-10-11T13:00:00Z')).toBe('+00:00');
    expect(zoneOffset('Europe/London', '2026-12-01T12:00:00Z')).toBe('+00:00');
  });

  it('neutral and international sites listed as domes by nflverse stay open-air, and the disagreement is carried', () => {
    const wx = venueWeather(doc({ venue: { name: 'Melbourne Cricket Ground', roof: 'dome', neutral_site: true } }, '2026-09-10T09:00:00Z'), v('melbourne-cricket-ground'));
    expect(wx.roof).toBe('outdoors');
    expect(wx.conflict).toMatch(/dome; the venue is open-air/);
    expect(wx.kind).toBe('none');
  });

  it('a neutral-site game resolves the published venue, not the home team\'s stadium', () => {
    const r = {
      ...doc({ venue: { name: 'Wembley Stadium', roof: 'outdoors', neutral_site: true } }, '2026-10-18T13:30:00Z'),
      event: { start_time_utc: '2026-10-18T13:30:00Z', participants: [{ participant_id: 'a', short_name: 'HOU' }, { participant_id: 'h', short_name: 'JAX' }], extensions: {}, competition: '2026 REG week 6' },
      participants: [{ participant_id: 'a', home_away: 'AWAY', display_name: 'Houston Texans' }, { participant_id: 'h', home_away: 'HOME', display_name: 'Jacksonville Jaguars' }],
    } as unknown as EventResearchDoc;
    const spec = resolveHero(heroInputFromResearch(r, 'NFL'));
    expect(spec.venue?.id).toBe('wembley-stadium');
    const wx = venueWeather(r, spec.venue);
    expect(wx.venue?.country).toBe('GB');
    expect(wx.kind).toBe('none');
    expect(wx.note).toBe('No forecast in this publication');
  });

  it('CFB (no weather published): indoor venues still say indoors; open-air ones say no forecast is published', () => {
    const cuse = venueWeather(doc({}), { id: 'jma-wireless-dome', name: 'JMA Wireless Dome', roof: 'dome' });
    expect(cuse).toMatchObject({ kind: 'indoor', condition: 'Indoors · dome' });
    const ohio = venueWeather(doc({}), { id: 'ohio-stadium', name: 'Ohio Stadium', roof: 'outdoor' });
    expect(ohio).toMatchObject({ kind: 'none', roof: 'outdoors', roofSource: 'venue registry', note: 'No forecast in this publication' });
  });

  it('MLB: a retractable park with no published weather says so; Tokyo Dome is indoors', () => {
    const mil = venueWeather(doc({ venue: { name: 'American Family Field' } }), { id: 'american-family-field', name: 'American Family Field', roof: 'retractable' });
    expect(mil).toMatchObject({ kind: 'retractable', temp: null, note: 'Roof status not announced', outside: null });
    expect(venueWeatherLine(mil)).toBe('Retractable roof · roof status not announced');
    const tokyo = venueWeather(doc({ venue: { name: 'Tokyo Dome' } }), { id: 'tokyo-dome', name: 'Tokyo Dome', roof: 'dome' });
    expect(tokyo.kind).toBe('indoor');
  });

  it('NHL arenas read "Indoor arena", never "dome"', () => {
    const wx = venueWeather(doc({}), { id: 'td-garden', name: 'TD Garden', roof: 'dome' });
    expect(wx).toMatchObject({ kind: 'indoor', condition: 'Indoor arena' });
  });

  it('a capture that failed says why, in words', () => {
    const wx = venueWeather(doc({ venue: { name: null }, weather: { available: false, reason: 'no weather row captured for this game' } }), null);
    expect(wx.kind).toBe('none');
    expect(wx.note).toBe('No forecast captured yet (no weather row captured for this game).');
  });

  it('heroTeam is unaffected (sanity: the module graph loads)', () => expect(heroTeam('NFL', 'ARI', 'Arizona Cardinals')?.code).toBe('ARI'));
});

describe('soccer weather line', () => {
  it('open-air grounds show the metric capture labelled as context; retractable and dome venues say so', async () => {
    const { soccerWeatherLine } = await import('../src/lib/venue');
    expect(soccerWeatherLine('Anfield', { temperature_2m: 12.4, precipitation_probability: 20, wind_speed_10m: 14.6 })).toBe('12°C, 20% rain, wind 15 km/h (context only)');
    expect(soccerWeatherLine('Estadio Santiago Bernabéu', { temperature_2m: 18 })).toBe('Retractable roof · roof status not announced · 18°C outside');
    expect(soccerWeatherLine('Tokyo Dome', { temperature_2m: 18 })).toBe('Indoors · dome');
    expect(soccerWeatherLine('Anfield', null)).toBeNull();
  });
});

describe('upstream roof and venue fields (nfl-edge-finder PR #138), read when present', () => {
  it('roof_status CLOSED / OPEN settles a retractable roof the per-game roof field leaves blank; UNKNOWN keeps it open', () => {
    const closed = venueWeather(doc({ venue: { name: 'State Farm Stadium', roof: '' }, weather: wxRow({ roof: '', roof_type: 'retractable', roof_status: 'CLOSED' }) }), v('state-farm-stadium'));
    expect(closed).toMatchObject({ kind: 'indoor', condition: 'Roof closed', temp: null });
    const open = venueWeather(doc({ venue: { name: 'State Farm Stadium', roof: '' }, weather: wxRow({ roof: '', roof_type: 'retractable', roof_status: 'OPEN', wind: '6 mph' }) }), v('state-farm-stadium'));
    expect(open.kind).toBe('outdoor');
    expect(open.note).toMatch(/^Roof open/);
    const unknown = venueWeather(doc({ venue: { name: 'State Farm Stadium', roof: '' }, weather: wxRow({ roof: '', roof_type: 'retractable', roof_status: 'UNKNOWN', material: false }) }), v('state-farm-stadium'));
    expect(unknown).toMatchObject({ kind: 'retractable', flag: null });
  });

  it('roof_status OPEN on an open-air stadium is not read as "roof open"', () => {
    const wx = venueWeather(doc({ venue: { name: 'MetLife Stadium', roof: '' }, weather: wxRow({ roof: '', roof_type: 'open', roof_status: 'OPEN', period_start: '2026-10-11T13:00:00-04:00' }) }, '2026-10-11T17:00:00Z'), v('metlife-stadium'));
    expect(wx).toMatchObject({ kind: 'outdoor', roof: 'outdoors', note: 'Context only · not in the projection' });
  });

  it('roof_type stands in for construction when Sift does not know the venue', () => {
    const wx = venueWeather(doc({ venue: { name: 'Some New Stadium', roof: '' }, weather: wxRow({ roof: '', roof_type: 'dome', stadium: 'Some New Stadium' }) }), null);
    expect(wx).toMatchObject({ kind: 'indoor', roofSource: 'publication', temp: null });
  });

  it('venue_is_home_stadium: false withholds any forecast, even in the same time zone (backlog 6.6)', () => {
    // A same-zone wrong venue: the offset check alone would pass this Eastern forecast for an Eastern stadium.
    const wx = venueWeather(doc({ venue: { name: 'MetLife Stadium', roof: 'outdoors' }, weather: wxRow({ venue_is_home_stadium: false, period_start: '2026-10-11T13:00:00-04:00' }) }, '2026-10-11T17:00:00Z'), v('metlife-stadium'));
    expect(wx.kind).toBe('none');
    expect(wx.temp).toBeNull();
    expect(wx.withheld).toMatch(/not at the home team’s stadium/);
    // PR #138's shape: no forecast fields at all, only the note.
    const bare = venueWeather(doc({ venue: { name: 'Tottenham Hotspur Stadium', roof: 'outdoors' }, weather: { available: true, roof: 'outdoors', venue_is_home_stadium: false, material: false } }), v('tottenham-hotspur-stadium'));
    expect(bare).toMatchObject({ kind: 'none', note: expect.stringMatching(/captured no forecast for this venue/) });
    expect(venueWeatherLine(bare)).toBeNull();
  });
});
