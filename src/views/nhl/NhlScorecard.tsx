// The NHL scorecard: how projections, scripts, market disagreement and research candidates have actually
// performed, from the NHL learning report (metrics.json met_nhl.model_learning_stage → extensions.learning_v1).
// Sample sizes lead. Populations never mix: model-vs-market contracts, shadow research candidates, and actual
// routed wagers (only in the accounting ledger, not here). Nothing is called profitable or proven.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../components/ui';
import { evText, probText, readLearning, STAGE_WORD, type Learning } from '../../lib/nhl';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { PanelHead } from '../game/panels';
import { LearningBadge } from './parts';

/* eslint-disable @typescript-eslint/no-explicit-any */

const n0 = (v: any) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const f4 = (v: any) => (v == null ? '—' : Number(v).toFixed(4));
const SMALL = <span className="nsc__small" title="Fewer than 30 observations: noise, not evidence">small sample</span>;

function Section({ id, title, sub, children }: { id: string; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <PanelHead title={title} sub={sub} />
      <div id={id} />
      {children}
    </section>
  );
}

/** Every scorecard table scrolls inside its own region on narrow screens; the page itself never scrolls sideways. */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tscroll" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

function GroupTable({ label, g }: { label: string; g: Record<string, any> | null | undefined }) {
  const rows = Object.entries(g ?? {});
  if (!rows.length) return <p className="muted small">No settled rows for {label.toLowerCase()} yet.</p>;
  return (
    <div className="tscroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nsc__t">
        <thead><tr><th scope="col">{label}</th><th scope="col" className="r">n</th><th scope="col" className="r">Hit rate</th><th scope="col" className="r">Mean p</th><th scope="col" className="r">Shadow return / $ cost</th><th scope="col" className="r">Mean CLV</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k.replace(/_/g, ' ').toLowerCase()}{v.small_sample && SMALL}</th>
              <td className="r num">{n0(v.n)}</td>
              <td className="r num">{probText(v.hit_rate, 1)}</td>
              <td className="r num">{probText(v.mean_p, 1)}</td>
              <td className="r num">{v.shadow_return_per_cost == null ? '—' : `${(v.shadow_return_per_cost * 100).toFixed(1)}%`}</td>
              <td className="r num">{evText(v.mean_clv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Counts({ l }: { l: Learning }) {
  const c = l.counts ?? {};
  const items: [string, any][] = [
    ['Games projected', c.games_projected], ['Games settled', c.games_settled], ['Projection runs', c.projection_runs],
    ['Market snapshots', c.market_snapshots], ['Settled final-pregame contracts', c.final_pregame_contracts_settled],
    ['Research decisions', c.research_decisions], ['Script forecasts', c.script_forecasts], ['Script forecasts settled', c.script_forecasts_settled],
    ['Candidate CLV sample', c.candidate_clv_sample],
  ];
  return <ul className="nsc__counts">{items.map(([k, v]) => <li key={k}><b>{n0(v)}</b><span>{k}</span></li>)}</ul>;
}

/** A publisher note ("no settled … yet") as a sentence: capitalised, full stop. */
const sentence = (t: string | undefined) => (t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : undefined);

export function NhlScorecardView() {
  const { metrics, slug } = useSport();
  useVisit('NHL scorecard', 'sport');
  const l = readLearning(metrics);
  if (!l || l.status === 'UNAVAILABLE') {
    return (
      <div className="page">
        <h1 className="hbar__h">NHL scorecard</h1>
        <Notice title="No NHL learning report in this publication yet">{l?.reason ?? 'The NHL evaluation job writes it after games settle.'} Nothing is shown in its place.</Notice>
      </div>
    );
  }
  const p = l.probability ?? {};
  const st = l.stage;
  const sc = l.scripts ?? {};
  const rc = l.research_candidates ?? {};
  const scc = l.script_candidates ?? {};
  const pr = l.projection ?? {};
  return (
    <div className="page nsc">
      <header className="pagehead">
        <div className="eyebrow"><Link to={routes.sport(slug)}>NHL</Link> · Model</div>
        <h1 className="h-display">NHL Scorecard</h1>
        <p className="lede">How the NHL research engine has actually performed, from pregame snapshots scored after games settle. Report of {l.generated_at_utc?.slice(0, 16).replace('T', ' ')} UTC.</p>
      </header>
      <LearningBadge learning={l} slug={slug} />
      {l.status === 'STALE_LAST_RUN_FAILED' && <Notice tone="warn" title="The last evaluation step failed">{l.job?.learning_step}. These numbers are from the previous successful run.</Notice>}

      <Section id="nsc-sample" title="Sample" sub="What the scorecard rests on. Everything below is computed from immutable pregame snapshots once games settle.">
        <Counts l={l} />
      </Section>

      <div className="nsc__grid">
        <Section id="nsc-prob" title="Projection vs market" sub={p.population}>
          {p.n ? (
            <>
              <Scroll label="Projection vs market">
                <table className="nsc__t">
                  <thead><tr><th scope="col" /><th scope="col" className="r">Model</th><th scope="col" className="r">Market</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Brier (lower is better)</th><td className="r num">{f4(p.model?.brier)}</td><td className="r num">{f4(p.market?.brier)}</td></tr>
                    <tr><th scope="row">Log loss</th><td className="r num">{f4(p.model?.log_loss)}</td><td className="r num">{f4(p.market?.log_loss)}</td></tr>
                    <tr><th scope="row">Bias (mean p − hit rate)</th><td className="r num">{f4(p.model?.bias)}</td><td className="r num">{f4(p.market?.bias)}</td></tr>
                  </tbody>
                </table>
              </Scroll>
              <p className="small">{n0(p.n)} settled contracts. Mean disagreement {probText(p.mean_abs_disagreement, 1)} (model − market {p.mean_signed_model_minus_market != null ? `${(p.mean_signed_model_minus_market * 100).toFixed(1)} pts` : '—'}). The market moved toward the model {probText(p.market_moved_toward_model?.mean)} of the time (n {n0(p.market_moved_toward_model?.n)}).</p>
              {p.model?.calibration && (
                <details className="layer">
                  <summary className="layer__s">Calibration buckets</summary>
                  <div className="layer__b tscroll" tabIndex={0} role="region" aria-label="Calibration buckets">
                    <table className="nsc__t">
                      <thead><tr><th scope="col">Predicted</th><th scope="col" className="r">n</th><th scope="col" className="r">Mean predicted</th><th scope="col" className="r">Observed</th></tr></thead>
                      <tbody>{p.model.calibration.map((b: any) => <tr key={b.lo}><th scope="row">{probText(b.lo)}–{probText(b.hi)}</th><td className="r num">{n0(b.n)}</td><td className="r num">{probText(b.mean_p, 1)}</td><td className="r num">{probText(b.observed, 1)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          ) : <p className="muted small">No settled final-pregame contract yet.</p>}
        </Section>

        <Section id="nsc-proj" title="Expected goals" sub={pr.population}>
          {pr.n_games ? (
            <Scroll label="Expected goals">
              <table className="nsc__t">
                <tbody>
                  <tr><th scope="row">Games</th><td className="r num">{n0(pr.n_games)}{pr.small_sample && SMALL}</td></tr>
                  <tr><th scope="row">Total goals: mean absolute error</th><td className="r num">{pr.total_mae}</td></tr>
                  <tr><th scope="row">Total goals: bias (projected − actual)</th><td className="r num">{pr.total_bias}</td></tr>
                  <tr><th scope="row">Team goals: mean absolute error</th><td className="r num">{pr.team_goals_mae}</td></tr>
                  <tr><th scope="row">Home / away bias</th><td className="r num">{pr.home_bias} / {pr.away_bias}</td></tr>
                </tbody>
              </table>
            </Scroll>
          ) : <p className="muted small">No settled projection yet.</p>}
        </Section>
      </div>

      {(l.windows ?? []).length > 0 && (
        <Section id="nsc-win" title="By time before the puck drop" sub="The snapshot nearest each window, per contract (only windows the run cadence actually produced)">
          <Scroll label="By time before the puck drop">
            <table className="nsc__t">
              <thead><tr><th scope="col">Window</th><th scope="col" className="r">n</th><th scope="col" className="r">Model Brier</th><th scope="col" className="r">Market Brier</th><th scope="col" className="r">Mean disagreement</th></tr></thead>
              <tbody>{(l.windows ?? []).map((w: any) => <tr key={w.window}><th scope="row">{w.window}</th><td className="r num">{n0(w.n)}</td><td className="r num">{f4(w.model_brier)}</td><td className="r num">{f4(w.market_brier)}</td><td className="r num">{probText(w.mean_abs_disagreement, 1)}</td></tr>)}</tbody>
            </table>
          </Scroll>
        </Section>
      )}

      <Section id="nsc-scripts" title="Script model" sub={sc.population ?? 'NHL_SCRIPT_V1 forecasts scored against the realised script of each game'}>
        {sc.n_games ? (
          <>
            <Scroll label="Script model summary">
              <table className="nsc__t">
                <tbody>
                  <tr><th scope="row">Settled games</th><td className="r num">{n0(sc.n_games)}{sc.small_sample && SMALL}</td></tr>
                  <tr><th scope="row">Multiclass Brier (model / league base rate)</th><td className="r num">{sc.multiclass_brier} / {sc.base_rate_brier}</td></tr>
                  <tr><th scope="row">Log loss (model / base rate)</th><td className="r num">{sc.log_loss} / {sc.base_rate_log_loss}</td></tr>
                  <tr><th scope="row">Most likely script happened</th><td className="r num">{probText(sc.top_script_accuracy)}</td></tr>
                </tbody>
              </table>
            </Scroll>
            <Scroll label="Script model by script">
              <table className="nsc__t">
                <thead><tr><th scope="col">Script</th><th scope="col" className="r">Mean forecast</th><th scope="col" className="r">Happened</th><th scope="col" className="r">n</th></tr></thead>
                <tbody>{(sc.by_script ?? []).map((x: any) => <tr key={x.id}><th scope="row">{x.id.replace(/_/g, ' ').toLowerCase()}</th><td className="r num">{probText(x.mean_predicted)}</td><td className="r num">{probText(x.realized_share)}</td><td className="r num">{x.realized_n}</td></tr>)}</tbody>
              </table>
            </Scroll>
          </>
        ) : <p className="muted small">{sentence(sc.note) ?? 'No settled script forecast yet.'} {n0(l.counts?.script_forecasts)} forecasts are logged and will be scored as their games settle.</p>}
      </Section>

      <div className="nsc__grid">
        <Section id="nsc-cands" title="Research candidates (shadow)" sub={rc.population}>
          {rc.n ? (
            <>
              <p className="small">{n0(rc.n)} settled candidates · hit rate {probText(rc.hit_rate, 1)} vs mean conservative p {probText(rc.mean_p, 1)} · shadow return per $ of cost {rc.shadow_return_per_cost != null ? `${(rc.shadow_return_per_cost * 100).toFixed(1)}%` : '—'} · CLV {evText(rc.clv?.mean)}{rc.clv?.ci95 ? ` (95% interval ${evText(rc.clv.ci95[0])} to ${evText(rc.clv.ci95[1])}; ${rc.clv.ci_note ?? 'treats candidates as independent, so it is too narrow'})` : ''}.</p>
              <GroupTable label="By status" g={rc.by_status} />
              <GroupTable label="By market family" g={rc.by_family} />
              <GroupTable label="By edge after fee" g={rc.by_edge_bucket} />
              {rc.funded_research && <p className="small muted">Funded research (nominal stakes, never placed): {n0(rc.funded_research.n)} bets, {rc.funded_research.nominal_profit_dollars != null ? `$${rc.funded_research.nominal_profit_dollars}` : '—'} nominal. Reported apart from shadow results.</p>}
            </>
          ) : <p className="muted small">{rc.note ?? 'No settled research candidate yet.'}</p>}
        </Section>
        <Section id="nsc-robust" title="By robustness and script survival" sub={scc.population ?? 'NHL_SCRIPT_V1 candidates'}>
          {scc.n ? (
            <>
              <GroupTable label="By robustness" g={scc.by_robustness} />
              <GroupTable label="By survival" g={scc.by_survival} />
              <GroupTable label="By goalie dependency" g={scc.by_goalie_dependency} />
            </>
          ) : <p className="muted small">{scc.note ?? 'No settled script-layer candidate yet.'}</p>}
        </Section>
      </div>

      <Section id="nsc-unknown" title="What we still do not know">
        <ul className="nsc__unk">{(l.unknowns ?? []).map((u) => <li key={u}>{u}</li>)}</ul>
      </Section>

      {st && (
        <Section id="nsc-gates" title="Learning gates" sub={st.note}>
          <ol className="nsc__gates">{st.gates.map((g) => <li key={g.stage} className={g.stage === st.stage ? 'is-on' : ''}><b>{STAGE_WORD[g.stage] ?? g.stage}</b>: {g.rule}</li>)}</ol>
          {st.next_stage && <p className="small">Next: {STAGE_WORD[st.next_stage] ?? st.next_stage} — {Object.entries(st.progress_to_next).map(([k, v]) => `${k} ${n0(v.have)} of ${n0(v.need)}`).join(' · ')}.</p>}
        </Section>
      )}

      <Section id="nsc-versions" title="Versions" sub="Model changes stay auditable">
        <ul className="nsc__unk">{Object.entries(l.versions ?? {}).map(([k, v]) => <li key={k}><b>{k.replace(/_/g, ' ')}</b>: {v}</li>)}</ul>
        <p className="small muted">Actual routed wagers are reported only by the accounting ledger, never mixed with research candidates. <Link to={routes.sport(slug)}>Back to NHL</Link></p>
      </Section>
    </div>
  );
}
