// The shared tap targets. Screens never hand-build a link: a team is a <TeamLink>, a statistic a <StatLink>, and so on, so the
// destination, the 44-point hit area and the test hook (`data-tap`, `data-dest`) are identical everywhere.
//
// Rows that hold several targets use <NavRow>: the row body is a stretched link to the row's main object; each logo, rank,
// player and price inside it is its own <…Link>/<PriceTap>, raised above the stretch. No anchor is ever nested in an anchor.
import type { ComponentProps, ReactNode } from 'react';
import { Link, useLocation } from '../../routing';
import { routes, withSheet, type GameRef, type PlayerRef, type StatRef, type TapKind, type TeamRef } from './routes';

type Common = { className?: string; children: ReactNode; label?: string };

function Tap({ kind, to, className, children, label, ...rest }: Common & { kind: TapKind; to: string } & Omit<ComponentProps<typeof Link>, 'to' | 'className' | 'children'>) {
  return (
    <Link {...rest} to={to} className={`v3-tap${className ? ` ${className}` : ''}`} data-tap={kind} data-dest={to} aria-label={label}>
      {children}
    </Link>
  );
}

type TeamState = Parameters<typeof routes.team>[1];
type PlayerState = Parameters<typeof routes.player>[1];
type StatState = Parameters<typeof routes.stat>[1];
type GameState = Parameters<typeof routes.game>[1];
type PropsState = Parameters<typeof routes.props>[0];

export const TeamLink = ({ team, state, ...c }: Common & { team: TeamRef; state?: TeamState }) => <Tap kind="team" to={routes.team(team, state)} {...c} />;
export const PlayerLink = ({ player, state, ...c }: Common & { player: PlayerRef; state?: PlayerState }) => <Tap kind="player" to={routes.player(player, state)} {...c} />;
/** Defaults to the ranking tab with the given entity highlighted: the destination of every rank, value or percentile. */
export const StatLink = ({ stat, state, ...c }: Common & { stat: StatRef; state?: StatState }) => <Tap kind="stat" to={routes.stat(stat, state)} {...c} />;
export const GameLink = ({ game, state, ...c }: Common & { game: GameRef; state?: GameState }) => <Tap kind="game" to={routes.game(game, state)} {...c} />;
export const PropsLink = ({ state, ...c }: Common & { state?: PropsState }) => <Tap kind="props" to={routes.props(state)} {...c} />;

/**
 * A price on a contract: opens the exact-contract sheet on top of the current screen. The sheet is part of the address
 * (`?sheet=contract&tk=…`) and is pushed as a history entry, so the browser Back button closes it and the screen underneath
 * is exactly as it was. Rendering the price (or "—" when no reliable quote exists) is the caller's job; this is only the target.
 */
export function PriceTap({ ticker, className, children, label }: Common & { ticker: string }) {
  const loc = useLocation();
  const to = `${loc.pathname}${withSheet(loc.search, { kind: 'contract', tk: ticker })}`;
  return (
    <Link to={to} state={{ ...(loc.state ?? {}), v3sheet: 'contract' }} preventScrollReset className={`v3-tap v3-tap--price${className ? ` ${className}` : ''}`} data-tap="price" data-dest={to} aria-label={label}>
      {children}
    </Link>
  );
}

/** A row with one main destination and any number of independent targets inside it. */
export function NavRow({ to, kind, label, className, children }: { to: string; kind: TapKind; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`v3-navrow${className ? ` ${className}` : ''}`}>
      <Link to={to} className="v3-navrow__main" data-tap={kind} data-dest={to} aria-label={label} />
      {children}
    </div>
  );
}
