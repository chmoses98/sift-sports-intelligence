// NHL and NBA team strength on the reader's chosen footing (backlog 5.1, 5.2): the app-wide Adjusted / Raw toggle
// (state/statMode.ts, the same one the NFL Matchups tab and team pages use) picks which value leads; the other footing
// stays beside it, tagged, so the two are never confused. When a measure publishes only one footing, that one is shown
// with a "Raw only" / "Adjusted only" tag. Pairing and fallback rules live in insights/adjRaw.ts.
import { Link } from 'react-router';
import type { EntityProfileDoc, MetricDef } from '../../contract/types';
import { BasisTag, ModeToggle } from '../../components/statviz';
import { Stratum } from '../../components/ui';
import { adjRawRows, coverage, shownSide, type AdjRawSide } from '../../insights/adjRaw';
import { formatUnitValue, sportUnit } from '../../insights/sportUnits';
import { routes } from '../../lib/routes';
import { useStatMode } from '../../state/statMode';

const COPY: Record<string, { sub: string; adjNote: string; rawNote: string; otherRaw: string }> = {
  NHL: {
    sub: '5v5, recency-weighted. Adjusted removes each opponent’s strength (nhl-oppadj-1.0, a research layer); raw is the same games and weights without the adjustment.',
    adjNote: 'Adjusted leads; the raw number on the same games is beside it.',
    rawNote: 'Raw leads (same games, not opponent-adjusted; the publication ranks only the adjusted value).',
    otherRaw: 'Raw (same games)',
  },
  NBA: {
    sub: 'Raw: points per 100 possessions over the regular season. Adjusted: the model’s opponent-adjusted points per 100 possessions (recency-weighted, each opponent removed). The windows differ, so the gap is not only schedule.',
    adjNote: 'Adjusted leads; raw season ratings are beside it.',
    rawNote: 'Raw season ratings lead; the opponent-adjusted model inputs are beside them.',
    otherRaw: 'Raw (season)',
  },
};

export function AdjRawStrength({ sport, p, slug, metrics }: { sport: string; p: EntityProfileDoc; slug: string; metrics: Map<string, MetricDef> }) {
  const [mode] = useStatMode();
  const rows = adjRawRows(sport, p, metrics);
  const cov = coverage(rows);
  const copy = COPY[sport];
  if (!rows.length || cov === 'none' || !copy) return null;
  const teamId = p.entity.participant_id;
  const lead = cov === 'both' ? mode : cov;
  const fmt = (metricId: string, v: number | null) => formatUnitValue(v, sportUnit(metricId, metrics.get(metricId)));
  const rankText = (s: AdjRawSide) => (s.rank != null ? `#${s.rank} of ${s.of}` : 'not ranked');
  const hasEffect = rows.some((r) => r.scheduleEffect != null);
  return (
    <Stratum title="Team strength: adjusted or raw" sub={copy.sub}>
      {cov === 'both'
        ? <ModeToggle className="team__mode" note={mode === 'adjusted' ? copy.adjNote : copy.rawNote} />
        : <p className="muted small">Only the {cov === 'adjusted' ? 'opponent-adjusted' : 'raw'} footing is published for this team.</p>}
      <div className="tscroll" tabIndex={0} role="region" aria-label="Opponent-adjusted and raw strength">
        <table className="mtab" data-stat-mode={lead}>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="r">{lead === 'adjusted' ? 'Adjusted rank' : 'Raw rank'}</th>
              <th scope="col" className="r">{lead === 'adjusted' ? 'Adjusted' : 'Raw'}</th>
              <th scope="col" className="r">{lead === 'adjusted' ? copy.otherRaw : 'Adjusted'}</th>
              {hasEffect && <th scope="col" className="r">Schedule effect</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = shownSide(r, lead);
              if (!s) return null;
              const u = sportUnit(r.unitMetricId, metrics.get(r.unitMetricId));
              return (
                <tr key={r.key} data-basis={s.basis} data-only={s.only || undefined}>
                  <th scope="row">
                    <Link to={routes.metric(slug, s.data.metricId, { team: teamId })}>{r.label}</Link>
                    {r.priorHeavy && <span className="muted small"> · mostly last season</span>}
                  </th>
                  <td className="r num">{rankText(s.data)}</td>
                  <td className="r"><span className="num">{fmt(r.unitMetricId, s.data.value)}</span> <BasisTag basis={s.basis} fallback={s.only} /></td>
                  <td className="r num muted">
                    {s.other ? <>{fmt(r.unitMetricId, s.other.data.value)}{s.other.data.rank != null && <span className="small"> · #{s.other.data.rank}</span>}</> : <span className="small">not published</span>}
                  </td>
                  {hasEffect && (
                    <td className="r num muted">
                      {r.scheduleEffect == null ? '—' : u.scale === 'fraction' ? `${r.scheduleEffect > 0 ? '+' : ''}${(r.scheduleEffect * 100).toFixed(1)} pts` : `${r.scheduleEffect > 0 ? '+' : ''}${r.scheduleEffect.toFixed(2)}`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasEffect && <p className="muted small">Schedule effect is raw minus adjusted: positive means the raw number was flattered by weaker opponents.</p>}
      {!hasEffect && <p className="muted small">Windows: {[...new Set(rows.flatMap((r) => [r.raw && `raw ${r.raw.window}`, r.adjusted && `adjusted ${r.adjusted.window}`]).filter(Boolean))].join(' · ')}.</p>}
    </Stratum>
  );
}
