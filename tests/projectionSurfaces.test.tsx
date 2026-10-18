// One projection per stat across the surfaces: the prop board (Home, Games, Prop Explorer, Player Snapshot all read it),
// the MLB pitcher block, the team line on the Game Command Center, and the Research Lab card.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerProjectionNote, ProjectionNote, TeamProjections } from '../src/components/ProjectionNote';
import { ProjectionScorecard } from '../src/components/ProjectionScorecard';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import { propBoard, type PropRow } from '../src/insights/propBoard';
import { makeAuthority } from '../src/lib/projectionAuthority';
import { parseRollback } from '../src/lib/projectionApprovals';
import { projectionsUrl, summaryUrl } from '../src/lib/projections';
import { applyAuthority, propBoard as mlbBoard } from '../src/views/mlb/PlayerProps';
import { cfbGame, decoded, feed, NOW, nflPlayer, part, mlbPitcher } from './support/projectionFeed';
import { readMlb, readSnapshot } from './helpers';

const ATL_NO = 'evt_639f74e87ff25310c542';
const ev = readSnapshot<EventResearchDoc>(`explorer/events/${ATL_NO}.json`);
const det = readSnapshot<EventDetailDoc>(`event_detail/${ATL_NO}.json`);

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(null); });

/** A real receiver with a priced receptions line on the fixture game. */
const legacy = propBoard(ev, det);
const target = legacy.rows.find((r) => r.def.stat === 'receptions' && r.main && r.projection != null && r.role !== 'RB')!;
const feedFor = (row: PropRow, over: Record<string, unknown> = {}, families: Record<string, object> = { receptions: {} }) => decoded('NFL', [nflPlayer({
  player_id: 'gsis-1', name: row.name, team: row.team.abbr, family: 'receptions', mean: 7.3, median: 7, p10: 4, p90: 11,
  quantiles: { p05: 3, p25: 5, p50: 7, p75: 9, p95: 12 },
  thresholds: Object.fromEntries(row.ladder.map((x, i) => [String(x.threshold), Math.max(0.01, 0.95 - i * 0.1)])), ...over })], families);
const board = (over: Record<string, unknown> = {}, rb?: { sport: string; family: string }[]) =>
  propBoard(ev, det, undefined, makeAuthority('NFL', feedFor(target, over), NOW, rb));
const rowOf = (b: ReturnType<typeof propBoard>) => b.rows.find((r) => r.id === target.id)!;

