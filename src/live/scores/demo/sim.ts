// The Live Score Demo's game engine: a deterministic simulation of one game per event, with each sport's own scoring
// pattern, periods and clock. EVERYTHING it produces is simulated: it exists so the live-score experience can be used and
// evaluated before a real feed is connected, and it is only ever shown under a DEMO label (src/v4/DemoBar.tsx, scoreState.ts).
//
// Determinism: a game's whole timeline (every scoring play and the final score) is fixed by (sport, seed) alone; where the
// demo clock stands decides only how much of it has been played. Nothing here reads the network, a model, a projection or a
// market, and nothing reads the real game's status: the demo can never affect what the research layer believes about a game.
import type { GamePhase, LiveClock, LivePlay, LiveSituation, LiveSport } from '../types';

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32: a small seeded generator, so the same game plays out the same way on every device and reload. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Seg { kind: 'play' | 'break'; period: number | null; label: string; len: number }
export interface ScoreEvt { gs: number; side: 'home' | 'away'; pts: number; text: string }
export interface Timeline {
  sport: LiveSport;
  segs: Seg[];
  /** Cumulative start of each segment, in game seconds. */
  starts: number[];
  total: number;
  events: ScoreEvt[];
  final: { home: number; away: number };
  /** Tennis: per set, the final games of each side. */
  sets?: { home: number; away: number }[];
}

const play = (period: number, label: string, len: number): Seg => ({ kind: 'play', period, label, len });
const brk = (label: string, len: number, period: number | null = null): Seg => ({ kind: 'break', period, label, len });
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Regulation segments per sport (game seconds; breaks are short so most of a demo game is play). */
function regulation(sport: LiveSport): Seg[] {
  switch (sport) {
    case 'NFL': case 'CFB': return [play(1, '1st Quarter', 900), play(2, '2nd Quarter', 900), brk('Halftime', 420, 2), play(3, '3rd Quarter', 900), play(4, '4th Quarter', 900)];
    case 'NBA': return [play(1, '1st Quarter', 720), brk('End of 1st', 90, 1), play(2, '2nd Quarter', 720), brk('Halftime', 360, 2), play(3, '3rd Quarter', 720), brk('End of 3rd', 90, 3), play(4, '4th Quarter', 720)];
    case 'CBB': return [play(1, '1st Half', 1200), brk('Halftime', 420, 1), play(2, '2nd Half', 1200)];
    case 'NHL': return [play(1, '1st Period', 1200), brk('1st Intermission', 360, 1), play(2, '2nd Period', 1200), brk('2nd Intermission', 360, 2), play(3, '3rd Period', 1200)];
    case 'SOCCER': return [play(1, '1st Half', 2700), brk('Halftime', 420, 1), play(2, '2nd Half', 2700)];
    case 'MLB': return Array.from({ length: 18 }, (_, i) => play(Math.floor(i / 2) + 1, `${i % 2 === 0 ? 'Top' : 'Bot'} ${ord(Math.floor(i / 2) + 1)}`, 200));
    case 'TENNIS': return [];
  }
}

const overtime = (sport: LiveSport): Seg | null =>
  sport === 'NFL' || sport === 'CFB' ? play(5, 'Overtime', 600)
    : sport === 'NBA' || sport === 'CBB' ? play(5, 'Overtime', 300)
    : sport === 'NHL' ? play(4, 'Overtime', 300)
    : null;

/** Play seconds (breaks excluded) to game seconds on the timeline. */
function playToGs(segs: Seg[], starts: number[], p: number): number {
  let left = p;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].kind !== 'play') continue;
    if (left < segs[i].len) return starts[i] + left;
    left -= segs[i].len;
  }
  return starts[starts.length - 1] + segs[segs.length - 1].len - 1;
}

const pick = <T,>(r: () => number, table: [number, T][]): T => {
  let x = r();
  for (const [w, v] of table) { if (x < w) return v; x -= w; }
  return table[table.length - 1][1];
};

type Raw = { p: number; side: 'home' | 'away'; pts: number; text: string };

