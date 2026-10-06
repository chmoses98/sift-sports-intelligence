// The insight layer on the real week-4 publication and the real 2026 history files: matchup edges point
// the right way, context notes are facts (never adjustments), scheme notes respect sample sizes, news is
// ranked by importance, props carry labelled ranges, findings are atomic, and pregame views never see the
// game's own result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc, MetricRegistryDoc, RankingDoc } from '../src/contract/types';
import { gamesBefore, hitRecord, statDef } from '../src/history/stats';
import { qbStarts, schemeTable } from '../src/history/team';
import type { PlayerHistoryDoc, TeamHistoryDoc } from '../src/history/types';
import { contextNotes, nameKey } from '../src/insights/context';
import { whatMatters } from '../src/insights/matters';
import { gameSides } from '../src/insights/game';
import { matchupInsights } from '../src/insights/matchups';
import { injuryNews, levelOf, splitNews } from '../src/insights/news';
import { propCards, propsToWatch, rangeText } from '../src/insights/props';
import { schemeInsights } from '../src/insights/scheme';
import { rankView, tierWord } from '../src/lib/rank';
import { makeTrayItem } from '../src/packet/tray';
import { findingToTray, type Finding } from '../src/research/findings';
import { HISTORY_DIR, readSnapshot } from './helpers';

const ev = (id: string) => readSnapshot<EventResearchDoc>(`explorer/events/${id}.json`);
const NE_BUF = 'evt_0cb333291f580a201a70';
const ATL_NO = 'evt_639f74e87ff25310c542';
const GB_TB = 'evt_4920c40ea546729098ce';
const teams = JSON.parse(readFileSync(join(HISTORY_DIR, 'teams.json'), 'utf-8')) as TeamHistoryDoc;
const player = (gsis: string) => JSON.parse(readFileSync(join(HISTORY_DIR, 'players', `${gsis}.json`), 'utf-8')) as PlayerHistoryDoc;
const board = readSnapshot<{ items: { event_id: string; status: string }[] }>('board.json');
const upcoming = board.items.filter((i) => i.status === 'SCHEDULED').map((i) => i.event_id);

describe('rank-first presentation', () => {
  it('states the tier in words and keeps #1 = best for every directional metric', () => {
    expect(rankView({ rank: 3, universe_size: 32, higher_is_better: true })).toMatchObject({ text: '#3 NFL', tierWord: 'Top 3', tier: 'elite' });
    expect(rankView({ rank: 31, universe_size: 32, higher_is_better: false })).toMatchObject({ tierWord: 'Bottom 3', tier: 'poor' });
    expect(tierWord(16, 32)).toBe('Middle of the pack');
    // Descriptive (no direction): "#1" is the highest, never "the best".
    expect(rankView({ rank: 1, universe_size: 32, higher_is_better: null })).toMatchObject({ tierWord: 'Highest', directional: false });
  });

  it('a defensive "allowed" metric ranks the team that allows the least #1', () => {
    const metrics = readSnapshot<MetricRegistryDoc>('explorer/metrics.json');
    expect(metrics.items.find((m) => m.metric_id === 'met_nfl.adj_def_rush_epa')!.higher_is_better).toBe(false);
    const r = ev(NE_BUF);
    const row = r.matchup.find((m) => m.metric_id === 'met_nfl.adj_def_rush_epa')!;
    const ranking = readSnapshot<RankingDoc>(`explorer/rankings/${row.home!.context!.ranking_id}.json`);
    const first = (ranking as unknown as { entries: { rank: number; value: number }[] }).entries.find((x) => x.rank === 1)!;
    const all = (ranking as unknown as { entries: { value: number }[] }).entries.map((x) => x.value);
    expect(first.value).toBe(Math.min(...all));
  });
});

describe('matchup edges (where the game tilts)', () => {
  it('surfaces Buffalo’s #1 rush offense against New England’s #21 run defense first', () => {
    const xs = matchupInsights(ev(NE_BUF));
    expect(xs[0]).toMatchObject({ area: 'run', side: 'offense', size: 'major', headline: 'Bills rush offense has a major edge' });
    expect(xs[0].offense.rank.rank).toBe(1);
    expect(xs[0].defense.rank.rank).toBe(21);
  });

  it('always credits the stronger unit, never more than two per offense, strongest first', () => {
    for (const id of upcoming) {
      const xs = matchupInsights(ev(id));
      for (const x of xs) {
        const winner = x.side === 'offense' ? x.offense : x.defense;
        const loser = x.side === 'offense' ? x.defense : x.offense;
        expect(winner.rank.strength).toBeGreaterThan(loser.rank.strength);
        expect(winner.team.abbr).toBe(x.beneficiary.abbr);
      }
      for (let i = 1; i < xs.length; i++) expect(xs[i - 1].score).toBeGreaterThanOrEqual(xs[i].score);
      const per = new Map<string, number>();
      for (const x of xs) per.set(x.offense.team.abbr, (per.get(x.offense.team.abbr) ?? 0) + 1);
      for (const n of per.values()) expect(n).toBeLessThanOrEqual(2);
    }
  });
});

