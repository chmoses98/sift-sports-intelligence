import { describe, expect, it } from 'vitest';
import type { MetricRegistryDoc, SearchIndexDoc } from '../src/contract/types';
import { indexEntries, matchesAll, parseIntent, search, tokenScore, tokenize } from '../src/search/engine';
import { readSnapshot } from './helpers';

const si = readSnapshot<SearchIndexDoc>('explorer/search_index.json');
const reg = readSnapshot<MetricRegistryDoc>('explorer/metrics.json');
const metricType = new Map(reg.items.map((m) => [m.metric_id, m.entity_type]));
const index = indexEntries(si.items);

describe('search index', () => {
  it('parses the published index', () => {
    expect(si.kind).toBe('search_index');
    expect(new Set(si.items.map((e) => e.kind))).toEqual(new Set(['TEAM', 'PLAYER', 'EVENT', 'METRIC', 'RANKING']));
  });

  it('finds teams by nickname, city and abbreviation', () => {
    expect(search(index, 'Bills')[0].entry.label).toBe('Buffalo Bills');
    expect(search(index, 'baltimore')[0].entry.label).toBe('Baltimore Ravens');
    expect(search(index, 'BUF')[0].entry.label).toBe('Buffalo Bills');
  });

  it('finds players, with one typo tolerated', () => {
    const hit = search(index, 'Josh Allen')[0];
    expect(hit.entry.kind).toBe('PLAYER');
    expect(hit.entry.context.team).toBe('BUF');
    expect(search(index, 'Josh Alen')[0].entry.label).toBe('Josh Allen');
  });

  it('finds games by matchup', () => {
    const hit = search(index, 'NE @ BUF').find((h) => h.entry.kind === 'EVENT');
    expect(hit?.entry.label).toBe('NE @ BUF');
  });

  it('understands "Baltimore pass defense" as a team plus its pass-defense metrics', () => {
    const it = parseIntent(index, 'Baltimore pass defense', (e) => metricType.get(e.id) ?? null)!;
    expect(it.subject.label).toBe('Baltimore Ravens');
    expect(it.rest).toEqual(['pass', 'defense']);
    const ids = it.metrics.map((m) => m.id);
    expect(ids).toContain('met_nfl.adj_def_db_epa');
    expect(ids).toContain('met_nfl.def_dropback_epa');
    expect(ids).not.toContain('met_nfl.adj_off_db_epa');
  });

  it('understands "Josh Allen passing yards" as a player plus market words', () => {
    const it = parseIntent(index, 'Josh Allen passing yards', (e) => metricType.get(e.id) ?? null)!;
    expect(it.subject.label).toBe('Josh Allen');
    expect(matchesAll(it.rest, 'Passing yards YES iff Josh Allen passing_yards (FULL) >= 250.5')).toBe(true);
    expect(matchesAll(it.rest, 'Receptions YES iff Josh Allen receptions (FULL) >= 1')).toBe(false);
  });

  it('tokenizes and scores exact > prefix > typo', () => {
    expect(tokenize('Ja\u0027Marr Chase!')).toEqual(['ja', 'marr', 'chase']);
    expect(tokenScore('ravens', ['ravens'])).toBe(3);
    expect(tokenScore('rav', ['ravens'])).toBe(2);
    expect(tokenScore('ravns', ['ravens'])).toBe(1);
    expect(tokenScore('zzz', ['ravens'])).toBe(0);
  });
});
