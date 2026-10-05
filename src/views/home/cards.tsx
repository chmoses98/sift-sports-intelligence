// Game cards shared by the global Home and a sport's home: the featured game (stadium photo, model
// read, script outlook) and compact game tiles. Everything shown comes from the board and the game's
// own event research; nothing is ranked as a pick.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { publicationView, QuoteChip, QuoteSummaryChip, useQuoteViews } from '../../components/LiveQuote';
import { SaveButton, TeamMark } from '../../components/ui';
import { modelRead } from '../../lib/gamedata';
import { displayName, kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct, type ScriptSet } from '../../lib/scripts';
import { venueFor, venuePhoto } from '../../lib/venues';
import { useLiveQuotes } from '../../live/hooks';
import { splitName } from '../game/Hero';
import { useHeldImage, useInView } from '../../lib/useImage';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function sides(item: BoardItem) {
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  return { away, home };
}

/** The four scripts as one proportional bar with a legend of shares (labels carry identity). */
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

function modelLine(r: EventResearchDoc | null | undefined): string | null {
  const mv = (r?.extensions as any)?.model_view;
  if (!mv || mv.model_spread == null) return null;
  const home = r!.participants.find((p) => p.home_away === 'HOME');
  const away = r!.participants.find((p) => p.home_away === 'AWAY');
  const short = (pid?: string) => r!.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const favHome = Number(mv.model_spread) <= 0;
  const fav = short((favHome ? home : away)?.participant_id);
  const pts = Math.round(Math.abs(Number(mv.model_spread)) * 2) / 2;
  const wp = mv.model_win_probability?.[fav];
  return `Model: ${fav} −${pts}${wp != null ? ` · ${Math.round(wp * 100)}% to win` : ''}${mv.model_total != null ? ` · total ${Math.round(mv.model_total * 2) / 2}` : ''}`;
}

/** The marquee card: a real stadium, the matchup, the model's read and the script outlook. */
export function FeaturedGame({ item, r, sportSlug, sportCode, now, eyebrow }: { item: BoardItem; r: EventResearchDoc | null | undefined; sportSlug: string; sportCode: string; now: number; eyebrow: string }) {
  const { away, home } = sides(item);
  const venue = venueFor(home?.short_name, (r?.context?.venue as any)?.name ?? null);
  const photo = venuePhoto(venue);
  const img = useHeldImage(photo?.hero);
  const set = r ? gameScripts(r) : null;
  const read = r && home && away ? modelRead(r, splitName(home.display_name ?? '').nick, splitName(away.display_name ?? '').nick, null, null) : null;
  return (
    <article className="feat">
      {img && <img className="feat__img" src={img} alt="" decoding="async" />}
      <div className="feat__in">
        <div className="feat__top">
          <span className="eyebrow">{eyebrow}</span>
          <span className="feat__when">{kickoff(item.start_time_utc)}{Date.parse(item.start_time_utc) > now ? ` · ${until(item.start_time_utc, now)}` : ''}</span>
        </div>
        <Link to={routes.game(sportSlug, item.event_id)} className="feat__match gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
          <span className="feat__team"><TeamMark sport={sportCode} abbr={away?.short_name} size="lg" /><span><small>{splitName(away?.display_name ?? '').city}</small>{splitName(away?.display_name ?? '').nick}</span></span>
          <span className="feat__at" aria-hidden="true">@</span>
          <span className="feat__team feat__team--home"><span><small>{splitName(home?.display_name ?? '').city}</small>{splitName(home?.display_name ?? '').nick}</span><TeamMark sport={sportCode} abbr={home?.short_name} size="lg" /></span>
        </Link>
        {venue && <div className="feat__venue"><Icon name="pin" size={14} /> {venue.name} · {venue.city}</div>}
        {read && <p className="feat__read">{read}</p>}
        {set && <ScriptBar set={set} />}
        <div className="feat__cta">
          <Link to={routes.game(sportSlug, item.event_id)} className="btn btn--primary btn--sm">Open game <Icon name="arrowRight" size={15} /></Link>
          <Link to={routes.game(sportSlug, item.event_id, { tab: 'script' })} className="btn btn--glass btn--sm">Game scripts</Link>
        </div>
      </div>
    </article>
  );
}

/** A compact game tile: stadium strip, teams, kickoff, the model line and the script bar. */
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
  return (
    <li className="gtile gcard" ref={ref}>
      <div className="gtile__img" aria-hidden="true">{img && <img src={img} alt="" decoding="async" />}</div>
      <Link to={routes.game(sportSlug, item.event_id)} className="gtile__link gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
        <span className="gtile__when"><span>{new Date(item.start_time_utc).toLocaleDateString(undefined, { weekday: 'short' })} {new Date(item.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><span className={passed ? 'is-passed' : ''}>{passed ? 'kicked off' : until(item.start_time_utc, now)}</span></span>
        <span className="gtile__t"><TeamMark sport={sportCode} abbr={away?.short_name} size="md" /><span className="gtile__n">{displayName(away?.display_name)}</span></span>
        <span className="gtile__t"><TeamMark sport={sportCode} abbr={home?.short_name} size="md" /><span className="gtile__n">{displayName(home?.display_name)}</span></span>
        {r === undefined ? (
          <span className="gtile__model gcard__hook--load">Reading research…</span>
        ) : (
          <span className="gtile__model">{r ? modelLine(r) ?? 'No model view published' : 'No event research published'}</span>
        )}
      </Link>
      {set && <div className="gtile__scripts"><ScriptBar set={set} labels={false} /><span className="gtile__lead">{[...set.scripts].sort((a, b) => b.share - a.share)[0].name} {sharePct([...set.scripts].sort((a, b) => b.share - a.share)[0].share)}</span></div>}
      <div className="gtile__foot">
        {views.length ? <QuoteSummaryChip views={views} now={now} /> : <QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" />}
        <SaveButton ref_kind="EVENT" sport={sportCode} id={item.event_id} compact label={{ label, sub: kickoff(item.start_time_utc), href: routes.game(sportSlug, item.event_id) }} />
      </div>
    </li>
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
