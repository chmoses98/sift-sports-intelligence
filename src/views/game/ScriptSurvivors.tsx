// Script graphics shared by every sport's script surfaces (owner items 16, 28, 29, 14):
//   SurvivorBoard   the contracts that survive the most scripts, at the TOP of a script or market view: "Survives 4 of 6
//                   scripts", with WHICH scripts as chips (the leading team's logo on a team script), the side's
//                   executable price and its age. Counts stay counts; a share of simulated games appears only where the
//                   publication publishes script shares.
//   ScriptShareChart the simulation's script distribution as an interactive chart: hover, focus or tap a script for its
//                   details; choosing one selects it (the caller deep-links it) and the linked markets highlight.
//   ExpressionList  every priced contract that expresses one script, by family, with price and freshness, and the
//                   families with nothing linked said plainly.
// Every number is the publication's or a stated arithmetic on it (a sum of published script shares).
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { FreshChip } from '../../components/fxResearch';
import { betPhrase } from '../../lib/betWords';
import '../../styles/lane-d-scripts.css';

export type Cell = 'yes' | 'part' | 'no' | null;

export interface BoardScript {
  id: string;
  name: string;
  /** Colour identity 1..7 (always shown beside the name, never the only encoding). */
  tone: number;
  /** Share of simulated games (0..1) when the publication publishes one; null for ranked-only scripts (CFB). */
  share: number | null;
  /** The team the script belongs to (its logo is shown), or null for a neutral script. */
  team: string | null;
}

export interface BoardItem {
  key: string;
  label: string;
  href: string | null;
  side: 'YES' | 'NO';
  ask: number | null;
  at: string | null;
  /** Per script, in `scripts` order. */
  cells: Cell[];
  similar?: number;
  note?: ReactNode;
}

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ScriptChip({ s, sport, cell, on }: { s: BoardScript; sport: string; cell?: Cell; on?: boolean }) {
  const mark = cell === 'yes' ? 'check' : cell === 'part' ? null : cell === 'no' ? 'close' : null;
  return (
    <span className={`lsd-chip lsd-t${s.tone}${cell ? ` lsd-chip--${cell}` : ''}${on ? ' is-on' : ''}`} title={`${s.name}${cell ? `: ${cell === 'yes' ? 'wins' : cell === 'part' ? 'wins in part of it' : 'loses'}` : ''}`}>
      {s.team ? <TeamMark sport={sport} abbr={s.team} size="sm" /> : <i className="lsd-chip__dot" aria-hidden="true" />}
      <span className="lsd-chip__n">{s.name}</span>
      {cell && <span className="lsd-chip__m" aria-hidden="true">{mark ? <Icon name={mark} size={12} /> : '◐'}</span>}
    </span>
  );
}

/** "Survives N of M": the items ordered by how many scripts they survive, then the share those scripts hold. */
export function rankSurvivors(items: BoardItem[], scripts: BoardScript[]): (BoardItem & { full: number; part: number; coverage: number | null })[] {
  return items
    .map((x) => {
      const full = x.cells.filter((c) => c === 'yes').length;
      const part = x.cells.filter((c) => c === 'part').length;
      const coverage = scripts.every((s) => s.share != null) ? x.cells.reduce((a, c, i) => a + (c === 'yes' ? scripts[i].share ?? 0 : 0), 0) : null;
      return { ...x, full, part, coverage };
    })
    .sort((a, b) => b.full - a.full || (b.coverage ?? 0) - (a.coverage ?? 0) || b.part - a.part || a.key.localeCompare(b.key));
}

