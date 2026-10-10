// The game hero: the home team's identity first — a verified photograph of ITS home game at ITS venue, or its
// designed branded hero (src/lib/hero: the one decision; src/components/HeroArt: the one look) — then both teams with
// their logos and records, kickoff, venue and the kickoff-time weather. Neutral sites and unconfirmed home sides
// say so and show both teams; indoor games say so instead of showing meaningless outdoor conditions.
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { recordOf, weatherIcon } from '../../lib/gamedata';
import { displayName, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { mlbClub } from '../../lib/mlb';
import { nhlTeam } from '../../lib/nhlTeams';
import { cfbName } from '../../lib/cfbTeams';
import { useMemo, type ReactNode } from 'react';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFromResearch } from '../../lib/hero/input';
import type { HeroSpec, HeroVenue } from '../../lib/hero/types';
import { HeroArt, heroVars } from '../../components/HeroArt';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function splitName(full: string, abbr?: string | null, sport?: string): { city: string; nick: string } {
  // College names are not "City Nickname": "Iowa State" is one name, and its last word ("State") names nobody.
  if (sport === 'CFB') return { city: '', nick: cfbName(abbr, full) };
  const n = displayName(full);
  // Baseball nicknames can be two words ("White Sox", "Red Sox", "Blue Jays"): the club table knows them.
  // Hockey nicknames can be two words too ("Golden Knights", "Maple Leafs", "Red Wings"): the NHL identity table knows them.
  const nhl = sport === 'NHL' ? nhlTeam(abbr) : null;
  if (nhl && n.endsWith(nhl.name)) return { city: n.slice(0, -nhl.name.length).trim(), nick: nhl.name };
  const club = sport === 'MLB' ? mlbClub(abbr) : null;
  if (club && n.endsWith(club.nick)) return { city: n.slice(0, -club.nick.length).trim(), nick: club.nick };
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

/**
 * The roof the game is actually played under, from the publication's own capture when it has one
 * ('dome' / 'closed' / 'open' / 'outdoors'), else the venue's construction.
 */
export function roofState(published: string | null | undefined, v: Pick<HeroVenue, 'roof'> | null): 'outdoors' | 'indoor' | 'roof-open' | 'roof-closed' | 'retractable' | 'unknown' {
  const p = (published ?? '').toLowerCase();
  if (p === 'dome') return 'indoor';
  if (p === 'closed') return 'roof-closed';
  if (p === 'open') return 'roof-open';
  if (p === 'outdoors' || p === 'outdoor') return 'outdoors';
  if (v?.roof === 'dome') return 'indoor';
  if (v?.roof === 'retractable') return 'retractable';
  if (v?.roof === 'outdoor') return 'outdoors';
  return 'unknown';
}

/** The kickoff-time conditions the publication captured, read honestly for the roof the game is under. */
export function gameWeather(r: EventResearchDoc, venue: Pick<HeroVenue, 'roof'> | null): GameWeather {
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
      {!compact && <span className="wx__note" title="Audited 2026-10-10: the NFL, CFB and soccer publications capture the forecast for context; it does not enter their simulations or probabilities.">Context only · not in the projection</span>}
    </div>
  );
}

