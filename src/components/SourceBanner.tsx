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
 * Where the numbers come from. Normal screens show only a quiet "Source" control at the foot; the research
 * mode, model age, price-feed state, newer-run notice, health and freshness are one tap away under it (and
 * on Data & provenance / Status). Screen readers get the same state as the control's description, and
 * data-live-mode carries the market-clock mode (data-live-inventory: who answered the last inventory sweep) for
 * diagnostics and tests.
 */
export function SourceBanner({ source, shown }: { source: SportSource; shown: HealthDoc | null }) {
  const [more, setMore] = useState(false);
  const now = useNow(15_000);
  useLiveVersion();
  const diag = liveStore().diagnostics();
  const mode = liveMode(diag, now);
  const live = source.liveHealth;
  // Freshness describes the data on screen: the snapshot's own health in snapshot mode.
  const h = shown ?? live;
  const moved = source.mode === 'snapshot' && live && h && live.payload_run_id !== h.payload_run_id;
  const modeText = source.mode === 'live' ? 'Live research' : source.mode === 'snapshot' ? 'Research snapshot' : 'Research unavailable';
  // Screen readers get the whole state without anyone having to open the panel; sighted users see one quiet
  // "Source" control. Worded differently from the visible line so it is never a duplicate on screen.
  const srText = `Data source: ${source.mode === 'live' ? 'the live publication' : source.mode === 'snapshot' ? 'a snapshot of the published research' : 'no research could be read'}${h?.last_model_generated ? `, model run ${ago(h.last_model_generated, now)}` : ''}; ${LIVE_WORD[mode].toLowerCase()}${moved ? '; the live publication has a newer run' : ''}.`;
  return (
    <div className={`srcbar srcbar--${source.mode}${more ? ' is-open' : ''}`}>
      <div className="srcbar__in">
        <span className="sr-only" id={`srcbar-${source.sport.code}`} data-live-mode={mode} data-live-inventory={diag.inventoryAnsweredBy ?? ''}>{srText}</span>
        <button type="button" className="srcbar__more" aria-expanded={more} aria-describedby={`srcbar-${source.sport.code}`} onClick={() => setMore((m) => !m)}>
          <i aria-hidden="true" className={`srcbar__dot srcbar__dot--${mode.toLowerCase()}`} />
          {more ? 'Less' : 'Source'}
        </button>
      </div>
      {more && (
        <div className="srcbar__detail">
          <p className="srcbar__line">
            <span className="srcbar__mode">{modeText} · {source.sport.label}</span>
            {h?.last_model_generated && <span>Model run {ago(h.last_model_generated, now)}</span>}
            <span className="srcbar__live">{LIVE_WORD[mode]}</span>
            {moved && <span className="srcbar__moved">Live has a newer run</span>}
          </p>
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
