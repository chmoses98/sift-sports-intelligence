// The NBA home: the slate as scannable rows (tipoff, both clubs with their logos, the published matchup read and
// injury count once a row's research is read), and the honest model status: every NBA family is RESEARCH authority
// and the publication's own out-of-sample study shows the raw Kalshi price beating the model in 8 of 8 families.
// Preseason games say so; nothing on this page ranks a bet.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { dayLabel, timeLabel, until } from '../../lib/format';
import { nbaInjuries, nbaModelVsMarket, nbaTeam, nbaVenue } from '../../lib/nba';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { sides } from '../home/cards';
import { useVisibleOnce } from '../shared/useVisible';
import { Pill, Section, SportHeader } from '../shared/kit';

/** "Dallas #4 net rating vs Houston #18" from the published matchup row ranks. */
export function nbaHeadline(r: { matchup: { metric_id: string; home: { context: { rank: number | null } | null } | null; away: { context: { rank: number | null } | null } | null }[] }, home: string, away: string): string | null {
  const net = r.matchup.find((m) => m.metric_id === 'met_nba.team_net_rtg');
  const h = net?.home?.context?.rank;
  const a = net?.away?.context?.rank;
  if (h == null || a == null) return null;
  return `Net rating last season: ${away} #${a}, ${home} #${h}`;
}

function GameRow({ item, slug, now }: { item: BoardItem; slug: string; now: number }) {
  const { repo } = useSport();
  const [ref, seen] = useVisibleOnce<HTMLLIElement>();
  const research = useAsync(seen ? `er:NBA:${item.event_id}` : null, () => repo.eventResearch(item.event_id));
  const { home, away } = sides(item);
  const r = research.data;
  const started = Date.parse(item.start_time_utc) <= now || item.status === 'LIVE';
  const inj = r ? nbaInjuries(r).filter((i) => i.status !== 'ACTIVE') : [];
  const venue = r ? nbaVenue(r) : null;
  const ht = nbaTeam(home?.short_name);
  const at = nbaTeam(away?.short_name);
  return (
    <li ref={ref}>
      <Link to={routes.game(slug, item.event_id)} className="skrow" aria-label={`${away?.display_name} at ${home?.display_name}, ${timeLabel(item.start_time_utc)}`}>
        <span className="skrow__when"><span className="skrow__time num">{timeLabel(item.start_time_utc)}</span><span className="skrow__until">{item.status === 'LIVE' ? 'Live' : started ? 'Tipped off' : until(item.start_time_utc, now)}</span></span>
        <span className="skrow__teams">
          <span className="skrow__team"><TeamMark sport="NBA" abbr={away?.short_name} size="sm" /><span className="skrow__name">{at ? `${at.city} ${at.name}` : away?.display_name}</span></span>
          <span className="skrow__team"><TeamMark sport="NBA" abbr={home?.short_name} size="sm" /><span className="skrow__name">{ht ? `${ht.city} ${ht.name}` : home?.display_name}{venue?.neutral && <small>neutral site</small>}</span></span>
        </span>
        <span className="skrow__read">
          {research.loading && !r && <span className="muted">Reading research…</span>}
          {r && <span>{nbaHeadline(r, home?.short_name ?? 'home', away?.short_name ?? 'away') ?? 'No ranked matchup published'}</span>}
          {r && inj.length > 0 && <span><b className="num">{inj.length}</b> on the injury report</span>}
          {item.competition === 'preseason' && <span className="skrow__tag">preseason</span>}
        </span>
        <span className="skrow__meta"><span>{item.markets_available ? <><b className="num">{item.markets_available}</b> markets</> : 'No Kalshi markets yet'}</span>{item.markets_priced === 0 && item.markets_available > 0 && <span>model prices none</span>}</span>
        <Icon name="chevronRight" size={18} className="skrow__go" />
      </Link>
    </li>
  );
}

