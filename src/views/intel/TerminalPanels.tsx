// The Intelligence Terminal's connected panels. Each one reads the SELECTED discovery and its game's own research
// document, and says plainly when the publication carries nothing for it (a panel is never filled to look busy):
//   matchup     opponent-adjusted unit ranks, offense against the defense it faces (NFL), or same-metric team ranks
//   projection  the model's number beside the market's, over the simulation's published 50% / 90% ranges; for a
//               priced contract, the ask, break-even, publication fair and bet-up-to on one scale
//   scripts     NFL simulation shares (labelled shares of simulated games), CFB ranked evidence (never a probability)
//   markets     the publication's judged contracts and the game's main lines, each with its quote's age
//   context     injuries, weather, the model's own caveat and the finding's risk
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { FxCard, VsBar } from '../../components/fx';
import { HeroArt, heroVars } from '../../components/HeroArt';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { SaveButton } from '../../components/ui';
import { navSport } from '../../data/nav';
import { KIND_WORD, type Discovery } from '../../intelligence/discoveries';
import { gameSides } from '../../insights/game';
import { betPhrase } from '../../lib/betWords';
import { decisionOf } from '../../lib/decision';
import { ago, kickoff } from '../../lib/format';
import { injuryRows, notableInjuries } from '../../lib/gamedata';
import type { HeroSpec } from '../../lib/hero/types';
import { describeMarket } from '../../lib/marketLabel';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct } from '../../lib/scripts';
import { isEngine, readEngine, ROLE_INDEX, ROLE_WORD, scriptTitle } from '../../lib/scriptEngine';
import { teamColors } from '../../lib/teams';
import { formatQuoteAgo, quoteAgeMs, quoteFreshness } from '../../live/freshness';
import type { LiveQuote } from '../../live/types';
import type { Opportunity } from '../../opportunity/types';
import { PMark } from '../broadcast/parts';
import { halfRound, heroNumbers, spreadText } from '../broadcast/numbers';
import { gameWeather, weatherLine } from '../game/Hero';
import { MarketCompare } from './MarketCompare';
import { areaPairs, gameEnvironment, mainLines, researchFair, SHORT_KIND, SIG_BARS, SIG_SHORT, type Spread } from './terminalModel';

const SIG_WORD = { high: 'High significance', medium: 'Notable', low: 'Context' } as const;
const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;

/** Three rising bars and a word: how much the finding matters to understanding the game (never betting evidence). */
export function Importance({ sig, compact }: { sig: Discovery['significance']; compact?: boolean }) {
  const n = SIG_BARS[sig];
  return (
    <span className={`tm-imp tm-imp--${sig}`} title={SIG_WORD[sig]}>
      {!compact && <b>{SIG_SHORT[sig]}</b>}
      <span className="tm-imp__bars" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'is-on' : undefined} />)}</span>
      <span className="sr-only">Significance: {SIG_WORD[sig]}</span>
    </span>
  );
}

/** A type chip in the discovery's own colour family. */
export function KindChip({ d }: { d: Discovery }) {
  return <span className={`tm-kind tm-kind--${d.kind}`}>{SHORT_KIND[d.kind] ?? KIND_WORD[d.kind]}</span>;
}

function Freshness({ at, now, prefix }: { at: string | null | undefined; now: number; prefix?: string }) {
  const f = quoteFreshness(at ?? null, now);
  return <span className={`tm-fresh tm-fresh--${f.toLowerCase()}`} title={at ? new Date(at).toLocaleString() : 'No timestamp published'}>{prefix ? `${prefix} ` : ''}{at ? formatQuoteAgo(quoteAgeMs(at, now)) : 'no timestamp'}</span>;
}

/**
 * The published ranges of one simulated quantity on a number line: the 90% band, the 50% band, the simulation
 * mean, and labelled markers (the model's number, the market's). Nothing outside the published ranges is drawn.
 */
