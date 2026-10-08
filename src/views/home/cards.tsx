// Building blocks shared by the global Home and a sport's home: the featured game (a cinematic band
// over its stadium), game tiles, slate rows, the script bar and the model–market gaps. Everything shown
// comes from the board and each game's own event research; nothing is ranked as a pick.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import type { SportRepo } from '../../data/repo';
import { Icon } from '../../components/Icon';
import { HeroArt, heroVars } from '../../components/HeroArt';
import { MarketIcon, MarketIconProvider } from '../../components/MarketIcon';
import { publicationView, QuoteChip, QuoteSummaryChip, useQuoteViews } from '../../components/LiveQuote';
import { TeamMark } from '../../components/ui';
import { gapText } from '../../lib/gamedata';
import { kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFor } from '../../lib/hero/input';
import { useLiveQuotes } from '../../live/hooks';
import { atWord, gameWeather, heroData, splitName } from '../game/Hero';
import { useInView } from '../../lib/useImage';
import { PanelHead } from '../game/panels';
import type { MatchupInsight } from '../../insights/matchups';
import { matchupInsights } from '../../insights/matchups';
import { isFullGame } from '../../lib/period';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function sides(item: BoardItem) {
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  return { away, home };
}

/** Every upcoming game's event research, read once and shared (the same memo key everywhere). */
export function useSlateResearch(repo: SportRepo | null | undefined, sportCode: string, items: BoardItem[]) {
  const key = items.map((i) => i.event_id).join(',');
  return useAsync(repo && key ? `slateResearch:${sportCode}:${key}` : null, async () => {
    const out = await Promise.allSettled(items.map((i) => repo!.eventResearch(i.event_id)));
    const m = new Map<string, EventResearchDoc>();
    out.forEach((o, k) => o.status === 'fulfilled' && m.set(items[k].event_id, o.value));
    return m;
  });
}

export function modelLine(r: EventResearchDoc | null | undefined): string | null {
  const mv = (r?.extensions as any)?.model_view;
  if (!mv || mv.model_spread == null) return null;
  const home = r!.participants.find((p) => p.home_away === 'HOME');
  const away = r!.participants.find((p) => p.home_away === 'AWAY');
  const short = (pid?: string) => r!.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const favHome = Number(mv.model_spread) <= 0;
  const fav = short((favHome ? home : away)?.participant_id);
  const pts = Math.round(Math.abs(Number(mv.model_spread)) * 2) / 2;
  const wp = mv.model_win_probability?.[fav];
  return `${fav} −${pts}${wp != null ? ` · ${Math.round(wp * 100)}%` : ''}${mv.model_total != null ? ` · O/U ${Math.round(mv.model_total * 2) / 2}` : ''}`;
}

/**
 * The game to open first, compact: the stadium photo stays visible (one gradient at the foot), with only
 * the teams, kickoff, place and one thesis line on it. Everything else is one tap away.
 */
