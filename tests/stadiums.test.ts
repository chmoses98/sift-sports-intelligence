// @vitest-environment node
// The stadium media system: the canonical venue manifest, event -> venue resolution (aliases, dates,
// neutral sites), the weather / roof decision rules, photo provenance and crop validation, and that every
// served stadium file is accounted for.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATHS, QUALITY_BAR, cropReport, fileWindow, imageSize, load, validatePhotos, validateVenues, visibleRect } from '../scripts/stadiums/lib.mjs';
import { allowedLayers, classifyForecast, gameLight, solarElevation, stadiumScene } from '../src/lib/stadium-scene';
import { allVenuePhotos, publishedVenue, resolveVenue, venueByName, venueForTeam, venuePhoto } from '../src/lib/venues';
import { readSnapshot } from './helpers';

const { venues, photos, targets } = load();
const SEASON = '2026-10-04T17:00:00Z';
const TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'];
const slug = (v: { slug: string } | null) => v?.slug ?? null;
const approved = JSON.parse(JSON.stringify(photos['nissan-stadium']));

describe('canonical venue manifest', () => {
  it('validates: one entry per physical venue, no ambiguous names, no overlapping tenancies', () => {
    expect(validateVenues(venues)).toEqual([]);
  });

  it('maps all 32 clubs to a home venue for the current season', () => {
    for (const t of TEAMS) expect(venueForTeam(t, SEASON), t).not.toBeNull();
    expect(slug(venueForTeam('LA', SEASON))).toBe('sofi-stadium');
    expect(slug(venueForTeam('LAC', SEASON))).toBe('sofi-stadium');
    expect(slug(venueForTeam('NYG', SEASON))).toBe(slug(venueForTeam('NYJ', SEASON)));
  });

  it('rejects a duplicated venue and a name two venues share at the same time', () => {
    const dup = [...venues, { ...venues[0] }];
    expect(validateVenues(dup).some((e) => /duplicate slug/.test(e))).toBe(true);
    const clash = [...venues, { ...venues.find((v) => v.slug === 'soldier-field')!, slug: 'soldier-field-copy', tenancies: [] , kind: 'neutral' }];
    expect(validateVenues(clash).some((e) => /ambiguous/.test(e))).toBe(true);
  });
});

describe('venue resolution', () => {
  it('resolves aliases and former names, ignoring case and punctuation', () => {
    expect(slug(venueByName('Reliant Stadium', SEASON))).toBe('nrg-stadium');
    expect(slug(venueByName('FedExField', SEASON))).toBe('northwest-stadium');
    expect(slug(venueByName('Heinz Field', SEASON))).toBe('acrisure-stadium');
    expect(slug(venueByName('levis stadium', SEASON))).toBe('levis-stadium');
    expect(slug(venueByName('Estadio Banorte', SEASON))).toBe('estadio-azteca');
    expect(slug(venueByName('Mercedes-Benz Superdome', SEASON))).toBe('caesars-superdome');
    expect(slug(venueByName('Mercedes-Benz Stadium', SEASON))).toBe('mercedes-benz-stadium');
  });

  it('the home venue comes from the team only when the publication names none', () => {
    const r = resolveVenue({ homeTeam: 'TB', published: publishedVenue({ venue: null, weather: null }), date: SEASON });
    expect(r).toMatchObject({ how: 'home-team', displayName: 'Raymond James Stadium' });
    expect(slug(r.venue)).toBe('raymond-james-stadium');
    // The capture shape that names the stadium under `stadium` (schedule cache) is read too.
    expect(publishedVenue({ venue: { location: 'Home', roof: 'closed', stadium: 'Lucas Oil Stadium' } }).name).toBe('Lucas Oil Stadium');
  });

  it('a neutral-site game uses the published venue, never the nominal home team', () => {
    const r = resolveVenue({ homeTeam: 'WAS', published: publishedVenue({ venue: { name: 'Tottenham Hotspur Stadium', neutral_site: true, roof: 'outdoors' } }), date: SEASON });
    expect(slug(r.venue)).toBe('tottenham-hotspur-stadium');
    // An unknown published venue stays unresolved (fallback artwork with its name), not Northwest Stadium.
    const u = resolveVenue({ homeTeam: 'WAS', published: publishedVenue({ venue: { name: 'Some Future Arena', neutral_site: true } }), date: SEASON });
    expect(u).toEqual({ venue: null, displayName: 'Some Future Arena', how: 'unresolved' });
    expect(venuePhoto(u.venue)).toBeNull();
    // Neutral with no name: nothing is guessed.
    expect(resolveVenue({ homeTeam: 'WAS', published: publishedVenue({ venue: { neutral_site: true } }), date: SEASON }).venue).toBeNull();
    // A temporary home the publication names (not neutral) is honoured over the tenancy.
    expect(slug(resolveVenue({ homeTeam: 'JAX', published: publishedVenue({ venue: { name: 'Raymond James Stadium', neutral_site: false } }), date: SEASON }).venue)).toBe('raymond-james-stadium');
  });

  it('splits a name two venues carried by the game date (historical mapping)', () => {
    expect(slug(venueByName('Highmark Stadium', '2025-11-02'))).toBe('highmark-stadium-1973');
    expect(slug(venueByName('Highmark Stadium', SEASON))).toBe('highmark-stadium');
    expect(slug(venueForTeam('BUF', '2025-11-02'))).toBe('highmark-stadium-1973');
    expect(slug(venueForTeam('BUF', SEASON))).toBe('highmark-stadium');
    expect(slug(venueByName('Ralph Wilson Stadium', '2010-10-03'))).toBe('highmark-stadium-1973');
    expect(slug(venueByName('Nissan Stadium', SEASON))).toBe('nissan-stadium');
    expect(slug(venueByName('Nissan Stadium', '2027-09-12'))).toBe('nissan-stadium-2027');
    expect(slug(venueForTeam('TEN', '2027-09-12'))).toBe('nissan-stadium-2027');
    // The 1999 stadium's photo never represents the enclosed 2027 stadium.
    expect(venuePhoto(venueForTeam('TEN', SEASON))?.id).toBe('nissan-stadium');
    expect(venuePhoto(venueForTeam('TEN', '2027-09-12'))).toBeNull();
  });

  it('every venue the bundled publication names resolves', () => {
    const index = readdirSync(join(PATHS.public, 'data', 'nfl', 'app', 'latest', 'explorer', 'events')).filter((f) => f.endsWith('.json'));
    let named = 0;
    for (const f of index) {
      const doc = readSnapshot<{ event: { start_time_utc: string }; context?: { venue?: unknown; weather?: unknown } }>(`explorer/events/${f}`);
      const pub = publishedVenue(doc.context);
      if (!pub.name) continue;
      named++;
      expect(venueByName(pub.name, doc.event.start_time_utc), pub.name).not.toBeNull();
    }
    expect(named).toBeGreaterThan(10);
  });
});

