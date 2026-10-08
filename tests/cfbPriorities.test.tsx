// CFB Slate Priorities on the REAL CFB fixture (the board and the cfb_research_signals/1.x contract for the same
// games: tests/fixtures/cfb). Every item must be chosen by its documented rule (lib/cfbPriorities.ts,
// docs/CFB_SLATE_PRIORITIES.md), fail closed without fresh evidence, never point at a game that has kicked off,
// never repeat a game, and never call a football read "value".
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BoardDoc } from '../src/contract/types';
import { cfbPriorities, claimCount, isUpcoming, WATCH_MIN_CLAIMS } from '../src/lib/cfbPriorities';
import { decodeSignals, slateGame, type SignalsDoc, type YesQuote } from '../src/lib/cfbSignals';
import { normalizeCfbNames } from '../src/lib/cfbTeams';
import { CfbSlatePriorities } from '../src/views/cfb/CfbPriorities';
import { CFB_SIGNALS_FILE, readCfb } from './helpers';

const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
const ARIZ_WVU = 'evt_16c15c04ce50a5cb83f5';
const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
const STAN_ND = 'evt_7ca164d80f042f650a5c';
const TENN_ARK = 'evt_f121611ae29ec3e9d56e';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const UGA_ALA = 'evt_93e12676ae9337017c63';
const LIVE = ['evt_e56d7cee653c3507226b', 'evt_f39ef6a955b04b97fe84'];

const board = normalizeCfbNames(readCfb<BoardDoc>('board.json'));
const raw = () => JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8'));
/** Six minutes after the contract's price capture (2026-10-07T23:19:34Z): every price is FRESH. */
const NOW = Date.parse('2026-10-07T23:25:00Z');
const games = (doc: SignalsDoc, live?: (id: string) => YesQuote | null) => board.items.map((i) => slateGame(i, doc, live?.(i.event_id) ?? null));
const ids = (p: ReturnType<typeof cfbPriorities>) =>
  [p.value.kind === 'pick' ? p.value.pick.x.item.event_id : null, p.read?.x.item.event_id, p.disagreement.kind === 'pick' ? p.disagreement.pick.x.item.event_id : null, p.watch?.x.item.event_id, p.look?.x.item.event_id].filter(Boolean) as string[];

