// SCRIPT → MARKET EXPRESSIONS and MULTI-SCRIPT SURVIVORS for the NFL simulation scripts (owner items 14 and 16).
//
// Only contracts that exist in the publication with an executable price are listed; a script with nothing priced in a
// family says so. Two kinds of link, never mixed:
//   * FIT — the moneyline and full-game spread settle on the final margin, so each script either always, never or only
//     partly pays them (lib/scripts.ts rangeFit). Exact.
//   * VOLUME LEAN — the publication splits TEAM volume by script (pass and rush attempts), not player projections. A
//     player yardage contract is listed under a script only when its team's attempts in that script move 5% or more
//     from all simulated games, as a direction ("leans with the script"), never as a script price or a fit.
// Totals and team totals need a joint margin × points script the NFL publication does not carry: listed as missing.
//
// Pure functions: they choose and order published rows; they compute no probability.
import type { EventResearchDoc } from '../contract/types';
import type { PriceRow } from './gamedata';
import { isFullGame } from './period';
import { sharePct, type Fit, type GameScript, type ScriptId, type ScriptSet, type TeamVolume } from './scripts';

/** An executable price: inside 3¢–97¢ (outside, the "price" is a placeholder with no real offer). */
export const tradable = (p: number | null | undefined): p is number => p != null && p >= 0.03 && p <= 0.97;

// ------------------------------------------------------------------ survivors (item 16)

export interface Survivor {
  row: PriceRow;
  /** Scripts it always wins in. */
  full: number;
  /** Scripts it wins only some of the time in. */
  part: number;
  total: number;
  /** Sim share of the scripts it always wins in. */
  coverage: number;
  /** Ladder rungs with exactly the same script pattern on the same side, folded into this row. */
  similar: number;
  fits: Fit[];
}

/**
 * Margin contracts ordered by how many scripts they always win in, then the share of simulated games those scripts hold.
 * Rungs of one ladder that win and lose in exactly the same scripts are one row (the rung priced closest to even money,
 * the most liquid expression of that pattern), so the list shows distinct ways to survive. A contract that always wins
 * in fewer than `min` scripts is not a multi-script survivor.
 */
export function multiScriptSurvivors(rows: PriceRow[], set: ScriptSet, min = 2, n = 6): Survivor[] {
  const eligible = rows.filter((r) => r.fit && tradable(r.ask) && r.fit.full >= min);
  const byPattern = new Map<string, PriceRow[]>();
  for (const r of eligible) {
    const k = `${r.m.participant_id}|${r.m.market_family}|${r.fit!.fits.join('')}`;
    byPattern.set(k, [...(byPattern.get(k) ?? []), r]);
  }
  return [...byPattern.values()]
    .map((g) => {
      const lead = [...g].sort((a, b) => Math.abs((a.ask ?? 0.5) - 0.5) - Math.abs((b.ask ?? 0.5) - 0.5) || a.m.market_id.localeCompare(b.m.market_id))[0];
      return { row: lead, full: lead.fit!.full, part: lead.fit!.part, total: set.scripts.length, coverage: lead.fit!.coverage, similar: g.length - 1, fits: lead.fit!.fits };
    })
    .sort((a, b) => b.full - a.full || b.coverage - a.coverage || b.part - a.part || a.row.m.market_id.localeCompare(b.row.m.market_id))
    .slice(0, n);
}

// ------------------------------------------------------------------ expressions per script (item 14)

export type ExpressionKind = 'moneyline' | 'spread' | 'prop';

export interface ScriptExpression {
  row: PriceRow;
  kind: ExpressionKind;
  side: 'YES' | 'NO';
  /** The executable ask of THIS side (YES ask for YES, NO ask for NO). */
  ask: number;
  basis: 'fit' | 'volume';
  /** One short reason in plain words. */
  why: string;
}

export interface ScriptExpressions {
  script: GameScript;
  items: ScriptExpression[];
  /** Families with no linked contract, and why (shown, never hidden). */
  missing: string[];
}

const LEAN = 0.05;
/** Player props listed per script: the strongest volume leans, one per player. */
export const MAX_PROPS = 4;

/** What a volume lean is, said once beside the list. */
export const VOLUME_LEAN_NOTE = 'Volume lean: the team’s attempts move with this script, so the prop leans the same way. A direction, not a script price — player projections are not split by script.';

const lean = (s: GameScript, set: ScriptSet, side: 'home' | 'away', k: keyof TeamVolume): number | null => {
  const v = s.volume[side][k];
  const b = set.overall[side][k];
  return v != null && b ? (v - b) / b : null;
};

const PROP_STATS: { stat: string; vol: 'passAtt' | 'rushAtt'; volWord: string }[] = [
  { stat: 'passing_yards', vol: 'passAtt', volWord: 'pass attempts' },
  { stat: 'rushing_yards', vol: 'rushAtt', volWord: 'rush attempts' },
  { stat: 'carries', vol: 'rushAtt', volWord: 'rush attempts' },
  { stat: 'receiving_yards', vol: 'passAtt', volWord: 'pass attempts' },
  { stat: 'receptions', vol: 'passAtt', volWord: 'pass attempts' },
];

/** The rung of a ladder priced closest to even money: the market's main line. */
function mainRung(rows: PriceRow[]): PriceRow | undefined {
  return [...rows].sort((a, b) => Math.abs((a.mid ?? a.ask ?? 0.5) - 0.5) - Math.abs((b.mid ?? b.ask ?? 0.5) - 0.5) || a.m.market_id.localeCompare(b.m.market_id))[0];
}

