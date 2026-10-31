// @vitest-environment node
// Sport coverage (Workstream 4): what each sport's own publication states for a game reaches the v3 Overview, gated by the DOCUMENT and by the capability
// declaration, never by a flag. Real published documents (fixtures/real, `props` family: NHL, NBA, MLB event research) and the trimmed real soccer and tennis
// publications (tests/fixtures). College basketball uses the publisher's SYNTHETIC test fixture (e2e/data/cbb: labelled synthetic by its README), because no
// real projected CBB document is committed; it proves the reader, not the data.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../../src/contract/types';
import { buildGameIntel, type GameIntel } from '../../src/v3/data/intel/build';
import { readSport } from '../../src/v3/data/intel/sports';
import { MLB_CURRENT_DAYS } from '../../src/v3/data/intel/sports/mlb';
import { statsAge } from '../../src/v3/data/intel/sports/shared';
import { tennisSides } from '../../src/v3/data/intel/sports/tennis';
import { deriveLines } from '../../src/v3/data/adapt';
import { winContracts } from '../../src/v3/data/research/gameMarkets';
import { isFullGame, withSides } from '../../src/v3/data/research/matchMarkets';
import { CAPABILITIES, capability, gameCapability, isCurrent, OVERVIEW_SECTIONS, sportsWith } from '../../src/v3/model/capabilities';
import type { V3Game, V3Team } from '../../src/v3/model/types';
import { readTennis } from '../../src/lib/tennis';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';

const RAW = 'https://raw.githubusercontent.com/chmoses98';
const DOC = {
  nhl: `${RAW}/NHL-edge-finder/data-archive/app/latest/explorer/events/evt_628774085d72d1192326.json`,
  nba: `${RAW}/nba-edge-finder/data-archive/app/latest/explorer/events/evt_218fc6544812b86338e7.json`,
  mlb: `${RAW}/edge-finder-api/main/app/latest/explorer/events/evt_4bca84d22c4244efc3a5.json`,
};
const CAPTURE = Date.parse('2026-10-28T15:00:00Z');
const FIX = join(__dirname, '..', 'fixtures');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const json = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const team = (slug: string, p: { participant_id: string; short_name?: string | null; display_name: string }): V3Team => ({
  id: p.short_name ?? p.participant_id, slug, sport: slug.toUpperCase(), name: p.display_name, nick: p.display_name.split(' ').pop()!, abbr: p.short_name ?? p.display_name.slice(0, 3).toUpperCase(), logo: null, colors: ['#000', '#fff'],
});
/** The game as the slate builds it: away is the participant the event names away (the second-listed one when it names neither, as the board does). */
function gameOf(slug: string, r: EventResearchDoc): V3Game {
  const ps = r.event.participants as { participant_id: string; short_name?: string | null; display_name: string }[];
  const away = ps.find((p) => p.participant_id === r.event.away_participant) ?? ps[1], home = ps.find((p) => p.participant_id === r.event.home_participant) ?? ps[0];
  return { key: `${slug}:${r.event.event_id}`, slug, sport: slug.toUpperCase(), eventId: r.event.event_id, league: slug, phase: 'pregame', startMs: 0, away: team(slug, away), home: team(slug, home), score: null, lines: [], signals: 0, provenance: 'publication' };
}
const intel = (slug: string, r: EventResearchDoc, now: number, detail: EventDetailDoc | null = null): GameIntel => buildGameIntel({ g: gameOf(slug, r), research: r, detail, now });

let nhl: EventResearchDoc, nba: EventResearchDoc, mlb: EventResearchDoc;
beforeAll(async () => {
  const fam = openBundle().family('props');
  const read = async (u: string) => JSON.parse(Buffer.from((await fam.get(u))!.body).toString('utf8')) as EventResearchDoc;
  [nhl, nba, mlb] = await Promise.all([read(DOC.nhl), read(DOC.nba), read(DOC.mlb)]);
});

