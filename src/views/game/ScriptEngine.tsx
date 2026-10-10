// The CFB game page, driven by the CFB Script Engine payload. Same SIFT surfaces (panels, script cards,
// survival cells, the live price token), different depth: a descriptive matchup layer and frozen scripts,
// with market fit computed only afterwards. Copy is generated upstream from structured football findings;
// Sift adds no reasoning of its own and never turns script counts into probabilities.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Market } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { Notice, Stratum } from '../../components/ui';
import { MarginMap, type MarginSeg } from '../../components/fxResearch';
import { cfbCodeOfEspn } from '../../lib/cfbTeams';
import { teamLogo } from '../../lib/teams';
import { useHeldImage } from '../../lib/useImage';
import { routes } from '../../lib/routes';
import {
  ARCHETYPE_WORD,
  scriptTitle,
  DIMENSION_WORD,
  EDGE_DIMENSIONS,
  LABEL_HELP,
  LABEL_WORD,
  ROLE_INDEX,
  SCORING_RESEARCH_NOTE,
  ROLE_WORD,
  bandText,
  expressionLabel,
  findingByCode,
  fmtEdge,
  isDescriptiveBand,
  fmtMetric,
  marginBandText,
  metricAt,
  orderedLabels,
  sidePrice,
  survivalText,
  survivorExpressions,
  groupedSurvivors,
  winsWhenText,
  type Compat,
  type Engine,
  type EngineScript,
  type Expression,
  type Finding,
  type MetricRow,
} from '../../lib/scriptEngine';
import { quoteFreshness, quoteAgeMs, formatQuoteAge } from '../../live/freshness';
import { Info, PanelHead, ViewAll } from './panels';
import { ScriptMarkets } from './ScriptMarkets';

const COMPAT_WORD: Record<Compat, string> = {
  SUPPORTED: 'supports',
  PARTIAL: 'partly supports',
  CONTRADICTED: 'contradicts',
  NEUTRAL: 'makes no claim about',
  UNMAPPABLE: 'cannot be mapped to',
  RESEARCH_UNCALIBRATED: 'makes no calibrated claim about',
};
const SCORING_ENV_WORD: Record<string, string> = { ELEVATED: 'Elevated', SUPPRESSED: 'Suppressed' };
const COMPAT_CELL: Record<Compat, string> = { SUPPORTED: 'yes', PARTIAL: 'part', CONTRADICTED: 'no', NEUTRAL: 'neutral', UNMAPPABLE: 'neutral', RESEARCH_UNCALIBRATED: 'neutral' };

