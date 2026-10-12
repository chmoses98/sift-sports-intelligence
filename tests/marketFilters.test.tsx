// Owner items 37, 38, 40: every market-category filter actually filters. The game Markets board (sections, kind chips,
// a search that spans every section), the Top Markets chips (each chip's count is what it shows), and the market board's
// category chips (event cards narrowed to one kind of contract).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { filterGroups, groupMarkets, kindOf, latestPrices, MarketBoard } from '../src/components/MarketBoard';
import { marketLabel, priceRow } from '../src/lib/gamedata';
import { gameScripts, scriptFit } from '../src/lib/scripts';
import { TOP_FILTERS, TOP_MARKETS_SHOWN, TopMarkets, topMarketCounts, topMarketRows } from '../src/views/game/MarketIntel';
import { eventCards, kindCounts, marketKind } from '../src/lib/marketBrowse';
import type { Featured } from '../src/opportunity/rank';
import type { Opportunity } from '../src/opportunity/types';
import { readSnapshot } from './helpers';

const detail = readSnapshot<EventDetailDoc>('event_detail/evt_0cb333291f580a201a70.json');
const r = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
const HOME = 'prt_16bee2e0460c651b4bca';
const AWAY = 'prt_3d9358b1e2ac7256767d';

describe('game Markets board filters', () => {
  const groups = groupMarkets(detail.markets, () => null);
  it('a section shows only its groups; a kind narrows further; a search spans every section', () => {
    const players = filterGroups(groups, { section: 'players', kind: null, q: '' }, true);
    expect(players.length).toBeGreaterThan(0);
    expect(players.every((g) => g.section === 'players')).toBe(true);
    const kind = kindOf(players[0]);
    const narrowed = filterGroups(groups, { section: 'players', kind, q: '' }, true);
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.length).toBeLessThan(players.length);
    expect(narrowed.every((g) => kindOf(g) === kind)).toBe(true);
    const found = filterGroups(groups, { section: 'lines', kind: null, q: 'Allen' }, true);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((g) => g.section !== 'lines')).toBe(true);
  });

  it('in the rendered board, each tab and chip changes what is listed', () => {
    render(<MemoryRouter><MarketBoard markets={detail.markets} prices={latestPrices(detail.model_prices)} sportSlug="nfl" playerName={() => null} /></MemoryRouter>);
    const tabs = screen.getByRole('tablist', { name: 'Market sections' });
    const titles = () => [...document.querySelectorAll('.mgroup__title')].map((e) => e.textContent ?? '');
    const lines = titles();
    fireEvent.click(within(tabs).getByRole('tab', { name: /Player props/ }));
    const props = titles();
    expect(props).not.toEqual(lines);
    const chips = screen.getByRole('group', { name: 'Market type' });
    const chip = within(chips).getAllByRole('button')[1];
    const label = chip.textContent!.replace(/\s*\d+$/, '');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(titles().every((t) => t.startsWith(label))).toBe(true);
    expect(titles().length).toBeLessThan(props.length);
    fireEvent.change(screen.getByLabelText('Filter markets'), { target: { value: 'zzzz-no-such-market' } });
    expect(screen.getByText(/No market matches/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter markets'), { target: { value: 'Allen' } });
    expect(screen.getByText(/contracts match “Allen” across every section/)).toBeInTheDocument();
  });

  it('YES and NO are shown as the two asks in words, the exact YES bid / ask kept', () => {
    render(<MemoryRouter><MarketBoard markets={detail.markets} prices={new Map()} sportSlug="nfl" playerName={() => null} /></MemoryRouter>);
    const row = document.querySelector('a.mrow')!;
    expect(row.querySelector('.mrow__p')!.textContent).toMatch(/\d+¢ \/ \d+¢|— \/ /);
    expect(row.querySelector('.mrow__yn, .mrow__f')).not.toBeNull();
  });
});

