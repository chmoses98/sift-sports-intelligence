// Small shared pieces of the Script Engine views (Overview, Game Script, Matchup). Presentational: every value arrives already derived from the payload.
import type { ReactNode } from 'react';
import { LABEL_HELP, LABEL_WORD, orderedLabels, type Engine } from '../../../lib/scriptEngine';
import type { SideQuote } from '../../data/research/scriptPrices';
import { PriceTap } from '../../nav/Targets';
import { CONFIDENCE_WORD, type ScriptFit } from '../../model/scriptRead';
import { Icon } from '../../ui/Icon';
import './cfb.css';

export function ConfChip({ level }: { level: string }) {
  return <span className={`cs-conf cs-conf--${level.toLowerCase()}`}>{CONFIDENCE_WORD[level] ?? `${level} data confidence`}</span>;
}

/** "Research only": no validated CFB pricing source exists, so nothing here is a fair price or an expected value. */
export const ResearchOnly = () => <span className="cs-ro">Research only</span>;

/** The engine's fit labels (Best expression, Multi-script, Scoring: research only …), never a price verdict. */
export function LabelChips({ labels }: { labels: string[] }) {
  const list = orderedLabels(labels).filter((l) => l !== 'RESEARCH_ONLY');
  if (!list.length) return null;
  return <span className="cs-lbls">{list.map((l) => <span key={l} className={`cs-lbl cs-lbl--${l.toLowerCase()}`} title={LABEL_HELP[l]}>{LABEL_WORD[l] ?? l}</span>)}</span>;
}

/** One cell per script in the engine's order, coloured by how that script relates to the contract side (supported, partly, contradicted, no claim). */
export function FitCells({ fits, label }: { fits: ScriptFit[]; label: string }) {
  return (
    <span className="cs-fit" role="img" aria-label={label}>
      {fits.map((f) => <span key={f.script.script_id} className={`cs-fc cs-fc--${f.compat === 'SUPPORTED' ? 'yes' : f.compat === 'PARTIAL' ? 'part' : f.compat === 'CONTRADICTED' ? 'no' : 'none'} cs-fc--s${f.tone}`} title={`${f.role} (${f.title}) ${f.word} this`} />)}
    </span>
  );
}

/** A finding the engine cites: its label, with the engine's own sentence one tap down. */
export function FindingNote({ label, statement, strength }: { label: string; statement: string; strength?: 'MODERATE' | 'STRONG' }) {
  return (
    <details className="cs-fn">
      <summary><span>{label}</span>{strength && <i className={`cs-str cs-str--${strength.toLowerCase()}`}>{strength === 'STRONG' ? 'Strong' : 'Moderate'}</i>}<Icon name="chevD" size={16} /></summary>
      <p>{statement}</p>
    </details>
  );
}

export function Section({ id, title, sub, right, children, testid }: { id: string; title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="x-card cs-sec" aria-labelledby={id} data-testid={testid}>
      <div className="cs-sh"><h2 id={id}>{title}</h2>{right}</div>
      {sub && <p className="cs-sub">{sub}</p>}
      {children}
    </section>
  );
}

/** Says, once, whether the detailed matchup research is on the page (a trimmed event restores it from its verified sidecar after first paint). */
export function DetailNotice({ engine }: { engine: Engine }) {
  const d = engine.detail;
  if (d.state === 'inline' || d.state === 'recovered' || !d.gaps.length) return null;
  const matchup = d.gaps.includes('matchup');
  if (d.state === 'loading') return <p className="cs-notice" role="status" data-testid="cs-detail-loading">{matchup ? 'Loading the detailed matchup research (opponent-adjusted metric tables and ranks).' : 'Loading the full script-to-market map.'}</p>;
  return (
    <p className="cs-notice cs-notice--warn" role="status" data-testid="cs-detail-unavailable">
      <b>{matchup ? 'Detailed matchup metrics unavailable.' : 'The full script-to-market map is unavailable.'}</b> {d.reason ? `${d.reason.charAt(0).toUpperCase()}${d.reason.slice(1)}. ` : ''}The SIFT Read, the scripts, the {engine.findings.length} matchup findings and the contracts shown are the publication’s own and unaffected.
    </p>
  );
}

/** The script's role as a colour-coded chip; the role's name is always in the text, colour is never the only signal. */
export function RoleChip({ role, tone }: { role: string; tone: 1 | 2 | 3 | 4 }) {
  return <span className={`cs-rolechip cs-rolechip--s${tone}`}><i aria-hidden="true" />{role}</span>;
}

/**
 * A contract side's price as a tap on the exact-contract sheet: "YES 57¢" / "NO 43¢". When no current quote passes the gate it prints a dash and the gate's own
 * reason ("Price 6 h old", "No ask listed", "Market closed") goes in the label and in `PriceWhy` beside it, so a withheld price always says why.
 */
export function SidePriceTap({ ticker, side, q, label, hasMarket }: { ticker: string; side: 'YES' | 'NO'; q: SideQuote; label: string; hasMarket: boolean }) {
  const body = <><small>{side}</small><b className="num">{q.ask != null ? `${q.ask}¢` : '—'}</b></>;
  if (!hasMarket) return <span className="cs-px is-none" aria-label={`${label}: no contract listed`}>{body}</span>;
  return <PriceTap ticker={ticker} className={`cs-px${q.ask == null ? ' is-none' : ''}`} label={`${label}: ${side} ask ${q.ask != null ? `${q.ask} cents` : `unavailable${q.why ? `, ${q.why.short}` : ''}`}. Open exact contract`}>{body}</PriceTap>;
}

/** Says why a price is withheld, in the quote gate's words. Renders nothing when the price is shown. */
export function PriceWhy({ q, full = false }: { q: SideQuote; full?: boolean }) {
  if (q.ask != null || !q.why) return null;
  if (!full) return <p className="cs-pxwhy cs-pxwhy--s" data-testid="cfb-price-why"><Icon name="info" size={14} /><span>{q.why.short}: no price shown</span></p>;
  return <p className="cs-pxwhy" role="note" data-testid="cfb-price-why-full"><Icon name="info" size={14} /><span><b>{q.why.short}.</b> {q.why.detail}</span></p>;
}

/** Matchup statistics as lines: team and unit, the metric, its value labelled adjusted or raw, the rank among FBS. */
export function EvidenceList({ lines }: { lines: { ref: string; team: string; unit: string; name: string; value: string; basis: 'adjusted' | 'raw'; rank: string | null; games: number; caution: string | null }[] }) {
  if (!lines.length) return null;
  return (
    <ul className="cs-ev">
      {lines.map((l) => (
        <li key={l.ref}>
          <span>{l.team} {l.unit} · {l.name}</span>
          <b className="num">{l.value}</b>
          <small><i className={`cs-basis cs-basis--${l.basis}`}>{l.basis === 'adjusted' ? 'adjusted' : 'raw'}</i>{l.rank ? ` ${l.rank}` : ' unranked'} · {l.games} games{l.caution ? ` · ${l.caution}` : ''}</small>
        </li>
      ))}
    </ul>
  );
}
