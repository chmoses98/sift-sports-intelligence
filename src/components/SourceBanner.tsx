import { useState } from 'react';
import { Link } from 'react-router';
import type { HealthDoc } from '../contract/types';
import type { SportSource } from '../data/source';
import { ago, exactTime } from '../lib/format';
import { routes } from '../lib/routes';
import { FreshnessChip } from './ui';
import { liveMode, LiveStatusChip, type LiveMode } from './LiveQuote';
import { liveStore, useLiveVersion, useNow } from '../live/hooks';

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

const LIVE_WORD: Record<LiveMode, string> = {
  LIVE: 'Live prices', FEED: 'Prices via quote feed', CONNECTING: 'Connecting to prices', BACKOFF: 'Prices reconnecting', OFFLINE: 'Offline', OFF: 'Published prices',
};

/**
 * Where the numbers come from, as one quiet line at the foot of every sport screen. The explicit health,
 * freshness and provider states (and the newer-run notice) are one tap away under "Source" and on
 * Data & provenance; data-live-mode carries the market-clock mode for diagnostics and tests.
 */
export function SourceBanner({ source, shown }: { source: SportSource; shown: HealthDoc | null }) {
  const [more, setMore] = useState(false);
  const now = useNow(15_000);
  useLiveVersion();
  const mode = liveMode(liveStore().diagnostics(), now);
  const live = source.liveHealth;
  // Freshness describes the data on screen: the snapshot's own health in snapshot mode.
  const h = shown ?? live;
  const moved = source.mode === 'snapshot' && live && h && live.payload_run_id !== h.payload_run_id;
  return (
    <div className={`srcbar srcbar--${source.mode}`}>
      <div className="srcbar__in">
        <span className="srcbar__mode">
          {source.mode === 'live' ? 'Live research' : source.mode === 'snapshot' ? 'Research snapshot' : 'Research unavailable'} · {source.sport.label}
        </span>
        {h?.last_model_generated && <span className="srcbar__txt">Model run {ago(h.last_model_generated, now)}</span>}
        <span className="srcbar__live" data-live-mode={mode}><i aria-hidden="true" />{LIVE_WORD[mode]}</span>
        {moved && <span className="srcbar__moved">Live has a newer run</span>}
        <button type="button" className="linklike srcbar__more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Less' : 'Source'}
        </button>
      </div>
      {more && (
        <div className="srcbar__detail">
          <div className="srcbar__chips">
            {h ? <HealthPill status={h.overall_status} /> : <span className="hpill hpill--unknown">health not readable</span>}
            {h && <FreshnessChip asOf={h.last_market_capture} component="market_data" thresholds={h.thresholds?.market_data} label="market capture" />}
            {h && <FreshnessChip asOf={h.last_model_generated} component="model" thresholds={h.thresholds?.model} label="model" />}
            <LiveStatusChip now={now} />
          </div>
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
