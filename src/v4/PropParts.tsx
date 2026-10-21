// Parts shared by the v4 player detail and the prop research sheet: how the one projection was selected, the range
// bar, the model-versus-market difference, and the source list. Each says only what the published row says.
import { Icon } from './Icon';
import { fmtValue, type PropRow } from '../insights/propBoard';
import { RELIABILITY_WORDS } from '../lib/projectionAuthority';
import { fmtWhen } from '../lib/projections';
import { formatQuoteAgo, quoteAgeMs } from '../live/freshness';
import type { Difference, RungView } from './propsModel';

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

/** The model-versus-market difference, said in words. Never coloured buy/sell; a gap is an investigated signal only when the publication holds one for that contract. */
export function DifferenceNote({ d, view, onOpen }: { d: Difference; view: RungView | null; onOpen?: () => void }) {
  const side = view?.side === 'under' ? 'under' : 'over';
  const be = view?.breakEven != null ? `${Math.round(view.breakEven * 100)}%` : null;
  const model = view?.model != null ? `${Math.round(view.model * 100)}%` : null;
  let tag: string, tone: 'signal' | 'unexplained' | 'plain', text: string;
  switch (d.kind) {
    case 'signal':
      tag = 'Investigated research signal'; tone = 'signal';
      text = `The publication flagged this contract for research review (${d.authority.word.toLowerCase()}). The model's ${model} for the ${side} is ${Math.abs(d.points)} point${Math.abs(d.points) === 1 ? '' : 's'} ${d.points > 0 ? 'above' : 'below'} the ${be} the ${side} needs to break even after Kalshi's fee.`;
      break;
    case 'unexplained':
      tag = 'Unexplained difference'; tone = 'unexplained';
      text = `The model's ${model} for the ${side} is ${Math.abs(d.points)} point${Math.abs(d.points) === 1 ? '' : 's'} ${d.points > 0 ? 'above' : 'below'} the ${be} the ${side} needs to break even after Kalshi's fee. The publication has not investigated or flagged this contract, so this is a question for research, not a finding.`;
      break;
    case 'close':
      tag = 'Model and market are close'; tone = 'plain';
      text = `Within ${Math.abs(d.points) || 0} point${Math.abs(d.points) === 1 ? '' : 's'} of the break-even after fee (${sign(d.points)} points).`;
      break;
    case 'stale':
      tag = 'Price not current'; tone = 'plain'; text = `${d.why} A stale price is shown for context and is not compared with the model.`;
      break;
    case 'noProjection':
      tag = 'No projection to compare'; tone = 'plain'; text = d.why;
      break;
    default:
      tag = 'No price to compare'; tone = 'plain'; text = d.why;
  }
  return (
    <div className={`v4-diff v4-diff--${tone}`}>
      <span className="v4-diff__tag">{tone === 'signal' && <Icon name="pulse" size="xs" />}{tag}</span>
      <p>{text}</p>
      {onOpen && (d.kind === 'signal' || d.kind === 'unexplained' || d.kind === 'close') && <button type="button" className="v4-textlink" onClick={onOpen}>Open research details</button>}
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
