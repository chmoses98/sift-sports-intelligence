// The hero gallery (#/design/heroes?sport=NFL): every home team's game hero for a sport, drawn by the same resolver
// and art as the game pages, plus the edge cases (neutral site, international, unconfirmed home side, shared venues,
// a past season). It is how a person reviews the whole set at once — and how the review sheets are rendered.
// Illustrative matchups, not sports data: each team is shown hosting the next team in the list.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import names from '../../scripts/heroes/team-names.json';
import cfbData from '../lib/cfb-teams.json';
import cbbData from '../lib/cbb-teams.json';
import { HeroArt, heroVars } from '../components/HeroArt';
import { TeamMark } from '../components/ui';
import { resolveHero } from '../lib/hero/resolve';
import { heroTeam } from '../lib/hero/input';
import { VENUES } from '../lib/hero/registry';
import type { HeroInput, HeroSpec, HeroTeam } from '../lib/hero/types';
import { atWord, heroData, HeroIdentity } from './game/Hero';
import { useVisit } from '../state/trail';

const NAMES = names as unknown as Record<string, Record<string, string>>;
const SPORTS = ['NFL', 'MLB', 'NHL', 'CFB', 'CBB'] as const;
type GallerySport = (typeof SPORTS)[number];

type Cbb = { e: number | null; a: string | null; n: string; f: string; c?: string | null; c2?: string | null; l?: number };
const CBB = Object.values((cbbData as { teams: Record<string, Cbb> }).teams).filter((t) => t.a).sort((a, b) => a.n.localeCompare(b.n));
const CFB = (cfbData as unknown as { teams: Record<string, { n: string }> }).teams;
const BASE = import.meta.env.BASE_URL;

function cbbTeam(t: Cbb): HeroTeam {
  const ok = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const c1 = ok(t.c) ?? '#1d2d52';
  return { sport: 'CBB', code: t.a!, name: t.f, short: t.n, colors: [c1, ok(t.c2) ?? c1], logo: t.l && t.e != null ? `${BASE}teams/cbb/${t.e}.webp` : null };
}

function teamsOf(sport: GallerySport): HeroTeam[] {
  if (sport === 'CBB') return CBB.map(cbbTeam);
  if (sport === 'CFB') {
    const codes = [...new Set(VENUES.flatMap((v) => v.tenants.filter((t) => t.sport === 'CFB' && (!t.to || t.to > '2026-10-01')).map((t) => t.team)))].sort();
    return codes.map((c) => heroTeam('CFB', c, CFB[c]?.n ?? c)!);
  }
  return Object.entries(NAMES[sport]).map(([c, n]) => heroTeam(sport, c, n)!);
}

const DATE = '2026-10-15T23:00:00Z';

/** The edge cases every sport must get right, as real inputs. */
function scenarios(): { title: string; input: HeroInput }[] {
  const t = (s: string, c: string) => heroTeam(s, c, NAMES[s]?.[c] ?? CFB[c]?.n ?? c)!;
  return [
    { title: 'Saints at the Superdome (the regression)', input: { sport: 'NFL', date: DATE, home: t('NFL', 'NO'), away: t('NFL', 'ATL'), homeVerified: true, venueName: 'Caesars Superdome', neutral: false } },
    { title: 'Shared stadium: Jets at MetLife', input: { sport: 'NFL', date: DATE, home: t('NFL', 'NYJ'), away: t('NFL', 'GB'), homeVerified: true, venueName: 'MetLife Stadium', neutral: false } },
    { title: 'Shared stadium: Giants at MetLife', input: { sport: 'NFL', date: DATE, home: t('NFL', 'NYG'), away: t('NFL', 'DAL'), homeVerified: true, venueName: 'MetLife Stadium', neutral: false } },
    { title: 'International: Colts vs Commanders, London', input: { sport: 'NFL', date: DATE, home: t('NFL', 'WAS'), away: t('NFL', 'IND'), homeVerified: true, venueName: 'Tottenham Hotspur Stadium', neutral: true } },
    { title: 'Shared arena: Bruins at TD Garden (never the Celtics)', input: { sport: 'NHL', date: DATE, home: t('NHL', 'BOS'), away: t('NHL', 'MTL'), homeVerified: true, venueName: 'TD Garden', neutral: false } },
    { title: 'Shared stadium: Miami Hurricanes at Hard Rock (never the Dolphins)', input: { sport: 'CFB', date: DATE, home: t('CFB', 'MIA'), away: t('CFB', 'FSU'), homeVerified: true, venueName: null, neutral: null } },
    { title: 'Standing neutral site: Red River, no venue published', input: { sport: 'CFB', date: '2026-10-10T16:30:00Z', home: t('CFB', 'OKLA'), away: t('CFB', 'TEX'), homeVerified: true, venueName: null, neutral: null } },
    { title: 'Home side not stated (display-order convention)', input: { sport: 'CFB', date: DATE, home: t('CFB', 'DEL'), away: t('CFB', 'MOSU'), homeVerified: false, venueName: null, neutral: null } },
    { title: 'MLB international: Tokyo Dome', input: { sport: 'MLB', date: '2026-03-18T10:00:00Z', home: t('MLB', 'LAD'), away: t('MLB', 'CHC'), homeVerified: true, venueName: 'Tokyo Dome', neutral: null } },
    { title: 'Past season: Bills 2023 (the 1973 Highmark Stadium)', input: { sport: 'NFL', date: '2023-10-01T17:00:00Z', home: t('NFL', 'BUF'), away: t('NFL', 'MIA'), homeVerified: true, venueName: null, neutral: null } },
    { title: 'Postseason, no venue published', input: { sport: 'CFB', date: '2026-12-31T20:00:00Z', home: t('CFB', 'OSU'), away: t('CFB', 'UGA'), homeVerified: true, venueName: null, neutral: null, postseason: true } },
  ];
}

