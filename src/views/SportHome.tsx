// A sport's home: the landing page for that sport (not just its slate). The featured game, this week's
// games with their script outlook, where the model and market disagree most on game lines, recent
// results and the way into structures. The full slate is one link away.
import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { publicationView, QuoteChip } from '../components/LiveQuote';
import { ErrorState, Skeleton, TeamMark } from '../components/ui';
import { compact } from '../lib/format';
import { routes } from '../lib/routes';
import { gameScripts, sharePct } from '../lib/scripts';
import { useNow } from '../live/hooks';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { Disagreements, FeatureCard, featuredItem, GameTile, sides, useSlateResearch } from './home/cards';
import { matchupInsights } from '../insights/matchups';
import { FeaturedProps } from './Home';
import { PanelHead, ViewAll } from './game/panels';
import { ScorecardPanel } from './Scorecard';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Each game's scripts in plain words, most likely first; the most competitive games lead. */
function ScriptOutlook({ items, research, slug, sportCode }: { items: BoardItem[]; research: Map<string, EventResearchDoc>; slug: string; sportCode: string }) {
  const rows = items
    .map((i) => ({ i, r: research.get(i.event_id) }))
    .map((x) => ({ ...x, set: x.r ? gameScripts(x.r) : null }))
    .filter((x) => x.set)
    .sort((a, b) => (b.set!.scripts.find((s) => s.id === 'close')?.share ?? 0) - (a.set!.scripts.find((s) => s.id === 'close')?.share ?? 0));
  if (!rows.length) return null;
  return (
    <section className="panel" aria-labelledby="so-h">
      <PanelHead title="Script Outlook" sub="How each game most likely ends · share of simulated games · closest games first" />
      <ul className="soutl">
        {rows.map(({ i, set }) => {
          const { away, home } = sides(i);
          return (
            <li key={i.event_id}>
              <Link to={routes.game(slug, i.event_id, { tab: 'script' })} className="soutl__a">
                <span className="soutl__g">
                  <TeamMark sport={sportCode} abbr={away?.short_name} size="sm" />{away?.short_name} <span className="muted">at</span> {home?.short_name}<TeamMark sport={sportCode} abbr={home?.short_name} size="sm" />
                </span>
                <ol className="soutl__l">
                  {set!.scripts.map((s) => (
                    <li key={s.id}><i className={`sdot sdot--s${s.index}`} aria-hidden="true" />{s.name} <b className="num">{sharePct(s.share)}</b></li>
                  ))}
                </ol>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Results({ items, slug, sportCode }: { items: BoardItem[]; slug: string; sportCode: string }) {
  const recent = items.slice(0, 6);
  const { repo, sport } = useSport();
  const research = useSlateResearch(repo, sport.code, recent);
  if (!recent.length) return null;
  return (
    <section className="panel" aria-labelledby="res-h">
      <PanelHead title="Recent Results" sub="Winner's score first" />
      <ol className="h2h">
        {recent.map((i) => {
          const r = research.data?.get(i.event_id);
          const res = (r?.extensions as any)?.result;
          const { away, home } = sides(i);
          const has = res && res.home_score != null && res.away_score != null;
          const homeWon = has && res.home_score > res.away_score;
          const w = homeWon ? home : away;
          const l = homeWon ? away : home;
          return (
            <li key={i.event_id}>
              <Link to={routes.game(slug, i.event_id)} className="h2h__row">
                <span className="h2h__d">{i.competition?.replace(/^\d{4}\s*(REG\s*)?/i, '').replace(/^week/i, 'Wk')}</span>
                <span className="h2h__w"><TeamMark sport={sportCode} abbr={w?.short_name} size="sm" /><b>{w?.short_name}</b></span>
                <span className="h2h__s num">{has ? <><b>{Math.max(res.home_score, res.away_score)}</b>–{Math.min(res.home_score, res.away_score)}</> : '—'}</span>
                <span className="h2h__l">{l?.short_name}<TeamMark sport={sportCode} abbr={l?.short_name} size="sm" /></span>
                <span className="h2h__at">{has ? (homeWon ? 'home win' : 'away win') : 'final'}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The NHL home (views/nhl): its own chunk, so other sports never download it. */
const CbbHomeView = lazy(() => import('./cbb/Home').then((m) => ({ default: m.CbbHomeView })));
const NhlHomeView = lazy(() => import('./nhl/NhlHome').then((m) => ({ default: m.NhlHomeView })));

export function SportHomeView() {
  const { sport } = useSport();
  if (sport.code === 'NHL') return <Suspense fallback={<div className="page"><Skeleton lines={6} tall /></div>}><NhlHomeView /></Suspense>;
  if (sport.code === 'CBB') return <Suspense fallback={<div className="page"><Skeleton lines={6} tall /></div>}><CbbHomeView /></Suspense>;
  return <GenericSportHome />;
}

function GenericSportHome() {
  const { sport, repo, slug } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const items = useMemo(() => board.data?.items ?? [], [board.data]);
  const upcoming = useMemo(() => items.filter((i) => i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS' || i.status === 'LIVE').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [items]);
  const finals = useMemo(() => items.filter((i) => i.status === 'FINAL').sort((a, b) => b.start_time_utc.localeCompare(a.start_time_utc)), [items]);
  const research = useSlateResearch(repo, sport.code, upcoming);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what={`${sport.label} board`} /></div>;
  const comp = (upcoming[0]?.competition ?? items[0]?.competition ?? '').replace(/^(\d{4})\s*(REG\s*)?week/i, '$1 · Week');
  const feat = featuredItem(upcoming, now);
  const markets = upcoming.reduce((a, b) => a + b.markets_available, 0);
  const lastCapture = upcoming.map((i) => i.market_captured_at).filter(Boolean).sort().pop() ?? null;
  const rmap = research.data ?? new Map<string, EventResearchDoc>();
  return (
    <div className="page shome">
      <header className="hbar">
        <h1 className="hbar__h">{sport.label}</h1>
        <span className="hbar__m">{comp} · {upcoming.length} games · {compact(markets)} markets · <QuoteChip view={publicationView(lastCapture)} now={now} label="prices" /></span>
        <span className="hbar__x">
          <Link to={routes.slate(slug)} className="btn btn--sm">Full slate <Icon name="arrowRight" size={14} /></Link>
          {sport.code === 'NFL' && <Link to={routes.parlays(slug)} className="btn btn--sm btn--ghost">Parlays</Link>}
        </span>
      </header>

      {feat && <div className="shome__feat"><FeatureCard item={feat} r={rmap.get(feat.event_id)} insight={rmap.get(feat.event_id) ? matchupInsights(rmap.get(feat.event_id)!)[0] ?? null : null} sportSlug={slug} sportCode={sport.code} now={now} /></div>}

      <section className="shome__games" aria-labelledby="wk-h">
        <div className="phead">
          <h2 className="phead__t phead__t--serif" id="wk-h">This Week</h2>
          <div className="phead__x"><ViewAll to={routes.slate(slug)}>Full slate</ViewAll></div>
        </div>
        {!upcoming.length && <p className="muted">No upcoming games in this publication.</p>}
        <ul className="gtiles">
          {upcoming.map((i) => <GameTile key={i.event_id} item={i} r={rmap.get(i.event_id) ?? (research.loading ? undefined : null)} sportSlug={slug} sportCode={sport.code} now={now} />)}
        </ul>
      </section>

      {feat && sport.code === 'NFL' && <div className="shome__props"><FeaturedProps item={feat} r={rmap.get(feat.event_id)} slug={slug} /></div>}

      <div className="shome__grid">
        <ScriptOutlook items={upcoming} research={rmap} slug={slug} sportCode={sport.code} />
        <div className="stack">
          <Results items={finals} slug={slug} sportCode={sport.code} />
          <ScorecardPanel slug={slug} />
          <details className="layer shome__deep">
            <summary className="layer__s">Where prices and projections differ</summary>
            <div className="layer__b"><Disagreements items={upcoming} research={rmap} slug={slug} title="Prices vs projections" /></div>
          </details>
          {sport.code === 'NFL' && (
            <Link to={routes.parlays(slug)} className="panel promo">
              <span className="eyebrow">Structures</span>
              <span className="promo__t">Teasers & parlays</span>
              <span className="promo__d">Stafford Wong teaser legs from this week's lines, with correlation notes. Review only — Sift never places bets.</span>
              <Icon name="arrowRight" size={18} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
