import type { ReactNode } from 'react';
import type { HeroSpec, HeroTeam } from '../../lib/hero/types';
import { HeroArt, heroVars } from '../HeroArt';

interface Side { team: HeroTeam | null; record?: string | null; score?: number | null }
export interface BroadcastHeroProps {
  spec: HeroSpec;
  start: string;
  title: string;
  sport: string;
  away: Side;
  home: Side;
  status?: string;
  level?: 1 | 2;
  compact?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}
function Club({ team, record, score }: Side) {
  if (!team) return <div className="s2-club">Participant unavailable</div>;
  const city = team.name.endsWith(team.short) ? team.name.slice(0, -team.short.length).trim() : '';
  return <div className="s2-club">
    {team.logo ? <img src={team.logo} alt="" className="s2-club__logo" /> : <span className="s2-club__initial">{team.code}</span>}
    {city && <span className="s2-club__city">{city}</span>}
    <strong>{team.short}</strong>
    {record && <small>{record}</small>}
    {score != null && <b className="s2-club__score">{score}</b>}
  </div>;
}
/** Broadcast composition; all identity, scores, records and art are supplied by existing verified readers. */
export function BroadcastHero({ spec, start, title, sport, away, home, status, level = 1, compact, actions, children }: BroadcastHeroProps) {
  const date = new Date(start);
  const dated = Number.isFinite(date.getTime());
  return <header className={`s2-broadcast${compact ? ' s2-broadcast--compact' : ''}`} style={heroVars(spec)} data-hero-kind={spec.kind} data-hero-context={spec.context}>
    <div className="s2-broadcast__art"><HeroArt spec={spec} /></div>
    <div className="s2-broadcast__top"><span>{sport} <i>/</i> {compact ? 'FEATURED MATCHUP' : 'GAME COMMAND CENTER'}</span>{actions}</div>
    {level === 1 ? <h1 className="sr-only">{title}</h1> : <h2 className="sr-only">{title}</h2>}
    <div className="s2-broadcast__matchup">
      <Club {...away} />
      <div className="s2-broadcast__when">
        <span>{dated ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Schedule unavailable'}</span>
        {dated && <strong>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</strong>}
        {spec.venue ? <><span>{spec.venue.name}</span>{spec.venue.city && <small>{spec.venue.city}</small>}</> : <small>Venue not verified</small>}
        {status && <small className="s2-broadcast__status">{status}</small>}
      </div>
      <Club {...home} />
    </div>
    {children && <div className="s2-broadcast__footer">{children}</div>}
    {spec.photo && <a className="s2-broadcast__credit" href={spec.photo.credit.source}>Photo: {spec.photo.credit.artist} · {spec.photo.credit.license}</a>}
  </header>;
}
