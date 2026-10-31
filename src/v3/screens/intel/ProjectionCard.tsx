// The projection surface. Two lanes, never blended: "SIFT model" (a real published model view for this game: version, as-of, the publication's
// own caveat) and "Market" (Kalshi). With no published model view the lane says why and shows nothing in its place. A price is the quote gate's
// answer and opens the exact-contract sheet; with no usable quote the market lane falls back to the publication's own midpoint view, labelled as such.
import { useGatedAsk } from '../../data/research/gameHooks';
import type { MarketView, ModelView, ProjectionRead } from '../../data/intel/projection';
import { modelLean } from '../../data/intel/projection';
import { dayClock } from '../../model/time';
import { PriceTap } from '../../nav/Targets';
import { LaneMark } from '../../ui/atoms';
import { TeamLogo } from '../../ui/TeamLogo';
import { useWinContracts } from '../GameOverview';
import type { GameCtx } from '../GameShared';

const pct = (p: number | null) => (p == null ? null : `${Math.round(p * 100)}%`);
const score = (n: number | null) => (n == null ? '—' : (Math.round(n * 10) / 10).toFixed(1));
const asOf = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? dayClock(t, Date.now(), undefined, ', ') : null; };

const ORIGIN_NOTE: Record<ModelView['origin'], string> = {
  approved: 'Approved SIFT projection',
  research: 'Research simulation, not an approved projection',
  cbb: 'Published pre-tip projection',
};

function ModelLane({ ctx, m }: { ctx: GameCtx; m: ModelView }) {
  const { g } = ctx;
  const lean = modelLean(m);
  const when = asOf(m.asOf);
  return (
    <div className="mi-lane mi-lane--sift" data-testid="sift-model" role="group" aria-label="SIFT model projection">
      <div className="mi-lane__h"><LaneMark lane="sift" /><b>SIFT model</b></div>
      <div className="mi-lane__sub">{ORIGIN_NOTE[m.origin]}</div>
      {([['away', g.away], ['home', g.home]] as const).map(([side, t]) => {
        const sc = side === 'away' ? m.awayScore : m.homeScore, win = pct(side === 'away' ? m.awayWin : m.homeWin);
        return (
          <div key={side} className={`mi-team${lean === side ? ' is-lead' : ''}`}>
            <TeamLogo team={t} size={22} />
            <span className="mi-team__n">{t.abbr}</span>
            <span className="mi-team__v num">{m.awayScore != null && m.homeScore != null ? <>{score(sc)}<small> {m.unit ?? 'pts'}</small></> : null}</span>
            <span className="mi-team__w num">{win ? <>{win}<small> to win</small></> : null}</span>
          </div>
        );
      })}
      {m.draw != null && <div className="mi-lane__r" data-testid="model-draw">Draw {pct(m.draw)}</div>}
      {m.range && <div className="mi-lane__r">80% range of points: {([['away', g.away], ['home', g.home]] as const).map(([s, t]) => { const r = m.range![s]; return r ? `${t.abbr} ${Math.round(r[0])}–${Math.round(r[1])}` : null; }).filter(Boolean).join(', ')}</div>}
      <div className="mi-lane__m">{m.version ? `Model ${m.version}` : 'Model version not published'}{when ? ` · ${m.asOfKind === 'published' ? 'published' : 'inputs cut off'} ${when}` : ' · as-of time not published'}</div>
      {m.caveat && <p className="mi-lane__c">{m.caveat}</p>}
    </div>
  );
}

function MarketLane({ ctx, market, priced }: { ctx: GameCtx; market: MarketView | null; priced: boolean }) {
  const { g } = ctx;
  const wins = useWinContracts(ctx);
  const ask = useGatedAsk(g, ctx.detail, ctx.startMs, wins.map((w) => w.ticker));
  const by = (team: 'away' | 'home') => { const w = wins.find((x) => x.team === team); return w ? { w, a: ask(w.ticker, w.price) } : null; };
  const live = priced ? [by('away'), by('home')] : [null, null];
  const usable = live[0]?.a != null && live[1]?.a != null;
  return (
    <div className="mi-lane mi-lane--mkt" data-testid="market-lane" role="group" aria-label="Market win prices">
      <div className="mi-lane__h"><LaneMark lane="market" /><b>Market</b></div>
      <div className="mi-lane__sub">{usable ? 'Kalshi asks, pre-fee' : market ? 'Kalshi midpoints as published' : 'Kalshi'}</div>
      {([['away', g.away], ['home', g.home]] as const).map(([side, t], i) => {
        const l = live[i], pub = pct(side === 'away' ? market?.awayWin ?? null : market?.homeWin ?? null);
        return (
          <div key={side} className="mi-team">
            <TeamLogo team={t} size={22} />
            <span className="mi-team__n">{t.abbr}</span>
            <span className="mi-team__v num">
              {usable && l ? <PriceTap ticker={l.w.ticker} className="mi-px" label={`${t.name} to win: open contract`}>{l.a}¢</PriceTap> : pub ?? '—'}
            </span>
            <span className="mi-team__w num">{usable ? <small>market-implied</small> : pub ? <small>implied</small> : null}</span>
          </div>
        );
      })}
      <div className="mi-lane__m">
        {usable ? 'Prices are the market’s, not SIFT’s.' : market ? `${market.label ?? 'Inferred from Kalshi midpoints'}. Not a current price.` : priced ? 'No current Kalshi win price is available for this game.' : 'Prices are not shown for a game that has started.'}
      </div>
    </div>
  );
}

export function ProjectionCard({ ctx, projection, priced }: { ctx: GameCtx; projection: ProjectionRead; priced: boolean }) {
  // A game that has started shows no market lane: its prices are not current, and nothing here registers a quote for it.
  const hasMarket = priced;
  return (
    <div className="x-card mx-sec mi-proj" role="region" aria-label="Projection" data-testid="intel-projection">
      <div className="mx-sh"><h2>Projection</h2><span className="x-note">model and market, kept apart</span></div>
      <div className={`mi-lanes${projection.model && hasMarket ? '' : ' mi-lanes--one'}`}>
        {projection.model ? <ModelLane ctx={ctx} m={projection.model} /> : (
          <div className="mi-lane mi-lane--sift mi-lane--none" data-testid="sift-model-absent" role="group" aria-label="SIFT model projection unavailable">
            <div className="mi-lane__h"><LaneMark lane="sift" /><b>SIFT model</b></div>
            <p className="mi-lane__c">No projection shown. {projection.absent}</p>
          </div>
        )}
        {hasMarket && <MarketLane ctx={ctx} market={projection.market} priced={priced} />}
      </div>
    </div>
  );
}
