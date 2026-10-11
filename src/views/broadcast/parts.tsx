// Broadcast building blocks shared by Home, Games and the Terminal: participant marks for every sport, the
// today's-games rail and its tiles, the featured matchup hero with glass number panels, and compact discovery
// cards. Everything drawn is a published field; a missing number is left out, never filled.
import { useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { sportBySlug } from '../../data/sports';
import { navSport } from '../../data/nav';
import { HeroArt, heroVars } from '../../components/HeroArt';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { TeamMark } from '../../components/ui';
import { TeamLogo } from '../cbb/viz';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFor } from '../../lib/hero/input';
import { kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { matchupInsights } from '../../insights/matchups';
import { atWord, gameWeather, heroData, splitName, weatherLine } from '../game/Hero';
import { Info } from '../game/panels';
import { accentOnDark } from '../../lib/hero/accent';
import { marketTag, modelTag } from '../../lib/hero/copy';
import { KIND_WORD, type Discovery } from '../../intelligence/discoveries';
import { phaseWord, type GameRow } from './games';
import { halfRound, heroNumbers, spreadText } from './numbers';

type Participant = BoardItem['participants'][number];

const TEAM_LOGO_SPORTS = new Set(['NFL', 'CFB', 'NHL', 'NBA', 'MLB']);

/** A participant's mark in any sport: club logo, CBB school logo, or initials (players, clubs without a logo). */
export function PMark({ sport, p, size = 'md' }: { sport: string; p: Participant | undefined; size?: 'sm' | 'md' | 'lg' }) {
  if (!p) return <span className="pmark pmark--empty" aria-hidden="true" />;
  if (TEAM_LOGO_SPORTS.has(sport)) return <TeamMark sport={sport} abbr={p.short_name} size={size === 'lg' ? 'xl' : size === 'md' ? 'lg' : 'md'} />;
  if (sport === 'CBB') return <TeamLogo pid={p.participant_id} abbr={p.short_name} size={size === 'lg' ? 64 : size === 'md' ? 34 : 24} />;
  const words = (p.display_name ?? p.short_name ?? '?').replace(/[^\p{L}\s-]/gu, '').split(/\s+/).filter(Boolean);
  const text = (sport === 'TENNIS' ? words.slice(-1)[0]?.slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 3)) ?? '?';
  return <span className={`pmark pmark--text pmark--${size}`} aria-hidden="true">{text.toUpperCase()}</span>;
}

const shortOf = (sport: string, p: Participant | undefined) => (!p ? '' : sport === 'SOCCER' || sport === 'TENNIS' || sport === 'CBB' ? p.display_name : p.short_name ?? p.display_name);

/** One game in the rail: logos, names, clock word, and how many candidates its own publication flags. */
export function RailTile({ g }: { g: GameRow }) {
  const nav = navSport(g.slug);
  const homeCol = TEAM_LOGO_SPORTS.has(g.sport) ? teamColors(g.sport, g.home?.short_name)[0] : nav?.accent;
  const awayCol = TEAM_LOGO_SPORTS.has(g.sport) ? teamColors(g.sport, g.away?.short_name)[0] : nav?.accent;
  const sep = g.sport === 'SOCCER' || g.sport === 'TENNIS' ? 'v' : '@';
  const first = g.sport === 'SOCCER' ? g.home : g.away;
  const second = g.sport === 'SOCCER' ? g.away : g.home;
  return (
    <Link to={routes.game(g.slug, g.item.event_id)} className={`rtile rtile--${g.phase.toLowerCase()}`} style={{ ['--ca' as string]: awayCol, ['--ch' as string]: homeCol }} aria-label={`${g.label}, ${nav?.label ?? g.sport}, ${phaseWord(g)}${g.candidates ? `, ${g.candidates} research candidates` : ''}`}>
      <span className="rtile__top">
        <span className="rtile__sport">{nav && <SportMark slug={g.slug} icon={nav.icon} size={13} />}{g.sport === 'SOCCER' || g.sport === 'TENNIS' ? (g.item.competition ?? nav?.label) : nav?.label}</span>
        <span className={`rtile__clock${g.phase === 'STARTED' && !g.stale ? ' is-live' : ''}`}>{phaseWord(g)}</span>
      </span>
      <span className="rtile__row"><PMark sport={g.sport} p={first} size="sm" /><span className="rtile__n">{shortOf(g.sport, first)}</span></span>
      <span className="rtile__row"><PMark sport={g.sport} p={second} size="sm" /><span className="rtile__n">{sep === '@' ? '' : ''}{shortOf(g.sport, second)}</span></span>
      <span className="rtile__foot">{g.candidates > 0 ? <span className="rtile__flag">{g.candidates} {g.candidates === 1 ? 'candidate' : 'candidates'}</span> : g.item.markets_available ? <span>{g.item.markets_available} markets</span> : <span>Research</span>}</span>
    </Link>
  );
}

