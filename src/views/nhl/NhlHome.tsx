// The NHL home: the model's learning state first (real sample counts), then the next game, today's slate with
// goalies and the most likely script, the strongest opponent-adjusted matchup edges, research candidates ranked by
// script survival, and the way to the scorecard. Loads the board, then each listed game's event research on
// demand (never team, player, ranking or series documents).
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { publicationView, QuoteChip } from '../../components/LiveQuote';
import { ErrorState, Skeleton, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { compact, kickoff } from '../../lib/format';
import { candidateTitle, evText, isNhlScripts, probText, readFindings, readLearning, readNhl, survivalText, type NhlCandidate, type NhlFinding } from '../../lib/nhl';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { sides, useSlateResearch } from '../home/cards';
import { PanelHead, ViewAll } from '../game/panels';
import { BasisChip, LearningBadge, lowerLabel, ResearchOnly, ScriptDot, StatusChip, TierChip } from './parts';

/* eslint-disable @typescript-eslint/no-explicit-any */

function goalieLine(r: EventResearchDoc | undefined): string | null {
  const gs = ((r?.context?.lineups ?? []) as any[]).filter((l) => l.kind === 'goalie_status');
  if (!gs.length) return null;
  return gs.map((g) => `${g.team} ${g.current?.player_name ?? 'TBD'} (${String(g.current?.status ?? 'unknown').toLowerCase()})`).join(' · ');
}

function until(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'Puck dropped';
  const h = Math.floor(ms / 3600e3);
  const m = Math.round((ms % 3600e3) / 60e3);
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

function GameState({ r }: { r: EventResearchDoc | null | undefined }) {
  if (r === undefined) return <span className="ntile__g">Reading research…</span>;
  if (r === null) return <span className="ntile__warn">No event research published</span>;
  const s = readNhl(r);
  if (!s) return null;
  if (!isNhlScripts(s)) return <span className="ntile__warn" title={s.reason}>{s.status === 'NOT_SIMULATED' ? 'No game scripts yet' : 'Script layer unavailable for this game'}</span>;
  const lead = s.scripts[0];
  const ok = s.candidates.filter((c) => c.governance.status !== 'REJECTED' && (c.robustness === 'ROBUST' || c.robustness === 'MODERATE')).length;
  return (
    <>
      <span className="ntile__s"><ScriptDot tone={lead.tone} />Most likely: {lead.label} <b className="num">&nbsp;{probText(lead.probability)}</b></span>
      <span className="ntile__c">{ok ? `${ok} robust or moderate research candidate${ok === 1 ? '' : 's'}` : 'No robust or moderate research candidate'}</span>
    </>
  );
}

function Tile({ item, r, slug, now }: { item: BoardItem; r: EventResearchDoc | null | undefined; slug: string; now: number }) {
  const { away, home } = sides(item);
  const f = r ? readFindings(r).whatMatters[0] : null;
  const g = goalieLine(r ?? undefined);
  return (
    <li>
      <Link to={routes.game(slug, item.event_id)} className="ntile" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
        <span className="ntile__top"><span>{new Date(item.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><span>{until(item.start_time_utc, now)}</span></span>
        <span className="ntile__m"><TeamMark sport="NHL" abbr={away?.short_name} size="sm" /><span className="ntile__at">at</span><TeamMark sport="NHL" abbr={home?.short_name} size="sm" /></span>
        {g && <span className="ntile__g">{g}</span>}
        {f && <p className="ntile__f">{f.title}</p>}
        <GameState r={r} />
        <span className="ntile__top"><QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" /><span>{item.data_freshness === 'FRESH' ? '' : item.data_freshness.toLowerCase()}</span></span>
      </Link>
    </li>
  );
}

function Featured({ item, r, slug, now }: { item: BoardItem; r: EventResearchDoc | undefined; slug: string; now: number }) {
  const { away, home } = sides(item);
  const s = r ? readNhl(r) : null;
  const f = r ? readFindings(r).whatMatters[0] : null;
  const lead = isNhlScripts(s) ? s.scripts[0] : null;
  const best = isNhlScripts(s) ? s.candidates.find((c) => c.governance.status !== 'REJECTED' && c.robustness === 'ROBUST') ?? null : null;
  return (
    <section className="nfeat" aria-labelledby="n-feat-h">
      <span className="eyebrow">Next game · {kickoff(item.start_time_utc)} · {until(item.start_time_utc, now)}</span>
      <h2 className="nfeat__m" id="n-feat-h"><Link to={routes.game(slug, item.event_id)}>{away?.display_name} <span className="ntile__at">at</span> {home?.display_name}</Link></h2>
      <div className="nfeat__meta">{goalieLine(r) ?? 'Goalie status not published yet'} · <QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" /></div>
      <div className="nfeat__grid">
        <div><span className="nfeat__k">What matters most</span><span className="nfeat__v">{f ? <>{f.text} <BasisChip basis={f.basis} /></> : 'No ranked finding published'}</span></div>
        <div><span className="nfeat__k">Most likely script</span><span className="nfeat__v">{lead ? <><ScriptDot tone={lead.tone} />{lead.label} — {probText(lead.probability)} of simulated games. {lead.summary}</> : 'No game scripts yet'}</span></div>
        <div><span className="nfeat__k">Strongest robust candidate</span><span className="nfeat__v">{best ? <>{candidateTitle(best, r?.markets.find((m) => m.kalshi_ticker === best.ticker) as any)} at {best.price.ask_cents}¢ — {survivalText(best.survival.mass_survived, best.survival.survives, 7).toLowerCase()}</> : 'None robust on this game'}</span></div>
      </div>
      <Link to={routes.game(slug, item.event_id)} className="btn btn--sm">Open the game <Icon name="arrowRight" size={14} /></Link>
    </section>
  );
}

function Edges({ games, slug }: { games: { item: BoardItem; r: EventResearchDoc }[]; slug: string }) {
  const rows = games.flatMap(({ item, r }) => readFindings(r).findings.filter((f) => f.basis === 'OPPONENT_ADJUSTED').map((f) => ({ f, item }))).sort((a, b) => b.f.importance - a.f.importance).slice(0, 5);
  if (!rows.length) return null;
  return (
    <section className="panel" aria-labelledby="n-edges-h">
      <PanelHead title="Biggest Matchup Edges" sub="Opponent-adjusted 5v5 findings only — raw statistics never qualify" />
      <ul className="nedges">
        {rows.map(({ f, item }: { f: NhlFinding; item: BoardItem }) => {
          const { away, home } = sides(item);
          return (
            <li key={item.event_id + f.id}>
              <span className="nedges__g">{away?.short_name} at {home?.short_name}</span>
              <Link to={routes.game(slug, item.event_id, { tab: 'matchup' })}><b>{f.title}</b></Link>
              <span className="small muted">{f.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shortlist({ games, slug }: { games: { item: BoardItem; r: EventResearchDoc }[]; slug: string }) {
  const rows = games.flatMap(({ item, r }) => {
    const s = readNhl(r);
    return isNhlScripts(s) ? s.candidates.filter((c) => c.governance.status !== 'REJECTED' && !c.duplicate_of && (c.robustness === 'ROBUST' || c.robustness === 'MODERATE')).map((c) => ({ c, item, r, fail: c.survival.failure_script ? s.byId.get(c.survival.failure_script)?.label ?? null : null })) : [];
  }).sort((a, b) => (a.c.robustness === b.c.robustness ? b.c.research_score - a.c.research_score : a.c.robustness === 'ROBUST' ? -1 : 1)).slice(0, 6);
  return (
    <section className="panel" aria-labelledby="n-short-h">
      <PanelHead title="Research Candidates" sub={<>Robust and moderate only, across today's games · <ResearchOnly /></>} />
      {rows.length === 0 ? <p className="muted small">No robust or moderate research candidate on today's published games.</p> : (
        <ol className="nclist">
          {rows.map(({ c, item, r, fail }: { c: NhlCandidate; item: BoardItem; r: EventResearchDoc; fail: string | null }) => {
            const m = r.markets.find((x) => x.kalshi_ticker === c.ticker);
            const { away, home } = sides(item);
            return (
              <li key={c.bet_id} className="nc">
                <div className="nc__main">
                  <div className="nc__t">
                    {m ? <Link className="nc__name" to={routes.market(slug, m.market_id, item.event_id)}>{candidateTitle(c, m as any)}</Link> : <span className="nc__name">{candidateTitle(c)}</span>}
                    <span className="nc__chips"><TierChip tier={c.robustness} /><StatusChip status={c.governance.status} /></span>
                  </div>
                  <p className="nc__surv">{away?.short_name} at {home?.short_name} · {survivalText(c.survival.mass_survived, c.survival.survives, 7)}{fail ? ` · fails mainly if ${lowerLabel(fail)}` : ''}</p>
                  <p className="nc__nums"><span>Ask <b className="num">{c.price.ask_cents}¢</b> at research run</span><span>Fair <b className="num">{probText(c.p_model)}</b></span><span>Edge after fee <b className="num">{evText(c.ev_adjusted)}</b></span><span>Bet up to <b className="num">{c.bet_up_to_cents}¢</b></span></p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LearningPanel({ slug }: { slug: string }) {
  const { metrics } = useSport();
  const l = readLearning(metrics);
  const c = l?.counts ?? {};
  return (
    <section className="panel" aria-labelledby="n-learn-h">
      <PanelHead title="How the NHL model is doing" sub="A small sample looks like a small sample" />
      <LearningBadge learning={l} slug={slug} />
      {l?.probability?.n ? (
        <p className="small">Final pregame contracts: model Brier <b className="num">{l.probability.model?.brier}</b> vs market <b className="num">{l.probability.market?.brier}</b> on {Number(l.probability.n).toLocaleString('en-US')} settled contracts. Research-candidate CLV {evText(l.research_candidates?.clv?.mean)} (n {l.research_candidates?.clv?.n ?? 0}). {c.script_forecasts_settled ? '' : 'No script forecast has settled yet.'}</p>
      ) : null}
      <ViewAll to={routes.scorecard(slug)}>Open the scorecard</ViewAll>
    </section>
  );
}

export function NhlHomeView() {
  const { sport, repo, slug, metrics } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const items = useMemo(() => board.data?.items ?? [], [board.data]);
  const upcoming = useMemo(() => items.filter((i) => i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS' || i.status === 'LIVE').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [items]);
  const research = useSlateResearch(repo, sport.code, upcoming);
  const learning = readLearning(metrics);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="NHL board" /></div>;
  const rmap = research.data ?? new Map<string, EventResearchDoc>();
  const pregame = upcoming.filter((i) => Date.parse(i.start_time_utc) > now);
  const feat = pregame[0] ?? upcoming[0] ?? null;
  const games = upcoming.map((item) => ({ item, r: rmap.get(item.event_id) })).filter((x): x is { item: BoardItem; r: EventResearchDoc } => !!x.r);
  const markets = upcoming.reduce((a, b) => a + b.markets_available, 0);
  const lastCapture = upcoming.map((i) => i.market_captured_at).filter(Boolean).sort().pop() ?? null;
  return (
    <div className="page shome nhome">
      <header className="hbar">
        <h1 className="hbar__h">NHL</h1>
        <span className="hbar__m">{upcoming.length} games · {compact(markets)} markets · <QuoteChip view={publicationView(lastCapture)} now={now} label="prices" /></span>
        <span className="hbar__x"><Link to={routes.slate(slug)} className="btn btn--sm">Full slate <Icon name="arrowRight" size={14} /></Link></span>
      </header>
      <div className="nhome__learn"><LearningBadge learning={learning} slug={slug} /></div>

      {feat && <Featured item={feat} r={rmap.get(feat.event_id)} slug={slug} now={now} />}

      <section className="shome__games" aria-labelledby="n-today-h">
        <div className="phead">
          <h2 className="phead__t phead__t--serif" id="n-today-h">Today's Games</h2>
          <div className="phead__x"><ViewAll to={routes.slate(slug)}>Full slate</ViewAll></div>
        </div>
        {!upcoming.length && <p className="muted">No upcoming games in this publication.</p>}
        <ul className="nhome__tiles">
          {upcoming.map((i) => <Tile key={i.event_id} item={i} r={rmap.get(i.event_id) ?? (research.loading ? undefined : null)} slug={slug} now={now} />)}
        </ul>
      </section>

      <div className="shome__grid">
        <Shortlist games={games} slug={slug} />
        <div className="stack">
          <Edges games={games} slug={slug} />
          <LearningPanel slug={slug} />
        </div>
      </div>
    </div>
  );
}