/**
 * Every priced contract that expresses one script, by family: the moneyline and spreads that always win in it (the
 * safest and the most demanding spread that still always wins), then the player props that lean with the script's team
 * volume. `names` are the teams' display words.
 */
export function scriptExpressions(r: EventResearchDoc, rows: PriceRow[], set: ScriptSet, id: ScriptId, names: { home: string; away: string }): ScriptExpressions {
  const i = set.scripts.findIndex((s) => s.id === id);
  const s = set.scripts[i];
  const items: ScriptExpression[] = [];
  const missing: string[] = [];
  const priced = rows.filter((x) => tradable(x.ask) && x.fit && x.fit.fits[i] === 'yes');
  const others = (x: PriceRow) => x.fit!.fits.filter((f, j) => j !== i && f === 'yes').length;
  const word = (x: PriceRow) => (others(x) ? `Always wins in this script and ${others(x)} other${others(x) === 1 ? '' : 's'}.` : 'Always wins in this script, and only here.');

  const ml = priced.filter((x) => x.m.market_family === 'game_winner' && isFullGame(x.m.period));
  for (const x of ml) items.push({ row: x, kind: 'moneyline', side: 'YES', ask: x.ask!, basis: 'fit', why: word(x) });
  if (!ml.length && s.leader) missing.push(`No priced ${names[s.leader]} moneyline that wins in every game of this script.`);

  const spreads = priced.filter((x) => x.m.market_family === 'spread' && isFullGame(x.m.period) && x.m.threshold != null);
  if (spreads.length) {
    // Safest: the line closest to even money that still always wins; most demanding: the highest line that still does.
    const main = mainRung(spreads)!;
    const hardest = [...spreads].sort((a, b) => (b.m.threshold ?? 0) - (a.m.threshold ?? 0))[0];
    items.push({ row: main, kind: 'spread', side: 'YES', ask: main.ask!, basis: 'fit', why: word(main) });
    if (hardest.m.market_id !== main.m.market_id) items.push({ row: hardest, kind: 'spread', side: 'YES', ask: hardest.ask!, basis: 'fit', why: `The longest line that still always wins here. ${word(hardest)}` });
  } else missing.push(s.leader ? 'No priced full-game spread wins in every game of this script.' : 'No spread wins in every one-score game: either team can win it.');

  // Volume-led props: the team whose attempts move most in this script, its main rung, YES when up and NO when down.
  // One contract per player (his first-listed stat), the strongest leans first, at most MAX_PROPS.
  const props: { lean: number; player: string; x: ScriptExpression }[] = [];
  for (const side of ['home', 'away'] as const) {
    const tid = r.participants.find((p) => p.home_away === (side === 'home' ? 'HOME' : 'AWAY'))?.participant_id;
    const players = new Set(r.players.filter((p) => p.team_id === tid).map((p) => p.participant_id));
    for (const ps of PROP_STATS) {
      const l = lean(s, set, side, ps.vol);
      if (l == null || Math.abs(l) < LEAN) continue;
      const ladders = new Map<string, PriceRow[]>();
      for (const x of rows) {
        if (x.m.market_family !== 'player_stat' || !x.m.player_id || !players.has(x.m.player_id)) continue;
        if ((x.m.extensions?.stat as string | undefined) !== ps.stat || !isFullGame(x.m.period)) continue;
        ladders.set(x.m.player_id, [...(ladders.get(x.m.player_id) ?? []), x]);
      }
      // The player with the most market depth on this stat (the role the market itself prices).
      const best = [...ladders.values()].sort((a, b) => b.length - a.length)[0];
      const main = best ? mainRung(best) : undefined;
      if (!main) continue;
      const up = l > 0;
      const ask = up ? main.m.yes_ask : main.m.no_ask;
      if (!tradable(ask)) continue;
      props.push({
        lean: Math.abs(l), player: main.m.player_id!,
        x: { row: main, kind: 'prop', side: up ? 'YES' : 'NO', ask, basis: 'volume', why: `${names[side]} ${ps.volWord} ${up ? '+' : '−'}${Math.round(Math.abs(l) * 100)}% in this script.` },
      });
    }
  }
  const seenPlayer = new Set<string>();
  for (const p of props.sort((a, b) => b.lean - a.lean || a.x.row.m.market_id.localeCompare(b.x.row.m.market_id))) {
    if (seenPlayer.has(p.player) || seenPlayer.size >= MAX_PROPS) continue;
    seenPlayer.add(p.player);
    items.push(p.x);
  }
  if (!items.some((x) => x.kind === 'prop')) missing.push('No player prop leans with this script: neither team’s attempts move 5% or more, or the prop is not priced.');
  missing.push('Totals and team totals: the simulation publishes no points by script, so no total is linked.');
  // One row per contract and side.
  const seen = new Set<string>();
  return { script: s, items: items.filter((x) => (seen.has(x.row.m.market_id + x.side) ? false : (seen.add(x.row.m.market_id + x.side), true))), missing };
}

/** "Survives 2 of 4 scripts · 61% of simulated games". */
export function survivalWords(x: Pick<Survivor, 'full' | 'total' | 'coverage'>): string {
  return `Survives ${x.full} of ${x.total} scripts · ${sharePct(x.coverage)} of simulated games`;
}