function footballRaw(r: () => number, cfb: boolean, totalPlay: number): Raw[] {
  const out: Raw[] = [];
  for (const side of ['home', 'away'] as const) {
    const tds = (cfb ? 1 : 1) + Math.floor(r() * (cfb ? 4.6 : 3.6));
    for (let i = 0; i < tds; i++) {
      const [pts, text] = pick<[number, string]>(r, [[0.86, [7, 'Touchdown, PAT good']], [0.06, [6, 'Touchdown, PAT missed']], [0.08, [8, 'Touchdown, 2-point good']]]);
      out.push({ p: r() * totalPlay, side, pts, text });
    }
    const fgs = Math.floor(r() * (cfb ? 2.6 : 3.2));
    for (let i = 0; i < fgs; i++) out.push({ p: r() * totalPlay, side, pts: 3, text: 'Field goal' });
    if (r() < 0.04) out.push({ p: r() * totalPlay, side, pts: 2, text: 'Safety' });
  }
  return out;
}

function basketballRaw(r: () => number, mean: number, sd: number, totalPlay: number): Raw[] {
  const out: Raw[] = [];
  for (const side of ['home', 'away'] as const) {
    const target = Math.max(40, Math.round(mean + (r() + r() + r() - 1.5) * 2 * sd));
    let pts = 0;
    while (pts < target) {
      const [v, text] = pick<[number, string]>(r, [[0.6, [2, 'Basket']], [0.3, [3, '3-pointer']], [0.1, [1, 'Free throw']]]);
      out.push({ p: r() * totalPlay, side, pts: v, text });
      pts += v;
    }
  }
  return out;
}

function goalsRaw(r: () => number, n: number, p: number, totalPlay: number, text: (r: () => number) => string): Raw[] {
  const out: Raw[] = [];
  for (const side of ['home', 'away'] as const) {
    let goals = 0;
    for (let i = 0; i < n; i++) if (r() < p) goals++;
    for (let i = 0; i < goals; i++) out.push({ p: r() * totalPlay, side, pts: 1, text: text(r) });
  }
  return out;
}

const timelineCache = new Map<string, Timeline>();

