// THE INTELLIGENCE-TO-MARKET CHAIN — one NFL matchup mismatch followed, link by link, to the markets it points at:
//
//   MATCHUP → SCHEME → PLAYER → GAME SCRIPT → MARKET → (does the price justify a bet?) → COUNTER → SURVIVAL
//
// Every link is read from fields the publication (or Sift's own charting layer) already carries, and each says plainly
// when it is missing. Nothing here is a new number:
//   matchup     the opponent-adjusted unit ranks behind the mismatch (src/insights/matchups.ts) and what it indicates
//   scheme      a charted tendency (src/insights/schemePlayers.ts), OBSERVATION ONLY: it does not move the projection
//   player      the offense player whose day the area shapes: the one the market prices deepest on the area's stat,
//               with the publication's simulated projection beside it (research only)
//   scripts     the simulation scripts (src/lib/scripts.ts) whose TEAM volume moves 5% or more with the reading — a
//               volume lean, the same rule as src/lib/scriptExpressions.ts, never a script price or a fit
//   markets     published contracts with an executable price (3–97¢): the player's main rung on the side the reading
//               leans, and the beneficiary's margin contracts with their EXACT script fit (moneyline, full-game spread)
//   judgment    ONLY the opportunity layer's decision for that contract and side (src/opportunity/*); without a
//               candidate, the research-only model price is quoted as such, or its absence is said
//   counter     the strongest published reason the reading fails: a publication candidate on the opposite side, the
//               candidate's own risk field, the scripts that cut against it, or the matchup caveat
//   survival    how many scripts the reading (volume lean) and the margin contract (exact fit) survive
import type { EventResearchDoc, Market, ModelPrice } from '../contract/types';
import { decisionOf, type DecisionTone, type DecisionWord } from '../lib/decision';
import { marketLabel, priceRow, type PriceRow } from '../lib/gamedata';
import { isFullGame } from '../lib/period';
import { authorityLabel } from '../lib/plainLabels';
import { multiScriptSurvivors, survivalWords, tradable } from '../lib/scriptExpressions';
import { scriptFit, sharePct, type ScriptId, type ScriptSet, type TeamVolume } from '../lib/scripts';
import type { MatchupInsight } from '../insights/matchups';
import type { SchemeLink } from '../insights/schemePlayers';
import type { Opportunity } from '../opportunity/types';
import { mismatchMeaning } from './discoveries';

/** Volume move that counts as a lean: 5% of the team's attempts over all simulated games (as src/lib/scriptExpressions.ts). */
export const CHAIN_LEAN = 0.05;

interface AreaPlayer { stat: string; statWord: string; roles: string[]; vol: 'passAtt' | 'rushAtt'; volWord: string }

/** The player market each area points at; areas with no single-player expression (turnovers, red zone, overall) have none. */
const AREA_PLAYER: Partial<Record<MatchupInsight['area'], AreaPlayer>> = {
  run: { stat: 'rushing_yards', statWord: 'rushing yards', roles: ['RB'], vol: 'rushAtt', volWord: 'rush attempts' },
  pass: { stat: 'passing_yards', statWord: 'passing yards', roles: ['QB'], vol: 'passAtt', volWord: 'pass attempts' },
  protection: { stat: 'passing_yards', statWord: 'passing yards', roles: ['QB'], vol: 'passAtt', volWord: 'pass attempts' },
  explosive: { stat: 'receiving_yards', statWord: 'receiving yards', roles: ['WR', 'TE'], vol: 'passAtt', volWord: 'pass attempts' },
  early: { stat: 'passing_yards', statWord: 'passing yards', roles: ['QB'], vol: 'passAtt', volWord: 'pass attempts' },
};

export type Judgment =
  | { kind: 'opportunity'; word: DecisionWord; tone: DecisionTone; basis: string; authority: string; reason: string; opportunityId: string }
  | { kind: 'opposite'; word: DecisionWord; tone: DecisionTone; authority: string; reason: string; opportunityId: string }
  | { kind: 'model-only'; fair: number }
  | { kind: 'none' };

