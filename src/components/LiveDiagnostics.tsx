// Developer-observable diagnostics for the market clock, on Data & provenance. Nothing here is a
// credential or a header: provider name, timings, counts and the last error message.
import { exactTime } from '../lib/format';
import { formatQuoteAge, quoteAgeMs } from '../live/freshness';
import { liveStore, useLiveVersion, useNow } from '../live/hooks';
import { CADENCE_MS } from '../live/store';
import { liveMode } from './LiveQuote';

export function LiveDiagnostics() {
  useLiveVersion();
  const now = useNow(5_000);
  const s = liveStore();
  const d = s.diagnostics();
  const at = (t: number | null) => (t ? `${exactTime(new Date(t).toISOString())} (${formatQuoteAge(now - t)} ago)` : '—');
  const ages = s.allQuotes().map((q) => quoteAgeMs(q.observedAt, now) ?? 0);
  const rows: [string, string][] = [
    ['Mode', liveMode(d, now)],
    ['Provider', d.providerLabel],
    ['Answered by', d.answeredBy ?? '—'],
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
  return (
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
  );
}
