// Building blocks shared by the global Home and a sport's home: the featured game (a cinematic band
// over its stadium), game tiles, slate rows, the script bar and the model–market gaps. Everything shown
// comes from the board and each game's own event research; nothing is ranked as a pick.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import type { SportRepo } from '../../data/repo';
import { Icon } from '../../components/Icon';
import { StadiumFallback } from '../../components/StadiumFallback';
import { MarketIcon, MarketIconProvider } from '../../components/MarketIcon';
import { publicationView, QuoteChip, QuoteSummaryChip, useQuoteViews } from '../../components/LiveQuote';
import { SaveButton, TeamMark } from '../../components/ui';
import { gapText, modelRead } from '../../lib/gamedata';
import { kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct, type ScriptSet } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { venueFor, venuePhoto } from '../../lib/venues';
import { useLiveQuotes } from '../../live/hooks';
import { gameWeather, splitName, WeatherBlock } from '../game/Hero';
import { useHeldImage, useInView } from '../../lib/useImage';
import { PanelHead } from '../game/panels';

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

/** The four scripts as one proportional bar, with a legend of shares (labels carry identity). */
export function ScriptBar({ set, labels = true }: { set: ScriptSet; labels?: boolean }) {
  return (
    <div className="smini">
      <div className="sbar" role="img" aria-label={`Game scripts: ${set.scripts.map((s) => `${s.name} ${sharePct(s.share)}`).join(', ')}`}>
        {set.scripts.map((s) => <span key={s.id} className={`sbar__seg sbar__seg--s${s.index}`} style={{ flexGrow: s.share }} />)}
      </div>
      {labels && (
        <ul className="smini__l" aria-hidden="true">
          {set.scripts.map((s) => (
            <li key={s.id}><i className={`sdot sdot--s${s.index}`} />{s.name}<b className="num">{sharePct(s.share)}</b></li>
          ))}
        </ul>
      )}
    </div>
  );
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

/** The marquee: a cinematic band over the game's stadium — matchup, place, weather, the model's read. */
export function FeaturedGame({ item, r, sportSlug, sportCode, now, eyebrow, size = 'md' }: { item: BoardItem; r: EventResearchDoc | null | undefined; sportSlug: string; sportCode: string; now: number; eyebrow: string; size?: 'md' | 'lg' }) {
  const { away, home } = sides(item);
  const venue = venueFor(home?.short_name, (r?.context?.venue as any)?.name ?? null);
  const photo = venuePhoto(venue);
  const img = useHeldImage(photo?.hero);
  const set = r ? gameScripts(r) : null;
  const read = r && home && away ? modelRead(r, splitName(home.display_name ?? '').nick, splitName(away.display_name ?? '').nick, null, null) : null;
  const wx = r ? gameWeather(r, venue) : null;
  const a = splitName(away?.display_name ?? '');
  const h = splitName(home?.display_name ?? '');
  const [hc] = teamColors(sportCode, home?.short_name);
  const [ac] = teamColors(sportCode, away?.short_name);
  return (
    <article className={`feat feat--${size}${photo ? '' : ' feat--nophoto'}`} style={{ ['--home' as string]: hc, ['--away' as string]: ac, ['--focus' as string]: venue?.focus ?? 'center 45%' }}>
      <div className="feat__bg" aria-hidden="true">{img ? <img src={img} alt="" decoding="async" /> : !photo && <StadiumFallback venue={venue?.name ?? null} />}</div>
      <div className="feat__in">
        <div className="feat__top">
          <span className="eyebrow">{eyebrow}</span>
          <span className="feat__when">{kickoff(item.start_time_utc)}{Date.parse(item.start_time_utc) > now ? <span> · {until(item.start_time_utc, now)}</span> : null}</span>
        </div>
        <Link to={routes.game(sportSlug, item.event_id)} className="feat__match gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
          <span className="feat__team"><TeamMark sport={sportCode} abbr={away?.short_name} size="lg" /><span className="feat__n"><small>{a.city}</small>{a.nick}</span></span>
          <span className="feat__at" aria-hidden="true">at</span>
          <span className="feat__team feat__team--home"><span className="feat__n"><small>{h.city}</small>{h.nick}</span><TeamMark sport={sportCode} abbr={home?.short_name} size="lg" /></span>
        </Link>
        <div className="feat__meta">
          {venue && <span className="feat__venue">{venue.name} · {venue.city}</span>}
          {wx && <WeatherBlock wx={wx} compact />}
        </div>
        {read && <p className="feat__read">{read}</p>}
        {set && <ScriptBar set={set} />}
        <div className="feat__cta">
          <Link to={routes.game(sportSlug, item.event_id)} className="btn btn--primary btn--sm">Open game <Icon name="arrowRight" size={15} /></Link>
          <Link to={routes.game(sportSlug, item.event_id, { tab: 'script' })} className="btn btn--glass btn--sm">Game scripts</Link>
        </div>
      </div>
      {photo && <span className="feat__credit">Photo: {photo.credit.artist.slice(0, 36)} · {photo.credit.license}</span>}
    </article>
  );
}

/** A game tile: the stadium as a strip with both logos, the matchup, kickoff, the model line, scripts. */
export function GameTile({ item, r, sportSlug, sportCode, now }: { item: BoardItem; r: EventResearchDoc | null | undefined; sportSlug: string; sportCode: string; now: number }) {
  const { away, home } = sides(item);
  const venue = venueFor(home?.short_name, (r?.context?.venue as any)?.name ?? null);
  const photo = venuePhoto(venue);
  const [ref, inView] = useInView<HTMLLIElement>();
  const img = useHeldImage(inView ? photo?.card : null);
  const set = r ? gameScripts(r) : null;
  const winners = useMemo(() => (r?.markets ?? []).filter((m) => m.market_family === 'game_winner'), [r]);
  useLiveQuotes(winners.map((m) => m.kalshi_ticker), 'slate');
  const views = useQuoteViews(winners);
  const passed = Date.parse(item.start_time_utc) <= now && item.status === 'SCHEDULED';
  const label = `${away?.short_name ?? '?'} @ ${home?.short_name ?? '?'}`;
  const lead = set ? [...set.scripts].sort((x, y) => y.share - x.share)[0] : null;
  return (
    <li className={`gtile gcard${photo ? '' : ' gtile--nophoto'}`} ref={ref} style={{ ['--focus' as string]: venue?.focus ?? 'center 45%', ['--home' as string]: teamColors(sportCode, home?.short_name)[0] }}>
      <div className="gtile__img" aria-hidden="true">
        {img ? <img src={img} alt="" decoding="async" /> : !photo && <StadiumFallback compact />}
        <span className="gtile__logos"><TeamMark sport={sportCode} abbr={away?.short_name} size="lg" /><i>at</i><TeamMark sport={sportCode} abbr={home?.short_name} size="lg" /></span>
      </div>
      <Link to={routes.game(sportSlug, item.event_id)} className="gtile__link gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
        <span className="gtile__when"><span>{new Date(item.start_time_utc).toLocaleDateString(undefined, { weekday: "short" })} {new Date(item.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><span className={passed ? 'is-passed' : ''}>{passed ? 'Kicked off' : until(item.start_time_utc, now)}</span></span>
        <span className="gtile__t">{splitName(away?.display_name ?? '').nick} <span className="gtile__at">at</span> {splitName(home?.display_name ?? '').nick}</span>
        {r === undefined ? (
          <span className="gtile__model gcard__hook--load">Reading research…</span>
        ) : (
          <span className="gtile__model">{r ? modelLine(r) ?? 'No model view published' : 'No event research published'}</span>
        )}
      </Link>
      {set && lead && <div className="gtile__scripts"><ScriptBar set={set} labels={false} /><span className="gtile__lead"><i className={`sdot sdot--s${lead.index}`} />{lead.name} <b className="num">{sharePct(lead.share)}</b></span></div>}
      <div className="gtile__foot">
        {views.length ? <QuoteSummaryChip views={views} now={now} /> : <QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" />}
        <SaveButton ref_kind="EVENT" sport={sportCode} id={item.event_id} compact label={{ label, sub: kickoff(item.start_time_utc), href: routes.game(sportSlug, item.event_id) }} />
      </div>
    </li>
  );
}

/** One slate line: kickoff, both logos, the model line and the leading script. */
export function SlateRow({ item, r, sportSlug, sportCode }: { item: BoardItem; r: EventResearchDoc | undefined; sportSlug: string; sportCode: string }) {
  const { away, home } = sides(item);
  const set = r ? gameScripts(r) : null;
  const lead = set ? [...set.scripts].sort((x, y) => y.share - x.share)[0] : null;
  return (
    <li>
      <Link to={routes.game(sportSlug, item.event_id)} className="slrow">
        <span className="slrow__t">{new Date(item.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        <span className="slrow__m">
          <TeamMark sport={sportCode} abbr={away?.short_name} size="sm" /><span>{splitName(away?.display_name ?? '').nick}</span>
          <span className="slrow__at">at</span>
          <TeamMark sport={sportCode} abbr={home?.short_name} size="sm" /><span>{splitName(home?.display_name ?? '').nick}</span>
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
        if (!m || p.fair_probability == null || p.market_probability == null || m.period !== 'FULL') continue;
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
