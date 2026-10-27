// What the game screens (Games cards, Game Detail) tell the exact-contract sheet (ui/ContractSheet.tsx) about the contracts they show.
// There is ONE exact-contract experience: a game's spread, total, moneyline, win prices, team totals and player-prop ladders all open the
// addressed sheet (`?sheet=contract&tk=…`). The price handed over is the publication's (or the live store's) UNGATED price; the sheet
// applies the contract-context gate itself and says "Price unavailable right now" (with Retry, and no fee or break-even rows) when it may
// not print one. Nothing here knows about ages or freshness.
import { useEffect, useMemo } from 'react';
import type { EventDetailDoc } from '../../contract/types';
import { deriveProps, type PropRow } from '../data/adapt';
import { teamTotalFor, winContracts } from '../data/research/gameMarkets';
import { clockTime, dayWord } from '../model/format';
import type { MarketLine, Price, V3Game } from '../model/types';
import { publishContracts, type ContractInfo, type ContractNeighbour } from './ContractSheet';

/** A contract's own words without the publication's scaffolding ("SAMPLE: ", "YES iff ", "(FULL)", "[subject: DAL]"). */
export const cleanDescription = (d: string): string =>
  d.replace(/^SAMPLE: /, '').replace(/^YES iff /, '').replace(/\s*\((?:FULL|FULL_GAME)\)/gi, '').replace(/\s*\[subject:[^\]]*\]/g, '').trim();

const KIND_WORD = { spread: 'Spread', total: 'Total', moneyline: 'Win' } as const;

export interface GameFacts {
  g: V3Game;
  /** The schedule authority's start (ms), else the board's: the gate tier and the sheet's subtitle. */
  startMs: number | null;
  /** A link under the numbers to the game ("Game Detail"); omitted on Game Detail itself. */
  detailHref?: string;
}

const subtitleOf = ({ g, startMs }: GameFacts) => {
  const ms = startMs ?? (Number.isFinite(g.startMs) ? g.startMs : null);
  return `${g.away.abbr} at ${g.home.abbr}${ms != null ? ` · ${dayWord(ms)} ${clockTime(ms)}` : ''} · Kalshi YES`;
};
const actionsOf = (f: GameFacts, extra: ContractInfo['actions'] = []): ContractInfo['actions'] => [
  ...extra,
  ...(f.detailHref ? [{ label: 'Game Detail', to: f.detailHref, primary: !extra.length }] : []),
];
const base = (f: GameFacts) => ({ subtitle: subtitleOf(f), startMs: f.startMs ?? (Number.isFinite(f.g.startMs) ? f.g.startMs : null), live: f.g.phase === 'live' });

/** The rungs of one market line (a spread, total or moneyline): each is a contract the sheet can open, the others its neighbours. */
export function contractsOfLine(f: GameFacts, line: MarketLine): ContractInfo[] {
  const ladder: Price[] = line.alternates && line.alternates.length > 1 ? line.alternates : [line.price];
  if (!ladder.some((p) => p.ticker === line.price.ticker)) ladder.push(line.price);
  const side = (i: number) => (line.kind === 'moneyline' && ladder.length === 2 ? `${i === 0 ? f.g.away.name : f.g.home.name} to win` : null);
  const neighbours: ContractNeighbour[] | undefined = ladder.length > 1
    ? ladder.map((p, i) => ({ ticker: p.ticker, label: side(i) ?? cleanDescription(p.description), price: p }))
    : undefined;
  return ladder.map((p, i) => ({
    ticker: p.ticker,
    title: p.ticker === line.price.ticker ? `${KIND_WORD[line.kind]} · ${line.label}` : side(i) ?? cleanDescription(p.description),
    price: p, neighbours, ...base(f), actions: actionsOf(f),
  }));
}

/** The ladder of one player prop: "Dak Prescott: passing yards over 174.5" and its neighbouring rungs. */
export function contractsOfProp(f: GameFacts, row: PropRow): ContractInfo[] {
  const rungs = row.rungs.length ? row.rungs : [{ line: row.line, price: row.price }];
  const neighbours: ContractNeighbour[] | undefined = rungs.length > 1
    ? rungs.map((r) => ({ ticker: r.price.ticker, label: `over ${r.line}`, price: r.price }))
    : undefined;
  const research = row.playerId
    ? [{ label: `Research ${row.player.split(' ')[0]}`, to: `/v3/player/${f.g.slug}/${encodeURIComponent(row.playerId)}?stat=${encodeURIComponent(row.stat)}&line=${row.line}`, primary: true }]
    : [];
  return rungs.map((r) => ({
    ticker: r.price.ticker, title: `${row.player}: ${row.statLabel} over ${r.line}`, price: r.price, neighbours,
    ...base(f), actions: actionsOf(f, research),
  }));
}

/** Everything a game's screens can open: its lines, win prices, team totals and player-prop ladders. */
export function contractsOfGame(f: GameFacts, detail: EventDetailDoc | null | undefined): ContractInfo[] {
  const { g } = f;
  const out: ContractInfo[] = [];
  for (const l of g.lines) out.push(...contractsOfLine(f, l));
  if (detail) {
    const markets = detail.markets ?? [];
    const away = detail.event.away_participant ?? null, home = detail.event.home_participant ?? null;
    for (const w of winContracts(markets, away, home)) {
      const t = w.team === 'away' ? g.away : g.home;
      out.push({ ticker: w.ticker, title: `${t.name} to win`, price: w.price, ...base(f), actions: actionsOf(f) });
    }
    for (const [pid, t] of [[away, g.away], [home, g.home]] as const) {
      const tt = teamTotalFor(markets, pid);
      if (tt) out.push({ ticker: tt.ticker, title: `${t.abbr} team total over ${tt.line}`, price: tt.price, ...base(f), actions: actionsOf(f) });
    }
    for (const row of deriveProps(markets)) out.push(...contractsOfProp(f, row));
  }
  return out;
}

/** Game Detail: publish every contract of the game for the sheet to resolve (also after a reload of `?sheet=contract&tk=…`). */
export function usePublishGameContracts(g: V3Game | null, startMs: number | null, detail: EventDetailDoc | null | undefined): void {
  const list = useMemo(() => (g ? contractsOfGame({ g, startMs }, detail) : []), [g, startMs, detail]);
  useEffect(() => { if (list.length) publishContracts(list); }, [list]);
}

/** A card or row tap: publish the line's contracts (with a link to the game) and return the ticker to open. */
export function publishLine(f: GameFacts, line: MarketLine): string {
  publishContracts(contractsOfLine(f, line));
  return line.price.ticker;
}
/** The same for a player prop row on Game Detail (no link back to the game). */
export function publishProp(f: GameFacts, row: PropRow): string {
  publishContracts(contractsOfProp(f, row));
  return row.price.ticker;
}