export function RangeChart({ s, markers, label, format = (v) => String(halfRound(v)), tickFormat = format }: { s: Spread; markers: { value: number; label: string; tone: 'model' | 'market' }[]; label: string; format?: (v: number) => string; tickFormat?: (v: number) => string }) {
  const vals = [s.r90[0], s.r90[1], ...markers.map((m) => m.value)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  const a = lo - pad;
  const b = hi + pad;
  const W = 400;
  const x = (v: number) => 14 + ((v - a) / (b - a)) * (W - 28);
  const ticks = [s.r90[0], s.r50[0], s.mean, s.r50[1], s.r90[1]];
  return (
    <figure className="tm-range">
      <svg viewBox={`0 0 ${W} 96`} role="img" aria-label={`${label}: simulated 90% range ${format(s.r90[0])} to ${format(s.r90[1])}, 50% range ${format(s.r50[0])} to ${format(s.r50[1])}, mean ${format(s.mean)}; ${markers.map((m) => `${m.label} ${format(m.value)}`).join('; ')}`}>
        <line x1={14} x2={W - 14} y1={52} y2={52} className="tm-range__axis" />
        <rect x={x(s.r90[0])} y={40} width={Math.max(2, x(s.r90[1]) - x(s.r90[0]))} height={24} rx={5} className="tm-range__r90" />
        <rect x={x(s.r50[0])} y={36} width={Math.max(2, x(s.r50[1]) - x(s.r50[0]))} height={32} rx={6} className="tm-range__r50" />
        <line x1={x(s.mean)} x2={x(s.mean)} y1={32} y2={72} className="tm-range__mean" />
        {markers.map((m, i) => (
          <g key={m.label} className={`tm-range__mk tm-range__mk--${m.tone}`}>
            <line x1={x(m.value)} x2={x(m.value)} y1={i % 2 ? 30 : 22} y2={76} />
            <text x={x(m.value)} y={i % 2 ? 26 : 16} textAnchor={x(m.value) > W - 70 ? 'end' : x(m.value) < 70 ? 'start' : 'middle'}>{m.label} {format(m.value)}</text>
          </g>
        ))}
        {ticks.map((t, i) => <text key={i} x={x(t)} y={90} textAnchor="middle" className="tm-range__t">{tickFormat(t)}</text>)}
      </svg>
      <figcaption className="tm-range__key"><span className="k k--r50">50% of simulations</span><span className="k k--r90">90%</span><span className="k k--mean">Simulation mean</span></figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ hero

export function SelectedHero({ d, game, spec, pinned, onPin, onBack }: { d: Discovery; game: { item: BoardItem; away?: BoardItem['participants'][number]; home?: BoardItem['participants'][number] } | null; spec: HeroSpec | null; pinned: boolean; onPin: () => void; onBack: () => void }) {
  const [why, setWhy] = useState(false);
  const nav = navSport(d.slug);
  const o = d.opportunity;
  const ev = game?.item ?? null;
  const evLabel = game ? `${game.away?.short_name ?? game.away?.display_name ?? '?'} ${d.sport === 'SOCCER' || d.sport === 'TENNIS' ? 'v' : '@'} ${game.home?.short_name ?? game.home?.display_name ?? '?'}` : o?.eventLabel ?? null;
  return (
    <article className={`tm-hero${spec?.photo ? ' tm-hero--photo' : ''}`} style={spec ? heroVars(spec) : undefined} aria-labelledby="tm-hero-t">
      {spec && <div className="tm-hero__art" aria-hidden="true"><HeroArt spec={spec} variant="card" /></div>}
      <div className="tm-hero__shade" aria-hidden="true" />
      <div className="tm-hero__in">
        <button type="button" className="btn btn--ghost btn--sm tm-hero__back" onClick={onBack}><Icon name="arrowLeft" size={14} /> All discoveries</button>
        {ev ? (
          <div className="tm-hero__match">
            <PMark sport={d.sport} p={game?.away} size="lg" />
            <div className="tm-hero__mid">
              <span className="tm-hero__lbl">{evLabel}</span>
              <span className="tm-hero__when">{kickoff(ev.start_time_utc)}</span>
              {spec?.venue?.name && <span className="tm-hero__venue">{spec.venue.name}{spec.venue.city ? `, ${spec.venue.city}` : ''}</span>}
            </div>
            <PMark sport={d.sport} p={game?.home} size="lg" />
          </div>
        ) : (
          <div className="tm-hero__match tm-hero__match--sport">{nav && <SportMark slug={d.slug} icon={nav.icon} size={40} />}<span className="tm-hero__lbl">{nav?.label ?? d.sport} publication</span></div>
        )}
        {ev && (
          <nav className="tm-hero__tabs" aria-label="Open this game">
            <Link to={routes.game(d.slug, ev.event_id)}>Overview</Link>
            <Link to={routes.game(d.slug, ev.event_id, { tab: 'script' })}>Scripts</Link>
            <Link to={routes.game(d.slug, ev.event_id, { tab: 'matchup' })}>Matchups</Link>
            <Link to={routes.game(d.slug, ev.event_id, { tab: 'markets' })}>Markets</Link>
          </nav>
        )}
        <section className="tm-insight" aria-labelledby="tm-hero-t">
          <div className="tm-insight__top">
            <span className="tm-insight__k"><Icon name="bolt" size={14} /> Key insight · {KIND_WORD[d.kind]}</span>
            <Importance sig={d.significance} />
          </div>
          <h2 className="tm-insight__t" id="tm-hero-t">{d.title}</h2>
          <p className="tm-insight__why">{d.why}</p>
          <p className="tm-insight__ev">
            <span className="tm-insight__evk">Betting evidence</span>
            {d.evidence ? <><span className={`dword dword--${d.evidence.tone}`}>{d.evidence.word}</span><span className="muted small">{d.evidence.basis}</span></> : <span className="muted small">None — significance is not a bet</span>}
          </p>
        </section>
        <div className="tm-hero__acts">
          <button type="button" className={`btn btn--sm btn--glass${why ? ' is-on' : ''}`} aria-expanded={why} aria-controls="tm-why" onClick={() => setWhy((x) => !x)}><Icon name="info" size={14} /> Why?</button>
          {d.href && <Link to={d.href} className="btn btn--sm btn--glass"><Icon name="research" size={14} /> Research</Link>}
          {ev && <Link to={routes.game(d.slug, ev.event_id, { tab: 'markets' })} className="btn btn--sm btn--glass"><Icon name="chart" size={14} /> Markets</Link>}
          {o?.marketId ? (
            <SaveButton ref_kind="MARKET" sport={o.sport} id={o.marketId} extra={{ market_id: o.marketId, event_id: o.eventId }} label={{ label: `${o.what.side === 'NO' ? 'NO · ' : ''}${o.what.title}`, sub: o.eventLabel, href: o.href }} kickoff={o.startTime} />
          ) : ev ? (
            <SaveButton ref_kind="EVENT" sport={d.sport} id={ev.event_id} label={{ label: evLabel ?? d.title, sub: d.title, href: routes.game(d.slug, ev.event_id) }} kickoff={ev.start_time_utc} eventStatus={ev.status} text="Save game" />
          ) : null}
          <button type="button" className={`btn btn--sm btn--glass${pinned ? ' is-on' : ''}`} aria-pressed={pinned} onClick={onPin}><Icon name="pin" size={14} /> {pinned ? 'Pinned' : 'Pin'}</button>
        </div>
        {why && (
          <div className="tm-why" id="tm-why">
            <p><b>Method.</b> {d.method}</p>
            <p><b>Source.</b> {d.source}{d.observedAt ? ` · observed ${ago(d.observedAt)}` : ''}</p>
          </div>
        )}
      </div>
      {spec?.photo && <small className="tm-hero__credit">Photo: {spec.photo.credit.artist.slice(0, 32)} · {spec.photo.credit.license}</small>}
    </article>
  );
}

// ------------------------------------------------------------------ panels

function None({ children }: { children: ReactNode }) {
  return <p className="tm-none"><Icon name="info" size={14} /> {children}</p>;
}

export function MatchupPanel({ d, r, loading }: { d: Discovery; r: EventResearchDoc | null; loading: boolean }) {
  const g = useMemo(() => (r ? gameSides(r) : null), [r]);
  const ins = d.insight;
  const [offense, setOffense] = useState<string | null>(null);
  const off = offense ?? ins?.offense.team.abbr ?? g?.away.abbr ?? null;
  const pairs = useMemo(() => (r && off && d.sport === 'NFL' ? areaPairs(r, off, g) : []), [r, off, g, d.sport]);
  const generic = useMemo(() => (r && d.sport !== 'NFL' ? r.matchup.filter((m) => m.home?.context?.rank != null && m.away?.context?.rank != null && m.home.context.higher_is_better != null).slice(0, 8) : []), [r, d.sport]);
  const colors = g ? { ['--team-home' as string]: teamColors(d.sport, g.home.abbr)[0], ['--team-away' as string]: teamColors(d.sport, g.away.abbr)[0] } : undefined;
  const offSide = g && off ? g.byAbbr(off) : null;
  const defSide = g && off ? g.opp(off) : null;
  const sideColor = (abbr: string | undefined) => (g && abbr === g.home.abbr ? 'var(--team-home)' : 'var(--team-away)');
  return (
    <FxCard title="Opponent-adjusted matchup" icon="compare" id="tm-mu" className="tm-p tm-p--mu">
      <div style={colors}>
        {ins && (
          <div className="tm-mu__duel">
            {[ins.offense, ins.defense].map((u, i) => (
              <div key={u.metricId} className={`tm-mu__unit${i ? ' tm-mu__unit--r' : ''}`} style={{ ['--uc' as string]: sideColor(u.team.abbr) }}>
                <span className="tm-mu__who">{u.team.abbr} {u.unit}</span>
                <b className="fx-num fx-num--lg tm-mu__rk">#{u.rank.rank}</b>
                <span className="tm-mu__tier">{u.rank.tierWord} of {u.rank.of}</span>
                <span className="tm-mu__bar" aria-hidden="true"><i style={{ width: `${Math.round(u.rank.strength * 100)}%` }} /></span>
              </div>
            ))}
            <span className="tm-mu__vs" aria-hidden="true">vs</span>
          </div>
        )}
        {d.sport === 'NFL' && g && (
          <>
            <div className="tm-seg" role="group" aria-label="Which offense">
              {[g.away, g.home].map((s) => <button key={s.abbr} type="button" className={off === s.abbr ? 'is-on' : undefined} aria-pressed={off === s.abbr} onClick={() => setOffense(s.abbr)}>{s.abbr} offense vs {g.opp(s.abbr).abbr} defense</button>)}
            </div>
            {pairs.length ? (
              <div className="tm-mu__bars" style={{ ['--team-home' as string]: sideColor(offSide?.abbr), ['--team-away' as string]: sideColor(defSide?.abbr) }}>
                {pairs.map((p) => <VsBar key={p.key} label={p.label} left={{ rank: p.off.rank, of: p.off.of, text: `${p.off.abbr} ${p.off.unit}` }} right={{ rank: p.def.rank, of: p.def.of, text: `${p.def.abbr} ${p.def.unit}` }} leftMark={<small className="tm-mu__ab">{p.off.abbr}</small>} rightMark={<small className="tm-mu__ab">{p.def.abbr}</small>} />)}
              </div>
            ) : <None>This game’s research carries no opponent-adjusted unit ranks.</None>}
            <p className="tm-note">League ranks of the publication’s opponent-adjusted ratings, #1 = best at the unit’s job. The longer, lit bar holds the edge; ranks say who, not by how many points.</p>
          </>
        )}
        {d.sport !== 'NFL' && (generic.length && g ? (
          <>
            <div className="tm-mu__bars">
              {generic.map((m) => <VsBar key={m.metric_id} label={m.name} left={{ rank: m.away!.context!.rank, of: m.away!.context!.universe_size, text: g.away.abbr }} right={{ rank: m.home!.context!.rank, of: m.home!.context!.universe_size, text: g.home.abbr }} leftMark={<small className="tm-mu__ab">{g.away.abbr}</small>} rightMark={<small className="tm-mu__ab">{g.home.abbr}</small>} />)}
            </div>
            <p className="tm-note">Both teams ranked on the same published metric (#1 = best). The {navSport(d.slug)?.label ?? d.sport} publication does not pair offenses with opposing defenses.</p>
          </>
        ) : <None>{loading ? 'Reading this game’s research…' : d.eventId ? `The ${navSport(d.slug)?.label ?? d.sport} publication carries no ranked matchup rows for this game.` : 'This finding is about a publication, not a game.'}</None>)}
      </div>
    </FxCard>
  );
}

export function ProjectionPanel({ d, r }: { d: Discovery; r: EventResearchDoc | null }) {
  const n = useMemo(() => heroNumbers(r), [r]);
  const env = useMemo(() => gameEnvironment(r), [r]);
  const [view, setView] = useState<'total' | 'margin'>('total');
  const p = d.opportunity?.price;
  const hasTotal = n?.modelTotal != null || n?.marketTotal != null;
  const hasSpread = n?.modelSpread != null || n?.marketSpread != null;
  const v = view === 'margin' && hasSpread ? 'margin' : hasTotal ? 'total' : hasSpread ? 'margin' : 'total';
  const model = v === 'total' ? n?.modelTotal ?? null : n?.modelSpread != null ? -n.modelSpread : null;
  const market = v === 'total' ? n?.marketTotal ?? null : n?.marketSpread != null ? -n.marketSpread : null;
  const s = v === 'total' ? env?.total ?? null : env?.homeMargin ?? null;
  const fmt = (x: number) => (v === 'total' ? x.toFixed(1) : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`);
  const tick = (x: number) => (v === 'total' ? String(Math.round(x)) : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x))}`);
  return (
    <FxCard title="Projection vs market" icon="chart" id="tm-pm" className="tm-p tm-p--pm">
      {p && (p.ask != null || p.fair != null) && (
        <div className="tm-pm__contract">
          <span className="tm-pm__ck">{betPhrase(d.opportunity!.what.side, d.opportunity!.what.title).text}</span>
          <dl className="tm-trio">
            <div><dt>Publication fair</dt><dd className="fx-num fx-num--md">{pct(p.fair)}</dd></div>
            <div><dt>Executable ask</dt><dd className="fx-num fx-num--md tm-gold">{cents(p.ask)}</dd></div>
            <div><dt>After-fee gap</dt><dd className={`fx-num fx-num--md ${p.evPerContract == null ? '' : p.evPerContract > 0 ? 'tm-pos' : 'tm-neg'}`}>{p.evPerContract == null ? '—' : `${signed(p.evPerContract * 100)}¢`}</dd></div>
          </dl>
          <PriceScale d={d} />
        </div>
      )}
      {n && (hasTotal || hasSpread) ? (
        <>
          {hasTotal && hasSpread && (
            <div className="tm-seg" role="group" aria-label="Quantity">
              <button type="button" className={v === 'total' ? 'is-on' : undefined} aria-pressed={v === 'total'} onClick={() => setView('total')}>Game total</button>
              <button type="button" className={v === 'margin' ? 'is-on' : undefined} aria-pressed={v === 'margin'} onClick={() => setView('margin')}>{n.home.abbr} margin</button>
            </div>
          )}
          <dl className="tm-trio">
            <div><dt>Model projection</dt><dd className="fx-num fx-num--lg">{model == null ? '—' : fmt(model)}</dd></div>
            <div><dt>Market</dt><dd className="fx-num fx-num--lg">{market == null ? '—' : fmt(market)}</dd></div>
            <div><dt>Difference</dt><dd className={`fx-num fx-num--lg ${model != null && market != null ? (model - market > 0 ? 'tm-pos' : model - market < 0 ? 'tm-neg' : '') : ''}`}>{model != null && market != null ? signed(model - market) : '—'}</dd></div>
          </dl>
          {s ? <RangeChart s={s} label={v === 'total' ? 'Game total' : `${n.home.abbr} final margin`} format={fmt} tickFormat={tick} markers={[...(model != null ? [{ value: model, label: 'Model', tone: 'model' as const }] : []), ...(market != null ? [{ value: market, label: 'Market', tone: 'market' as const }] : [])]} /> : <None>No simulated range is published for this game.</None>}
          <p className="tm-note">{v === 'margin' ? `Home margin (${n.home.abbr} points minus ${n.away.abbr}); ${spreadText(n.modelSpread, n) ?? ''} model, ${spreadText(n.marketSpread, n) ?? '—'} market. ` : ''}Model{n.modelVersion ? ` ${n.modelVersion}` : ''} is research-only{n.caveat ? `: ${n.caveat}` : '.'} Market = {n.marketBasis?.toLowerCase() ?? 'not published'}.{env?.centre.source ? ' The simulation is run around the market-implied centre.' : ''}</p>
        </>
      ) : !p ? <None>{d.eventId ? 'This game’s publication carries no model projection beside the market.' : 'No game projection: this finding is about a publication, not a game.'}</None> : null}
    </FxCard>
  );
}

/** Ask, break-even, the publication's fair and bet-up-to on one 0–100¢ scale (src/opportunity layer figures). */
function PriceScale({ d }: { d: Discovery }) {
  const p = d.opportunity?.price;
  if (!p) return null;
  const w = (v: number | null | undefined) => (v == null ? null : Math.max(0, Math.min(100, v * 100)));
  const marks = [
    { k: 'Ask', v: p.ask, cls: 'ask' },
    { k: 'Break-even', v: p.breakEven, cls: 'be' },
    { k: 'Fair', v: p.fair, cls: 'fair' },
    { k: 'Bet up to', v: p.betUpTo, cls: 'bu' },
  ].filter((m) => m.v != null);
  return (
    <>
      <div className="pladder" role="img" aria-label={marks.map((m) => `${m.k} ${Math.round((m.v as number) * 100)} cents`).join(', ')}>
        <div className="pladder__track" />
        {p.fairLow != null && p.fairHigh != null && <div className="pladder__band" style={{ left: `${w(p.fairLow)}%`, width: `${w(p.fairHigh)! - w(p.fairLow)!}%` }} />}
        {marks.map((m) => <span key={m.k} className={`pladder__m pladder__m--${m.cls}`} style={{ left: `${w(m.v)}%` }}><i /><b>{Math.round((m.v as number) * 100)}¢</b></span>)}
      </div>
      <ul className="pladder__key">{marks.map((m) => <li key={m.k} className={`pladder__k--${m.cls}`}>{m.k}</li>)}</ul>
    </>
  );
}

export function ScriptsPanel({ d, r, loading }: { d: Discovery; r: EventResearchDoc | null; loading: boolean }) {
  const set = useMemo(() => (r && d.sport === 'NFL' ? gameScripts(r) : null), [r, d.sport]);
  const eng = useMemo(() => (r && d.sport === 'CFB' ? readEngine(r) : null), [r, d.sport]);
  const engine = isEngine(eng) ? eng : null;
  const max = set ? Math.max(...set.scripts.map((s) => s.share), 0.01) : 1;
  return (
    <FxCard title={d.sport === 'CFB' ? 'Game scripts (ranked evidence)' : 'Game scripts (simulation)'} icon="layers" id="tm-sc" className="tm-p tm-p--sc" action={d.eventId && (set || engine) ? { to: routes.game(d.slug, d.eventId, { tab: 'script' }), label: 'Open' } : undefined}>
      {set ? (
        <>
          <ul className="tm-sc">
            {set.scripts.map((s) => (
              <li key={s.id} className={`tm-sc__row tm-sc__row--s${s.index}`}>
                <span className="tm-sc__n">{s.name}</span>
                <span className="tm-sc__bar" aria-hidden="true"><i style={{ width: `${(s.share / max) * 100}%` }} /></span>
                <b className="fx-num tm-sc__v">{sharePct(s.share)}</b>
                <span className="tm-sc__l">{s.line}</span>
              </li>
            ))}
          </ul>
          <p className="tm-note">Share of the publication’s simulated games ending each way — the simulator’s own distribution, not a calibrated probability.</p>
        </>
      ) : engine ? (
        <>
          <ol className="tm-sc tm-sc--ranked">
            {[...engine.scripts].sort((a, b) => a.rank - b.rank).slice(0, 4).map((s) => (
              <li key={s.script_id} className={`tm-sc__row tm-sc__row--s${ROLE_INDEX[s.role]}`}>
                <span className="tm-sc__rank fx-num">{s.rank}</span>
                <span className="tm-sc__n">{scriptTitle(s)}</span>
                <span className={`tm-role tm-role--${s.role.toLowerCase()}`}>{ROLE_WORD[s.role]}</span>
                <span className="tm-sc__l">{s.summary}</span>
              </li>
            ))}
          </ol>
          <p className="tm-note">Ranked by the CFB Script Engine’s football evidence. A rank is not a probability, and no script carries a price.</p>
        </>
      ) : (
        <None>{loading ? 'Reading this game’s research…' : d.eventId ? `The ${navSport(d.slug)?.label ?? d.sport} publication carries no game scripts for this game.` : 'Scripts belong to games; this finding is about a publication.'}</None>
      )}
    </FxCard>
  );
}

interface MarketRow { key: string; label: string; ask: number | null; fair: number | null; fairNote: string; call: ReactNode; at: string | null; href: string | null; selected: boolean }

export function MarketsPanel({ d, r, opps, quote, now }: { d: Discovery; r: EventResearchDoc | null; opps: Opportunity[]; quote: (t: string) => LiveQuote | undefined; now: number }) {
  const g = useMemo(() => (r ? gameSides(r) : null), [r]);
  const rows: MarketRow[] = useMemo(() => {
    const out: MarketRow[] = opps.slice(0, 6).map((o) => {
      const dec = decisionOf(o.status, o.confidence.calibration);
      return { key: o.id, label: betPhrase(o.what.side, o.what.title).text, ask: o.price.ask, fair: o.price.fair, fairNote: 'Publication', call: <span className={`dword dword--${dec.tone}`}>{dec.word}</span>, at: o.price.observedAt, href: o.href, selected: o.id === d.opportunity?.id };
    });
    const seen = new Set(opps.map((o) => o.ticker));
    for (const m of mainLines(r)) {
      if (seen.has(m.kalshi_ticker) || out.length >= 8) continue;
      const q = quote(m.kalshi_ticker);
      const label = describeMarket(m, { sport: d.sport, abbrOf: (pid) => (g?.byPid(pid)?.abbr ?? null) }).title;
      out.push({ key: m.market_id, label, ask: q?.yesAsk ?? m.yes_ask, fair: researchFair(r, m.market_id), fairNote: 'Research only', call: <span className="muted small">Not a candidate</span>, at: q?.observedAt ?? m.captured_at, href: d.eventId ? routes.game(d.slug, d.eventId, { tab: 'markets' }) : null, selected: false });
    }
    return out;
  }, [opps, r, quote, d, g]);
  return (
    <FxCard title="Relevant markets" icon="chart" id="tm-mk" className="tm-p tm-p--mk" action={d.eventId ? { to: routes.game(d.slug, d.eventId, { tab: 'markets' }), label: 'All markets' } : undefined}>
      {rows.length ? (
        <div className="tm-tw" role="region" aria-label="Relevant markets table" tabIndex={0}>
          <table className="tm-t">
            <thead><tr><th scope="col">Market</th><th scope="col">YES ask</th><th scope="col">Model fair</th><th scope="col">Publication call</th><th scope="col">Quote</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className={x.selected ? 'is-sel' : undefined}>
                  <th scope="row">{x.href ? <Link to={x.href}>{x.label}</Link> : x.label}</th>
                  <td className="fx-num tm-gold">{cents(x.ask)}</td>
                  <td><span className="fx-num">{pct(x.fair)}</span>{x.fair != null && <small className="tm-t__sub">{x.fairNote}</small>}</td>
                  <td>{x.call}</td>
                  <td><Freshness at={x.at} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <None>{d.eventId ? 'No priced contracts are published for this game.' : 'No market: this finding is about a publication.'}</None>}
      <p className="tm-note">Asks are the latest quote Sift holds (live where the relay answers, else the publication’s capture), with its age. “Publication call” is the publication’s own word; a research-only fair price is never a recommendation.</p>
    </FxCard>
  );
}

export function ContextPanel({ d, r, spec }: { d: Discovery; r: EventResearchDoc | null; spec: HeroSpec | null }) {
  const items = useMemo(() => {
    const out: { tone: 'risk' | 'info' | 'good'; text: string }[] = [];
    if (d.risk) out.push({ tone: 'risk', text: d.risk });
    for (const e of d.opportunity?.evidence.slice(0, 2) ?? []) out.push({ tone: 'good', text: e });
    if (r) {
      const g = gameSides(r);
      const rows = injuryRows(r);
      const inj = g ? [...notableInjuries(rows, g.away.abbr, 2), ...notableInjuries(rows, g.home.abbr, 2)] : rows.slice(0, 4);
      for (const i of inj) out.push({ tone: i.status === 'OUT' || i.status === 'DOUBTFUL' ? 'risk' : 'info', text: `${i.player}${i.position ? ` (${i.position}${i.team ? `, ${i.team}` : ''})` : ''}: ${i.status.toLowerCase()}` });
      const wx = gameWeather(r, spec?.venue ?? null);
      const line = weatherLine(wx);
      if (line) out.push({ tone: wx.flag ? 'risk' : 'info', text: `${spec?.venue?.name ? `${spec.venue.name}: ` : ''}${line}${wx.kind === 'outdoor' ? ' (context, not in the projection)' : ''}` });
      const cav = heroNumbers(r)?.caveat;
      if (cav) out.push({ tone: 'risk', text: `Model caveat: ${cav}` });
    }
    if (d.observedAt) out.push({ tone: 'info', text: `Research observed ${ago(d.observedAt)} (${d.source}).` });
    return out.slice(0, 8);
  }, [d, r, spec]);
  return (
    <FxCard title="Context & risks" icon="flame" id="tm-cx" className="tm-p tm-p--cx">
      {items.length ? (
        <ul className="tm-cx">{items.map((x, i) => <li key={i} className={`tm-cx__i tm-cx__i--${x.tone}`}><span className="tm-cx__dot" aria-hidden="true">{x.tone === 'good' ? '+' : x.tone === 'risk' ? '!' : 'i'}</span><span><span className="sr-only">{x.tone === 'good' ? 'Supporting: ' : x.tone === 'risk' ? 'Risk: ' : 'Context: '}</span>{x.text}</span></li>)}</ul>
      ) : <None>No published context for this finding.</None>}
    </FxCard>
  );
}

export function EvidencePanel({ d }: { d: Discovery }) {
  const c = d.opportunity?.confidence;
  return (
    <FxCard title="Model evidence & method" icon="shield" id="tm-ev" className="tm-p tm-p--ev" action={{ to: routes.pulse(d.slug), label: `${navSport(d.slug)?.label ?? d.sport} in Model Pulse` }}>
      {c ? (
        <>
          <p className="tm-lead">{c.calibration === 'MARKET_BEATS_MODEL' ? 'The market has the better settled record for this model.' : c.calibration === 'VALIDATED' ? 'Validated by its publication.' : c.calibration === 'RESEARCH' ? 'Research model: calibration published, not promoted.' : 'No settled record published yet.'}</p>
          {c.record && <p className={`tm-note${c.record.adverse ? ' tm-neg' : ''}`}>Track record: {c.record.line}</p>}
          {c.note && <p className="tm-note">{c.note}</p>}
        </>
      ) : <p className="tm-lead">A matchup or data finding carries no model price, so there is no model record to weigh.</p>}
      <dl className="tm-facts">{d.facts.slice(0, 6).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      <p className="tm-note">{d.method}</p>
    </FxCard>
  );
}

export function SamePanel({ d, all, onSelect }: { d: Discovery; all: Discovery[]; onSelect: (id: string) => void }) {
  const same = all.filter((x) => x.eventId && x.eventId === d.eventId && x.id !== d.id).slice(0, 6);
  return (
    <FxCard title="More on this game" icon="layers" id="tm-sg" className="tm-p tm-p--sg">
      {same.length ? (
        <ul className="tm-sg">{same.map((x) => <li key={x.id}><button type="button" className="tm-sg__b" onClick={() => onSelect(x.id)}><KindChip d={x} /><span>{x.title}</span><Importance sig={x.significance} compact /></button></li>)}</ul>
      ) : <None>No other discovery on this game today.</None>}
    </FxCard>
  );
}

export function ComparePanel({ d, opps }: { d: Discovery; opps: Opportunity[] }) {
  if (!d.opportunity || opps.length < 2) return null;
  return <div className="tm-p tm-p--cmp"><MarketCompare key={d.id} opps={opps} title="Compare expressions on this game" /></div>;
}
