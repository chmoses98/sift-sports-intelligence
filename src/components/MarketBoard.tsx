// Every market of a scope, grouped the way the handicap packet groups them: a ladder (same series,
// period, side, subject; different line) is one row of rungs; singletons are rows. Prices are YES
// bid/ask in cents; "fair" is the model's P(YES) — evidence, labelled as such, never a pick.
import { describeMarket } from '../lib/marketLabel';
import { isMlbPlayerMarket, isMlbTicker, mlbKind, mlbNick, mlbPeriod, mlbPlayerKey, mlbPlayerName, mlbTeamOf, propFamily, PROP_FAMILY_LABEL } from '../lib/mlb';
import { inningWords, periodCode } from '../lib/period';
import { cfbMarketHeading } from '../lib/cfbMarkets';
import { MarketIcon } from './MarketIcon';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Market, ModelPrice, ResearchMarket } from '../contract/types';
import { cents, familyLabel } from '../lib/format';
import { STAT_LABEL } from '../lib/nfl';
import { routes } from '../lib/routes';

type AnyMarket = (Market | ResearchMarket) & { side?: string | null; extensions?: Record<string, unknown> | null };

export interface MarketGroup {
  key: string;
  title: string;
  family: string;
  period: string | null;
  section: 'lines' | 'periods' | 'players' | 'props';
  subject: string | null;
  rows: AnyMarket[];
  ladder: boolean;
}

const rung = (m: AnyMarket) => (m.threshold != null ? m.threshold : m.line);
/** Availability is shown only when a contract is NOT open, so an open board stays quiet. */
const notOpen = (m: AnyMarket): string | null => {
  const st = (m as { market_status?: string }).market_status;
  return st && st !== 'OPEN' && st !== 'UNKNOWN' ? st : null;
};

export function humanize(desc: string): string {
  return desc
    .replace(/^YES iff /, '')
    .replace(/_/g, ' ')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/\s*\(FULL\)/, '')
    .replace(/\[subject: ([^\]]+)\]/, '· $1');
}

function sectionOf(m: AnyMarket): MarketGroup['section'] {
  if (m.player_id || m.market_family === 'player_stat' || m.market_family === 'first_td_scorer' || m.market_family === 'game_player_leader') return 'players';
  if (isMlbTicker(m.kalshi_ticker)) {
    // Baseball: a prop is grouped by its player (never by team), inning windows (F5 …) and the 1st-inning run are innings.
    if (isMlbPlayerMarket(m)) return 'players';
    if (mlbPeriod(m)) return 'periods';
    return mlbKind(m) === 'unknown' ? 'props' : 'lines';
  }
  if (periodCode(m.period)) return 'periods';
  if (['game_winner', 'spread', 'total', 'team_total'].includes(m.market_family)) return 'lines';
  // CFB names its full-game lines by family (game_moneyline, game_spread, game_total); scoped to CFB tickers so no
  // other sport's board is re-sectioned.
  if (cfbMarketHeading(m) && ['game_moneyline', 'game_spread', 'game_total'].includes(m.market_family)) return 'lines';
  return 'props';
}

/** An MLB group: one ladder per player and stat, or per club and line type, titled in baseball words. */
function mlbGroup(m: AnyMarket, playerName: (id: string | null) => string | null): Pick<MarketGroup, 'key' | 'title' | 'subject'> {
  const series = m.kalshi_ticker.split('-')[0];
  const per = mlbPeriod(m);
  if (isMlbPlayerMarket(m)) {
    const fam = propFamily(m);
    const who = playerName(m.player_id) ?? mlbPlayerName(m);
    return { key: ['mlb-player', m.event_id ?? '', mlbPlayerKey(m), fam ?? series].join('|'), title: PROP_FAMILY_LABEL[fam ?? ''] ?? familyLabel(m.market_family), subject: who };
  }
  const team = mlbTeamOf(m);
  const kind = mlbKind(m);
  const base = { moneyline: 'Moneyline', run_line: 'Run line', total: 'Total runs', team_total: 'Team total', period_result: 'Result', yrfi: 'Run in 1st inning', player: '', unknown: familyLabel(m.market_family) }[kind];
  const words = kind === 'yrfi' ? null : inningWords(per);
  const who = kind === 'team_total' || kind === 'run_line' ? mlbNick(team) : null;
  return { key: ['mlb', m.event_id ?? '', kind, series, per ?? '', kind === 'period_result' || kind === 'moneyline' ? '' : team ?? ''].join('|'), title: [base, words, who].filter(Boolean).join(' · '), subject: null };
}