describe('weather and roof decision rules', () => {
  const v = (s: string) => venueByName(s, SEASON);
  const rain = { available: true, short_forecast: 'Rain', precipitation_probability: 90 };

  it('fixed dome: indoor, no precipitation, even if a capture says outdoors', () => {
    for (const roof of [null, 'dome', 'outdoors']) {
      const s = stadiumScene({ venue: v('Ford Field'), publishedRoof: roof, forecast: rain, kickoffUtc: SEASON });
      expect(s).toMatchObject({ exposure: 'indoor', precip: null, sky: null, label: 'Indoor' });
      expect(allowedLayers(s, { light: 'night' })).toEqual([]);
    }
  });

  it('retractable roof open: the outdoor forecast applies', () => {
    const s = stadiumScene({ venue: v('AT&T Stadium'), publishedRoof: 'open', forecast: rain, kickoffUtc: SEASON });
    expect(s).toMatchObject({ exposure: 'roof-open', precip: 'rain', label: 'Roof open' });
  });

  it('retractable roof closed: nothing falls on the field', () => {
    const s = stadiumScene({ venue: v('AT&T Stadium'), publishedRoof: 'closed', forecast: rain, kickoffUtc: SEASON });
    expect(s).toMatchObject({ exposure: 'roof-closed', precip: null, sky: null, label: 'Roof closed' });
    expect(allowedLayers(s, { light: 'day' })).toEqual([]);
  });

  it('retractable roof with unpublished status is not invented', () => {
    for (const roof of [null, '']) {
      const s = stadiumScene({ venue: v('NRG Stadium'), publishedRoof: roof, forecast: rain, kickoffUtc: SEASON });
      expect(s).toMatchObject({ exposure: 'roof-unknown', precip: null, sky: null, light: null });
      expect(allowedLayers(s, { light: 'day' })).toEqual([]);
    }
  });

  it('an unresolved venue with no published roof gets no weather layers', () => {
    const s = stadiumScene({ venue: null, publishedRoof: null, forecast: rain, kickoffUtc: SEASON });
    expect(s.exposure).toBe('unknown');
    expect(allowedLayers(s, { light: 'day' })).toEqual([]);
  });

  it('outdoor: sky, precipitation and night combine into one key', () => {
    const night = stadiumScene({ venue: v('Lumen Field'), publishedRoof: 'outdoors', forecast: rain, kickoffUtc: '2026-11-02T04:15:00Z' });
    expect(night.key).toBe('outdoor:rain:night');
    const day = stadiumScene({ venue: v('Soldier Field'), publishedRoof: 'outdoors', forecast: { available: true, short_forecast: 'Mostly Sunny', precipitation_probability: 4 }, kickoffUtc: '2026-10-04T17:00:00Z' });
    expect(day.key).toBe('outdoor:clear:day');
    const snow = stadiumScene({ venue: v('Lambeau Field'), forecast: { available: true, short_forecast: 'Snow', precipitation_probability: 80 }, kickoffUtc: '2026-12-20T18:00:00Z' });
    expect(snow).toMatchObject({ precip: 'snow', light: 'day' });
    expect(allowedLayers(snow, { light: 'day' })).toEqual(['overcast', 'snow']);
  });

  it('forecast classification commits to precipitation only when the forecast does', () => {
    expect(classifyForecast({ short_forecast: 'Chance Rain Showers', precipitation_probability: 30 })).toEqual({ sky: 'cloud', precip: null });
    expect(classifyForecast({ short_forecast: 'Rain Showers Likely', precipitation_probability: 70 })).toEqual({ sky: 'cloud', precip: 'rain' });
    expect(classifyForecast({ short_forecast: 'Chance Showers And Thunderstorms', precipitation_probability: 55 })).toEqual({ sky: 'cloud', precip: 'rain' });
    expect(classifyForecast({ short_forecast: 'Partly Sunny' })).toEqual({ sky: 'cloud', precip: null });
    expect(classifyForecast({ short_forecast: 'Sunny' })).toEqual({ sky: 'clear', precip: null });
    expect(classifyForecast({ available: false, short_forecast: 'Rain' })).toEqual({ sky: null, precip: null });
    expect(classifyForecast(null)).toEqual({ sky: null, precip: null });
  });

  it('light comes from the sun at the venue, not from a clock rule', () => {
    expect(solarElevation(0, 0, new Date('2026-03-20T12:00:00Z'))).toBeGreaterThan(80);
    expect(solarElevation(0, 0, new Date('2026-03-20T00:00:00Z'))).toBeLessThan(-80);
    const lambeau = venueByName('Lambeau Field', SEASON);
    expect(gameLight(lambeau, '2026-12-20T21:25:00Z')).toBe('night'); // 3:25 pm CST in December: dark by mid-game
    expect(gameLight(lambeau, '2026-09-13T17:00:00Z')).toBe('day');
    expect(gameLight(null, SEASON)).toBeNull();
  });

  it('never relights a photo: overcast only over a day photo; nothing over an indoor photo', () => {
    const cloudyNight = stadiumScene({ venue: v('Soldier Field'), forecast: { short_forecast: 'Cloudy' }, kickoffUtc: '2026-11-02T01:20:00Z' });
    expect(allowedLayers(cloudyNight, { light: 'night' })).toEqual([]);
    expect(allowedLayers(cloudyNight, { light: 'day' })).toEqual(['overcast']);
    expect(allowedLayers(cloudyNight, { light: 'indoor' })).toEqual([]);
  });
});

