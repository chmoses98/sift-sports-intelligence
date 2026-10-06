import { Link } from 'react-router';
import type { SearchEntry } from '../contract/types';
import type { SportConfig } from '../data/sports';
import { cents, familyLabel, ordinal } from '../lib/format';
import { routes } from '../lib/routes';
import { describeMarket } from '../lib/marketLabel';
import type { SearchState } from '../search/useSearch';

export function hrefForEntry(sport: SportConfig, e: SearchEntry): string | null {
  switch (e.kind) {
    case 'TEAM':
      return routes.team(sport.slug, e.id);
    case 'PLAYER':
      return routes.player(sport.slug, e.id);
    case 'EVENT':
      return routes.game(sport.slug, e.id);
    case 'METRIC':
      return routes.metric(sport.slug, e.id);
    case 'RANKING':
      return routes.ranking(sport.slug, e.id);
    default:
      return null;
  }
}

const KIND_WORD: Record<string, string> = { TEAM: 'Team', PLAYER: 'Player', EVENT: 'Game', METRIC: 'Metric', RANKING: 'Ranking', SERIES: 'Trend' };

function contextLine(sport: SportConfig, e: SearchEntry, metricEntity?: string | null): string {
  const parts: string[] = [KIND_WORD[e.kind] ?? e.kind];
  if (e.kind === 'PLAYER') {
    if (e.context?.team) parts.push(e.context.team);
    if (e.context?.position) parts.push(e.context.position);
  } else if (e.kind === 'EVENT') {
    parts.push(e.secondary ?? sport.label);
  } else if (e.kind === 'METRIC') {
    parts.push(`${sport.label} ${metricEntity === 'PLAYER' ? 'player' : 'team'} ${e.secondary ?? ''}`.trim());
  } else if (e.kind === 'RANKING') {
    parts.push(e.secondary ?? sport.label);
  } else {
    parts.push(sport.label);
  }
  return parts.join(' • ');
}

export function SearchResults({ state, query, onPick, compact }: { state: SearchState; query: string; onPick?: () => void; compact?: boolean }) {
  if (!query.trim()) return null;
  if (!state.ready) return <p className="search__msg">Loading the research index…</p>;
  const { intent, markets, hits } = state;
  const prof = intent?.profile;
  const metricRow = (m: SearchEntry) => {
    const obs = prof?.metrics.find((o) => o.metric_id === m.id && !o.split);
    const href = routes.metric(intent!.sport.slug, m.id, { team: intent!.subject.kind === 'TEAM' ? intent!.subject.id : null });
    return (
      <li key={'im' + m.id}>
        <Link className="sres sres--intent" to={intent!.subject.kind === 'PLAYER' ? routes.player(intent!.sport.slug, intent!.subject.id) : href} onClick={onPick}>
          <span className="sres__label">
            {intent!.subject.label} <span className="sres__amp">·</span> {m.label}
          </span>
          <span className="sres__ctx">
            Metric • {intent!.sport.label}
            {obs?.context?.rank != null && obs.context.universe_size != null && (
              <b className="sres__rank"> • {ordinal(obs.context.rank)} of {obs.context.universe_size}</b>
            )}
          </span>
        </Link>
      </li>
    );
  };
  const top = hits.slice(0, compact ? 8 : 40);
  const nothing = !top.length && !(intent?.metrics.length) && !markets.length;
  return (
    <div className="search__results" role="region" aria-label="Search results">
      {intent && (intent.metrics.length > 0 || markets.length > 0) && (
        <div className="search__group">
          <div className="search__gh">{intent.subject.label}: {intent.rest.join(' ')}</div>
          <ul>
            {intent.metrics.slice(0, compact ? 3 : 8).map(metricRow)}
            {markets.slice(0, compact ? 4 : 12).map((h) => (
              <li key={h.market.market_id}>
                <Link className="sres sres--market" to={routes.market(h.sport.slug, h.market.market_id, h.market.event_id ?? '')} onClick={onPick}>
                  <span className="sres__label">{describeMarket(h.market as never).title}</span>
                  <span className="sres__ctx">
                    Market • {familyLabel(h.market.market_family)} • <span className="num">{cents(h.market.yes_bid)} / {cents(h.market.yes_ask)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {top.length > 0 && (
        <div className="search__group">
          {intent && <div className="search__gh">Everything matching “{query.trim()}”</div>}
          <ul>
            {top.map((h) => {
              const href = hrefForEntry(h.sport, h.entry);
              if (!href) return null;
              return (
                <li key={h.sport.code + h.entry.id}>
                  <Link className={`sres sres--${h.entry.kind.toLowerCase()}${h.full ? '' : ' sres--partial'}`} to={href} onClick={onPick}>
                    <span className="sres__label">{h.entry.label}</span>
                    <span className="sres__ctx">{contextLine(h.sport, h.entry, h.metricEntity)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {nothing && <p className="search__msg">Nothing published matches “{query.trim()}”.</p>}
    </div>
  );
}