describe('CFB slate priorities (real fixture)', () => {
  const doc = decodeSignals(raw());
  const p = cfbPriorities(games(doc), doc, NOW);

  it('Top Value Signal is a real Value Watch game on a fresh executable price: highest data quality first', () => {
    expect(doc.signals.moderate_control.status).toBe('VALUE_WATCH');
    expect(p.value.kind).toBe('pick');
    if (p.value.kind !== 'pick') return;
    // Three Value Watch games (BYU MEDIUM, Tennessee LOW, LSU HIGH): LSU leads on data quality.
    expect(p.value.pick.x.item.event_id).toBe(LSU_UK);
    expect(p.value.pick.team).toBe('LSU');
    expect(p.value.pick.x.valueWatch).toBe(true);
    expect(p.value.pick.x.price).toMatchObject({ kind: 'EXECUTABLE', cents: 76 });
    expect(p.value.of).toBe(3);
  });

  it('Strong CONTROL is a football read, never value: the read is Strong CONTROL with the widest historical margin', () => {
    expect(p.read).not.toBeNull();
    expect(p.read!.x.item.event_id).toBe(STAN_ND); // home Strong CONTROL, historical median +23 (away Strong: +14.5)
    expect(p.read!.team).toBe('Notre Dame');
    expect(p.read!.x.valueWatch).toBe(false);
    // No Strong CONTROL game can be the value pick or the Worth-a-Look value.
    for (const x of [p.value.kind === 'pick' ? p.value.pick.x : null, p.look?.tag === 'Also on Value Watch' ? p.look.x : null]) {
      if (x) expect(x.g?.claims?.control?.strength).toBe('MODERATE');
    }
  });

  it('Biggest Market Disagreement is the contract\'s own flag, furthest below the line first', () => {
    expect(p.disagreement.kind).toBe('pick');
    if (p.disagreement.kind !== 'pick') return;
    // Sacramento State at 28¢ and Arizona at 61¢ are both below 85¢: Sacramento State is furthest below.
    expect(games(doc).find((x) => x.item.event_id === ARIZ_WVU)!.disagreement).toBe(true);
    expect(p.disagreement.pick.x.item.event_id).toBe(SAC_BGSU);
    expect(p.disagreement.gap).toBe(85 - 28);
    expect(p.disagreement.pick.x.disagreement).toBe(true);
  });

  it('Game to Watch is the close-game profile with the most research claims', () => {
    expect(p.watch?.x.item.event_id).toBe(UGA_ALA);
    expect(claimCount(p.watch!.x.g)).toBeGreaterThanOrEqual(WATCH_MIN_CLAIMS);
    expect(p.watch!.reason).toBe('Profiles as a close game, with a slow pace and elevated scoring.');
  });

  it('Worth a Look is one more real item (the next Value Watch game), never filler', () => {
    expect(p.look?.x.item.event_id).toBe(ISU_BYU);
    expect(p.look?.tag).toBe('Also on Value Watch');
  });

  it('never repeats a game across categories, and at most five items', () => {
    const xs = ids(p);
    expect(xs.length).toBeLessThanOrEqual(5);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it('kicked-off and live games never qualify', () => {
    for (const id of LIVE) expect(ids(p)).not.toContain(id);
    // Saturday 23:05 UTC, with fresh live quotes for every game: everything but Georgia–Alabama (23:30) has kicked
    // off, so every Value Watch and Strong CONTROL game is gone — and nothing weaker is promoted to fill the rail.
    const later = Date.parse('2026-10-10T23:05:00Z');
    const fresh = (id: string) => {
      const g = doc.byEvent.get(id);
      return g?.market?.price?.yes_ask != null ? { yesAsk: g.market.price.yes_ask, observedAt: new Date(later - 60_000).toISOString() } : null;
    };
    const all = games(doc, fresh);
    const q = cfbPriorities(all, doc, later);
    for (const x of all) if (ids(q).includes(x.item.event_id)) expect(isUpcoming(x, later)).toBe(true);
    expect(ids(q)).toEqual([UGA_ALA]);
    expect(q.value).toMatchObject({ kind: 'none', title: 'No strong value signal yet' });
    expect(q.read).toBeNull();
    expect(q.disagreement.kind).toBe('none');
    expect(q.look).toBeNull();
    // A game with no known start time never qualifies either.
    const unknown = cfbPriorities(all.map((x) => (x.item.event_id === UGA_ALA ? { ...x, item: { ...x.item, start_time_utc: 'TBD' } } : x)), doc, later);
    expect(unknown.watch).toBeNull();
  });

  it('stale quotes fail closed: value and disagreement wait for prices; the football read still stands', () => {
    const later = NOW + 3 * 3600e3;
    const q = cfbPriorities(games(doc), doc, later);
    expect(q.value).toMatchObject({ kind: 'stale', title: 'Waiting for updated prices' });
    expect(q.disagreement.kind).toBe('stale');
    expect(q.read?.x.item.event_id).toBe(STAN_ND);
  });

  it('no qualifying value: says so plainly, and a Strong CONTROL read is never promoted into the slot', () => {
    // The framework stops calling Moderate CONTROL a value signal: nothing is value, even with fresh prices.
    const off = raw();
    off.signals.moderate_control.status = 'REVIEW_REQUIRED';
    const d2 = decodeSignals(off);
    const q = cfbPriorities(games(d2), d2, NOW);
    expect(q.value).toMatchObject({ kind: 'none', title: 'No strong value signal yet' });
    expect(q.read).not.toBeNull();
    expect(q.look?.tag).not.toBe('Also on Value Watch');
    // No Moderate CONTROL game on the slate at all.
    const none = raw();
    for (const g of none.games) if (g.claims?.control?.strength === 'MODERATE') g.claims.control = null;
    const d3 = decodeSignals(none);
    const r = cfbPriorities(games(d3), d3, NOW);
    expect(r.value).toMatchObject({ kind: 'none', title: 'No strong value signal yet' });
    expect(r.value.kind !== 'pick' && r.value.text).toMatch(/market separation/);
  });

  it('is deterministic: the same picks whatever order the games arrive in, ties broken by data quality, kickoff, then event id', () => {
    const shuffled = [...games(doc)].reverse();
    const q = cfbPriorities(shuffled, doc, NOW);
    expect(ids(q)).toEqual(ids(p));
    // Equal data quality and kickoff: the event id decides.
    const tie = raw();
    for (const g of tie.games) if ([ISU_BYU, TENN_ARK, LSU_UK].includes(g.event_id)) g.data_quality = 'HIGH';
    const d4 = decodeSignals(tie);
    const items = board.items.map((i) => ([ISU_BYU, TENN_ARK, LSU_UK].includes(i.event_id) ? { ...i, start_time_utc: '2026-10-10T20:00:00Z' } : i));
    const t = cfbPriorities(items.map((i) => slateGame(i, d4, null)), d4, NOW);
    expect(t.value.kind === 'pick' && t.value.pick.x.item.event_id).toBe([ISU_BYU, TENN_ARK, LSU_UK].sort()[0]);
  });
});

describe('the CFB rail, rendered', () => {
  const doc = decodeSignals(raw());
  const renderRail = (now = NOW, d: SignalsDoc | null = doc, loading = false) =>
    render(<MemoryRouter><CfbSlatePriorities games={games(doc)} doc={d} loading={loading} slug="cfb" now={now} /></MemoryRouter>);

  it('renders linked items in rail order, each opening its game', () => {
    const { container } = renderRail();
    const rail = screen.getByRole('region', { name: 'Where to look first' });
    const order = [...container.querySelectorAll('[data-priority]')].map((e) => e.getAttribute('data-priority'));
    expect(order).toEqual(['value', 'read', 'disagreement', 'watch', 'look']);
    const links = [...container.querySelectorAll('a.prio__a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([`/cfb/game/${LSU_UK}`, `/cfb/game/${STAN_ND}`, `/cfb/game/${SAC_BGSU}`, `/cfb/game/${UGA_ALA}`, `/cfb/game/${ISU_BYU}`]);
    expect(within(rail).getByText('Notre Dame Controls the Matchup')).toBeInTheDocument();
  });

  it('keeps value and football reads visibly apart: only value items carry the Value signal mark', () => {
    const { container } = renderRail();
    const value = container.querySelector('[data-priority="value"]')!;
    const read = container.querySelector('[data-priority="read"]')!;
    const dis = container.querySelector('[data-priority="disagreement"]')!;
    expect(value.querySelector('.prio__kind--value')).not.toBeNull();
    expect(value.querySelector('.prio__px')!.textContent).toBe('76¢');
    expect(read.querySelector('.prio__kind--value')).toBeNull();
    expect(read.textContent).toMatch(/Football read · not a bet/);
    expect(read.querySelector('.prio__px')).toBeNull(); // a football read carries no price
    expect(dis.querySelector('.prio__kind--value')).toBeNull();
    expect(dis.textContent).toMatch(/Exploratory · not a bet/);
  });

  it('school names are whole and unambiguous', () => {
    const { container } = renderRail();
    const teams = [...container.querySelectorAll('.prio__teams')].map((e) => e.textContent);
    expect(teams).toContain('Sacramento State at Bowling Green');
    expect(teams).toContain('Iowa State at BYU');
    for (const t of teams) expect(t).not.toMatch(/\bSt\.(?= at|$)|^(St\.|State|Miss) at/);
  });

  it('says what it is waiting for: stale prices, research loading, signals unavailable, nothing upcoming', () => {
    const { unmount } = renderRail(NOW + 3 * 3600e3);
    expect(screen.getAllByText('Waiting for updated prices').length).toBeGreaterThan(0);
    unmount();
    const l = renderRail(NOW, null, true);
    expect(screen.getByText('Reading this slate’s research…')).toBeInTheDocument();
    l.unmount();
    const u = renderRail(NOW, null, false);
    expect(screen.getByText('Research signals unavailable')).toBeInTheDocument();
    u.unmount();
    renderRail(Date.parse('2026-10-20T00:00:00Z'));
    expect(screen.getByText('No upcoming games')).toBeInTheDocument();
  });
});
