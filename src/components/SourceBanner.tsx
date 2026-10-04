import { useState } from 'react';
import { Link } from 'react-router';
import type { HealthDoc } from '../contract/types';
import type { SportSource } from '../data/source';
import { exactTime } from '../lib/format';
import { routes } from '../lib/routes';
import { FreshnessChip } from './ui';
import { LiveStatusChip } from './LiveQuote';
import { useNow } from '../live/hooks';

const HEALTH_GLYPH: Record<string, string> = { HEALTHY: '●', RESEARCH_ONLY: '◐', DEGRADED: '◐', STALE: '○', UNAVAILABLE: '○' };

export function HealthPill({ status }: { status: string | null | undefined }) {
  const s = status ?? 'UNKNOWN';
  return (
    <span className={`hpill hpill--${s.toLowerCase()}`}>
      <span aria-hidden="true">{HEALTH_GLYPH[s] ?? '◌'}</span>
      {s.replace('_', ' ')}
    </span>
  );
}

/** Says, on every sport screen, where the numbers come from and how current the live publication is. */
export function SourceBanner({ source, shown }: { source: SportSource; shown: HealthDoc | null }) {
  const [more, setMore] = useState(false);
  const now = useNow(15_000);
  const live = source.liveHealth;
  // Freshness describes the data on screen: the snapshot's own health in snapshot mode.
  const h = shown ?? live;
  const moved = source.mode === 'snapshot' && live && h && live.payload_run_id !== h.payload_run_id;
  return (
    <div className={`srcbar srcbar--${source.mode}`}>
      <div className="srcbar__in">
        <span className="srcbar__mode">
          {source.mode === 'live' ? 'LIVE' : source.mode === 'snapshot' ? 'RESEARCH SNAPSHOT' : source.mode.toUpperCase()}
        </span>
        <span className="srcbar__txt">
          {source.sport.label} {h ? <HealthPill status={h.overall_status} /> : <span className="hpill hpill--unknown">live unreadable</span>}
          {h && <FreshnessChip asOf={h.last_market_capture} component="market_data" thresholds={h.thresholds?.market_data} label="market capture" />}
          {h && <FreshnessChip asOf={h.last_model_generated} component="model" thresholds={h.thresholds?.model} label="model" />}
          <LiveStatusChip now={now} />
        </span>
        {moved && <span className="srcbar__moved">Live has a newer run</span>}
        <button type="button" className="linklike srcbar__more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Less' : 'Source'}
        </button>
      </div>
      {more && (
        <div className="srcbar__detail">
          <p>{source.reason}</p>
          {source.mode === 'snapshot' && source.snapshot && (
            <>
              <p>
                Research graph built from production run <code>{source.snapshot.run_id}</code> (v1 published {exactTime(source.snapshot.v1_generated_at)}),
                with the sport repository's own exporter. {source.snapshot.note}
              </p>
              <p className="muted">Upstream issue: {source.snapshot.reason}</p>
            </>
          )}
          {live && (
            <p className="muted">
              Live publication: {live.overall_status}, run <code>{live.payload_run_id}</code>, exported {exactTime(live.last_export_attempt)}, markets captured{' '}
              {exactTime(live.last_market_capture)}; bet authority {live.bet_authority ?? 'none'}.
            </p>
          )}
          <Link to={routes.status()}>All sports, health and capabilities →</Link>
        </div>
      )}
    </div>
  );
}