describe('photos: provenance, approval, crops and files', () => {
  it('the registry validates and every served file has an approved owner', () => {
    const r = validatePhotos(photos, venues, targets);
    expect(r.errors).toEqual([]);
    const served = readdirSync(join(PATHS.public, 'stadiums')).filter((f) => !f.startsWith('.'));
    for (const f of served) expect(r.owned.has(`stadiums/${f}`), `public/stadiums/${f} has no provenance`).toBe(true);
    expect(served.length).toBe(r.owned.size);
  });

  it('the 9 previously approved photos are preserved and still served', () => {
    const ids = allVenuePhotos().map((x) => x.photo.id).sort();
    expect(ids).toEqual(['allegiant-stadium', 'att-stadium', 'caesars-superdome', 'everbank-stadium', 'levis-stadium', 'lumen-field', 'mercedes-benz-stadium', 'nissan-stadium', 'state-farm-stadium']);
  });

  it('no broken asset reference: every served URL is a real file of the recorded size', () => {
    for (const { photo } of allVenuePhotos()) {
      for (const url of [photo.hero, photo.mobile, photo.card]) {
        const file = join(PATHS.public, url.replace(import.meta.env.BASE_URL, ''));
        expect(existsSync(file), url).toBe(true);
      }
      expect(imageSize(join(PATHS.public, photo.mobile.replace(import.meta.env.BASE_URL, ''))).width).toBeLessThan(imageSize(join(PATHS.public, photo.hero.replace(import.meta.env.BASE_URL, ''))).width);
    }
  });

  it('a venue with no approved photo falls back (no generic stand-in)', () => {
    for (const s of ['Highmark Stadium', 'Lambeau Field', 'Ford Field', 'Tottenham Hotspur Stadium']) expect(venuePhoto(venueByName(s, SEASON)), s).toBeNull();
    expect(venuePhoto(null)).toBeNull();
  });

  it('an approved photo needs provenance: author, licence, original, transformations, approval', () => {
    const cases: [string, (p: Record<string, any>) => void, RegExp][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      ['author', (p) => delete p.source.author, /author/],
      ['license', (p) => delete p.source.license, /license/],
      ['commons page', (p) => delete p.source.url, /source.url/],
      ['original size', (p) => delete p.source.original.width, /original/],
      ['transformations', (p) => (p.transformations = []), /transformations/],
      ['approval', (p) => delete p.approval, /approval/],
      ['owner original hash', (p) => (p.source = { ...p.source, kind: 'owner-supplied' }), /sha256/],
      ['captured light', (p) => delete p.captured.light, /captured/],
    ];
    for (const [name, mutate, re] of cases) {
      const p = JSON.parse(JSON.stringify(approved));
      mutate(p);
      const r = validatePhotos({ x: p }, venues, targets, { checkFiles: false });
      expect(r.errors.some((e) => re.test(e)), name).toBe(true);
    }
  });

  it('a candidate is never served and a standard-2 approval needs the full quality bar and safe crops', () => {
    const cand = { ...JSON.parse(JSON.stringify(approved)), status: 'candidate' };
    expect(validatePhotos({ c: cand }, venues, targets, { checkFiles: false }).errors.some((e) => /must not ship/.test(e))).toBe(true);
    const s2 = { ...JSON.parse(JSON.stringify(approved)), standard: 2 };
    const r = validatePhotos({ s: s2 }, venues, targets, { checkFiles: false });
    expect(r.errors.some((e) => /quality-bar/.test(e))).toBe(true);
    expect(r.errors.some((e) => /hero-desktop keeps/.test(e))).toBe(true);
    // Fix both: affirm the bar and draw a keep rectangle the desktop band and the phone crop both hold.
    s2.approval.quality_bar = Object.fromEntries(QUALITY_BAR.map((k) => [k, true]));
    s2.crop = { focus: { x: 0.5, y: 0.2 }, keep: { x0: 0.4, y0: 0.18, x1: 0.6, y1: 0.3 } };
    expect(validatePhotos({ s: s2 }, venues, targets, { checkFiles: false }).errors).toEqual([]);
  });

  it('a fixed-roof venue photo must be captured indoors', () => {
    const p = { ...JSON.parse(JSON.stringify(approved)), venue: 'ford-field' };
    expect(validatePhotos({ p }, venues, targets, { checkFiles: false }).errors.some((e) => /fixed roof/.test(e))).toBe(true);
  });

  it('crop metadata is valid and the mobile file is a 3:4 crop of the same photograph', () => {
    for (const [id, p] of Object.entries(photos).filter(([, x]) => x.status === 'approved')) {
      const { focus, keep } = p.crop;
      expect(focus.x >= 0 && focus.x <= 1 && focus.y >= 0 && focus.y <= 1, id).toBe(true);
      expect(keep.x0 < keep.x1 && keep.y0 < keep.y1, id).toBe(true);
      expect(Math.abs(p.files.mobile.width / p.files.mobile.height - 0.75), id).toBeLessThan(0.01);
      expect(p.files.card.width / p.files.card.height).toBeCloseTo(1.5, 2);
      expect(cropReport(p, targets).map((r) => r.id)).toEqual(targets.targets.map((t) => t.id));
    }
  });

  it('crop geometry: object-position semantics and cover fitting', () => {
    const crop = { focus: { x: 0.5, y: 0.5 }, keep: { x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 } };
    expect(fileWindow('desktop', 1.5, crop, targets)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    const m = fileWindow('mobile', 1.5, crop, targets);
    expect(m.x1 - m.x0).toBeCloseTo(0.5, 5); // 0.75 / 1.5
    expect(m.x0).toBeCloseTo(0.25, 5);
    // A 6:1 band at y = 0% shows the top sixth-ish of a 3:2 photo; at 100% the bottom.
    const top = visibleRect({ x0: 0, y0: 0, x1: 1, y1: 1 }, 1.5, 6, { x: 0.5, y: 0 });
    expect(top.y0).toBe(0);
    expect(top.y1).toBeCloseTo(0.25, 5);
    const bottom = visibleRect({ x0: 0, y0: 0, x1: 1, y1: 1 }, 1.5, 6, { x: 0.5, y: 1 });
    expect(bottom.y1).toBeCloseTo(1, 5);
  });
});
