import { matchupInsights } from '../insights/matchups';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import type { SportRepo } from '../data/repo';
import { compact, dayLabel, displayName, kickoff, pct, signed, timeLabel, until } from '../lib/format';
import { MATCHUP_AREAS } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { Icon } from '../components/Icon';
import { ErrorState, Notice, Skeleton, Stratum, TeamMark } from '../components/ui';
import { publicationView, QuoteChip, QuoteSummaryChip, useQuoteViews } from '../components/LiveQuote';
import { useLiveQuotes, useNow } from '../live/hooks';

function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

export interface Hook {
  label: string;
  value: string;
}

/** What makes this game worth opening, from its own research document. */
export function researchHooks(r: EventResearchDoc): { implied: string | null; gap: Hook | null; result: string | null } {
  const ext = (r.extensions ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const mi = ext.market_implied;
  let implied: string | null = null;
  if (mi?.win_probability) {
    const fav = Object.entries(mi.win_probability as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
    implied = `${fav[0]} ${pct(fav[1], 0)} · spread ${mi.implied_spread != null ? signed(mi.implied_spread, 1) : '—'} · total ${mi.implied_total_median ?? '—'}`;
  }
  let gap: Hook | null = null;
  const pairs = (ext.matchup_pairs ?? []) as { matchup: string; offense: string; defense: string; advantage_to_offense: number }[];
  if (pairs.length) {
    const top = [...pairs].sort((a, b) => Math.abs(b.advantage_to_offense) - Math.abs(a.advantage_to_offense))[0];
    const area = MATCHUP_AREAS.find((a) => a.name === top.matchup);
    gap = {
      label: `${top.offense} ${area?.label.toLowerCase() ?? top.matchup} offense vs ${top.defense} defense`,
      value: `${top.advantage_to_offense > 0 ? 'edge to offense' : 'edge to defense'} ${signed(top.advantage_to_offense, 3)}`,
    };
  }
  const res = ext.result as { home_score?: number; away_score?: number } | undefined;
  let result: string | null = null;
  if (res && res.home_score != null && res.away_score != null) {
    const home = r.participants.find((p) => p.home_away === 'HOME');
    const away = r.participants.find((p) => p.home_away === 'AWAY');
    const short = (pid?: string) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
    result = `${short(away?.participant_id)} ${res.away_score} — ${short(home?.participant_id)} ${res.home_score}`;
  }
  return { implied, gap, result };
}

function GameCard({ item, repo, sportSlug, now }: { item: BoardItem; repo: SportRepo; sportSlug: string; now: number }) {
  const [ref, seen] = useVisible<HTMLLIElement>();
  const research = useAsync(seen ? `er:${repo.sport.code}:${item.event_id}` : null, () => repo.eventResearch(item.event_id));
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  const hooks = research.data ? researchHooks(research.data) : null;
  // Slate-level market clock: the game-winner contracts of cards on screen, at slate cadence.
  const winners = useMemo(() => (research.data?.markets ?? []).filter((m) => m.market_family === 'game_winner'), [research.data]);
  useLiveQuotes(winners.map((m) => m.kalshi_ticker), 'slate');
  const views = useQuoteViews(winners);
  const passed = Date.parse(item.start_time_utc) <= now && item.status === 'SCHEDULED';
  return (
    <li ref={ref} className="gcard">
      <Link to={routes.game(sportSlug, item.event_id)} className="gcard__link" aria-label={`${away?.display_name} at ${home?.display_name}, ${kickoff(item.start_time_utc)}`}>
        <div className="gcard__teams">
          <div className="gcard__team">
            <TeamMark sport={repo.sport.code} abbr={away?.short_name} />
            <span className="gcard__name">{displayName(away?.display_name)}</span>
          </div>
          <span className="gcard__at" aria-hidden="true">@</span>
          <div className="gcard__team">
            <TeamMark sport={repo.sport.code} abbr={home?.short_name} />
            <span className="gcard__name">{displayName(home?.display_name)}</span>
          </div>
        </div>
        <div className="gcard__meta">
          <span className="gcard__time">{timeLabel(item.start_time_utc)}</span>
          <span className={`gcard__until${passed ? ' is-passed' : ''}`}>{passed ? 'kickoff passed' : until(item.start_time_utc, now)}</span>
          <span className="gcard__mk"><b className="num">{compact(item.markets_available)}</b> markets</span>
        </div>
        <div className="gcard__hooks">
          {!hooks && seen && research.loading && <span className="gcard__hook gcard__hook--load">reading research…</span>}
          {research.error && <span className="gcard__hook">no event research published</span>}
          {research.data && <span className="gcard__hook gcard__hook--edge">{matchupInsights(research.data)[0]?.headline ?? 'Evenly matched on the published ranks'}</span>}
          {hooks?.implied && <span className="gcard__hook"><span className="gcard__hk">Market</span>{hooks.implied}</span>}
        </div>
      </Link>
      <div className="gcard__foot">
        {views.length ? <QuoteSummaryChip views={views} now={now} /> : <QuoteChip view={publicationView(item.market_captured_at)} now={now} label="prices" />}
        {item.health_flags.map((f) => (
          <span key={f} className="flag">{f.replace(/_/g, ' ').toLowerCase()}</span>
        ))}
      </div>
    </li>
  );
}

function PastRow({ item, repo, sportSlug }: { item: BoardItem; repo: SportRepo; sportSlug: string }) {
  const [ref, seen] = useVisible<HTMLLIElement>();
  const research = useAsync(seen ? `er:${repo.sport.code}:${item.event_id}` : null, () => repo.eventResearch(item.event_id));
  const hooks = research.data ? researchHooks(research.data) : null;
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  return (
    <li ref={ref}>
      <Link to={routes.game(sportSlug, item.event_id)} className="pastrow">
        <span className="pastrow__wk">{item.competition?.replace(/^\d{4}\s*(REG\s*)?/, '')}</span>
        <span className="pastrow__m">{away?.short_name} @ {home?.short_name}</span>
        <span className="pastrow__r num">{hooks?.result ?? item.status}</span>
        <span className="pastrow__n">{item.markets_available} markets</span>
      </Link>
    </li>
  );
}

export function groupWindows(items: BoardItem[]): { key: string; day: string; time: string; start: string; end: string; items: BoardItem[] }[] {
  const out = new Map<string, { key: string; day: string; time: string; start: string; end: string; items: BoardItem[] }>();
  for (const it of [...items].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))) {
    const key = it.start_time_utc;
    let w = out.get(key);
    if (!w) out.set(key, (w = { key, day: dayLabel(key), time: timeLabel(key), start: key, end: key, items: [] }));
    w.items.push(it);
  }
  return [...out.values()];
}

