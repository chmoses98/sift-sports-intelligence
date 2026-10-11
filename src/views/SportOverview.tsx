// A sport that publishes data Sift does not explore yet (or publishes no explorer): its real live health
// and capability manifest, nothing more. No placeholder explorer is built for it.
import type { SportConfig } from '../data/sports';
import { HealthPill } from '../components/SourceBanner';
import { FreshnessChip, Notice, QualityBadge, Skeleton, Stratum } from '../components/ui';
import { exactTime } from '../lib/format';
import { availabilitySentence, capabilityLabel } from '../lib/plainLabels';
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
            <td>{capabilityLabel(c.capability)}</td>
            <td><QualityBadge status={c.status} /></td>
            <td className="small">{availabilitySentence(c.capability, c.status).replace(/^[^:]+: /, '').replace(/^\w/, (x) => x.toUpperCase())}{c.summary ? <span className="muted"> {c.summary}</span> : null}{c.limitations[0] ? <span className="muted"> — {c.limitations[0]}</span> : null}</td>
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
        {sport.label} publishes {s?.liveExplorer ? 'research files' : 'its game board'}, but Sift has no screens for it yet. Until it does, this page shows the publication's real health and which kinds of data it provides — never placeholder research.
      </Notice>
      {all.loading && <Skeleton lines={6} />}
      {h && (
        <Stratum title="Live health" sub={`Last published ${exactTime(h.last_export_attempt)}`}>
          <ul className="healthlist">
            {Object.entries(h.components ?? {}).map(([k, c]) => (
              <li key={k}><span className="healthlist__k">{k.replace(/_/g, ' ')}</span><HealthPill status={c.status} /><FreshnessChip asOf={c.as_of} component={k} thresholds={h.thresholds?.[k]} /></li>
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