/** Today's games as a horizontal rail with scroll buttons on wide screens and a View all link. */
export function GameRail({ rows, viewAll, empty }: { rows: GameRow[]; viewAll: string; empty?: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.8), behavior: 'smooth' });
  if (!rows.length) return <>{empty ?? null}</>;
  return (
    <div className="rail">
      <button type="button" className="rail__btn rail__btn--l" onClick={() => scroll(-1)} aria-label="Scroll games left"><Icon name="arrowLeft" size={18} /></button>
      <ul className="rail__list" ref={ref}>
        {rows.map((g) => <li key={`${g.slug}:${g.item.event_id}`}><RailTile g={g} /></li>)}
        <li className="rail__end"><Link to={viewAll} className="rail__all"><Icon name="grid" size={20} /><span>View all</span><b className="bnum">{rows.length}</b></Link></li>
      </ul>
      <button type="button" className="rail__btn rail__btn--r" onClick={() => scroll(1)} aria-label="Scroll games right"><Icon name="arrowRight" size={18} /></button>
    </div>
  );
}

/** The one game's research document, through its sport's own resolved source (one fetch, memoised). */
export function useGameResearch(slug: string | null, eventId: string | null) {
  return useAsync(slug && eventId ? `heroResearch:${slug}:${eventId}` : null, async () => {
    const sport = sportBySlug(slug!);
    if (!sport) return null;
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return null;
    return repo.eventResearch(eventId!).catch(() => null);
  });
}

function Cell({ k, info, v, sub, tag, className }: { k: string; info?: ReactNode; v: ReactNode; sub?: ReactNode; tag?: ReactNode; className?: string }) {
  return (
    <div className={`fh2__cell${className ? ` ${className}` : ''}`}>
      <span className="fh2__k">{k}{info}</span>
      <span className="fh2__v bnum">{v}</span>
      {sub && <span className="fh2__s">{sub}</span>}
      {tag && <span className="fh2__tag">{tag}</span>}
    </div>
  );
}

/** A team's side of the featured matchup: logo, city small, name large, and a rule in the club's own colour. */
function FeaturedSide({ sport, p, city, nick, accent, side }: { sport: string; p: Participant | undefined; city: string; nick: string; accent: string; side: 'away' | 'home' }) {
  return (
    <span className={`fh2__team fh2__team--${side}`} style={{ ['--tc' as string]: accent }}>
      <span className="fh2__logo"><PMark sport={sport} p={p} size="lg" /></span>
      <span className="fh2__nm">
        {city && <small>{city}</small>}
        <b>{nick}</b>
        <i className="fh2__rule" aria-hidden="true" />
      </span>
    </span>
  );
}

/**
 * The featured matchup, broadcast style: the home venue's licensed photograph (or the team-branded graphic), both
 * clubs in their own colours, then one scoreboard strip with only the numbers this game's publication carries —
 * the Sift projection, the market, the model's win chance and the key matchup. Each limitation is one short phrase;
 * the publication's full wording is one tap away (the info buttons), never a paragraph on the hero.
 */
