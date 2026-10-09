// A tennis player page: the rating profile the publication holds (overall and surface Elo with their ranks, structural
// serve and return ability, serve-point evidence), the scheduled match, and the contracts listed on the player.
import { Link, useParams } from 'react-router';
import { ErrorState, QualityBadge, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { kickoff } from '../../lib/format';
import { routes } from '../../lib/routes';
import { tennisRating } from '../../lib/tennis';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { Authority, KV, Pill, Section, SportHeader, TextMark } from '../shared/kit';

export function TennisPlayerView() {
  const { playerId = '' } = useParams();
  const { sport, repo, slug, metrics } = useSport();
  const prof = useAsync(`prof:${sport.code}:${playerId}`, () => repo.profile(playerId));
  const p = prof.data;
  useVisit(p?.entity.display_name ?? null, 'player');
  if (prof.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!p) return <div className="page"><ErrorState error={prof.error} what="this player's profile" /></div>;
  const r = tennisRating(p);
  const next = [...p.games].filter((g) => g.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))[0] ?? null;
  const metricRows = p.metrics.filter((o) => !o.split).map((o) => ({ k: metrics.get(o.metric_id)?.name ?? o.metric_id, v: <><b className="num">{o.display_value ?? (o.value != null ? (Math.abs(o.value) >= 10 ? Math.round(o.value).toLocaleString('en-US') : o.value.toFixed(3)) : '—')}</b>{o.context?.rank != null ? <span className="muted"> · #{o.context.rank}{o.context.universe_size ? ` of ${o.context.universe_size}` : ''}</span> : null}</> }));
  return (
    <div className="page tennis-player">
      <SportHeader
        logo={null}
        title={p.entity.display_name}
        sub={<>{r.tour ?? ''}{r.discipline ? ` · ${r.discipline}` : ''}{r.lastMatch ? ` · last match ${r.lastMatch}` : ''}{r.elo != null ? <> · Elo <b className="num">{Math.round(r.elo)}</b>{r.eloRank != null ? ` (#${r.eloRank}${r.eloUniverse ? ` of ${r.eloUniverse}` : ''})` : ''}</> : ''}</>}
        status={<><Pill tone={r.identity === 'MAPPED' ? 'ok' : 'warn'}>identity {r.identity?.toLowerCase().replace(/_/g, ' ') ?? 'unknown'}</Pill><Authority value="RESEARCH_ONLY" /></>}
      />
      <div className="skgrid">
        <div className="stack">
          <Section id="tp-rating" title="Rating profile" sub="Surface-aware Elo and the structural serve/return model, as the publication holds them. Ratings are research inputs, not a betting edge.">
            <div className="skpanel">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}><TextMark text={p.entity.display_name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()} size="lg" /><span className="muted small">{r.matchesRated != null ? `${r.matchesRated} matches rated` : 'Rating sample not published'}{r.ratingsAsOf ? ` · ratings as of ${r.ratingsAsOf}` : ''}</span></div>
              <KV rows={metricRows} />
            </div>
            {r.surfaceElo.length > 0 && (
              <div className="skpanel" style={{ marginTop: 12 }}>
                <h3 className="skpanel__t">By surface</h3>
                <div className="tscroll"><table className="dtable">
                  <thead><tr><th scope="col">Surface</th><th scope="col" className="r">Elo</th><th scope="col" className="r">Matches</th></tr></thead>
                  <tbody>{r.surfaceElo.map((s) => <tr key={s.surface}><th scope="row">{s.surface}</th><td className="r num">{Math.round(s.value)}</td><td className="r num">{r.surfaceMatches[s.surface] ?? '—'}</td></tr>)}</tbody>
                </table></div>
              </div>
            )}
          </Section>
        </div>
        <div className="stack">
          <Section id="tp-next" title="Scheduled match" sub="The match the publication lists for this player.">
            {next ? (
              <Link to={routes.game(slug, next.event_id)} className="skrow">
                <span className="skrow__when"><span className="skrow__time num">{kickoff(next.start_time_utc)}</span></span>
                <span className="skrow__teams"><span className="skrow__name">v {next.opponent_name}<small>{next.competition}</small></span></span>
              </Link>
            ) : <p className="muted">No scheduled match on the current slate.</p>}
          </Section>
          <Section id="tp-markets" title="Contracts on this player" sub="Match-winner and other contracts the publication lists for this player; open the match for prices beside the model.">
            {p.markets.length === 0 ? <p className="muted">None listed.</p> : (
              <ul className="lims">{p.markets.map((m) => <li key={m.market_id}><Link to={m.event_id ? routes.market(slug, m.market_id, m.event_id) : '#'}>{m.yes_description}</Link> <span className="muted">· {m.market_family.replace(/_/g, ' ')}</span></li>)}</ul>
            )}
          </Section>
        </div>
      </div>
      <p className="small muted"><QualityBadge quality={p.quality} /> {p.quality.source ?? ''} · {p.quality.limitations.join(' · ')}</p>
    </div>
  );
}