describe('NFL prop board: one projection per stat', () => {
  it('a promoted stat carries the selected model’s mean, range and rung probabilities — none of the old simulation’s', () => {
    expect(target.projection).not.toBe(7.3);
    const r = rowOf(board());
    expect(r.projectionStatus.kind).toBe('authoritative');
    expect(r.projection).toBe(7.3);
    expect(r.range).toEqual({ typical: [5, 9], full: [3, 12], median: 7 });
    for (const x of r.ladder) {
      expect(x.modelState).toBe('PROJECTION');
      expect(x.modelP).not.toBe(legacy.rows.find((l) => l.id === target.id)!.ladder.find((l) => l.threshold === x.threshold)!.modelP);
    }
    expect(r.ladder[0].modelP).toBeCloseTo(0.95, 6);                       // straight from the selected distribution's thresholds
    expect(JSON.stringify(r.risks)).not.toMatch(/shadow/i);
  });

  it('a feed without the full quantile set still gives one projection with its 80% range; no quartile bars are invented', () => {
    const r = rowOf(board({ quantiles: undefined }));
    expect(r.projection).toBe(7.3);
    expect(r.range).toBeNull();
    expect(r.band).toEqual({ lo: 4, hi: 11, median: 7 });
    expect(r.separation).not.toBeNull();                                      // sized from the 80% range (0.526 × width)
    expect(rowOf(board()).band).toBeNull();                                   // with quantiles the full range bar is used
  });

  it('the market side of the row is untouched by the projection engine', () => {
    const a = legacy.rows.find((l) => l.id === target.id)!, b = rowOf(board());
    expect(b.line).toBe(a.line);
    expect(b.main?.yesAsk).toBe(a.main?.yesAsk);
    expect(b.price).toEqual(a.price);
    expect(b.marketTitle).toBe(a.marketTitle);
    expect(b.ladder.map((x) => [x.threshold, x.yesAsk, x.noAsk, x.marketP])).toEqual(a.ladder.map((x) => [x.threshold, x.yesAsk, x.noAsk, x.marketP]));
  });

  it('every board built from the same authority agrees (Home, Games and Explorer read the same value)', () => {
    const a = makeAuthority('NFL', feedFor(target), NOW);
    const homeRow = rowOf(propBoard(ev, det, undefined, a)), explorerRow = rowOf(propBoard(ev, det, undefined, a));
    expect(homeRow.projection).toBe(explorerRow.projection);
    expect(homeRow.separation).toBe(explorerRow.separation);
  });

  it('a withheld promoted projection leaves no number from either engine, only the reason', () => {
    const r = rowOf(board({ participation: part('CONFIRMED_OUT') }));
    expect(r.projectionStatus).toMatchObject({ kind: 'withheld', code: 'OUT' });
    expect(r.projection).toBeNull();
    expect(r.range).toBeNull();
    expect(r.separation).toBeNull();
    expect(r.read).toBe('WITHHELD');
    expect(r.ladder.every((x) => x.modelP == null && x.modelState == null)).toBe(true);
    expect(r.risks.some((x) => /Projection withheld: confirmed out/.test(x))).toBe(true);
    expect(r.line).toBe(target.line);                                         // the market is still shown
  });

  it('a stat on the established model is identical with or without an authority', () => {
    const a = makeAuthority('NFL', feedFor(target), NOW);
    const withAuth = propBoard(ev, det, undefined, a);
    for (const stat of ['passing_tds', 'receiving_yards', 'rushing_yards', 'passing_yards', 'carries']) {
      const x = legacy.rows.filter((r) => r.def.stat === stat), y = withAuth.rows.filter((r) => r.def.stat === stat);
      expect(y.length).toBe(x.length);
      expect(y.map((r) => [r.id, r.projection, r.range, r.separation])).toEqual(x.map((r) => [r.id, r.projection, r.range, r.separation]));
      expect(y.every((r) => r.projectionStatus.kind === 'legacy')).toBe(true);
    }
  });

  it('rolling the family back restores the established number for that stat only', () => {
    const r = rowOf(board({}, parseRollback('NFL:receptions=legacy')));
    expect(r.projectionStatus.kind).toBe('legacy');
    expect(r.projection).toBe(target.projection);
    expect(r.range).toEqual(target.range);
  });

  it('no feed: promoted stats are withheld, never silently shown from the old model', () => {
    const b = propBoard(ev, det, undefined, makeAuthority('NFL', null, NOW));
    const r = rowOf(b);
    expect(r.projectionStatus).toMatchObject({ kind: 'withheld', code: 'FEED_UNAVAILABLE' });
    expect(r.projection).toBeNull();
  });

  it('without an authority the board is the established simulation (existing callers unchanged)', () => {
    expect(rowOf(propBoard(ev, det)).projection).toBe(target.projection);
  });
});