export function FeaturedHero({ g, now }: { g: GameRow; now: number }) {
  const research = useGameResearch(g.slug, g.item.event_id);
  const r = research.data ?? null;
  const spec = useMemo(() => resolveHero(heroInputFor(g.item, r, g.sport)), [g.item, r, g.sport]);
  const n = useMemo(() => heroNumbers(r), [r]);
  const set = r ? gameScripts(r) : null;
  const lead = set?.scripts[0];
  const insight = useMemo(() => (r && g.sport === 'NFL' ? matchupInsights(r)[0] ?? null : null), [r, g.sport]);
  const wx = r ? gameWeather(r, spec.venue) : null;
  const a = splitName(g.away?.display_name ?? '', g.away?.short_name, g.sport);
  const h = splitName(g.home?.display_name ?? '', g.home?.short_name, g.sport);
  const nav = navSport(g.slug);
  const logoSport = TEAM_LOGO_SPORTS.has(g.sport) || g.sport === 'CBB';
  const awayCol = accentOnDark(spec.away?.colors ?? (TEAM_LOGO_SPORTS.has(g.sport) ? teamColors(g.sport, g.away?.short_name) : [nav?.accent ?? '#8fd0ff', '#8fd0ff']));
  const homeCol = accentOnDark(spec.home?.colors ?? (TEAM_LOGO_SPORTS.has(g.sport) ? teamColors(g.sport, g.home?.short_name) : [nav?.accent ?? '#8fd0ff', '#8fd0ff']));
  const winModel = n && n.home.modelWin != null && n.away.modelWin != null;
  const winMarket = n && n.home.marketWin != null && n.away.marketWin != null;
  const hasModel = n && (n.modelSpread != null || (n.away.modelScore != null && n.home.modelScore != null));
  const hasMarket = n && (n.marketSpread != null || n.marketTotal != null || winMarket);
  const tag = modelTag(n?.caveat);
  const modelInfo = n && (n.caveat || n.modelVersion) ? (
    <Info label="About the Sift model">
      {n.caveat && <span>{n.caveat}</span>}
      {n.modelVersion && <span>Model version {n.modelVersion}. Research evidence, not a pick.</span>}
    </Info>
  ) : null;
  const wxText = wx ? weatherLine(wx) : null;
  const venue = spec.venue?.name ?? g.item.competition ?? '';
  return (
    <article className={`fhero fh2 fhero--${spec.kind}${spec.photo ? '' : ' fhero--nophoto'}${logoSport ? '' : ' fh2--text'}`} style={{ ...heroVars(spec), ['--fa' as string]: awayCol, ['--fh' as string]: homeCol }} aria-labelledby="fhero-t" {...heroData(spec)}>
      <div className="fhero__img" aria-hidden="true"><HeroArt spec={spec} variant="hero" /></div>
      <div className="fhero__shade" aria-hidden="true" />
      <div className="fh2__edge" aria-hidden="true" />
      <div className="fhero__in fh2__in">
        <div className="fh2__top">
          <span className="fh2__eyebrow">{nav && <SportMark slug={g.slug} icon={nav.icon} size={14} />}<span>Featured · {nav?.label ?? g.sport}</span></span>
          <span className="fh2__when"><b>{kickoff(g.item.start_time_utc)}</b>{g.startMs > now ? <span> · {until(g.item.start_time_utc, now)}</span> : null}</span>
        </div>
        <h2 className="fh2__match" id="fhero-t">
          <FeaturedSide sport={g.sport} p={g.away} city={a.city} nick={a.nick || g.away?.display_name || ''} accent={awayCol} side="away" />
          <span className="fh2__at">{atWord(spec)}</span>
          <FeaturedSide sport={g.sport} p={g.home} city={h.city} nick={h.nick || g.home?.display_name || ''} accent={homeCol} side="home" />
        </h2>
        {(venue || wxText) && (
          <p className="fh2__venue">
            {venue && <span className="fh2__vn">{venue}</span>}
            {wxText && (
              <span className={wx?.flag ? 'fh2__wx is-flag' : 'fh2__wx'}>
                {wxText}
                {wx?.kind === 'outdoor' && <Info label="Is weather in the projection?" align="end"><span>Weather is shown for context. It is not an input to this game’s projection.</span></Info>}
              </span>
            )}
          </p>
        )}
        {(hasModel || hasMarket || winModel || insight || lead) && (
          <div className="fh2__board">
            {hasModel && (
              <Cell
                className="fh2__cell--model"
                k="Sift projection"
                info={modelInfo}
                v={n!.away.modelScore != null && n!.home.modelScore != null ? <><small>{n!.away.abbr}</small> {Math.round(n!.away.modelScore)}<span className="fh2__dash">–</span>{Math.round(n!.home.modelScore)} <small>{n!.home.abbr}</small></> : spreadText(n!.modelSpread, n!)}
                sub={[n!.modelSpread != null && n!.away.modelScore != null ? spreadText(n!.modelSpread, n!) : null, n!.modelTotal != null ? `Total ${halfRound(n!.modelTotal)}` : null].filter(Boolean).join(' · ') || undefined}
                tag={tag}
              />
            )}
            {hasMarket && (
              <Cell
                className="fh2__cell--market"
                k="Market"
                info={n!.marketBasis ? <Info label="Where the market numbers come from"><span>{n!.marketBasis}.</span></Info> : null}
                v={n!.marketSpread != null ? spreadText(n!.marketSpread, n!) : winMarket ? `${n!.away.abbr} ${sharePct(n!.away.marketWin!)} · ${n!.home.abbr} ${sharePct(n!.home.marketWin!)}` : `Total ${halfRound(n!.marketTotal!)}`}
                sub={[n!.marketSpread != null && n!.marketTotal != null ? `Total ${halfRound(n!.marketTotal)}` : null, n!.marketSpread != null && winMarket ? `To win ${n!.away.abbr} ${sharePct(n!.away.marketWin!)} · ${n!.home.abbr} ${sharePct(n!.home.marketWin!)}` : null].filter(Boolean).join(' · ') || undefined}
                tag={marketTag(n!.marketBasis)}
              />
            )}
            {winModel && (
              <div className="fh2__cell fh2__cell--win">
                <span className="fh2__k">Model win chance</span>
                <span className="fh2__wl bnum"><b>{n!.away.abbr} {sharePct(n!.away.modelWin!)}</b><b>{sharePct(n!.home.modelWin!)} {n!.home.abbr}</b></span>
                <span className="fh2__wbar" role="img" aria-label={`Model win chance: ${n!.away.abbr} ${sharePct(n!.away.modelWin!)}, ${n!.home.abbr} ${sharePct(n!.home.modelWin!)}`}>
                  <i style={{ width: `${n!.away.modelWin! * 100}%` }} />
                  <i style={{ width: `${n!.home.modelWin! * 100}%` }} />
                </span>
                {tag && !hasModel && <span className="fh2__tag">{tag}</span>}
              </div>
            )}
            {(insight || lead) && (
              <div className="fh2__cell fh2__cell--read">
                <span className="fh2__k">{insight ? 'Key matchup' : 'Most likely script'}</span>
                {insight && <span className="fh2__read">{insight.headline}</span>}
                {lead && <span className="fh2__s"><i className={`sdot sdot--s${lead.index}`} aria-hidden="true" />{insight ? 'Most likely: ' : ''}<b>{lead.name}</b> · {sharePct(lead.share)} of simulations</span>}
              </div>
            )}
          </div>
        )}
        {research.loading && <div className="fh2__board fh2__board--load"><span className="fh2__k">Reading this game’s research…</span></div>}
        <div className="fh2__cta">
          <Link to={routes.game(g.slug, g.item.event_id)} className="btn btn--primary">Open matchup <Icon name="arrowRight" size={16} /></Link>
          {g.sport === 'NFL' && <Link to={routes.game(g.slug, g.item.event_id, { tab: 'props' })} className="btn btn--glass">Player props</Link>}
          {set && <Link to={routes.game(g.slug, g.item.event_id, { tab: 'scripts' })} className="btn btn--glass">Game scripts</Link>}
        </div>
      </div>
      {spec.photo && <span className="fh2__credit">Photo: {spec.photo.credit.artist.slice(0, 40)} · {spec.photo.credit.license}</span>}
    </article>
  );
}

