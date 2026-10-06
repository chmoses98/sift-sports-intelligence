// The game hero: the venue's curated photograph (or an elegant floodlit fallback), both teams with
// their logos and records, kickoff, venue and the kickoff-time weather as part of the atmosphere.
// Indoor games say so instead of showing meaningless outdoor conditions.
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { QuoteSummaryChip } from '../../components/LiveQuote';
import { SaveButton, TeamMark } from '../../components/ui';
import { recordOf, weatherIcon } from '../../lib/gamedata';
import { displayName, kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { roofState, venueFor, venuePhoto, type Venue } from '../../lib/venues';
import type { QuoteView } from '../../live/overlay';
import { useHeldImage } from '../../lib/useImage';
import { StadiumFallback } from '../../components/StadiumFallback';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function splitName(full: string): { city: string; nick: string } {
  const n = displayName(full);
  const w = n.split(' ');
  return w.length > 1 ? { city: w.slice(0, -1).join(' '), nick: w[w.length - 1] } : { city: '', nick: n };
}

export interface GameWeather {
  kind: 'outdoor' | 'indoor' | 'retractable' | 'none';
  icon: string;
  temp: number | null;
  condition: string | null;
  wind: string | null;
  precip: number | null;
  /** A condition that plausibly matters for the game (shown with more weight, never as a pick). */
  flag: string | null;
}

/** The kickoff-time conditions the publication captured, read honestly for the roof the game is under. */
export function gameWeather(r: EventResearchDoc, venue: Venue | null): GameWeather {
  const w = r.context?.weather as any;
  const pubVenue = r.context?.venue as any;
  const roof = roofState(pubVenue?.roof ?? w?.roof, venue);
  if (roof === 'indoor' || roof === 'roof-closed') return { kind: 'indoor', icon: 'dome', temp: null, condition: roof === 'roof-closed' ? 'Roof closed' : 'Indoor', wind: null, precip: null, flag: null };
  if (!w?.available || w.temperature_f == null) return { kind: roof === 'retractable' ? 'retractable' : 'none', icon: roof === 'retractable' ? 'dome' : 'partly', temp: null, condition: roof === 'retractable' ? 'Retractable roof' : null, wind: null, precip: null, flag: null };
  const mph = Math.max(0, ...String(w.wind ?? '').replace(/to/g, ' ').split(/\s+/).map(Number).filter((x) => Number.isFinite(x)));
  const precip = w.precipitation_probability ?? null;
  const t = Number(w.temperature_f);
  const flag = mph >= 15 ? `Wind ${mph} mph` : precip != null && precip >= 50 ? (/snow/i.test(w.short_forecast ?? '') ? 'Snow likely' : 'Rain likely') : t <= 32 ? 'Freezing' : t >= 90 ? 'Heat' : null;
  return { kind: 'outdoor', icon: weatherIcon(w.short_forecast), temp: t, condition: w.short_forecast ?? null, wind: w.wind ? `Wind ${w.wind}${w.wind_direction ? ` ${w.wind_direction}` : ''}` : null, precip, flag };
}

export function WeatherBlock({ wx, compact }: { wx: GameWeather; compact?: boolean }) {
  if (wx.kind === 'none') return <div className="wx wx--none"><span className="wx__d"><span className="wx__c">Forecast not published yet</span></span></div>;
  if (wx.kind !== 'outdoor') {
    return (
      <div className={`wx wx--indoor${compact ? ' wx--compact' : ''}`}>
        <Icon name="dome" size={compact ? 26 : 34} className="wx__ic" />
        <span className="wx__d"><span className="wx__c">{wx.condition}</span><span className="wx__s">{wx.kind === 'retractable' ? 'Roof status not published yet' : 'No weather exposure'}</span></span>
      </div>
    );
  }
  return (
    <div className={`wx${wx.flag ? ' wx--flag' : ''}${compact ? ' wx--compact' : ''}`} aria-label={`Kickoff forecast: ${wx.temp} degrees, ${wx.condition ?? ''}${wx.wind ? `, ${wx.wind}` : ''}${wx.precip != null ? `, ${wx.precip}% chance of precipitation` : ''}`} role="group">
      <Icon name={wx.icon} size={compact ? 30 : 40} className="wx__ic" />
      <span className="wx__t">{wx.temp}°</span>
      <span className="wx__d">
        <span className="wx__c">{wx.condition}</span>
        {wx.wind && <span className="wx__s">{wx.wind}</span>}
        {wx.precip != null && wx.precip >= 20 && <span className="wx__s">{wx.precip}% precipitation</span>}
      </span>
      {wx.flag && <span className="wx__flag">{wx.flag}</span>}
    </div>
  );
}

function Side({ side, pid, name, abbr, prof, sportCode, slug, score, won }: { side: 'away' | 'home'; pid: string; name: string; abbr: string; prof?: EntityProfileDoc | null; sportCode: string; slug: string; score?: number | null; won?: boolean }) {
  const { city, nick } = splitName(name);
  const rec = recordOf(prof);
  return (
    <div className={`mh__team mh__team--${side}`}>
      <TeamMark sport={sportCode} abbr={abbr} size="xl" />
      <div className="mh__tn">
        <span className="mh__rec num">{rec ? rec.text : ''}{rec && <span className="sr-only"> record</span>}</span>
        <span className="mh__city">{city}</span>
        <Link to={routes.team(slug, pid)} className="mh__name">{nick}</Link>
      </div>
      {score != null && <span className={`mh__score${won ? ' is-win' : ''}`}>{score}</span>}
    </div>
  );
}

export function GameHero({ r, homeProf, awayProf, sportCode, slug, sportLabel, views, now, label }: {
  r: EventResearchDoc; homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; sportCode: string; slug: string; sportLabel: string;
  views: QuoteView[]; now: number; label: string;
}) {
  const ev = r.event;
  const homeP = r.participants.find((p) => p.home_away === 'HOME')!;
  const awayP = r.participants.find((p) => p.home_away === 'AWAY')!;
  const short = (pid: string) => ev.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const ext = r.extensions as any;
  const res = ext?.result;
  const final = ev.status === 'FINAL';
  const started = !final && Date.parse(ev.start_time_utc) <= now;
  const pubVenue = r.context?.venue as any;
  const venue = venueFor(homeAbbr, pubVenue?.name ?? (r.context?.weather as any)?.stadium ?? null);
  const photo = venuePhoto(venue);
  const img = useHeldImage(photo?.hero);
  const wx = gameWeather(r, venue);
  const venueName = pubVenue?.name ?? venue?.name ?? null;
  const [hc] = teamColors(sportCode, homeAbbr);
  const [ac] = teamColors(sportCode, awayAbbr);
  const d = new Date(ev.start_time_utc);
  const day = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const week = ev.competition?.replace(/^\d{4}\s*(REG\s*)?/i, '').replace(/^week/i, 'Week');
  return (
    <header className={`mh mh--hero${photo ? '' : ' mh--nophoto'}`} style={{ ['--home' as string]: hc, ['--away' as string]: ac, ['--focus' as string]: venue?.focus ?? 'center 45%' }}>
      <div className="mh__bg" aria-hidden="true">
        {img && <img src={img} alt="" decoding="async" />}
        {!photo && <StadiumFallback venue={pubVenue?.name ?? venue?.name ?? null} />}
      </div>
      <div className="mh__in">
        <div className="mh__eyebrow">
          <span>{sportLabel}</span>
          {week && <><span aria-hidden="true" className="mh__dot" /><span>{week}</span></>}
          {final && <span className="mh__state mh__state--final">Final</span>}
          {started && <span className="mh__state mh__state--live">Kicked off · pregame research frozen</span>}
        </div>
        <div className="mh__teams">
          <Side side="away" pid={awayP.participant_id} name={awayP.display_name} abbr={awayAbbr} prof={awayProf} sportCode={sportCode} slug={slug} score={final ? res?.away_score : null} won={final && res?.away_score > res?.home_score} />
          <div className="mh__mid">
            {final ? <span className="mh__final">Final</span> : <span className="mh__at" aria-hidden="true">at</span>}
            <div className="mh__when">
              <span className="mh__day">{day}</span>
              <span className="mh__time">{time}{!final && !started && <span className="mh__until"> · {until(ev.start_time_utc, now)}</span>}</span>
            </div>
            {venueName && <div className="mh__venue">{venueName}{venue?.city ? <span className="mh__city2"> · {venue.city}</span> : null}</div>}
            <WeatherBlock wx={wx} />
          </div>
          <Side side="home" pid={homeP.participant_id} name={homeP.display_name} abbr={homeAbbr} prof={homeProf} sportCode={sportCode} slug={slug} score={final ? res?.home_score : null} won={final && res?.home_score > res?.away_score} />
        </div>
        <div className="mh__bar">
          <div className="mh__chips">
            <QuoteSummaryChip views={views} now={now} />
          </div>
          <span className="mh__kick sr-only">Kickoff {kickoff(ev.start_time_utc)}</span>
          <div className="mh__actions">
            <SaveButton ref_kind="EVENT" sport={sportCode} id={ev.event_id} className="savebtn--glass" text="Add to research" kickoff={ev.start_time_utc} eventStatus={ev.status} label={{ label, sub: kickoff(ev.start_time_utc), href: routes.game(slug, ev.event_id) }} />
            <Link to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })} className="btn btn--primary btn--sm">
              <Icon name="copy" size={15} /> Copy for ChatGPT
            </Link>
          </div>
        </div>
      </div>
      {photo && (
        <Link to={`${routes.status()}#photo-credits`} className="mh__credit">
          Photo: {photo.credit.artist.slice(0, 40)} · {photo.credit.license}
        </Link>
      )}
    </header>
  );
}