export function SurvivorBoard({ sport, scripts, items, now, title = 'Survives the most scripts', sub, verb = 'wins', selected, empty, limit = 4, footer, id = 'lsd-surv' }: {
  sport: string; scripts: BoardScript[]; items: BoardItem[]; now: number; title?: string; sub?: ReactNode; verb?: string; selected?: string | null; empty: ReactNode; limit?: number; footer?: ReactNode; id?: string;
}) {
  const ranked = rankSurvivors(items, scripts).filter((x) => x.full >= 1).slice(0, limit);
  const total = scripts.length;
  return (
    <section className="lsd-surv" aria-labelledby={`${id}-h`} data-testid="survivor-board">
      <header className="lsd-surv__h">
        <span className="lsd-surv__ic" aria-hidden="true"><Icon name="shield" size={18} /></span>
        <div>
          <h2 className="lsd-surv__t" id={`${id}-h`}>{title}</h2>
          {sub && <p className="lsd-surv__sub">{sub}</p>}
        </div>
      </header>
      {ranked.length === 0 ? <p className="lsd-note">{empty}</p> : (
        <ol className="lsd-surv__l">
          {ranked.map((x, k) => {
            const words = betPhrase(x.side, x.label);
            const winsIn = scripts.filter((_, i) => x.cells[i] === 'yes');
            return (
              <li key={x.key} className={`lsd-sv${k === 0 ? ' lsd-sv--lead' : ''}`} data-testid="survivor">
                <div className="lsd-sv__count" aria-label={`Survives ${x.full} of ${total} scripts`}>
                  <b className="fx-num">{x.full}</b><span>of {total}</span>
                  <small>scripts</small>
                </div>
                <div className="lsd-sv__main">
                  <h3 className="lsd-sv__t" title={words.exact}>{x.href ? <Link to={x.href}>{words.text}</Link> : words.text}{x.similar ? <small className="lsd-sv__sim"> +{x.similar} similar {x.similar === 1 ? 'line' : 'lines'}</small> : null}</h3>
                  <p className="lsd-sv__w">
                    Survives <b>{x.full} of {total}</b> scripts{x.coverage != null ? <> · they hold <b>{pct(x.coverage)}</b> of simulated games</> : null}{x.part ? ` · ${verb} in part of ${x.part} more` : ''}
                  </p>
                  <ul className="lsd-sv__chips" aria-label={`${verb === 'wins' ? 'Wins' : 'Holds'} in ${winsIn.map((s) => s.name).join(', ') || 'no script'}`}>
                    {scripts.map((s, i) => <li key={s.id}><ScriptChip s={s} sport={sport} cell={x.cells[i]} on={selected === s.id} /></li>)}
                  </ul>
                  {x.note && <p className="lsd-sv__note">{x.note}</p>}
                </div>
                <div className="lsd-sv__px">
                  <span className="lsd-sv__side">{x.side === 'YES' ? 'Price' : 'NO price'}</span>
                  <b className="fx-num lsd-price">{cents(x.ask)}</b>
                  <FreshChip at={x.at} now={now} label="Price" />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {footer && <div className="lsd-surv__foot">{footer}</div>}
    </section>
  );
}

// ------------------------------------------------------------------ interactive simulation chart (item 29)

export function ScriptShareChart({ sport, scripts, selected, onSelect, hrefFor, details, label, caption }: {
  sport: string; scripts: (BoardScript & { share: number })[]; selected: string | null; onSelect?: (id: string) => void; hrefFor?: (id: string) => string;
  details: (id: string) => ReactNode; label: string; caption?: ReactNode;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const rid = useId();
  const shown = hover ?? selected ?? scripts[0]?.id ?? null;
  const max = Math.max(...scripts.map((s) => s.share), 0.01);
  const cur = scripts.find((s) => s.id === shown);
  return (
    <figure className="lsd-chart" aria-label={label}>
      <ol className="lsd-chart__bars" onMouseLeave={() => setHover(null)}>
        {scripts.map((s, k) => {
          const on = s.id === selected;
          const body = (
            <>
              <span className="lsd-chart__id">
                {s.team ? <TeamMark sport={sport} abbr={s.team} size="sm" /> : <i className={`lsd-chip__dot lsd-t${s.tone}`} aria-hidden="true" />}
                <span className="lsd-chart__n">{s.name}</span>
                {k === 0 && <small className="lsd-chart__top">Most likely</small>}
              </span>
              <span className="lsd-chart__track" aria-hidden="true"><i className={`lsd-t${s.tone}`} style={{ width: `${Math.max(2, (s.share / max) * 100)}%` }} /></span>
              <b className="lsd-chart__v fx-num">{pct(s.share)}</b>
            </>
          );
          const common = {
            className: `lsd-chart__b lsd-t${s.tone}${on ? ' is-on' : ''}${hover === s.id ? ' is-hover' : ''}${selected && !on ? ' is-dim' : ''}`,
            onMouseEnter: () => setHover(s.id),
            onFocus: () => setHover(s.id),
            onBlur: () => setHover(null),
            'aria-describedby': rid,
            'aria-label': `${s.name}: ${pct(s.share)} of simulated games${on ? ', selected' : ''}`,
          };
          return (
            <li key={s.id}>
              {hrefFor ? <Link to={hrefFor(s.id)} {...common} aria-current={on ? 'true' : undefined}>{body}</Link>
                : <button type="button" {...common} aria-pressed={on} onClick={() => onSelect?.(s.id)}>{body}</button>}
            </li>
          );
        })}
      </ol>
      <div className={`lsd-chart__read${cur ? ` lsd-t${cur.tone}` : ''}`} id={rid} aria-live="polite">
        {cur && (
          <>
            <span className="lsd-chart__rh">{cur.team ? <TeamMark sport={sport} abbr={cur.team} size="md" /> : <i className={`lsd-chip__dot lsd-t${cur.tone}`} aria-hidden="true" />}<b>{cur.name}</b><span className="fx-num">{pct(cur.share)}</span></span>
            <div className="lsd-chart__rb">{details(cur.id)}</div>
          </>
        )}
      </div>
      {caption && <figcaption className="lsd-note">{caption}</figcaption>}
    </figure>
  );
}

// ------------------------------------------------------------------ expressions of one script (item 14)

export interface ExpressionRow {
  key: string;
  family: string;
  label: string;
  side: 'YES' | 'NO';
  ask: number | null;
  at: string | null;
  href: string | null;
  why: string;
  basis: 'fit' | 'volume' | 'published';
}

const BASIS_WORD: Record<ExpressionRow['basis'], string> = { fit: 'Settles on the margin', volume: 'Volume lean', published: 'Published link' };

export function ExpressionList({ rows, missing, now, empty }: { rows: ExpressionRow[]; missing: string[]; now: number; empty: string }) {
  const fams = [...new Set(rows.map((r) => r.family))];
  return (
    <div className="lsd-expr" data-testid="script-expressions">
      {rows.length === 0 && <p className="lsd-note">{empty}</p>}
      {fams.map((f) => (
        <div key={f} className="lsd-expr__g">
          <h4 className="lsd-expr__f">{f}</h4>
          <ul>
            {rows.filter((r) => r.family === f).map((r) => {
              const w = betPhrase(r.side, r.label);
              return (
                <li key={r.key} className={`lsd-ex lsd-ex--${r.basis}`} data-testid="script-expression">
                  <div className="lsd-ex__m">
                    <span className="lsd-ex__t" title={w.exact}>{r.href ? <Link to={r.href}>{w.text}</Link> : w.text}</span>
                    <span className="lsd-ex__why"><span className={`lsd-basis lsd-basis--${r.basis}`}>{BASIS_WORD[r.basis]}</span> {r.why}</span>
                  </div>
                  <div className="lsd-ex__px">
                    <b className="fx-num lsd-price">{cents(r.ask)}</b>
                    <FreshChip at={r.at} now={now} label="Price" />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {missing.length > 0 && (
        <details className="lsd-expr__miss">
          <summary>Not linked to this script ({missing.length})</summary>
          <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
