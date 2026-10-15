import type { ReactNode } from 'react';
import { Link } from '../../routing';
import type { EventResearchDoc } from '../../contract/types';
import type { MatchupInsight } from '../../insights/matchups';
import type { ContextNote } from '../../insights/context';
import type { PropCard } from '../../insights/props';
import type { ScriptSet } from '../../lib/scripts';
import type { PriceRow } from '../../lib/gamedata';
import { sharePct } from '../../lib/scripts';
import { broadcastPlayerPhoto as playerPhoto } from './playerArt';
import { routes } from '../../lib/routes';
import { Icon } from '../Icon';
import { PlayerArt } from './PlayerArt';
import { topContracts } from '../../views/game/Dashboard';
import { centsText } from '../../lib/gamedata';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFromResearch } from '../../lib/hero/input';
import { venueWeather, venueWeatherLine } from '../../lib/venue';

function PanelHeading({ icon, title, link, label = 'View all' }: { icon: string; title: string; link?: string; label?: string }) {
  return <header className="s2-panel-heading"><h2><Icon name={icon} size={26} />{title}</h2>{link && <Link to={link}>{label} <Icon name="arrowRight" size={14} /></Link>}</header>;
}
const evidence = (x: MatchupInsight) => `${x.offense.team.abbr} ${x.offense.unit} ${x.offense.rank.text} vs ${x.defense.team.abbr} ${x.defense.unit} ${x.defense.rank.text}`;
export function CommandOverview({ insights, context, set, cards, href }: { insights: MatchupInsight[]; context: ContextNote[]; set: ScriptSet | null; cards: PropCard[]; href: (tab: 'matchup' | 'script' | 'props', id?: string) => string }) {
  const lead = insights[0];
  const players = [...new Map(cards.map((p) => [p.playerId, p])).values()];
  const photographed = [...players].sort((a,b) => Number(!!playerPhoto(b.playerId,b.name,b.team.abbr)) - Number(!!playerPhoto(a.playerId,a.name,a.team.abbr)));
  const featured = photographed.slice(0,4);
  const note = context.find((x) => x.kind === 'qb-change' || x.kind === 'key-absence');
  return <div className="s2-command-overview">
    <section className="s2-read s2-glass gdash__read">
      <PanelHeading icon="brain" title="The Game Read" />
      <p className="s2-read__lead">{lead ? <>{lead.headline}. <span>{evidence(lead)}. {insights[1] ? `${insights[1].headline}.` : ''}</span></> : context[0]?.headline ?? 'Explore the published matchup evidence for this game.'}</p>
      <div className="s2-read__tiles">{insights.slice(0,2).map((x,i) => <Link to={href('matchup')} key={x.id}><Icon name={i ? 'shield' : 'trend'} size={32} /><strong>{x.areaLabel}</strong><span>{x.beneficiary.abbr} {x.side} advantage</span></Link>)}<Link to={href(note ? 'matchup' : 'script')}><Icon name={note ? 'alert' : 'football'} size={32} /><strong>{note ? 'Availability matters' : 'Game environment'}</strong><span>{note?.headline ?? set?.scripts[0]?.name ?? 'Read the matchup'}</span></Link></div>
      <span className="s2-panel-foot">Opponent-adjusted matchup evidence · research, not a bet</span>
    </section>
    <section className="s2-scripts s2-glass gdash__scripts">
      <PanelHeading icon="chart" title="Game Scripts" link={href('script')} label="Details" />
      {set ? <ol className="s2-script-rows">{set.scripts.map((s,i) => <li key={s.id}><Link to={href('script',s.id)}><b>{sharePct(s.share)}</b><span><strong>{s.name}</strong><i className={`s2-script-bar s2-script-bar--${i}`}><i style={{ width: `${s.share*100}%` }} /></i></span><Icon name="chevronRight" size={15} /></Link></li>)}</ol> : <p>No simulation summary was published.</p>}
      <span className="s2-panel-foot">Simulation shares. Not calibrated probabilities.</span>
    </section>
    <section className="s2-drivers s2-glass">
      <PanelHeading icon="target" title="Key Matchup Drivers" link={href('matchup')} />
      <div className="s2-driver-list">{insights.slice(0,3).map((x) => {
        // Illustration must match the unit: no quarterback photo representing a run defense.
        const p = x.side==='offense' ? photographed.find((c) => c.team.abbr === x.beneficiary.abbr && (x.area==='run' ? c.role==='RB' : x.area==='pass'||x.area==='protection' ? c.role==='QB' : true)) : undefined;
        return <Link to={href('matchup')} className="s2-driver" key={x.id}><div className="s2-driver__art"><PlayerArt id={p?.playerId ?? ''} name={p?.name ?? ''} team={x.beneficiary.abbr} surface="driver" /></div><span><strong>{x.areaLabel} · {x.beneficiary.abbr}</strong><small>{evidence(x)}</small></span><Icon name="chevronRight" size={14} /></Link>;
      })}</div>
      {!insights.length && <p>Ranked matchup drivers are not published for this game.</p>}
    </section>
    <section className="s2-featured-players s2-glass">
      <PanelHeading icon="users" title="Featured Players" link={href('props')} label="View all players" />
      <div className="s2-featured-player-grid">{featured.map((p) => {
        const photo=playerPhoto(p.playerId,p.name,p.team.abbr);
        const stats=[...new Set(cards.filter((c) => c.playerId===p.playerId).map((c) => c.statLabel))].slice(0,3);
        return <Link to={href('props')} className={`s2-featured-player${photo ? ' has-photo' : ''}`} key={p.playerId}><PlayerArt id={p.playerId} name={p.name} team={p.team.abbr} surface="wide" /><div><strong>{p.name}</strong><small>{p.role ?? 'Player'} · {p.team.abbr}</small><span>{stats.map((s) => <i key={s}>{s}</i>)}</span></div><Icon name="chart" size={16} /></Link>;
      })}</div>
      {!featured.length && <p>No player snapshots were published for this game.</p>}
    </section>
  </div>;
}
export function CommandMarkets({ rows, now, slug, eventId, href, title = 'Markets at a glance' }: { rows: PriceRow[]; now: number; slug: string; eventId: string; href: string; title?: string }) {
  const top=topContracts(rows);
  const groups=[['To win',top.filter((x)=>x.m.market_family==='game_winner'||x.m.market_family==='game_moneyline')],['Spread',top.filter((x)=>x.group==='spreads'&&x.m.market_family!=='game_winner'&&x.m.market_family!=='game_moneyline')],['Total',top.filter((x)=>x.group==='totals')]] as const;
  return <section className="s2-market-snapshot s2-glass"><PanelHeading icon="chart" title={title} link={href} label="All markets" /><div className="s2-market-groups">{groups.map(([title,xs]) => <div key={title}><h3>{title}</h3>{xs.length ? xs.map((x) => <Link key={x.m.market_id} to={routes.market(slug,x.m.market_id,eventId)}><span>{x.label}</span><b>{centsText(x.ask)}</b><small>{x.m.captured_at ? formatQuoteAgo(quoteAgeMs(x.m.captured_at,now)) : 'Time unavailable'}</small></Link>) : <span className="s2-market-missing">No published quote</span>}</div>)}</div><p className="s2-panel-foot">YES asks · before fees · open a market for freshness and terms</p></section>;
}
export function CommandRail({ r, rows, now, slug, eventId, children }: { r: EventResearchDoc; rows: PriceRow[]; now: number; slug: string; eventId: string; children: ReactNode }) {
  const spec=resolveHero(heroInputFromResearch(r,'NFL')); const wx=venueWeather(r,spec.venue);const line=venueWeatherLine(wx);
  const href=(tab:string)=>`/design/sift2${routes.game(slug,eventId,{tab})}`;
  return <aside className="s2-command-rail" aria-label="Market context and quick research">
    {line && <div className="s2-rail-weather s2-glass"><Icon name={wx.icon} size={28}/><span><b>{wx.kind==='outdoor' ? `${wx.temp}°` : 'Roof'}</b><small>{line}</small></span></div>}
    <CommandMarkets rows={rows} now={now} slug={slug} eventId={eventId} href={href('markets')} />
    <section className="s2-rail-links s2-glass"><PanelHeading icon="bolt" title="Quick links"/>{[['props','users','All player props'],['matchup','target','Team matchups'],['script','trend','Game scripts'],['injuries','medic','Injury report'],['trends','chart','Line movement']].map(([tab,icon,label])=><Link key={tab} to={href(tab)}><Icon name={icon} size={19}/>{label}<Icon name="chevronRight" size={13}/></Link>)}</section>
    <details className="s2-model-details s2-glass"><summary>Model & source context</summary>{children}<p className="s2-panel-foot">Research model. Disagreement is not a validated edge.</p></details>
  </aside>;
}
