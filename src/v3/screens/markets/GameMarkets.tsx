// Game and team markets as ONE research panel: pick a market (moneyline, spread, game total, team totals, periods), pick a rung, and the chart, the hit
// count, the price and the exact Kalshi contract change together. Used on the Game page and in Discover's "Game & team" scope, so the same market opens
// the same evidence wherever it is found. Prices go through the quote gate; a withheld price says why and can be retried. Evidence is the two teams'
// completed games this season from their published profiles; where a market has none (period scoring) the panel says so and shows price and scenario only.
import './markets.css';
import '../props/props.css';
import { useEffect, useMemo, useState } from 'react';
import type { EventDetailDoc } from '../../../contract/types';
import { completedGames } from '../../../lib/gamedata';
import { useTeamProfile } from '../../data/research/hooks';
import { useQuotedPrices } from '../../data/research/gameHooks';
import { refreshRowsNow } from '../../data/liveQuotes';
import { explainGate, gate } from '../../data/quoteGate';
import { useNow } from '../../../live/hooks';
import { clears, evidenceFor, parseGameMarkets, profileCurrent, rungWords, type MarketGroup, type Result } from '../../model/gameMarkets';
import { clockTime } from '../../model/time';
import type { V3Game } from '../../model/types';
import { usePublishGameContracts } from '../../ui/gameContracts';
import { PriceTap } from '../../nav/Targets';
import { useQueryPatch } from '../../state/url';
import { useLocation } from '../../../routing';
import { Icon } from '../../ui/Icon';
import { HitBars } from '../props/parts';

const resultsOf = (raw: Parameters<typeof completedGames>[0], season: string | null | undefined): Result[] => {
  const start = season ? `${season.slice(0, 4)}-06-01` : '';
  return completedGames(raw).filter((g) => g.date >= start).map((g) => ({ for: g.for, against: g.against, outcome: g.outcome, date: g.date, opp: g.opponentName }));
};

function WhyNote({ text, onRetry, busy, checked }: { text: string; onRetry: () => void; busy: boolean; checked: number | null }) {
  return (
    <div className="pd-pnote" role="status" data-price-why>
      <Icon name="info" size={14} />
      <p>{text}{checked ? ` Checked again at ${clockTime(checked)}: no newer usable quote.` : ''}</p>
      <button type="button" className="pd-abtn" onClick={onRetry} disabled={busy}>{busy ? 'Checking' : 'Retry'}</button>
    </div>
  );
}

