import { useState } from 'react';
import { Link } from 'react-router';
import { getJson } from '../data/fetcher';
import { useAsync } from '../data/hooks';
import { getSourcePreference, setSourcePreference, type SourcePreference } from '../data/source';
import { clearAsyncMemo } from '../data/hooks';
import { HealthPill } from '../components/SourceBanner';
import { FreshnessChip, Skeleton, Stratum } from '../components/ui';
import { exactTime } from '../lib/format';
import { routes } from '../lib/routes';
import { ROUTER_HEALTH_URL, useAllSports } from '../state/allSports';
import { useVisit } from '../state/trail';
import { CapabilityTable } from './SportOverview';
import { LiveDiagnostics } from '../components/LiveDiagnostics';
import { allPlayerImages } from '../lib/players';
import { allVenuePhotos } from '../lib/venues';

interface RouterHealth { overall_status: string; generated_at: string; last_poll_at: string; errors: string[]; warnings: string[]; delivered: number; failed: number; thresholds: Record<string, { fresh_after_seconds: number; stale_after_seconds: number }> }

export function StatusView() {
  useVisit('Data & provenance', 'status');
  const all = useAllSports();
  const router = useAsync('routerHealth', () => getJson<RouterHealth>(ROUTER_HEALTH_URL));
  const [pref, setPref] = useState<SourcePreference>(getSourcePreference());
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page status">
      <header className="pagehead">
        <div className="eyebrow">Data & provenance</div>
        <h1 className="h-display">Where every number comes from</h1>
        <p className="lede">
          Sift is a static app. Your browser reads each sport's published <code>edge_finder.app.v1</code> files straight from GitHub
          (registry: <code>kalshi-bet-router</code>), lazily, one document at a time. Health and freshness below are recomputed now with each publication's own thresholds.
        </p>
      </header>
      <Stratum title="Sports">
        {all.loading && <Skeleton lines={7} />}
        <table className="dtable statustable">
          <thead><tr><th>Sport</th><th>Live health</th><th>Markets</th><th>Model</th><th>Run</th><th>Explorer</th><th>Capabilities</th></tr></thead>
          <tbody>
            {(all.data ?? []).map((s) => {
              const h = s.source?.liveHealth;
              return (
                <tr key={s.sport.code}>
                  <th scope="row"><Link to={routes.sport(s.sport.slug)}>{s.sport.label}</Link></th>
                  <td><HealthPill status={h?.overall_status} /></td>
                  <td>{h ? <FreshnessChip asOf={h.last_market_capture} component="market_data" thresholds={h.thresholds?.market_data} /> : '—'}</td>
                  <td>{h ? <FreshnessChip asOf={h.last_model_generated} component="model" thresholds={h.thresholds?.model} /> : '—'}</td>
                  <td><code className="small">{h?.payload_run_id ?? '—'}</code></td>
                  <td>{s.liveExplorer ? 'live' : s.source?.mode === 'snapshot' ? 'snapshot (live missing)' : 'none'}</td>
                  <td>
                    {s.caps ? (
                      <button type="button" className="linklike" aria-expanded={open === s.sport.code} onClick={() => setOpen(open === s.sport.code ? null : s.sport.code)}>
                        {s.counts.VERIFIED ?? 0}V · {s.counts.PARTIAL ?? 0}P · {s.counts.RESEARCH ?? 0}R · {s.counts.UNAVAILABLE ?? 0}U
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {open && all.data?.find((s) => s.sport.code === open)?.caps && <CapabilityTable items={all.data.find((s) => s.sport.code === open)!.caps!.items} />}
      </Stratum>
      <Stratum title="Live market quotes" sub="The market clock: current Kalshi quotes on their own refresh schedule, separate from the research publication. Fresh < 15 min, aging to 30 min, stale after.">
        <LiveDiagnostics />
      </Stratum>
      <Stratum title="Kalshi bet router" sub="Wager delivery health (not research data).">
        {router.data ? (
          <div>
            <HealthPill status={router.data.overall_status} /> <FreshnessChip asOf={router.data.last_poll_at} component="router" thresholds={router.data.thresholds?.router} label="last poll" />
            <p className="muted small">Generated {exactTime(router.data.generated_at)} · {router.data.delivered} delivered · {router.data.failed} failed · {router.data.errors.length} errors, {router.data.warnings.length} warnings.</p>
          </div>
        ) : router.loading ? <Skeleton lines={2} /> : <p className="muted">router_health.json could not be read.</p>}
      </Stratum>
      <Stratum id="photo-credits" title="Stadium photo credits" sub="Hand-picked photographs (free licences, Wikimedia Commons), colour graded for the hero, fetched once and served with the app — never fetched at runtime. Venues without an approved photograph use Sift's designed stadium artwork.">
        <table className="dtable">
          <thead><tr><th scope="col">Venue</th><th scope="col">Photo</th><th scope="col">Licence</th><th scope="col">Changes</th></tr></thead>
          <tbody>
            {allVenuePhotos().map(({ venue, photo }) => (
              <tr key={venue.slug}>
                <th scope="row">{venue.name}<span className="muted small"> · {venue.city}</span></th>
                <td className="small">{photo.credit.source ? <a href={photo.credit.source} target="_blank" rel="noreferrer">{photo.credit.artist}</a> : photo.credit.artist}</td>
                <td className="small">{photo.credit.licenseUrl ? <a href={photo.credit.licenseUrl} target="_blank" rel="noreferrer">{photo.credit.license}</a> : photo.credit.license}</td>
                <td className="small">{photo.credit.modifications ?? 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Stratum>
      <Stratum id="player-credits" title="Player image credits" sub="REVIEW ASSETS for the Game Script cards: free-licence Wikimedia Commons photographs, darkened and cropped by Sift, until a licensed player-image source is chosen.">
        <table className="dtable">
          <thead><tr><th scope="col">Player</th><th scope="col">Photo</th><th scope="col">Licence</th><th scope="col">Changes</th></tr></thead>
          <tbody>
            {allPlayerImages().map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}<span className="muted small"> · {p.team}</span></th>
                <td className="small"><a href={p.source} target="_blank" rel="noreferrer">{p.artist}</a></td>
                <td className="small">{p.license_url ? <a href={p.license_url} target="_blank" rel="noreferrer">{p.license}</a> : p.license}</td>
                <td className="small">{p.modifications ?? 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Stratum>
      <Stratum title="Source preference" sub="Sift reads live roots first and falls back to a bundled same-run snapshot only where a live explorer is missing.">
        <div className="seg" role="radiogroup" aria-label="Data source">
          {(['auto', 'snapshot'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={pref === p} className={`seg__b${pref === p ? ' is-on' : ''}`}
              onClick={() => { setSourcePreference(p); clearAsyncMemo(); setPref(p); window.location.reload(); }}>
              {p === 'auto' ? 'Live first (recommended)' : 'Bundled NFL snapshot'}
            </button>
          ))}
        </div>
      </Stratum>
    </div>
  );
}
