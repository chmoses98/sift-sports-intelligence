// Every market of a scope, grouped the way the handicap packet groups them: a ladder (same series,
// period, side, subject; different line) is one row of rungs; singletons are rows. Prices are YES
// bid/ask in cents; "fair" is the model's P(YES) — evidence, labelled as such, never a pick.
import { describeMarket } from '../lib/marketLabel';
import { isMlbPlayerMarket, isMlbTicker, mlbKind, mlbNick, mlbPeriod, mlbPlayerKey, mlbPlayerName, mlbTeamOf, propFamily, PROP_FAMILY_LABEL } from '../lib/mlb';
import { inningWords, periodCode, periodWords } from '../lib/period';
import { betPhrase, plainClubTitle } from '../lib/betWords';
import '../styles/lane-d-markets.css';
import { cfbMarketHeading } from '../lib/cfbMarkets';
import { MarketIcon } from './MarketIcon';
import { useMemo, useState } from 'react';
import { Link } from '../routing';
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
      const sample = plainClubTitle(humanize(g.rows[0].yes_description)).replace(new RegExp(`${r0}(\\.0)?(?![\\d.])`), 'X');
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

/** The narrower family a group belongs to inside its section, for the second row of chips ("Receiving yards", "Spread"). */
export function kindOf(g: MarketGroup): string {
  if (g.section === 'players') return g.title.replace(/ — .*$/, '');
  if (g.section === 'periods') return g.period && !isMlbTicker(g.rows[0]?.kalshi_ticker) ? periodWords(g.period) || g.period : g.title.replace(/ — .*$/, '').replace(/ · .*$/, '');
  return g.title.replace(/ — .*$/, '').replace(/ · .*$/, '');
}

export interface BoardFilter { section: MarketGroup['section']; kind: string | null; q: string }

/**
 * The groups a filter shows. A search spans every section (a viewer searching a player should not have to guess the
 * tab first); otherwise the chosen section, narrowed to one kind when a kind chip is on.
 */
export function filterGroups(groups: MarketGroup[], f: BoardFilter, multiSection: boolean): MarketGroup[] {
  const q = f.q.trim().toLowerCase();
  if (q) return groups.filter((g) => `${g.title} ${g.subject ?? ''} ${g.rows.map((r) => `${r.yes_description} ${r.kalshi_ticker}`).join(' ')}`.toLowerCase().includes(q));
  return groups.filter((g) => (!multiSection || g.section === f.section) && (!f.kind || kindOf(g) === f.kind));
}

const contracts = (gs: MarketGroup[]) => gs.reduce((a, g) => a + g.rows.length, 0);

/** YES and NO in conventional words beside the exact YES bid / ask: "Bears to win 48¢ · Bears not to win 54¢". */
function YesNo({ m, title }: { m: AnyMarket; title: string }) {
  const yes = m.yes_ask != null && m.yes_ask > 0 && m.yes_ask < 1 ? m.yes_ask : null;
  const noAsk = (m as { no_ask?: number | null }).no_ask;
  const no = noAsk != null && noAsk > 0 && noAsk < 1 ? noAsk : null;
  if (yes == null && no == null) return null;
  const nw = betPhrase('NO', title);
  return (
    <span className="mrow__yn" aria-label={`Yes ${cents(yes)}, no ${cents(no)}`}>
      <span className="mrow__y" title={`YES: ${title}`}><small>Yes</small>{cents(yes)}</span>
      <span className="mrow__n" title={nw.rewritten ? `NO: ${nw.text}` : `NO on ${title}`}><small>No</small>{cents(no)}</span>
    </span>
  );
}

export function MarketBoard({
  markets, prices, sportSlug, playerName, initialSection, compact,
}: { markets: AnyMarket[]; prices: Map<string, ModelPrice>; sportSlug: string; playerName: (id: string | null) => string | null; initialSection?: MarketGroup['section']; compact?: boolean }) {
  const groups = useMemo(() => groupMarkets(markets, playerName), [markets, playerName]);
  const present = SECTIONS.filter((s) => groups.some((g) => g.section === s.id));
  const [section, setSectionState] = useState<MarketGroup['section']>(initialSection && present.some((p) => p.id === initialSection) ? initialSection : present[0]?.id ?? 'lines');
  const [kind, setKind] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const setSection = (s: MarketGroup['section']) => { setSectionState(s); setKind(null); };
  const multi = present.length > 1;
  const inSection = groups.filter((g) => !multi || g.section === section);
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of inSection) m.set(kindOf(g), (m.get(kindOf(g)) ?? 0) + g.rows.length);
    return [...m.entries()];
  }, [inSection]);
  const searching = filter.trim().length > 0;
  const shown = filterGroups(groups, { section, kind, q: filter }, multi);
  // Searching spans every section: say which section each match sits in.
  const blocks = searching && multi
    ? present.map((s) => ({ id: s.id, label: sectionLabel(s.id, groups), gs: shown.filter((g) => g.section === s.id) })).filter((b) => b.gs.length)
    : [{ id: section, label: null as string | null, gs: shown }];
  return (
    <div className="mboard">
      <div className="mboard__bar">
        {multi && (
          <div className="seg" role="tablist" aria-label="Market sections">
            {present.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={!searching && section === s.id} className={`seg__b${!searching && section === s.id ? ' is-on' : ''}`} onClick={() => { setSection(s.id); setFilter(''); }}>
                {sectionLabel(s.id, groups)} <span className="seg__n">{contracts(groups.filter((g) => g.section === s.id))}</span>
              </button>
            ))}
          </div>
        )}
        {!compact && (
          <input className="mboard__filter" type="search" placeholder="Search every market (player, stat, team…)" aria-label="Filter markets" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
      </div>
      {!searching && kinds.length > 1 && (
        <div className="mboard__kinds" role="group" aria-label="Market type">
          <button type="button" className={`mboard__kind${!kind ? ' is-on' : ''}`} aria-pressed={!kind} onClick={() => setKind(null)}>All <small>{contracts(inSection)}</small></button>
          {kinds.map(([k, n]) => (
            <button key={k} type="button" className={`mboard__kind${kind === k ? ' is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{k} <small>{n}</small></button>
          ))}
        </div>
      )}
      <p className="mboard__key">{searching ? <><b>{contracts(shown)}</b> contracts match “{filter.trim()}” across every section · </> : null}YES bid / ask in cents, then what YES and NO cost · <span className="fairkey">◆ fair</span> = model P(YES), research evidence only · tap any price for the full contract</p>
      {blocks.map((b) => {
        const bySubject = new Map<string, MarketGroup[]>();
        for (const g of b.gs) bySubject.set(g.subject ?? '', [...(bySubject.get(g.subject ?? '') ?? []), g]);
        return (
          <div key={b.id} className="mboard__block">
            {b.label && <h3 className="mboard__sec">{b.label} <small>{contracts(b.gs)}</small></h3>}
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
                          const title = describeMarket(m, { playerName }).title;
                          return (
                            <li key={m.market_id}>
                              <Link to={routes.market(sportSlug, m.market_id, m.event_id ?? '')} className={`mrow mrow--yn${st ? ' is-notopen' : ''}`}>
                                <span className="mrow__d">{title}{st && <span className="rungcell__st"> {st}</span>}</span>
                                <span className="mrow__p num">{cents(m.yes_bid)} / {cents(m.yes_ask)}</span>
                                <YesNo m={m} title={title} />
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
          </div>
        );
      })}
      {!shown.length && <p className="muted">{searching ? `No market matches “${filter.trim()}”. Try a player’s surname, a stat or a team.` : 'No markets match.'}</p>}
    </div>
  );
}
