// The NHL game page tells the story of the game. Under the hero: the model's read in one strip (win probability, total,
// most likely script, freshness). Then, in order: how the game is most likely to play, the scripts, the goalie
// matchup, market fit with its contradiction check, special teams and player research. Deeper tabs hold every
// script in full, every market, every player, the matchup evidence and price history. Driven by the NHL
// publication's NHL_SCRIPT_V1 block and basis-labelled findings (lib/nhl.ts, lib/nhlStory.ts); live Kalshi quotes ride
// on the same market clock as every Sift game. Once the puck drops the pregame research is frozen and labelled so.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, Market, MatchupRow, MetricDef } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { NewlyListed, QuoteSummaryChip, RefreshQuotes, useQuoteViews } from '../../components/LiveQuote';
import { MarketBoard, latestPrices } from '../../components/MarketBoard';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { injuryRows, marketLabel, priceRow } from '../../lib/gamedata';
import { kickoff } from '../../lib/format';
import { describeNhlMarket } from '../../lib/marketLabel';
import { FAMILY_WORD, evText, familyGroup, isNhlScripts, probText, readFindings, readLearning, readNhl, type NhlFinding, type NhlScripts } from '../../lib/nhl';
import { ageMs, gamePhase, isOut, goalieLines, modelFreshness, playerLines, priceFreshness, projection, sidesOf, thesis, type Fresh } from '../../lib/nhlStory';
import { routes } from '../../lib/routes';
import { liveStore, useLiveQuotes, useNow } from '../../live/hooks';
import { newlyListed, overlayMarket } from '../../live/overlay';
import { capShown, useSport } from '../../state/sport';
import { useDirectory } from '../../state/directory';
import { useVisit } from '../../state/trail';
import { Movement } from '../Game';
import { GameHero } from '../game/Hero';
import { FormPanel, H2HPanel, Info, InjuryList, LineHistoryPanel, PanelHead } from '../game/panels';
import { familyGlyph, Glyph } from './glyphs';
import { FreshPill, ResearchPill } from './kit';
import { BasisChip, FindingCard, LinesPanel, ScriptMatrix, ScriptsUnavailable, TierChip, teamResolver } from './parts';
import { FrozenNote, GoalieMatchup, MarketFit, PlayerResearch, ReviewSection, ScriptCard, ScriptList, Section, SpecialTeams, SummaryStrip, ThesisSection } from './story';
import { GameOpportunities } from '../game/GameOpportunities';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = 'overview' | 'script' | 'markets' | 'players' | 'matchup' | 'trends';
const TABS: [Tab, string][] = [['overview', 'Story'], ['script', 'Scripts'], ['markets', 'Markets'], ['players', 'Players'], ['matchup', 'Matchup'], ['trends', 'Trends']];
/** Links published before the story layout keep working. */
const TAB_ALIAS: Record<string, Tab> = { candidates: 'markets', lineups: 'players' };

const UNIT_ROLE: Record<string, string> = { f1: 'Line 1', f2: 'Line 2', f3: 'Line 3', f4: 'Line 4', d1: 'Pair 1', d2: 'Pair 2', d3: 'Pair 3' };

/** "Line 1 · PP1" for a skater, from the game's published line combinations. */
function roleResolver(r: EventResearchDoc): (name: string) => string | null {
  const key = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const by = new Map<string, string[]>();
  for (const l of (r.context?.lineups ?? []) as any[]) {
    if (l.kind !== 'line_combinations') continue;
    for (const [u, ps] of Object.entries(l.units ?? {}) as [string, any[]][]) {
      const [kind, unit] = u.split(':');
      const word = kind === 'ev' ? UNIT_ROLE[unit] : kind === 'pp' ? unit.toUpperCase() : null;
      if (!word) continue;
      for (const p of ps ?? []) if (p?.name) by.set(key(p.name), [...(by.get(key(p.name)) ?? []), word]);
    }
  }
  return (name: string) => (by.get(key(name)) ?? []).sort((a, b) => Number(b.startsWith('L') || b.startsWith('P') && !b.startsWith('PP')) - Number(a.startsWith('L') || a.startsWith('P') && !a.startsWith('PP'))).join(' · ') || null;
}

