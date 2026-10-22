// v4 Home: the lit stage (league selector, date strip, Following / All / Live / Signals), the featured game, then the
// slate by lifecycle. Everything is read from the published boards through the app's own data layer.
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from '../routing';
import { NAV_SPORTS } from '../data/nav';
import { SportMark } from '../components/SportMark';
import { featuredGame } from '../views/broadcast/games';
import { useGameResearch } from '../views/broadcast/parts';
import { Icon } from './Icon';
import { Feature, useStageColours } from './Feature';
import { Group, SlateStates, useSlate, useSlateScores } from './slate';
import { FollowSheet } from './FollowSheet';
import { EarlyAccessCard, EarlyAccessPill } from './EarlyAccess';
import { FeedNote } from './LiveScoresControl';
import { useSheet } from './sheet';
import { useFollowing } from './follow';
import { applyFilter, dateKey, dayStrip, groupByPhase, isLiveGame, isOver, pickFeature, type SlateFilter } from './model';

const LEAGUES = NAV_SPORTS.filter((s) => s.status === 'live' || s.status === 'beta');
const FILTERS: SlateFilter[] = ['following', 'all', 'live', 'signals'];

export function V4Home() {
  const { now, rows, loading, unavailable, failed } = useSlate();
  const [sp, setSp] = useSearchParams();
  const follow = useFollowing();
  const sheet = useSheet();
  const today = dateKey(now);
  const day = sp.get('date') ?? today;
  const league = sp.get('sport');
  const filter = (FILTERS.includes(sp.get('f') as SlateFilter) ? sp.get('f') : 'all') as SlateFilter;
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const inDay = useMemo(() => rows.filter((g) => Number.isFinite(g.startMs) && dateKey(g.startMs) === day), [rows, day]);
  const scores = useSlateScores(inDay);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const g of inDay) m.set(g.slug, (m.get(g.slug) ?? 0) + 1); return m; }, [inDay]);
  const inLeague = useMemo(() => (league ? inDay.filter((g) => g.slug === league) : inDay), [inDay, league]);
  const shown = useMemo(() => applyFilter(inLeague, filter, follow.list, scores), [inLeague, filter, follow.list, scores]);
  const liveN = inLeague.filter((g) => isLiveGame(g, scores(g))).length;
  const sigN = inLeague.filter((g) => g.candidates > 0).length;
  const folN = applyFilter(inLeague, 'following', follow.list, scores).length;

  // The featured game stays put while the page is open unless it can no longer be featured.
  const rule = useMemo(() => featuredGame(shown, now), [shown, now]);
  const feature = useMemo(() => pickFeature(shown, rule, scores), [shown, rule, scores]);
  const featureRead = feature ? scores(feature) : null;
  const featureLive = feature ? isLiveGame(feature, featureRead) : false;
  const groups = useMemo(() => groupByPhase(shown.filter((g) => g !== feature), scores), [shown, feature, scores]);
  const featureResearch = useGameResearch(feature?.slug ?? null, feature?.item.event_id ?? null);
  const stage = useStageColours(feature, featureResearch.data);

  const days = useMemo(() => dayStrip(now), [now]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2;
  }, [day]);

  const empty = !loading && !unavailable && shown.length === 0;
  const dayWord = day === today ? 'today' : days.find((d) => d.key === day)?.label ?? day;
  const emptyText = filter === 'following'
    ? (follow.list.length ? `None of the teams you follow play ${dayWord}.` : 'You are not following any teams yet. Tap the bookmark above to add some.')
    : filter === 'live' ? 'No game is in play right now.'
    : filter === 'signals' ? `No published research signals on ${dayWord}'s games.`
    : `No published games ${day === today ? 'today' : `on ${dayWord}`}${league ? ' in this league' : ''}.`;
  const featureTitle = !feature ? '' : featureLive ? (featureRead?.game && featureRead.view.mode !== 'LIVE' ? 'In play' : 'Live now') : isOver(feature, featureRead) ? 'Final' : 'Up next';

  return (
    <div>
      <div className="v4-stage" style={stage}>
        <header className="v4-top">
          <span className="v4-wordmark" aria-label="SIFT">SIFT</span>
          <EarlyAccessPill />
          <span className="v4-spacer" />
          <button type="button" className={`v4-gbtn${follow.list.length ? ' v4-gbtn--on' : ''}`} aria-label={`Following, ${follow.list.length} team${follow.list.length === 1 ? '' : 's'}. Manage`} onClick={() => sheet.open(<FollowSheet day={day} />, { label: 'Following' })}>
            <Icon name="bookmark-simple" filled={follow.list.length > 0} />
          </button>
        </header>

        <div className="v4-leagues" role="group" aria-label="League">
          <button type="button" className="v4-league" aria-pressed={!league} onClick={() => set('sport', null)}>
            <span className="v4-league__disc"><Icon name="squares-four" /><span className="v4-league__n" aria-hidden="true">{inDay.length}</span></span>All
          </button>
          {LEAGUES.map((s) => {
            const n = counts.get(s.slug) ?? 0;
            return (
              <button key={s.slug} type="button" className={`v4-league${n ? '' : ' v4-league--dim'}`} aria-pressed={league === s.slug} aria-label={`${s.label}, ${n} game${n === 1 ? '' : 's'}`} onClick={() => set('sport', league === s.slug ? null : s.slug)}>
                <span className="v4-league__disc"><SportMark slug={s.slug} icon={s.icon} size={30} />{n > 0 && <span className="v4-league__n" aria-hidden="true">{n}</span>}</span>{s.label}
              </button>
            );
          })}
        </div>

        <div className="v4-days" role="group" aria-label="Date" ref={strip}>
          {days.map((d) => (
            <button key={d.key} type="button" className={`v4-day${d.today ? ' v4-day--today' : ''}`} aria-pressed={d.key === day} aria-label={`${d.weekday === 'Today' ? 'Today, ' : ''}${d.label}`} onClick={() => set('date', d.today ? null : d.key)}>
              {d.weekday}<b>{d.label}</b>
            </button>
          ))}
        </div>

        <div className="v4-chips" role="group" aria-label="Show">
          {([['following', 'Following', folN], ['all', 'All games', inLeague.length], ['live', 'Live', liveN], ['signals', 'Signals', sigN]] as [SlateFilter, string, number][]).map(([k, label, n]) => (
            <button key={k} type="button" className="v4-chip" aria-pressed={filter === k} onClick={() => set('f', k === 'all' ? null : k)}>{label} <i>{n}</i></button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        <EarlyAccessCard />
      </div>
      <FeedNote />
      <div style={{ paddingTop: 8 }} aria-live="polite">
        <SlateStates loading={loading} unavailable={unavailable} failed={failed} empty={empty} emptyText={emptyText} />
        {!loading && !unavailable && feature && (
          <section className="v4-sec" aria-label={featureTitle}>
            <header className="v4-sechead"><h2>{featureTitle === 'Live now' && <i className="v4-livedot" aria-hidden="true" />}{featureTitle}</h2></header>
            <Feature key={`${feature.slug}:${feature.item.event_id}`} g={feature} read={featureRead} />
          </section>
        )}
        {!loading && !unavailable && (
          <>
            <Group title="Also live" rows={groups.live} live scores={scores} />
            <Group title="Upcoming" rows={groups.upcoming} scores={scores} />
            <Group title="Final" rows={groups.over} scores={scores} />
            <Group title="Postponed, cancelled or suspended" rows={groups.other} scores={scores} />
          </>
        )}
      </div>
    </div>
  );
}
