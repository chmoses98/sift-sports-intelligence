// The NHL slate: one scannable row per game. Team identity first (logo + tricode + nickname), the expected or confirmed
// goalie on each team's own line, the model's win probability beside each team, then the projected total, the most
// likely script and how much research the game carries. Rows stay short so a whole slate reads at a glance.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { timeLabel, until } from '../../lib/format';
import { probText } from '../../lib/nhl';
import { gamePhase, modelFreshness, priceFreshness, scoringEnvironment, SCORING_WORD, slateRead, type SlateRead } from '../../lib/nhlStory';
import { nhlTeam } from '../../lib/nhlTeams';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { sides, useSlateResearch } from '../home/cards';
import { Glyph, SCRIPT_GLYPH } from './glyphs';
import { FreshPill, GoalieInline, PhaseChip, TeamChip } from './kit';

function TeamLine({ abbr, p, fav, goalie }: { abbr: string | null | undefined; p: number | null; fav: boolean; goalie: SlateRead['goalies'][number] | undefined; }) {
  const t = nhlTeam(abbr);
  return (
    <span className={`nsl__team${fav ? ' is-fav' : ''}`}>
      <TeamChip abbr={abbr} size="md" />
      <span className="nsl__nick">{t?.name ?? ''}</span>
      <span className="nsl__g"><GoalieInline g={goalie} /></span>
      <span className="nsl__p num" aria-label={p != null ? `model win probability ${probText(p)}` : undefined}>{p != null ? probText(p) : ''}</span>
    </span>
  );
}

export function SlateRow({ item, r, slug, now }: { item: BoardItem; r: EventResearchDoc | null | undefined; slug: string; now: number }) {
  const { away, home } = sides(item);
  const read = slateRead(r ?? null);
  const ph = gamePhase({ status: item.status, start_time_utc: item.start_time_utc, extensions: (r?.event?.extensions ?? null) as Record<string, unknown> | null }, now);
  const s = read.scripts;
  const p = read.projection;
  const top = s?.scripts[0];
  const pHome = p?.pHome ?? null;
  const gAway = read.goalies.find((g) => g.side === 'away');
  const gHome = read.goalies.find((g) => g.side === 'home');
  const scoring = scoringEnvironment(p);
  const mFresh = modelFreshness(s?.generatedAt ?? null, ph.phase, now);
  const pFresh = priceFreshness(item.market_captured_at, now);
  const unconfirmed = read.goalies.length > 0 && read.goalies.some((g) => g.status !== 'CONFIRMED');
  const label = `${away?.display_name} at ${home?.display_name}, ${timeLabel(item.start_time_utc)}${ph.phase !== 'UPCOMING' ? `, ${ph.word}` : ''}`;
  return (
    <li className={`nsl nsl--${ph.phase.toLowerCase()}`}>
      <Link to={routes.game(slug, item.event_id)} className="nsl__a" aria-label={label}>
        <span className="nsl__when">
          <span className="nsl__time num">{timeLabel(item.start_time_utc)}</span>
          {ph.phase === 'UPCOMING' ? <span className="nsl__until">{until(item.start_time_utc, now)}</span> : <PhaseChip phase={ph.phase} score={ph.score} home={home?.short_name ?? undefined} away={away?.short_name ?? undefined} />}
        </span>
        <span className="nsl__teams">
          <TeamLine abbr={away?.short_name} p={pHome == null ? null : 1 - pHome} fav={pHome != null && pHome < 0.5} goalie={gAway} />
          <TeamLine abbr={home?.short_name} p={pHome} fav={pHome != null && pHome >= 0.5} goalie={gHome} />
        </span>
        <span className="nsl__read">
          {r === undefined ? <span className="nsl__muted">Reading research…</span> : !r ? <span className="nsl__muted">No research published for this game</span> : (
            <>
              {p?.total != null && (
                <span className="nsl__k"><Glyph name="total" size={14} /><span><b className="num">{p.total.toFixed(1)}</b> goals{scoring ? <small>{SCORING_WORD[scoring].replace(' scoring', '')}</small> : null}</span></span>
              )}
              {top ? (
                <span className="nsl__k nsl__k--script"><Glyph name={SCRIPT_GLYPH[top.id] ?? 'puck'} size={14} /><span>{top.short} <b className="num">{probText(top.probability)}</b><small>most likely script</small></span></span>
              ) : (
                <span className="nsl__k nsl__muted" title={read.reason ?? undefined}><Glyph name="alert" size={14} /><span>{read.status === 'NOT_SIMULATED' ? (ph.phase === 'UPCOMING' ? 'Not simulated yet' : 'No pregame scripts published') : 'Scripts unavailable'}</span></span>
              )}
              {s && (
                <span className="nsl__k"><Glyph name="chances" size={14} /><span>{read.candidates.total ? <><b className="num">{read.candidates.robust + read.candidates.moderate}</b> robust or moderate</> : 'No candidate'}<small>{read.candidates.total} research idea{read.candidates.total === 1 ? '' : 's'}</small></span></span>
              )}
            </>
          )}
        </span>
        <span className="nsl__meta">
          {unconfirmed && ph.phase === 'UPCOMING' && <span className="nsl__warn"><Glyph name="mask" size={13} />Goalie unconfirmed</span>}
          {s?.frozen && <span className="nsl__muted">Pregame research frozen</span>}
          {s && ph.phase === 'UPCOMING' && mFresh !== 'CURRENT' && <FreshPill label="Model" state={mFresh} at={s.generatedAt} now={now} />}
          {ph.phase === 'UPCOMING' && item.markets_available > 0 && pFresh !== 'CURRENT' && <FreshPill label="Prices" state={pFresh} at={item.market_captured_at} now={now} />}
          {ph.phase === 'UPCOMING' && item.markets_available === 0 && <span className="nsl__muted">No Kalshi markets yet</span>}
        </span>
        <Icon name="chevronRight" size={18} className="nsl__go" />
      </Link>
    </li>
  );
}