function GalleryHero({ spec, sport }: { spec: HeroSpec; sport: string }) {
  const side = (team: HeroTeam | null, which: 'away' | 'home') => (
    <div className={`gh__team gh__team--${which}`}>
      {sport === 'CBB' ? (team?.logo ? <img className="teammark teammark--logo teammark--xl" src={team.logo} alt="" /> : <span className="teammark teammark--text teammark--xl">{team?.code}</span>) : <TeamMark sport={sport} abbr={team?.code} size="xl" />}
      <div className="gh__tn"><span className="gh__city"><span className="gh__cityname">{team && team.name !== team.short ? team.name.replace(team.short, '').trim() : ''}</span></span><span className={`gh__name${(sport === 'CFB' || sport === 'CBB') && (team?.short.length ?? 0) > 9 ? ' gh__name--long' : ''}`}>{team?.short}</span></div>
    </div>
  );
  return (
    <header className={`gh gh--${spec.kind} gh--ctx-${spec.context}`} style={heroVars(spec)} {...heroData(spec)}>
      <div className="gh__bg" aria-hidden="true"><HeroArt spec={spec} /></div>
      {sport === 'CBB' ? (
        <span className="gh__id" data-hero-label="">{spec.home?.logo ? <img className="teammark teammark--logo teammark--sm" src={spec.home.logo} alt="" /> : <i aria-hidden="true" />}<span>{spec.label}</span></span>
      ) : <HeroIdentity spec={spec} sportCode={sport} />}
      <div className="gh__in">
        <div className="gh__teams">{side(spec.away, 'away')}<span className="gh__at" aria-hidden="true">{atWord(spec)}</span>{side(spec.home, 'home')}</div>
        <p className="gh__meta">{spec.venue && <span className="gh__venue">{spec.venue.name}{spec.venue.city ? `, ${spec.venue.city}` : ''}</span>}<span className="muted">{spec.reason}</span></p>
      </div>
      {spec.photo && <span className="gh__credit">Photo: {spec.photo.credit.artist.slice(0, 40)} · {spec.photo.credit.license}</span>}
    </header>
  );
}

export function HeroGalleryView() {
  useVisit('Hero gallery', 'status');
  const [q] = useSearchParams();
  const sport = (SPORTS as readonly string[]).includes(q.get('sport') ?? '') ? (q.get('sport') as GallerySport) : null;
  const only = q.get('only'); // "photo" | "branded"
  const items = useMemo(() => {
    if (!sport) return scenarios().map((s) => ({ key: s.title, title: s.title, sport: s.input.sport, spec: resolveHero(s.input) }));
    const teams = teamsOf(sport);
    return teams.map((home, i) => {
      const away = teams[(i + 1) % teams.length];
      const spec = resolveHero({ sport, date: DATE, home, away, homeVerified: true, venueName: null, neutral: sport === 'CBB' ? false : null });
      return { key: home.code, title: `${home.code} · ${home.name}`, sport: sport as string, spec };
    }).filter((x) => !only || x.spec.kind === only);
  }, [sport, only]);
  const photos = items.filter((x) => x.spec.kind === 'photo').length;
  return (
    <div className="page heroes-gallery">
      <header className="pagehead">
        <div className="eyebrow">Design system · game heroes</div>
        <h1 className="h-display">{sport ? `${sport} heroes` : 'Hero edge cases'}</h1>
        <p className="lede">{sport ? `${items.length} home teams · ${photos} verified home photographs · ${items.length - photos} branded identity heroes.` : 'Shared venues, neutral and international sites, unconfirmed home sides, past seasons and postseason, through the same resolver as the game pages.'} Illustrative matchups, not sports data.</p>
        <nav className="hg__nav">{[null, ...SPORTS].map((s) => <Link key={s ?? 'cases'} to={s ? `/design/heroes?sport=${s}` : '/design/heroes'} className={`chip${s === sport ? ' is-on' : ''}`}>{s ?? 'Edge cases'}</Link>)}</nav>
      </header>
      <ol className="hg__list">
        {items.map((x) => (
          <li key={x.key} className="hg__item" data-gallery-team={x.key}>
            <div className="hg__cap"><b>{x.title}</b> <span className="muted small">{x.spec.kind} · {x.spec.context}{x.spec.photo ? ` · ${x.spec.photo.id}` : ''}</span></div>
            <GalleryHero spec={x.spec} sport={x.sport} />
          </li>
        ))}
      </ol>
    </div>
  );
}
