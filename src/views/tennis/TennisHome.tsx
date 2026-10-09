// The Tennis home: tournaments first (tour and level filters, then one tap per tournament), every match as a row of
// two players with the model's chance where the publication produced one, the market count, and the honest model
// status: every tennis model number is RESEARCH_ONLY and the Kalshi mid has beaten the model on settled rows.
// Tennis is an individual sport: no home or away side, and a match's start time is often a day placeholder.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { dayLabel, timeLabel } from '../../lib/format';
import { routes } from '../../lib/routes';
import { boardPlayers, LEVEL_WORD, readTennis, SURFACE_WORD, TIER_WORD, tournamentOf, tournamentTier } from '../../lib/tennis';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { useVisibleOnce } from '../shared/useVisible';
import { Pill, Section, SportHeader } from '../shared/kit';
import { SportOpportunities } from '../home/SportOpportunities';

function MatchRow({ item, slug, now, showTournament }: { item: BoardItem; slug: string; now: number; showTournament: boolean }) {
  const { repo } = useSport();
  const [ref, seen] = useVisibleOnce<HTMLLIElement>();
  const research = useAsync(seen ? `er:TENNIS:${item.event_id}` : null, () => repo.eventResearch(item.event_id));
  const t = research.data ? readTennis(research.data) : null;
  const [a0, b0] = boardPlayers(item);
  const a = t?.a.name ?? a0;
  const b = t?.b.name ?? b0;
  const pA = t?.model.fairV1 ?? null;
  const placeholder = t?.start.nominalIsPlaceholder ?? false;
  const start = t?.start.expected ?? item.start_time_utc;
  const startWord = t?.start.status === 'VERIFIED_UPCOMING' ? 'verified' : t?.start.status === 'START_UNKNOWN' ? 'unverified' : null;
  const started = Date.parse(start) <= now && t?.start.status !== 'VERIFIED_UPCOMING';
  return (
    <li ref={ref}>
      <Link to={routes.game(slug, item.event_id)} className="skrow" aria-label={`${a} v ${b}, ${tournamentOf(item)}`}>
        <span className="skrow__when">
          <span className="skrow__time num">{placeholder && !t?.start.expected ? 'Day' : timeLabel(start)}</span>
          <span className="skrow__until">{startWord ?? (started ? 'Listed start passed' : dayLabel(start))}</span>
        </span>
        <span className="skrow__teams">
          <span className="skrow__team"><span className="skrow__name">{a}{showTournament && <small>{tournamentOf(item)}</small>}</span>{pA != null && <span className={`skrow__p num${pA >= 0.5 ? ' is-fav' : ''}`}>{Math.round(pA * 100)}%</span>}</span>
          <span className="skrow__team"><span className="skrow__name">{b}</span>{pA != null && <span className={`skrow__p num${pA < 0.5 ? ' is-fav' : ''}`}>{Math.round((1 - pA) * 100)}%</span>}</span>
        </span>
        <span className="skrow__read">
          {research.loading && !research.data && <span className="muted">Reading research…</span>}
          {t && (
            <>
              {t.surface && <span>{SURFACE_WORD[t.surface] ?? t.surface}</span>}
              {t.level && <span>{LEVEL_WORD[t.level] ?? t.level.replace(/_/g, ' ')}</span>}
              {t.round && <span>Round <b>{t.round}</b></span>}
              {t.discipline === 'doubles' && <span className="skrow__tag">doubles · no model</span>}
              {t.discipline !== 'doubles' && pA == null && <span className="muted">No model probability</span>}
            </>
          )}
          {item.recommendations_count > 0 && <span><b className="num">{item.recommendations_count}</b> research candidate{item.recommendations_count === 1 ? '' : 's'}</span>}
        </span>
        <span className="skrow__meta"><span><b className="num">{item.markets_available}</b> markets{item.markets_priced ? <> · {item.markets_priced} priced</> : null}</span></span>
        <Icon name="chevronRight" size={18} className="skrow__go" />
      </Link>
    </li>
  );
}

