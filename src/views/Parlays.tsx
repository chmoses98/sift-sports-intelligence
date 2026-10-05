// NFL structures (first pass): Stafford Wong teaser candidates from this week's market-implied spreads.
// Review only — Sift never places bets and Kalshi lists no teaser product, so no combined price or
// modelled value is shown; that needs leg-level pricing and a correlation model (redesign phase 4).
import { Link } from 'react-router';
import type { EventResearchDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Notice, Skeleton, TeamMark } from '../components/ui';
import { routes } from '../lib/routes';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { PanelHead } from './game/panels';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Leg { eventId: string; game: string; team: string; line: number; teased: number; kind: 'favorite' | 'underdog'; total: number | null }

/** Wong teaser legs: a 6-point tease that crosses both 3 and 7 (favourites −7.5…−8.5, underdogs +1.5…+2.5). */
export function wongLegs(docs: EventResearchDoc[]): Leg[] {
  const out: Leg[] = [];
  for (const r of docs) {
    const mi = (r.extensions as any)?.market_implied;
    if (mi?.implied_spread == null) continue;
    const home = r.participants.find((p) => p.home_away === 'HOME');
    const away = r.participants.find((p) => p.home_away === 'AWAY');
    const short = (pid?: string) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
    const hs = Math.round(Number(mi.implied_spread) * 2) / 2; // home line, negative = home favoured
    const game = `${short(away?.participant_id)} @ ${short(home?.participant_id)}`;
    const total = mi.implied_total_median != null ? Number(mi.implied_total_median) : null;
    for (const [team, line] of [[short(home?.participant_id), hs], [short(away?.participant_id), -hs]] as [string, number][]) {
      if (line <= -7.5 && line >= -8.5) out.push({ eventId: r.event.event_id, game, team, line, teased: line + 6, kind: 'favorite', total });
      if (line >= 1.5 && line <= 2.5) out.push({ eventId: r.event.event_id, game, team, line, teased: line + 6, kind: 'underdog', total });
    }
  }
  return out;
}

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : 'PK');

export function ParlaysView() {
  const { sport, repo, slug } = useSport();
  useVisit('Parlays', 'parlays');
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  const up = (board.data?.items ?? []).filter((i) => i.status === 'SCHEDULED');
  const key = up.map((i) => i.event_id).join(',');
  const docs = useAsync(key ? `slateResearch:${sport.code}:${key}` : null, async () => {
    const out = await Promise.allSettled(up.map((i) => repo.eventResearch(i.event_id)));
    const m = new Map<string, EventResearchDoc>();
    out.forEach((o, k) => o.status === 'fulfilled' && m.set(up[k].event_id, o.value));
    return m;
  });
  const legs = docs.data ? wongLegs([...docs.data.values()]) : [];
  return (
    <div className="page parlays">
      <header className="shead">
        <div className="shead__t">
          <div className="eyebrow">{sport.label} · Structures</div>
          <h1 className="h-display shead__h">Parlays & Teasers</h1>
          <div className="shead__comp">Ready-to-review structures from this week's lines. Review only — Sift never places bets.</div>
        </div>
      </header>
      <section className="panel" aria-labelledby="wong-h">
        <PanelHead title="Stafford Wong Teaser Legs" sub="6-point teasers that cross both 3 and 7: favorites −7.5 to −8.5, underdogs +1.5 to +2.5 (market-implied line)" />
        {(board.loading || docs.loading) && <Skeleton lines={4} />}
        {docs.data && !legs.length && <p className="muted">No game this week sits in the Wong window on the market-implied line.</p>}
        {legs.length > 0 && (
          <div className="tscroll"><table className="mtab">
            <thead><tr><th scope="col">Leg</th><th scope="col">Game</th><th scope="col" className="r">Line</th><th scope="col" className="r">Teased</th><th scope="col" className="r">Total</th><th scope="col">Why it qualifies</th></tr></thead>
            <tbody>
              {legs.map((l) => (
                <tr key={`${l.eventId}${l.team}`}>
                  <th scope="row"><span className="row"><TeamMark sport={sport.code} abbr={l.team} size="sm" /> {l.team} {fmt(l.teased)}</span></th>
                  <td><Link to={routes.game(slug, l.eventId)}>{l.game}</Link></td>
                  <td className="r num">{fmt(l.line)}</td>
                  <td className="r num">{fmt(l.teased)}</td>
                  <td className="r num">{l.total != null ? l.total.toFixed(1) : '—'}</td>
                  <td className="small">{l.kind === 'favorite' ? 'Favorite teased through 7 and 3' : 'Underdog teased through 3 and 7'}{l.total != null && l.total > 49 ? ' · high total (weaker for Wong)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Notice title="Correlation and pricing">
          Legs from the same game are correlated and should not be combined. Kalshi lists no teaser contract, so Sift shows no combined price or
          modelled value here — that needs per-leg pricing and a correlation model (next redesign phase).
        </Notice>
      </section>
    </div>
  );
}