export interface ChainMarket {
  marketId: string;
  ticker: string;
  label: string;
  side: 'YES' | 'NO';
  /** The executable ask of THIS side. */
  ask: number;
  at: string | null;
  basis: 'fit' | 'volume';
  /** Why it is linked, in plain words. */
  why: string;
  /** "Survives 3 of 5 scripts · 68% of simulated games" (fit) or the volume-lean count. */
  survival: string;
  judgment: Judgment;
}

export interface ChainScript {
  id: ScriptId;
  name: string;
  share: number;
  /** The offense's attempts in this script against all simulated games (−0.12 = 12% fewer); null when not published. */
  lean: number | null;
  verdict: 'supports' | 'against' | 'neutral';
}

export interface IntelChain {
  matchup: { indicates: string; offense: string; defense: string; size: 'major' | 'clear'; beneficiary: string };
  scheme: { text: string; sample: string; player: string | null } | null;
  /** Why no scheme link is shown, when none is. */
  schemeNote: string | null;
  player: { pid: string; name: string; role: string | null; team: string; statWord: string; effect: 'up' | 'down'; projection: { mean: number; typical: [number, number] | null } | null } | null;
  playerNote: string | null;
  scripts: { list: ChainScript[]; volWord: string; team: string; supportCount: number; supportShare: number; total: number; tie: number | null } | null;
  scriptNote: string | null;
  markets: ChainMarket[];
  marketNote: string | null;
  counter: { text: string; source: 'publication' | 'scripts' | 'matchup' };
  survives: { text: string; multi: boolean };
}

/** Price rows for a game's published contracts, each with its exact script fit where the contract settles on the margin. */
export function chainRows(r: EventResearchDoc, markets: Market[], modelPrices: ModelPrice[], set: ScriptSet | null): PriceRow[] {
  const homeP = r.participants.find((p) => p.home_away === 'HOME');
  const awayP = r.participants.find((p) => p.home_away === 'AWAY');
  if (!homeP || !awayP) return [];
  const prices = new Map<string, ModelPrice>();
  for (const p of modelPrices) {
    const cur = prices.get(p.market_id);
    if (!cur || (p.generated_at ?? '') > (cur.generated_at ?? '')) prices.set(p.market_id, p);
  }
  const short = (pid: string | null) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? null;
  const name = (id: string | null) => r.players.find((p) => p.participant_id === id)?.display_name ?? null;
  return markets.map((m) => priceRow(m, prices, marketLabel(m, short, name), set ? scriptFit(m, set, homeP.participant_id, awayP.participant_id) : null));
}

/** The opportunity layer's call on one contract and side, or the research-only model price, or nothing. Never re-judged. */
export function judge(marketId: string, ticker: string, side: 'YES' | 'NO', opps: Opportunity[], modelFair: number | null): Judgment {
  const same = (o: Opportunity) => o.marketId === marketId || (!!o.ticker && o.ticker === ticker);
  const o = opps.find((x) => same(x) && x.what.side === side);
  if (o) {
    const d = decisionOf(o.status, o.confidence.calibration);
    return { kind: 'opportunity', word: d.word, tone: d.tone, basis: d.basis, authority: authorityLabel(o.authority), reason: o.statusReason, opportunityId: o.id };
  }
  const opp = opps.find((x) => same(x) && x.what.side !== side);
  if (opp) {
    const d = decisionOf(opp.status, opp.confidence.calibration);
    return { kind: 'opposite', word: d.word, tone: d.tone, authority: authorityLabel(opp.authority), reason: opp.statusReason, opportunityId: opp.id };
  }
  return modelFair != null ? { kind: 'model-only', fair: modelFair } : { kind: 'none' };
}

/** One line on what the judgment says about the price, in words that never claim more than the opportunity layer. */
export function judgmentWords(j: Judgment): string {
  switch (j.kind) {
    case 'opportunity': return `${j.word} — ${j.basis} (${j.authority}).`;
    case 'opposite': return `The publication’s candidate is the other side (${j.word}, ${j.authority}).`;
    case 'model-only': return `No candidate: a research-only model price of ${Math.round(j.fair * 100)}% for YES is published, which is not a bet call.`;
    case 'none': return 'No model price is published for this contract, so nothing says whether this price is good.';
  }
}

