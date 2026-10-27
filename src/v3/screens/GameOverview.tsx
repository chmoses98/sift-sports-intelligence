// Game Detail, Overview (locked G2): the win price, the players to research, both team rows and the props row. Light by design: it
// reads only the schedule, the event's own documents and (for key players) the props already in them, never a team profile.
// Prices go through the quote gate and open the addressed contract sheet; a completed game keeps the Teams card and shows no price.
import { useMemo } from 'react';
import { useGatedAsk, useRoster } from '../data/research/gameHooks';
import { winContracts, type WinContract } from '../data/research/gameMarkets';
import { deriveProps } from '../data/adapt';
import { NFL_PROP_UNITS, playersToResearch, type ResearchPlayer } from '../data/research/keyMatchups';
import { routes } from '../nav/routes';
import { NavRow, PlayerLink, PriceTap, PropsLink, TeamLink } from '../nav/Targets';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { Avatar, type GameCtx } from './GameShared';

export function useWinContracts(ctx: GameCtx): WinContract[] {
  const { g, detail } = ctx;
  return useMemo(() => {
    if (g.provenance === 'demo') {
      const alt = g.lines.find((l) => l.kind === 'moneyline')?.alternates;
      return alt && alt.length === 2 ? [{ team: 'away' as const, ticker: alt[0].ticker, price: alt[0] }, { team: 'home' as const, ticker: alt[1].ticker, price: alt[1] }] : [];
    }
    return winContracts(detail?.markets, detail?.event.away_participant ?? null, detail?.event.home_participant ?? null);
  }, [g, detail]);
}

export function WinPrices({ ctx }: { ctx: GameCtx }) {
  const { g } = ctx;
  const wins = useWinContracts(ctx);
  const ask = useGatedAsk(g, ctx.detail, ctx.startMs, wins.map((w) => w.ticker));
  if (g.phase === 'final') return null;
  if (g.provenance === 'publication' && !ctx.detail) return <div className="x-card mx-sec"><div className="mx-sh"><h2>Win price</h2></div><div className="v3-skel" style={{ height: 58 }} role="status" aria-label="Loading win price" /></div>;
  return (
    <div className="x-card mx-sec" role="region" aria-label="Win price" data-testid="win-price">
      <div className="mx-sh"><h2>Win price</h2><span className="x-note">Kalshi · pre-fee</span></div>
      {wins.length === 0 ? <p className="x-note">No win-price contract is listed for this game.</p> : (
        <div className="mx-win">
          {wins.map((w) => {
            const t = w.team === 'away' ? g.away : g.home;
            const a = ask(w.ticker, w.price);
            return (
              <PriceTap key={w.ticker} ticker={w.ticker} className="mx-win__t" label={`${t.name} to win: open contract`}>
                <span><TeamLogo team={t} size={20} />{t.abbr} to win</span><b className="num">{a != null ? `${a}¢` : '—'}</b>
              </PriceTap>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlayersToResearch({ ctx }: { ctx: GameCtx }) {
  const { g, detail, research } = ctx;
  const roster = useRoster(g, research);
  const props = useMemo(() => (detail ? deriveProps(detail.markets ?? []) : []), [detail]);
  const items = useMemo(() => playersToResearch({ props, roster, statUnits: g.slug === 'nfl' ? NFL_PROP_UNITS : undefined, max: 3 }), [props, roster, g.slug]);
  const ask = useGatedAsk(g, detail, ctx.startMs, items.map((k) => k.price.ticker));
  if (g.phase === 'final' || items.length === 0) return null;
  return (
    <div className="x-card mx-sec" role="region" aria-label="Players to research" data-testid="players-to-research">
      <div className="mx-sh"><h2>Players to research</h2><span className="x-note">most props listed</span></div>
      {items.map((k: ResearchPlayer) => {
        const a = ask(k.price.ticker, k.price);
        const t = k.team ? (k.team === g.away.id ? g.away : g.home) : null;
        return (
          <NavRow key={k.playerId} to={routes.player({ slug: g.slug, id: k.playerId }, { stat: k.stat, line: k.line })} kind="player" label={`${k.name}: player research`} className="mx-km">
            <div className="mx-km__in mx-km__in--s">
              <PlayerLink player={{ slug: g.slug, id: k.playerId }} state={{ stat: k.stat, line: k.line }} className="mx-av" label={`${k.name}: player research`}>
                {k.team ? <Avatar k={{ playerId: k.playerId, name: k.name, team: k.team }} g={g} /> : <span className="mx-av__none" aria-hidden="true" />}
              </PlayerLink>
              <div className="mx-kt"><b>{k.name}</b><span>{k.role ? `${k.role} · ` : ''}{t ? `${t.abbr} · ` : ''}{k.label}</span></div>
              <PriceTap ticker={k.price.ticker} className="mx-kp" label={`${k.name} ${k.label}: open contract`}><b className="num">{a != null ? `${a}¢` : '—'}</b><span>{k.label}</span></PriceTap>
              <Icon name="chevR" size={16} />
            </div>
          </NavRow>
        );
      })}
    </div>
  );
}

export function TeamsCard({ ctx }: { ctx: GameCtx }) {
  const { g } = ctx;
  return (
    <div className="x-card mx-sec" role="region" aria-label="Teams" data-testid="game-teams">
      <div className="mx-sh"><h2>Teams</h2></div>
      {[g.away, g.home].map((t) => (
        <TeamLink key={t.id} team={{ slug: t.slug, id: t.id }} className="mx-km mx-km--team" label={`${t.name}: Team Research`}>
          <span className="mx-av mx-av--plain"><TeamLogo team={t} size={30} /></span>
          <span className="mx-kt"><b>{t.name}</b><span>Team Research</span></span>
          <Icon name="chevR" size={16} />
        </TeamLink>
      ))}
    </div>
  );
}

/** Prop Discovery is a later milestone: the address is built with the route builder and does not resolve to its screen yet. */
export function PropsRow({ ctx }: { ctx: GameCtx }) {
  const { g, detail } = ctx;
  const rows = useMemo(() => (detail ? deriveProps(detail.markets ?? []) : []), [detail]);
  const players = useMemo(() => new Set(rows.map((r) => r.playerId ?? r.player)).size, [rows]);
  if (g.phase === 'final') return null;
  if (g.provenance === 'publication' && detail && rows.length === 0) return null;
  const sub = g.provenance === 'demo' ? 'Sample props' : detail ? `${rows.length} props across ${players} players` : 'Loading props';
  return (
    <PropsLink state={{ game: g.eventId }} className="x-card mx-prow" label={`Props in this game: ${sub}`}>
      <span><b>Props in this game</b><small>{sub}</small></span><span className="mx-prow__o">Open <Icon name="chevR" size={14} /></span>
    </PropsLink>
  );
}
