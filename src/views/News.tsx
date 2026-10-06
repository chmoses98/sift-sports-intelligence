// News: what changes this week's games, most important first — starting quarterbacks, key absences,
// quarterback changes and weather that matters. Routine designations stay one tap deeper
// (insights/news.ts sets the importance; nothing here is invented — sources are the publication's injury
// and depth-chart captures, nflverse play-by-play for starts, and the kickoff forecast).
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EventResearchDoc } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { sportByCode } from '../data/sports';
import { Layer } from '../components/insight';
import { Skeleton, TeamMark } from '../components/ui';
import { kickoff } from '../lib/format';
import { routes } from '../lib/routes';
import { venueFor } from '../lib/venues';
import { useHistoryIndex, useTeamHistory } from '../history/load';
import { qbStarts } from '../history/team';
import { contextNotes, nameKey } from '../insights/context';
import { gameSides } from '../insights/game';
import { injuryNews, levelOf, type NewsItem } from '../insights/news';
import { useVisit } from '../state/trail';
import { PanelHead } from './game/panels';
import { gameWeather } from './game/Hero';

const LEVEL_WORD: Record<string, string> = { critical: 'Major', high: 'Important', medium: 'Worth knowing', low: 'Routine' };

export function NewsView() {
  useVisit('News', 'news');
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const hist = useTeamHistory('NFL');
  const index = useHistoryIndex('NFL');
  const data = useAsync(repo.data?.source.root ? `news:NFL:${repo.data.source.root}` : null, async () => {
    const r = repo.data!;
    const board = await r.board();
    const up = board.items.filter((i) => i.status === 'SCHEDULED');
    const docs = await Promise.allSettled(up.map((i) => r.eventResearch(i.event_id)));
    return docs.filter((d): d is PromiseFulfilledResult<EventResearchDoc> => d.status === 'fulfilled').map((d) => d.value);
  });
  const items = useMemo(() => {
    const out: (NewsItem & { game: string; kickoff: string })[] = [];
    for (const r of data.data ?? []) {
      const g = gameSides(r);
      if (!g) continue;
      const game = `${g.away.abbr} @ ${g.home.abbr}`;
      const qbs = new Set<string>();
      if (hist.data && g.week != null) for (const t of [g.away, g.home]) for (const q of qbStarts(hist.data.teams[t.abbr]?.weeks ?? [], g.week)) qbs.add(nameKey(q.name));
      // Season games played (history index): a player missing all season is old news.
      const played = (name: string, team: string | null) => {
        if (!index.data) return null;
        const hit = Object.values(index.data.players).find((p) => nameKey(p.name) === nameKey(name) && p.team === team);
        return hit ? hit.games : 0;
      };
      for (const n of injuryNews(r, qbs, played)) out.push({ ...n, game, kickoff: r.event.start_time_utc });
      // A quarterback ruled out already says the starter changed; the start history adds to it only otherwise.
      const qbOut = new Set(out.filter((x) => x.eventId === r.event.event_id && x.injury?.position === 'QB' && x.level === 'critical').map((x) => x.team));
      for (const c of contextNotes(r, hist.data ?? null, new Map(), g).filter((x) => x.kind === 'qb-change' && !qbOut.has(x.team.abbr))) {
        out.push({ id: c.id + r.event.event_id, kind: 'qb-change', level: 'high', score: 6, team: c.team.abbr, headline: c.headline, detail: c.detail, eventId: r.event.event_id, asOf: null, game, kickoff: r.event.start_time_utc });
      }
      const wx = gameWeather(r, venueFor(g.home.abbr, (r.context?.venue as { name?: string } | null)?.name ?? null));
      if (wx.flag) out.push({ id: `wx:${r.event.event_id}`, kind: 'weather', level: levelOf(4.5), score: 4.5, team: g.home.abbr, headline: `${wx.flag} expected for ${game}`, detail: `Kickoff forecast: ${wx.temp}° ${wx.condition ?? ''}${wx.wind ? `, ${wx.wind.toLowerCase()}` : ''}${wx.precip != null ? `, ${wx.precip}% chance of precipitation` : ''}.`, eventId: r.event.event_id, asOf: null, game, kickoff: r.event.start_time_utc });
    }
    return out.sort((a, b) => b.score - a.score || a.kickoff.localeCompare(b.kickoff));
  }, [data.data, hist.data, index.data]);
  const lead = items.filter((x) => x.level === 'critical' || x.level === 'high');
  const medium = items.filter((x) => x.level === 'medium');
  const low = items.filter((x) => x.level === 'low');
  const row = (x: (typeof items)[number]) => (
    <li key={x.id} className={`newsl__i newsl__i--${x.level}`}>
      <span className="newsl__h"><TeamMark sport="NFL" abbr={x.team} size="sm" /><b>{x.headline}</b><span className="newsl__lv">{LEVEL_WORD[x.level]}</span></span>
      {x.detail && <span className="newsl__d">{x.detail}</span>}
      <Link to={routes.game('nfl', x.eventId, { tab: x.kind === 'injury' ? 'injuries' : null })} className="newsl__g">{x.game} · {kickoff(x.kickoff)}</Link>
    </li>
  );
  return (
    <div className="page news">
      <header className="hbar">
        <h1 className="hbar__h">News</h1>
        <span className="hbar__m">What changes this week's NFL games — most important first</span>
      </header>
      {(repo.loading || data.loading) && <Skeleton lines={6} />}
      <section className="panel" aria-labelledby="lead-h">
        <PanelHead title="What Changed" sub="Starting quarterbacks, key absences and weather that matters" />
        {lead.length ? <ul className="newsl">{lead.map(row)}</ul> : !data.loading && <p className="muted">No major changes in this week's captures.</p>}
      </section>
      {medium.length > 0 && (
        <section className="panel news__more" aria-labelledby="more-h">
          <Layer summary={`Also worth knowing (${medium.length})`}><ul className="newsl">{medium.map(row)}</ul></Layer>
        </section>
      )}
      {low.length > 0 && (
        <section className="panel news__more" aria-labelledby="all-h">
          <Layer summary={`Routine designations (${low.length})`}><ul className="newsl newsl--quiet">{low.map(row)}</ul></Layer>
        </section>
      )}
      <p className="muted small">Designations: ESPN via the publication (they resolve at the inactive release, 90 minutes before kickoff). Starts: the quarterback with the most dropbacks in each game (nflverse play-by-play). Importance weighs the designation against the player's role on the depth chart and in the projections.</p>
    </div>
  );
}