const lean = (v: TeamVolume, base: TeamVolume, k: keyof TeamVolume): number | null => {
  const a = v[k];
  const b = base[k];
  return a != null && b ? (a - b) / b : null;
};

/** The rung of a ladder priced closest to even money (the market's main line). */
function mainRung(rows: PriceRow[]): PriceRow | undefined {
  return [...rows].sort((a, b) => Math.abs((a.mid ?? a.ask ?? 0.5) - 0.5) - Math.abs((b.mid ?? b.ask ?? 0.5) - 0.5) || a.m.market_id.localeCompare(b.m.market_id))[0];
}

export interface ChainInput {
  ins: MatchupInsight;
  r: EventResearchDoc;
  set: ScriptSet | null;
  rows: PriceRow[];
  opps: Opportunity[];
  /** A charted scheme tendency against this offense, when Sift's charting layer has one for the area. */
  scheme?: SchemeLink | null;
}

/** Follow one matchup insight to its markets. Pure: it chooses and orders published rows and computes no probability. */
export function buildChain({ ins, r, set, rows, opps, scheme }: ChainInput): IntelChain {
  const off = ins.offense.team;
  const offSide: 'home' | 'away' = off.home ? 'home' : 'away';
  const effect: 'up' | 'down' = ins.side === 'offense' ? 'up' : 'down';
  const ap = AREA_PLAYER[ins.area];
  const modelFair = (id: string) => rows.find((x) => x.m.market_id === id)?.model ?? null;

  // MATCHUP
  const matchup = {
    indicates: mismatchMeaning(ins),
    offense: `${off.abbr} ${ins.offense.unit} #${ins.offense.rank.rank} of ${ins.offense.rank.of}`,
    defense: `${ins.defense.team.abbr} ${ins.defense.unit} #${ins.defense.rank.rank} of ${ins.defense.rank.of}`,
    size: ins.size,
    beneficiary: ins.beneficiary.nick,
  };

  // SCHEME (observation only)
  const sch = scheme && scheme.offense.abbr === off.abbr ? { text: scheme.scheme, sample: scheme.sample, player: scheme.player?.name ?? null } : null;
  const schemeNote = sch ? null : ap ? 'No charted scheme tendency is linked to this area for this game.' : 'This area has no charted scheme tendency to link.';

  // PLAYER: the offense player the market prices deepest on the area's stat; else the publication's lead projection.
  let player: IntelChain['player'] = null;
  let main: PriceRow | undefined;
  if (ap) {
    const teamPlayers = r.players.filter((p) => p.team_id === off.pid);
    const ids = new Set(teamPlayers.map((p) => p.participant_id));
    const ladders = new Map<string, PriceRow[]>();
    for (const x of rows) {
      if (x.m.market_family !== 'player_stat' || !x.m.player_id || !ids.has(x.m.player_id)) continue;
      if ((x.m.extensions?.stat as string | undefined) !== ap.stat || !isFullGame(x.m.period)) continue;
      ladders.set(x.m.player_id, [...(ladders.get(x.m.player_id) ?? []), x]);
    }
    const deepest = [...ladders.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
    const metric = `met_nfl.sim_${ap.stat}`;
    const dist = (pid: string) => r.distributions.find((d) => d.entity_id === pid && d.metric_id === metric && d.mean != null);
    const pid = deepest?.[0] ?? teamPlayers
      .filter((p) => ap.roles.includes(p.role ?? ''))
      .map((p) => ({ p, d: dist(p.participant_id) }))
      .filter((x) => x.d)
      .sort((a, b) => (b.d!.mean as number) - (a.d!.mean as number))[0]?.p.participant_id;
    const p = pid ? teamPlayers.find((x) => x.participant_id === pid) : undefined;
    if (p) {
      const d = dist(p.participant_id);
      const q = d?.quantiles;
      player = {
        pid: p.participant_id, name: p.display_name, role: p.role ?? null, team: off.abbr, statWord: ap.statWord, effect,
        projection: d ? { mean: d.mean as number, typical: q?.p25 != null && q?.p75 != null ? [q.p25, q.p75] : null } : null,
      };
      main = deepest ? mainRung(deepest[1]) : undefined;
    }
  }
  const playerNote = player ? null : ap ? `The publication names no ${off.nick} ${ap.roles.join('/')} with a projection or a priced ${ap.statWord} market.` : 'No single player market follows from this area; it shows in the team’s margin.';

  // SCRIPTS: the offense's attempts by script, read as a volume lean in the reading's direction.
  let scripts: IntelChain['scripts'] = null;
  let scriptNote: string | null = null;
  if (!set) scriptNote = 'The publication carries no simulation scripts for this game.';
  else if (!ap) scriptNote = 'Scripts move team volume; this area has no volume reading, so only the margin contracts are linked by exact fit.';
  else {
    const list: ChainScript[] = set.scripts.map((s) => {
      const l = lean(s.volume[offSide], set.overall[offSide], ap.vol);
      const verdict = l == null || Math.abs(l) < CHAIN_LEAN ? 'neutral' : (l > 0) === (effect === 'up') ? 'supports' : 'against';
      return { id: s.id, name: s.name, share: s.share, lean: l, verdict };
    });
    const sup = list.filter((x) => x.verdict === 'supports');
    scripts = { list, volWord: ap.volWord, team: off.nick, supportCount: sup.length, supportShare: sup.reduce((a, x) => a + x.share, 0), total: list.length, tie: set.tie };
  }

  // MARKETS
  const markets: ChainMarket[] = [];
  const supportWord = scripts ? `Leans with ${scripts.supportCount} of ${scripts.total} scripts · ${sharePct(scripts.supportShare)} of simulated games (volume lean)` : 'No script reading';
  if (player && main) {
    const side: 'YES' | 'NO' = effect === 'up' ? 'YES' : 'NO';
    const ask = side === 'YES' ? main.m.yes_ask : main.m.no_ask ?? null;
    if (tradable(ask)) {
      markets.push({
        marketId: main.m.market_id, ticker: main.m.kalshi_ticker, label: main.label, side, ask, at: main.m.captured_at ?? null, basis: 'volume',
        why: `${player.name}’s main ${ap!.statWord} line, on the side the matchup leans (${effect === 'up' ? 'more' : 'fewer'}).`,
        survival: supportWord, judgment: judge(main.m.market_id, main.m.kalshi_ticker, side, opps, modelFair(main.m.market_id)),
      });
    }
  }
  const benPid = ins.beneficiary.pid;
  const margin = rows.filter((x) => x.fit && x.m.participant_id === benPid && tradable(x.ask));
  const ml = margin.find((x) => x.m.market_family === 'game_winner');
  const best = set ? multiScriptSurvivors(margin, set, 1, 1)[0] : undefined;
  const marginRow = (x: PriceRow, why: string) => markets.push({
    marketId: x.m.market_id, ticker: x.m.kalshi_ticker, label: x.label, side: 'YES', ask: x.ask!, at: x.m.captured_at ?? null, basis: 'fit', why,
    survival: set ? survivalWords({ full: x.fit!.full, total: set.scripts.length, coverage: x.fit!.coverage }) : 'No scripts',
    judgment: judge(x.m.market_id, x.m.kalshi_ticker, 'YES', opps, modelFair(x.m.market_id)),
  });
  if (ml) marginRow(ml, `${ins.beneficiary.nick} to win: the matchup favours them, and the moneyline settles on the final margin (exact fit).`);
  if (best && best.row.m.market_id !== ml?.m.market_id && best.full > (ml?.fit?.full ?? 0)) marginRow(best.row, 'The beneficiary’s margin contract that always wins in the most scripts (exact fit).');
  else if (best && !ml) marginRow(best.row, 'The beneficiary’s margin contract that always wins in the most scripts (exact fit).');
  const marketNote = markets.length ? null : 'No contract this reading points at has an executable price (3–97¢) in the publication.';

  // COUNTER: the strongest published reason it fails, strongest source first.
  const opposite = markets.find((m) => m.judgment.kind === 'opposite');
  const risk = markets.map((m) => (m.judgment.kind === 'opportunity' ? opps.find((o) => o.id === (m.judgment as { opportunityId: string }).opportunityId)?.risk : null)).find((x) => !!x);
  const against = scripts?.list.filter((x) => x.verdict === 'against').sort((a, b) => b.share - a.share)[0];
  const mlRow = markets.find((m) => m.basis === 'fit');
  const mlFit = mlRow ? rows.find((x) => x.m.market_id === mlRow.marketId)?.fit : null;
  let counter: IntelChain['counter'];
  if (opposite && opposite.judgment.kind === 'opposite') counter = { text: `The publication’s own candidate on ${opposite.label} is the other side (${opposite.side === 'YES' ? 'NO' : 'YES'}): ${opposite.judgment.reason}`, source: 'publication' };
  else if (risk) counter = { text: `Published risk: ${risk}`, source: 'publication' };
  else if (against && scripts) counter = { text: `In “${against.name}” (${sharePct(against.share)} of simulated games) the ${scripts.team}’ ${scripts.volWord} ${against.lean! > 0 ? 'rise' : 'fall'} ${Math.round(Math.abs(against.lean!) * 100)}%, against the reading.`, source: 'scripts' };
  else if (mlFit && set && mlFit.coverageMax < 1) counter = { text: `${mlRow!.label} loses in every game of scripts holding ${sharePct(1 - mlFit.coverageMax - (set.tie ?? 0))} of simulated games${set.tie ? `, and ties (${sharePct(set.tie)}) settle neither side` : ''}: the matchup edge does not decide the game.`, source: 'scripts' };
  else counter = { text: 'A ranked mismatch says who holds the edge, not by how much, and the market may already price it.', source: 'matchup' };

  // SURVIVAL: the player reading (volume lean) and the best margin contract (exact fit), each said on its own.
  const parts: string[] = [];
  if (scripts) {
    const n = scripts.supportCount;
    parts.push(n >= 2 ? `The ${player ? `${player.name} ` : ''}reading survives ${n} of ${scripts.total} scripts (${sharePct(scripts.supportShare)} of simulated games, volume lean)`
      : n === 1 ? `The ${player ? `${player.name} ` : ''}reading rests on one script (${sharePct(scripts.supportShare)} of simulated games, volume lean)`
        : `No script leans the ${player ? `${player.name} ` : ''}reading’s way`);
  }
  const fitBest = markets.filter((m) => m.basis === 'fit').map((m) => ({ m, f: rows.find((x) => x.m.market_id === m.marketId)?.fit })).filter((x) => !!x.f).sort((a, b) => b.f!.full - a.f!.full)[0];
  if (fitBest && set) parts.push(`${fitBest.m.label} always wins in ${fitBest.f!.full} of ${set.scripts.length} (exact fit)`);
  // The badge follows the reading itself (the player's volume lean) when there is one, else the best margin contract.
  const multi = scripts ? scripts.supportCount >= 2 : (fitBest?.f?.full ?? 0) >= 2;
  const survives = { text: parts.length ? `${parts.join('; ')}.` : 'No script or margin reading to test it against.', multi };

  return { matchup, scheme: sch, schemeNote, player, playerNote, scripts, scriptNote, markets, marketNote, counter, survives };
}

/** One sentence for the evidence panel: what the opportunity layer says about the markets the chain reached. */
export function chainEvidenceLine(c: IntelChain): string {
  if (!c.markets.length) return 'The markets this matchup points at have no executable price, so there is nothing to judge.';
  const called = c.markets.filter((m) => m.judgment.kind === 'opportunity' || m.judgment.kind === 'opposite');
  if (called.length) return `${called.length} of ${c.markets.length} linked contracts carry a publication call; the rest are not candidates. The matchup itself carries no model price.`;
  const model = c.markets.filter((m) => m.judgment.kind === 'model-only').length;
  return `None of the ${c.markets.length} linked contracts is a publication candidate${model ? `; ${model} carr${model === 1 ? 'ies' : 'y'} a research-only model price, which is not a bet call` : ''}. The matchup itself carries no model price.`;
}
