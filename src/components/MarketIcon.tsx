// The market symbol: recognition before reading. A team market leads with the team's logo (with a small
// type badge when the type is not obvious); a game-level market shows its type symbol. One glyph set,
// drawn on a 16-unit grid with the same stroke everywhere. Decorative (aria-hidden): the market's text
// label always carries the meaning; the title explains the symbol on hover.
import { createContext, useContext, type ReactNode } from 'react';
import type { Market } from '../contract/types';
import { KIND_LABEL, marketAnchor, type MarketKind } from '../lib/marketKind';
import { TeamMark } from './ui';

const G: Record<MarketKind, ReactNode> = {
  moneyline: <path d="M5 3h6v3a3 3 0 0 1-6 0zM8 9v3M5.5 13h5M5 4H3a2 2 0 0 0 2 3M11 4h2a2 2 0 0 1-2 3" />,
  spread: <><path d="M3 5.5h4M5 3.5v4" /><path d="M9 10.5h4" /><path d="M11.5 3 5 13" /></>,
  total: <><path d="m4 6.5 4-3.5 4 3.5" /><path d="m4 9.5 4 3.5 4-3.5" /></>,
  'team-total': <><rect x="2.5" y="4" width="11" height="8" rx="1.5" /><path d="M8 4v8M5 7v2.5M10.5 6.8h1.2v2.6" /></>,
  passing: <><ellipse cx="6" cy="10" rx="3.6" ry="2.2" transform="rotate(-35 6 10)" /><path d="M9 6.5c1.5-2 3-2.7 4.5-3" strokeDasharray="1.6 1.4" /></>,
  rushing: <><path d="M3 5h4M2 8h4M3 11h4" /><ellipse cx="11" cy="8" rx="3.2" ry="2.1" /></>,
  receiving: <><ellipse cx="8" cy="5" rx="3" ry="1.9" /><path d="M3 9.5c1 3 2.6 4 5 4s4-1 5-4" /></>,
  receptions: <><ellipse cx="6.5" cy="5" rx="2.8" ry="1.8" /><path d="M2.5 9c.8 2.6 2.2 3.5 4 3.5S9.7 11.6 10.5 9" /><path d="M12.5 4v8M14.5 4v8" /></>,
  touchdown: <><path d="M4 2.5v11" /><path d="M4 3h8l-2 2.5 2 2.5H4" /></>,
  kicking: <><path d="M4 2.5v6.5h8V2.5M8 9v4.5" /><circle cx="8" cy="5" r="1.2" /></>,
  defense: <path d="M8 2.5 13 4.5v3.5c0 3-2.2 5-5 5.8C5.2 13 3 11 3 8V4.5z" />,
  fantasy: <path d="m8 2.5 1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.2 4.6 13l.7-3.8-2.8-2.7 3.8-.5z" />,
  period: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" /></>,
  parlay: <><rect x="2" y="5.5" width="6" height="5" rx="2.5" /><rect x="8" y="5.5" width="6" height="5" rx="2.5" /></>,
  game: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2.2 1.4" /></>,
};

export function KindGlyph({ kind, size = 16 }: { kind: MarketKind; size?: number }) {
  return (
    <svg className={`mkglyph mkglyph--${kind}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {G[kind]}
    </svg>
  );
}

/** Which kinds need no badge on a team logo (the logo and the label already say it). */
const PLAIN_ON_LOGO: MarketKind[] = ['moneyline'];

interface Resolver { abbrOf: (pid: string | null) => string | null; playerTeam: (playerId: string | null) => string | null; sport: string }
const Ctx = createContext<Resolver>({ abbrOf: () => null, playerTeam: () => null, sport: 'NFL' });
export const MarketIconProvider = Ctx.Provider;

export function MarketIcon({ m }: { m: Pick<Market, 'market_family' | 'period' | 'participant_id' | 'player_id' | 'extensions'> }) {
  const { abbrOf, playerTeam, sport } = useContext(Ctx);
  const a = marketAnchor(m, abbrOf, playerTeam);
  const title = `${KIND_LABEL[a.kind]}${a.team ? ` · ${a.team}` : ''}${a.period ? ` · ${a.period}` : ''}`;
  return (
    <span className={`mkicon${a.team ? ' mkicon--team' : ''}`} title={title} aria-hidden="true">
      {a.team ? <TeamMark sport={sport} abbr={a.team} size="sm" /> : <span className="mkicon__solo"><KindGlyph kind={a.kind} /></span>}
      {a.team && !PLAIN_ON_LOGO.includes(a.kind) && <span className="mkicon__badge"><KindGlyph kind={a.kind} size={14} /></span>}
      {a.period && <span className="mkicon__per">{a.period}</span>}
    </span>
  );
}