describe('capability declarations: what each sport publishes, as data', () => {
  it('soccer and tennis are declared (they were unknown to v3) with no player props, because Kalshi lists match markets for them', () => {
    for (const slug of ['soccer', 'tennis']) {
      expect(CAPABILITIES[slug], slug).toBeTruthy();
      expect(capability(slug, 'propPrices').status).toBe('none');
      expect(capability(slug, 'gameProps').status).toBe('none');
      expect(capability(slug, 'playerResearch').status).toBe('none');
    }
    expect(sportsWith('propPrices')).not.toContain('soccer');
    expect(sportsWith('propPrices')).not.toContain('tennis');
    expect(CAPABILITIES.soccer.record).toBe('wdl');
  });

  it('every sport that publishes Overview research declares it as gated (opened per game by the document), never as a blanket ready', () => {
    for (const slug of ['nhl', 'nba', 'mlb', 'cbb', 'soccer']) {
      for (const s of OVERVIEW_SECTIONS) expect(capability(slug, s).status, `${slug} ${s}`).toBe('gated');
    }
    expect(capability('tennis', 'gameModel').status).toBe('gated');
    expect(capability('tennis', 'gameEnvironment').status).toBe('none'); // tennis publishes no scoring or pace simulation
    expect(capability('cfb', 'gameModel').status).toBe('none'); // CFB's projection belongs to the Script Engine view
    expect(capability('nfl', 'gameModel').status).toBe('ready');
  });

  it('gameCapability opens a gated layer only for a game whose document filled it, and never opens a `none` one', () => {
    expect(gameCapability('nhl', 'gameEnvironment').status).toBe('gated');
    expect(gameCapability('nhl', 'gameEnvironment', { sections: ['gameEnvironment'] }).status).toBe('ready');
    expect(gameCapability('nhl', 'gameModel', { sections: ['gameEnvironment'] }).status).toBe('gated');
    expect(gameCapability('tennis', 'gameEnvironment', { sections: ['gameEnvironment'] }).status).toBe('none');
    expect(gameCapability('cfb', 'gameModel', { sections: ['gameModel'] }).status).toBe('none');
  });

  it('the stale team caches stay gated with their reason (re-checked against the publications on 2026-10-31)', () => {
    // MLB team profiles carry statistics through 2026-08-27 and NBA's through 2026-06-14: neither passes the freshness rule the capability file uses.
    expect(isCurrent('2026-08-27T00:00:00Z', 21, Date.parse('2026-10-31T00:00:00Z'))).toBe(false);
    expect(isCurrent('2026-06-14T00:00:00Z', 21, Date.parse('2026-10-31T00:00:00Z'))).toBe(false);
    for (const slug of ['mlb', 'nba']) for (const s of ['teamOverview', 'teamProfile', 'teamForm', 'teamSchedule', 'teamPlayers'] as const) {
      const c = capability(slug, s);
      expect(c.status, `${slug} ${s}`).toBe('gated');
    }
    expect(capability('nhl', 'teamOverview').status).toBe('ready');
  });
});

describe('NHL: the simulation, the season statistics, the goalies and the designations of the real document', () => {
  let i: GameIntel;
  beforeAll(() => { i = intel('nhl', nhl, CAPTURE); });

  it('shows the research simulation as a model view in goals, labelled research, with the settled record next to the market', () => {
    const m = i.projection.model!;
    expect(m.origin).toBe('research');
    expect(m.unit).toBe('goals');
    expect(m.version).toBe('nhl-sim-1.1');
    expect(m.asOfKind).toBe('published');
    expect([m.awayScore, m.homeScore]).toEqual([2.75738, 3.42963]);
    expect([m.awayWin, m.homeWin]).toEqual([0.4006, 0.5994]);
    expect(m.caveat).toMatch(/research only/);
    expect(m.caveat).toMatch(/Brier score was 0\.236 against the market’s 0\.232/);
    expect(m.caveat).toMatch(/Not frozen/);
  });

  it('the scoring environment is the simulation plus the season ranks of goals, expected goals, shot share and special teams', () => {
    const lines = Object.fromEntries(i.environment!.lines.map((l) => [l.id, l]));
    expect(lines.total.text).toMatch(/averages 6\.4 total goals/);
    expect(lines.total.source).toBe('simulation');
    expect(lines.pf.text).toMatch(/Flames 2\.5 goals per game \(28th of 32\); Oilers 4\.3 goals per game \(1st of 32\)/);
    expect(lines.pf.source).toBe('season');
    expect(lines.pk.text).toMatch(/Oilers 70\.6% \(26th of 32\)/);
    expect(lines.pace.text).toMatch(/who has the puck rather than of pace/);
  });

  it('the comparison is one row per season statistic (the last-ten-games rows are not a second copy of it)', () => {
    expect(i.comparison!.kind).toBe('ranks');
    const names = (i.comparison as { pairs: { name: string }[] }).pairs.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Goals for per game');
  });

  it('the notes name each goalie (projected or confirmed, with source and confidence) and place designations only on a team the game’s roster states', () => {
    const items = i.notes!.items;
    expect(items.some((n) => /^EDM starter projected: Tristan Jarry/.test(n.headline))).toBe(true);
    expect(items.some((n) => /^CGY starter projected: Devin Cooley/.test(n.headline))).toBe(true);
    expect(items[0].detail).toMatch(/Confidence 70%.*DailyFaceoff/);
    expect(i.notes!.source!.name).toBe('ESPN injury report');
    // a designation whose team cannot be established is counted, never listed against a guessed team
    expect(i.notes!.more).toBeGreaterThan(0);
    for (const n of items) expect(['EDM', 'CGY']).toContain(n.team);
  });

  it('what the generic layer already read still stands: findings and scripts, with the matchup findings the publication wrote', () => {
    expect(i.present).toEqual(expect.arrayContaining(['projection', 'advantages', 'comparison', 'notes', 'environment', 'script']));
    expect(i.findings.length).toBeGreaterThan(0);
    expect(i.layers.gameModel.status).toBe('ready');
    expect(i.layers.gameEnvironment.status).toBe('ready');
    expect(i.layers.gameAvailability.status).toBe('ready');
  });

  it('with the simulation removed the layers close again and the model lane says why (nothing is estimated)', () => {
    const r = clone(nhl);
    delete (r.extensions as Record<string, unknown>).sim;
    const j = intel('nhl', r, CAPTURE);
    expect(j.projection.model).toBeNull();
    expect(j.projection.absent).toMatch(/no simulation/);
    expect(j.layers.gameModel.status).toBe('gated');
    // the season statistics still carry an environment
    expect(j.environment!.lines.every((l) => l.source === 'season')).toBe(true);
  });
});