export function FeatureCard({ item, r, insight, sportSlug, sportCode, now }: { item: BoardItem; r: EventResearchDoc | null | undefined; insight: MatchupInsight | null; sportSlug: string; sportCode: string; now: number }) {
  const { away, home } = sides(item);
  const spec = useMemo(() => resolveHero(heroInputFor(item, r, sportCode)), [item, r, sportCode]);
  const venue = spec.venue;
  const set = r ? gameScripts(r) : null;
  const wx = r ? gameWeather(r, venue) : null;
  const a = splitName(away?.display_name ?? '', away?.short_name, sportCode);
  const h = splitName(home?.display_name ?? '', home?.short_name, sportCode);
  const lead = set?.scripts[0];
  return (
    <article className={`fcard fcard--${spec.kind}${spec.photo ? '' : ' fcard--nophoto'}`} style={heroVars(spec)} {...heroData(spec)}>
      <Link to={routes.game(sportSlug, item.event_id)} className="fcard__a" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}. Open game.`}>
        <div className="fcard__img" aria-hidden="true"><HeroArt spec={spec} variant="card" /></div>
        <div className="fcard__in">
          <span className="fcard__when">{kickoff(item.start_time_utc)}{Date.parse(item.start_time_utc) > now ? ` · ${until(item.start_time_utc, now)}` : ''}</span>
          <span className="fcard__match">
            <span className="fcard__team"><TeamMark sport={sportCode} abbr={away?.short_name} size="lg" /><span className="fcard__n">{a.nick}</span></span>
            <span className="fcard__at">{atWord(spec)}</span>
            <span className="fcard__team"><TeamMark sport={sportCode} abbr={home?.short_name} size="lg" /><span className="fcard__n">{h.nick}</span></span>
          </span>
          <span className="fcard__meta">{venue ? `${venue.name}` : ''}{wx && wx.kind === 'outdoor' ? ` · ${wx.temp}° ${wx.condition ?? ''}` : wx && wx.kind === 'indoor' ? ` · ${wx.condition}` : ''}{wx?.flag ? ` · ${wx.flag}` : ''}</span>
        </div>
      </Link>
      <div className="fcard__foot">
        {insight ? <p className="fcard__thesis">{insight.headline}</p> : <p className="fcard__thesis">{lead ? `Most likely: ${lead.name}` : sportCode === 'MLB' ? 'Open the game for its lines and player props' : 'Open the game for its scripts and matchups'}</p>}
        {lead && <span className="fcard__lead"><i className={`sdot sdot--s${lead.index}`} aria-hidden="true" />Most likely: {lead.name} <b className="num">{sharePct(lead.share)}</b></span>}
      </div>
      {spec.photo && <span className="fcard__credit">Photo: {spec.photo.credit.artist.slice(0, 32)} · {spec.photo.credit.license}</span>}
    </article>
  );
}

/** A game tile: the stadium as a strip with both logos, the matchup, kickoff, the headline edge and the most likely script. */
export function GameTile({ item, r, sportSlug, sportCode, now }: { item: BoardItem; r: EventResearchDoc | null | undefined; sportSlug: string; sportCode: string; now: number }) {
  const { away, home } = sides(item);
  const spec = useMemo(() => resolveHero(heroInputFor(item, r, sportCode)), [item, r, sportCode]);
  const [ref, inView] = useInView<HTMLLIElement>();
  const set = r ? gameScripts(r) : null;
  const winners = useMemo(() => (r?.markets ?? []).filter((m) => m.market_family === 'game_winner'), [r]);
  useLiveQuotes(winners.map((m) => m.kalshi_ticker), 'slate');
  const views = useQuoteViews(winners);
  const passed = Date.parse(item.start_time_utc) <= now && item.status === 'SCHEDULED';
  const lead = set ? set.scripts[0] : null;
  return (
    <li className={`gtile gcard gtile--${spec.kind}${spec.photo ? '' : ' gtile--nophoto'}`} ref={ref} style={{ ...heroVars(spec), ['--home' as string]: teamColors(sportCode, home?.short_name)[0] }} {...heroData(spec)}>
      <div className="gtile__img" aria-hidden="true">
        <HeroArt spec={spec} variant="tile" load={inView} />
        <span className="gtile__logos"><TeamMark sport={sportCode} abbr={away?.short_name} size="lg" /><i>{atWord(spec)}</i><TeamMark sport={sportCode} abbr={home?.short_name} size="lg" /></span>
      </div>
      <Link to={routes.game(sportSlug, item.event_id)} className="gtile__link gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
        <span className="gtile__when"><span>{new Date(item.start_time_utc).toLocaleDateString(undefined, { weekday: "short" })} {new Date(item.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><span className={passed ? 'is-passed' : ''}>{passed ? (sportCode === 'MLB' ? 'First pitch passed' : 'Kicked off') : until(item.start_time_utc, now)}</span></span>
        <span className="gtile__t">{splitName(away?.display_name ?? '', away?.short_name, sportCode).nick} <span className="gtile__at">{atWord(spec)}</span> {splitName(home?.display_name ?? '', home?.short_name, sportCode).nick}</span>
        {lead && (
          <span className="gtile__script" style={{ ['--sc' as string]: `var(--script-${lead.index})` }}>
            <span className="gtile__k"><i className={`sdot sdot--s${lead.index}`} aria-hidden="true" />Most likely <b className="num">{sharePct(lead.share)}</b></span>
            <span className="gtile__sn">{lead.name}</span>
            <span className="gtile__story">{lead.line}</span>
          </span>
        )}
        {r === undefined ? (
          <span className="gtile__model gcard__hook--load">Reading research…</span>
        ) : (
          <span className="gtile__model">{r ? matchupInsights(r)[0]?.headline ?? (sportCode === 'MLB' ? 'Lines, model inputs and player props' : 'Evenly matched on the published ranks') : 'No event research published'}</span>
        )}
      </Link>
      <div className="gtile__foot">
        {views.length ? <QuoteSummaryChip views={views} now={now} /> : <QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" />}
      </div>
    </li>
  );
}

/** One slate line: kickoff, both logos, the model line and the leading script. */
export function SlateRow({ item, r, sportSlug, sportCode }: { item: BoardItem; r: EventResearchDoc | undefined; sportSlug: string; sportCode: string }) {
  const { away, home } = sides(item);
  const set = r ? gameScripts(r) : null;
  const lead = set ? set.scripts[0] : null;
  return (
    <li>
      <Link to={routes.game(sportSlug, item.event_id)} className="slrow">
        <span className="slrow__t">{new Date(item.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        <span className="slrow__m">
          <TeamMark sport={sportCode} abbr={away?.short_name} size="sm" /><span>{splitName(away?.display_name ?? '', away?.short_name, sportCode).nick}</span>
          <span className="slrow__at">at</span>
          <TeamMark sport={sportCode} abbr={home?.short_name} size="sm" /><span>{splitName(home?.display_name ?? '', home?.short_name, sportCode).nick}</span>
        </span>
        <span className="slrow__model num">{r ? modelLine(r) ?? '' : ''}</span>
        <span className="slrow__lead">{lead && <><i className={`sdot sdot--s${lead.index}`} />{lead.name} <b className="num">{sharePct(lead.share)}</b></>}</span>
        <Icon name="chevronRight" size={16} className="slrow__go" />
      </Link>
    </li>
  );
}

/** Game-line markets where the model and the market midpoint differ most (research evidence). */
export function Disagreements({ items, research, slug, title = 'Model vs Market', n = 6 }: { items: BoardItem[]; research: Map<string, EventResearchDoc>; slug: string; title?: string; n?: number }) {
  const rows = useMemo(() => {
    const out: { label: string; game: string; eventId: string; marketId: string; model: number; mkt: number; gap: number; m: EventResearchDoc['markets'][number]; short: (pid: string | null) => string }[] = [];
    for (const i of items) {
      const r = research.get(i.event_id);
      if (!r) continue;
      const { away, home } = sides(i);
      const byId = new Map(r.markets.map((m) => [m.market_id, m]));
      const short = (pid: string | null) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
      for (const p of r.projections) {
        const m = byId.get(p.market_id ?? '');
        if (!m || p.fair_probability == null || p.market_probability == null || !isFullGame(m.period)) continue;
        if (!['game_winner', 'spread', 'total'].includes(m.market_family)) continue;
        if (p.market_probability < 0.1 || p.market_probability > 0.9) continue;
        const t = m.threshold;
        const label = m.market_family === 'game_winner' ? `${short(m.participant_id)} to win` : m.market_family === 'spread' ? `${short(m.participant_id)} −${t}` : `Over ${t != null && Number.isInteger(t) ? t - 0.5 : t}`;
        out.push({ label, game: `${away?.short_name} at ${home?.short_name}`, eventId: i.event_id, marketId: m.market_id, model: p.fair_probability, mkt: p.market_probability, gap: p.fair_probability - p.market_probability, m, short });
      }
    }
    return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, n);
  }, [items, research, n]);
  if (!rows.length) return null;
  return (
    <section className="panel" aria-labelledby="dis-h">
      <PanelHead title={title} sub="Largest gaps on game lines · research evidence, not validated edges" />
      <div className="tscroll"><table className="mtab mtab--compact ">
        <thead><tr><th scope="col">Market</th><th scope="col" className="r">Market</th><th scope="col" className="r">Model</th><th scope="col" className="r">Gap</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.marketId}>
              <th scope="row"><span className="mkrow"><MarketIconProvider value={{ abbrOf: (pid) => (pid ? x.short(pid) : null), playerTeam: () => null, sport: 'NFL' }}><MarketIcon m={x.m} /></MarketIconProvider><span className="mkrow__t"><Link to={routes.market(slug, x.marketId, x.eventId)} className="mtab__m">{x.label}</Link><span className="mtab__sub">{x.game}</span></span></span></th>
              <td className="r num">{Math.round(x.mkt * 100)}%</td>
              <td className="r num">{Math.round(x.model * 100)}%</td>
              <td className="r"><span className={`gap ${Math.round(x.gap * 100) > 0 ? 'gap--pos' : Math.round(x.gap * 100) < 0 ? 'gap--neg' : 'gap--flat'}`}>{gapText(x.gap)}</span></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}

/** The game to feature: the next kickoff window's busiest market. */
export function featuredItem(items: BoardItem[], now: number): BoardItem | null {
  const sched = items.filter((i) => i.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
  const ahead = sched.filter((i) => Date.parse(i.start_time_utc) > now);
  const up = ahead.length ? ahead : sched.reverse();
  if (!up.length) return null;
  const first = up[0].start_time_utc;
  return up.filter((i) => i.start_time_utc === first).sort((a, b) => b.markets_available - a.markets_available)[0];
}
