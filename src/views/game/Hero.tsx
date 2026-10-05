// The game hero: the real home stadium (or the published neutral site) behind a dark overlay, both
// teams, kickoff, venue and the kickoff-time forecast. Indoor games say so instead of a forecast.
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { QuoteSummaryChip } from '../../components/LiveQuote';
import { SaveButton, TeamMark } from '../../components/ui';
import { recordOf, weatherIcon } from '../../lib/gamedata';
import { displayName, kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { roofState, venueFor, venuePhoto } from '../../lib/venues';
import type { QuoteView } from '../../live/overlay';
import { useHeldImage } from '../../lib/useImage';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function splitName(full: string): { city: string; nick: string } {
  const n = displayName(full);
  const w = n.split(' ');
  return w.length > 1 ? { city: w.slice(0, -1).join(' '), nick: w[w.length - 1] } : { city: '', nick: n };
}

function Side({ side, pid, name, abbr, prof, sportCode, slug, score, won }: { side: 'away' | 'home'; pid: string; name: string; abbr: string; prof?: EntityProfileDoc | null; sportCode: string; slug: string; score?: number | null; won?: boolean }) {
  const { city, nick } = splitName(name);
  const rec = recordOf(prof);
  return (
    <div className={`mh__team mh__team--${side}`}>
      <TeamMark sport={sportCode} abbr={abbr} size="xl" />
      <div className="mh__tn">
        <span className="mh__rec">{rec ? rec.text : ''}{rec && <span className="sr-only"> record</span>}</span>
        <span className="mh__city">{city}</span>
        <Link to={routes.team(slug, pid)} className="mh__name">{nick}</Link>
      </div>
      {score != null && <span className={`mh__score num${won ? ' is-win' : ''}`}>{score}</span>}
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
  const weather = r.context?.weather as any;
  const pubVenue = r.context?.venue as any;
  const venue = venueFor(homeAbbr, pubVenue?.name ?? weather?.stadium ?? null);
  const photo = venuePhoto(venue);
  const img = useHeldImage(photo?.hero);
  const roof = roofState(pubVenue?.roof ?? weather?.roof, venue);
  const indoor = roof === 'indoor' || roof === 'roof-closed';
  const showForecast = !indoor && weather?.available && weather?.temperature_f != null;
  const venueName = pubVenue?.name ?? venue?.name ?? null;
  const [hc] = teamColors(sportCode, homeAbbr);
  const [ac] = teamColors(sportCode, awayAbbr);
  const d = new Date(ev.start_time_utc);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const week = ev.competition?.replace(/^\d{4}\s*(REG\s*)?/i, '').replace(/^week/i, 'Week');
  return (
    <header className={`mh mh--hero${photo ? '' : ' mh--nophoto'}`} style={{ ['--home' as string]: hc, ['--away' as string]: ac }}>
      <div className="mh__bg" aria-hidden="true">
        {img && <img src={img} alt="" decoding="async" />}
      </div>
      <div className="mh__in">
        <div className="mh__eyebrow">
          <span>{sportLabel}</span>
          {week && <><span aria-hidden="true">·</span><span>{week}</span></>}
          {final && <span className="mh__state mh__state--final">Final</span>}
          {started && <span className="mh__state mh__state--live">Kicked off · pregame research frozen</span>}
        </div>
        <div className="mh__teams">
          <Side side="away" pid={awayP.participant_id} name={awayP.display_name} abbr={awayAbbr} prof={awayProf} sportCode={sportCode} slug={slug} score={final ? res?.away_score : null} won={final && res?.away_score > res?.home_score} />
          <div className="mh__mid">
            {final ? <span className="mh__final">Final</span> : <span className="mh__at" aria-hidden="true">@</span>}
            <div className="mh__when">
              <span className="mh__day">{day}</span>
              <span className="mh__time">{time}</span>
              {!final && !started && <span className="mh__until">{until(ev.start_time_utc, now)}</span>}
            </div>
            {venueName && <div className="mh__venue"><Icon name="pin" size={14} /> {venueName}{venue?.city ? <span className="mh__city2"> · {venue.city}</span> : null}</div>}
            <div className="mh__wx">
              {showForecast ? (
                <>
                  <Icon name={weatherIcon(weather.short_forecast)} size={30} className="mh__wxic" />
                  <span className="mh__temp num">{weather.temperature_f}°</span>
                  <span className="mh__wxd">
                    <span>{weather.short_forecast}</span>
                    <span>{[weather.wind ? `Wind ${weather.wind}${weather.wind_direction ? ` ${weather.wind_direction}` : ''}` : null, weather.precipitation_probability != null ? `${weather.precipitation_probability}% precip` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </>
              ) : indoor ? (
                <>
                  <Icon name="dome" size={26} className="mh__wxic" />
                  <span className="mh__wxd"><span>{roof === 'roof-closed' ? 'Roof closed' : 'Indoor'}</span><span>No weather exposure</span></span>
                </>
              ) : roof === 'retractable' ? (
                <span className="mh__wxd"><span>Retractable roof</span><span>Roof status not published yet</span></span>
              ) : (
                <span className="mh__wxd"><span>Forecast not published yet</span></span>
              )}
            </div>
          </div>
          <Side side="home" pid={homeP.participant_id} name={homeP.display_name} abbr={homeAbbr} prof={homeProf} sportCode={sportCode} slug={slug} score={final ? res?.home_score : null} won={final && res?.home_score > res?.away_score} />
        </div>
        <div className="mh__bar">
          <div className="mh__chips">
            <QuoteSummaryChip views={views} now={now} />
          </div>
          <span className="mh__kick sr-only">Kickoff {kickoff(ev.start_time_utc)}</span>
          <div className="mh__actions">
            <SaveButton ref_kind="EVENT" sport={sportCode} id={ev.event_id} className="savebtn--glass" text="Add to research" label={{ label, sub: kickoff(ev.start_time_utc), href: routes.game(slug, ev.event_id) }} />
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