export function GameMarkets({ g, startMs, detail, loadingDetail }: { g: V3Game; startMs: number | null; detail: EventDetailDoc | null | undefined; loadingDetail?: boolean }) {
  const loc = useLocation();
  const patch = useQueryPatch();
  const q = new URLSearchParams(loc.search);
  const now = useNow(5_000);
  usePublishGameContracts(g, startMs, detail ?? null);
  const groups = useMemo(() => parseGameMarkets(detail?.markets, { awayId: detail?.event.away_participant ?? null, homeId: detail?.event.home_participant ?? null, awayName: g.away.nick, homeName: g.home.nick }), [detail, g.away.nick, g.home.nick]);
  const awayP = useTeamProfile(g.slug, g.away.id);
  const homeP = useTeamProfile(g.slug, g.home.id);
  const awayOk = profileCurrent(awayP.raw ? { season: awayP.raw.season, asOf: awayP.raw.quality?.data_as_of ?? null } : null, now);
  const homeOk = profileCurrent(homeP.raw ? { season: homeP.raw.season, asOf: homeP.raw.quality?.data_as_of ?? null } : null, now);
  const away = useMemo(() => (awayOk.ok ? resultsOf(awayP.raw, awayP.raw?.season) : []), [awayP.raw, awayOk.ok]);
  const home = useMemo(() => (homeOk.ok ? resultsOf(homeP.raw, homeP.raw?.season) : []), [homeP.raw, homeOk.ok]);
  const staleReason = !awayOk.ok && !homeOk.ok && (awayP.raw || homeP.raw) ? awayOk.reason : null;

  const selKey = q.get('mk') && groups.some((x) => x.key === q.get('mk')) ? q.get('mk')! : groups[0]?.key ?? null;
  const grp = groups.find((x) => x.key === selKey) ?? null;
  const kParam = Number(q.get('mkk'));
  const k = grp && grp.rungs.length ? (grp.rungs.some((r) => r.k === kParam) ? kParam : grp.featured ?? grp.rungs[0].k) : null;
  const rung = grp?.rungs.find((r) => r.k === k) ?? null;

  const tickers = useMemo(() => (grp ? [...grp.rungs.map((r) => r.ticker), ...grp.singles.map((s) => s.ticker)] : []), [grp]);
  const quoted = useQuotedPrices(detail, tickers, { startMs, live: g.phase === 'live' });
  const ctx = { kind: 'list' as const, startMs, live: g.phase === 'live' };
  const askOf = (t: string) => gate(quoted(t), ctx, now).price?.ask ?? null;
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<number | null>(null);
  useEffect(() => setChecked(null), [selKey, k]);

  if (!detail) return <div className="v3-skel" style={{ height: 120, margin: '8px 0' }} role="status" aria-label={loadingDetail ? 'Loading markets' : 'Markets unavailable'} />;
  if (!groups.length) return <p className="mkp-empty">Kalshi lists no game or team markets for this game yet.</p>;

  const sideName = (x: MarketGroup) => (x.side === 'away' ? g.away.nick : x.side === 'home' ? g.home.nick : '');
  const ev = grp ? (staleReason ? ({ state: 'none', reason: staleReason } as const) : evidenceFor(grp, away, home)) : null;
  const gres = rung ? gate(quoted(rung.ticker), ctx, now) : null;
  const why = gres && rung ? explainGate(gres, ctx, now, (ms) => clockTime(ms)) : null;
  const recheck = async () => { setBusy(true); try { await refreshRowsNow(tickers, { startMs, live: g.phase === 'live' }); } finally { setBusy(false); setChecked(Date.now()); } };
  const select = (key: string) => patch({ mk: key, mkk: null });

  return (
    <section className="mkp" aria-label="Game and team markets" data-testid="game-markets">
      <div className="mkp-rail" role="group" aria-label="Market">
        {groups.map((x) => (
          <button key={x.key} type="button" aria-pressed={x.key === selKey} className="mkp-chip" onClick={() => select(x.key)}>{x.title}</button>
        ))}
      </div>
      {grp && grp.rungs.length > 0 && rung && k != null && (
        <div className="mkp-card" data-group={grp.key} data-k={k}>
          <div className="mkp-sel" aria-label="Selected contract">
            <span><b>{rungWords(grp, k, sideName(grp))}</b><small>{grp.period === 'FULL' ? 'Full game' : grp.period} · YES pays if it happens · Kalshi {rung.ticker.split('-').slice(0, 2).join(' ')}</small></span>
            <PriceTap ticker={rung.ticker} className="mkp-px" label={`Exact contract: ${rungWords(grp, k, sideName(grp))}${askOf(rung.ticker) != null ? `, ${askOf(rung.ticker)} cents` : ', price withheld'}`}>
              <b className="num">{askOf(rung.ticker) != null ? `${askOf(rung.ticker)}¢` : '—'}</b><small>{askOf(rung.ticker) != null ? 'ask · open contract' : 'open contract'}</small>
            </PriceTap>
          </div>
          {why && <WhyNote text={`${why.short}. ${why.detail}`} onRetry={() => void recheck()} busy={busy} checked={checked} />}
          {ev?.state === 'ready' ? ev.series.filter((s) => s.values.length).map((s) => {
            const c = clears(grp.kind, s.values, k);
            const name = s.team === 'away' ? g.away.nick : s.team === 'home' ? g.home.nick : s.label;
            return (
              <div key={s.label} className="mkp-chart">
                <div className="mkp-ch__h"><b>{name} · last {s.values.length}</b><span>{c.hit} of {c.n} reached {k}{grp.kind === 'spread' ? '+ margin' : '+'}</span></div>
                <HitBars values={s.values} k={k} label={`${name}, last ${s.values.length} games, ${c.hit} of ${c.n} reached ${k}`} />
              </div>
            );
          }) : ev?.state === 'none' ? <p className="mkp-none"><Icon name="lock" size={13} /> {ev.reason}</p> : null}
          {ev?.state === 'ready' && <p className="mkp-note">{ev.note} {awayP.raw?.season ? `Season ${awayP.raw.season}.` : ''}</p>}
          <div className="mkp-rungs" role="group" aria-label="Rungs">
            <span className="x-eyebrow">Line</span>
            {grp.rungs.map((r) => (
              <button key={r.k} type="button" className="pd-rs" aria-pressed={r.k === k} onClick={() => patch({ mk: grp.key, mkk: String(r.k) })} aria-label={`${r.k} or more, ${askOf(r.ticker) != null ? `${askOf(r.ticker)} cents` : 'no price'}`}>
                <b>{r.k}+</b><small>{askOf(r.ticker) != null ? `${askOf(r.ticker)}¢` : '—'}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {grp && grp.singles.length > 0 && (
        <div className="mkp-card" data-group={grp.key}>
          <ul className="mkp-singles">
            {grp.singles.map((s) => (
              <li key={s.ticker}>
                <span><b>{s.label}</b><small>{grp.kind === 'moneyline' ? 'to win' : `to lead ${grp.period === 'FULL' ? '' : `the ${grp.period}`}`.trim()}</small></span>
                <PriceTap ticker={s.ticker} className="mkp-px" label={`Exact contract: ${s.label}${askOf(s.ticker) != null ? `, ${askOf(s.ticker)} cents` : ', price withheld'}`}>
                  <b className="num">{askOf(s.ticker) != null ? `${askOf(s.ticker)}¢` : '—'}</b><small>ask</small>
                </PriceTap>
              </li>
            ))}
          </ul>
          {ev?.state === 'ready' ? ev.series.filter((s) => s.values.length).map((s) => {
            const name = s.team === 'away' ? g.away.nick : g.home.nick;
            const w = s.values.filter((v) => v > 0).length;
            return (
              <div key={s.label} className="mkp-chart">
                <div className="mkp-ch__h"><b>{name} · last {s.values.length}</b><span>{w}-{s.values.length - w}</span></div>
                <ol className="mkp-res" aria-label={`${name} recent results`}>
                  {s.values.map((v, i) => <li key={i} className={v > 0 ? 'is-w' : v < 0 ? 'is-l' : ''}><b>{v > 0 ? 'W' : v < 0 ? 'L' : 'T'}</b><small>{v > 0 ? `+${v}` : v}</small></li>)}
                </ol>
              </div>
            );
          }) : null}
          {ev?.state === 'none' && <p className="mkp-none"><Icon name="lock" size={13} /> {ev.reason}</p>}
          {ev?.state === 'ready' && <p className="mkp-note">{ev.note}</p>}
        </div>
      )}
    </section>
  );
}