export function groupMarkets(markets: AnyMarket[], playerName: (id: string | null) => string | null): MarketGroup[] {
  const groups = new Map<string, MarketGroup>();
  for (const m of markets) {
    const series = m.kalshi_ticker.split('-')[0];
    const mlb = isMlbTicker(m.kalshi_ticker) ? mlbGroup(m, playerName) : null;
    const key = mlb?.key ?? [m.event_id ?? '', m.market_family, series, m.period ?? '', m.side ?? '', m.participant_id ?? '', m.player_id ?? ''].join('|');
    let g = groups.get(key);
    if (!g) {
      const stat = (m.extensions?.stat as string | undefined) ?? null;
      const who = mlb ? mlb.subject : m.player_id ? playerName(m.player_id) ?? (m.extensions?.subject as string | undefined) ?? null : null;
      const per = periodCode(m.period) ? ` · ${m.period}` : '';
      const title = mlb ? mlb.title : who && stat ? `${STAT_LABEL[stat] ?? stat.replace(/_/g, ' ')}` : cfbMarketHeading(m) ?? `${familyLabel(m.market_family)}${per}`;
      g = { key, title, family: m.market_family, period: m.period ?? null, section: sectionOf(m), subject: who, rows: [], ladder: false };
      groups.set(key, g);
    }
    g.rows.push(m);
  }
  for (const g of groups.values()) {
    g.ladder = g.rows.length >= 2 && g.rows.every((m) => rung(m) != null);
    if (g.ladder) g.rows.sort((a, b) => Number(rung(a)) - Number(rung(b)) || a.kalshi_ticker.localeCompare(b.kalshi_ticker));
    if (g.ladder && !g.subject && !isMlbTicker(g.rows[0].kalshi_ticker)) {
      const r0 = String(rung(g.rows[0])).replace('.', '\\.');
      const sample = humanize(g.rows[0].yes_description).replace(new RegExp(`${r0}(\\.0)?(?![\\d.])`), 'X');
      g.title = `${g.title} — ${sample.replace(/ ?· [A-Z]+$/, '')}`;
    }
  }
  return [...groups.values()];
}

export function latestPrices(prices: ModelPrice[]): Map<string, ModelPrice> {
  const out = new Map<string, ModelPrice>();
  for (const p of prices) {
    const cur = out.get(p.market_id);
    if (!cur || p.generated_at > cur.generated_at) out.set(p.market_id, p);
  }
  return out;
}

const SECTIONS: { id: MarketGroup['section']; label: string }[] = [
  { id: 'lines', label: 'Game lines' },
  { id: 'periods', label: 'Halves & quarters' },
  { id: 'players', label: 'Player props' },
  { id: 'props', label: 'Specials' },
];
/** Baseball has innings, not halves and quarters. */
const sectionLabel = (id: MarketGroup['section'], groups: MarketGroup[]) =>
  id === 'periods' && groups.some((g) => g.section === 'periods' && isMlbTicker(g.rows[0]?.kalshi_ticker)) ? 'Innings' : SECTIONS.find((s) => s.id === id)!.label;

