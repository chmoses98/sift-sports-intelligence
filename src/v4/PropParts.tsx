// Parts shared by the v4 player detail and the prop research sheet: how the one projection was selected, the range
// bar, the model-versus-market difference, and the source list. Each says only what the published row says.
import { useState } from 'react';
import { Icon } from './Icon';
import { fmtValue, type PropRow } from '../insights/propBoard';
import { RELIABILITY_WORDS } from '../lib/projectionAuthority';
import { propAuthority } from '../views/props/ranking';
import { fmtWhen } from '../lib/projections';
import { formatQuoteAgo, quoteAgeMs } from '../live/freshness';
import type { Difference, Relation, RungView } from './propsModel';
import type { SignalMatch } from './signal';

/** How the projection for this stat was chosen, and what travels with it. A promoted stat that is withheld shows its reason and no number from either model. */
export function ProjectionStatus({ row }: { row: PropRow }) {
  const s = row.projectionStatus;
  if (s.kind === 'withheld') return <p className="v4-pstat v4-pstat--warn"><b>Projection withheld.</b> {s.reason}. No number from either model is shown.</p>;
  if (s.kind === 'fallback') return <p className="v4-pstat v4-pstat--warn"><b>Established projection.</b> Shown because {s.reason}. It passed its own freshness, availability and quality checks, and is shown alone.</p>;
  if (s.kind === 'legacy') return <p className="v4-pstat">{row.projection == null ? 'No simulation row for this player and stat this week.' : <><b>Established simulation.</b> The NFL publication's own simulation is the approved projection for this stat. Research only.</>}</p>;
  const v = s.value;
  const when = fmtWhen(v.updatedAt);
  return (
    <div className={`v4-pstat${v.reliability === 'HIGH' ? '' : ' v4-pstat--warn'}`}>
      <p><b>{RELIABILITY_WORDS[v.reliability]}.</b>{v.reliabilityWhy.length > 0 && <> {v.reliabilityWhy.slice(0, 2).join('. ')}.</>} Reliability describes data quality, not betting value.</p>
      {v.availability && <p className="v4-pstat__m">{v.availability.words}{v.availability.source && v.availability.status !== 'UNVERIFIED' ? ` (${v.availability.source})` : ''}</p>}
      <p className="v4-pstat__m">Updated {when ?? 'at an unknown time'}{v.opponentFactor && Math.abs(v.opponentFactor.factor - 1) >= 0.01 ? ` · opponent-adjusted ×${v.opponentFactor.factor.toFixed(2)}${v.opponentFactor.sampleGames != null ? ` over ${v.opponentFactor.sampleGames} games` : ''}` : ''}</p>
      {v.adjustments.length > 0 && <p className="v4-pstat__m">{v.adjustments.slice(0, 3).join(' · ')}</p>}
    </div>
  );
}

/** Where the projection and its published range sit against the line. No bell curve is fitted: the bar draws the published quantiles only. */
export function RangeBar({ row }: { row: PropRow }) {
  const fmt = (v: number) => fmtValue(v, row.def).replace(/ \S+$/, '');
  const full = row.range?.full ?? (row.predictionRange ? ([row.predictionRange.lo, row.predictionRange.hi] as [number, number]) : null);
  if (!full || row.projection == null) return null;
  const typical = row.range?.typical ?? null;
  const vals = [full[0], full[1], row.projection, ...(row.line != null ? [row.line] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  const a = lo - pad, b = hi + pad;
  const x = (v: number) => `${((v - a) / (b - a)) * 100}%`;
  const rangeLabel = row.range ? 'Middle 50% and 90% range' : '80% range';
  return (
    <figure className="v4-rbar" aria-label={`${row.name} ${row.def.label}: projected ${fmt(row.projection)}, ${rangeLabel} ${fmt(full[0])} to ${fmt(full[1])}${row.line != null ? `, Kalshi line ${row.line}` : ''}`}>
      <div className="v4-rbar__track" aria-hidden="true">
        <span className="v4-rbar__full" style={{ left: x(full[0]), width: `calc(${x(full[1])} - ${x(full[0])})` }} />
        {typical && <span className="v4-rbar__typ" style={{ left: x(typical[0]), width: `calc(${x(typical[1])} - ${x(typical[0])})` }} />}
        {row.line != null && <span className="v4-rbar__line" style={{ left: x(row.line) }} />}
        <span className="v4-rbar__proj" style={{ left: x(row.projection) }} />
      </div>
      <figcaption className="v4-rbar__cap">
        <span className="v4-rbar__k v4-rbar__k--model"><i />Projection <b className="num">{fmt(row.projection)}</b></span>
        {row.line != null && <span className="v4-rbar__k v4-rbar__k--mkt"><i />Kalshi line <b className="num">{row.line}</b></span>}
        <span className="v4-rbar__k">{rangeLabel} <b className="num">{typical ? `${fmt(typical[0])}–${fmt(typical[1])}` : ''}{typical ? ' · ' : ''}{fmt(full[0])}–{fmt(full[1])}</b></span>
      </figcaption>
    </figure>
  );
}

const sign = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
const plural = (n: number) => (Math.abs(n) === 1 ? '' : 's');

const RELATION_TAG: Record<Relation, string> = { below: 'Model below break-even', at: 'Model at break-even', above: 'Model above break-even' };

/** The one line a published signal's state adds, or null when there is nothing to add (no signal and no positive difference). */
function signalLine(sig: SignalMatch, above: boolean): { text: string; valid: boolean } | null {
  const none = above ? 'No published signal validates this difference.' : null;
  switch (sig.kind) {
    case 'valid': {
      const a = propAuthority(sig.opp.marketId, new Map([[sig.opp.marketId ?? '', sig.opp]]));
      return { text: `Published research signal for this exact contract and side: ${a.word.toLowerCase()}.`, valid: true };
    }
    case 'oppositeSide':
      return { text: `${none ? `${none} ` : ''}The publication's signal on this market is for ${sig.has === 'YES' ? 'the over (Yes)' : 'the under (No)'}, not this side.`, valid: false };
    case 'passed':
      return { text: `${none ? `${none} ` : ''}The publication reviewed this contract and passed: ${sig.opp.statusReason}`, valid: false };
    case 'ineligible':
      return { text: `${none ? `${none} ` : ''}A published signal names this contract and side but no longer qualifies: ${sig.why}`, valid: false };
    case 'watch':
      return { text: `${none ? `${none} ` : ''}The publication lists a game-level watch, not a priced signal for this contract.`, valid: false };
    default:
      return none ? { text: none, valid: false } : null;
  }
}

/**
 * The model-versus-market difference, said neutrally: the numbers first, then what (if anything) the publication
 * has published for this exact contract and side. No size of difference is labelled; the longer reading guide sits
 * behind a disclosure. Never coloured buy/sell.
 */
export function DifferenceNote({ d, view, onOpen }: { d: Difference; view: RungView | null; onOpen?: () => void }) {
  const [more, setMore] = useState(false);
  const sideWord = view?.side === 'under' ? 'under (No)' : 'over (Yes)';
  if (d.kind !== 'compared') {
    const tag = d.kind === 'stale' ? 'Price not current' : d.kind === 'noProjection' ? 'No projection to compare' : 'No price to compare';
    const sig = signalLine(d.signal, false);
    return (
      <div className="v4-diff v4-diff--plain">
        <span className="v4-diff__tag">{tag}</span>
        <p>{d.kind === 'stale' ? `${d.why} A stale price is shown for context and is not compared with the model.` : d.why}</p>
        {sig && <p className="v4-diff__s">{sig.text}</p>}
      </div>
    );
  }
  const be = view?.breakEven != null ? `${Math.round(view.breakEven * 100)}%` : '—';
  const model = view?.model != null ? `${Math.round(view.model * 100)}%` : '—';
  const line = signalLine(d.signal, d.relation === 'above');
  const valid = !!line?.valid;
  return (
    <div className={`v4-diff v4-diff--${valid ? 'signal' : 'plain'}`}>
      <span className="v4-diff__tag">{valid && <Icon name="pulse" size="xs" />}{RELATION_TAG[d.relation]}</span>
      <p className="v4-diff__n">Model <b className="num">{model}</b> vs break-even <b className="num">{be}</b> after fee for the {sideWord}: <b className="num">{sign(d.points)}</b> point{plural(d.points)}.</p>
      {line && <p className="v4-diff__s">{line.text}</p>}
      <button type="button" className="v4-diff__more" aria-expanded={more} onClick={() => setMore((m) => !m)}>How to read this<Icon name={more ? 'caret-up' : 'caret-down'} size="xs" /></button>
      {more && (
        <div className="v4-diff__d">
          <p>Break-even is the Kalshi ask plus its taker fee: the probability this side needs to return its cost. The difference is the model's probability for the same side minus that figure, in percentage points, shown only for a current price.</p>
          <p>No size of difference is treated as meaningful on its own. A difference carries more weight only where the publication supports it with its own uncertainty or calibration evidence, which appears in the published research signal when one exists for this exact contract and side.</p>
          <p>This is research, not a recommendation to buy or avoid either side.</p>
        </div>
      )}
      {onOpen && <button type="button" className="v4-textlink" onClick={onOpen}>Open research details</button>}
    </div>
  );
}

/** What each figure on the page came from and when. */
export function SourceList({ row, researchAt, kickoff, quoteAt, frozen, now }: { row: PropRow; researchAt: string | null; kickoff: string; quoteAt: string | null; frozen: boolean; now: number }) {
  const s = row.projectionStatus;
  const proj = s.kind === 'authoritative' ? `SIFT projection feed (${s.value.modelVersion}), data as of ${fmtWhen(s.value.updatedAt) ?? 'an unknown time'}`
    : s.kind === 'fallback' ? 'The established NFL simulation, under an explicit approved fallback'
    : s.kind === 'withheld' ? 'No projection: withheld by the quality checks'
    : row.projection != null ? "The NFL publication's own simulation" : 'No projection published';
  return (
    <dl className="v4-src">
      <div><dt>Projection</dt><dd>{proj}</dd></div>
      <div><dt>Research document</dt><dd>{researchAt ? `Published ${fmtWhen(researchAt)} (${formatQuoteAgo(quoteAgeMs(researchAt, now))})` : 'Publish time not stated'}{frozen ? ' · frozen at kickoff' : ''}</dd></div>
      <div><dt>Kalshi prices</dt><dd>{quoteAt ? `Captured ${fmtWhen(quoteAt)} (${formatQuoteAgo(quoteAgeMs(quoteAt, now))})` : 'No capture time published'}{row.main ? ' · live quote where newer' : ''}</dd></div>
      <div><dt>Matchup ranks</dt><dd>Opponent-adjusted league ranks from the game's research document</dd></div>
      <div><dt>Fee</dt><dd>Kalshi's taker fee schedule, added to the ask for the break-even</dd></div>
      <div><dt>Kickoff</dt><dd>{fmtWhen(kickoff) ?? kickoff}</dd></div>
    </dl>
  );
}
