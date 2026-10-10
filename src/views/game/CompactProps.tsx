// The Game Overview's compact Player Prop Explorer (replaces the static "Props to Watch"): category and team
// filters over the game's published prop projections, the four most worth reading for the selection, and a deep
// link into the full Combined Prop Explorer with this game selected. Same cards and numbers as before; nothing new
// is derived.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { propsToWatch, type PropCard } from '../../insights/props';
import { routes } from '../../lib/routes';
import { PropsGrid } from './matters';

type Cat = 'all' | 'passing' | 'rushing' | 'receiving' | 'touchdowns';
const CAT_WORD: Record<Cat, string> = { all: 'All', passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', touchdowns: 'Touchdowns' };

export function propCat(stat: string): Exclude<Cat, 'all'> | null {
  if (/td|touchdown/i.test(stat)) return 'touchdowns';
  if (/pass|completion|attempt|interception/i.test(stat)) return 'passing';
  if (/rush|carr/i.test(stat)) return 'rushing';
  if (/rec|target/i.test(stat)) return 'receiving';
  return null;
}

export function CompactProps({ all, ctx, slug, eventId, propsHref }: { all: PropCard[]; ctx: Parameters<typeof PropsGrid>[0]['ctx']; slug: string; eventId: string; propsHref: string }) {
  const [cat, setCat] = useState<Cat>('all');
  const [team, setTeam] = useState<string | null>(null);
  const teams = useMemo(() => [...new Set(all.map((c) => c.team.abbr))], [all]);
  const cats = useMemo(() => (['passing', 'rushing', 'receiving', 'touchdowns'] as const).filter((k) => all.some((c) => propCat(c.stat) === k)), [all]);
  const filtered = useMemo(() => all.filter((c) => (cat === 'all' || propCat(c.stat) === cat) && (!team || c.team.abbr === team)), [all, cat, team]);
  const cards = useMemo(() => propsToWatch(filtered, 4, cat === 'all' && !team ? 3 : 4), [filtered, cat, team]);
  const priced = all.filter((c) => c.market).length;
  return (
    <section className="gsec cprops" aria-labelledby="g-props-h">
      <div className="gsec__h gsec__h--row">
        <div>
          <h2 id="g-props-h" className="gsec__t">Player Prop Explorer</h2>
          <p className="gsec__sub">Projection, typical range, today’s line and the matchup behind each prop. Filter, then open any player.</p>
        </div>
        <Link to={routes.props(slug, { game: eventId })} className="phead__more">Full prop explorer <Icon name="arrowRight" size={14} /></Link>
      </div>
      <div className="cprops__filters">
        <div className="gtabs2" role="group" aria-label="Prop category">
          <button type="button" className={`gtab${cat === 'all' ? ' is-on' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
          {cats.map((k) => <button key={k} type="button" className={`gtab${cat === k ? ' is-on' : ''}`} aria-pressed={cat === k} onClick={() => setCat(k)}>{CAT_WORD[k]}</button>)}
        </div>
        <div className="gtabs2" role="group" aria-label="Team">
          <button type="button" className={`gtab${!team ? ' is-on' : ''}`} aria-pressed={!team} onClick={() => setTeam(null)}>Both</button>
          {teams.map((t) => <button key={t} type="button" className={`gtab${team === t ? ' is-on' : ''}`} aria-pressed={team === t} onClick={() => setTeam(team === t ? null : t)}><TeamMark sport="NFL" abbr={t} size="sm" />{t}</button>)}
        </div>
      </div>
      {cards.length ? <PropsGrid cards={cards} ctx={ctx} /> : <p className="muted">No published projection in this filter.</p>}
      <p className="gsec__more"><Link to={propsHref}>All {priced} priced player props on this game →</Link></p>
    </section>
  );
}
