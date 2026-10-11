// Broadcast building blocks shared by Home, Games and the Terminal: participant marks for every sport, the
// featured matchup hero with glass number panels, and compact discovery cards (the rail lives in rail.tsx). Everything drawn is a published field; a missing number is left out, never filled.
import { useMemo, useState, type ReactNode } from 'react';
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
import { matchupInsights } from '../../insights/matchups';
import { atWord, gameWeather, splitName, weatherLine } from '../game/Hero';
import { KIND_WORD, type Discovery } from '../../intelligence/discoveries';
import type { GameRow } from './games';
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
