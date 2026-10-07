// The NHL game page: projection → plausible game scripts → research candidates and their script survival → the
// evidence behind them → markets, goalies, lines, form. Driven by the NHL publication's NHL_SCRIPT_V1 block and
// basis-labelled findings (lib/nhl.ts). Live Kalshi quotes ride on the same market clock as every Sift game.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventResearchDoc, Market, MatchupRow, MetricDef } from '../../contract/types';
import { NewlyListed, QuoteSummaryChip, RefreshQuotes, useQuoteViews } from '../../components/LiveQuote';
import { MarketBoard, latestPrices } from '../../components/MarketBoard';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { injuryRows, marketLabel, priceRow } from '../../lib/gamedata';
import { kickoff } from '../../lib/format';
import { describeNhlMarket } from '../../lib/marketLabel';
import {
  FAMILY_WORD,
  evText,
  familyGroup,
  isNhlScripts,
  probText,
  readFindings,
  readLearning,
  readNhl,
  type NhlFinding,
  type NhlScripts,
} from '../../lib/nhl';
import { routes } from '../../lib/routes';
import { liveStore, useLiveQuotes, useNow } from '../../live/hooks';
import { newlyListed, overlayMarket } from '../../live/overlay';
import { capShown, useSport } from '../../state/sport';
import { useDirectory } from '../../state/directory';
import { useVisit } from '../../state/trail';
import { Movement } from '../Game';
import { GameHero } from '../game/Hero';
import { FormPanel, H2HPanel, Info, InjuriesPanel, InjuryList, LineHistoryPanel, PanelHead } from '../game/panels';
import {
  CandidatesPanel,
  FindingCard,
  GoaltendingPanel,
  LearningBadge,
  LinesPanel,
  ProbabilityPair,
  ResearchOnly,
  ScriptDetail,
  ScriptMatrix,
  ScriptRows,
  ScriptsSummaryPanel,
  ScriptsUnavailable,
  TierChip,
  WhatMatters,
  teamResolver,
} from './parts';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = 'overview' | 'script' | 'candidates' | 'markets' | 'matchup' | 'lineups' | 'trends';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['script', 'Scripts'], ['candidates', 'Candidates'], ['markets', 'Markets'], ['matchup', 'Matchup'], ['lineups', 'Lineups'], ['trends', 'Trends'],
];

/** Model projection beside the market, in one line: the first thing to read. */
function ProjectionStrip({ r, s, homeAbbr, awayAbbr, quoted }: { r: EventResearchDoc; s: NhlScripts | null; homeAbbr: string; awayAbbr: string; quoted: Market[] }) {
  const sim = (r.extensions as any)?.sim;
  if (!sim) return null;
  const ph = sim.p_home_win != null ? Number(sim.p_home_win) : null;
  const homeMl = quoted.find((m) => m.market_family === 'game_winner' && m.participant_id === r.participants.find((p) => p.home_away === 'HOME')?.participant_id);
  const mid = homeMl && homeMl.yes_bid != null && homeMl.yes_ask != null ? (homeMl.yes_bid + homeMl.yes_ask) / 2 : homeMl?.market_probability ?? null;
  const fav = ph == null ? null : ph >= 0.5 ? homeAbbr : awayAbbr;
  return (
    <div className="nproj">
      <p className="nproj__lead">
        Model projects {awayAbbr} {Number(sim.away_lambda).toFixed(2)} – {homeAbbr} {Number(sim.home_lambda).toFixed(2)} expected goals
        {fav && ph != null ? <>; {fav} wins {probText(Math.max(ph, 1 - ph))} of simulations</> : null}
        <small>DATA_ONLY_V1, independent of market prices · total {Number(sim.total_mean).toFixed(1)} goals · OT {probText(sim.p_overtime)}{s ? ` · scripts from ${s.nDraws.toLocaleString('en-US')} joint draws` : ''}</small>
      </p>
      <ProbabilityPair label={`${homeAbbr} win`} model={ph} market={mid} />
    </div>
  );
}

