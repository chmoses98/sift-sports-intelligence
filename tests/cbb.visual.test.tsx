// CBB visual pieces: team identity (real committed logos, monogram fallback in school colors, never a
// generic mark), accents that stay distinguishable and are never the only signal, the minutes composition
// (every segment labelled), the uncertainty axes (labelled 80% model range, never a guarantee), the
// marquee rule (stated, no strength judgment) and the leaders digest read back as published.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { EventDoc, HealthDoc } from '../src/contract/types';
import { eventExt, statusExt } from '../src/views/cbb/data';
import { accent, allTeams, confShort, identity, matchupAccents } from '../src/views/cbb/identity';
import { Rotation } from '../src/views/cbb/Game';
import { marquee } from '../src/views/cbb/Slate';
import { AxisKey, MarginAxis, MinutesComp, Standing, TeamLogo, WinSplit } from '../src/views/cbb/viz';

const root = (v: string) => join(__dirname, '..', 'e2e', 'data', 'cbb', v, 'app', 'latest');
const read = <T,>(v: string, rel: string): T => JSON.parse(readFileSync(join(root(v), rel), 'utf-8')) as T;

const PURDUE = 'prt_5b169af0e759c556850a';
const DUKE = 'prt_6e05c0e05403e3e4312b';

describe('CBB team identity', () => {
  it('maps every D-I team to its ESPN id, abbreviation, conference and a committed logo', () => {
    const teams = allTeams();
    expect(teams.length).toBeGreaterThanOrEqual(360);
    const p = identity(PURDUE)!;
    expect(p).toMatchObject({ espn: 2509, abbr: 'PUR', name: 'Purdue', full: 'Purdue Boilermakers', conference: 'Big Ten Conference' });
    expect(p.logo).toMatch(/teams\/cbb\/2509\.webp$/);
    for (const t of teams) {
      expect(t.pid).toMatch(/^prt_/);
      if (t.logo) expect(t.logo).toMatch(new RegExp(`teams/cbb/${t.espn}\\.webp$`));
    }
  });

  it('falls back to a monogram in the school colors when a logo is missing or fails, never a generic mark', () => {
    const { container, rerender } = render(<TeamLogo pid="prt_unknown" abbr="ZZU" size={40} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('ZZU');
    rerender(<TeamLogo pid={PURDUE} size={40} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('PUR');
    expect(container.querySelector('.clogo--mono')!.getAttribute('style')).toContain('--tc');
  });

  it('chooses accents that read on the dark canvas and stay apart in a matchup', () => {
    const gonz = identity('prt_66d812230cca375cbb89')!; // navy primary: too dark on near-black → alternate
    expect(gonz.color).toBe('#041e42');
    expect(accent(gonz)).toBe(gonz.alt);
    expect(accent(null)).toMatch(/^#[0-9a-f]{6}$/);
    const [a, h] = matchupAccents(identity(DUKE), identity('prt_542d2e00ec9cde9b1cba')); // two royal blues
    expect(a).not.toBe(h);
  });

  it('shortens conference names for dense rows', () => {
    expect(confShort('Southeastern Conference')).toBe('SEC');
    expect(confShort('Southwestern Athletic Conf.')).toBe('SWAC');
    expect(confShort('Horizon League')).toBe('Horizon');
    expect(confShort(null)).toBeNull();
  });
});

describe('CBB visual components', () => {
  it('labels every minutes segment and the 200-minute frame', () => {
    render(<MinutesComp m={{ returning: 92, transfer: 71, first_d1: 37 }} />);
    expect(screen.getByRole('figure').getAttribute('aria-label')).toBe('Expected minutes: Returning 92.0, Transfers 71.0, First D-I 37.0 of 200');
    expect(screen.getByText('of 200 expected minutes')).toBeTruthy();
    expect(screen.getByText('Returning')).toBeTruthy();
    expect(screen.getByText('Transfers')).toBeTruthy();
    expect(screen.getByText('First D-I')).toBeTruthy();
  });

  it('draws the model range with words on both ends and never calls it a guarantee', () => {
    render(<><MarginAxis margin={1.8} r50={[-6, 9.6]} r80={[-13, 16.7]} away="Duke" home="Kansas" /><AxisKey /></>);
    expect(screen.getByLabelText(/Projected margin Kansas by 1\.8; 80% model range Duke by 13\.0 to Kansas by 16\.7/)).toBeTruthy();
    expect(screen.getByText('80% model range')).toBeTruthy();
    expect(screen.getByText('Model uncertainty — not guaranteed')).toBeTruthy();
    expect(screen.getByText('Even')).toBeTruthy();
  });

  it('writes both win probabilities as numbers beside the bar (color is never the only signal)', () => {
    render(<WinSplit pHome={0.5716} away="Duke" home="Kansas" colors={['#00539b', '#e8000d']} />);
    expect(screen.getByLabelText('Model win probability: Duke 43%, Kansas 57%')).toBeTruthy();
  });

  it('shows position only for a metric without a better direction', () => {
    const { container, rerender } = render(<Standing rank={1} size={20} />);
    expect(container.querySelector('.cstand__fill')).toBeTruthy();
    rerender(<Standing rank={10} size={20} directional={false} />);
    expect(container.querySelector('.cstand__fill')).toBeNull();
    expect(container.querySelector('.cstand__dot')).toBeTruthy();
  });
});

describe('CBB rotation wording', () => {
  it('describes the top-five-minutes flag as what it is, never as a starter', () => {
    const players = [1, 2, 3, 4, 5, 6].map((k) => ({
      player_id: `P${k}`, name: `Player ${k}`, position: 'G', minutes: 36 - k * 3, class: 'returning', class_label: 'Returning', prior_team: null, expected_starter: k <= 5,
    }));
    const { container } = render(<Rotation players={players} note={null} />);
    expect(screen.getAllByText('top-5 minutes')).toHaveLength(5);
    expect(container.textContent ?? '').not.toMatch(/starter/i);
    expect(container.innerHTML).not.toMatch(/starter/i);
  });
});

describe('CBB home inputs', () => {
  it('puts named events and neutral sites first, by the stated rule only', () => {
    const evs = read<{ items: EventDoc[] }>('preseason', 'events.json').items;
    const top = marquee(evs, 3);
    const rank = (e: EventDoc) => (eventExt(e)?.event_name ? 2 : 0) + (eventExt(e)?.neutral_site ? 1 : 0) + (eventExt(e)?.conference_game ? 0.5 : 0);
    const best = Math.max(...evs.map(rank));
    expect(rank(top[0])).toBe(best);
    expect(top.map(rank)).toEqual([...top.map(rank)].sort((a, b) => b - a));
  });

  it('reads the leaders digest as published: the ranking’s own order, adjusted flag and universe', () => {
    const st = statusExt(read<HealthDoc>('season', 'health.json'))!;
    const l = st.leaders!.adj_off;
    expect(l.adjusted).toBe(true);
    expect(l.top[0].rank).toBe(1);
    expect(l.top.map((e) => e.rank)).toEqual([...l.top.map((e) => e.rank)].sort((a, b) => a - b));
    const rk = read<{ entries: { entity_id: string }[] }>('season', `explorer/rankings/${l.ranking_id}.json`);
    expect(l.top.map((e) => e.entity_id)).toEqual(rk.entries.slice(0, l.top.length).map((e) => e.entity_id));
    const pre = statusExt(read<HealthDoc>('preseason', 'health.json'))!;
    expect(Object.values(pre.leaders ?? {}).every((x) => x.adjusted === false)).toBe(true);
  });
});

describe('router-free render guard', () => {
  it('TeamLogo renders inside a router without links', () => {
    const { container } = render(<MemoryRouter><TeamLogo pid={DUKE} /></MemoryRouter>);
    expect(container.querySelector('.clogo')).toBeTruthy();
  });
});
