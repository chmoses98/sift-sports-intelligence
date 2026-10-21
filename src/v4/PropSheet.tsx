// The research sheet for a prop row. A contract the opportunity layer holds a published opportunity for opens the
// existing v4 research sheet (the same evidence, risks, prices and authority). A prop with no published opportunity
// opens research-only details: the comparison, the projection, the matchup, the published risks and the sources, with
// an explicit statement that no signal covers it. Nothing here manufactures a signal or recommends a bet.
import { useCallback, useMemo, useState } from 'react';
import { Link } from '../routing';
import { Icon } from './Icon';
import { useSheet } from './sheet';
import { ResearchSheet } from './ResearchSheet';
import { SaveControl } from './SaveControl';
import { DifferenceNote, ProjectionStatus, RangeBar, SourceList } from './PropParts';
import { classifyDifference, projectionWhy, propHref as v4PropHref, rungView, type PropSide } from './propsModel';
import { agoWord } from './words';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { fmtValue, type PropRow } from '../insights/propBoard';
import { isFrozen } from '../lib/lifecycle';
import { routes } from '../lib/routes';
import { opportunitiesByMarket } from '../views/props/ranking';
import { matchupSentence } from '../views/props/model';

export interface PropCtx {
  row: PropRow;
  slug: string;
  eventId: string;
  kickoff: string;
  status: string | null;
  game: string;
  researchAt: string | null;
  side: PropSide;
  /** The rung the viewer picked (a market id); the main line when null. */
  marketId: string | null;
  /** Opened from the player's own page: the sheet offers Done rather than a link back to it. */
  fromDetail?: boolean;
}

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** The tray item for a prop's contract: the same MARKET item the app's SaveButton writes, with the same link, so it is on My Board everywhere. */
export function propSave(ctx: Pick<PropCtx, 'row' | 'slug' | 'eventId' | 'kickoff' | 'status'>, marketId?: string | null) {
  const { row } = ctx;
  const rung = row.ladder.find((x) => x.market.market_id === marketId) ?? row.main;
  if (!rung) return null;
  return {
    sport: 'NFL', id: rung.market.market_id, extra: { market_id: rung.market.market_id, event_id: ctx.eventId }, kickoff: ctx.kickoff, eventStatus: ctx.status,
    label: {
      label: `${row.name} ${row.def.label.toLowerCase()} ${rung.market.threshold}+`.trim(),
      sub: `Over ${cents(rung.yesAsk)} · under ${cents(rung.noAsk)}`,
      href: `${routes.props(ctx.slug, { game: ctx.eventId })}&prop=${encodeURIComponent(row.id)}`,
      kickoff: ctx.kickoff,
    },
  };
}

/** Opens the research for a prop row in the v4 sheet. */
export function usePropResearch() {
  const sheet = useSheet();
  return useCallback((ctx: PropCtx) => sheet.open(<PropResearch ctx={ctx} />, { label: `Research: ${ctx.row.name} ${ctx.row.def.label}` }), [sheet]);
}

export function PropResearch({ ctx }: { ctx: PropCtx }) {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const byMarket = useMemo(() => opportunitiesByMarket(all.opportunities, 'NFL'), [all.opportunities]);
  const rung = ctx.row.ladder.find((x) => x.market.market_id === ctx.marketId) ?? ctx.row.main;
  const opp = rung ? byMarket.get(rung.market.market_id) : undefined;
  if (all.loading && !all.opportunities.length) {
    return <div className="v4-sbody" role="status" aria-label="Loading research"><div className="v4-skel" style={{ height: 120, marginTop: 24 }} /></div>;
  }
  if (opp) return <ResearchSheet o={opp} g={null} />;
  return <ResearchOnly ctx={ctx} now={now} />;
}