export const ENGINE_SURVIVAL_INFO = (
  <>
    A contract <b>survives</b> a script when every outcome the script describes pays it (◧ = only part of the
    script's range). Script survival is compatibility with frozen football scenarios — <b>3 of 4 scripts is not 75%</b>,
    and no row here is a fair price or an expected value.
  </>
);

/** A horizontally scrollable table: focusable and named, so keyboard users can scroll it (axe scrollable-region-focusable). */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tscroll" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

function cents(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 100)}¢`;
}

export function SidePrice({ e, m, now }: { e: Expression; m: Market | undefined; now: number }) {
  const v = sidePrice(e, m);
  const fresh = quoteFreshness(m?.captured_at ?? null, now);
  const age = quoteAgeMs(m?.captured_at ?? null, now);
  const cls = v == null ? 'price--none' : fresh === 'STALE' || fresh === 'UNKNOWN' ? 'price--stale' : fresh === 'AGING' ? 'price--aging' : '';
  return (
    <span className={`price ${cls}`} title={`${e.side} ask ${cents(v)} · updated ${formatQuoteAge(age)} ago (${fresh})`} data-quote-state={fresh}>
      {cents(v)}
    </span>
  );
}

export function ConfidenceChip({ level }: { level: string }) {
  return <span className={`cfchip cfchip--${level.toLowerCase()}`}>{level === 'LOW' ? 'Low data confidence' : `${level[0]}${level.slice(1).toLowerCase()} data confidence`}</span>;
}

export function LabelChips({ labels }: { labels: string[] }) {
  return (
    <span className="lchips">
      {orderedLabels(labels).map((l) => (
        <span key={l} className={`lchip lchip--${l.toLowerCase()}`} title={LABEL_HELP[l]}>{LABEL_WORD[l] ?? l}</span>
      ))}
    </span>
  );
}

export function CompatCells({ engine, e, selected }: { engine: Engine; e: Expression; selected?: string | null }) {
  return (
    <span className="fitcells" aria-hidden="true">
      {engine.scripts.map((s, i) => (
        <span
          key={s.script_id}
          className={`fitcell fitcell--${COMPAT_CELL[e.compat[i]]} fitcell--s${ROLE_INDEX[s.role]}${selected === s.script_id ? ' is-sel' : ''}`}
          title={`${ROLE_WORD[s.role]} (${scriptTitle(s)}) ${COMPAT_WORD[e.compat[i]]} this`}
        />
      ))}
    </span>
  );
}

function compatSentence(engine: Engine, e: Expression): string {
  const by = (c: Compat) => engine.scripts.filter((_, i) => e.compat[i] === c).map((s) => ROLE_WORD[s.role]);
  const parts = [] as string[];
  if (by('SUPPORTED').length) parts.push(`supported by ${by('SUPPORTED').join(', ')}`);
  if (by('PARTIAL').length) parts.push(`partly by ${by('PARTIAL').join(', ')}`);
  if (by('CONTRADICTED').length) parts.push(`contradicted by ${by('CONTRADICTED').join(', ')}`);
  return parts.join('; ') || 'no script makes a claim about it';
}

// ------------------------------------------------------------------ SIFT READ

export function EngineReadPanel({ engine, to }: { engine: Engine; to: string }) {
  const g = engine.generation;
  return (
    <section className="panel ov-model eng-read" aria-labelledby="eng-read-h">
      <div className="phead">
        <span className="ov-model__ic" aria-hidden="true"><Icon name="chart" size={18} /></span>
        <h2 className="phead__t" id="eng-read-h">
          <Link to={to}>SIFT Read</Link>
          <Info label="How the SIFT read is built">
            Every sentence comes from a structured football finding or a script summary, generated before any market
            price was read. The football artifact was frozen at {g.generated_at} (hash {g.artifact_hash.slice(0, 12)}); prices
            only enter afterwards, to rank ways of expressing the same football view.
          </Info>
        </h2>
        <ConfidenceChip level={engine.confidence.level} />
      </div>
      <p className="ov-model__read">{engine.read.headline}</p>
      {engine.read.points.length > 0 && (
        <ul className="eng-read__pts">
          {engine.read.points.map((p) => <li key={p.text}>{p.text}</li>)}
        </ul>
      )}
      <p className="eng-read__foot small">
        <span className="rchip">Research only</span> Market-blind football read · no probabilities · data through {g.football_data_cutoff.slice(0, 10)}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ scripts

export function EngineScriptsPanel({ engine, selected, hrefFor, title = 'Likely Game Scripts', art }: { engine: Engine; selected: string | null; hrefFor: (id: string | null) => string; title?: string; art?: boolean }) {
  const sel = engine.scripts.find((s) => s.script_id === selected) ?? null;
  return (
    <section className="panel ov-scripts eng-scripts" aria-labelledby="eng-scripts-h">
      <div className="phead">
        <h2 className="phead__t" id="eng-scripts-h">
          {title}
          <Info label="How scripts are ranked">
            Each script exists only because the matchup evidence requires it. Ranked by evidence: <b>Primary</b> is the
            best-supported path, <b>Danger</b> the plausible path that breaks it. V1 publishes no likelihoods — scripts are
            ranked, not priced, until prospective results can calibrate them.
          </Info>
        </h2>
      </div>
      {engine.scripts.length === 0 ? (
        <p className="muted small">No script cleared its evidence requirement for this game. Sift shows none rather than inventing one.</p>
      ) : (
        <ul className="scards eng-scards">
          {engine.scripts.map((s) => {
            const on = s.script_id === selected;
            return (
              <li key={s.script_id}>
                <Link
                  to={hrefFor(on ? null : s.script_id)}
                  className={`scard scard--s${ROLE_INDEX[s.role]} eng-scard${on ? ' is-sel' : ''}${sel && !on ? ' is-dim' : ''}`}
                  aria-current={on ? 'true' : undefined}
                  aria-label={`${ROLE_WORD[s.role]} script: ${scriptTitle(s)}. ${s.summary}${on ? ' Selected.' : ''}`}
                >
                  {art && <LeadArt engine={engine} s={s} />}
                  <span className="eng-scard__role">{ROLE_WORD[s.role]}{art && <span className="eng-scard__rank"> · #{s.rank} by evidence</span>}</span>
                  <span className="scard__name" data-canonical={s.title}>{scriptTitle(s)}</span>
                  <span className="scard__d">{s.summary}</span>
                  <span className="eng-scard__arch">{ARCHETYPE_WORD[s.archetype] ?? s.archetype}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ survivors + why this bet

function WhyThisBet({ engine, e, m, marketsByTicker, now }: { engine: Engine; e: Expression; m: Market | undefined; marketsByTicker: Map<string, Market>; now: number }) {
  const supported = engine.scripts.filter((_, i) => e.compat[i] === 'SUPPORTED' || e.compat[i] === 'PARTIAL');
  const required = [...new Set(supported.flatMap((s) => s.required_findings))].map((c) => findingByCode(engine, c)).filter((f): f is Finding => !!f);
  const refs = [...new Set(required.flatMap((f) => f.metric_refs))].slice(0, 4);
  const others = new Map(survivorExpressions(engine).map((x) => [x.id, x]));
  return (
    <div className="why" role="region" aria-label={`Why ${expressionLabel(e, m)}`}>
      <div className="why__grid">
        <div>
          <h4 className="why__h">Scripts</h4>
          <ul className="why__scripts">
            {engine.scripts.map((s, i) => (
              <li key={s.script_id}><span className={`sdot sdot--s${ROLE_INDEX[s.role]}`} aria-hidden="true" /><b>{ROLE_WORD[s.role]}</b> · {scriptTitle(s)}: <span className={`why__c why__c--${COMPAT_CELL[e.compat[i]]}`}>{COMPAT_WORD[e.compat[i]]}</span>{e.compat[i] === 'PARTIAL' && e.coverage[i] != null ? ` (${Math.round(e.coverage[i]! * 100)}% of its range)` : ''}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="why__h">Required football conditions</h4>
          <p className="small">Pays when: <b>{winsWhenText(e, engine) ?? '—'}</b></p>
          <ul className="why__list small">{required.map((f) => <li key={f.code}>{f.statement}</li>)}</ul>
        </div>
        {refs.length > 0 && (
          <div>
            <h4 className="why__h">Matchup evidence</h4>
            <ul className="why__list small">
              {refs.map((ref) => {
                const row = metricAt(engine, ref);
                if (!row) return null;
                const reg = engine.registry[row.metric_id];
                return <li key={ref}>{row.team} {row.unit} · {reg?.name ?? row.metric_id}: {fmtMetric(row.adjusted, reg?.unit)} adj. ({row.rank ? `#${row.rank} of ${row.universe_size}` : 'unranked'}, {row.games} g)</li>;
              })}
            </ul>
          </div>
        )}
        <div>
          <h4 className="why__h">Market</h4>
          <p className="small">{e.side} ask <SidePrice e={e} m={m} now={now} /> — the price ranks ways to express the same football view; it never created the view.</p>
          {e.correlation.length > 0 && (
            <ul className="why__list small">
              {e.correlation.slice(0, 4).map((c) => {
                const o = others.get(c.with);
                return <li key={c.with}>With {o ? expressionLabel(o, marketsByTicker.get(o.ticker)) : c.with}: {c.relation.replace(/_/g, ' ')}{c.both_lose_when ? ` · both lose when ${c.both_lose_when}` : ''}</li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function EngineSurvivorsPanel({ engine, marketsByTicker, slug, eventId, now, selected, to, limit = 8 }: { engine: Engine; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number; selected: string | null; to?: string; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const si = selected ? engine.scripts.findIndex((s) => s.script_id === selected) : -1;
  const rows = useMemo(() => {
    const list = groupedSurvivors(engine).filter((e) => si < 0 || e.compat[si] === 'SUPPORTED');
    return list.slice(0, limit);
  }, [engine, si, limit]);
  return (
    <section className="panel ov-surv eng-surv" aria-labelledby="eng-surv-h">
      <PanelHead
        title="Bets That Survive Multiple Scripts"
        info={<Info label="How script survival works">{ENGINE_SURVIVAL_INFO}</Info>}
        sub={si >= 0 ? <>Contracts the <b>{ROLE_WORD[engine.scripts[si].role].toLowerCase()}</b> script supports</> : 'Best expressions and multi-script contracts, by script survival'}
      />
      <Scroll label="Bets that survive multiple scripts"><table className="survt eng-survt">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col" className="survt__fits">Script survival</th>
            <th scope="col">Role</th>
            <th scope="col" className="r">Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const m = marketsByTicker.get(e.ticker);
            const label = expressionLabel(e, m);
            const isOpen = open === e.id;
            return (
              <Fragment key={e.id}>
                <tr className={isOpen ? 'is-open' : undefined}>
                  <th scope="row">
                    {m ? <Link to={routes.market(slug, m.market_id, eventId)} className="survt__m">{label}</Link> : <span className="survt__m">{label}</span>}
                    {e.similar > 0 && <span className="survt__sim">+{e.similar} similar {e.similar === 1 ? 'line' : 'lines'} with the same script support</span>}
                    <button type="button" className="why__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                      Why this bet<Icon name="chevronDown" size={14} className={isOpen ? 'is-flipped' : undefined} />
                    </button>
                  </th>
                  <td className="c-fit">
                    <CompatCells engine={engine} e={e} selected={selected} />
                    <span className="survt__k">{survivalText(e.survival)}</span>
                    <span className="sr-only">{compatSentence(engine, e)}</span>
                  </td>
                  <td className="c-role"><LabelChips labels={e.labels} /></td>
                  <td className="r c-price"><SidePrice e={e} m={m} now={now} /></td>
                </tr>
                {isOpen && (
                  <tr className="why__row"><td colSpan={4}><WhyThisBet engine={engine} e={e} m={m} marketsByTicker={marketsByTicker} now={now} /></td></tr>
                )}
              </Fragment>
            );
          })}
          {!rows.length && <tr><td colSpan={4} className="muted small">{engine.scripts.length ? 'No contract survives this script and at least one other.' : 'No scripts, so no contract is mapped.'}</td></tr>}
        </tbody>
      </table></Scroll>
      {engine.scoringResearchOnly && <p className="eng-scoringnote muted small" role="note">{SCORING_RESEARCH_NOTE}</p>}
      {engine.disagreement && (
        <p className="eng-disagree" role="note">
          <b>Market disagreement.</b> {engine.disagreement.rule}. {engine.disagreement.note}
        </p>
      )}
      {to && <div className="ov-surv__foot"><ViewAll to={to}>All script fits</ViewAll></div>}
    </section>
  );
}

// ------------------------------------------------------------------ matchup edges

function EdgeBar({ v }: { v: number | null | undefined }) {
  const w = v == null ? 0 : Math.min(Math.abs(v) / 3, 1) * 50;
  return (
    <span className="ebar" aria-hidden="true">
      <span className="ebar__mid" />
      {v != null && <span className={`ebar__v ${v >= 0 ? 'ebar__v--pos' : 'ebar__v--neg'}`} style={v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />}
    </span>
  );
}

export function EngineEdgesPanel({ engine, homeAbbr, awayAbbr, to }: { engine: Engine; homeAbbr: string; awayAbbr: string; to?: string }) {
  return (
    <section className="panel eng-edges" aria-labelledby="eng-edges-h">
      <PanelHead
        title="Matchup Edges"
        info={
          <Info label="How to read a matchup edge">
            Each offense against the defense it faces, on opponent-adjusted values standardised across FBS. Positive favours
            the offense; +2 is roughly a one-SD-better offense meeting a one-SD-worse defense. A description of the two units,
            not a forecast. Hatched = within its own uncertainty.
          </Info>
        }
        sub={`${awayAbbr} @ ${homeAbbr} · season to date, adjusted for opponents`}
      />
      <Scroll label="Matchup edges by dimension"><table className="etab">
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">{homeAbbr} offense vs {awayAbbr} D</th>
            <th scope="col">{awayAbbr} offense vs {homeAbbr} D</th>
          </tr>
        </thead>
        <tbody>
          {EDGE_DIMENSIONS.map((d) => {
            const dim = engine.dimensions[d];
            const h = dim?.home_offense_vs_away_defense;
            const a = dim?.away_offense_vs_home_defense;
            return (
              <tr key={d}>
                <th scope="row">{DIMENSION_WORD[d] ?? d}</th>
                {[h, a].map((x, i) => (
                  <td key={i} className={x?.edge != null && x.uncertainty != null && Math.abs(x.edge) < x.uncertainty ? 'is-noise' : undefined}>
                    <span className="ecell"><EdgeBar v={x?.edge} /><span className="num">{fmtEdge(x?.edge)}</span></span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table></Scroll>
      <p className="small muted eng-edges__pace">
        Possession environment {fmtEdge(engine.dimensions.pace?.possession_environment)} · scoring baseline {engine.baseline.home_points ?? '—'}–{engine.baseline.away_points ?? '—'} ({homeAbbr}–{awayAbbr}), descriptive and uncalibrated, not a projection
      </p>
      {to && <div className="ov-surv__foot"><ViewAll to={to}>Every metric</ViewAll></div>}
    </section>
  );
}

// ------------------------------------------------------------------ data confidence

const GATE_WORD: Record<string, string> = {
  adjusted_inputs: 'Opponent-adjusted inputs exist',
  sample_size: 'Sample-size gate (3+ games each)',
  identity: 'Teams and home/away identified',
  freshness: 'Game log fresh and complete',
  availability: 'No quarterback listed uncertain',
  market_blind: 'Built before any market data',
};

export function EngineConfidencePanel({ engine }: { engine: Engine }) {
  const c = engine.confidence;
  const g = engine.generation;
  return (
    <section className="panel eng-conf" aria-labelledby="eng-conf-h">
      <PanelHead title="Data Confidence" sub={c.describes} info={<Info label="What confidence means">HIGH, MEDIUM and LOW describe the football evidence — coverage, sample, adjustment stability, availability and identity — never how strongly a side is favoured.</Info>}>
        <ConfidenceChip level={c.level} />
      </PanelHead>
      <ul className="gates">
        {Object.entries(c.gates).map(([k, ok]) => (
          <li key={k} className={ok ? 'is-ok' : 'is-bad'}><Icon name={ok ? 'check' : 'close'} size={14} /> {GATE_WORD[k] ?? k}</li>
        ))}
      </ul>
      <div className="eng-conf__cols">
        <div><h3 className="why__h">Known</h3><ul className="why__list small">{c.known.map((k) => <li key={k}>{k}</li>)}</ul></div>
        <div><h3 className="why__h">Not known</h3><ul className="why__list small">{c.unknown.map((k) => <li key={k}>{k}</li>)}{c.reasons.map((k) => <li key={k}>{k}</li>)}</ul></div>
      </div>
      <p className="small muted">
        Football artifact {g.artifact_hash.slice(0, 12)} · generated {g.generated_at} · data through {g.football_data_cutoff} ·
        {' '}{g.methodology_version}{g.regeneration_reasons.length ? ` · ${g.regeneration_reasons.join(', ').toLowerCase().replace(/_/g, ' ')}` : ''}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ script tab

/** Which football findings give this script permission to state its margin -- or why it states none. */
function MarginAuthority({ engine, s }: { engine: Engine; s: EngineScript }) {
  const evidence = s.outcome_shape.margin_authority_evidence ?? [];
  if (s.outcome_shape.bands.home_margin && evidence.length) {
    return (
      <div className="eng-marginauth">
        <h3 className="why__h">Margin authority</h3>
        <span className="chain__f">{evidence.map((c) => <FindingChip key={c} engine={engine} code={c} />)}</span>
      </div>
    );
  }
  if (!s.outcome_shape.bands.home_margin && s.outcome_shape.total_environment !== 'NOT_STATED') {
    return (
      <p className="eng-bandnote muted small">
        No margin stated: the scoring environment says nothing about how close the game is, and no resolved matchup finding does either.
      </p>
    );
  }
  return null;
}

function FindingChip({ engine, code }: { engine: Engine; code: string }) {
  const f = findingByCode(engine, code);
  if (!f) return null;
  return (
    <details className="fchip">
      <summary>{code.replace(/_/g, ' ').toLowerCase()}<span className={`fchip__s fchip__s--${f.strength.toLowerCase()}`}>{f.strength.toLowerCase()}</span></summary>
      <p className="small">{f.statement}</p>
      {f.metric_refs.length > 0 && <MetricMini engine={engine} refs={f.metric_refs} />}
    </details>
  );
}

function MetricMini({ engine, refs }: { engine: Engine; refs: string[] }) {
  return (
    <ul className="mmini small">
      {[...new Set(refs)].slice(0, 6).map((ref) => {
        const row = metricAt(engine, ref);
        if (!row) return null;
        const reg = engine.registry[row.metric_id];
        return (
          <li key={ref}>
            <span>{row.team} {row.unit} · {reg?.name ?? row.metric_id}</span>
            <span className="num">{fmtMetric(row.raw, reg?.unit)} raw → {fmtMetric(row.adjusted, reg?.unit)} adj.</span>
            <span className="muted">{row.rank ? `#${row.rank}/${row.universe_size}` : 'unranked'} · {row.games} g · {row.quality.toLowerCase().replace(/_/g, ' ')}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ShapeTiles({ s, home, away }: { s: EngineScript; home: string; away: string }) {
  const b = s.outcome_shape.bands;
  const env = SCORING_ENV_WORD[s.outcome_shape.total_environment];
  const tiles: [string, string | null, boolean][] = [
    ['Winner lean', s.outcome_shape.winner_lean === 'HOME' ? home : s.outcome_shape.winner_lean === 'AWAY' ? away : 'Neither', false],
    ['Margin', marginBandText(b.home_margin, home, away), isDescriptiveBand(s, 'home_margin')],
    ['Scoring environment', env ?? null, false],
    ['Total points', bandText(b.total_points), isDescriptiveBand(s, 'total_points')],
    [`${home} points`, bandText(b.home_points), isDescriptiveBand(s, 'home_points')],
    [`${away} points`, bandText(b.away_points), isDescriptiveBand(s, 'away_points')],
  ];
  const shown = tiles.filter(([, v]) => v != null);
  const descriptive = shown.some(([, , d]) => d);
  return (
    <>
      <dl className="tiles eng-shape">
        {shown.map(([k, v, d]) => (
          <div key={k} className={`tile${d ? ' tile--descriptive' : ''}`}>
            <dt>{k}{d && <span className="tile__tag"> · descriptive</span>}</dt>
            <dd className="tile__v num">{v}</dd>
          </div>
        ))}
      </dl>
      {descriptive && (
        <p className="eng-bandnote muted small">
          Point ranges marked descriptive are drawn around an uncalibrated scoring baseline. They describe the script; they are not a projection and do not support any total or team-total market.
        </p>
      )}
    </>
  );
}

/** A script's lead team as a watermark on its card (logos only: CFB carries no licensed player photography). */
function LeadArt({ engine, s }: { engine: Engine; s: EngineScript }) {
  const side = s.lead_side ?? (s.outcome_shape.winner_lean === 'HOME' ? 'home' : s.outcome_shape.winner_lean === 'AWAY' ? 'away' : null);
  const code = side ? cfbCodeOfEspn(engine.teams[side].team_id) : null;
  const logo = useHeldImage(code ? teamLogo('CFB', code) : null);
  return logo ? <span className="eng-scard__art" aria-hidden="true"><img src={logo} alt="" /></span> : null;
}

/** Where each script's stated margin sits (the archetype's own definition, not a projection). */
function engineSegs(engine: Engine, on: string[], dim: boolean): MarginSeg[] {
  return engine.scripts.filter((s) => s.outcome_shape.bands.home_margin).map((s) => ({
    key: s.script_id, lo: s.outcome_shape.bands.home_margin![0], hi: s.outcome_shape.bands.home_margin![1], tone: ROLE_INDEX[s.role],
    label: ROLE_WORD[s.role], on: on.includes(s.script_id), dim: dim && !on.includes(s.script_id),
  }));
}

function TheaterHead({ compare, setView, canCompare }: { compare: boolean; setView: (v: 'single' | 'compare') => void; canCompare: boolean }) {
  return (
    <header className="fr-th__h">
      <span className="fr-th__ic" aria-hidden="true"><Icon name="layers" size={22} /></span>
      <div className="fr-th__tt">
        <h2 className="fr-th__t">SIFT Game Script Theater</h2>
        <p className="fr-th__sub">Football scripts ranked by matchup evidence: <b>Primary</b>, <b>Secondary</b>, <b>Alternate</b>, <b>Danger</b>. Ranked, never priced — no script carries a probability.</p>
      </div>
      <div className="fr-seg fr-th__mode" role="group" aria-label="Theater mode">
        <button type="button" className={`fr-seg__b${!compare ? ' is-on' : ''}`} aria-pressed={!compare} onClick={() => setView('single')}><Icon name="eye" size={15} /> Single script</button>
        <button type="button" className={`fr-seg__b${compare ? ' is-on' : ''}`} aria-pressed={compare} disabled={!canCompare} onClick={() => setView('compare')}><Icon name="compare" size={15} /> Compare scripts</button>
      </div>
    </header>
  );
}

export function EngineScriptTab({ engine, selected, hrefFor, marketsByTicker, slug, eventId, now }: { engine: Engine; selected: string | null; hrefFor: (id: string | null) => string; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number }) {
  const [sp, setSp] = useSearchParams();
  if (!engine.scripts.length) {
    return <Notice title="No script cleared its evidence requirement">The matchup evidence for this game does not support any script yet, so Sift shows none rather than inventing one.</Notice>;
  }
  const canCompare = engine.scripts.length >= 2;
  const compare = canCompare && sp.get('view') === 'compare';
  const setView = (v: 'single' | 'compare') => setSp((p) => { const n = new URLSearchParams(p); if (v === 'compare') n.set('view', 'compare'); else n.delete('view'); return n; }, { replace: true });
  const s = engine.scripts.find((x) => x.script_id === selected) ?? engine.scripts[0];
  const i = engine.scripts.indexOf(s);
  const home = engine.teams.home.name;
  const away = engine.teams.away.name;
  const breaks = engine.expressions.filter((e) => e.compat[i] === 'CONTRADICTED' && e.labels.some((l) => l === 'BEST_EXPRESSION' || l === 'MULTI_SCRIPT' || l === 'SCRIPT_ALIGNED')).slice(0, 6);
  const supported = engine.expressions.filter((e) => e.compat[i] === 'SUPPORTED');
  const danger = engine.scripts.find((x) => x.role === 'DANGER' && x.script_id !== s.script_id);
  const segs = engineSegs(engine, [s.script_id], false);
  return (
    <div className="fr-theater fr-theater--cfb">
      <TheaterHead compare={compare} setView={setView} canCompare={canCompare} />
      {compare ? <EngineCompare engine={engine} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} /> : (
        <>
          <div className="stab__pick"><EngineScriptsPanel engine={engine} selected={s.script_id} hrefFor={hrefFor} title="Scripts" art /></div>
          <div className="fx-bento fr-th__grid">
            <section className={`fx-card fx-span-4 fr-sel fr-sel--s${ROLE_INDEX[s.role]}`} aria-labelledby="eng-sel-h">
              <span className="fr-sel__tag">{ROLE_WORD[s.role]} · rank {s.rank} of {engine.scripts.length}</span>
              <h2 className="fr-sel__name" id="eng-sel-h">{scriptTitle(s)}</h2>
              <p className="fr-sel__pct">Ranked by matchup evidence · <b className="fr-sel__np">no probability published</b></p>
              <p className="fr-sel__story">{s.summary}</p>
              <ul className="fr-rows">
                <li><span className="fr-rows__ic fr-rows__ic--cyan"><Icon name="football" size={16} /></span><div><b>Game flow</b><p>{s.causal_chain[0]?.step ?? s.summary}</p></div></li>
                <li><span className="fr-rows__ic fr-rows__ic--red"><Icon name="bolt" size={16} /></span><div><b>Outcome shape</b><p>{[s.outcome_shape.winner_lean === 'HOME' ? `${home} lean` : s.outcome_shape.winner_lean === 'AWAY' ? `${away} lean` : 'No winner lean', marginBandText(s.outcome_shape.bands.home_margin, home, away), SCORING_ENV_WORD[s.outcome_shape.total_environment] ? `${SCORING_ENV_WORD[s.outcome_shape.total_environment].toLowerCase()} scoring` : null].filter(Boolean).join(' · ')}</p></div></li>
                <li><span className="fr-rows__ic fr-rows__ic--gold"><Icon name="chart" size={16} /></span><div><b>Markets to investigate</b><p>{supported.length ? `${supported.length} contract${supported.length === 1 ? '' : 's'} pay across this script — see below.` : 'No contract pays across this script.'}</p></div></li>
                <li><span className="fr-rows__ic fr-rows__ic--violet"><Icon name="shield" size={16} /></span><div><b>How this script fails</b><p>{s.contradicting_findings.length ? `${s.contradicting_findings.length} finding${s.contradicting_findings.length === 1 ? '' : 's'} cut against it` : 'No published finding cuts against it'}{danger ? `; the danger path is ${scriptTitle(danger)}.` : '.'}</p></div></li>
              </ul>
            </section>
            <section className="fx-card fx-span-8" aria-labelledby="g-script-chain-h" id="g-script-chain">
              <h3 className="fx-card__t" id="g-script-chain-h"><span className={`sdot sdot--s${ROLE_INDEX[s.role]}`} aria-hidden="true" />{ROLE_WORD[s.role]}: {scriptTitle(s)}</h3>
              <ol className="chain">
                {s.causal_chain.map((st) => (
                  <li key={st.step}>
                    <span className="chain__t">{st.step}</span>
                    <span className="chain__f">{st.findings.map((c) => <FindingChip key={c} engine={engine} code={c} />)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="fx-card fx-span-6" aria-labelledby="eng-shape-h">
              <h3 className="fx-card__t" id="eng-shape-h"><Icon name="grid" size={16} /> Outcome shape</h3>
              <ShapeTiles s={s} home={home} away={away} />
              <MarginAuthority engine={engine} s={s} />
              {s.contradicting_findings.length > 0 && (
                <>
                  <h3 className="why__h">Evidence against</h3>
                  <span className="chain__f">{s.contradicting_findings.map((c) => <FindingChip key={c} engine={engine} code={c} />)}</span>
                </>
              )}
            </section>
            <section className="fx-card fx-span-6" aria-labelledby="eng-mm-h">
              <h3 className="fx-card__t" id="eng-mm-h"><Icon name="chart" size={16} /> Where each script ends</h3>
              {segs.length ? (
                <>
                  <MarginMap segs={segs} homeAbbr={cfbCodeOfEspn(engine.teams.home.team_id) ?? 'HOME'} awayAbbr={cfbCodeOfEspn(engine.teams.away.team_id) ?? 'AWAY'} label={`${home} final margin each script states`} />
                  <p className="fr-note">Margins are each archetype’s own definition{segs.some((g) => isDescriptiveBand(engine.scripts.find((x) => x.script_id === g.key)!, 'home_margin')) ? '; ranges marked descriptive are research only' : ''} — not a projection and not a probability.</p>
                </>
              ) : <p className="fr-note">No script states a margin: the scripts describe the scoring environment only.</p>}
              {engine.scoringResearchOnly && <p className="fr-note" role="note"><span className="fr-badge">Research only</span> {SCORING_RESEARCH_NOTE}</p>}
            </section>
          </div>
          <Stratum id="g-script-markets" title="Markets this script settles" sub={`Settlement-exact: a contract is supported only if every outcome in the script's range pays it. Each card says what the side costs after Kalshi's fee, the football it needs, the scripts it loses in and the other rungs of its thesis.${engine.scoringResearchOnly ? ' Total and team-total markets are research only until scoring ranges are calibrated.' : ''}`}>
            <ScriptMarkets engine={engine} selected={s.script_id} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} />
            <div className="eng-sm eng-sm--breaks">
              <ExprList title="Contradicted by this script" list={breaks} engine={engine} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} />
            </div>
          </Stratum>
        </>
      )}
    </div>
  );
}

/** Two CFB scripts side by side: what each states, the evidence behind each, and the contracts that split them. */
function EngineCompare({ engine, marketsByTicker, slug, eventId, now }: { engine: Engine; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number }) {
  const [sp, setSp] = useSearchParams();
  const byId = (id: string | null) => engine.scripts.find((x) => x.script_id === id);
  const a = byId(sp.get('a')) ?? engine.scripts[0];
  let b = byId(sp.get('b')) ?? engine.scripts[1];
  if (b.script_id === a.script_id) b = engine.scripts.find((x) => x.script_id !== a.script_id)!;
  const setPair = (na: string, nb: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('view', 'compare'); n.set('a', na); n.set('b', nb); return n; }, { replace: true });
  const ia = engine.scripts.indexOf(a);
  const ib = engine.scripts.indexOf(b);
  const home = engine.teams.home.name;
  const away = engine.teams.away.name;
  const split = (i: number, j: number) => engine.expressions.filter((e) => e.compat[i] === 'SUPPORTED' && e.compat[j] === 'CONTRADICTED').slice(0, 4);
  const both = engine.expressions.filter((e) => e.compat[ia] === 'SUPPORTED' && e.compat[ib] === 'SUPPORTED').slice(0, 4);
  const lean = (x: EngineScript) => (x.outcome_shape.winner_lean === 'HOME' ? home : x.outcome_shape.winner_lean === 'AWAY' ? away : 'Neither');
  const band = (x: EngineScript, k: 'home_margin' | 'total_points') => {
    const t = k === 'home_margin' ? marginBandText(x.outcome_shape.bands.home_margin, home, away) : bandText(x.outcome_shape.bands.total_points);
    if (!t) return <span className="muted">Not stated</span>;
    return <>{t}{isDescriptiveBand(x, k) && <span className="fr-badge fr-cmp__rs">research only</span>}</>;
  };
  const rows: [string, (x: EngineScript) => ReactNode][] = [
    ['Evidence rank', (x) => <><b className="fx-num">#{x.rank}</b> <span className="muted">of {engine.scripts.length}</span></>],
    ['Archetype', (x) => ARCHETYPE_WORD[x.archetype] ?? x.archetype],
    ['Winner lean', lean],
    ['Margin', (x) => band(x, 'home_margin')],
    ['Scoring environment', (x) => SCORING_ENV_WORD[x.outcome_shape.total_environment] ?? <span className="muted">Not stated</span>],
    ['Total points', (x) => band(x, 'total_points')],
    ['Required findings', (x) => <b className="fx-num">{x.required_findings.length}</b>],
    ['Supporting findings', (x) => <b className="fx-num">{x.supporting_findings.length}</b>],
    ['Findings against', (x) => <b className="fx-num">{x.contradicting_findings.length}</b>],
    ['Data confidence', (x) => <ConfidenceChip level={x.data_confidence} />],
  ];
  const Head = ({ x, tag }: { x: EngineScript; tag: string }) => (
    <div className={`fr-cmp__head fr-cmp__head--s${ROLE_INDEX[x.role]}`}>
      <span className="fr-cmp__tag">{tag}</span>
      <span className="fr-k">{ROLE_WORD[x.role]}</span>
      <b className="fr-cmp__name">{scriptTitle(x)}</b>
      <span className="fr-cmp__need">{x.summary}</span>
    </div>
  );
  const ExprCol = ({ list, x, tag }: { list: Expression[]; x: EngineScript; tag: string }) => (
    <div className={`fr-cmp__mkc fr-cmp__mkc--s${ROLE_INDEX[x.role]}`}>
      <span className="fr-cmp__mkh"><span className="fr-cmp__tag">{tag}</span> Pays in {ROLE_WORD[x.role].toLowerCase()}, contradicted in the other</span>
      {list.length ? <ul>{list.map((e) => { const m = marketsByTicker.get(e.ticker); return <li key={e.id}>{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{expressionLabel(e, m)}</Link> : expressionLabel(e, m)} <SidePrice e={e} m={m} now={now} /></li>; })}</ul> : <p className="fr-note">No contract splits these two scripts this way.</p>}
    </div>
  );
  return (
    <section className="fr-cmp" aria-labelledby="eng-cmp-h">
      <h3 className="fr-k fr-th__pick" id="eng-cmp-h">Compare two scripts</h3>
      <div className="fr-cmp__pickers">
        {(['a', 'b'] as const).map((k) => {
          const cur = k === 'a' ? a : b;
          const other = k === 'a' ? b : a;
          return (
            <div key={k} className="fr-cmp__picker" role="group" aria-label={`Script ${k.toUpperCase()}`}>
              <span className="fr-k">Script {k.toUpperCase()}</span>
              <div className="fr-chips">
                {engine.scripts.map((x) => (
                  <button key={x.script_id} type="button" className={`fr-chip fr-chip--s${ROLE_INDEX[x.role]}${cur.script_id === x.script_id ? ' is-on' : ''}`} aria-pressed={cur.script_id === x.script_id} disabled={x.script_id === other.script_id} onClick={() => (k === 'a' ? setPair(x.script_id, b.script_id) : setPair(a.script_id, x.script_id))}>{ROLE_WORD[x.role]} · {scriptTitle(x)}</button>
                ))}
              </div>
            </div>
          );
        })}
        <button type="button" className="btn btn--sm fr-cmp__swap" onClick={() => setPair(b.script_id, a.script_id)}><Icon name="compare" size={15} /> Swap</button>
      </div>
      <div className="fx-bento">
        <div className="fx-card fx-span-7">
          <div className="fr-cmp__heads"><Head x={a} tag="A" /><span className="fr-cmp__vs" aria-hidden="true">VS</span><Head x={b} tag="B" /></div>
          <table className="fr-t fr-cmp__t">
            <caption className="sr-only">{scriptTitle(a)} against {scriptTitle(b)}</caption>
            <thead><tr><th scope="col">Script states</th><th scope="col">A · {ROLE_WORD[a.role]}</th><th scope="col">B · {ROLE_WORD[b.role]}</th></tr></thead>
            <tbody>{rows.map(([k, f]) => <tr key={k}><th scope="row">{k}</th><td>{f(a)}</td><td>{f(b)}</td></tr>)}</tbody>
          </table>
          <p className="fr-note">Scripts are ranked by evidence, never priced: there is no win probability, projected score or likelihood per script to compare.</p>
        </div>
        <div className="fx-card fx-span-5">
          <h3 className="fx-card__t"><Icon name="chart" size={16} /> How the game ends</h3>
          {engineSegs(engine, [a.script_id, b.script_id], true).length ? (
            <MarginMap segs={engineSegs(engine, [a.script_id, b.script_id], true)} homeAbbr={cfbCodeOfEspn(engine.teams.home.team_id) ?? 'HOME'} awayAbbr={cfbCodeOfEspn(engine.teams.away.team_id) ?? 'AWAY'} label={`Margins stated by ${scriptTitle(a)} and ${scriptTitle(b)}`} />
          ) : <p className="fr-note">Neither script states a margin.</p>}
          <p className="fr-note">Each bar is the margin the script’s archetype defines — a description, not a projection. Score paths are not modelled.</p>
        </div>
        <div className="fx-card fx-span-12">
          <h3 className="fx-card__t"><Icon name="layers" size={16} /> Markets that separate them</h3>
          <div className="fr-cmp__mk fr-cmp__mk--3">
            <ExprCol list={split(ia, ib)} x={a} tag="A" />
            <ExprCol list={split(ib, ia)} x={b} tag="B" />
            <div className="fr-cmp__mkc">
              <span className="fr-cmp__mkh">Pays in both</span>
              {both.length ? <ul>{both.map((e) => { const m = marketsByTicker.get(e.ticker); return <li key={e.id}>{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{expressionLabel(e, m)}</Link> : expressionLabel(e, m)} <SidePrice e={e} m={m} now={now} /></li>; })}</ul> : <p className="fr-note">No contract pays across both scripts.</p>}
            </div>
          </div>
          {engine.scoringResearchOnly && <p className="fr-note" role="note">{SCORING_RESEARCH_NOTE}</p>}
        </div>
      </div>
    </section>
  );
}

function ExprList({ title, list, engine, marketsByTicker, slug, eventId, now }: { title: string; list: Expression[]; engine: Engine; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number }) {
  return (
    <div className="panel">
      <h3 className="why__h">{title}</h3>
      {list.length ? (
        <ul className="elist">
          {list.map((e) => {
            const m = marketsByTicker.get(e.ticker);
            return (
              <li key={e.id}>
                <span className="elist__m">{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{expressionLabel(e, m)}</Link> : expressionLabel(e, m)}</span>
                <CompatCells engine={engine} e={e} />
                <span className="survt__k">{survivalText(e.survival)}</span>
                <SidePrice e={e} m={m} now={now} />
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">None.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ matchup tab

function MetricTable({ engine, dimension }: { engine: Engine; dimension: string }) {
  const ids = Object.values(engine.registry).filter((r) => r.dimension === dimension).map((r) => r.metric_id);
  const sides: ['home' | 'away', 'offense' | 'defense'][] = [['home', 'offense'], ['away', 'defense'], ['away', 'offense'], ['home', 'defense']];
  if (!ids.length) return null;
  return (
    <Scroll label={`${DIMENSION_WORD[dimension] ?? dimension} metrics`}><table className="mettab">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          {sides.map(([side, unit]) => <th key={`${side}${unit}`} scope="col">{engine.teams[side].name} {unit === 'offense' ? 'O' : 'D'}</th>)}
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const reg = engine.registry[id];
          return (
            <tr key={id}>
              <th scope="row">{reg.name}{reg.secondary_evidence ? <span className="mettab__tag">secondary</span> : null}{reg.regression_prone ? <span className="mettab__tag">regression-prone</span> : null}</th>
              {sides.map(([side, unit]) => {
                const row: MetricRow | undefined = engine.teams[side].metrics[`${unit}.${id}`];
                return (
                  <td key={`${side}${unit}`} title={row ? `raw ${fmtMetric(row.raw, reg.unit)} · ${row.adjusted_available ? `adjusted ${fmtMetric(row.adjusted, reg.unit)} ± ${fmtMetric(row.standard_error, reg.unit)}` : `not adjusted: ${row.adjusted_unavailable_reason ?? ''}`} · ${row.direction.replace(/_/g, ' ')} · ${row.games} games, prior weight ${row.prior_weight ?? '—'} · ${row.source ?? ''} · observed ${row.observed_at ?? '—'} · ${row.quality}` : 'not published'}>
                    {row ? (
                      <>
                        <span className="num">{fmtMetric(row.adjusted_available ? row.adjusted : row.raw, reg.unit)}</span>
                        <span className="mettab__sub">{row.adjusted_available ? 'adj' : 'raw'} · {row.rank ? `#${row.rank}/${row.universe_size}` : 'unranked'}{row.quality !== 'OK' ? ` · ${row.quality.toLowerCase().replace(/_/g, ' ')}` : ''}</span>
                      </>
                    ) : '—'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table></Scroll>
  );
}

export function EngineMatchupTab({ engine, homeAbbr, awayAbbr }: { engine: Engine; homeAbbr: string; awayAbbr: string }): ReactNode {
  const t = engine.teams.home;
  return (
    <>
      <EngineEdgesPanel engine={engine} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
      <Stratum id="g-findings" title="Matchup findings" sub="Deterministic findings from the opponent-adjusted profile. Each one names the metrics that produced it.">
        {engine.findings.length ? (
          <ul className="flist">
            {engine.findings.map((f) => (
              <li key={f.code}><FindingChip engine={engine} code={f.code} /></li>
            ))}
          </ul>
        ) : <p className="muted small">No finding clears its threshold and its own uncertainty.</p>}
      </Stratum>
      {['sustained_efficiency', 'rushing', 'passing', 'explosiveness', 'disruption', 'finishing', 'scoring', 'pace', 'volatility'].map((d) => (
        <Stratum key={d} id={`g-m-${d}`} title={DIMENSION_WORD[d]} sub={d === 'pace' || d === 'volatility' ? 'Descriptive tendencies and variance; some are not opponent-adjusted, and say so.' : undefined}>
          <MetricTable engine={engine} dimension={d} />
        </Stratum>
      ))}
      <p className="small muted">
        Season {t.season ?? '—'}, {t.window?.type?.replace(/_/g, ' ')} through {t.window?.through_exclusive ?? '—'} (exclusive). Ranks are within FBS; a non-FBS team is unranked.
        Adjustment: {engine.adjustment.stable ? 'stable' : 'not yet stable'} ({engine.adjustment.games_in_window} games, median FBS sample {engine.adjustment.median_fbs_games}).
      </p>
    </>
  );
}
