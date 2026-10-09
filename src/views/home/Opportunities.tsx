// How an opportunity is shown, everywhere: the same card on the global home and on each sport home. WHAT (the exact
// contract and side) → WHY (one plain sentence) → PRICE (ask, break-even, fair, bet-up-to, age) → CONFIDENCE (the
// publication's authority and record) → RISK (what beats it) → the evidence and related expressions one tap below.
// A sport with nothing that qualifies gets a PASS card with the precise missing prerequisite.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { navSport } from '../../data/nav';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import { PRICE_STATE_WORD } from '../../opportunity/pricing';
import type { Featured } from '../../opportunity/rank';
import type { Opportunity, SportVerdict } from '../../opportunity/types';
import { Pill } from '../shared/kit';
import '../../styles/opportunity.css';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pts = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)} pts`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS_WORD: Record<Opportunity['status'], string> = { ACTIONABLE: 'Actionable', RESEARCH_CANDIDATE: 'Research candidate', WATCH: 'Watch', PASS: 'Pass' };
const STATUS_TONE: Record<Opportunity['status'], 'ok' | 'research' | 'warn' | 'neutral'> = { ACTIONABLE: 'ok', RESEARCH_CANDIDATE: 'research', WATCH: 'warn', PASS: 'neutral' };
const CAL_WORD: Record<Opportunity['confidence']['calibration'], string> = { VALIDATED: 'Validated', RESEARCH: 'Research model', MARKET_BEATS_MODEL: 'Market beats model', UNVALIDATED: 'Unvalidated' };

export function StatusPill({ o }: { o: Opportunity }) {
  return <Pill tone={STATUS_TONE[o.status]} title={o.statusReason}>{STATUS_WORD[o.status]}</Pill>;
}

/** The price line: the side's ask with its age, the break-even, the fair probability and the publication's bet-up-to. */
export function PriceLine({ o, now }: { o: Opportunity; now: number }) {
  const p = o.price;
  const age = quoteAgeMs(p.observedAt, now);
  return (
    <ul className="opp__nums">
      <li><span>{p.side} ask</span><b className="num">{cents(p.ask)}</b><small>{p.observedAt ? formatQuoteAgo(age) : 'no timestamp'}{p.source === 'recommendation' ? ' · at the research run' : p.source === 'live' ? ' · live' : ''}</small></li>
      <li><span>Break-even</span><b className="num">{cents(p.breakEven)}</b><small>{p.fee != null ? `ask + ${cents(p.fee)} fee${p.feeSource === 'kalshi-schedule' ? ' (Kalshi schedule)' : ''}` : 'no fee known'}</small></li>
      <li><span>Fair P({p.side})</span><b className="num">{pct(p.fair)}</b><small>{p.fairLow != null && p.fairHigh != null ? `${pct(p.fairLow)}–${pct(p.fairHigh)}` : o.authority.replace(/_/g, ' ').toLowerCase()}</small></li>
      <li><span>Edge after fee</span><b className="num">{pts(p.evPerContract)}</b><small>{p.evSource === 'publication' ? 'published' : p.evSource === 'derived' ? 'fair − break-even' : '—'}</small></li>
      <li><span>Bet up to</span><b className="num">{p.betUpTo != null ? cents(p.betUpTo) : 'not published'}</b><small>{p.betUpTo != null ? 'the publication’s limit' : 'Sift never derives one'}</small></li>
      {p.availableSize != null && <li><span>Size at ask</span><b className="num">{Math.round(p.availableSize).toLocaleString('en-US')}</b><small>contracts</small></li>}
    </ul>
  );
}

export function OpportunityCard({ f, now, showSport = true, compact }: { f: Featured; now: number; showSport?: boolean; compact?: boolean }) {
  const o = f.lead;
  const [open, setOpen] = useState(false);
  const nav = navSport(o.slug);
  return (
    <article className={`opp opp--${o.status.toLowerCase()}${compact ? ' opp--compact' : ''}`} aria-label={`${o.what.side} on ${o.what.title}, ${o.eventLabel}`}>
      <header className="opp__h">
        <span className="opp__eyebrow">
          {showSport && nav && <span className="opp__sport" style={{ ['--accent' as string]: nav.accent }}><SportMark slug={o.slug} icon={nav.icon} size={14} />{nav.label}</span>}
          <Link to={o.gameHref} className="opp__game">{o.eventLabel}</Link>
          <span className="opp__when">{when(o.startTime)}</span>
          {o.competition && <span className="opp__comp">{o.competition}</span>}
        </span>
        <span className="opp__chips"><StatusPill o={o} />{o.rank.tier === 2 && <Pill tone="ok" title={o.confidence.supportNote ?? ''}>robust</Pill>}{o.rank.tierWord === 'Model disagreement' && <Pill tone="warn" title={o.confidence.note}>market beats model</Pill>}{o.rank.highVariance && <Pill tone="warn" title="Settles on a single event; high variance">high variance</Pill>}</span>
      </header>
      <h3 className="opp__t"><Link to={o.href}><span className="opp__side">{o.what.side}</span> {o.what.title}</Link></h3>
      <p className="opp__why">{o.why}</p>
      <PriceLine o={o} now={now} />
      <p className={`opp__state opp__state--${o.price.state.toLowerCase()}`}>{PRICE_STATE_WORD[o.price.state]}{o.price.expiresAt ? ` · valid until ${new Date(o.price.expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''} · {CAL_WORD[o.confidence.calibration]}{o.confidence.supportNote ? ` · ${o.confidence.supportNote}` : ''}</p>
      {o.priceNote && <p className="opp__note opp__reprice">{o.priceNote}</p>}
      {f.conflicts.length > 0 && <p className="opp__conflict" role="note"><b>Opposite scenario:</b> this cannot win together with {f.conflicts.map((c) => `${c.what.side} ${c.what.title}`).join(' or ')}, also shown for this game. They rely on different game scripts; at most one can be right.</p>}
      {f.conflicts.length === 0 && f.sameGame.length > 0 && <p className="opp__note opp__same">Same game as {f.sameGame.length} other {f.sameGame.length === 1 ? 'card' : 'cards'} here: one exposure, not independent edges.</p>}
      {o.risk && <p className="opp__risk"><b>What beats it:</b> {o.risk}</p>}
      <button type="button" className="opp__more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Evidence'}{f.related.length ? ` · ${f.related.length} related` : ''}<Icon name="chevronDown" size={14} /></button>
      {open && (
        <div className="opp__deep">
          <ul className="opp__ev">{o.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
          <p className="opp__note">{o.confidence.note}</p>
          {Object.keys(o.confidence.inputs).length > 0 && <p className="opp__note">Inputs: {Object.entries(o.confidence.inputs).map(([k, v]) => `${k} ${v.toLowerCase()}`).join(' · ')}</p>}
          {o.alternatives.length > 0 && <ul className="opp__ev">{o.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>}
          {f.related.length > 0 && (
            <div className="opp__rel">
              <span className="opp__relh">Related expressions of the same thesis (not independent evidence)</span>
              <ul>{f.related.map((r) => <li key={r.id}><Link to={r.href}>{r.what.side} {r.what.title}</Link> <span className="muted">· {cents(r.price.ask)} · fair {pct(r.price.fair)} · {STATUS_WORD[r.status].toLowerCase()}</span>{f.opposed.includes(r.id) && <span className="opp__opposed"> · opposite outcome: cannot win with the lead</span>}</li>)}</ul>
            </div>
          )}
          <p className="opp__note">Status: {o.statusReason}</p>
          <Link to={o.gameHref} className="btn btn--sm btn--ghost">Open the research <Icon name="arrowRight" size={14} /></Link>
        </div>
      )}
    </article>
  );
}

/** The board's evidence levels, best first; a level with nothing in it is not shown. */
const LEVELS: { id: string; tiers: number[]; title: string; sub: string }[] = [
  { id: 'act', tiers: [1], title: 'Actionable', sub: 'The publication permits a bet, the price is current and within its bet-up-to.' },
  { id: 'res', tiers: [2, 3], title: 'Research candidates', sub: 'A research-only model prices these above the market after the fee. Worth reviewing; not validated bets.' },
  { id: 'sig', tiers: [4], title: 'Signals without a validated bet', sub: 'Matchup reads, and gaps from models whose own settled record loses to the market. Read them as research, not as edges.' },
];

function TierSections({ featured, now, showSport }: { featured: Featured[]; now: number; showSport: boolean }) {
  const levels = LEVELS.map((l) => ({ ...l, items: featured.filter((f) => l.tiers.includes(f.lead.rank.tier)) })).filter((l) => l.items.length);
  const strongest = levels[0]?.id;
  return (
    <>
      {strongest === 'sig' && <p className="oppboard__lede" role="note"><b>No validated or research-backed bet right now.</b> What follows are signals to read, not edges to take.</p>}
      {levels.map((l) => (
        <div key={l.id} className={`oppboard__lvl oppboard__lvl--${l.id}`} data-level={l.id}>
          {levels.length > 1 || l.id !== 'act' ? <h3 className="oppboard__lh">{l.title} <span className="oppboard__ln">{l.items.length}</span><small>{l.sub}</small></h3> : null}
          <div className="oppboard__grid">{l.items.map((f) => <OpportunityCard key={f.lead.id} f={f} now={now} showSport={showSport} />)}</div>
        </div>
      ))}
    </>
  );
}

/** A publication that reports itself STALE or DEGRADED says so, with its own market-capture clock, wherever its verdict shows. */
export function StaleNote({ v }: { v: SportVerdict }) {
  const st = (v.modelState ?? '').toUpperCase();
  if (!/STALE|DEGRADED|UNAVAILABLE|FAILED/.test(st)) return null;
  const age = v.marketCaptureAt ? formatQuoteAgo(quoteAgeMs(v.marketCaptureAt, Date.now())) : null;
  return <p className="opp__stale" role="note"><b>Publication {st.toLowerCase()}</b>{age ? `: markets last captured ${age}` : ''}. Its prices and statuses are as old as that capture; nothing here is a live read.</p>;
}

/** A sport with nothing to feature: the precise prerequisite that is missing, from the publication. */
export function PassCard({ v, children }: { v: SportVerdict; children?: ReactNode }) {
  const nav = navSport(v.slug);
  return (
    <article className="opp opp--pass opp--compact">
      <header className="opp__h">
        <span className="opp__eyebrow">{nav && <span className="opp__sport" style={{ ['--accent' as string]: nav.accent }}><SportMark slug={v.slug} icon={nav.icon} size={14} />{nav.label}</span>}<span className="opp__when">{v.games} {v.games === 1 ? 'game' : 'games'} listed</span></span>
        <span className="opp__chips"><Pill tone="neutral">Pass</Pill></span>
      </header>
      <p className="opp__why">{v.error ? `The ${nav?.label ?? v.label} board could not be read: ${v.error}` : v.passReason ?? 'Nothing qualifies.'}</p>
      <StaleNote v={v} />
      {children}
      <Link to={`/${v.slug}`} className="opp__more">Open {nav?.label ?? v.label}<Icon name="arrowRight" size={14} /></Link>
    </article>
  );
}

/** The grid of featured opportunities, then the sports that pass, then a one-line account of what was filtered out. */
export function OpportunityBoard({ featured, verdicts, now, loading, showSport = true, emptyText }: { featured: Featured[]; verdicts: SportVerdict[]; now: number; loading: boolean; showSport?: boolean; emptyText?: string }) {
  const passing = verdicts.filter((v) => v.loaded && v.opportunities === 0);
  const broken = verdicts.filter((v) => !v.loaded);
  return (
    <div className="oppboard">
      {featured.length > 0 && <TierSections featured={featured} now={now} showSport={showSport} />}
      {featured.length === 0 && !loading && (
        <div className="oppboard__none">
          <h3 className="oppboard__nt">No opportunity clears the bar right now.</h3>
          <p className="muted">{emptyText ?? 'Every publication Sift reads either recommends nothing, marks its candidates research-only and past their validity window, or prices nothing at all. A pass is a result, not a failure: the research below is still here to read.'}</p>
        </div>
      )}
      {(passing.length > 0 || broken.length > 0) && (
        <div className="oppboard__passes">
          {passing.map((v) => <PassCard key={v.slug} v={v} />)}
          {broken.map((v) => <PassCard key={v.slug} v={v} />)}
        </div>
      )}
    </div>
  );
}