export function NbaHomeView() {
  const { sport, repo, slug } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const items = useMemo(() => (board.data?.items ?? []).filter((i) => i.status !== 'FINAL').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [board.data]);
  const first = items.find((i) => i.markets_available > 0) ?? items[0];
  const study = useAsync(first ? `er:NBA:${first.event_id}` : null, () => repo.eventResearch(first!.event_id));
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="NBA board" /></div>;
  const byDay = new Map<string, BoardItem[]>();
  for (const i of items) byDay.set(dayLabel(i.start_time_utc), [...(byDay.get(dayLabel(i.start_time_utc)) ?? []), i]);
  const markets = items.reduce((a, b) => a + b.markets_available, 0);
  const priced = items.reduce((a, b) => a + b.markets_priced, 0);
  const health = repo.source.liveHealth;
  const families = study.data ? nbaModelVsMarket(study.data) : [];
  const preseason = items.length > 0 && items.every((i) => i.competition === 'preseason');
  return (
    <div className="page nba">
      <SportHeader
        logo={`${import.meta.env.BASE_URL}leagues/nba.webp`}
        title="NBA"
        sub={<><b>{items.length}</b> games{preseason ? ' (preseason)' : ''} · <b>{markets}</b> Kalshi markets · <b>{priced}</b> priced by the model · research only</>}
        status={<>{health && <Pill tone={health.overall_status === 'HEALTHY' ? 'ok' : 'research'}>{health.overall_status.replace(/_/g, ' ').toLowerCase()}</Pill>}<Pill tone="research" title="Out-of-sample walk-forward: the raw Kalshi price has lower log loss than the model in every family">market beats model 8/8 families</Pill></>}
      />
      <div className="skgrid">
        <Section id="nb-slate" title="Slate" sub="Tipoff, both clubs, last season's net-rating ranks and the injury report once a game's research is read. Tap a game for the matchup, the roster and every market.">
          {items.length === 0 && <p className="muted">No game on the board.</p>}
          {[...byDay.entries()].map(([day, rows]) => (
            <div key={day} className="skday">
              <h3 className="skday__h">{day} <small>{rows.length} game{rows.length === 1 ? '' : 's'}</small></h3>
              <ul className="sklist">{rows.map((i) => <GameRow key={i.event_id} item={i} slug={slug} now={now} />)}</ul>
            </div>
          ))}
        </Section>
        <div className="stack">
          <Section id="nb-status" title="Model status" sub="What the NBA publication says about itself. Sift shows the study, not a recommendation.">
            <div className="skopp skopp--pass">
              <div className="skopp__eyebrow">Pass <Pill tone="neutral">research authority</Pill></div>
              <h2 className="skopp__t">No NBA market clears the bar: the market has been the better forecaster in every family.</h2>
              <p className="skopp__why">Out of sample, the raw Kalshi price has lower log loss than the model in 8 of 8 families, every NBA family is RESEARCH authority, and this publication carries no model prices (a known export defect). Preseason rotations are not representative. Sift therefore surfaces no NBA opportunity and says so.</p>
            </div>
            {families.length > 0 && (
              <div className="tscroll" style={{ marginTop: 12 }}><table className="dtable">
                <thead><tr><th scope="col">Family</th><th scope="col" className="r">Out-of-sample n</th><th scope="col" className="r">Market log loss</th><th scope="col" className="r">Model</th><th scope="col" className="r">Hybrid</th></tr></thead>
                <tbody>{families.map((f) => <tr key={f.family}><th scope="row">{f.family.replace(/_/g, ' ')}</th><td className="r num">{f.nOos.toLocaleString('en-US')}</td><td className="r num">{f.marketLogLoss?.toFixed(3) ?? '—'}</td><td className="r num">{f.modelLogLoss?.toFixed(3) ?? '—'}</td><td className="r num">{f.hybridLogLoss?.toFixed(3) ?? '—'}{f.hybridBeatsMarket ? <span className="muted" title="The publication's hybrid (market-anchored) variant beat the calibrated market in this family out of sample"> ✓</span> : null}</td></tr>)}</tbody>
              </table></div>
            )}
            <p className="muted small">Lower log loss is better; ✓ marks the one family where the publication's market-anchored hybrid beat the calibrated market (rebounds), still research authority. Research tables do not run on a schedule in the NBA repository; the model-vs-market study is the latest it published.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
