// Developer-observable diagnostics for the market clock, on Data & provenance. Nothing here is a
// credential or a header: provider name, timings, counts and the last error message.
import { exactTime } from '../lib/format';
import { formatQuoteAge, quoteAgeMs } from '../live/freshness';
import { liveStore, useLiveVersion, useNow } from '../live/hooks';
import { CADENCE_MS } from '../live/store';
import { liveMode } from './LiveQuote';
import '../styles/lane-f-data.css';

export function LiveDiagnostics() {
  useLiveVersion();
  const now = useNow(5_000);
  const s = liveStore();
  const d = s.diagnostics();
  const at = (t: number | null) => (t ? `${exactTime(new Date(t).toISOString())} (${formatQuoteAge(now - t)} ago)` : '—');
  const reason = (f: typeof d.fallback) => (f ? `${f.provider} ${f.status ? `HTTP ${f.status}` : 'failed'} (${f.error}) at ${at(f.at)}` : '—');
  const mode = liveMode(d, now);
  const ages = s.allQuotes().map((q) => quoteAgeMs(q.observedAt, now) ?? 0);
  const rows: [string, string][] = [
    ['Mode', mode],
    ['Quote provider', d.providerLabel],
    ['Quotes answered by', d.answeredBy ?? '—'],
    ['Quote fallback reason', reason(d.fallback)],
    ['Inventory provider', d.inventoryProviderLabel],
    ['Inventory answered by', d.inventoryAnsweredBy ?? '—'],
    ['Inventory fallback reason', reason(d.inventoryFallback)],
    ['Online / visible', `${d.online ? 'online' : 'offline'} / ${d.visible ? 'visible' : 'hidden'}`],
    ['Last request', at(d.lastRequestAt)],
    ['Last successful refresh', at(d.lastSuccessAt)],
    ['Last error', d.lastError ? `${d.lastError} at ${at(d.lastErrorAt)}` : '—'],
    ['Provider latency', d.lastLatencyMs != null ? `${d.lastLatencyMs} ms` : '—'],
    ['Backoff', d.backoffUntil ? `${d.backoffReason} — retry in ${formatQuoteAge(d.backoffUntil - now)} (${d.consecutiveFailures} failures)` : 'none'],
    ['Requests (HTTP)', String(d.requests)],
    ['Batches', String(d.batches)],
    ['Tickers requested / refreshed / failed / missing', `${d.tickersRequested} / ${d.tickersRefreshed} / ${d.tickersFailed} / ${d.tickersMissing}`],
    ['On screen now', `${d.activeScopes} scopes · ${d.trackedTickers} tickers · ${d.trackedEvents} events`],
    ['Quotes held', `${ages.length}${ages.length ? ` · oldest ${formatQuoteAge(Math.max(...ages))}` : ''}`],
    ['Cadence (s)', `detail ${CADENCE_MS.detail / 1000} · game ${CADENCE_MS.game / 1000} · slate ${CADENCE_MS.slate / 1000} · inventory ${CADENCE_MS.background / 1000}`],
  ];
  // One plain sentence first; the table below is the technical detail.
  const source = mode === 'LIVE' ? 'the live price relay (15–60 seconds)' : mode === 'FEED' ? 'the quote feed (published every 3 minutes, typically 3–8 minutes old)' : mode === 'OFF' ? 'the publications only (no live price source is configured)' : mode === 'OFFLINE' ? 'nowhere right now: you are offline' : 'a source that is reconnecting';
  const last = d.lastSuccessAt ? `; last refreshed ${formatQuoteAge(now - d.lastSuccessAt)} ago` : '; no refresh yet in this session';
  return (
    <>
    <p className="livediag__sum">Prices are coming from {source}{last}{d.lastError ? `. Last problem: ${d.lastError}` : ''}. Each price always shows its own age.</p>
    <table className="dtable livediag" aria-label="Live market quote diagnostics">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td data-diag={k}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}