describe('NBA: the raw simulation with the publication’s own verdict, pace and efficiency, and honest age of the statistics', () => {
  let i: GameIntel;
  beforeAll(() => { i = intel('nba', nba, CAPTURE); });

  it('the model view carries the publication’s verdict that the market beat the model, and no market price is mixed into it', () => {
    const m = i.projection.model!;
    expect(m.version).toBe('nba-sim-0.1.0');
    expect(m.homeScore).toBeCloseTo(129.9075, 3);
    expect(m.caveat).toMatch(/lower log loss than the model.*8 of 8 families/);
    expect(m.caveat).not.toMatch(/Kalshi ask|¢/);
  });

  it('pace, efficiency and rest come from the simulation; the season ranks are separate lines', () => {
    const lines = Object.fromEntries(i.environment!.lines.map((l) => [l.id, l]));
    expect(lines.pace.text).toMatch(/Wizards 98\.6, Cavaliers 95\.7/);
    expect(lines.eff.text).toMatch(/per 100 possessions/);
    expect(lines.rest.source).toBe('simulation');
    expect(lines.space.text).toMatch(/\(8th of 30\)/);
    expect(lines.snet.source).toBe('season');
  });

  it('team statistics that run through last season say so, in the comparison and under the environment (no age words)', () => {
    const age = statsAge(nba, CAPTURE)!;
    expect(age.current).toBe(false);
    expect(age.label).toBe('These team statistics run through Jun 14 and do not include games played since.');
    expect(i.comparison!.note).toBe(age.label);
    expect(i.environment!.foot).toContain(age.label);
  });

  it('an injury list with no team is counted, not pinned on a team; one the roster can place is shown', () => {
    expect(i.notes).toBeNull();
    expect(i.gaps.find((x) => x.section === 'notes')!.reason).toMatch(/without naming a team/);
    const r = clone(nba);
    const p = r.players[0];
    r.context.injuries = [{ ...r.context.injuries[0], detail: `${p.display_name} (Injury/Illness - Left Ankle Sprain)`, status: 'QUESTIONABLE' }, ...r.context.injuries];
    const j = intel('nba', r, CAPTURE);
    expect(j.notes!.items).toHaveLength(1);
    expect(j.notes!.items[0].headline).toBe(`${p.display_name} questionable`);
    expect(['WAS', 'CLE']).toContain(j.notes!.items[0].team);
    expect(j.layers.gameAvailability.status).toBe('ready');
  });

  it('a simulation that did not converge, or whose inputs are untrusted, is not shown as a view', () => {
    for (const patch of [{ converged: false }, { inputs_trusted: false }]) {
      const r = clone(nba);
      Object.assign((r.extensions as { raw_projection: object }).raw_projection, patch);
      const j = intel('nba', r, CAPTURE);
      expect(j.projection.model).toBeNull();
      expect(j.projection.absent).toMatch(/did not converge|untrusted/);
    }
  });
});

