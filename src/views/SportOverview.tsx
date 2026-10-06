// A sport that publishes data Sift does not explore yet (or publishes no explorer): its real live health
// and capability manifest, nothing more. No placeholder explorer is built for it.
import type { SportConfig } from '../data/sports';
import { HealthPill } from '../components/SourceBanner';
import { FreshnessChip, Notice, QualityBadge, Skeleton, Stratum } from '../components/ui';
import { exactTime } from '../lib/format';
import { useAllSports } from '../state/allSports';
import { useVisit } from '../state/trail';

export function CapabilityTable({ items }: { items: { capability: string; status: string; summary: string | null; limitations: string[] }[] }) {
  const order = ['VERIFIED', 'PARTIAL', 'RESEARCH', 'UNAVAILABLE', 'UNKNOWN'];
  return (
    <table className="dtable captable">
      <thead><tr><th>Capability</th><th>Status</th><th>What the sport says</th></tr></thead>
      <tbody>
        {[...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.capability.localeCompare(b.capability)).map((c) => (
          <tr key={c.capability}>
            <td>{c.capability.replace(/_/g, ' ')}</td>
            <td><QualityBadge status={c.status} /></td>
            <td className="small">{c.summary ?? ''}{c.limitations[0] ? <span className="muted"> — {c.limitations[0]}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SportOverview({ sport }: { sport: SportConfig }) {
  const all = useAllSports();
  useVisit(sport.label, 'sport');
  const s = all.data?.find((x) => x.sport.code === sport.code);
  const h = s?.source?.liveHealth;
  return (
    <div className="page">
      <header className="pagehead">
        <div className="eyebrow">{sport.fullName}</div>
        <h1 className="h-display">{sport.label}</h1>
        {h && (
          <div className="pagehead__stats">
            <HealthPill status={h.overall_status} />
            <FreshnessChip asOf={h.last_market_capture} component="market_data" thresholds={h.thresholds?.market_data} label="markets" />
            <FreshnessChip asOf={h.last_model_generated} component="model" thresholds={h.thresholds?.model} label="model" />
            <span className="chip">run {h.payload_run_id}</span>
          </div>
        )}
      </header>
      <Notice title={`${sport.label} is not explorable in Sift yet`}>
        This first Sift release builds the NFL vertical slice (and an MLB beta). {sport.label} publishes {s?.liveExplorer ? 'a research explorer' : 'its v1 board'} that a later Sift release will open; until then Sift shows only its real health and capability manifest, never a placeholder explorer.
      </Notice>
      {all.loading && <Skeleton lines={6} />}
      {h && (
        <Stratum title="Live health" sub={`${sport.repo}@${sport.branch} · exported ${exactTime(h.last_export_attempt)}`}>
          <ul className="healthlist">
            {Object.entries(h.components ?? {}).map(([k, c]) => (
              <li key={k}><span className="healthlist__k">{k.replace(/_/g, ' ')}</span><span className={`hpill hpill--${c.status.toLowerCase()}`}>{c.status.replace(/_/g, " ").toLowerCase()}</span><FreshnessChip asOf={c.as_of} component={k} thresholds={h.thresholds?.[k]} /></li>
            ))}
          </ul>
          {h.errors.length > 0 && <ul className="lims">{h.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Stratum>
      )}
      {s?.caps && (
        <Stratum title="Research capabilities" sub={`Audit ${s.caps.audit_date ?? ''}: every capability answered.`}>
          <CapabilityTable items={s.caps.items} />
        </Stratum>
      )}
    </div>
  );
}