describe('context that matters', () => {
  it('explains that Atlanta’s season passing rank mixes Cooper Rush and Michael Penix Jr. — without adjusting it', () => {
    const notes = contextNotes(ev(ATL_NO), teams);
    const qb = notes.find((n) => n.kind === 'qb-change' && n.team.abbr === 'ATL')!;
    expect(qb.detail).toMatch(/Michael Penix Jr\. has started 1 of the Falcons' 3 games \(week 3\)/);
    expect(qb.detail).toMatch(/Cooper Rush started weeks 1–2/);
    expect(qb.detail).toMatch(/passing offense #30 NFL/);
    expect(qb.adjustment).toBe('none');
    expect(qb.facts.join(' ')).toMatch(/25 dropbacks/);
  });

  it('only counts starts before the game being viewed', () => {
    const atl = teams.teams.ATL.weeks;
    expect(qbStarts(atl, 4).map((q) => [q.name, q.weeks])).toEqual([['Cooper Rush', [1, 2]], ['Michael Penix Jr.', [3]]]);
    expect(qbStarts(atl, 5).find((q) => q.name === 'Michael Penix Jr.')!.weeks).toEqual([3, 4]);
  });

  it('notes a quarterback who has not started yet (Tampa Bay without Baker Mayfield)', () => {
    const tb = contextNotes(ev(GB_TB), teams).find((n) => n.team.abbr === 'TB' && n.kind === 'qb-change');
    expect(tb?.headline).toBe('Jalon Daniels takes over at quarterback for the Buccaneers');
  });
});

describe('scheme pairings', () => {
  it('ranks only teams with enough charted plays and uses weeks before the game', () => {
    const rows = schemeTable(teams, 'blitz_rate', 4);
    for (const r of rows) {
      if (r.rank != null) expect(r.n).toBeGreaterThanOrEqual(60);
      expect(r.weeks.every((w) => w < 4)).toBe(true);
    }
    const ranked = rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].value!).toBeGreaterThanOrEqual(ranked[i].value!);
  });

  it('states samples and never claims cause', () => {
    for (const id of upcoming) {
      for (const s of schemeInsights(teams, gameSides(ev(id)))) {
        expect(s.samples.length).toBeGreaterThan(0);
        expect(s.lines.join(' ')).not.toMatch(/because|causes|will /i);
      }
    }
  });
});

describe('important news', () => {
  it('a starting quarterback ruled out leads; a backup linebacker listed questionable does not', () => {
    const items = injuryNews(ev(GB_TB));
    const mayfield = items.find((x) => x.injury?.player === 'Baker Mayfield')!;
    expect(mayfield.level).toBe('critical');
    const { lead, more } = splitNews(injuryNews(ev(ATL_NO)));
    expect(lead.every((x) => x.level === 'critical' || x.level === 'high')).toBe(true);
    expect(more.find((x) => x.injury?.player === 'Divine Deablo')?.level).toBe('low');
    expect(levelOf(7)).toBe('critical');
    expect(levelOf(1)).toBe('low');
  });

  it('a long absence (no games this season) is old news', () => {
    const r = ev(ATL_NO);
    const fresh = injuryNews(r, undefined, () => 3).find((x) => x.injury?.player === 'Jordyn Tyson')!;
    const stale = injuryNews(r, undefined, () => 0).find((x) => x.injury?.player === 'Jordyn Tyson')!;
    expect(stale.score).toBeLessThan(fresh.score);
  });
});

describe('props to watch and projected ranges', () => {
  const r = ev(ATL_NO);
  const d = readSnapshot<EventDetailDoc>(`event_detail/${ATL_NO}.json`);
  it('shows the actual range in plain numbers and the line', () => {
    const cards = propCards(r, d.markets);
    const bijan = cards.find((c) => c.name === 'Bijan Robinson' && c.stat === 'rushing_yards')!;
    expect(rangeText(bijan.range.typical, bijan.unit)).toBe('55–121 yds');
    expect(bijan.range.full).toEqual([19, 186]);
    expect(bijan.line).toBe(89.5);
    expect(bijan.marketTitle).toBe('Bijan Robinson over 89.5 rushing yards');
    expect(bijan.matchup?.label).toBe('Saints run defense');
  });

  it('a short list: priced lines only, one per player, one quarterback passing line', () => {
    for (const id of upcoming) {
      const list = propsToWatch(propCards(ev(id), readSnapshot<EventDetailDoc>(`event_detail/${id}.json`).markets));
      expect(list.length).toBeLessThanOrEqual(4);
      expect(new Set(list.map((c) => c.playerId)).size).toBe(list.length);
      expect(list.filter((c) => c.stat === 'passing_yards').length).toBeLessThanOrEqual(1);
      expect(list.every((c) => c.market && c.line != null)).toBe(true);
    }
  });
});