function Side({ side, pid, name, abbr, prof, sportCode, slug, score, won }: { side: 'away' | 'home'; pid: string; name: string; abbr: string; prof?: EntityProfileDoc | null; sportCode: string; slug: string; score?: number | null; won?: boolean }) {
  // Broadcast identity (approved reference 02): the club's city small, its code huge in the condensed face, the
  // record under it, the logo toward the centre. College names are not "City Nickname" ("Iowa St.", "Florida
  // International") and CFB never shows contract codes: CFB's huge line is the school's canonical name.
  const { city, nick } = splitName(name, abbr, sportCode);
  const rec = recordOf(prof);
  const college = sportCode === 'CFB';
  return (
    <div className={`gh__team gh__team--${side}`}>
      <TeamMark sport={sportCode} abbr={abbr} size="xl" />
      <div className="gh__tn">
        {!college && <span className="gh__city"><span className="gh__cityname">{city || nick}</span></span>}
        <Link to={routes.team(slug, pid)} className={`gh__name${college ? ' gh__name--school' : ''}${college && nick.length > 9 ? ' gh__name--long' : ''}`}>
          {college ? nick : abbr}{!college && <span className="sr-only"> {name}</span>}
        </Link>
        {rec && <span className="gh__rec num">{rec.text}<span className="sr-only"> record</span></span>}
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

/** What the hero says once a game has begun, in the sport's own words. */
export function startedWords(sportCode: string): string {
  if (sportCode === 'NHL') return 'Puck dropped';
  if (sportCode === 'MLB') return 'In progress';
  return 'Kicked off';
}

/**
 * The broadcast game hero (approved reference 02): the home venue's licensed photograph as a darkened, directionally
 * lit backdrop; both teams left and right; the matchup line (week, kickoff, venue) in the centre; then, when the page
 * passes one, the sourced numbers strip (`stats`, views/game/HeroStats.tsx). The hero never computes a number itself:
 * prices, projections and probabilities arrive through `stats`, and only where a publication carries them.
 */
export function GameHero({ r, homeProf, awayProf, sportCode, slug, now, finalScore, stats }: {
  r: EventResearchDoc; homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; sportCode: string; slug: string; now: number;
  /** A sport's own final score when it is not published as extensions.result (NHL: the publisher's postmortem). */
  finalScore?: { home: number; away: number } | null;
  /** The sourced stat strip under the matchup; without one the hero carries the conditions line instead. */
  stats?: ReactNode;
}) {
  const ev = r.event;
  const homeP = r.participants.find((p) => p.home_away === 'HOME')!;
  const awayP = r.participants.find((p) => p.home_away === 'AWAY')!;
  const short = (pid: string) => ev.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const ext = r.extensions as any;
  const res = finalScore ? { home_score: finalScore.home, away_score: finalScore.away } : ext?.result;
  const final = ev.status === 'FINAL';
  const started = !final && Date.parse(ev.start_time_utc) <= now;
  const spec = useMemo(() => resolveHero(heroInputFromResearch(r, sportCode)), [r, sportCode]);
  const venue = spec.venue;
  const wx = gameWeather(r, venue);
  const venueName = venue?.name ?? null;
  const [hc, hc2] = teamColors(sportCode, homeAbbr);
  const [ac, ac2] = teamColors(sportCode, awayAbbr);
  const d = new Date(ev.start_time_utc);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const week = sportCode === 'NHL'
    ? ({ regular: 'Regular season', playoffs: 'Playoffs', preseason: 'Preseason' } as Record<string, string>)[ev.competition ?? ''] ?? ev.competition
    : sportCode === 'MLB'
      ? ev.competition?.replace(/^MLB\s+\d{4}\s*/i, '').replace(/^\w/, (c) => c.toUpperCase()) ?? null
      : ev.competition?.replace(/^\d{4}\s*(REG\s*)?/i, '').replace(/^week/i, 'Week');
  const wl = weatherLine(wx);
  return (
    <header className={`gh gh--bc gh--${spec.kind} gh--ctx-${spec.context}${stats ? ' gh--stats' : ''}`} style={{ ...heroVars(spec), ['--home' as string]: hc, ['--away' as string]: ac, ['--fx-home' as string]: brighter(hc, hc2), ['--fx-away' as string]: brighter(ac, ac2) }} {...heroData(spec)}>
      <div className="gh__bg" aria-hidden="true"><HeroArt spec={spec} /><span className="gh__light" /></div>
      <HeroIdentity spec={spec} sportCode={sportCode} />
      <div className="gh__in">
        <h1 className="sr-only">{awayP.display_name} {atWord(spec)} {homeP.display_name}</h1>
        <p className="gh__meta">
          <span className="gh__lg">{sportCode}{week ? ` · ${week}` : ''}</span>
          {final ? <span className="gh__state gh__state--final">Final</span> : started ? <span className="gh__state gh__state--live">{startedWords(sportCode)} · pregame research frozen</span> : null}
          <span className="gh__when">{day} · {sportCode === 'MLB' && !final && !started ? 'First pitch ' : ''}{time}{!final && !started && <span className="gh__until"> · {until(ev.start_time_utc, now)}</span>}</span>
          {venueName && <span className="gh__venue">{venueName}{venue?.city ? ` · ${venue.city}` : ''}</span>}
          {!stats && wl && <span className={wx.flag ? 'gh__wx gh__wx--flag' : 'gh__wx'}><Icon name={wx.icon} size={15} /> {wl}{wx.flag ? ` · ${wx.flag}` : ''}</span>}
        </p>
        <div className="gh__teams">
          <Side side="away" pid={awayP.participant_id} name={awayP.display_name} abbr={awayAbbr} prof={awayProf} sportCode={sportCode} slug={slug} score={final ? res?.away_score : null} won={final && res?.away_score > res?.home_score} />
          <span className="gh__at" aria-hidden="true">{final ? 'final' : atWord(spec)}</span>
          <Side side="home" pid={homeP.participant_id} name={homeP.display_name} abbr={homeAbbr} prof={homeProf} sportCode={sportCode} slug={slug} score={final ? res?.home_score : null} won={final && res?.home_score > res?.away_score} />
        </div>
      </div>
      {stats && <div className="gh__stats">{stats}</div>}
      {spec.photo && (
        <Link to={`${routes.status()}#photo-credits`} className="gh__credit">
          Photo: {spec.photo.credit.artist.slice(0, 40)} · {spec.photo.credit.license}
        </Link>
      )}
    </header>
  );
}

/** Of a club's two colours, the one that reads as light on the dark hero (rings and lit accents use it). */
export function brighter(a: string, b: string | undefined): string {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  return b && lum(b) > lum(a) ? b : a;
}

/** "at" only when a home side is stated and it is not a neutral site; "vs" otherwise. */
export function atWord(spec: HeroSpec): string {
  return spec.context === 'neutral' || spec.context === 'matchup' ? 'vs' : 'at';
}

/** Inert attributes that say what the hero decided (for tests, the production check and the audit). */
export function heroData(spec: HeroSpec): Record<string, string> {
  return {
    'data-hero-kind': spec.kind,
    'data-hero-context': spec.context,
    'data-hero-team': spec.context === 'neutral' || spec.context === 'matchup' ? '' : spec.home?.code ?? '',
    'data-hero-venue': spec.venue?.id ?? '',
    'data-hero-photo': spec.photo?.id ?? '',
    'data-hero-reason': spec.reason,
  };
}

/** The identity line: who is at home ("Saints home game") or why nobody is ("Neutral site"). */
export function HeroIdentity({ spec, sportCode }: { spec: HeroSpec; sportCode: string }) {
  if (!spec.label) return null;
  const showMark = (spec.context === 'home' || spec.context === 'home-elsewhere') && spec.home;
  return (
    <span className={`gh__id${showMark ? '' : ' gh__id--plain'}`} data-hero-label="">
      {showMark ? <TeamMark sport={sportCode} abbr={spec.home!.code} size="sm" /> : <i aria-hidden="true" />}
      <span>{spec.label}</span>
    </span>
  );
}