describe('Top markets chips', () => {
  const set = gameScripts(r)!;
  const abbr = (pid: string | null) => (pid === HOME ? 'BUF' : pid === AWAY ? 'NE' : null);
  const rows = detail.markets.map((m) => priceRow(m, latestPrices(detail.model_prices), marketLabel(m, abbr, () => null), scriptFit(m, set, HOME, AWAY)));
  it('every chip shows only its family, and a chip with a count never opens empty', () => {
    const counts = topMarketCounts(rows);
    for (const [k] of TOP_FILTERS) {
      const shown = topMarketRows(rows, k, -1, 999);
      expect(shown.length).toBe(counts[k]);
      if (k !== 'all') expect(shown.every((x) => x.group === k)).toBe(true);
      for (const x of shown) expect(x.ask! >= 0.08 && x.ask! <= 0.92).toBe(true);
    }
    // Player props show even when the model prices none of them (the old table hid every unpriced prop).
    expect(counts.props).toBeGreaterThan(0);
  });
  it('the rendered table reaches every contract a chip counts (top rows first, then "Show all")', () => {
    render(<MemoryRouter><TopMarkets rows={rows} set={set} selected={null} slug="nfl" eventId="evt_0cb333291f580a201a70" now={Date.parse('2026-10-04T12:00:00Z')} allHref="#" /></MemoryRouter>);
    const card = screen.getByTestId('top-markets');
    const chips = within(within(card).getByRole('group', { name: 'Market type' })).getAllByRole('button');
    expect(chips.length).toBeGreaterThan(1);
    let capped = 0;
    for (const chip of chips) {
      fireEvent.click(chip);
      const n = Number(chip.querySelector('small')!.textContent);
      const bodyRows = () => card.querySelectorAll('tbody tr').length;
      expect(bodyRows()).toBe(Math.min(n, TOP_MARKETS_SHOWN));
      const more = within(card).queryByRole('button', { name: `Show all ${n}` });
      if (n > TOP_MARKETS_SHOWN) {
        capped++;
        fireEvent.click(more!);
        expect(bodyRows()).toBe(n);
      } else expect(more).toBeNull();
    }
    // The fixture has chips with more contracts than the opening table shows (the case the old chips miscounted).
    expect(capped).toBeGreaterThan(0);
  });
  it('script-fit ordering: with a script selected, contracts that always win in it come first', () => {
    const i = set.scripts.findIndex((s) => s.id === 'fav-big');
    const shown = topMarketRows(rows, 'spreads', i, 999);
    const firstNo = shown.findIndex((x) => x.fit?.fits[i] !== 'yes');
    expect(firstNo).toBeGreaterThan(0);
    expect(shown.slice(firstNo).every((x) => x.fit?.fits[i] !== 'yes')).toBe(true);
  });
});

describe('market board category chips', () => {
  const opp = (id: string, eventId: string, family: string | null, title: string, tier: 1 | 2 | 3 | 4 | 5 = 3): Opportunity => ({
    id, sport: 'SOCCER', slug: 'soccer', eventId, eventLabel: `Game ${eventId}`, competition: null, startTime: '2026-10-11T12:00:00Z', marketId: null, ticker: null, family,
    what: { title, side: 'YES', subject: null }, why: '', evidence: [], risk: null, alternatives: [], status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: '',
    phase: 'PREGAME', group: null, orientation: 'VERIFIED', href: '#', gameHref: `#${eventId}`,
    rank: { tier } as Opportunity['rank'], price: {} as Opportunity['price'], confidence: {} as Opportunity['confidence'], reprice: {} as Opportunity['reprice'],
  });
  const f = (o: Opportunity): Featured => ({ lead: o, related: [], opposed: [], sameGame: [], conflicts: [] });
  const featured = [
    f(opp('a', 'e1', 'match_winner', 'Arsenal to win')),
    f(opp('b', 'e1', 'total_goals', 'Total goals over 2.5')),
    f(opp('c', 'e2', 'player_goals', 'Nikolaj Ehlers: 1+ goals')),
    f(opp('d', 'e3', 'handicap', 'Arsenal wins by more than 1.5')),
    f(opp('e', 'e4', 'TT_Home_Over', 'Dodgers team total over 4.5')),
    f(opp('g', 'e5', 'ML_Home', 'Dodgers to win')),
  ];
  it('classifies each contract once, from its family and words', () => {
    expect(featured.map((x) => marketKind(x.lead))).toEqual(['winner', 'total', 'props', 'spread', 'total', 'winner']);
    expect(kindCounts(featured)).toEqual({ winner: 2, spread: 1, total: 2, props: 1, other: 0 });
  });
  it('a category chip keeps only that kind, grouped by game in ranked order', () => {
    expect(eventCards(featured, null).map((c) => c.eventId)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(eventCards(featured, null)[0].items).toHaveLength(2);
    const totals = eventCards(featured, 'total');
    expect(totals.map((c) => c.eventId)).toEqual(['e1', 'e4']);
    expect(totals.flatMap((c) => c.items).every((x) => marketKind(x.lead) === 'total')).toBe(true);
    expect(eventCards(featured, 'props').map((c) => c.items[0].lead.id)).toEqual(['c']);
  });
});
