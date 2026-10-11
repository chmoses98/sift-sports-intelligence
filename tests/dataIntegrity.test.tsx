// Injury provenance (issue 33), plain-language labels (issue 35) and data-availability states (issue 43).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { designation, injuryAge, injurySource, injurySourceName, spanWords } from '../src/lib/injurySource';
import { availabilitySentence, authorityLabel, capabilityLabel, healthLabel, humanize, modelVersionLabel, modelVersionShort, qualityLabel } from '../src/lib/plainLabels';
import { DesignationKey, InjurySource } from '../src/components/InjurySource';
import { DataState } from '../src/components/DataState';
import { QualityBadge } from '../src/components/ui';
import { HealthPill } from '../src/components/SourceBanner';

const NOW = Date.parse('2026-10-11T03:23:45Z');

describe('injury source and age', () => {
  it('names the provider in words and keeps the publication qualifier as a sentence', () => {
    expect(injurySourceName('espn')).toEqual({ name: 'ESPN injury report', caveat: null });
    expect(injurySourceName('espn_injuries (official NBA report not captured)')).toEqual({ name: 'ESPN injury report', caveat: 'The official league injury report is not captured; this list can lag it.' });
    expect(injurySourceName('ESPN injuries (archive context/injuries; name-matched)').caveat).toBe('Players are matched to the list by name.');
    expect(injurySourceName(null).name).toBe('Source not named');
    expect(injurySourceName('team_site_feed').name).toBe('team site feed');
  });

  it('fresh up to 6 h, aging up to 24 h, stale after; unknown without a time', () => {
    expect(injuryAge('2026-10-11T00:23:45Z', NOW)).toBe('fresh');
    expect(injuryAge('2026-10-10T21:23:45Z', NOW)).toBe('fresh'); // exactly 6 h
    expect(injuryAge('2026-10-10T21:23:44Z', NOW)).toBe('aging');
    expect(injuryAge('2026-10-10T03:23:45Z', NOW)).toBe('aging'); // exactly 24 h
    expect(injuryAge('2026-10-09T00:00:00Z', NOW)).toBe('stale');
    expect(injuryAge(null, NOW)).toBe('unknown');
    expect(injuryAge('not a time', NOW)).toBe('unknown');
  });

  it('uses the newest capture across rows and says its age in words', () => {
    const s = injurySource([{ source: 'espn', as_of: '2026-10-10T12:00:00Z' }, { source: 'espn', as_of: '2026-10-11T00:23:45Z' }], NOW);
    expect(s).toMatchObject({ name: 'ESPN injury report', asOf: '2026-10-11T00:23:45Z', age: 'fresh', ageWord: 'Fresh', ageText: 'captured 3 h ago' });
    expect(injurySource([], NOW)).toMatchObject({ age: 'unknown', ageText: 'capture time not published' });
    expect(spanWords(40 * 60_000)).toBe('40 min');
    expect(spanWords(72 * 3600_000)).toBe('3 days');
  });

  it('official designations in words with what they mean', () => {
    expect(designation('OUT')).toMatchObject({ word: 'Out', meaning: 'will not play' });
    expect(designation('INJURED_RESERVE').word).toBe('Injured reserve');
    expect(designation('Injured Reserve').word).toBe('Injured reserve');
    expect(designation('QUESTIONABLE').meaning).toBe('uncertain to play');
    expect(designation('DAY_TO_DAY').word).toBe('Day to day');
  });

  it('renders source, capture age and the designation key; a stale list says it may have changed', () => {
    render(<InjurySource rows={[{ source: 'espn', as_of: '2026-10-09T00:00:00Z' }]} sport="NFL" now={NOW} />);
    const note = screen.getByRole('note', { name: 'Injury list source' });
    expect(note.textContent).toMatch(/ESPN injury report/);
    expect(note.textContent).toMatch(/Stale/);
    expect(note.textContent).toMatch(/designations may have changed/);
    expect(note.textContent).toMatch(/official game status/);
    expect(note.textContent).toMatch(/90 minutes before kickoff/);
    render(<DesignationKey statuses={['OUT', 'QUESTIONABLE', 'ACTIVE', 'OUT']} />);
    const key = screen.getByRole('list', { name: 'What the designations mean' });
    expect(key.querySelectorAll('li')).toHaveLength(2);
    expect(key.textContent).toBe('Outwill not playQuestionableuncertain to play');
  });
});

