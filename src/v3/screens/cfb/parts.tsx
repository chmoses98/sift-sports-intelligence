// Small shared pieces of the Script Engine views (Overview, Game Script, Matchup). Presentational: every value arrives already derived from the payload.
import type { ReactNode } from 'react';
import { LABEL_HELP, LABEL_WORD, orderedLabels, type Engine } from '../../../lib/scriptEngine';
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
