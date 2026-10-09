// A soccer match page, in the order a viewer asks the questions: who plays and when; what the strongest defensible
// research expression is (or an honest PASS); why, with the counter-case that would beat it; how the match could play
// (six scripts with simulation shares, never calibrated probabilities); the opponent- and schedule-adjusted matchup;
// every market with the model's probability beside the price; then rest, head-to-head, calibration and provenance.
// Every word about authority is the publication's: all soccer model families are RESEARCH_ONLY.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EventResearchDoc, Market } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { latestPrices } from '../../components/MarketBoard';
import { ErrorState, Notice, QualityBadge, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { kickoff, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import {
  clubInitials, EXPRESSION_HELP, EXPRESSION_WORD, isSoccerEngine, readSoccerEngine, soccerBoard, soccerCalibration, soccerFamilyLabel, soccerH2H, soccerMarketTitle,
  soccerRest, SOCCER_FAMILY_ORDER, SOCCER_SCRIPT_TITLE, type SoccerEngine, type SoccerExpression, type SoccerNames,
} from '../../lib/soccer';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { Authority, centsOf, Deep, KV, MarketFamilies, pct0, Pill, RankRows, Section, signedPts, TextMark, ThreeWay } from '../shared/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONF_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = { HIGH: 'ok', MEDIUM: 'warn', LOW: 'bad' };
const LABEL_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral' | 'research'> = { VERY_ROBUST: 'ok', ROBUST: 'ok', MIXED: 'warn', FRAGILE: 'warn', SCRIPT_DEPENDENT: 'warn', NO_EDGE: 'neutral' };

function sideWord(side: 'yes' | 'no', title: string): string {
  // "Result: home (NO)" reads as "NO on Arsenal to win": the contract and the side a buyer takes, nothing else.
  return side === 'no' ? `NO on “${title}”` : `YES on “${title}”`;
}

/** The headline: the engine's strongest robust expression at the price it was judged at, with its counter-case. Or PASS. */
function Headline({ e, engine, names, byTicker, slug, eventId }: { e: SoccerExpression | null; engine: SoccerEngine; names: SoccerNames; byTicker: Map<string, Market>; slug: string; eventId: string }) {
  const g = engine.glance;
  if (!e || g.noCompellingEdge) {
    return (
      <div className="skopp skopp--pass">
        <div className="skopp__eyebrow">Pass <Pill tone="neutral">no compelling research expression</Pill></div>
        <h2 className="skopp__t">Nothing here clears the publication's research bar at current prices.</h2>
        <p className="skopp__why">{g.noCompellingEdgeReason ?? `No contract on this fixture is positive after fees across most material scripts (the engine's minimum research edge is ${engine.researchEdgeMin != null ? `${Math.round(engine.researchEdgeMin * 100)}¢` : 'published per fixture'}). A pass is a result, not a failure.`}</p>
        {g.sentence && <p className="skopp__foot">{g.sentence}</p>}
      </div>
    );
  }
  const m = byTicker.get(e.ticker);
  const title = m ? soccerMarketTitle(m, names) : e.description;
  const support = e.materialScripts ? `${e.supportingScripts} of ${e.materialScripts} material scripts` : null;
  return (
    <div className="skopp">
      <div className="skopp__eyebrow">Strongest research expression <Pill tone={LABEL_TONE[e.label] ?? 'neutral'} title={EXPRESSION_HELP[e.label]}>{EXPRESSION_WORD[e.label] ?? e.label}</Pill><Authority value={e.authority} /></div>
      <h2 className="skopp__t">{sideWord(e.side, title)}</h2>
      {g.sentence && <p className="skopp__why">{g.sentence}</p>}
      <ul className="skopp__nums">
        <li><span>Price judged</span><b className="num">{centsOf(e.price)}</b><small>YES ask at the research run</small></li>
        <li><span>Break-even</span><b className="num">{centsOf(e.breakEven)}</b><small>ask plus Kalshi fee</small></li>
        <li><span>Fair P({e.side.toUpperCase()})</span><b className="num">{pct0(e.fairProbability)}</b><small>model, research only</small></li>
        <li><span>Edge after fee</span><b className="num">{signedPts(e.feeAdjustedEv ?? e.overallEdge)}</b><small>per $1 contract</small></li>
        <li><span>Worst case</span><b className="num">{signedPts(e.worstCaseEdge)}</b><small>20th-percentile edge</small></li>
        {support && <li><span>Script support</span><b className="num">{support}</b><small>{e.weightedSupportShare != null ? `${pct0(e.weightedSupportShare)} of simulated worlds` : ''}</small></li>}
      </ul>
      {e.counterCase && <p className="skopp__risk"><b>What beats it:</b> {e.counterCase.statement}</p>}
      <div className="skopp__foot">
        <span>Price status {engine.priceStatus?.toLowerCase() ?? 'unknown'}{engine.pricedAt ? ` · judged ${kickoff(engine.pricedAt)}` : ''}</span>
        {m && <Link to={routes.market(slug, m.market_id, eventId)} className="btn btn--sm">Open this contract <Icon name="arrowRight" size={14} /></Link>}
        <span>Recompute at a fresher ask: edge = fair − (ask + fee).</span>
      </div>
    </div>
  );
}

function Scripts({ engine, byTicker, names }: { engine: SoccerEngine; byTicker: Map<string, Market>; names: SoccerNames }) {
  const title = (t: string, d: string) => (byTicker.get(t) ? soccerMarketTitle(byTicker.get(t)!, names) : d);
  return (
    <ul className="skscr">
      {engine.scripts.map((s, i) => (
        <li key={s.id} className={`skscr__row tone-${s.tone}`}>
          <div className="skscr__h"><span className="skscr__name">{i === 0 && <span className="skrow__tag">Most common · </span>}{s.title}</span><span className="skscr__p num">{pct0(s.share)}</span></div>
          <div className="skscr__bar" aria-hidden="true"><i style={{ width: `${Math.round(s.share * 100)}%` }} /></div>
          <div className="skscr__d">{s.definition}{s.profile.typicalScores.length ? <> · typical {s.profile.typicalScores.slice(0, 3).map((x) => x.score).join(', ')}</> : null}</div>
          {(s.helped.length > 0 || s.hurt.length > 0) && (
            <Deep summary="Markets this script helps and hurts">
              <div className="skscr__mk">
                <div><h4>Helps</h4><ul>{s.helped.map((m) => <li key={m.ticker}><span>{title(m.ticker, m.description)}</span><b className="num">{pct0(m.pGivenScript)} <small className="muted">({signedPts(m.lift)})</small></b></li>)}</ul></div>
                <div><h4>Hurts</h4><ul>{s.hurt.map((m) => <li key={m.ticker}><span>{title(m.ticker, m.description)}</span><b className="num">{pct0(m.pGivenScript)} <small className="muted">({signedPts(m.lift)})</small></b></li>)}</ul></div>
              </div>
            </Deep>
          )}
        </li>
      ))}
    </ul>
  );
}

function Expressions({ engine, byTicker, names, slug, eventId }: { engine: SoccerEngine; byTicker: Map<string, Market>; names: SoccerNames; slug: string; eventId: string }) {
  if (!engine.expressions.length) return <p className="muted">The engine judged no expression on this fixture.</p>;
  const order = (e: SoccerExpression) => ['VERY_ROBUST', 'ROBUST', 'MIXED', 'FRAGILE', 'SCRIPT_DEPENDENT', 'NO_EDGE'].indexOf(e.label);
  const rows = [...engine.expressions].sort((a, b) => order(a) - order(b) || (b.worstCaseEdge ?? -9) - (a.worstCaseEdge ?? -9));
  return (
    <div className="tscroll">
      <table className="dtable">
        <thead><tr><th scope="col">Expression</th><th scope="col">Label</th><th scope="col" className="r">Price</th><th scope="col" className="r">Break-even</th><th scope="col" className="r">Fair</th><th scope="col" className="r">Edge</th><th scope="col" className="r">Worst case</th><th scope="col">Scripts</th></tr></thead>
        <tbody>
          {rows.map((e) => {
            const m = byTicker.get(e.ticker);
            return (
              <tr key={e.key}>
                <th scope="row">{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{e.side.toUpperCase()} · {soccerMarketTitle(m, names)}</Link> : `${e.side.toUpperCase()} · ${e.description}`}</th>
                <td><Pill tone={LABEL_TONE[e.label] ?? 'neutral'} title={EXPRESSION_HELP[e.label]}>{EXPRESSION_WORD[e.label] ?? e.label}</Pill></td>
                <td className="r num">{centsOf(e.price)}</td>
                <td className="r num">{centsOf(e.breakEven)}</td>
                <td className="r num">{pct0(e.fairProbability)}</td>
                <td className="r num">{signedPts(e.feeAdjustedEv ?? e.overallEdge)}</td>
                <td className="r num">{signedPts(e.worstCaseEdge)}</td>
                <td className="small">{e.supportingScripts} support · {e.opposingScripts} oppose{e.counterCase ? ` · beaten by ${SOCCER_SCRIPT_TITLE[e.counterCase.script]?.toLowerCase() ?? e.counterCase.script}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Strength({ engine, names }: { engine: SoccerEngine; names: SoccerNames }) {
  const mu = engine.matchup;
  if (!mu?.home || !mu?.away) return null;
  const pc = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}th`);
  const side = (s: NonNullable<typeof mu.home>, name: string) => (
    <div className="skpanel">
      <h3 className="skpanel__t">{name}</h3>
      <KV rows={[
        { k: 'Attack', v: <><b className="num">{pc(s.attack.percentile)}</b> percentile in the pool</> },
        { k: 'Defence', v: <><b className="num">{pc(s.defence.percentile)}</b> percentile</> },
        { k: 'Net rating', v: <><b className="num">{pc(s.netRating.percentile)}</b> percentile</> },
        { k: 'Schedule', v: s.scheduleStrength ? <>opponents at the <b className="num">{pc(s.scheduleStrength.percentile)}</b> percentile over {s.scheduleStrength.matches} matches</> : null },
        { k: 'Sample', v: `${s.effectiveMatches ?? '—'} effective matches · ${s.sampleQuality?.toLowerCase() ?? 'unknown'} quality` },
        { k: 'Raw form', v: s.rawForm ? <span className="muted">{s.rawForm.gf?.toFixed(2)} for, {s.rawForm.ga?.toFixed(2)} against per match (unadjusted context, not a strength estimate)</span> : null },
      ]} />
    </div>
  );
  return (
    <div className="stack">
      {engine.glance.primaryMismatch && <p className="muted">Primary mismatch: <b>{engine.glance.primaryMismatch.label.replace(/_/g, ' ').toLowerCase()}</b> ({engine.glance.primaryMismatch.matchup.replace(/_/g, ' ').toLowerCase()}, advantage {engine.glance.primaryMismatch.side.toLowerCase()}, evidence {engine.glance.primaryMismatch.evidenceQuality?.toLowerCase()}).</p>}
      <div className="skgrid">{side(mu.home, names.home)}{side(mu.away, names.away)}</div>
      <p className="muted small">{mu.metricKind ?? 'Dixon-Coles latent goal rates'} · pool {mu.pool} · {mu.evidenceStatus?.replace(/_/g, ' ').toLowerCase()}. Percentiles are against the competition pool; higher is better for attack and defence alike.</p>
    </div>
  );
}

export function SoccerMatchView({ eventId }: { eventId: string }) {
  const { sport, repo, slug, metrics } = useSport();
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const now = useNow(15_000);
  const r = research.data;
  const homeP = r?.participants.find((p) => p.home_away === 'HOME');
  const awayP = r?.participants.find((p) => p.home_away === 'AWAY');
  const label = r ? `${homeP?.display_name ?? '?'} v ${awayP?.display_name ?? '?'}` : null;
  useVisit(label, 'game');
  const engine = useMemo(() => readSoccerEngine(r), [r]);
  const board = r ? soccerBoard(r) : null;
  const markets = useMemo(() => detail.data?.markets ?? [], [detail.data]);
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  const byTicker = useMemo(() => new Map(markets.map((m) => [m.kalshi_ticker, m])), [markets]);
  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !homeP || !awayP) return <div className="page"><ErrorState error={research.error} what="this match's research" /></div>;
  const names: SoccerNames = { home: homeP.display_name, away: awayP.display_name, homeId: homeP.participant_id, awayId: awayP.participant_id };
  const ev = r.event;
  const x = (ev.extensions ?? {}) as any;
  const venue = r.context?.venue as any;
  const wx = r.context?.weather as any;
  const started = Date.parse(ev.start_time_utc) <= now;
  const rest = soccerRest(r);
  const h2h = soccerH2H(r);
  const cal = soccerCalibration(r);
  const ok = isSoccerEngine(engine);
  const comp = ok && engine.glance.competition?.name ? `${engine.glance.competition.name}${engine.glance.competition.stage ? ` · ${engine.glance.competition.stage}` : ''}` : ev.competition ?? '';
  const title = (m: Market) => soccerMarketTitle(m, names);
  const notes = r.context?.notes ?? [];
  return (
    <div className="page soccer-match">
      <header className="skh">
        <div className="skh__title">
          <span className="eyebrow">{comp}{x.stage ? ` · ${x.stage}` : ''}{ok && engine.context?.knockout ? ' · knockout' : ''}</span>
          <div className="skvs">
            <div className="skvs__side"><TextMark text={clubInitials(homeP.display_name)} size="xl" /><Link to={routes.team(slug, homeP.participant_id)} className="skvs__name">{homeP.display_name}</Link><span className="skvs__sub">{ok && engine.context?.neutralSite ? 'neutral site' : 'home'}</span></div>
            <div className="skvs__mid"><b>v</b><span>{kickoff(ev.start_time_utc)}</span><span>{started ? 'Kicked off' : until(ev.start_time_utc, now)}</span></div>
            <div className="skvs__side skvs__side--r"><TextMark text={clubInitials(awayP.display_name)} size="xl" /><Link to={routes.team(slug, awayP.participant_id)} className="skvs__name">{awayP.display_name}</Link><span className="skvs__sub">away</span></div>
          </div>
          <span className="skh__sub">
            {venue?.name ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}` : 'Venue not published'}
            {wx?.temperature_2m != null ? ` · ${Math.round(wx.temperature_2m)}°C${wx.precipitation_probability != null ? `, ${wx.precipitation_probability}% rain` : ''}${wx.wind_speed_10m != null ? `, wind ${Math.round(wx.wind_speed_10m)} km/h` : ''}` : ''}
            {` · lineups ${(ok ? engine.lineupStatus : x.lineup_status) ?? 'unknown'}`}
          </span>
        </div>
        <div className="skh__right">
          <div className="skh__status">
            {ok && engine.dataConfidence && <Pill tone={CONF_TONE[engine.dataConfidence.level] ?? 'neutral'} title={engine.dataConfidence.reasons.join('; ') || 'Describes the inputs, not the probability of winning'}>Data confidence {engine.dataConfidence.level.toLowerCase()}</Pill>}
            {ok && engine.freshness.model && <Pill tone={engine.freshness.model.status === 'CURRENT' ? 'ok' : 'warn'}>Model {engine.freshness.model.status?.toLowerCase()}</Pill>}
            <Authority value="RESEARCH_ONLY" />
          </div>
        </div>
      </header>

      {board && (
        <div className="skpanel" style={{ marginBottom: 'var(--s-6)' }}>
          <h3 className="skpanel__t">Model board · 1X2</h3>
          <ThreeWay home={board.pHome} draw={board.pDraw} away={board.pAway} homeLabel={names.home} awayLabel={names.away} label="Model result probabilities" />
          <p className="muted small" style={{ margin: '8px 0 0' }}>Expected goals {board.meanHome?.toFixed(2)}–{board.meanAway?.toFixed(2)} (Dixon-Coles rates, not xG) · both teams score {pct0(board.pBtts)} · over 2.5 {pct0(board.pOver25)} · generated {kickoff(board.generatedAt)}</p>
        </div>
      )}

      <Section id="sm-opp" title="The research read" sub="The one expression the publication's script engine rates strongest at the price it saw, and the script that beats it. Research only.">
        {ok ? <Headline e={engine.glance.bestRobust ?? engine.glance.bestScriptSpecific} engine={engine} names={names} byTicker={byTicker} slug={slug} eventId={eventId} /> : (
          <div className="skopp skopp--pass">
            <div className="skopp__eyebrow">Pass <Pill tone="neutral">{engine.status.toLowerCase()}</Pill></div>
            <h2 className="skopp__t">No script-engine read for this fixture.</h2>
            <p className="skopp__why">{engine.reason} Sift shows the markets and the matchup below without inventing a thesis.</p>
          </div>
        )}
      </Section>

      {ok && (
        <Section id="sm-scripts" title="How the match could play" sub="Six scripts from the simulation, most common first. Shares are simulation shares, not calibrated probabilities (the publication says so). Open one for the markets it helps and hurts.">
          <Scripts engine={engine} byTicker={byTicker} names={names} />
          {engine.dataGaps.length > 0 && <Deep summary={`${engine.dataGaps.length} published data gaps`}><ul className="lims">{engine.dataGaps.map((g) => <li key={g.code}><b>{g.code.replace(/_/g, ' ').toLowerCase()}</b> — {g.detail}</li>)}</ul></Deep>}
        </Section>
      )}

      <Section id="sm-matchup" title="Matchup" sub={ok && engine.matchup ? 'Opponent- and schedule-adjusted attack and defence (percentiles in the competition pool), then every published metric with its league rank.' : 'Every published metric with its league rank.'}>
        {ok && <Strength engine={engine} names={names} />}
        <div style={{ marginTop: 'var(--s-4)' }}>
          <RankRows rows={r.matchup} metrics={metrics} left={{ label: names.home, side: 'home' }} right={{ label: names.away, side: 'away' }} leftId={homeP.participant_id} rightId={awayP.participant_id} slug={slug} eventId={eventId} />
        </div>
      </Section>

      {ok && engine.expressions.length > 0 && (
        <Section id="sm-expr" title="Every research expression" sub="Each contract and side the engine judged, with the fee-aware break-even, the model's fair probability, the overall and worst-case edge, and the scripts for and against. Ordered by robustness, never by raw edge.">
          <Expressions engine={engine} byTicker={byTicker} names={names} slug={slug} eventId={eventId} />
        </Section>
      )}

      <Section id="sm-markets" title="Markets" sub={`Every Kalshi contract on this match (${markets.length}), by family, with the model's probability where the publication prices it.`}>
        {detail.loading && <Skeleton lines={5} />}
        {detail.error && <ErrorState error={detail.error} what="this match's markets" />}
        {detail.data && <MarketFamilies markets={markets} prices={prices} projections={r.projections} title={title} familyLabel={soccerFamilyLabel} order={SOCCER_FAMILY_ORDER} slug={slug} eventId={eventId} now={now} authority="RESEARCH_ONLY" />}
      </Section>

      <Section id="sm-ctx" title="Context" sub="Rest, head-to-head and the model's settled calibration, as published.">
        <div className="skgrid">
          <div className="stack">
            {rest && (
              <div className="skpanel"><h3 className="skpanel__t">Rest and congestion</h3>
                <KV rows={[
                  { k: names.home, v: `${rest.home.restDays ?? '—'} days' rest · ${rest.home.matches14d ?? '—'} matches in 14 days · ${rest.home.matches28d ?? '—'} in 28` },
                  { k: names.away, v: `${rest.away.restDays ?? '—'} days' rest · ${rest.away.matches14d ?? '—'} matches in 14 days · ${rest.away.matches28d ?? '—'} in 28` },
                  { k: 'Note', v: <span className="muted">Ledger context ({rest.quality?.toLowerCase()}); the publication's research found about no signal in rest.</span> },
                ]} />
              </div>
            )}
            {h2h && (
              <div className="skpanel"><h3 className="skpanel__t">Head to head</h3>
                <p style={{ margin: '0 0 8px' }}>{h2h.n} meetings: {names.home} {h2h.homeWins}W {h2h.draws}D {h2h.awayWins}L · goals {h2h.homeGoals}–{h2h.awayGoals}</p>
                <ul className="lims">{h2h.recent.map((g) => <li key={g.date}>{g.date} · {g.score}{g.venueSide ? ` (${names.home} ${g.venueSide.toLowerCase()})` : ''}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="skpanel">
            <h3 className="skpanel__t">Model calibration by market family</h3>
            {cal.length === 0 ? <p className="muted">No settled calibration published for this fixture's pool yet.</p> : (
              <div className="tscroll"><table className="dtable">
                <thead><tr><th scope="col">Family</th><th scope="col" className="r">Settled</th><th scope="col" className="r">Model log loss</th><th scope="col" className="r">Market</th><th scope="col" className="r">CLV</th></tr></thead>
                <tbody>{cal.slice(0, 12).map((c) => <tr key={c.family}><th scope="row">{soccerFamilyLabel(c.family)}</th><td className="r num">{c.n}</td><td className="r num">{c.logLoss?.toFixed(3) ?? '—'}</td><td className="r num">{c.marketLogLoss?.toFixed(3) ?? '—'}</td><td className="r num">{c.clv != null ? signedPts(c.clv) : '—'}</td></tr>)}</tbody>
              </table></div>
            )}
            <p className="muted small">Lower log loss is better. Where the market column is lower, the market has been the better forecaster on settled contracts: the honest reason every soccer number stays research only.</p>
          </div>
        </div>
      </Section>

      <details className="gnotes">
        <summary>Publication notes & provenance</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at}{ok && engine.feeModel ? ` · fee model: ${engine.feeModel}` : ''}</p>
        {!board && <Notice tone="research" title="Not on the model board">The publication did not price this fixture at its last run, so no model probability is shown anywhere on this page.</Notice>}
      </details>
    </div>
  );
}

export type { EventResearchDoc };