/** The game's matchup findings as one compact list (basis first), not a wall of cards. */
function EdgeList({ items }: { items: NhlFinding[] }) {
  if (!items.length) return null;
  return (
    <Section id="n-edges" title="What matters" sub="The findings that move this game most, each labelled with what it rests on. Raw statistics are context, never the reason for an edge.">
      <ul className="nedge">
        {items.map((f) => <li key={f.id}><BasisChip basis={f.basis} /><b>{f.title}</b><span>{f.text}</span></li>)}
      </ul>
    </Section>
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
                        <th scope="row"><Glyph name={familyGlyph(m.market_family)} size={14} className="nmt__g" /><Link to={routes.market(slug, m.market_id, eventId)} className="mtab__m">{describeNhlMarket(m)?.title ?? m.yes_description}</Link><span className="nmx__tag">{FAMILY_WORD[m.market_family] ?? m.market_family}</span></th>
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
  const rawTab = sp.get('tab') ?? '';
  const tab = (TAB_ALIAS[rawTab] ?? TABS.find(([k]) => k === rawTab)?.[0] ?? 'overview') as Tab;
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
  const ids = useMemo(() => (r ? sidesOf(r) : null), [r]);
  useVisit(ids ? `${ids.away} @ ${ids.home}` : null, 'game');
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
  const s = isNhlScripts(scripts) ? scripts : null;
  const fnd = useMemo(() => readFindings(r), [r]);
  const learning = useMemo(() => readLearning(metrics), [metrics]);
  const proj = useMemo(() => (r ? projection(r, s) : null), [r, s]);
  const goalies = useMemo(() => (r && ids ? goalieLines(r, s, ids) : []), [r, s, ids]);
  const goaliePids = goalies.map((g) => g.pid).filter((x): x is string => !!x);
  const goalieProfs = useAsync(goaliePids.length && (tab === 'overview' || tab === 'players') ? `nhl-goalies:${goaliePids.join(',')}` : null, async () => {
    const out = await Promise.allSettled(goaliePids.map((id) => repo.profile(id)));
    return new Map(goaliePids.map((id, i) => [id, out[i].status === 'fulfilled' ? (out[i] as PromiseFulfilledResult<EntityProfileDoc>).value : null]));
  });
  const roleOf = useMemo(() => (r ? roleResolver(r) : () => null), [r]);

  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !ev || !homeP || !awayP || !ids) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const homeAbbr = ids.home;
  const awayAbbr = ids.away;
  const phase = gamePhase(ev, now);
  const pregame = phase.phase === 'UPCOMING';
  // The publisher's postmortem score is authoritative over the schedule feed's last captured score.
  const fs = (s?.outcome as any)?.final_score;
  const finalScore = fs?.home != null && fs?.away != null ? { home: Number(fs.home), away: Number(fs.away) } : phase.score;
  const selected = s && s.byId.has(sp.get('script') ?? '') ? sp.get('script') : null;
  const href = (t: Tab, script: string | null = selected) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t, script });
  const hrefFor = (id: string | null) => `${href('script', id)}`;
  const rosterOf = (prof: any, abbr: string) => ({ abbr, names: ((prof?.players ?? []) as { display_name: string }[]).map((x) => x.display_name) });
  const teamOf = teamResolver(r, [rosterOf(homeProf.data, homeAbbr), rosterOf(awayProf.data, awayAbbr)]);
  const injuries = injuryRows(r, teamOf);
  const outCount = (t: string) => injuries.filter((x) => x.team === t && isOut(x.status)).length;
  const rows = quoted.map((m) => priceRow(m, prices, marketLabel(m, (pid) => (pid === homeP.participant_id ? homeAbbr : pid === awayP.participant_id ? awayAbbr : null), playerName), null));
  const notes = r.context?.notes ?? [];
  const unavailable = scripts && !isNhlScripts(scripts) ? <ScriptsUnavailable status={scripts.status} reason={scripts.reason} /> : null;
  const abbrOf = (id: string | null) => (id === homeP.participant_id ? homeAbbr : id === awayP.participant_id ? awayAbbr : '?');
  const t = thesis(s, proj, ids, goalies, injuries.length ? { home: outCount(homeAbbr), away: outCount(awayAbbr) } : null);
  const homeMl = quoted.find((m) => m.market_family === 'game_winner' && m.participant_id === homeP.participant_id);
  const marketPHome = homeMl && homeMl.yes_bid != null && homeMl.yes_ask != null ? (homeMl.yes_bid + homeMl.yes_ask) / 2 : homeMl?.market_probability ?? null;
  const players = playerLines(r, s, quoted, roleOf, teamOf);
  const knownPlayer = (id: string | null) => !!id && (!!dir.data?.player(id) || r.players.some((x) => x.participant_id === id));
  const lastQuote = quoted.map((m) => m.captured_at).filter((x): x is string => !!x).sort().pop() ?? null;
  const gAge = goalies.map((g) => ageMs(g.observedAt, now)).filter((x): x is number => x != null);
  const goalieFresh: Fresh = !gAge.length ? 'UNKNOWN' : Math.max(...gAge) <= 3 * 3600e3 ? 'CURRENT' : Math.max(...gAge) <= 12 * 3600e3 ? 'AGING' : 'STALE';
  const status = (
    <>
      <FreshPill label="Model" state={modelFreshness(s?.generatedAt ?? (r.distributions[0] as any)?.generated_at ?? null, phase.phase, now)} at={s?.generatedAt ?? null} now={now} glyph="chances" />
      {pregame && published && published.length > 0 && <FreshPill label="Prices" state={priceFreshness(lastQuote, now)} at={lastQuote} now={now} glyph="moneyline" />}
      {pregame && published && published.length === 0 && <span className="nsl__muted">No Kalshi markets listed yet</span>}
      {pregame && goalies.length > 0 && <FreshPill label="Goalies" state={goalieFresh} at={goalies.map((g) => g.observedAt).filter(Boolean).sort().pop() ?? null} now={now} glyph="mask" />}
      <ResearchPill learning={learning} slug={slug} bare />
    </>
  );

  return (
    <div className="page game game--nhl nhg">
      <GameHero r={r} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} slug={slug} now={now} finalScore={phase.phase === 'FINAL' ? finalScore : null} />
      <SummaryStrip ids={ids} p={proj} s={s} phase={phase} marketPHome={marketPHome} status={status} />
      <nav className="ptabs gtabs" aria-label="Game sections">
        {TABS.map(([k, l]) => <Link key={k} to={href(k, null)} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'overview' && (
        <div className="nhg__story">
          <FrozenNote phase={phase} generatedAt={s?.generatedAt ?? null} />
          {pregame && <GameOpportunities eventId={eventId} now={now}>The scripts, goalies and market fit below are the research behind that call.</GameOpportunities>}
          <ReviewSection phase={phase} ids={ids} s={s} />
          {t ? <ThesisSection t={t} s={s} r={r} slug={slug} ids={ids} /> : null}
          {s ? (
            <Section id="n-scripts" title="Game scripts" sub={`Seven ways this game can go, from ${s.nDraws.toLocaleString('en-US')} simulated games. Every simulated game falls in exactly one, so they add to 100%.`}
              actions={<Link to={href('script', null)} className="nlink">Each script in full <Icon name="arrowRight" size={14} /></Link>}>
              <ScriptList s={s} ids={ids} hrefFor={hrefFor} />
            </Section>
          ) : unavailable}
          <GoalieMatchup goalies={goalies} profiles={goalieProfs.data ?? new Map()} p={proj} s={s} markets={quoted} start={ev.start_time_utc} now={now} slug={slug} ids={ids} />
          {s && <MarketFit s={s} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} pregame={pregame} limit={3} to={href('markets', null)} />}
          <SpecialTeams s={s} p={proj} ids={ids} matchup={r.matchup} lineups={r.context?.lineups ?? []} />
          <PlayerResearch players={players} s={s} ids={ids} slug={slug} known={knownPlayer} limit={4} to={href('players', null)} />
          <EdgeList items={fnd.whatMatters.filter((f) => f.basis === 'OPPONENT_ADJUSTED' || f.basis === 'AVAILABILITY')} />
        </div>
      )}

      {tab === 'script' && (
        s ? (
          <div className="nhg__story">
            <FrozenNote phase={phase} generatedAt={s.generatedAt} />
            <Section id="n-scripts-all" title="How it could play out" sub={`Seven mutually exclusive game scripts from ${s.nDraws.toLocaleString('en-US')} simulated games · ${s.versions.script}. Probabilities are written numbers; colour only identifies the script.`}>
              <ScriptList s={s} ids={ids} hrefFor={(id) => `${href('script', id)}`} selected={selected} />
            </Section>
            <div className="nscgrid">
              {(selected ? s.scripts.filter((x) => x.id === selected) : s.scripts).map((x) => (
                <ScriptCard key={x.id} x={x} s={s} ids={ids} slug={slug} eventId={eventId} marketsByTicker={marketsByTicker} r={r} />
              ))}
            </div>
            {selected && <p className="small"><Link to={hrefFor(null)}>Show every script →</Link></p>}
            <Stratum id="g-nhl-matrix" title="Which markets survive which scripts" sub="Expected value per contract inside each script. The probability mass a market survives matters more than the number of scripts.">
              <ScriptMatrix s={s} markets={quoted} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} selected={selected} />
            </Stratum>
          </div>
        ) : unavailable ?? <Notice title="No scripts for this game" />
      )}

      {tab === 'markets' && (
        <div className="nhg__story">
          <FrozenNote phase={phase} generatedAt={s?.generatedAt ?? null} />
          {s ? <MarketFit s={s} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} pregame={pregame} /> : unavailable}
          {s?.rules && (
            <details className="layer">
              <summary className="layer__s">How research candidates are ranked</summary>
              <div className="layer__b small">
                <p>{s.rules.ordering}.</p>
                <ul>{Object.entries(s.rules.tiers).map(([k, v]) => <li key={k}><b>{k.replace(/_/g, ' ').toLowerCase()}</b>: {v}</li>)}</ul>
                <p className="muted">{s.rules.conservative_probability}. Versions: {s.versions.script} · {s.versions.survival} · {s.versions.candidates}.</p>
              </div>
            </details>
          )}
          <Stratum id="g-nhl-mt" title="What the model says about each market" sub="Supported markets show the model's probability and the best side after fees; unsupported markets say so.">
            {detail.loading ? <Skeleton lines={6} /> : <NhlMarketTable s={s} quoted={quoted} slug={slug} eventId={eventId} />}
          </Stratum>
          <Stratum id="g-markets" title="Markets" sub={`All Kalshi contracts on this game (${detail.data?.markets.length ?? '…'}). ${pregame ? 'Prices are the current quote where Sift has one, otherwise the publication\'s capture.' : 'The game has started: prices move with the score and are not pregame research.'}`} actions={<><span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>{tickers.length ? <RefreshQuotes tickers={tickers} /> : null}</>}>
            {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
            {detail.data && (detail.data.markets.length ? <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} /> : <p className="nsl__muted">No Kalshi market is listed for this game yet.</p>)}
            <NewlyListed quotes={listedLater} now={now} />
          </Stratum>
        </div>
      )}

      {tab === 'players' && (
        <div className="nhg__story">
          <GoalieMatchup goalies={goalies} profiles={goalieProfs.data ?? new Map()} p={proj} s={s} markets={quoted} start={ev.start_time_utc} now={now} slug={slug} ids={ids} />
          <PlayerResearch players={players} s={s} ids={ids} slug={slug} known={knownPlayer} />
          <LinesPanel r={r} homeAbbr={homeAbbr} awayAbbr={awayAbbr} full />
          <Section id="n-inj" title="Injuries" sub="ESPN designations, name-matched by the publication. Injuries enter the model only through who is in the projected lineup.">
            <div className="injcols injcols--full">
              {[awayAbbr, homeAbbr].map((tm) => (
                <div key={tm} className="injcol">
                  <div className="injcol__h"><TeamMark sport={sport.code} abbr={tm} size="sm" /> {tm}</div>
                  <InjuryList rows={injuries.filter((x) => x.team === tm)} />
                </div>
              ))}
            </div>
            {injuries.some((x) => !x.team) && <InjuryList rows={injuries.filter((x) => !x.team)} />}
          </Section>
        </div>
      )}

      {tab === 'matchup' && (
        <>
          <Stratum id="g-nhl-find" title="Every finding" sub="Grouped by what it rests on.">
            <FindingsByBasis findings={fnd.findings} r={r} slug={slug} />
            {fnd.rule && <p className="muted small">{fnd.rule}.</p>}
          </Stratum>
          <SpecialTeams s={s} p={proj} ids={ids} matchup={r.matchup} lineups={r.context?.lineups ?? []} />
          {capShown(caps, 'matchup_metrics') && <AdjustedMatchup rows={r.matchup} metrics={metrics} slug={slug} homeAbbr={homeAbbr} awayAbbr={awayAbbr} homeId={homeP.participant_id} awayId={awayP.participant_id} eventId={eventId} />}
        </>
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
        {s && <p className="small muted">Scripts: {s.versions.script} · survival {s.versions.survival} · candidates {s.versions.candidates} · {s.drawSource}{s.frozen ? ` · frozen from ${s.frozenFromRun}` : ''}</p>}
        {proj && <p className="small muted">Projection: {proj.source}.</p>}
        <p className="small"><Link to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}>Export this game's full handicap packet →</Link></p>
      </details>
    </div>
  );
}
