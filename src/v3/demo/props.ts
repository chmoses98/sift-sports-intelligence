// SAMPLE DATA. Fictional players, prices, game logs and ranks so Prop Discovery can be exercised without a network and compared with the
// approved designs. Every price here is labelled `Sample`, the app shows its "Sample data" strip whenever this is in use, and nothing in
// real mode ever reads this file (data/props/hooks.ts chooses it only when sample mode is on).
import { FAMILIES, type FamilyDef } from '../data/props/families';
import { summarize } from '../data/props/load';
import type { PlayerLog } from '../data/props/history';
import type { Prop, PropRung, UnitRank, Universe } from '../data/props/types';
import type { V3Game } from '../model/types';

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };
const pick = <T,>(xs: T[], s: string) => xs[hash(s) % xs.length];

const FIRST = ['Alex', 'Jordan', 'Chris', 'Taylor', 'Sam', 'Devon', 'Riley', 'Casey', 'Morgan', 'Jamie', 'Drew', 'Quinn', 'Reese', 'Parker', 'Blake', 'Cameron'];
const LAST = ['Sample', 'Example', 'Placeholder', 'Fictional', 'Mockup', 'Trial', 'Pilot', 'Demo'];
const POS = ['QB', 'RB', 'WR', 'WR', 'TE', 'WR', 'RB'];

interface Spec { stat: string; mu: number; step: number; n: number; positions?: string[] }
const NFL_SPECS: Spec[] = [
  { stat: 'passing_yards', mu: 245, step: 25, n: 6, positions: ['QB'] },
  { stat: 'receiving_yards', mu: 58, step: 10, n: 6, positions: ['WR', 'TE', 'RB'] },
  { stat: 'receptions', mu: 4.6, step: 1, n: 6, positions: ['WR', 'TE', 'RB'] },
  { stat: 'rushing_yards', mu: 62, step: 10, n: 6, positions: ['RB', 'QB'] },
  { stat: 'touchdowns', mu: 0.7, step: 1, n: 2 },
];
const NBA_SPECS: Spec[] = [{ stat: 'points', mu: 22, step: 4, n: 6 }, { stat: 'assists', mu: 5, step: 2, n: 5 }, { stat: 'rebounds', mu: 6, step: 2, n: 5 }];
const MLB_SPECS: Spec[] = [{ stat: 'hitter_hits', mu: 0.9, step: 1, n: 3 }, { stat: 'hitter_total_bases', mu: 1.6, step: 1, n: 4 }, { stat: 'hitter_rbis', mu: 0.6, step: 1, n: 3 }];

const ladder = (g: string, id: string, s: Spec, startMs: number): PropRung[] => {
  const first = s.mu < 3 ? 1 : Math.max(1, Math.round((s.mu - s.step * 2) / s.step) * s.step);
  const ks = Array.from({ length: s.n }, (_, i) => (s.mu < 3 ? first + i : Number.isInteger(s.step) && s.step === 1 ? Math.max(1, Math.round(s.mu) - 2 + i) : first + i * s.step));
  return ks.map((k) => {
    const z = (k - s.mu) / (s.step * 1.4 || 1);
    const ask = Math.max(3, Math.min(96, Math.round(100 / (1 + Math.exp(z * 1.3)))));
    return { k, ticker: `SAMPLE-${g}-${id}-${k}`, ask, bid: ask - 1, volume: 200 + (hash(`${id}${k}`) % 9000), capturedAt: new Date(startMs - 60_000).toISOString(), source: 'Sample' as const };
  });
};

const nearEven = (rungs: PropRung[]) => [...rungs].sort((a, b) => Math.abs((a.ask ?? 50) - 50) - Math.abs((b.ask ?? 50) - 50) || a.k - b.k)[0].k;

function sampleFamily(slug: string, stat: string): FamilyDef {
  const known = FAMILIES[`${slug}:${stat}`];
  if (known) return known;
  const key = stat.replace(/^(hitter|pitcher|player)_/, '');
  const label = key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return { fam: key, label, abbr: key.toUpperCase().slice(0, 6), playerStat: slug === 'nba' ? ({ points: 'pts', assists: 'ast', rebounds: 'reb' } as Record<string, string>)[key] ?? null : null, history: null, oppUnit: null };
}