export function MarketBoard({
  markets, prices, sportSlug, playerName, initialSection, compact,
}: { markets: AnyMarket[]; prices: Map<string, ModelPrice>; sportSlug: string; playerName: (id: string | null) => string | null; initialSection?: MarketGroup['section']; compact?: boolean }) {
  const groups = useMemo(() => groupMarkets(markets, playerName), [markets, playerName]);
  const present = SECTIONS.filter((s) => groups.some((g) => g.section === s.id));
  const [section, setSection] = useState<MarketGroup['section']>(initialSection && present.some((p) => p.id === initialSection) ? initialSection : present[0]?.id ?? 'lines');
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  const shown = groups
    .filter((g) => present.length <= 1 || g.section === section)
    .filter((g) => !f || `${g.title} ${g.subject ?? ''} ${g.rows.map((r) => r.yes_description).join(' ')}`.toLowerCase().includes(f));
  const bySubject = new Map<string, MarketGroup[]>();
  for (const g of shown) {
    const k = g.subject ?? '';
    bySubject.set(k, [...(bySubject.get(k) ?? []), g]);
  }
  return (
    <div className="mboard">
      <div className="mboard__bar">
        {present.length > 1 && (
          <div className="seg" role="tablist" aria-label="Market sections">
            {present.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={section === s.id} className={`seg__b${section === s.id ? ' is-on' : ''}`} onClick={() => setSection(s.id)}>
                {sectionLabel(s.id, groups)} <span className="seg__n">{groups.filter((g) => g.section === s.id).reduce((a, g) => a + g.rows.length, 0)}</span>
              </button>
            ))}
          </div>
        )}
        {!compact && (
          <input className="mboard__filter" type="search" placeholder="Filter markets (player, stat, team…)" aria-label="Filter markets" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
      </div>
      <p className="mboard__key">YES bid / ask in cents · <span className="fairkey">◆ fair</span> = model P(YES), research evidence only · tap any price for the full contract</p>
      {[...bySubject.entries()].map(([subject, gs]) => (
        <div key={subject || 'all'} className="mboard__subject">
          {subject && <h4 className="mboard__who">{subject}</h4>}
          {gs.map((g) => (
            <div key={g.key} className="mgroup">
              <div className="mgroup__title">{g.rows[0] && <MarketIcon m={g.rows[0]} />}{g.title}</div>
              {g.ladder ? (
                <ol className="ladderrow">
                  {g.rows.map((m) => {
                    const mp = prices.get(m.market_id);
                    const st = notOpen(m);
                    return (
                      <li key={m.market_id}>
                        <Link to={routes.market(sportSlug, m.market_id, m.event_id ?? '')} className={`rungcell${st ? ' is-notopen' : ''}`} aria-label={`${describeMarket(m, { playerName }).title}: ${st ? `${st}, ` : ''}bid ${cents(m.yes_bid)}, ask ${cents(m.yes_ask)}${mp?.fair_probability != null ? `, model fair ${cents(mp.fair_probability)}` : ''}`}>
                          <span className="rungcell__x num">{rung(m)}</span>
                          {st && <span className="rungcell__st">{st}</span>}
                          <span className="rungcell__p num">{cents(m.yes_bid)}<span className="rungcell__sl">/</span>{cents(m.yes_ask)}</span>
                          {mp?.fair_probability != null && <span className="rungcell__f num">◆ {cents(mp.fair_probability)}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ul className="mrows">
                  {g.rows.map((m) => {
                    const mp = prices.get(m.market_id);
                    const st = notOpen(m);
                    return (
                      <li key={m.market_id}>
                        <Link to={routes.market(sportSlug, m.market_id, m.event_id ?? '')} className={`mrow${st ? ' is-notopen' : ''}`}>
                          <span className="mrow__d">{describeMarket(m, { playerName }).title}{st && <span className="rungcell__st"> {st}</span>}</span>
                          <span className="mrow__p num">{cents(m.yes_bid)} / {cents(m.yes_ask)}</span>
                          <span className="mrow__f num">{mp?.fair_probability != null ? `◆ ${cents(mp.fair_probability)}` : ''}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
      {!shown.length && <p className="muted">No markets match.</p>}
    </div>
  );
}
