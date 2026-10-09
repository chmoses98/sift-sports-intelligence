// The Soccer home: competitions first (one tap filters the slate), then every fixture as a scannable row with the
// model's 1X2 read where the publication priced it, how many research candidates the fixture carries, and the
// honest status of the model (RESEARCH_ONLY everywhere). Research documents load per fixture as rows scroll into
// view; the board alone draws the page.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem, HealthDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { dayLabel, timeLabel, until } from '../../lib/format';
import { routes } from '../../lib/routes';
import { clubInitials, competitionOf, LEAGUE_ORDER, soccerBoard } from '../../lib/soccer';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { useVisibleOnce } from '../shared/useVisible';
import { Pill, Section, SportHeader, TextMark } from '../shared/kit';
import { SportOpportunities } from '../home/SportOpportunities';

const fmtAge = (iso: string | null | undefined, now: number) => {
  if (!iso) return 'unknown';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m ago`;
};

export function sidesOf(item: BoardItem) {
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  return { home, away };
}

function FixtureRow({ item, slug, now, showCompetition }: { item: BoardItem; slug: string; now: number; showCompetition: boolean }) {
  const { repo } = useSport();
  const [ref, seen] = useVisibleOnce<HTMLLIElement>();
  const research = useAsync(seen ? `er:SOCCER:${item.event_id}` : null, () => repo.eventResearch(item.event_id));
  const { home, away } = sidesOf(item);
  const b = research.data ? soccerBoard(research.data) : null;
  const started = Date.parse(item.start_time_utc) <= now;
  const comp = competitionOf(item);
  const label = `${home?.display_name ?? '?'} v ${away?.display_name ?? '?'}, ${comp.name}, ${timeLabel(item.start_time_utc)}`;
  const fav = b ? (b.pHome != null && b.pAway != null ? (b.pHome >= b.pAway ? 'home' : 'away') : null) : null;
  return (
    <li ref={ref}>
      <Link to={routes.game(slug, item.event_id)} className="skrow" aria-label={label}>
        <span className="skrow__when">
          <span className="skrow__time num">{timeLabel(item.start_time_utc)}</span>
          <span className="skrow__until">{started ? 'Kicked off' : until(item.start_time_utc, now)}</span>
        </span>
        <span className="skrow__teams">
          <span className="skrow__team"><TextMark text={clubInitials(home?.display_name)} size="sm" /><span className="skrow__name">{home?.display_name}{showCompetition && <small>{comp.name}</small>}</span>{b && <span className={`skrow__p num${fav === 'home' ? ' is-fav' : ''}`}>{Math.round((b.pHome ?? 0) * 100)}%</span>}</span>
          <span className="skrow__team"><TextMark text={clubInitials(away?.display_name)} size="sm" /><span className="skrow__name">{away?.display_name}</span>{b && <span className={`skrow__p num${fav === 'away' ? ' is-fav' : ''}`}>{Math.round((b.pAway ?? 0) * 100)}%</span>}</span>
        </span>
        <span className="skrow__read">
          {research.loading && !research.data && <span className="muted">Reading research…</span>}
          {b ? (
            <>
              <span>Draw <b className="num">{Math.round((b.pDraw ?? 0) * 100)}%</b></span>
              <span>Over 2.5 <b className="num">{Math.round((b.pOver25 ?? 0) * 100)}%</b></span>
              <span>Goals <b className="num">{b.meanHome?.toFixed(1)}–{b.meanAway?.toFixed(1)}</b></span>
            </>
          ) : research.data ? <span className="muted">Not on the model board</span> : null}
          {item.recommendations_count > 0 && <span><b className="num">{item.recommendations_count}</b> research candidate{item.recommendations_count === 1 ? '' : 's'}</span>}
        </span>
        <span className="skrow__meta">
          <span>{item.markets_available ? <><b className="num">{item.markets_available}</b> markets</> : 'No Kalshi markets yet'}</span>
        </span>
        <Icon name="chevronRight" size={18} className="skrow__go" />
      </Link>
    </li>
  );
}

export function useSoccerBoard() {
  const { sport, repo } = useSport();
  return useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
}

/** Competitions on the board, big leagues first, each with its fixture count. */
export function competitions(items: BoardItem[]): { key: string; name: string; n: number }[] {
  const m = new Map<string, { key: string; name: string; n: number }>();
  for (const i of items) {
    const c = competitionOf(i);
    const cur = m.get(c.key) ?? { ...c, n: 0 };
    cur.n++;
    m.set(c.key, cur);
  }
  const idx = (k: string) => (LEAGUE_ORDER.indexOf(k) === -1 ? 99 : LEAGUE_ORDER.indexOf(k));
  return [...m.values()].sort((a, b) => idx(a.key) - idx(b.key) || b.n - a.n || a.name.localeCompare(b.name));
}

export function SoccerSlate({ items, slug, now, filter }: { items: BoardItem[]; slug: string; now: number; filter: string | null }) {
  const shown = useMemo(() => items.filter((i) => !filter || competitionOf(i).key === filter).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [items, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const i of shown) m.set(dayLabel(i.start_time_utc), [...(m.get(dayLabel(i.start_time_utc)) ?? []), i]);
    return [...m.entries()];
  }, [shown]);
  if (!shown.length) return <p className="muted">No fixture on the board for this selection.</p>;
  return (
    <>
      {byDay.map(([day, rows]) => (
        <div key={day} className="skday">
          <h3 className="skday__h">{day} <small>{rows.length} fixture{rows.length === 1 ? '' : 's'}</small></h3>
          <ul className="sklist">{rows.map((i) => <FixtureRow key={i.event_id} item={i} slug={slug} now={now} showCompetition={!filter} />)}</ul>
        </div>
      ))}
    </>
  );
}

export function CompetitionChips({ comps, filter, onPick, total }: { comps: { key: string; name: string; n: number }[]; filter: string | null; onPick: (k: string | null) => void; total: number }) {
  return (
    <div className="skchips" role="group" aria-label="Competitions">
      <button type="button" className={`skchip${!filter ? ' is-on' : ''}`} onClick={() => onPick(null)}>All <small>{total}</small></button>
      {comps.map((c) => (
        <button key={c.key} type="button" className={`skchip${filter === c.key ? ' is-on' : ''}`} onClick={() => onPick(c.key)} aria-pressed={filter === c.key}>{c.name} <small>{c.n}</small></button>
      ))}
    </div>
  );
}

export function soccerStatus(h: HealthDoc | null | undefined, now: number) {
  if (!h) return null;
  return (
    <>
      <Pill tone={h.overall_status === 'HEALTHY' ? 'ok' : 'research'} title="The publication's overall status">{h.overall_status.replace(/_/g, ' ').toLowerCase()}</Pill>
      <Pill tone="neutral" title={h.last_model_generated ?? ''}>Model {fmtAge(h.last_model_generated, now)}</Pill>
      <Pill tone="neutral" title={h.last_market_capture ?? ''}>Prices {fmtAge(h.last_market_capture, now)}</Pill>
    </>
  );
}

export function SoccerHomeView() {
  const { sport, repo, slug } = useSport();
  const board = useSoccerBoard();
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('league');
  const items = useMemo(() => (board.data?.items ?? []).filter((i) => i.status !== 'FINAL'), [board.data]);
  const comps = useMemo(() => competitions(items), [items]);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="Soccer board" /></div>;
  const markets = items.reduce((a, b) => a + b.markets_available, 0);
  const health = repo.source.liveHealth;
  return (
    <div className="page soccer">
      <SportHeader
        title="Soccer"
        sub={<><b>{items.length}</b> fixtures across <b>{comps.length}</b> competitions · <b>{markets}</b> Kalshi markets · every model number is research only</>}
        status={soccerStatus(health, now)}
      />
      <CompetitionChips comps={comps} filter={filter} total={items.length} onPick={(k) => setSp(k ? { league: k } : {}, { replace: true })} />
      <div className="skgrid">
        <Section id="sc-slate" title={filter ? comps.find((c) => c.key === filter)?.name ?? 'Fixtures' : 'Fixtures'} sub="Kickoff, both clubs, the model's chance for each side where the fixture is on the model board, and how many research candidates the publication lists. Tap a fixture for its scripts, matchup and every market.">
          <SoccerSlate items={items} slug={slug} now={now} filter={filter} />
        </Section>
        <div className="stack">
          <SportOpportunities now={now} />
          <Section id="sc-status" title="Model status" sub="What the soccer publication says about itself.">
            <dl className="skkv">
              <div><dt>Authority</dt><dd>Every soccer model family is RESEARCH_ONLY: nothing on these pages permits a bet. The international pool is not validated.</dd></div>
              <div><dt>Model</dt><dd>Dixon-Coles goal rates (dc_laplace) simulated over worlds (world_sim_v2); scripts and expressions are research presentation.</dd></div>
              <div><dt>Lineups</dt><dd>A confirmed XI changes the lineup status and freshness, not the team rates: no validated player-strength layer exists.</dd></div>
              <div><dt>Calibration</dt><dd>Published per fixture and per market family (Brier, log loss against the market); open a fixture to read it.</dd></div>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
