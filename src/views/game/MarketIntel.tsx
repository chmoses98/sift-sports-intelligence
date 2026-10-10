// MARKET INTELLIGENCE + COMPARISON STUDIO (approved references 07 + 08) for a game's Markets tab.
//
// NFL: the best-supported expressions are the publication's own opportunities on this game when it flags any;
// otherwise the margin contracts that win across the most simulated scripts (script fit is exact for margin markets,
// lib/scripts.ts), shown as research comparisons, never as recommendations. Beside them: the projected score and the
// simulated total (published quantile bands, components/fxResearch), the win chance three published ways (market
// midpoints, the shadow model, the simulation's share) each labelled with its authority, the script distribution, and
// a three-column studio over any priced contracts (price with freshness, the model's research probability where it
// exists, the gap, script fit and the scripts two contracts share).
// CFB: the engine's BEST_EXPRESSION / multi-script survivors with their published thesis, script survival, risks and
// correlations, and a studio over up to three of them. No CFB price is a fair price: the engine publishes none.
// Nothing here changes an opportunity's status, a price rule, contract identity, fees or settlement.
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventResearchDoc, Market } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { Ring } from '../../components/fx';
import { CapabilityState, FreshChip, QuantileDist, ShareBar, type QPoint } from '../../components/fxResearch';
import { betPhrase } from '../../lib/betWords';
import { decisionOf } from '../../lib/decision';
import { gapText, type PriceRow } from '../../lib/gamedata';
import { routes } from '../../lib/routes';
import { sharePct, type ScriptSet } from '../../lib/scripts';
import { expressionLabel, groupedSurvivors, LABEL_WORD, orderedLabels, ROLE_INDEX, ROLE_WORD, SCORING_RESEARCH_NOTE, scriptTitle, winsWhenText, type Engine, type Expression } from '../../lib/scriptEngine';
import { useSportOpportunities } from '../../opportunity/load';
import { compareOpportunities, isLive } from '../../opportunity/rank';
import type { Opportunity } from '../../opportunity/types';
import { breakEven, kalshiFee } from '../../opportunity/pricing';
import { useSport } from '../../state/sport';
import { survivors } from './panels';
import { CompatCells, ConfidenceChip, SidePrice } from './ScriptEngine';

const c = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pc = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function Rail({ items, label }: { items: { id: string; label: string; sub: string; icon: string }[]; label: string }) {
  return (
    <nav className="fx-card fr-mi__rail" aria-label={label}>
      <h2 className="fx-card__t">Market views</h2>
      <ul>
        {items.map((x) => (
          <li key={x.id}><button type="button" className="fr-mi__ri" onClick={() => scrollTo(x.id)}><Icon name={x.icon} size={17} /><span><b>{x.label}</b><small>{x.sub}</small></span></button></li>
        ))}
      </ul>
    </nav>
  );
}