/** The whole game for (sport, seed). Same inputs, same game, always. */
export function buildTimeline(sport: LiveSport, seedKey: string): Timeline {
  const key = `${sport}|${seedKey}`;
  const hit = timelineCache.get(key);
  if (hit) return hit;
  const r = rng(hash32(key));
  let segs = regulation(sport);
  let events: ScoreEvt[] = [];
  let sets: Timeline['sets'];
  const starts = () => { const s: number[] = []; let t = 0; for (const g of segs) { s.push(t); t += g.len; } return s; };
  const totalPlay = () => segs.filter((s) => s.kind === 'play').reduce((a, s) => a + s.len, 0);
  const totals = (ev: ScoreEvt[]) => ev.reduce((a, e) => ({ ...a, [e.side]: a[e.side] + e.pts }), { home: 0, away: 0 });
  const toEvents = (raw: Raw[]): ScoreEvt[] => {
    const st = starts();
    return raw.sort((a, b) => a.p - b.p).map((x) => ({ gs: playToGs(segs, st, x.p), side: x.side, pts: x.pts, text: x.text }));
  };

  if (sport === 'MLB') {
    const runsIn = () => pick<number>(r, [[0.7, 0], [0.14, 1], [0.08, 2], [0.05, 3], [0.03, 4]]);
    const addHalf = (i: number) => {
      const side = i % 2 === 0 ? 'away' : 'home';
      const n = runsIn();
      if (n > 0) events.push({ gs: starts()[i] + 150, side, pts: n, text: `${n} run${n === 1 ? '' : 's'} score` });
    };
    for (let i = 0; i < 18; i++) addHalf(i);
    let t = totals(events);
    // Extra innings until someone leads; a long game is ended by a decisive inning so the demo always finishes.
    for (let inning = 10; t.home === t.away; inning++) {
      segs = [...segs, play(inning, `Top ${ord(inning)}`, 200), play(inning, `Bot ${ord(inning)}`, 200)];
      const i = segs.length - 2;
      addHalf(i); addHalf(i + 1);
      t = totals(events);
      if (t.home === t.away && inning >= 12) { events.push({ gs: starts()[i + 1] + 150, side: r() < 0.5 ? 'home' : 'away', pts: 1, text: '1 run scores' }); t = totals(events); }
    }
  } else if (sport === 'TENNIS') {
    const best3 = 2;
    sets = [];
    let h = 0, a = 0;
    while (h < best3 && a < best3) {
      const homeWins = r() < 0.5;
      const loser = pick<number>(r, [[0.2, 0], [0.2, 1], [0.2, 2], [0.15, 3], [0.15, 4], [0.1, 5]]);
      const tb = loser === 5 ? (r() < 0.5 ? 7 : 6) : 6;
      const set = homeWins ? { home: loser === 5 && tb === 6 ? 7 : 6, away: loser === 5 && tb === 6 ? 6 : loser } : { home: loser === 5 && tb === 6 ? 6 : loser, away: loser === 5 && tb === 6 ? 7 : 6 };
      sets.push(set);
      if (homeWins) h++; else a++;
    }
    segs = sets.map((_, i) => play(i + 1, `Set ${i + 1}`, 1200));
  } else {
    let raw: Raw[];
    if (sport === 'NFL') raw = footballRaw(r, false, totalPlay());
    else if (sport === 'CFB') raw = footballRaw(r, true, totalPlay());
    else if (sport === 'NBA') raw = basketballRaw(r, 112, 11, totalPlay());
    else if (sport === 'CBB') raw = basketballRaw(r, 72, 9, totalPlay());
    else if (sport === 'NHL') raw = goalsRaw(r, 6, 0.5, totalPlay(), (x) => (x() < 0.3 ? 'Power-play goal' : 'Goal'));
    else raw = goalsRaw(r, 8, 0.18, totalPlay(), () => 'Goal');
    events = toEvents(raw);
    const t = totals(events);
    const ot = overtime(sport);
    if (ot && t.home === t.away) {
      // Level at the end of regulation: an overtime segment and one deciding score.
      segs = [...segs, brk('Before overtime', 60, segs[segs.length - 1].period), ot];
      const st = starts();
      const side = r() < 0.5 ? 'home' : 'away';
      const [pts, text] = sport === 'NHL' ? [1, 'Goal'] : sport === 'NBA' || sport === 'CBB' ? [2, 'Basket'] : pick<[number, string]>(r, [[0.5, [3, 'Field goal']], [0.5, [7, 'Touchdown, PAT good']]]);
      events.push({ gs: st[st.length - 1] + Math.floor(ot.len * (0.25 + r() * 0.5)), side, pts, text });
    }
  }
  const st = starts();
  const total = segs.reduce((a, s) => a + s.len, 0);
  const finalScore = sets ? { home: sets.filter((s) => s.home > s.away).length, away: sets.filter((s) => s.away > s.home).length } : totals(events);
  const tl: Timeline = { sport, segs, starts: st, total, events: events.sort((a, b) => a.gs - b.gs), final: finalScore, ...(sets ? { sets } : {}) };
  timelineCache.set(key, tl);
  return tl;
}

