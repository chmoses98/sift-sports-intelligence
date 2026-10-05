// News: the availability wire — every injury designation captured for upcoming NFL games, newest first,
// from the publications Sift already reads (no separate news provider is connected).
import { Link } from 'react-router';
import type { EventResearchDoc } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { sportByCode } from '../data/sports';
import { Skeleton, TeamMark } from '../components/ui';
import { injuryRows } from '../lib/gamedata';
import { kickoff } from '../lib/format';
import { routes } from '../lib/routes';
import { useVisit } from '../state/trail';
import { PanelHead } from './game/panels';

const WORD: Record<string, string> = { OUT: 'Out', DOUBTFUL: 'Doubtful', QUESTIONABLE: 'Questionable', PROBABLE: 'Probable' };

export function NewsView() {
  useVisit('News', 'news');
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const data = useAsync(repo.data?.source.root ? `news:NFL:${repo.data.source.root}` : null, async () => {
    const r = repo.data!;
    const board = await r.board();
    const up = board.items.filter((i) => i.status === 'SCHEDULED');
    const docs = await Promise.allSettled(up.map((i) => r.eventResearch(i.event_id)));
    return docs.filter((d): d is PromiseFulfilledResult<EventResearchDoc> => d.status === 'fulfilled').map((d) => d.value);
  });
  const rows = (data.data ?? []).flatMap((r) => {
    const game = r.participants.map((p) => r.event.participants.find((x) => x.participant_id === p.participant_id)?.short_name).reverse().join(' @ ');
    return injuryRows(r).map((x) => ({ ...x, game, eventId: r.event.event_id, kickoff: r.event.start_time_utc }));
  }).filter((x) => x.status === 'OUT' || x.status === 'DOUBTFUL' || x.status === 'QUESTIONABLE');
  rows.sort((a, b) => (b.asOf ?? '').localeCompare(a.asOf ?? '') || a.kickoff.localeCompare(b.kickoff));
  return (
    <div className="page news">
      <header className="shead">
        <div className="shead__t">
          <div className="eyebrow">NFL</div>
          <h1 className="h-display shead__h">News</h1>
          <div className="shead__comp">The availability wire for this week's games. Designations resolve at the inactive release, 90 minutes before kickoff.</div>
        </div>
      </header>
      <section className="panel" aria-labelledby="wire-h">
        <PanelHead title="Availability Wire" sub={`${rows.length} Out / Doubtful / Questionable designations · source ESPN via the publication`} />
        {(repo.loading || data.loading) && <Skeleton lines={6} />}
        <ul className="wire">
          {rows.map((x, i) => (
            <li key={i} className="wire__row">
              <span className={`inj__s inj__s--${x.status.toLowerCase()}`}>{WORD[x.status] ?? x.status}</span>
              <span className="wire__p"><TeamMark sport="NFL" abbr={x.team} size="sm" /> <b>{x.player}</b> <span className="muted">{x.position}</span></span>
              <Link to={routes.game('nfl', x.eventId, { tab: 'injuries' })} className="wire__g">{x.game} · {kickoff(x.kickoff)}</Link>
              {x.note && <span className="wire__n">{x.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