function FitDots({ fits, set }: { fits: ('yes' | 'part' | 'no')[]; set: ScriptSet }) {
  return (
    <span className="fr-fits" role="img" aria-label={set.scripts.map((s, i) => `${s.name}: ${fits[i] === 'yes' ? 'always wins' : fits[i] === 'part' ? 'wins in part' : 'loses'}`).join('; ')}>
      {fits.map((f, i) => <i key={set.scripts[i].id} className={`fr-fit fr-fit--${f} fr-fit--s${set.scripts[i].index}`} />)}
    </span>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function MarketIntel({ r, rows, set, slug, eventId, now, homeAbbr, awayAbbr, children }: { r: EventResearchDoc; rows: PriceRow[]; set: ScriptSet | null; slug: string; eventId: string; now: number; homeAbbr: string; awayAbbr: string; children?: ReactNode }) {
  const { repo } = useSport();
  const o = useSportOpportunities(repo, now);
  const mine = useMemo(() => o.opportunities.filter((x: Opportunity) => x.eventId === eventId && isLive(x)).sort(compareOpportunities), [o.opportunities, eventId]);
  const ext = r.extensions as any;
  const mi = ext?.market_implied;
  const mv = ext?.model_view;
  const env = ext?.game_script_inputs?.game_environment;
  const surv = set ? survivors(rows, null, set, 3) : [];
  const counts = rows.reduce<Record<string, number>>((a, x) => ({ ...a, [x.group]: (a[x.group] ?? 0) + 1 }), {});
  const totalPts: QPoint[] | null = env?.total?.range_90 && env?.total?.range_50 ? [{ p: 0.05, v: env.total.range_90[0] }, { p: 0.25, v: env.total.range_50[0] }, { p: 0.75, v: env.total.range_50[1] }, { p: 0.95, v: env.total.range_90[1] }] : null;
  const top = set ? [...set.scripts].sort((a, b) => b.share - a.share) : [];
  const rail = [
    { id: 'mi-best', label: 'Best expression', sub: mine.length ? 'Published opportunities' : 'Script fit · research', icon: 'star' },
    { id: 'mi-proj', label: 'Model projections', sub: 'Score · total range', icon: 'chart' },
    { id: 'mi-win', label: 'Win probability', sub: 'Market · model · sim', icon: 'compare' },
    { id: 'mi-studio', label: 'Comparison studio', sub: 'Up to three side by side', icon: 'layers' },
    { id: 'ov-markets-h', label: 'Top markets', sub: 'By script fit', icon: 'grid' },
    { id: 'g-markets', label: 'All markets', sub: `${rows.length} contracts · ${counts.spreads ?? 0} game lines · ${counts.props ?? 0} props`, icon: 'grid' },
  ];
  return (
    <div className="fr-mi">
      <Rail items={rail} label="Market views" />
      <div className="fr-mi__main fx-bento">
        <section className="fx-card fx-span-8 fr-best" id="mi-best" aria-labelledby="mi-best-h">
          <h2 className="fx-card__t" id="mi-best-h"><Icon name="star" size={17} /> Best-supported market expressions</h2>
          <p className="fx-card__sub">{mine.length ? 'The publication’s own opportunities on this game, ranked by its documented rule. ' : 'The publication flags no opportunity on this game: these are the margin contracts that win across the most simulated scripts — research comparisons, not recommendations. '}Not bets or advice.</p>
          {mine.length ? (
            <div className="fr-best__cards">
              {mine.slice(0, 3).map((x, i) => {
                const d = decisionOf(x.status, x.confidence.calibration);
                return (
                  <article key={x.id} className={`fr-ex${i === 0 ? ' fr-ex--lead' : ''}`}>
                    <span className={`dword dword--${d.tone}`}>{d.word}</span>
                    <h3 className="fr-ex__t"><Link to={x.href}>{betPhrase(x.what.side, x.what.title).text}</Link></h3>
                    <dl className="fr-ex__dl">
                      <div><dt>{x.what.side} ask</dt><dd className="fx-num fr-gold">{c(x.price.ask)}</dd></div>
                      <div><dt>Publication fair</dt><dd className="fx-num">{x.price.fair == null ? '—' : pc(x.price.fair)}</dd></div>
                    </dl>
                    <p className="fr-ex__why">{x.why}</p>
                    {x.risk && <p className="fr-ex__risk"><Icon name="flame" size={14} /> {x.risk}</p>}
                    <FreshChip at={x.price.observedAt} now={now} />
                  </article>
                );
              })}
            </div>
          ) : surv.length && set ? (
            <div className="fr-best__cards">
              {surv.map((x, i) => (
                <article key={x.m.market_id} className={`fr-ex${i === 0 ? ' fr-ex--lead' : ''}`}>
                  <span className="fr-ex__tag">{i === 0 ? 'Widest script support' : 'Alternative'}</span>
                  <h3 className="fr-ex__t"><Link to={routes.market(slug, x.m.market_id, eventId)}>{x.label}</Link></h3>
                  <dl className="fr-ex__dl">
                    <div><dt>YES ask</dt><dd className="fx-num fr-gold">{c(x.ask)}</dd></div>
                    <div><dt>Model <small>research</small></dt><dd className="fx-num">{pc(x.model)}</dd></div>
                  </dl>
                  <p className="fr-ex__fit"><FitDots fits={x.fit!.fits} set={set} /> wins outright in scripts holding <b>{sharePct(x.fit!.coverage)}</b> of simulated games{x.similar ? ` · +${x.similar} similar` : ''}</p>
                  <span className="fr-ex__bar" aria-hidden="true"><i style={{ width: `${x.fit!.coverage * 100}%` }} /></span>
                  <FreshChip at={x.m.captured_at} now={now} />
                </article>
              ))}
            </div>
          ) : <CapabilityState title="No expression to feature">Neither a published opportunity nor a margin contract with multi-script support exists for this game.</CapabilityState>}
        </section>

        <section className="fx-card fx-span-4 fr-thesis" aria-labelledby="mi-th-h">
          <h2 className="fx-card__t" id="mi-th-h"><Icon name="research" size={17} /> Game thesis</h2>
          <p className="fr-note fr-thesis__src">The NFL publication writes no prose thesis for this game; these are its published numbers, side by side.</p>
          <ul className="fr-thesis__l">
            {mi?.implied_spread != null && <li><span className="fr-rows__ic fr-rows__ic--cyan"><Icon name="chart" size={15} /></span><div><b>Market</b><p>{homeAbbr} {mi.implied_spread > 0 ? '+' : ''}{Number(mi.implied_spread).toFixed(1)} · total {Number(mi.implied_total_median).toFixed(1)} <small>(midpoints)</small></p></div></li>}
            {mv?.model_spread != null && <li><span className="fr-rows__ic fr-rows__ic--gold"><Icon name="bolt" size={15} /></span><div><b>Model view</b><p>{homeAbbr} {mv.model_spread > 0 ? '+' : ''}{Number(mv.model_spread).toFixed(1)} · total {Number(mv.model_total).toFixed(1)} <small>(research)</small></p></div></li>}
            {top[0] && <li><span className={`fr-rows__ic fr-rows__ic--s${top[0].index}`}><Icon name="layers" size={15} /></span><div><b>Most common script</b><p>{top[0].name} · {sharePct(top[0].share)} of simulated games</p></div></li>}
            {top[1] && <li><span className="fr-rows__ic fr-rows__ic--red"><Icon name="shield" size={15} /></span><div><b>Primary risk</b><p>{top[1].name} ({sharePct(top[1].share)} of simulated games end this way instead)</p></div></li>}
          </ul>
        </section>

        <section className="fx-card fx-span-4" id="mi-proj" aria-labelledby="mi-proj-h">
          <h2 className="fx-card__t" id="mi-proj-h"><Icon name="chart" size={17} /> Model projections</h2>
          {mv?.model_score ? (
            <div className="fr-score">
              {[awayAbbr, homeAbbr].map((t) => (
                <div key={t} className="fr-score__t"><TeamMark sport="NFL" abbr={t} size="md" /><b className="fx-num">{Number(mv.model_score[t]).toFixed(1)}</b><small>projected · mkt {mi?.implied_score?.[t] != null ? Number(mi.implied_score[t]).toFixed(1) : '—'}</small></div>
              ))}
            </div>
          ) : null}
          {totalPts ? (
            <>
              <span className="fr-k">Simulated total points</span>
              <QuantileDist points={totalPts} line={mi?.implied_total_median ?? env?.centre?.total ?? null} projection={env.total.mean} label="Simulated total points" format={(v) => String(Math.round(v))} bins={22} height={150} />
            </>
          ) : <CapabilityState title="No simulated total">The publication attached no game environment for this game.</CapabilityState>}
          <p className="fr-note">Model score is the shadow model’s (research); the range is the simulation’s published middle half and nine-in-ten bands, marked against the market’s centre.</p>
        </section>

        <section className="fx-card fx-span-4" id="mi-win" aria-labelledby="mi-win-h">
          <h2 className="fx-card__t" id="mi-win-h"><Icon name="compare" size={17} /> Win probability · {homeAbbr}</h2>
          <div className="fr-rings">
            {mi?.win_probability?.[homeAbbr] != null && <figure><Ring value={mi.win_probability[homeAbbr]} label={`Market-implied ${homeAbbr} win ${pc(mi.win_probability[homeAbbr])}`} tone="cyan" size={84} /><figcaption>Market<small>midpoints</small></figcaption></figure>}
            {mv?.model_win_probability?.[homeAbbr] != null && <figure><Ring value={mv.model_win_probability[homeAbbr]} label={`Shadow model ${homeAbbr} win ${pc(mv.model_win_probability[homeAbbr])}, research`} tone="gold" size={84} /><figcaption>Model<small>research</small></figcaption></figure>}
            {env?.p_home_win != null && <figure><Ring value={env.p_home_win} label={`${homeAbbr} won ${pc(env.p_home_win)} of simulated games`} tone="violet" size={84} /><figcaption>Simulation<small>share of games</small></figcaption></figure>}
          </div>
          {!mi?.win_probability && !mv?.model_win_probability && env?.p_home_win == null && <p className="fr-note">No win probability is published for this game.</p>}
          <p className="fr-note">Three published numbers with three authorities. The model is behind the market on game outcomes in its own record; none of these is a validated edge.</p>
        </section>

        <section className="fx-card fx-span-4" aria-labelledby="mi-sd-h">
          <h2 className="fx-card__t" id="mi-sd-h"><Icon name="layers" size={17} /> Game script distribution</h2>
          {top.length ? (
            <ul className="fr-sdist">
              {top.map((s) => <li key={s.id}><span><i className={`fr-dot fr-dot--s${s.index}`} />{s.name}</span><ShareBar value={s.share} tone={s.index} label={`${sharePct(s.share)} of simulated games`} /><b className="fx-num">{sharePct(s.share)}</b></li>)}
            </ul>
          ) : <p className="fr-note">No simulated scripts for this game.</p>}
          <p className="fr-note">Each script has different market implications. <Link to={routes.game(slug, eventId, { tab: 'script' })}>Explore the Script Theater →</Link></p>
        </section>

        <section className="fx-card fx-span-12" id="mi-studio" aria-labelledby="mi-studio-h">
          <PriceStudio rows={rows} set={set} slug={slug} eventId={eventId} now={now} seed={surv.map((x) => x.m.market_id)} />
        </section>
        {children && <div className="fx-span-12">{children}</div>}
      </div>
    </div>
  );
}

/** Up to three priced contracts side by side. The pair of scripts two contracts both always win in is exact for
 * margin markets (settlement on the final margin); other markets carry no script fit and say so. */
function PriceStudio({ rows, set, slug, eventId, now, seed }: { rows: PriceRow[]; set: ScriptSet | null; slug: string; eventId: string; now: number; seed: string[] }) {
  const [sp, setSp] = useSearchParams();
  const pool = useMemo(() => rows.filter((x) => x.ask != null && x.ask >= 0.05 && x.ask <= 0.95 && x.model != null).sort((a, b) => (b.fit?.coverage ?? -1) - (a.fit?.coverage ?? -1) || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0)), [rows]);
  const want = (sp.get('cmp') ?? '').split(',').filter(Boolean);
  const ids = [0, 1, 2].map((i) => want[i] ?? seed[i] ?? pool.filter((x) => !seed.includes(x.m.market_id))[i - seed.length]?.m.market_id).filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const cols = ids.map((id) => pool.find((x) => x.m.market_id === id) ?? rows.find((x) => x.m.market_id === id)).filter((x): x is PriceRow => !!x).slice(0, 3);
  const setCol = (i: number, id: string) => setSp((p) => { const n = new URLSearchParams(p); const next = [...cols.map((x) => x.m.market_id)]; next[i] = id; n.set('cmp', next.join(',')); return n; }, { replace: true });
  if (!cols.length) return <><h2 className="fx-card__t" id="mi-studio-h"><Icon name="layers" size={17} /> Market comparison studio</h2><p className="fr-note">No priced contract with a model price to compare.</p></>;
  const shared = (a: PriceRow, b: PriceRow) => (set && a.fit && b.fit ? set.scripts.filter((_, i) => a.fit!.fits[i] === 'yes' && b.fit!.fits[i] === 'yes') : null);
  const opposite = (a: PriceRow, b: PriceRow) => !!(set && a.fit && b.fit && set.scripts.every((_, i) => (a.fit!.fits[i] === 'yes' && b.fit!.fits[i] === 'no') || (a.fit!.fits[i] === 'no' && b.fit!.fits[i] === 'yes')));
  return (
    <>
      <h2 className="fx-card__t" id="mi-studio-h"><Icon name="layers" size={17} /> Market comparison studio</h2>
      <p className="fx-card__sub">Compare up to three contracts on this game: price and its age, the model’s research probability, the gap, and the scripts each wins in. Replace any column.</p>
      <div className="fr-studio" style={{ ['--n' as string]: cols.length }}>
        {cols.map((x, i) => {
          const others = cols.filter((y) => y !== x);
          return (
            <article key={x.m.market_id} className={`fr-stc fr-stc--${i + 1}`} aria-label={x.label}>
              <span className="fr-stc__n" aria-hidden="true">{i + 1}</span>
              <label className="term__sel fr-stc__sel"><span>Contract {i + 1}</span>
                <select value={x.m.market_id} onChange={(e) => setCol(i, e.target.value)}>{pool.map((y) => <option key={y.m.market_id} value={y.m.market_id}>{y.label}</option>)}</select>
              </label>
              <h3 className="fr-stc__t"><Link to={routes.market(slug, x.m.market_id, eventId)}>{x.label}</Link></h3>
              <dl className="fr-stc__dl">
                <div><dt>YES ask</dt><dd className="fx-num fr-gold">{c(x.ask)}</dd><dd className="fr-tile__s">break-even {pc(breakEven(x.ask, kalshiFee(x.ask)))}</dd></div>
                <div><dt>Model <small>research</small></dt><dd className="fx-num">{pc(x.model)}</dd><dd className="fr-tile__s">market mid {pc(x.mid)}</dd></div>
                <div><dt>Model − mkt</dt><dd className={`fx-num fr-d fr-d--${x.gap == null || Math.abs(x.gap) < 0.005 ? 'flat' : x.gap > 0 ? 'up' : 'down'}`}>{gapText(x.gap)}</dd><dd className="fr-tile__s">pts · not an edge</dd></div>
              </dl>
              <div className="fr-stc__fit">
                <span className="fr-k">Script fit</span>
                {x.fit && set ? <><FitDots fits={x.fit.fits} set={set} /><span className="fr-tile__s">always wins in {sharePct(x.fit.coverage)} of simulated games</span></> : <span className="fr-tile__s">No script fit: needs a joint margin × points output the publication does not carry.</span>}
              </div>
              <div className="fr-stc__fit">
                <span className="fr-k">With the others</span>
                <ul className="fr-stc__rel">
                  {others.map((y) => {
                    const sh = shared(x, y);
                    return <li key={y.m.market_id}>{opposite(x, y) ? <><Icon name="close" size={13} /> Opposite outcome to <b>{y.label}</b></> : sh ? <>{sh.length ? <><Icon name="check" size={13} /> Both win in {sh.map((s) => s.name).join(', ')}</> : <>No script where both always win with <b>{y.label}</b></>}</> : <>Shared exposure with <b>{y.label}</b> unknown (no script fit)</>}</li>;
                  })}
                </ul>
              </div>
              <FreshChip at={x.m.captured_at} now={now} />
            </article>
          );
        })}
      </div>
      <p className="fr-note">Same game, one exposure: contracts that win in the same scripts are not independent edges. Correlation coefficients are not published, so none is shown.</p>
    </>
  );
}

// ------------------------------------------------------------------ CFB

export function EngineMarketIntel({ engine, marketsByTicker, slug, eventId, now }: { engine: Engine; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number }) {
  const [sp, setSp] = useSearchParams();
  const best = useMemo(() => {
    const g = groupedSurvivors(engine);
    return [...g.filter((e) => e.labels.includes('BEST_EXPRESSION')), ...g.filter((e) => !e.labels.includes('BEST_EXPRESSION'))];
  }, [engine]);
  const want = (sp.get('cmp') ?? '').split(',').filter(Boolean);
  const studio = [0, 1, 2].map((i) => best.find((e) => e.id === want[i]) ?? best[i]).filter((e, i, a): e is (typeof best)[number] => !!e && a.indexOf(e) === i);
  const setCol = (i: number, id: string) => setSp((p) => { const n = new URLSearchParams(p); const next = studio.map((e) => e.id); next[i] = id; n.set('cmp', next.join(',')); return n; }, { replace: true });
  const losesIn = (e: Expression) => engine.scripts.filter((_, j) => e.compat[j] === 'CONTRADICTED');
  const read = engine.read;
  return (
    <div className="fr-mi fr-mi--cfb">
      <Rail label="Market views" items={[
        { id: 'mi-best', label: 'Best expression', sub: 'Engine survivors', icon: 'star' },
        { id: 'mi-studio', label: 'Comparison studio', sub: 'Up to three side by side', icon: 'layers' },
        { id: 'g-engine-survivors', label: 'Script survival', sub: 'Every featured contract', icon: 'grid' },
        { id: 'g-markets', label: 'All markets', sub: `${marketsByTicker.size} contracts`, icon: 'grid' },
      ]} />
      <div className="fr-mi__main fx-bento">
        <section className="fx-card fx-span-8 fr-best" id="mi-best" aria-labelledby="mi-best-h">
          <h2 className="fx-card__t" id="mi-best-h"><Icon name="star" size={17} /> Best-supported market expressions</h2>
          <p className="fx-card__sub">The engine’s best expression of each football thesis, by script survival — built after the scripts were frozen. Research only: CFB publishes no fair price, so nothing here is an edge.</p>
          {best.length ? (
            <div className="fr-best__cards">
              {best.slice(0, 3).map((e, i) => {
                const m = marketsByTicker.get(e.ticker);
                const lose = losesIn(e);
                return (
                  <article key={e.id} className={`fr-ex${i === 0 ? ' fr-ex--lead' : ''}`}>
                    <span className="fr-ex__tag">{orderedLabels(e.labels).filter((l) => l !== 'RESEARCH_ONLY').slice(0, 2).map((l) => LABEL_WORD[l] ?? l).join(' · ') || 'Survivor'}</span>
                    <h3 className="fr-ex__t">{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{expressionLabel(e, m)}</Link> : expressionLabel(e, m)}</h3>
                    <dl className="fr-ex__dl">
                      <div><dt>{e.side} ask</dt><dd className="fx-num fr-gold"><SidePrice e={e} m={m} now={now} /></dd></div>
                      <div><dt>Script survival</dt><dd className="fx-num">{e.survival.supported}/{e.survival.total_scripts}</dd></div>
                    </dl>
                    <p className="fr-ex__fit"><CompatCells engine={engine} e={e} /> {winsWhenText(e, engine) ?? ''}</p>
                    <p className="fr-ex__risk"><Icon name="shield" size={14} /> {lose.length ? `Loses in the ${lose.map((s) => ROLE_WORD[s.role].toLowerCase()).join(' and ')} script` : 'No script the engine built contradicts it'}</p>
                    <FreshChip at={m?.captured_at} now={now} />
                  </article>
                );
              })}
            </div>
          ) : <CapabilityState title="No expression mapped for this game">The engine mapped no contract to these scripts (no best or multi-script expression survives). Sift features none rather than inventing one; every contract is still listed under All markets.</CapabilityState>}
          {engine.scoringResearchOnly && <p className="fr-note" role="note">{SCORING_RESEARCH_NOTE}</p>}
        </section>
        <section className="fx-card fx-span-4 fr-thesis" aria-labelledby="mi-th-h">
          <h2 className="fx-card__t" id="mi-th-h"><Icon name="research" size={17} /> Game thesis <ConfidenceChip level={engine.confidence.level} /></h2>
          <p className="fr-thesis__head">{read.headline}</p>
          <ul className="fr-thesis__l">
            {engine.scripts.map((s) => <li key={s.script_id}><span className={`fr-rows__ic fr-rows__ic--s${ROLE_INDEX[s.role]}`}><Icon name="layers" size={15} /></span><div><b>{ROLE_WORD[s.role]}</b><p>{scriptTitle(s)}</p></div></li>)}
          </ul>
          <p className="fr-note">Market-blind football read; scripts are ranked by evidence, never priced.</p>
        </section>
        <section className="fx-card fx-span-12" id="mi-studio" aria-labelledby="mi-studio-h">
          <h2 className="fx-card__t" id="mi-studio-h"><Icon name="layers" size={17} /> Market comparison studio</h2>
          {studio.length ? (
            <>
              <p className="fx-card__sub">Up to three engine expressions side by side: price and its age, what each needs, the scripts it survives and the correlations the engine publishes between them.</p>
              <div className="fr-studio" style={{ ['--n' as string]: studio.length }}>
                {studio.map((e, i) => {
                  const m = marketsByTicker.get(e.ticker);
                  const ask = e.side === 'YES' ? m?.yes_ask : m?.no_ask;
                  const corr = e.correlation.filter((x) => studio.some((o) => o.id === x.with));
                  return (
                    <article key={e.id} className={`fr-stc fr-stc--${i + 1}`} aria-label={expressionLabel(e, m)}>
                      <span className="fr-stc__n" aria-hidden="true">{i + 1}</span>
                      <label className="term__sel fr-stc__sel"><span>Expression {i + 1}</span>
                        <select value={e.id} onChange={(ev) => setCol(i, ev.target.value)}>{best.map((x) => <option key={x.id} value={x.id}>{expressionLabel(x, marketsByTicker.get(x.ticker))}</option>)}</select>
                      </label>
                      <h3 className="fr-stc__t">{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{expressionLabel(e, m)}</Link> : expressionLabel(e, m)}</h3>
                      <dl className="fr-stc__dl">
                        <div><dt>{e.side} ask</dt><dd className="fx-num fr-gold"><SidePrice e={e} m={m} now={now} /></dd><dd className="fr-tile__s">break-even {pc(breakEven(ask != null && ask > 0 && ask < 1 ? ask : null, kalshiFee(ask != null && ask > 0 && ask < 1 ? ask : null)))}</dd></div>
                        <div><dt>Model probability</dt><dd className="fx-num fr-muted">—</dd><dd className="fr-tile__s">not published (CFB)</dd></div>
                        <div><dt>Survives</dt><dd className="fx-num">{e.survival.supported}/{e.survival.total_scripts}</dd><dd className="fr-tile__s">scripts, not a probability</dd></div>
                      </dl>
                      <div className="fr-stc__fit"><span className="fr-k">Script fit</span><CompatCells engine={engine} e={e} /><span className="fr-tile__s">{winsWhenText(e, engine)}</span></div>
                      <div className="fr-stc__fit"><span className="fr-k">Correlation (published)</span>
                        {corr.length ? <ul className="fr-stc__rel">{corr.map((x) => { const o = studio.find((s) => s.id === x.with)!; return <li key={x.with}>{x.relation.replace(/_/g, ' ')} with <b>{expressionLabel(o, marketsByTicker.get(o.ticker))}</b>{x.both_lose_when ? ` · both lose when ${x.both_lose_when}` : ''}</li>; })}</ul> : <span className="fr-tile__s">None published with the other columns.</span>}
                      </div>
                      <FreshChip at={m?.captured_at} now={now} />
                    </article>
                  );
                })}
              </div>
            </>
          ) : <CapabilityState title="Nothing to compare yet">The engine published no expression for this game. A comparison needs at least one mapped contract; Sift does not compare unmapped prices as if they carried football support.</CapabilityState>}
        </section>
      </div>
    </div>
  );
}