describe('MLB: the slate model, park and starters, checked against the document’s own date', () => {
  it('shows the slate projection in runs with the publication’s confidence, and a values table with no invented ranks', () => {
    const i = intel('mlb', mlb, CAPTURE);
    const m = i.projection.model!;
    expect(m.unit).toBe('runs');
    expect([m.awayScore, m.homeScore, m.total]).toEqual([4.64, 2.91, 7.6]);
    expect([m.awayWin, m.homeWin]).toEqual([0.72, 0.28]);
    expect(m.caveat).toMatch(/confidence low/);
    expect(i.comparison!.kind).toBe('values');
    expect(i.environment!.lines.find((l) => l.id === 'park')!.text).toMatch(/park factor 97/);
    const starters = i.blocks.find((b) => b.id === 'starters')!;
    expect(starters.rows.map((r) => r.text).join(' ')).toMatch(/Jacob Misiorowski: xFIP 4\.5/);
    expect(starters.rows.map((r) => r.text).join(' ')).toMatch(/has not been announced/);
    expect(starters.rows.map((r) => r.text).join(' ')).toMatch(/Batting order not yet posted/);
    expect(i.layers.gameAvailability.status).toBe('ready');
  });

  it('is data-driven: the same document read after the freshness window shows no baseball research as current', () => {
    const later = CAPTURE + (MLB_CURRENT_DAYS + 1) * 86_400_000;
    const i = intel('mlb', mlb, later);
    expect(i.projection.model).toBeNull();
    expect(i.projection.absent).toMatch(/more than 3 days old/);
    expect(i.blocks).toHaveLength(0);
    expect(i.environment).toBeNull();
    expect(i.layers.gameModel.status).toBe('gated');
    // inside the window the same reader opens it
    expect(intel('mlb', mlb, CAPTURE + 86_400_000).projection.model).not.toBeNull();
  });
});

describe('soccer: the model board, the six scripts, attack against defence, the rest and the context (trimmed real publication)', () => {
  const dir = join(FIX, 'soccer', 'app', 'latest', 'explorer', 'events');
  const ARS_LEE = 'evt_0a69396895a311cb26b2';
  const NOW = Date.parse('2026-10-09T08:00:00Z');
  let r: EventResearchDoc, i: GameIntel;
  beforeAll(() => { r = json<EventResearchDoc>(join(dir, `${ARS_LEE}.json`)); i = intel('soccer', r, NOW); });

  it('the model view has a draw, goals not points, the research authority and the settled record against the market', () => {
    const m = i.projection.model!;
    expect(m.unit).toBe('goals');
    expect(m.draw).toBeCloseTo(0.26059, 5);
    expect(m.homeWin).toBeCloseTo(0.52958, 5);
    expect(m.awayWin! + m.homeWin! + m.draw!).toBeCloseTo(1, 2);
    expect(m.caveat).toMatch(/every soccer model family is research-only/);
    expect(m.caveat).toMatch(/log loss was 0\.\d{3} against the market’s 0\.\d{3}/);
    expect(m.kind).toBe('research model board');
  });

  it('scripts are ranked simulation shares: expected, alternate and the danger script that favours the side the model rates lower', () => {
    const cards = i.script!.cards;
    expect(cards.map((c) => c.role)).toEqual(['expected', 'alternate', 'danger']);
    expect(cards[0].title).toBe('Tight, low event');
    expect(cards[0].share).toBeCloseTo(0.34221, 5);
    expect(cards[2].title).toMatch(/Leeds United in control/); // the away side: the model rates Arsenal higher
    expect(i.script!.basis).toMatch(/not calibrated probabilities/);
  });

  it('attack against defence, rest and the competition come from the document, with the publication’s own gaps listed', () => {
    const ratings = i.blocks.find((b) => b.id === 'ratings')!;
    expect(ratings.rows[1].text).toMatch(/Attack 80th percentile, defence 98th/);
    expect(ratings.rows.find((x) => x.id === 'mismatch')!.text).toMatch(/Arsenal defensive edge/);
    const ctx = i.blocks.find((b) => b.id === 'context')!;
    expect(ctx.rows.find((x) => x.id === 'comp')!.text).toBe('Premier League, Matchday 6.');
    expect(ctx.foot).toMatch(/^Gaps the publication states:/);
    expect(i.environment!.lines.find((l) => l.id === 'rest')!.text).toMatch(/26 days since their last match/);
  });

  it('a fixture the model board has not priced has no model view and says so; one with no engine has no scripts', () => {
    const bare = clone(r);
    const e = bare.extensions as Record<string, unknown>;
    delete e.board_summary; delete e.soccer_script_engine;
    const j = intel('soccer', bare, NOW);
    expect(j.projection.model).toBeNull();
    expect(j.projection.absent).toMatch(/has not priced this fixture/);
    expect(j.script).toBeNull();
    expect(j.gaps.find((x) => x.section === 'script')!.reason).toMatch(/no soccer script engine payload/);
  });
});