/** Every market on the game with what the model says about it; unsupported markets say so and keep their quote. */
function NhlMarketTable({ s, quoted, slug, eventId }: { s: NhlScripts | null; quoted: Market[]; slug: string; eventId: string }) {
  const groups: { key: 'game' | 'player' | 'other'; title: string }[] = [{ key: 'game', title: 'Game and team markets' }, { key: 'player', title: 'Player and goalie markets' }];
  return (
    <div className="nmt">
      {groups.map((g) => {
        const rows = quoted.filter((m) => familyGroup(m.market_family) === g.key).sort((a, b) => a.market_family.localeCompare(b.market_family) || a.kalshi_ticker.localeCompare(b.kalshi_ticker));
        if (!rows.length) return null;
        return (
          <details key={g.key} className="layer" open={g.key === 'game'}>
            <summary className="layer__s">{g.title} <span className="muted">({rows.length})</span></summary>
            <div className="layer__b tscroll" tabIndex={0} role="region" aria-label={g.title}>
              <table className="nsc__t nmt__t">
                <thead>
                  <tr><th scope="col">Market</th><th scope="col" className="r">YES / NO ask</th><th scope="col" className="r">Model YES</th><th scope="col" className="r">Market YES</th><th scope="col">Best side after fee</th></tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const row = s?.markets.get(m.kalshi_ticker);
                    const best = row ? ([['yes', row.yes], ['no', row.no]] as const).filter(([, sd]) => sd?.ev != null).sort((a, b) => (b[1]!.ev ?? -9) - (a[1]!.ev ?? -9))[0] : null;
                    return (
                      <tr key={m.kalshi_ticker}>
                        <th scope="row"><Link to={routes.market(slug, m.market_id, eventId)} className="mtab__m">{describeNhlMarket(m)?.title ?? m.yes_description}</Link><span className="nmx__tag">{FAMILY_WORD[m.market_family] ?? m.market_family}</span></th>
                        <td className="r num">{m.yes_ask != null ? Math.round(m.yes_ask * 100) : '—'} / {m.no_ask != null ? Math.round(m.no_ask * 100) : '—'}</td>
                        {row ? (
                          <>
                            <td className="r num">{probText(row.pYes, 1)}</td>
                            <td className="r num">{probText(row.pYesMid, 1)}</td>
                            <td>{best ? <><b className="num">{best[0].toUpperCase()} {evText(best[1]!.ev)}</b> <TierChip tier={best[1]!.tier} /></> : '—'}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="muted small">Model does not price this market</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
      <p className="muted small">Model YES is the NHL joint simulation's probability at the research run{s?.generatedAt ? ` (${kickoff(s.generatedAt)})` : ''}. Asks are live where Sift has a fresh quote, otherwise the publication's capture. "After fee" uses the conservative probability and the research run's ask.</p>
    </div>
  );
}

function FindingsByBasis({ findings, r, slug }: { findings: NhlFinding[]; r: EventResearchDoc; slug: string }) {
  const evidence = findings.filter((f) => f.evidence_eligible);
  const raw = findings.filter((f) => !f.evidence_eligible);
  return (
    <>
      <div className="nfsec">
        <h3 className="nfsec__h">Betting evidence <span className="muted">— opponent-adjusted, model and availability findings</span></h3>
        {evidence.length ? <div className="nfgrid">{evidence.map((f) => <FindingCard key={f.id} f={f} r={r} slug={slug} />)}</div> : <p className="muted small">No evidence-grade finding for this game.</p>}
      </div>
      {raw.length > 0 && (
        <details className="layer nfsec">
          <summary className="layer__s">Raw context ({raw.length}) <span className="muted">— not opponent-adjusted; never the reason for an edge</span></summary>
          <div className="layer__b nfgrid">{raw.map((f) => <FindingCard key={f.id} f={f} r={r} slug={slug} />)}</div>
        </details>
      )}
    </>
  );
}

/** Opponent-adjusted rows first (rank of 32), raw rows separately and labelled raw. */
function AdjustedMatchup({ rows, metrics, slug, homeAbbr, awayAbbr, homeId, awayId, eventId }: { rows: MatchupRow[]; metrics: Map<string, MetricDef>; slug: string; homeAbbr: string; awayAbbr: string; homeId: string; awayId: string; eventId: string }) {
  const adj = rows.filter((r) => metrics.get(r.metric_id)?.category === 'opponent_adjusted');
  const raw = rows.filter((r) => metrics.get(r.metric_id)?.category !== 'opponent_adjusted');
  const cell = (o: any) => (o ? <><b className="num">{o.context?.rank != null ? `#${o.context.rank}` : '—'}</b> <span className="muted num">{fmt(o.value, metrics.get(o.metric_id)?.unit)}</span></> : '—');
  const table = (rs: MatchupRow[], label: string) => (
    <div className="tscroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nsc__t">
        <thead><tr><th scope="col">Metric</th><th scope="col">Window</th><th scope="col" className="r">{awayAbbr}</th><th scope="col" className="r">{homeAbbr}</th></tr></thead>
        <tbody>
          {rs.map((r) => (
            <tr key={r.metric_id + (r.note ?? '')}>
              <th scope="row"><Link to={routes.metric(slug, r.metric_id, { team: homeId, opp: awayId, event: eventId })}>{metrics.get(r.metric_id)?.name ?? r.name}</Link></th>
              <td className="muted small">{(r.note ?? '').replace(/^window /, '')}</td>
              <td className="r">{cell(r.away)}</td>
              <td className="r">{cell(r.home)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      {adj.length > 0 ? (
        <section className="panel">
          <PanelHead title="Opponent-adjusted team strength" sub="5v5, recency-weighted; league rank of 32 (#1 = best at that job)" info={<Info label="How the adjustment works">Weighted ridge regression of each team's 5v5 rates on its own offense and its opponents' defense (and vice versa), fit only on games before this run. A research layer (nhl-oppadj-1.0): walk-forward checks show a modest, consistent improvement over raw rates; it is not a model input.</Info>} />
          {table(adj, 'Opponent-adjusted matchup')}
        </section>
      ) : <Notice title="No opponent-adjusted metrics in this publication" />}
      <details className="layer">
        <summary className="layer__s">Raw team metrics ({raw.length}) <span className="muted">— not opponent-adjusted</span></summary>
        <div className="layer__b">{table(raw, 'Raw matchup metrics')}</div>
      </details>
    </>
  );
}

function fmt(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null) return '—';
  if (unit === 'share') return `${(v * 100).toFixed(1)}%`;
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export function NhlGameView({ eventId }: { eventId: string }) {
  const { sport, repo, slug, metrics, caps } = useSport();
  const [sp] = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get('tab'))?.[0] ?? 'overview') as Tab;
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const dir = useDirectory(repo);
  const r = research.data;
  const homeP = r?.participants.find((p) => p.home_away === 'HOME');
  const awayP = r?.participants.find((p) => p.home_away === 'AWAY');
  const homeProf = useAsync(homeP ? `prof:${sport.code}:${homeP.participant_id}` : null, () => repo.profile(homeP!.participant_id));
  const awayProf = useAsync(awayP ? `prof:${sport.code}:${awayP.participant_id}` : null, () => repo.profile(awayP!.participant_id));
  const hist = useAsync(r?.market_history_path && tab === 'trends' ? `mh:${sport.code}:${eventId}` : null, () => repo.marketHistory(eventId));
  const ev = r?.event;
  const short = (pid?: string | null) => ev?.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  useVisit(ev ? `${short(awayP?.participant_id)} @ ${short(homeP?.participant_id)}` : null, 'game');
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  const playerName = useMemo(() => (id: string | null) => (id ? dir.data?.player(id)?.label ?? null : null), [dir.data]);

  const published = detail.data?.markets;
  const settledGame = r?.event.status === 'FINAL' || (r ? Date.parse(r.event.start_time_utc) < Date.now() - 8 * 3600e3 : false);
  const tickers = useMemo(() => (published ?? []).map((m) => m.kalshi_ticker), [published]);
  const events = useMemo(() => (settledGame ? [] : [...new Set((published ?? []).map((m) => m.kalshi_event_ticker).filter((e): e is string => !!e))]), [published, settledGame]);
  const live = useLiveQuotes(tickers, settledGame ? 'background' : 'game', events);
  const quoted = useMemo(() => (published ?? []).map((m) => overlayMarket(m, live.quote(m.kalshi_ticker))), [published, live]);
  const views = useQuoteViews(published ?? r?.markets ?? []);
  const listedLater = useMemo(() => newlyListed(tickers, liveStore().eventQuotes(events)), [tickers, events, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const marketsByTicker = useMemo(() => new Map(quoted.map((m) => [m.kalshi_ticker, m])), [quoted]);
  const known = useMemo(() => new Map((published ?? r?.markets ?? []).map((m) => [m.kalshi_ticker, m as Market])), [published, r]);
  const now = useNow(15_000);
  const scripts = useMemo(() => readNhl(r), [r]);
  const fnd = useMemo(() => readFindings(r), [r]);
  const learning = useMemo(() => readLearning(metrics), [metrics]);

  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !ev || !homeP || !awayP) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const s = isNhlScripts(scripts) ? scripts : null;
  const selected = s && s.byId.has(sp.get('script') ?? '') ? sp.get('script') : null;
  const href = (t: Tab, script: string | null = selected) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t, script });
  const hrefFor = (id: string | null) => href('script', id);
  const rosterOf = (prof: any, abbr: string) => ({ abbr, names: ((prof?.players ?? []) as { display_name: string }[]).map((x) => x.display_name) });
  const injuries = injuryRows(r, teamResolver(r, [rosterOf(homeProf.data, homeAbbr), rosterOf(awayProf.data, awayAbbr)]));
  const rows = quoted.map((m) => priceRow(m, prices, marketLabel(m, (pid) => (pid === homeP.participant_id ? homeAbbr : pid === awayP.participant_id ? awayAbbr : null), playerName), null));
  const notes = r.context?.notes ?? [];
  const unavailable = scripts && !isNhlScripts(scripts) ? <ScriptsUnavailable status={scripts.status} reason={scripts.reason} /> : null;
  const abbrOf = (id: string | null) => (id === homeP.participant_id ? homeAbbr : id === awayP.participant_id ? awayAbbr : '?');

  return (
    <div className="page game game--nhl">
      <GameHero r={r} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} slug={slug} now={now} />
      <nav className="ptabs gtabs" aria-label="Game sections">
        {TABS.map(([k, l]) => <Link key={k} to={href(k)} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'overview' && (
        <div className="ngov">
          <div className="nhead"><LearningBadge learning={learning} slug={slug} compact /> <ResearchOnly />{s?.pregame === false && <span className="muted small">Research is from after puck drop; shown for reference only.</span>}</div>
          <ProjectionStrip r={r} s={s} homeAbbr={homeAbbr} awayAbbr={awayAbbr} quoted={quoted} />
          <WhatMatters items={fnd.whatMatters} r={r} slug={slug} empty={<p className="muted">No ranked findings were published for this game.</p>} more={fnd.findings.length > fnd.whatMatters.length ? <p className="gsec__more"><Link to={href('matchup')}>Every finding, adjusted and raw →</Link></p> : null} />
          {s ? <ScriptsSummaryPanel s={s} homeAbbr={homeAbbr} awayAbbr={awayAbbr} hrefFor={hrefFor} to={href('script')} /> : unavailable}
          {s && <CandidatesPanel s={s} r={r} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} limit={4} to={href('candidates')} />}
          <div className="ngov__pair">
            <GoaltendingPanel r={r} findings={fnd.findings} homeAbbr={homeAbbr} awayAbbr={awayAbbr} slug={slug} />
            <LinesPanel r={r} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
          </div>
          <div className="ngov__pair">
            <FormPanel homeProf={homeProf.data} awayProf={awayProf.data} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={href('trends')} />
            <InjuriesPanel rows={injuries} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} to={href('lineups')} />
          </div>
        </div>
      )}

      {tab === 'script' && (
        s ? (
          <>
            <Stratum id="g-nhl-scripts" title="How it could play out" sub={`Seven mutually exclusive game scripts from ${s.nDraws.toLocaleString('en-US')} simulated games · ${s.versions.script}`}>
              <ScriptRows s={s} homeAbbr={homeAbbr} awayAbbr={awayAbbr} hrefFor={hrefFor} selected={selected} />
            </Stratum>
            <Stratum id="g-nhl-matrix" title="Which markets survive which scripts" sub="The probability mass a market survives matters more than the number of scripts.">
              <ScriptMatrix s={s} markets={quoted} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} selected={selected} />
            </Stratum>
            <Stratum id="g-nhl-script-detail" title="Each script in full" sub="Why it exists, what would need to happen, what breaks it, and the markets it moves.">
              <div className="nsdgrid">
                {(selected ? s.scripts.filter((x) => x.id === selected) : s.scripts).map((x) => (
                  <ScriptDetail key={x.id} x={x} s={s} homeAbbr={homeAbbr} awayAbbr={awayAbbr} slug={slug} eventId={eventId} marketsByTicker={marketsByTicker} r={r} />
                ))}
              </div>
              {selected && <p className="small"><Link to={hrefFor(null)}>Show every script →</Link></p>}
            </Stratum>
          </>
        ) : unavailable ?? <Notice title="No scripts for this game" />
      )}

      {tab === 'candidates' && (
        s ? (
          <>
            <CandidatesPanel s={s} r={r} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} />
            {s.rules && (
              <details className="layer">
                <summary className="layer__s">How candidates are ranked</summary>
                <div className="layer__b small">
                  <p>{s.rules.ordering}.</p>
                  <ul>{Object.entries(s.rules.tiers).map(([k, v]) => <li key={k}><b>{k.replace(/_/g, ' ').toLowerCase()}</b>: {v}</li>)}</ul>
                  <p className="muted">{s.rules.conservative_probability}. Versions: {s.versions.script} · {s.versions.survival} · {s.versions.candidates}.</p>
                </div>
              </details>
            )}
          </>
        ) : unavailable ?? <Notice title="No research candidates for this game" />
      )}

      {tab === 'markets' && (
        <>
          <Stratum id="g-nhl-mt" title="What the model says about each market" sub="Supported markets show the model's probability and the best side after fees; unsupported markets say so.">
            {detail.loading ? <Skeleton lines={6} /> : <NhlMarketTable s={s} quoted={quoted} slug={slug} eventId={eventId} />}
          </Stratum>
          <Stratum id="g-markets" title="Markets" sub={`All Kalshi contracts on this game (${detail.data?.markets.length ?? '…'}). Prices are the current quote where Sift has one, otherwise the publication's capture.`} actions={<><span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>{tickers.length ? <RefreshQuotes tickers={tickers} /> : null}</>}>
            {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
            {detail.data && <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} />}
            <NewlyListed quotes={listedLater} now={now} />
          </Stratum>
        </>
      )}

      {tab === 'matchup' && (
        <>
          <Stratum id="g-nhl-find" title="Every finding" sub="Grouped by what it rests on.">
            <FindingsByBasis findings={fnd.findings} r={r} slug={slug} />
            {fnd.rule && <p className="muted small">{fnd.rule}.</p>}
          </Stratum>
          {capShown(caps, 'matchup_metrics') && <AdjustedMatchup rows={r.matchup} metrics={metrics} slug={slug} homeAbbr={homeAbbr} awayAbbr={awayAbbr} homeId={homeP.participant_id} awayId={awayP.participant_id} eventId={eventId} />}
        </>
      )}

      {tab === 'lineups' && (
        <div className="ngov">
          <GoaltendingPanel r={r} findings={fnd.findings} homeAbbr={homeAbbr} awayAbbr={awayAbbr} slug={slug} />
          <LinesPanel r={r} homeAbbr={homeAbbr} awayAbbr={awayAbbr} full />
          <Stratum id="g-nhl-inj" title="Injuries" sub="ESPN designations, name-matched by the publication. Injuries are not modelled beyond who is in the projected lineup.">
            <div className="injcols injcols--full">
              {[awayAbbr, homeAbbr].map((t) => (
                <div key={t} className="panel injcol">
                  <div className="injcol__h"><TeamMark sport={sport.code} abbr={t} size="sm" /> {t}</div>
                  <InjuryList rows={injuries.filter((x) => x.team === t)} />
                </div>
              ))}
            </div>
            {injuries.some((x) => !x.team) && <InjuryList rows={injuries.filter((x) => !x.team)} />}
          </Stratum>
        </div>
      )}

      {tab === 'trends' && (
        <div className="trends">
          <div className="trends__grid">
            <FormPanel homeProf={homeProf.data} awayProf={awayProf.data} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={routes.team(slug, homeP.participant_id, 'results')} />
            <H2HPanel homeProf={homeProf.data} homeId={homeP.participant_id} awayId={awayP.participant_id} abbrOf={abbrOf} sportCode={sport.code} before={ev.start_time_utc} slug={slug} n={10} />
          </div>
          <LineHistoryPanel hist={hist.data} loading={hist.loading} rows={rows} favAbbr={homeAbbr} to={href('markets')} />
          {capShown(caps, 'market_price_history') && r.market_history_path && (
            <Stratum id="g-movement" title="Contract price history" sub="Every capture since listing.">
              <Movement eventId={eventId} path={r.market_history_path} prices={prices} kickoffIso={ev.start_time_utc} known={known} />
            </Stratum>
          )}
        </div>
      )}

      <details className="gnotes">
        <summary>Publication notes, provenance & full-game export</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at}</p>
        {s && <p className="small muted">Scripts: {s.versions.script} · survival {s.versions.survival} · candidates {s.versions.candidates} · {s.drawSource}</p>}
        <p className="small"><Link to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}>Export this game's full handicap packet →</Link></p>
      </details>
    </div>
  );
}
