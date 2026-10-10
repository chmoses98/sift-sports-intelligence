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
import { atWord, gameWeather, splitName, weatherLine } from '../game/Hero';
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

function Stat({ k, v, sub, tone }: { k: string; v: ReactNode; sub?: ReactNode; tone?: 'model' | 'market' }) {
  return (
    <div className={`hstat${tone ? ` hstat--${tone}` : ''}`}>
      <span className="hstat__k">{k}</span>
      <span className="hstat__v bnum">{v}</span>
      {sub && <span className="hstat__s">{sub}</span>}
    </div>
  );
}

/**
 * The featured matchup: the home venue's licensed photograph (or the designed team-branded fallback), real logos,
 * and glass panels with only the numbers this game's publication carries — model and market side by side,
 * each labelled, the model's own caveat beside it.
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
  const winModel = n && n.home.modelWin != null && n.away.modelWin != null;
  const winMarket = n && n.home.marketWin != null && n.away.marketWin != null;
  return (
    <article className={`fhero fhero--${spec.kind}${spec.photo ? '' : ' fhero--nophoto'}`} style={heroVars(spec)} aria-labelledby="fhero-t">
      <div className="fhero__img" aria-hidden="true"><HeroArt spec={spec} variant="hero" /></div>
      <div className="fhero__shade" aria-hidden="true" />
      <div className="fhero__in">
        <div className="fhero__top">
          <span className="fhero__eyebrow"><Icon name="star" size={13} /> Featured matchup · {nav?.label ?? g.sport}</span>
          <span className="fhero__when">{kickoff(g.item.start_time_utc)}{g.startMs > now ? ` · ${until(g.item.start_time_utc, now)}` : ''}</span>
        </div>
        <h2 className="fhero__match" id="fhero-t">
          <span className="fhero__team"><PMark sport={g.sport} p={g.away} size="lg" /><span className="fhero__nm"><small>{a.city}</small>{a.nick || g.away?.display_name}</span></span>
          <span className="fhero__at">{atWord(spec)}</span>
          <span className="fhero__team fhero__team--home"><span className="fhero__nm"><small>{h.city}</small>{h.nick || g.home?.display_name}</span><PMark sport={g.sport} p={g.home} size="lg" /></span>
        </h2>
        <p className="fhero__venue">{spec.venue?.name ?? g.item.competition ?? ''}{wx && weatherLine(wx) ? ` · ${weatherLine(wx)}` : ''}{wx?.kind === 'outdoor' ? <span className="fhero__wxnote"> · weather shown for context, not in the projection</span> : null}</p>
        <div className="fhero__panels">
          {n && (n.modelSpread != null || n.away.modelScore != null) && (
            <div className="glass fhero__panel">
              <span className="eyebrow2">SIFT model{n.modelVersion ? ` · ${n.modelVersion}` : ''}</span>
              <div className="fhero__stats">
                {n.away.modelScore != null && n.home.modelScore != null && <Stat tone="model" k="Projected score" v={`${n.away.abbr} ${Math.round(n.away.modelScore)} – ${Math.round(n.home.modelScore)} ${n.home.abbr}`} />}
                {n.modelSpread != null && <Stat tone="model" k="Spread" v={spreadText(n.modelSpread, n)} />}
                {n.modelTotal != null && <Stat tone="model" k="Total" v={halfRound(n.modelTotal)} />}
              </div>
            </div>
          )}
          {n && (n.marketSpread != null || winMarket) && (
            <div className="glass fhero__panel">
              <span className="eyebrow2">Market</span>
              <div className="fhero__stats">
                {n.marketSpread != null && <Stat tone="market" k="Spread" v={spreadText(n.marketSpread, n)} />}
                {n.marketTotal != null && <Stat tone="market" k="Total" v={halfRound(n.marketTotal)} />}
                {winMarket && <Stat tone="market" k="To win" v={`${n.away.abbr} ${sharePct(n.away.marketWin!)} · ${n.home.abbr} ${sharePct(n.home.marketWin!)}`} />}
              </div>
              {n.marketBasis && <span className="fhero__basis">{n.marketBasis}</span>}
            </div>
          )}
          {winModel && (
            <div className="glass fhero__panel fhero__panel--win">
              <span className="eyebrow2">Model win probability</span>
              <div className="wsplit" role="img" aria-label={`Model win probability: ${n!.away.abbr} ${sharePct(n!.away.modelWin!)}, ${n!.home.abbr} ${sharePct(n!.home.modelWin!)}`}>
                <span className="wsplit__a" style={{ width: `${n!.away.modelWin! * 100}%` }}><b>{n!.away.abbr} {sharePct(n!.away.modelWin!)}</b></span>
                <span className="wsplit__h" style={{ width: `${n!.home.modelWin! * 100}%` }}><b>{n!.home.abbr} {sharePct(n!.home.modelWin!)}</b></span>
              </div>
              {n!.caveat && <span className="fhero__basis">{n!.caveat}</span>}
            </div>
          )}
          {(insight || lead) && (
            <div className="glass fhero__panel fhero__panel--read">
              <span className="eyebrow2">Key matchup</span>
              {insight && <p className="fhero__read">{insight.headline}</p>}
              {lead && <p className="fhero__script"><i className={`sdot sdot--s${lead.index}`} aria-hidden="true" />Most likely script: <b>{lead.name}</b> · {sharePct(lead.share)} of simulations</p>}
            </div>
          )}
          {research.loading && <div className="glass fhero__panel fhero__panel--load"><span className="eyebrow2">Reading this game’s research…</span></div>}
        </div>
        <div className="fhero__cta">
          <Link to={routes.game(g.slug, g.item.event_id)} className="btn btn--primary">Open matchup <Icon name="arrowRight" size={16} /></Link>
          {g.sport === 'NFL' && <Link to={routes.game(g.slug, g.item.event_id, { tab: 'props' })} className="btn btn--glass">Player props</Link>}
          {set && <Link to={routes.game(g.slug, g.item.event_id, { tab: 'scripts' })} className="btn btn--glass">Game scripts</Link>}
        </div>
      </div>
      {spec.photo && <span className="fhero__credit">Photo: {spec.photo.credit.artist.slice(0, 40)} · {spec.photo.credit.license}</span>}
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