const SIG_WORD = { high: 'High significance', medium: 'Notable', low: 'Context' } as const;

/** A discovery as a compact card: kind, significance and evidence as two separate words, the why, where it leads. */
export function DiscoveryCard({ d, active, onSelect }: { d: Discovery; active?: boolean; onSelect?: () => void }) {
  const nav = navSport(d.slug);
  const body = (
    <>
      <span className="dcard__top">
        <span className="dcard__kind">{nav && <SportMark slug={d.slug} icon={nav.icon} size={13} />}{KIND_WORD[d.kind]}</span>
        <span className={`dcard__sig dcard__sig--${d.significance}`}>{SIG_WORD[d.significance]}</span>
      </span>
      <span className="dcard__t">{d.title}</span>
      <span className="dcard__why">{d.why}</span>
      <span className="dcard__foot">
        {d.evidence ? <span className={`dword dword--${d.evidence.tone}`}>{d.evidence.word}</span> : <span className="dcard__noev">Not a betting signal</span>}
        {d.evidence && <span className="dcard__basis">{d.evidence.basis}</span>}
      </span>
    </>
  );
  if (onSelect) return <button type="button" className={`dcard${active ? ' is-on' : ''}`} onClick={onSelect} aria-pressed={!!active}>{body}</button>;
  return <Link to={routes.intelligence({ d: d.id })} className="dcard">{body}</Link>;
}