export function TennisHomeView() {
  const { sport, repo, slug } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const [sp, setSp] = useSearchParams();
  const tour = sp.get('tour');
  const tier = sp.get('tier');
  const tourney = sp.get('t');
  const items = useMemo(() => (board.data?.items ?? []).filter((i) => i.status !== 'FINAL'), [board.data]);
  const filtered = useMemo(() => items.filter((i) => (!tour || i.league === tour) && (!tier || tournamentTier(tournamentOf(i)) === tier)), [items, tour, tier]);
  const tournaments = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtered) m.set(tournamentOf(i), (m.get(tournamentOf(i)) ?? 0) + 1);
    const rank = (n: string) => ['main', 'challenger', 'itf', 'other'].indexOf(tournamentTier(n));
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [filtered]);
  const shown = useMemo(() => filtered.filter((i) => !tourney || tournamentOf(i) === tourney).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [filtered, tourney]);
  const set = (k: string, v: string | null) => {
    // Functional update: quick successive taps build on each other's params (see views/game/PropsBoard.tsx).
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v); else next.delete(k);
      if (k !== 't') next.delete('t');
      return next;
    }, { replace: true });
  };
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="Tennis board" /></div>;
  const health = repo.source.liveHealth;
  const priced = items.reduce((a, b) => a + b.markets_priced, 0);
  const markets = items.reduce((a, b) => a + b.markets_available, 0);
  const byTourney = new Map<string, BoardItem[]>();
  for (const i of shown) byTourney.set(tournamentOf(i), [...(byTourney.get(tournamentOf(i)) ?? []), i]);
  return (
    <div className="page tennis">
      <SportHeader
        title="Tennis"
        sub={<><b>{items.length}</b> matches across <b>{new Set(items.map(tournamentOf)).size}</b> tournaments · <b>{markets}</b> Kalshi markets, <b>{priced}</b> priced by the model · every model number is research only</>}
        status={health ? <><Pill tone={health.overall_status === 'HEALTHY' ? 'ok' : 'research'}>{health.overall_status.replace(/_/g, ' ').toLowerCase()}</Pill><Pill tone="research" title="Kalshi mid Brier 0.1776 vs model 0.2193 on 15,117 settled rows (publication capability notes)">no evidence of edge</Pill></> : null}
      />
      <div className="skchips" role="group" aria-label="Tour and level">
        {[['', 'Both tours'], ['ATP', 'ATP'], ['WTA', 'WTA']].map(([v, l]) => <button key={v} type="button" className={`skchip${(tour ?? '') === v ? ' is-on' : ''}`} onClick={() => set('tour', v || null)}>{l}</button>)}
        <span aria-hidden="true" style={{ width: 8 }} />
        {(['main', 'challenger', 'itf'] as const).map((v) => <button key={v} type="button" className={`skchip${tier === v ? ' is-on' : ''}`} onClick={() => set('tier', tier === v ? null : v)}>{TIER_WORD[v]}</button>)}
      </div>
      <div className="skchips" role="group" aria-label="Tournaments">
        <button type="button" className={`skchip${!tourney ? ' is-on' : ''}`} onClick={() => set('t', null)}>All tournaments <small>{filtered.length}</small></button>
        {tournaments.map(([name, n]) => <button key={name} type="button" className={`skchip${tourney === name ? ' is-on' : ''}`} onClick={() => set('t', name)}>{name} <small>{n}</small></button>)}
      </div>
      <div className="skgrid">
        <Section id="tn-slate" title={tourney ?? 'Matches'} sub="Both players, the model's chance for each where the publication produced one (fair_v1, research only), surface and level once the match research is read. Doubles carry no model by the publication's rule.">
          {shown.length === 0 && <p className="muted">No match on the board for this selection.</p>}
          {[...byTourney.entries()].map(([name, rows]) => (
            <div key={name} className="skday">
              <h3 className="skday__h">{name} <small>{rows[0].league} · {rows.length} match{rows.length === 1 ? '' : 'es'}</small></h3>
              <ul className="sklist">{rows.map((i) => <MatchRow key={i.event_id} item={i} slug={slug} now={now} showTournament={false} />)}</ul>
            </div>
          ))}
        </Section>
        <div className="stack">
          <SportOpportunities now={now} />
          <Section id="tn-status" title="Model status" sub="What the tennis publication says about itself.">
            <dl className="skkv">
              <div><dt>Authority</dt><dd>Every model number is RESEARCH_ONLY. On 15,117 settled rows the Kalshi mid scored a Brier of 0.1776 against the model's 0.2193: no evidence of edge.</dd></div>
              <div><dt>Ratings</dt><dd>Surface-aware Elo plus a structural serve/return model; a rating attaches only on an exact, unique name match in the tour's rating state.</dd></div>
              <div><dt>Doubles</dt><dd>Gen-1 doubles failed its no-skill validation and is suppressed: no model probability is shown for doubles.</dd></div>
              <div><dt>Start times</dt><dd>Verified first-ball status exists for ATP/WTA main tour and Slams only; Challenger, ITF and qualifying list nominal times.</dd></div>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