describe('MLB pitcher block', () => {
  const markets = () => readMlb<EventDetailDoc>('event_detail/evt_f809f61380cdbb0eb4f0.json').markets;
  const base = () => mlbBoard(markets(), ['LAD', 'ATL']);
  const glasnow = (b: ReturnType<typeof base>) => b.pitchers.find((p) => p.name === 'Tyler Glasnow')!;
  const auth = (p: object) => makeAuthority('MLB', decoded('MLB', [mlbPitcher(p)], { pitcher_strikeouts: {} }), NOW);

  it('a promoted pitcher stat takes the selected model’s expected value and rung probabilities; the old drivers and validation are dropped', () => {
    const before = glasnow(base()).families.find((f) => f.family === 'pitcher_strikeouts')!;
    const after = glasnow(applyAuthority(base(), auth({}))).families.find((f) => f.family === 'pitcher_strikeouts')!;
    expect(after.selected?.kind).toBe('authoritative');
    expect(after.expected?.mean).toBe(7.4);
    expect(after.expected?.mean).not.toBe(before.expected?.mean);
    expect(after.drivers).toEqual([]);
    expect(after.validation).toBeNull();
    for (const r of after.rows) {
      const k = r.threshold;
      const sel = k === 5 ? 0.86 : k === 7 ? 0.58 : k === 9 ? 0.27 : null;
      expect(r.sel).toEqual({ kind: 'prob', p: sel });                       // the selected distribution's own; the old model's probability is not what is shown
    }
  });
  it('withholds an unconfirmed starter and shows no number from either engine', () => {
    const f = glasnow(applyAuthority(base(), auth({ participation: part('UNVERIFIED') }))).families.find((x) => x.family === 'pitcher_strikeouts')!;
    expect(f.selected).toMatchObject({ kind: 'withheld' });
    expect(f.expected).toBeNull();
    expect(f.rows.every((r) => r.sel?.kind === 'withheld')).toBe(true);
  });
  it('leaves hitters and no-authority boards untouched', () => {
    const b = base();
    expect(applyAuthority(b, null)).toBe(b);
    const hit = applyAuthority(b, auth({})).hitters;
    expect(hit).toEqual(b.hitters);
  });
});

describe('components', () => {
  it('ProjectionNote renders nothing for an established-model stat', () => {
    const r = render(<ProjectionNote resolution={{ kind: 'legacy' }} />);
    expect(r.container).toBeEmptyDOMElement();
  });
  it('shows reliability, availability and update time with no engine label and no comparison', () => {
    const res = makeAuthority('NFL', decoded('NFL', [nflPlayer()], { receptions: {} }), NOW).resolve({ stat: 'receptions', playerId: '00-0036900' });
    render(<ProjectionNote resolution={res} variant="full" />);
    const el = screen.getByTestId('projection-note');
    expect(el).toHaveTextContent('High reliability');
    expect(el).toHaveTextContent(/Confirmed to play/);
    expect(el).toHaveTextContent(/Updated Oct 18/);
    expect(el).toHaveTextContent(/targets 9\.1 · opponent ×1\.04 \(6 games\)/);
    expect(el.textContent).not.toMatch(/shadow|independent|incumbent|production model|disagree|agrees|challenger|\bbet\b|profitable/i);
  });
  it('explains a withheld projection without any number', () => {
    const res = makeAuthority('NFL', decoded('NFL', [nflPlayer({ participation: part('CONFIRMED_OUT') })], { receptions: {} }), NOW).resolve({ stat: 'receptions', playerId: '00-0036900' });
    render(<ProjectionNote resolution={res} variant="full" />);
    const el = screen.getByTestId('projection-note');
    expect(el).toHaveAttribute('data-state', 'withheld');
    expect(el).toHaveTextContent('Projection withheld');
    expect(el).toHaveTextContent('confirmed out before the game');
    expect(el).not.toHaveTextContent('6.4');
  });
  it('Player Snapshot: one value with range and reliability from the feed, and nothing for a stat on the established model', async () => {
    setFetchJson(async (url) => { expect(url).toBe(projectionsUrl('NFL')); return feed('NFL', [nflPlayer(), nflPlayer({ family: 'passing_tds', mean: 1.1 })], { receptions: {}, passing_tds: {} }); });
    render(<PlayerProjectionNote sport="NFL" stat="receptions" playerId="00-0036900" now={NOW} />);
    const el = await screen.findByTestId('projection-note');
    expect(el).toHaveTextContent(/Projection 6\.4 · range 3\.0–10\.0/);
    expect(el).toHaveTextContent('High reliability');
    cleanup();
    const r = render(<PlayerProjectionNote sport="NFL" stat="passing_tds" playerId="00-0036900" now={NOW} />);
    await new Promise((res) => setTimeout(res, 30));
    expect(r.container).toBeEmptyDOMElement();
  });
  it('renders nothing for a sport whose stats are all on the established model (NHL)', async () => {
    setFetchJson(async () => { throw new NotFoundError('x'); });
    const r = render(<PlayerProjectionNote sport="NHL" stat="shots" playerId="1" now={NOW} />);
    await new Promise((res) => setTimeout(res, 30));
    expect(r.container).toBeEmptyDOMElement();
  });
  it('Game Command Center: one projected score for CFB with the other team families beneath, and a single update line', async () => {
    setFetchJson(async () => feed('CFB', [], { team_points: {}, plays: {} }, [cfbGame]));
    render(<TeamProjections sport="CFB" home="OSU" away="PSU" startUtc="2026-10-18T23:30:00Z" now={NOW} />);
    const el = await screen.findByTestId('team-projections');
    expect(el).toHaveTextContent(/Projected score PSU 21 \(10–33\) · OSU 28 \(17–40\)/);
    expect(screen.getByTestId('team-plays')).toHaveTextContent('Plays: PSU 66 · OSU 70');
    expect(screen.getAllByTestId('team-projections-updated')).toHaveLength(1);
    expect(el.textContent).not.toMatch(/shadow|independent|incumbent|betting signal edge/i);
  });
  it('Game Command Center: a sport whose team points stay on the established model shows nothing from the feed', async () => {
    setFetchJson(async () => feed('NFL', [], { team_points: {} }, [{ ...cfbGame }]));
    const r = render(<TeamProjections sport="NFL" home="OSU" away="PSU" startUtc="2026-10-18T23:30:00Z" now={NOW} />);
    await new Promise((res) => setTimeout(res, 30));
    expect(r.container).toBeEmptyDOMElement();
  });
});

