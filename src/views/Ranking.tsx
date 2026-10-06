import { Link, useParams, useSearchParams } from 'react-router';
import { RankBars } from '../charts/RankBars';
import { useAsync } from '../data/hooks';
import { PlainEnglish } from './Metric';
import { EntityLink, ErrorState, QualityBadge, SaveButton, Skeleton, Stratum } from '../components/ui';
import { exactTime, metricFormatter, ordinal } from '../lib/format';
import { WINDOW_EXPLAIN } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';

export function RankingView() {
  const { rankingId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const focus = sp.get('focus');
  const opp = sp.get('opp');
  const pins = new Set((sp.get('pin') ?? '').split(',').filter(Boolean));
  const { sport, repo, slug, metrics } = useSport();
  const rk = useAsync(`rnk:${sport.code}:${rankingId}`, () => repo.ranking(rankingId));
  const si = useAsync(`si:${sport.code}:${repo.source.root}`, () => repo.searchIndex());
  const d = rk.data;
  const def = d ? metrics.get(d.metric_id) : undefined;
  useVisit(def ? `${def.short_name ?? def.name} ranking` : null, 'ranking');
  if (rk.loading) return <div className="page"><Skeleton lines={12} tall /></div>;
  if (!d) return <div className="page"><ErrorState error={rk.error} what="this ranking" /></div>;
  const scale = Math.max(Math.abs(d.summary.min ?? 0), Math.abs(d.summary.max ?? 0));
  const fmt = metricFormatter(def, scale);
  const togglePin = (id: string) => {
    const n = new Set(pins);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSp((prev) => {
      const q = new URLSearchParams(prev);
      if (n.size) q.set('pin', [...n].join(','));
      else q.delete('pin');
      return q;
    }, { replace: true });
  };
  const fEntry = d.entries.find((e) => e.entity_id === focus);
  const oEntry = d.entries.find((e) => e.entity_id === opp);
  const related = (si.data?.items ?? []).filter((e) => e.kind === 'RANKING' && e.id !== rankingId && def && e.label.toLowerCase().includes((def.subcategory ?? def.category).toLowerCase()));
  const sameCat = [...metrics.values()].filter((m) => def && m.category === def.category && m.metric_id !== def.metric_id && m.supports?.rank);

  return (
    <div className="page ranking">
      <header className="ehead ehead--metric">
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Comparison universe · {d.universe.label}
          </div>
          <h1 className="h-display h-display--md">{def?.name ?? d.metric_id}</h1>
          <PlainEnglish metricId={d.metric_id} def={def} />
          <div className="ehead__meta">
            <QualityBadge quality={d.quality} />
            <span className="chip">{d.window.label} — {WINDOW_EXPLAIN[d.window.label] ?? d.window.kind.toLowerCase()}</span>
            <span className="chip">{d.higher_is_better === false ? 'rank 1 = lowest value (lower is better)' : d.higher_is_better ? 'rank 1 = highest value' : 'ranked high to low; no better direction'}</span>
          </div>
        </div>
        <div className="ehead__actions">
          <SaveButton
            ref_kind="RANKING" sport={sport.code} id={rankingId}
            label={{ label: `${def?.short_name ?? d.metric_id} ranking${fEntry ? ` · ${fEntry.short_name} ${ordinal(fEntry.rank)}` : ''}`, sub: d.universe.label, href: routes.ranking(slug, rankingId, { focus, opp }) }}
          />
        </div>
      </header>

      <div className="summary">
        <div><span className="summary__k">Teams</span><b className="num">{d.universe.size}</b></div>
        <div><span className="summary__k">Mean</span><b className="num">{fmt(d.summary.mean)}</b></div>
        <div><span className="summary__k">Median</span><b className="num">{fmt(d.summary.median)}</b></div>
        <div><span className="summary__k">Std dev</span><b className="num">{fmt(d.summary.stdev)}</b></div>
        {fEntry && <div className="summary--focus"><span className="summary__k">{fEntry.short_name}</span><b className="num">{ordinal(fEntry.rank)} · {fmt(fEntry.value)}</b></div>}
        {oEntry && <div className="summary--opp"><span className="summary__k">{oEntry.short_name}</span><b className="num">{ordinal(oEntry.rank)} · {fmt(oEntry.value)}</b></div>}
      </div>

      <Stratum title={`All ${d.universe.size}`} sub="Tap a team to open its profile; + pins it as a comparison (kept in the URL, so the view can be shared).">
        <RankBars
          entries={d.entries} mean={d.summary.mean} median={d.summary.median} focusId={focus} oppId={opp} pins={pins}
          format={fmt} hrefFor={(e) => routes.metric(slug, d.metric_id, { team: e.entity_id, opp: e.entity_id === focus ? opp : focus })}
          caption={`${def?.name} ranking, ${d.universe.label}`} onPin={togglePin}
        />
        <p className="muted small">
          Competition ranking (ties share the best rank). Universe filter: {d.universe.filter ?? '—'}. As of {exactTime(d.as_of)}.
        </p>
        {d.quality.limitations.length > 0 && <ul className="lims">{d.quality.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
      </Stratum>

      {(sameCat.length > 0 || related.length > 0) && (
        <Stratum title="Sideways" sub="The same teams on neighbouring metrics.">
          <div className="chips">
            {sameCat.slice(0, 12).map((m) => (
              <EntityLink key={m.metric_id} kind="metric" to={routes.metric(slug, m.metric_id, { team: focus, opp })}>{m.short_name ?? m.name}</EntityLink>
            ))}
          </div>
        </Stratum>
      )}
      {focus && (
        <div className="cta-row">
          <Link className="btn btn--ghost" to={routes.team(slug, focus)}>Back to {fEntry?.display_name}</Link>
        </div>
      )}
    </div>
  );
}
