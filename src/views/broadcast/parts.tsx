// Broadcast building blocks shared by Home, Games and the Terminal: participant marks for every sport, the
// featured matchup hero with glass number panels, and compact discovery cards (the rail lives in rail.tsx). Everything drawn is a published field; a missing number is left out, never filled.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '../../routing';
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
import { heroArtwork } from '../../lib/hero/artwork';
import { marketTag, modelTag } from '../../lib/hero/copy';
import { KIND_WORD, type Discovery } from '../../intelligence/discoveries';
import type { GameRow } from './games';
import { featuredView } from './lifecycle';
import { halfRound, heroNumbers, spreadText } from './numbers';
import '../../styles/lane-e-intel.css';

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
function FeaturedSide({ sport, p, city, nick, accent, side, score, won }: { sport: string; p: Participant | undefined; city: string; nick: string; accent: string; side: 'away' | 'home'; score?: number | null; won?: boolean }) {
  // The longest word sets the type size (src/styles/lane-a-hero.css .fh2__nm b): a name is never broken inside a word.
  const longest = Math.max(1, ...nick.split(/\s+/).map((w) => w.length));
  return (
    <span className={`fh2__team fh2__team--${side}`} style={{ ['--tc' as string]: accent, ['--nm-chars' as string]: longest }}>
      <span className="fh2__logo"><PMark sport={sport} p={p} size="lg" /></span>
      <span className="fh2__nm">
        {city && <small>{city}</small>}
        <b>{nick}</b>
        <i className="fh2__rule" aria-hidden="true" />
        {score != null && <span className={`fh2__score bnum${won ? ' is-win' : ''}`}><span className="sr-only">{won ? 'Final score, winner: ' : 'Final score: '}</span>{score}</span>}
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
export function FeaturedHero({ g, now, scope = 'today' }: { g: GameRow; now: number; scope?: 'today' | 'upcoming' }) {
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
  // Approved illustrative artwork for exactly this matchup (lib/hero/artwork.ts, the same matcher the game page uses).
  const art = heroArtwork(g.sport, g.away?.short_name, g.home?.short_name);
  // The game's own status (live / final) is read apart from the research on it (src/views/broadcast/lifecycle.ts).
  const view = featuredView(g, (r?.extensions as { result?: unknown } | undefined)?.result);
  const label = nav?.label ?? g.sport;
  return (
    <article className={`fhero fh2 fhero--${spec.kind}${spec.photo ? '' : ' fhero--nophoto'}${logoSport ? '' : ' fh2--text'}${art ? ' fh2--art' : ''} fh2--${view.state}`} style={{ ...heroVars(spec), ['--fa' as string]: awayCol, ['--fh' as string]: homeCol }} aria-labelledby="fhero-t" {...heroData(spec)}>
      {art ? (
        <div className="fh2__art" aria-hidden="true"><img src={art.srcSmall} srcSet={`${art.srcSmall} 1200w, ${art.src} 2171w`} sizes="100vw" alt="" decoding="async" fetchPriority="high" draggable={false} /></div>
      ) : (
        <div className="fhero__img" aria-hidden="true"><HeroArt spec={spec} variant="hero" /></div>
      )}
      <div className="fhero__shade" aria-hidden="true" />
      <div className="fh2__edge" aria-hidden="true" />
      <div className="fhero__in fh2__in">
        <div className="fh2__top">
          <span className="fh2__eyebrow">{nav && <SportMark slug={g.slug} icon={nav.icon} size={14} />}<span>{view.state === 'pregame' ? (scope === 'upcoming' ? `Upcoming ${label} feature` : `Featured · ${label}`) : <>{view.state === 'live' && <i className="fh2__dot" aria-hidden="true" />}{view.word} · {label}</>}</span></span>
          <span className="fh2__when"><b>{kickoff(g.item.start_time_utc)}</b>{g.startMs > now ? <span> · {until(g.item.start_time_utc, now)}</span> : null}</span>
        </div>
        <h2 className="fh2__match" id="fhero-t">
          <FeaturedSide sport={g.sport} p={g.away} city={a.city} nick={a.nick || g.away?.display_name || ''} accent={awayCol} side="away" score={view.scores?.away} won={view.scores?.winner === 'away'} />
          <span className={`fh2__at${view.state === 'pregame' ? '' : ` fh2__at--${view.state}`}`}>{view.state === 'pregame' ? atWord(spec) : view.state === 'live' ? 'Live' : view.state === 'final' ? 'Final' : 'Started'}</span>
          <FeaturedSide sport={g.sport} p={g.home} city={h.city} nick={h.nick || g.home?.display_name || ''} accent={homeCol} side="home" score={view.scores?.home} won={view.scores?.winner === 'home'} />
        </h2>
        {view.statusLine && <p className="fh2__status" role="status">{view.state === 'live' && <i className="fh2__dot" aria-hidden="true" />}{view.statusLine}</p>}
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
        {view.researchLine && (hasModel || hasMarket || winModel || insight || lead) && <p className="fh2__research">{view.researchLine}</p>}
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
          {set && <Link to={routes.game(g.slug, g.item.event_id, { tab: 'script' })} className="btn btn--glass">Game scripts</Link>}
        </div>
      </div>
      {art ? <span className="fh2__credit fh2__credit--art">{art.label}</span> : spec.photo && <span className="fh2__credit">Photo: {spec.photo.credit.artist.slice(0, 40)} · {spec.photo.credit.license}</span>}
    </article>
  );
}

const SIG_WORD = { high: 'High significance', medium: 'Notable', low: 'Context' } as const;

const LEAD_ICON: Record<string, string> = { script: 'layers', player: 'star', stat: 'chart', market: 'chart', evidence: 'shield', game: 'compare', data: 'info' };

/** Where a finding leads, as a short list of links (script, player, stat, market, evidence). */
export function LeadLinks({ d, max = 4 }: { d: Discovery; max?: number }) {
  if (!d.leads.length) return null;
  return (
    <ul className="dleads" aria-label="Research this leads to">
      {d.leads.slice(0, max).map((l) => (
        <li key={l.href + l.label}><Link to={l.href} className={`dlead dlead--${l.kind}`}><Icon name={LEAD_ICON[l.kind] ?? 'arrowRight'} size={14} /><span>{l.label}</span><Icon name="chevronRight" size={14} className="chev" /></Link></li>
      ))}
    </ul>
  );
}

/**
 * A discovery as a compact card: kind, significance and evidence as two separate words, the why, where it leads.
 * `expandable` (Home): the card opens in place to the plainly explained conclusion, its key facts and the research it
 * leads to; the title still opens the Terminal for the full connected view.
 */
export function DiscoveryCard({ d, active, onSelect, expandable }: { d: Discovery; active?: boolean; onSelect?: () => void; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const nav = navSport(d.slug);
  const top = (
    <span className="dcard__top">
      <span className="dcard__kind">{nav && <SportMark slug={d.slug} icon={nav.icon} size={13} />}{KIND_WORD[d.kind]}</span>
      <span className={`dcard__sig dcard__sig--${d.significance}`}>{SIG_WORD[d.significance]}</span>
    </span>
  );
  const foot = (
    <span className="dcard__foot">
      {d.evidence ? <span className={`dword dword--${d.evidence.tone}`}>{d.evidence.word}</span> : <span className="dcard__noev">Not a betting signal</span>}
      {d.evidence && <span className="dcard__basis">{d.evidence.basis}</span>}
    </span>
  );
  if (expandable) {
    const id = `dx-${d.id.replace(/[^a-z0-9]/gi, '')}`;
    return (
      <article className={`dcard dcard--x${open ? ' is-open' : ''}`}>
        {top}
        <Link to={routes.intelligence({ d: d.id })} className="dcard__t dcard__ta">{d.title}</Link>
        <span className="dcard__why">{d.why}</span>
        {foot}
        <button type="button" className="dcard__more" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}>
          <Icon name="chevronDown" size={14} className="dcard__chev" />{open ? 'Hide summary' : 'What it means'}
        </button>
        {open && (
          <div className="dcard__x" id={id}>
            <p className="dcard__mean">{d.meaning}</p>
            {d.facts.length > 0 && <dl className="dcard__facts">{d.facts.slice(0, 4).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
            <LeadLinks d={d} />
          </div>
        )}
      </article>
    );
  }
  const body = (
    <>
      {top}
      <span className="dcard__t">{d.title}</span>
      <span className="dcard__why">{d.why}</span>
      {foot}
    </>
  );
  if (onSelect) return <button type="button" className={`dcard${active ? ' is-on' : ''}`} onClick={onSelect} aria-pressed={!!active}>{body}</button>;
  return <Link to={routes.intelligence({ d: d.id })} className="dcard">{body}</Link>;
}
