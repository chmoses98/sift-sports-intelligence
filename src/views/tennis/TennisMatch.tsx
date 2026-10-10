// A tennis match page: the two players (ratings, serve and return), the tournament, surface and verified start
// status; the model's chance for each player with its validity and uncertainty; the sharp-reference triangulation;
// every market with the model's probability beside the price; and the research candidates the publication flags,
// all RESEARCH_ONLY by its own authority.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, Market } from '../../contract/types';
import { latestPrices } from '../../components/MarketBoard';
import { ErrorState, QualityBadge, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { kickoff } from '../../lib/format';
import { routes } from '../../lib/routes';
import { LEVEL_WORD, readTennis, START_WORD, TENNIS_FAMILY_ORDER, tennisFamilyLabel, tennisMarketTitle, tennisRating, TRIANGULATION_WORD, type TennisMatch } from '../../lib/tennis';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { tennisRecordText } from '../../lib/tennis';
import { useVisit } from '../../state/trail';
import { Authority, centsOf, Deep, KV, MarketFamilies, pct0, pct1, Pill, Section, signedPts, TextMark } from '../shared/kit';
import { GameOpportunities } from '../game/GameOpportunities';

/* eslint-disable @typescript-eslint/no-explicit-any */

function initials(name: string): string {
  const parts = name.split('/')[0].trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

function PlayerCard({ p, prof, slug, side }: { p: TennisMatch['a']; prof: EntityProfileDoc | undefined; slug: string; side: 'l' | 'r' }) {
  const r = prof ? tennisRating(prof) : null;
  return (
    <div className={`skvs__side${side === 'r' ? ' skvs__side--r' : ''}`}>
      <TextMark text={initials(p.name)} size="xl" />
      <Link to={routes.player(slug, p.id)} className="skvs__name">{p.name}</Link>
      <span className="skvs__sub">
        {r?.elo != null ? <>Elo <b className="num">{Math.round(r.elo)}</b>{r.eloRank != null ? ` · #${r.eloRank}${r.eloUniverse ? ` of ${r.eloUniverse}` : ''}` : ''}</> : p.identity.status === 'NOT_APPLICABLE_DOUBLES' ? 'Doubles pair: no rating' : p.identity.status === 'MAPPED' ? 'Rating loading…' : `No rating attached (${p.identity.reason ?? 'identity not mapped'})`}
      </span>
    </div>
  );
}

function ModelPanel({ t }: { t: TennisMatch }) {
  const { metrics } = useSport();
  const m = t.model;
  if (t.discipline === 'doubles') {
    return (
      <div className="skopp skopp--pass">
        <div className="skopp__eyebrow">Pass <Pill tone="neutral">doubles</Pill></div>
        <h2 className="skopp__t">No model probability for doubles.</h2>
        <p className="skopp__why">{m.validityReason ?? 'The publication suppresses its doubles model pending a validated replacement: prices and liquidity only.'}</p>
      </div>
    );
  }
  if (m.fairV1 == null && m.gen1 == null && m.gen2 == null) {
    return (
      <div className="skopp skopp--pass">
        <div className="skopp__eyebrow">Pass <Pill tone="neutral">no model row</Pill></div>
        <h2 className="skopp__t">The publication produced no model probability for this match.</h2>
        <p className="skopp__why">{m.validityReason ?? 'A rating attaches only on an exact, unique name match in the tour rating state; without one, Sift shows prices and nothing else.'}</p>
      </div>
    );
  }
  const fav = (m.fairV1 ?? m.gen2 ?? m.gen1 ?? 0.5) >= 0.5 ? t.a : t.b;
  const pFav = Math.max(m.fairV1 ?? m.gen2 ?? m.gen1 ?? 0.5, 1 - (m.fairV1 ?? m.gen2 ?? m.gen1 ?? 0.5));
  const ext = t.external.find((x) => x.ticker === fav.ticker) ?? t.external[0] ?? null;
  return (
    <div className="skopp">
      <div className="skopp__eyebrow">Model read <Authority value={t.authority} />{t.dataQuality.grade && <Pill tone={t.dataQuality.grade === 'A' ? 'ok' : 'warn'}>data grade {t.dataQuality.grade}</Pill>}</div>
      <h2 className="skopp__t">{fav.name} wins {pct0(pFav)} of the time in the model.</h2>
      <p className="skopp__why">
        Three model generations agree within {m.uncertainty != null ? pct1(m.uncertainty) : 'the published uncertainty'}: fair_v1 {pct0(m.fairV1)}, Gen-1 {pct0(m.gen1)}, Gen-2 {pct0(m.gen2)} for {t.a.name}
        {m.fairV1Envelope && m.fairV1Envelope[0] != null ? ` (envelope ${pct0(m.fairV1Envelope[0])}–${pct0(m.fairV1Envelope[1])} under the frozen perturbations)` : ''}.
        {ext ? ` ${TRIANGULATION_WORD[ext.triangulation ?? ''] ?? `Triangulation: ${ext.triangulation ?? 'not run'}`}: de-vigged ${ext.sources.join(' and ')} say ${pct0(ext.externalFair)} for ${ext.side ?? fav.name}, Kalshi mid ${pct0(ext.kalshiMid)}, model ${pct0(ext.modelFair)}.` : ''}
      </p>
      <ul className="skopp__nums">
        <li><span>Serve points on record</span><b className="num">{t.serve.aPoints?.toLocaleString('en-US') ?? '—'} / {t.serve.bPoints?.toLocaleString('en-US') ?? '—'}</b><small>{t.a.name.split(' ').pop()} / {t.b.name.split(' ').pop()}</small></li>
        <li><span>Matches on record</span><b className="num">{t.form.matchesA ?? '—'} / {t.form.matchesB ?? '—'}</b><small>recency {t.form.daysSinceA ?? '—'}d / {t.form.daysSinceB ?? '—'}d since last match</small></li>
        {t.surfaceAdjustment && <li><span>Surface sensitivity</span><b className="num">{signedPts(Math.min(...Object.values(t.surfaceAdjustment).filter((v): v is number => v != null)))} to {signedPts(Math.max(...Object.values(t.surfaceAdjustment).filter((v): v is number => v != null)))}</b><small>P({t.a.name.split(' ').pop()}) under surface-prior perturbations</small></li>}
        {ext?.decision && <li><span>External decision</span><b>{ext.decision}</b><small>{ext.referenceKind?.replace(/_/g, ' ').toLowerCase()}</small></li>}
      </ul>
      <p className="skopp__risk"><b>Why this is not a bet:</b> every tennis model number is RESEARCH_ONLY; {tennisRecordText(metrics)}. {ext?.triangulation === 'MODEL_LONE_OUTLIER' ? 'Here the model is the lone outlier against two sharp references, which is the usual sign the model, not the market, is wrong.' : ''}{t.form.note ? ` ${t.form.note}.` : ''}</p>
    </div>
  );
}

export function TennisMatchView({ eventId }: { eventId: string }) {
  const { sport, repo, slug } = useSport();
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const now = useNow(15_000);
  const r = research.data;
  const t = useMemo(() => (r ? readTennis(r) : null), [r]);
  const profA = useAsync(t?.a.id ? `prof:TENNIS:${t.a.id}` : null, () => repo.profile(t!.a.id));
  const profB = useAsync(t?.b.id ? `prof:TENNIS:${t.b.id}` : null, () => repo.profile(t!.b.id));
  useVisit(t ? `${t.a.name} v ${t.b.name}` : null, 'game');
  const markets = useMemo(() => detail.data?.markets ?? [], [detail.data]);
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !t) return <div className="page"><ErrorState error={research.error} what="this match's research" /></div>;
  const recs = detail.data?.recommendations ?? [];
  const byId = new Map(markets.map((m) => [m.market_id, m]));
  const title = (m: Market) => tennisMarketTitle(m, t);
  const notes = r.context?.notes ?? [];
  const ra = profA.data ? tennisRating(profA.data) : null;
  const rb = profB.data ? tennisRating(profB.data) : null;
  const rowsAB = t.rows;
  return (
    <div className="page tennis-match">
      <header className="skh">
        <div className="skh__title">
          <span className="eyebrow">{t.competition ?? 'Tennis'}{t.tour ? ` · ${t.tour}` : ''}{t.level ? ` · ${LEVEL_WORD[t.level] ?? t.level.replace(/_/g, ' ')}` : ''}{t.round ? ` · ${t.round}` : ''}{t.discipline === 'doubles' ? ' · doubles' : ''}</span>
          <div className="skvs">
            <PlayerCard p={t.a} prof={profA.data} slug={slug} side="l" />
            <div className="skvs__mid"><b>v</b><span>{t.surface ?? 'Surface not published'}</span><span>{t.start.expected ? kickoff(t.start.expected) : kickoff(r.event.start_time_utc)}</span></div>
            <PlayerCard p={t.b} prof={profB.data} slug={slug} side="r" />
          </div>
          <span className="skh__sub">
            Start: {START_WORD[t.start.status ?? ''] ?? t.start.status ?? 'unknown'}{t.start.confidence ? ` (${t.start.confidence.toLowerCase()} confidence${t.start.source ? `, ${t.start.source.replace(/^LIVE_SCHEDULE:/, '')}` : ''})` : ''}
            {t.start.nominalIsPlaceholder ? ' · the listed time is a day placeholder' : ''}
            {t.warnings.length ? ` · ${t.warnings.map((w) => w.split(':')[0].replace(/_/g, ' ').toLowerCase()).join(', ')}` : ''}
          </span>
        </div>
        <div className="skh__right">
          <div className="skh__status">
            <Pill tone={t.betAllowed ? 'neutral' : 'warn'}>{t.betAllowed ? 'market open to trade' : 'publication says do not trade'}</Pill>
            <Authority value={t.authority} />
          </div>
        </div>
      </header>

      <GameOpportunities eventId={r.event.event_id} now={now}>Every tennis number below is research only; the Kalshi mid has beaten the model on settled rows.</GameOpportunities>

      <Section id="tm-model" title="The model read" sub="The publication's chance for each player, the sharp-reference triangulation, and why it stays research.">
        <ModelPanel t={t} />
      </Section>

      <Section id="tm-serve" title="Serve, return and rating" sub="Surface-aware Elo and the structural serve/return model behind the probability; raw rows from the publication's matchup table.">
        {rowsAB.length === 0 ? <p className="muted">No matchup metrics published for this match{t.discipline === 'doubles' ? ' (doubles pairs carry no per-player rating)' : ''}.</p> : (
          <div className="tscroll"><table className="dtable">
            <thead><tr><th scope="col">Metric</th><th scope="col" className="r">{t.a.name}</th><th scope="col" className="r">{t.b.name}</th></tr></thead>
            <tbody>{rowsAB.map((x) => <tr key={x.metricId}><th scope="row">{x.name}</th><td className="r num">{x.aDisplay ?? (x.a != null ? (Math.abs(x.a) >= 10 ? Math.round(x.a).toLocaleString('en-US') : x.a.toFixed(3)) : '—')}</td><td className="r num">{x.bDisplay ?? (x.b != null ? (Math.abs(x.b) >= 10 ? Math.round(x.b).toLocaleString('en-US') : x.b.toFixed(3)) : '—')}</td></tr>)}</tbody>
          </table></div>
        )}
        {(ra || rb) && (
          <Deep summary="Surface record and rating provenance">
            <div className="skgrid">
              {([[t.a, ra], [t.b, rb]] as [TennisMatch['a'], ReturnType<typeof tennisRating> | null][]).map(([p, rr]) => rr ? (
                <div key={p.id} className="skpanel"><h3 className="skpanel__t">{p.name}</h3>
                  <KV rows={[
                    { k: 'Surface Elo', v: rr.surfaceElo.length ? rr.surfaceElo.map((s) => `${s.surface} ${Math.round(s.value)}`).join(' · ') : null },
                    { k: 'Matches rated', v: rr.matchesRated != null ? `${rr.matchesRated} (${Object.entries(rr.surfaceMatches).map(([s, nn]) => `${s} ${nn}`).join(', ')})` : null },
                    { k: 'Ratings as of', v: rr.ratingsAsOf },
                    { k: 'Identity', v: rr.identity?.toLowerCase().replace(/_/g, ' ') },
                  ]} />
                </div>
              ) : null)}
            </div>
          </Deep>
        )}
      </Section>

      <Section id="tm-markets" title="Markets" sub={`Every Kalshi contract on this match (${markets.length}): match winner, sets, game handicaps and totals, with the model's probability where the publication prices it.`}>
        {detail.loading && <Skeleton lines={5} />}
        {detail.error && <ErrorState error={detail.error} what="this match's markets" />}
        {detail.data && <MarketFamilies markets={markets} prices={prices} projections={r.projections} title={title} familyLabel={tennisFamilyLabel} order={TENNIS_FAMILY_ORDER} slug={slug} eventId={eventId} now={now} authority={t.authority} />}
        {recs.length > 0 && (
          <Deep summary={`${recs.length} research candidate${recs.length === 1 ? '' : 's'} the publication flags on this match`} open>
            <ul className="lims">
              {recs.map((rec) => {
                const m = byId.get(rec.market_id);
                const x = (rec as any).extensions ?? {};
                return (
                  <li key={rec.recommendation_id}>
                    <b>{rec.selection}</b> on {m ? <Link to={routes.market(slug, m.market_id, eventId)}>{title(m)}</Link> : rec.market_id} · price {centsOf((rec as any).current_price)} · model P(YES) {pct0(x.model_probability_yes)} · gap {signedPts(rec.fair_probability != null && (rec as any).current_probability != null ? rec.fair_probability - (rec as any).current_probability : null)}
                    {x.display_status ? ` · ${String(x.display_status).toLowerCase()}` : ''} · <Authority value={rec.authority} />
                    {rec.bet_up_to_price == null && <span className="muted"> · no bet-up-to price is published for a research-only candidate</span>}
                  </li>
                );
              })}
            </ul>
          </Deep>
        )}
      </Section>

      <details className="gnotes">
        <summary>Publication notes & provenance</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        {t.model.validity && <p className="small muted">Model validity: {Object.entries(t.model.validity).map(([k, v]) => `${k} ${v.toLowerCase().replace(/_/g, ' ')}`).join(' · ')}</p>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source ?? ''} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
      </details>
    </div>
  );
}