/** The NHL schedule day of a game: the league's own (Eastern) calendar date, so a late West-coast puck drop stays on
 * the slate it belongs to whatever the reader's time zone. */
export function slateDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

/** Games grouped by puck-drop day, earliest first; finals of the day stay listed for review. */
export function SlateList({ items, research, slug, now, loading }: { items: BoardItem[]; research: Map<string, EventResearchDoc> | null; slug: string; now: number; loading: boolean }) {
  const days = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const i of [...items].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc) || a.event_id.localeCompare(b.event_id))) {
      const k = slateDay(i.start_time_utc);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()];
  }, [items]);
  if (!items.length) {
    return (
      <div className="nempty" role="note">
        <Glyph name="puck" size={28} />
        <p><b>No NHL games on this slate.</b> The publication lists no scheduled, live or recently finished game. New games appear when the NHL model reads the next schedule.</p>
      </div>
    );
  }
  return (
    <div className="nslate">
      {days.map(([day, games]) => (
        <section key={day} className="nslate__day" aria-label={`${day}: ${games.length} game${games.length === 1 ? '' : 's'}`}>
          {days.length > 1 && <h3 className="nslate__h">{day} <span>{games.length} game{games.length === 1 ? '' : 's'}</span></h3>}
          <ol className="nslate__list">
            {games.map((i) => <SlateRow key={i.event_id} item={i} r={research?.get(i.event_id) ?? (loading ? undefined : null)} slug={slug} now={now} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Board items worth listing: scheduled and live games, plus the current slate's finals (for review). */
export function slateItems(items: BoardItem[], now: number): BoardItem[] {
  return items.filter((i) => {
    const st = String(i.status).toUpperCase();
    if (st === 'POSTPONED' || st === 'CANCELLED') return false;
    if (st === 'FINAL') return Date.parse(i.start_time_utc) > now - 30 * 3600e3;
    return true;
  });
}

/** `#/nhl/slate`: every game on the board, grouped by day. */
export function NhlSlateView() {
  const { sport, repo, slug } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(`${sport.label} slate`, 'sport');
  const now = useNow(30_000);
  const items = useMemo(() => slateItems(board.data?.items ?? [], now), [board.data, now]);
  const research = useSlateResearch(repo, sport.code, items);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="NHL board" /></div>;
  return (
    <div className="page nhx">
      <header className="nhx__head">
        <div className="nhx__title"><h1 className="nhx__h">NHL slate</h1><span className="nhx__sub">{items.length} game{items.length === 1 ? '' : 's'}</span></div>
      </header>
      <SlateList items={items} research={research.data ?? null} slug={slug} now={now} loading={research.loading} />
    </div>
  );
}