describe('Research Lab card', () => {
  const summary = {
    schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024-2025 seasons' },
    families: [
      { family: 'receptions', readiness: 'READY', readiness_reason: 'r', best_model: 'F', holdout: { n_obs: 6160, mae: 1.552, cover_80: 0.81 } },
      { family: 'passing_tds', readiness: 'NEEDS IMPROVEMENT', readiness_reason: 'worse', best_model: 'D', holdout: { n_obs: 1050, mae: 0.927, cover_80: 0.79 } },
    ],
  };
  it('lists the stats live in SIFT with their accuracy, and the rest as unchanged, with no model-versus-model numbers', async () => {
    setFetchJson(async (url) => { if (url === summaryUrl('NFL')) return summary; throw new NotFoundError(url); });
    render(<ProjectionScorecard sport="NFL" />);
    const card = await screen.findByTestId('projection-scorecard');
    await waitFor(() => expect(screen.getByTestId('pfs-live-in-sift')).toHaveTextContent(/Receptions\s*1\.55\s*81%/));
    expect(screen.getAllByTestId('pfs-live-empty').length).toBeGreaterThan(0);                      // no live games settled yet, and it says so
    expect(screen.getByTestId('pfs-not-changed')).toHaveTextContent(/Passing tds — Established model kept/);
    expect(screen.getByTestId('pfs-not-changed')).toHaveTextContent(/Receiving yards — Not yet validated for live use/);
    expect(card.textContent).not.toMatch(/shadow|incumbent|production model|versus|challenger/i);
  });
  it('lists NBA stats as validated and waiting on live availability data', async () => {
    setFetchJson(async (url) => { if (url === summaryUrl('NBA')) return { ...summary, sport: 'NBA', families: [{ family: 'points', readiness: 'READY', readiness_reason: 'r', best_model: 'E', holdout: { n_obs: 5, mae: 4.5, cover_80: 0.79 } }] }; throw new NotFoundError(url); });
    render(<ProjectionScorecard sport="NBA" />);
    expect(await screen.findByTestId('pfs-not-changed')).toHaveTextContent(/Points — Validated; waiting on live availability data/);
  });
});