describe('tennis: the match-win probability beside the references, ratings, surface and sample (trimmed real publication)', () => {
  const dir = join(FIX, 'tennis', 'app', 'latest', 'explorer', 'events');
  const NOW = Date.parse('2026-10-08T08:00:00Z');
  const MER_SWI = 'evt_581f889e1dfb4de11420', DOUBLES = 'evt_d09d8721f706b006741f';

  it('maps the two players to the game’s sides by identity and states the win probability with its record caveat, never a pick', () => {
    const r = json<EventResearchDoc>(join(dir, `${MER_SWI}.json`));
    const g = gameOf('tennis', r);
    const t = readTennis(r);
    expect(tennisSides(g, t)).not.toBeNull();
    const i = intel('tennis', r, NOW);
    const m = i.projection.model!;
    const mertens = g.away.name === 'Elise Mertens' ? m.awayWin : m.homeWin;
    expect(mertens).toBeCloseTo(0.2558, 4);
    expect(m.awayWin! + m.homeWin!).toBeCloseTo(1, 6);
    expect(m.kind).toBe('match-win probability');
    expect(m.caveat).toMatch(/Kalshi mid out-scoring the model/);
    expect(m.caveat).toMatch(/never as a pick/);
    expect(i.layers.gameEnvironment.status).toBe('none');
    expect(i.environment).toBeNull();
  });

  it('ratings are a values table with no ranks; surface and the thin serve sample are stated; the references are their own, marked market data', () => {
    const r = json<EventResearchDoc>(join(dir, `${MER_SWI}.json`));
    const i = intel('tennis', r, NOW);
    expect(i.comparison!.kind).toBe('values');
    const names = (i.comparison as { rows: { name: string }[] }).rows.map((x) => x.name);
    expect(names).toContain('Elo rating (overall)');
    const ctx = i.blocks.find((b) => b.id === 'context')!;
    expect(ctx.rows.find((x) => x.id === 'surface')!.text).toMatch(/^Hard\./);
    expect(i.blocks.find((b) => b.id === 'form')!.rows.find((x) => x.id === 'serve')!.text).toMatch(/thinner sample of 3,838/);
  });

  it('doubles carry no model: the lane says why in the publication’s words and no probability is invented', () => {
    const r = json<EventResearchDoc>(join(dir, `${DOUBLES}.json`));
    const i = intel('tennis', r, NOW);
    expect(i.projection.model).toBeNull();
    expect(i.projection.absent).toMatch(/No model probability is shown for doubles/);
    expect(i.layers.gameModel.status).toBe('gated');
  });
});

describe('college basketball (publisher SYNTHETIC fixture): tempo and efficiency exist only once projected; rosters when the publisher has one', () => {
  const dir = join(__dirname, '..', '..', 'e2e', 'data', 'cbb', 'season', 'app', 'latest', 'explorer', 'events');
  const docs = readdirSync(dir).map((f) => json<EventResearchDoc>(join(dir, f)));
  const stateOf = (d: EventResearchDoc) => (d.extensions as { cbb: { projection_state: string } }).cbb.projection_state;
  const NOW = Date.parse('2026-11-04T12:00:00Z');

  it('a projected game has tempo, points per possession and the total range; the model lane is the frozen projection', () => {
    const rosterOf = (d: EventResearchDoc) => (d.extensions as { cbb: { roster: { home: { available?: boolean } | null } } }).cbb.roster.home;
    const r = docs.find((d) => stateOf(d) === 'PROJECTED' && rosterOf(d)?.available)!;
    const i = intel('cbb', r, NOW);
    const lines = Object.fromEntries(i.environment!.lines.map((l) => [l.id, l]));
    expect(lines.pace.text).toMatch(/possessions projected/);
    expect(lines.eff.text).toMatch(/points per possession/);
    expect(lines.total.source).toBe('model');
    expect(i.projection.model!.origin).toBe('cbb');
    expect(i.layers.gameEnvironment.status).toBe('ready');
    expect(i.blocks.find((b) => b.id === 'roster')!.rows.some((x) => /expected rotation/.test(x.label))).toBe(true);
  });

  it('a game outside the capture window has no tempo or efficiency, and the publisher’s own message says why', () => {
    const r = docs.find((d) => stateOf(d) === 'PENDING_WINDOW')!;
    const i = intel('cbb', r, NOW);
    expect(i.environment).toBeNull();
    expect(i.layers.gameEnvironment.status).toBe('gated');
    expect(i.gaps.find((x) => x.section === 'environment')!.reason).toMatch(/published only with the pre-tip projection/);
    expect(i.projection.absent).toMatch(/not projected|pending|has not/i);
  });
});