/** Sample game log rows for the History lane: box-style rows (the same shape the hockey publication ships), dated before any slate. */
export function demoLogFor(id: string, col: string, mu: number): PlayerLog {
  const rows = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 6 + i * 3));
    const v = Math.max(0, Math.round(mu * (0.45 + ((hash(`${id}${col}${i}`) % 100) / 100) * 1.2)));
    return { game_id: `2026${i}`, date: d.toISOString().slice(0, 10), [col]: v, toi_s: 1200 };
  });
  return { kind: 'nhl', rows };
}

/** Which sport slugs the sample universe covers: the sample slate's own pregame games. */
export function demoUniverse(games: V3Game[]): Universe {
  const props: Prop[] = [];
  const ranks = new Map<string, Map<string, UnitRank>>();
  const rankFor = (slug: string, metric: string, code: string, n: number): UnitRank => {
    const m = ranks.get(`${slug}:${metric}`) ?? new Map<string, UnitRank>();
    ranks.set(`${slug}:${metric}`, m);
    if (!m.has(code)) m.set(code, { rank: 1 + (hash(`${metric}${code}`) % n), n, value: null, window: 'SAMPLE', rankingId: 'sample' });
    return m.get(code)!;
  };
  for (const g of games.filter((x) => x.phase === 'pregame')) {
    const specs = g.slug === 'nfl' ? NFL_SPECS : g.slug === 'nba' ? NBA_SPECS : g.slug === 'mlb' ? MLB_SPECS : null;
    if (!specs) continue;
    const perTeam = g.slug === 'nfl' ? 14 : g.slug === 'nba' ? 6 : 9;
    for (const side of ['away', 'home'] as const) {
      const team = g[side]; const opp = side === 'away' ? g.home : g.away;
      for (let i = 0; i < perTeam; i++) {
        const name = `${pick(FIRST, `${team.abbr}${i}f`)} ${pick(LAST, `${team.abbr}${i}l`)}${i > 7 ? ` ${i}` : ''}`;
        const pos = g.slug === 'nfl' ? POS[i % POS.length] : null;
        const pid = `sample-${g.slug}-${team.abbr}-${i}`.toLowerCase();
        for (const s of specs) {
          if (s.positions && pos && !s.positions.includes(pos) && s.stat !== 'touchdowns') continue;
          if (g.slug === 'nfl' && s.stat === 'touchdowns' && i > 7) continue;
          const fam = sampleFamily(g.slug, s.stat);
          const rungs = ladder(g.slug, pid, s, g.startMs);
          const featured = nearEven(rungs);
          if (fam.oppUnit) rankFor(g.slug, fam.oppUnit.metric, opp.abbr, 28);
          const out = (hash(`${pid}out`) % 17) === 0 ? 'OUT' : null;
          const published = g.slug === 'nfl' && s.stat === 'receptions' && hash(`${pid}m`) % 3 === 0;
          const byK: Record<number, number> = {};
          if (published) for (const r of rungs) if (r.k % 2 === 1 || r.k > 5) byK[r.k] = Math.max(0.03, Math.min(0.95, (r.ask ?? 50) / 100 + ((hash(`${pid}${r.k}`) % 11) - 5) / 100));
          props.push({
            id: `SAMPLE-${g.slug}-${pid}-${s.stat}`, slug: g.slug, sportLabel: g.sport, eventId: g.eventId, gameKey: g.key, startMs: g.startMs, away: g.away, home: g.home,
            playerId: pid, histId: g.slug === 'mlb' ? null : `${pid}~${s.stat}~${s.mu}`, name, team: team.abbr, opp: opp.abbr, position: pos,
            stat: s.stat, fam: fam.fam, label: fam.label, abbr: fam.abbr, playerStat: fam.playerStat,
            history: g.slug === 'mlb' ? null : { kind: 'nhl', col: s.stat }, oppUnit: fam.oppUnit, rungs, featured,
            playerPage: g.slug !== 'mlb', out,
            model: published ? { state: 'published', byK } : { state: 'none', reason: `SIFT’s model for ${fam.label.toLowerCase()} is not approved for display` },
            provenance: 'demo',
          });
        }
      }
    }
  }
  props.sort((a, b) => a.startMs - b.startMs || a.name.localeCompare(b.name) || a.fam.localeCompare(b.fam));
  return summarize(props, ranks, [], 0, true);
}