describe('player history', () => {
  const bijan = player('00-0038542');
  it('never shows a game’s own result in its pregame view', () => {
    const before = gamesBefore(bijan.games, '2026-10-06T00:15:00Z', 4);
    expect(before.map((g) => g.week)).toEqual([1, 2, 3]);
    // Without a week, a Monday-night (next-day UTC) kickoff still excludes that game.
    expect(gamesBefore(bijan.games, '2026-10-06T00:15:00Z').map((g) => g.week)).toEqual([1, 2, 3]);
  });

  it('counts games over a line', () => {
    const rec = hitRecord(gamesBefore(bijan.games, null, 4), statDef('rushing_yards')!, 89.5);
    expect(rec.values.map((x) => x.v)).toEqual([83, 72, 194]);
    expect([rec.over, rec.under]).toEqual([1, 2]);
  });
});

describe('research findings are atomic', () => {
  const base: Finding = {
    key: 'run:BUF', kind: 'matchup', sport: 'NFL', title: 'Bills rush offense has a major edge', statement: 'BUF rush offense #1 vs NE run defense #21.',
    href: '/nfl/game/x', anchor: { ref_kind: 'METRIC', id: 'met_nfl.adj_off_rush_epa', extra: { metric_id: 'met_nfl.adj_off_rush_epa', event_id: NE_BUF } },
  };
  const id = (f: Finding) => { const t = findingToTray(f); return makeTrayItem({ ref_kind: t.ref_kind, sport: t.sport, id: t.id, extra: t.extra, added_at: new Date(0) }).item_id; };

  it('two findings on the same anchor stay two items; the same finding is one', () => {
    expect(id(base)).toBe(id({ ...base }));
    expect(id(base)).not.toBe(id({ ...base, key: 'run:NE' }));
    expect(id(base)).not.toBe(id({ ...base, kind: 'scheme' }));
  });

  it('carries the finding written out as the contract note, and is never a whole game', () => {
    const t = findingToTray(base);
    expect(t.note).toBe('Matchup — Bills rush offense has a major edge. BUF rush offense #1 vs NE run defense #21.');
    expect(t.ref_kind).not.toBe('EVENT');
    expect(t.extra?.x).toBe('finding:matchup:run:BUF');
    expect(t.label.finding).toBe('matchup');
  });
});

describe('what matters: one importance scale', () => {
  const r = ev(ATL_NO);
  const etienne = player('00-0036973');
  const notes = (log: PlayerHistoryDoc) => contextNotes(r, teams, new Map([[`${nameKey('Travis Etienne Jr.')}|NO`, log]]));

  it('a key absence is a note only when the player had a real role (snaps, carries or targets)', () => {
    const real = notes(etienne).find((n) => n.kind === 'key-absence');
    expect(real?.headline).toBe('Saints without RB Travis Etienne Jr.');
    expect(real!.facts[0]).toMatch(/per game: \d+% of snaps/);
    const bit = { ...etienne, games: etienne.games.map((x) => ({ ...x, snaps: { off: 3, pct: 0.05 }, rushing: { ...x.rushing, car: 1 }, receiving: { ...x.receiving, tgt: 0 } })) };
    expect(notes(bit).some((n) => n.kind === 'key-absence')).toBe(false);
  });

  it('notes compete with edges on importance: a QB change leads, a committee back does not outrank clear edges', () => {
    const ctx = notes(etienne);
    const list = whatMatters(matchupInsights(r), ctx, schemeInsights(teams, gameSides(r)));
    expect(list.length).toBeLessThanOrEqual(5);
    expect(list[0]).toMatchObject({ kind: 'context', item: { kind: 'qb-change' } });
    for (let i = 1; i < list.length; i++) expect(list[i - 1].importance).toBeGreaterThanOrEqual(list[i].importance);
    const absence = list.findIndex((x) => x.kind === 'context' && x.item.kind === 'key-absence');
    const firstEdge = list.findIndex((x) => x.kind === 'matchup');
    expect(firstEdge).toBeGreaterThan(-1);
    if (absence >= 0) expect(absence).toBeGreaterThan(firstEdge);
    expect(list.filter((x) => x.kind === 'scheme').length).toBeLessThanOrEqual(1);
  });
});

