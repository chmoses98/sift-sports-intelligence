// The game hero: the venue's curated photograph (or an elegant floodlit fallback), both teams with
// their logos and records, kickoff, venue and the kickoff-time weather as part of the atmosphere.
// Indoor games say so instead of showing meaningless outdoor conditions.
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { recordOf, weatherIcon } from '../../lib/gamedata';
import { displayName, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { roofState, venueFor, venuePhoto, type Venue } from '../../lib/venues';
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
    <div className={`gh__team gh__team--${side}`}>
      <TeamMark sport={sportCode} abbr={abbr} size="xl" />
      <div className="gh__tn">
        <span className="gh__city"><span className="gh__cityname">{city}</span>{rec && <span className="gh__rec num"><span className="gh__sep"> · </span>{rec.text}<span className="sr-only"> record</span></span>}</span>
        <Link to={routes.team(slug, pid)} className="gh__name">{nick}</Link>
      </div>
      {score != null && <span className={`gh__score num${won ? ' is-win' : ''}`}>{score}</span>}
    </div>
  );
}

/** Kickoff conditions in one quiet line ("67° Mostly Sunny · wind 6 mph", "Indoor"). */
export function weatherLine(wx: GameWeather): string | null {
  if (wx.kind === 'indoor' || wx.kind === 'retractable') return wx.condition;
  if (wx.kind !== 'outdoor') return null;
  return [`${wx.temp}° ${wx.condition ?? ''}`.trim(), wx.wind?.replace(/^Wind/, 'wind'), wx.precip != null && wx.precip >= 30 ? `${wx.precip}% precipitation` : null].filter(Boolean).join(' · ');
}

/**
 * The game hero, simplified: the stadium photograph is the subject. On it only what belongs at the top —
 * the two teams (and the score once final), when, where, and the conditions. Prices, research actions and
 * analysis live below the hero.
 */
export function GameHero({ r, homeProf, awayProf, sportCode, slug, now }: {
  r: EventResearchDoc; homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; sportCode: string; slug: string; now: number;
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
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const week = ev.competition?.replace(/^\d{4}\s*(REG\s*)?/i, '').replace(/^week/i, 'Week');
  const wl = weatherLine(wx);
  return (
    <header className={`gh${photo ? '' : ' gh--nophoto'}`} style={{ ['--home' as string]: hc, ['--away' as string]: ac, ['--focus' as string]: venue?.focus ?? 'center 45%' }}>
      <div className="gh__bg" aria-hidden="true">
        {img && <img src={img} alt="" decoding="async" />}
        {!photo && <StadiumFallback venue={pubVenue?.name ?? venue?.name ?? null} />}
      </div>
      <div className="gh__in">
        <div className="gh__teams">
          <Side side="away" pid={awayP.participant_id} name={awayP.display_name} abbr={awayAbbr} prof={awayProf} sportCode={sportCode} slug={slug} score={final ? res?.away_score : null} won={final && res?.away_score > res?.home_score} />
          <span className="gh__at" aria-hidden="true">{final ? 'final' : 'at'}</span>
          <Side side="home" pid={homeP.participant_id} name={homeP.display_name} abbr={homeAbbr} prof={homeProf} sportCode={sportCode} slug={slug} score={final ? res?.home_score : null} won={final && res?.home_score > res?.away_score} />
        </div>
        <p className="gh__meta">
          {final ? <span className="gh__state gh__state--final">Final</span> : started ? <span className="gh__state gh__state--live">Kicked off · pregame research frozen</span> : null}
          <span>{week ? `${week} · ` : ''}{day} · {time}{!final && !started && <span className="gh__until"> · {until(ev.start_time_utc, now)}</span>}</span>
          {venueName && <span>{venueName}{venue?.city ? `, ${venue.city}` : ''}</span>}
          {wl && <span className={wx.flag ? 'gh__wx gh__wx--flag' : 'gh__wx'}><Icon name={wx.icon} size={15} /> {wl}{wx.flag ? ` · ${wx.flag}` : ''}</span>}
        </p>
      </div>
      {photo && (
        <Link to={`${routes.status()}#photo-credits`} className="gh__credit">
          Photo: {photo.credit.artist.slice(0, 40)} · {photo.credit.license}
        </Link>
      )}
    </header>
  );
}