export function SlateView() {
  const { sport, repo, slug, caps } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(`${sport.label} slate`, 'slate');
  const now = useNow(30_000);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what={`${sport.label} board`} /></div>;
  const items = board.data.items;
  const upcoming = items.filter((i) => i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS' || i.status === 'LIVE');
  const past = items.filter((i) => i.status === 'FINAL').sort((a, b) => b.start_time_utc.localeCompare(a.start_time_utc));
  const other = items.filter((i) => !upcoming.includes(i) && !past.includes(i));
  const windows = groupWindows(upcoming);
  const comp = upcoming[0]?.competition ?? items[0]?.competition ?? '';
  const totalMarkets = upcoming.reduce((a, b) => a + b.markets_available, 0);
  const byDay = new Map<string, typeof windows>();
  for (const w of windows) byDay.set(w.day, [...(byDay.get(w.day) ?? []), w]);
  const lastCapture = upcoming.map((i) => i.market_captured_at).filter(Boolean).sort().pop() ?? null;

  return (
    <div className="page slate">
      <header className="pagehead">
        <div className="eyebrow">{sport.fullName}</div>
        <h1 className="h-display">{comp || `${sport.label} slate`}</h1>
        <div className="pagehead__stats">
          <span><b className="num">{upcoming.length}</b> upcoming games</span>
          <span><b className="num">{compact(totalMarkets)}</b> Kalshi markets</span>
          <span><b className="num">{past.length}</b> earlier games with research</span>
          <QuoteChip view={publicationView(lastCapture)} now={now} label="published prices" />
        </div>
        <p className="lede">
          Open a game to see how the teams match up, where the evidence is unusual, and which markets the research touches.
          Market-implied numbers come from Kalshi midpoints; model numbers are research evidence, never picks.
        </p>
      </header>

      {!upcoming.length && <Notice title="No upcoming games in this publication">The board lists only completed or unscheduled games right now.</Notice>}

      {[...byDay.entries()].map(([day, ws]) => (
        <Stratum key={day} title={day} sub={`${ws.reduce((a, w) => a + w.items.length, 0)} games`}>
          {ws.map((w) => (
            <div key={w.key} className="window">
              <div className="window__head">
                <span className="window__time"><Icon name="clock" size={14} /> {w.time}</span>
                <span className="window__n">{w.items.length} {w.items.length === 1 ? 'game' : 'games'}</span>
                {w.items.length > 1 && (
                  <Link className="btn btn--ghost btn--sm" to={routes.packet({ sport: slug, scope: 'SLATE', start: w.start, end: w.end })}>
                    <Icon name="copy" size={14} /> Copy window for ChatGPT
                  </Link>
                )}
              </div>
              <ul className="gcards">
                {w.items.map((it) => (
                  <GameCard key={it.event_id} item={it} repo={repo} sportSlug={slug} now={now} />
                ))}
              </ul>
            </div>
          ))}
        </Stratum>
      ))}

      {past.length > 0 && caps.size > 0 && (
        <Stratum title="Earlier this season" sub="Completed games the publication keeps research for. Every team's full schedule and results live on its profile.">
          <ul className="pastlist">
            {past.map((it) => (
              <PastRow key={it.event_id} item={it} repo={repo} sportSlug={slug} />
            ))}
          </ul>
        </Stratum>
      )}
      {other.length > 0 && (
        <Stratum title="Other events" sub="Status not scheduled or final in this publication.">
          <ul className="pastlist">
            {other.map((it) => (
              <PastRow key={it.event_id} item={it} repo={repo} sportSlug={slug} />
            ))}
          </ul>
        </Stratum>
      )}
    </div>
  );
}