describe('Kalshi markets for soccer and tennis: the win and the total are the game’s own, read by family', () => {
  const soc = join(FIX, 'soccer', 'app', 'latest', 'event_detail');
  const ten = join(FIX, 'tennis', 'app', 'latest', 'event_detail');

  it('soccer: the full-time result contracts (period "regulation") are the win prices; a first-half contract is not', () => {
    expect(isFullGame({ period: 'regulation', market_family: 'match_result_3way' })).toBe(true);
    expect(isFullGame({ period: 'regulation', market_family: 'first_half_result' })).toBe(false);
    expect(isFullGame({ period: 'first_half', market_family: 'match_result_3way' })).toBe(false);
    const d = json<EventDetailDoc>(join(soc, 'evt_0a69396895a311cb26b2.json'));
    const w = winContracts(d.markets, d.event.away_participant, d.event.home_participant);
    expect(w.map((x) => x.team)).toEqual(['away', 'home']);
    expect(w.map((x) => x.ticker)).toEqual(['KXEPLGAME-26OCT10ARSLEE-LEE', 'KXEPLGAME-26OCT10ARSLEE-ARS']);
    expect(w.some((x) => /TIE/.test(x.ticker))).toBe(false); // the draw contract has no participant: it is not a side's win
  });

  it('tennis: an event that names no home and away gets them by the board’s own rule, and the match-winner contracts become the moneyline', () => {
    const raw = json<EventDetailDoc>(join(ten, 'evt_581f889e1dfb4de11420.json'));
    expect(raw.event.away_participant).toBeFalsy();
    const d = withSides(raw);
    expect(d.event.away_participant).toBe(raw.event.participants[1].participant_id);
    expect(d.event.home_participant).toBe(raw.event.participants[0].participant_id);
    expect(withSides(d)).toBe(d);
    const ps = raw.event.participants;
    const mk = (p: (typeof ps)[number]) => team('tennis', p);
    const lines = deriveLines(d.markets, mk(ps[1]), mk(ps[0]), { away: d.event.away_participant ?? null, home: d.event.home_participant ?? null });
    const ml = lines.find((l) => l.kind === 'moneyline')!;
    expect(ml.alternates).toHaveLength(2);
    expect(ml.label).toMatch(/to win$/);
    const total = lines.find((l) => l.kind === 'total')!;
    expect(total.label).toBe('O/U 20.5'); // the total-games rung nearest even money
  });

  it('American-sport families are unchanged by the new ones', () => {
    expect(isFullGame({ period: null as unknown as string, market_family: 'moneyline' })).toBe(true);
    expect(isFullGame({ period: 'full_game', market_family: 'game_total' })).toBe(true);
    expect(isFullGame({ period: 'regulation', market_family: 'moneyline' })).toBe(false);
  });
});

describe('the sport readers are the only place a sport’s research is read, and a sport with none returns nothing', () => {
  it('readSport has no reader for the football sports, which keep their own screens', () => {
    for (const slug of ['nfl', 'cfb']) expect(readSport({ g: { slug, sport: slug.toUpperCase(), away: team(slug, { participant_id: 'a', short_name: 'A', display_name: 'A A' }), home: team(slug, { participant_id: 'b', short_name: 'B', display_name: 'B B' }) }, research: nhl, detail: null, now: CAPTURE })).toBeNull();
  });
  it('a reader whose document is unreadable yields an absent layer, not an error', () => {
    const broken = clone(nhl);
    (broken.extensions as Record<string, unknown>).sim = 'not an object';
    expect(() => intel('nhl', broken, CAPTURE)).not.toThrow();
    // the sport reader itself swallows a document it cannot read
    (broken as unknown as { matchup: unknown }).matchup = 'nope';
    expect(readSport({ g: gameOf('nhl', broken), research: broken, detail: null, now: CAPTURE })).toBeNull();
  });
});