describe('plain labels', () => {
  it('quality, health and authority codes become words', () => {
    expect(qualityLabel('PARTIAL').word).toBe('Incomplete');
    expect(qualityLabel('UNAVAILABLE').word).toBe('Not published');
    expect(qualityLabel('SOMETHING_NEW').word).toBe('Something new');
    expect(healthLabel('RESEARCH_ONLY').word).toBe('Research only');
    expect(healthLabel('STALE').word).toBe('Out of date');
    expect(authorityLabel('RESEARCH_ONLY')).toBe('Research only');
    expect(authorityLabel('ACTIONABLE')).toBe('Actionable');
    expect(authorityLabel(null)).toBe('Research only');
    expect(humanize('NOT_IN_MODEL')).toBe('Not in model');
  });

  it('model versions read as model names', () => {
    expect(modelVersionLabel('shadow-0.4.0')).toBe('Trial model 0.4.0');
    expect(modelVersionLabel('SHADOW-0.4.0')).toBe('Trial model 0.4.0');
    expect(modelVersionLabel('pure-0.5.0+roster')).toBe('Market-independent model 0.5.0');
    expect(modelVersionLabel('DATA_ONLY_V1')).toBe('Data-only model v1');
    expect(modelVersionLabel('dc_laplace_v1')).toBe('Dixon–Coles model v1');
    expect(modelVersionLabel('projection_v2.0')).toBe('Projection model v2.0');
    expect(modelVersionLabel('ledger ELO (projection_v2.0)')).toBe('Elo ledger (projection model v2.0)');
    expect(modelVersionLabel(null)).toBeNull();
    expect(() => modelVersionShort({ id: 'x' })).not.toThrow(); // never throws on a non-string
    expect(modelVersionShort('shadow-0.4.0')).toBe('v0.4.0 (trial)');
    expect(modelVersionShort(2)).toBe('v2');
  });

  it('capability availability is a sentence: what, and what it means for the screens', () => {
    expect(capabilityLabel('market_price_history')).toBe('Market price history');
    expect(availabilitySentence('venue_effects', 'UNAVAILABLE')).toBe('Venue effects: not published for this sport yet, so Sift does not show it.');
    expect(availabilitySentence('rankings', 'PARTIAL', 'current snapshot only.')).toBe('Rankings: only partly published, so some screens show less than usual. Publication note: current snapshot only.');
  });

  it('QualityBadge and HealthPill show words, not codes; the code stays as a data attribute', () => {
    const { container } = render(<><QualityBadge status="PARTIAL" /><QualityBadge status="UNAVAILABLE" /><HealthPill status="RESEARCH_ONLY" /></>);
    expect(container.textContent).not.toMatch(/PARTIAL|UNAVAILABLE|RESEARCH_ONLY|RESEARCH ONLY/);
    expect(container.textContent).toMatch(/Incomplete/);
    expect(container.textContent).toMatch(/Not published/);
    expect(container.textContent).toMatch(/Research only/);
    expect(container.querySelector('[data-quality="PARTIAL"]')).toBeTruthy();
  });

  it('DataState says what is missing and links to provenance', () => {
    render(<MemoryRouter><DataState title="No injury list for this game" detail="Nobody was listed at the last capture." provenance /></MemoryRouter>);
    expect(screen.getByRole('status').textContent).toMatch(/No injury list for this game.*Nobody was listed/);
    expect(screen.getByRole('link', { name: /Data & provenance/ })).toBeTruthy();
  });
});