function ResearchOnly({ ctx, now }: { ctx: PropCtx; now: number }) {
  const { close } = useSheet();
  const { row } = ctx;
  const [side, setSide] = useState<PropSide>(ctx.side);
  const rung = row.ladder.find((x) => x.market.market_id === ctx.marketId) ?? row.main;
  const view = rung ? rungView(rung, side, rung.market.market_id === row.main?.market.market_id, now) : null;
  const frozen = isFrozen(ctx.kickoff, now, ctx.status);
  const diff = classifyDifference(view, projectionWhy(row), new Map());
  const mu = matchupSentence(row);
  const save = propSave(ctx, rung?.market.market_id ?? null);
  const fmt = (v: number) => fmtValue(v, row.def);
  const title = `${row.name} ${row.def.label.toLowerCase()} ${rung ? `${rung.market.threshold}+` : ''}`.trim();
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t">
          <h2 data-autofocus tabIndex={-1}>{title}</h2>
          <p className="v4-shead__m">{ctx.game}</p>
        </div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close research"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody">
        <span className={`v4-auth v4-auth--frozen`}><Icon name={frozen ? 'lock-simple' : 'info'} />{frozen ? 'Pregame research · frozen at kickoff' : 'Research only · no published signal on this contract'}</span>

        {rung && (
          <section className="v4-sblock" aria-label="Model and market on the same side">
            <h3>Model and Kalshi, same side</h3>
            <div className="v4-seg" role="group" aria-label="Side" style={{ margin: '0 0 8px' }}>
              <button type="button" aria-pressed={side === 'over'} onClick={() => setSide('over')}>Over {rung.market.threshold}+ (Yes)</button>
              <button type="button" aria-pressed={side === 'under'} onClick={() => setSide('under')}>Under (No)</button>
            </div>
            <div className="v4-kv"><span className="v4-kv__k">Kalshi ask</span><span className="v4-kv__v">{view ? cents(view.quote.ask) : '—'}<em>{view?.quote.ask == null ? 'No quote published' : view.quote.executable ? `${agoWord(view.quote.ageMs)}` : view.quote.freshness === 'UNKNOWN' ? 'No capture time: not treated as current' : `Stale (${agoWord(view.quote.ageMs)}): context only, not executable`}</em></span></div>
            <div className="v4-kv"><span className="v4-kv__k">Kalshi fee</span><span className="v4-kv__v">{cents(view?.fee)}</span></div>
            <div className="v4-kv"><span className="v4-kv__k">Break-even after fee</span><span className="v4-kv__v">{pct(view?.breakEven)}</span></div>
            <div className="v4-kv"><span className="v4-kv__k">Model probability</span><span className="v4-kv__v">{pct(view?.model)}<em>{view?.model == null ? (projectionWhy(row) ?? 'The projection prices no probability on this line') : row.projectionStatus.kind === 'authoritative' ? 'From the selected projection' : 'Established simulation, research only'}</em></span></div>
            <div className="v4-kv"><span className="v4-kv__k">Model minus break-even</span><span className="v4-kv__v">{view?.points == null ? '—' : `${view.points > 0 ? '+' : view.points < 0 ? '−' : ''}${Math.abs(view.points)} pts`}<em>Context, not a recommendation</em></span></div>
          </section>
        )}
        <DifferenceNote d={diff} view={view} />

        <section className="v4-sblock"><h3>Projection</h3>
          {row.projection != null && <p style={{ marginBottom: 8 }}>SIFT projects <b className="num" style={{ color: 'var(--model)' }}>{fmt(row.projection)}</b> against a Kalshi line of <b className="num" style={{ color: 'var(--mkt)' }}>{row.line ?? '—'}</b>.</p>}
          <RangeBar row={row} />
          <ProjectionStatus row={row} />
        </section>

        {mu && <section className="v4-sblock"><h3>Matchup</h3><p>{mu.text}</p></section>}

        {row.risks.length > 0 && (
          <section className="v4-sblock v4-sblock--risk"><h3>Published risks</h3><ul className="v4-sbullets v4-sbullets--risk">{row.risks.slice(0, 5).map((x) => <li key={x}>{x}</li>)}</ul></section>
        )}

        <section className="v4-sblock"><h3>Sources</h3>
          <SourceList row={row} researchAt={ctx.researchAt} kickoff={ctx.kickoff} quoteAt={rung?.market.captured_at ?? null} frozen={frozen} now={now} />
        </section>
        <p className="meta" style={{ marginTop: 18 }}>Research only. No published research signal covers this contract, so nothing here is a signal or a recommendation, and SIFT does not recommend a bet.</p>
      </div>
      <div className="v4-sfoot">
        {save && <SaveControl {...save} variant="button" />}
        {ctx.fromDetail
          ? <button type="button" className="v4-btn" onClick={close}>Done</button>
          : <Link to={v4PropHref(ctx.slug, ctx.eventId, row.playerId, row.def.stat)} className="v4-btn" onClick={close}>Open player</Link>}
      </div>
    </>
  );
}