export interface SimState {
  phase: GamePhase;
  score: { home: number; away: number } | null;
  clock: LiveClock | null;
  situation: LiveSituation | null;
  plays: LivePlay[];
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function segAt(tl: Timeline, gs: number): number {
  for (let i = tl.segs.length - 1; i >= 0; i--) if (gs >= tl.starts[i]) return i;
  return 0;
}

/** The clock reading at a game second, in the sport's own terms (or null where the sport has no clock). */
function clockAt(tl: Timeline, gs: number): LiveClock | null {
  const i = segAt(tl, Math.min(gs, tl.total - 1));
  const sg = tl.segs[i];
  const into = Math.min(sg.len, gs - tl.starts[i]);
  if (tl.sport === 'MLB' || tl.sport === 'TENNIS') return { period: sg.period, periodLabel: sg.label, display: null, seconds: null, direction: null, running: null };
  if (sg.kind === 'break') return { period: sg.period, periodLabel: sg.label, display: null, seconds: null, direction: null, running: false };
  if (tl.sport === 'SOCCER') {
    const minute = Math.floor((sg.period === 2 ? 2700 + into : into) / 60) + 1;
    return { period: sg.period, periodLabel: sg.label, display: `${Math.min(minute, 90)}'`, seconds: minute * 60, direction: 'up', running: true };
  }
  const left = Math.max(0, sg.len - into);
  return { period: sg.period, periodLabel: sg.label, display: mmss(left), seconds: Math.round(left), direction: 'down', running: true };
}

/** The game at `fraction` (0 = kickoff, 1 = final whistle) of its timeline. Below 0 it has not started; at 1 or more it is final. */
export function stateAt(tl: Timeline, fraction: number, teams: { home: string; away: string }): SimState {
  if (!(fraction >= 0)) return { phase: 'SCHEDULED', score: null, clock: null, situation: null, plays: [] };
  const done = fraction >= 1;
  const gs = done ? tl.total : fraction * tl.total;
  let score: { home: number; away: number };
  let situation: LiveSituation | null = null;
  const plays: LivePlay[] = [];
  if (tl.sets) {
    const i = segAt(tl, Math.min(gs, tl.total - 1));
    const within = done ? 1 : Math.min(1, (gs - tl.starts[i]) / tl.segs[i].len);
    const games = tl.sets.slice(0, i + 1).map((s, k) => (k < i || done ? s : { home: Math.floor(s.home * within), away: Math.floor(s.away * within) }));
    const finished = tl.sets.slice(0, done ? tl.sets.length : i);
    score = { home: finished.filter((s) => s.home > s.away).length, away: finished.filter((s) => s.away > s.home).length };
    situation = { sets: games };
  } else {
    score = { home: 0, away: 0 };
    const upTo = tl.events.filter((e) => e.gs <= gs);
    for (const e of upTo) { score[e.side] += e.pts; }
    const running = { home: 0, away: 0 };
    const all = upTo.map((e) => {
      running[e.side] += e.pts;
      const c = clockAt(tl, e.gs);
      return { periodLabel: c?.periodLabel ?? null, clock: c?.display ?? null, text: `${e.side === 'home' ? teams.home : teams.away}: ${e.text}${tl.sport === 'NBA' || tl.sport === 'CBB' ? '' : ` (${e.pts})`}`, home: running.home, away: running.away } satisfies LivePlay;
    });
    plays.push(...all.slice(-6).reverse());
    if (tl.sport === 'MLB') {
      const i = segAt(tl, Math.min(gs, tl.total - 1));
      const within = (gs - tl.starts[i]) / tl.segs[i].len;
      situation = { half: i % 2 === 0 ? 'top' : 'bottom', outs: done ? null : Math.min(2, Math.floor(within * 3)), lastPlay: plays[0]?.text ?? null };
    } else if (plays[0]) situation = { lastPlay: plays[0].text };
  }
  if (done) return { phase: 'FINAL', score, clock: null, situation, plays };
  const clock = clockAt(tl, gs);
  const onBreak = tl.segs[segAt(tl, gs)].kind === 'break';
  return { phase: onBreak ? 'BREAK' : 'LIVE', score, clock, situation, plays };
}

/** Where a game stands (its timeline fraction) at demo time `t`, given its demo kickoff and length. */
export const fractionAt = (t: number, startMs: number, lengthMs: number) => (t - startMs) / lengthMs;

/**
 * When a game kicks off on the demo clock, relative to the moment the demo was started: spread from 1.3 game-lengths before
 * to 1.2 after, by a hash of the event id, so a freshly started demo shows some games over, some in play and some still to
 * come, and every phase change happens within a couple of game lengths.
 */
export function kickoffMs(eventId: string, epochMs: number, lengthMs: number): number {
  const u = hash32(`${eventId}|kickoff`) / 4294967296;
  return epochMs + (u * 2.5 - 1.3) * lengthMs;
}
