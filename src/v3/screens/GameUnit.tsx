// The expanded unit (locked G2): one unit in depth. Opens from a unit row (`unit=` in the address, history pushed), so Back returns to the
// Matchup list with its direction, Lens state and scroll exactly as they were. It shows the tug row (open), the two league strips fed
// by the published rankings (fetched only now, because a statistic is being opened), the raw counterpart's windows (never mixed with the
// adjusted rank), related statistics, and where the unit shows up in the game's markets.
import { useMemo } from 'react';
import { useGatedAsk } from '../data/research/gameHooks';
import { teamTotalFor } from '../data/research/gameMarkets';
import { useMetricDefs, useRankingDoc } from '../data/research/hooks';
import { fmtRawValue, MATCHUP_WINDOW, ordinal } from '../data/research/matchup';
import { counterpartOf, deriveRelated, isAdjustedId } from '../data/research/relations';
import { routes } from '../nav/routes';
import { NavRow, PlayerLink, PriceTap, StatLink } from '../nav/Targets';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { LockedRow } from '../ui/atoms';
import { LeagueStrip } from '../ui/charts/LeagueStrip';
import { TugRow } from '../ui/charts/TugRow';
import { Avatar, teamLookup, type GameCtx, type MatchupModel } from './GameShared';

function Strip({ slug, statId, code, opp, role, rankingId, rank, n, team }: {
  slug: string; statId: string; code: string; opp: string; role: 'off' | 'def'; rankingId: string | null; rank: number; n: number; team: import('../model/types').V3Team;
}) {
  const rk = useRankingDoc(slug, rankingId);
  const word = role === 'off' ? 'offense' : 'defense';
  return (
    <StatLink stat={{ slug, statId }} state={{ win: MATCHUP_WINDOW, sel: code, opp }} className="mx-sl" label={`${code} ${word}, ${ordinal(rank)} of ${n}: league ranking`}>
      <div className="mx-slh"><span><TeamLogo team={team} size={16} />{code} {word} · league</span><b>{ordinal(rank)} of {n}</b></div>
      {rk.ranking ? <LeagueStrip entries={rk.ranking.entries} higherIsBetter={rk.ranking.higherIsBetter} mean={rk.ranking.summary.mean} selected={code} role={role} team={team} label={`${code} ${word} among the ${rk.ranking.n} teams in the ranking`} />
        : rk.loading ? <div className="mx-strip mx-strip--skel v3-skel" role="status" aria-label="Loading league ranking" /> : <div className="x-note mx-strip__none">The league distribution is not available right now; the rank above is the publication’s.</div>}
    </StatLink>
  );
}

export function UnitView({ ctx, model, unitId, dir }: { ctx: GameCtx; model: MatchupModel; unitId: string; dir: string }) {
  const { g } = ctx;
  const team = teamLookup(g);
  const unit = model.units.find((u) => u.id === unitId)!;
  const rows = dir === g.away.id ? model.rowsAway : model.rowsHome;
  const row = rows.find((r) => r.unit.id === unitId);
  const defs = useMetricDefs(g.slug);
  const offPid = dir === g.away.id ? ctx.detail?.event.away_participant ?? null : ctx.detail?.event.home_participant ?? null;
  const total = useMemo(() => teamTotalFor(ctx.detail?.markets, offPid), [ctx.detail, offPid]);
  const players = useMemo(() => model.allKey.filter((k) => k.unit.id === unitId).slice(0, 2), [model.allKey, unitId]);
  const ask = useGatedAsk(g, ctx.detail, ctx.startMs, [...(total ? [total.price.ticker] : []), ...players.map((k) => k.price.ticker)]);
  if (!row) return <section aria-label={unit.title}><LockedRow title="No matchup rows.">The publication has no opponent-adjusted {unit.title.toLowerCase()} ranks for both teams, so this unit cannot be shown. Nothing is substituted.</LockedRow></section>;
  const offProfile = dir === g.away.id ? model.away : model.home, defProfile = dir === g.away.id ? model.home : model.away;
  const raw = (id: string, who: string) => {
    const c = counterpartOf(g.slug, id);
    const m = c ? (who === row.offTeam ? offProfile : defProfile)?.metrics.get(c.id) : null;
    return c && m ? { id: c.id, m } : null;
  };
  const rawOff = raw(unit.off, row.offTeam), rawDef = raw(unit.def, row.defTeam);
  const related = defs.data ? deriveRelated(g.slug, unit.off, defs.data, 4) : [];
  const nameOf = (id: string) => [...(defs.data?.values() ?? [])].find((d) => d.metric_id.endsWith(`.${id}`))?.name ?? id.replace(/_/g, ' ');
  const gameTo = routes.game({ slug: g.slug, eventId: g.eventId });
  return (
    <section aria-label={`${unit.title} matchup`} className="mx" data-testid="unit-view">
      <div className="x-card mx-sec mx-sec--unit">
        <div className="mx-sh"><h2>{unit.title}</h2><span className="x-note">{unit.unit} · opponent-adjusted</span></div>
        <TugRow row={row} team={team} slug={g.slug} open />
        <Strip slug={g.slug} statId={unit.off} code={row.offTeam} opp={row.defTeam} role="off" rankingId={row.o.rankingId} rank={row.o.rank} n={row.o.n} team={team(row.offTeam)} />
        <Strip slug={g.slug} statId={unit.def} code={row.defTeam} opp={row.offTeam} role="def" rankingId={row.d.rankingId} rank={row.d.rank} n={row.d.n} team={team(row.defTeam)} />
      </div>

      <div className="x-card mx-sec" data-testid="unit-form">
        <div className="mx-sh"><h2>Recent form</h2><span className="x-note">raw, not opponent-adjusted</span></div>
        {rawOff || rawDef ? (
          <div className="mx-tw">
            {[{ side: rawOff, code: row.offTeam, word: 'offense', role: 'off' as const }, { side: rawDef, code: row.defTeam, word: 'defense', role: 'def' as const }].map((c) => (
              <div key={c.role}>
                <div className="mx-slh"><span><TeamLogo team={team(c.code)} size={16} />{c.code} {c.word}</span></div>
                {c.side ? (['SEASON', 'L6'] as const).map((w) => {
                  const o = c.side!.m.windows[w];
                  return o && o.value != null ? (
                    <StatLink key={w} stat={{ slug: g.slug, statId: c.side!.id }} state={{ win: w, sel: c.code, opp: c.code === row.offTeam ? row.defTeam : row.offTeam }} className="mx-fm" label={`${c.code} ${c.word} ${nameOf(c.side!.id)}, ${w === 'L6' ? 'last 6 games' : 'season'}: league ranking`}>
                      <span>{w === 'L6' ? 'Last 6' : 'Season'}</span><b>{fmtRawValue(unit, o.value)}</b>{o.rank != null && <small>{ordinal(o.rank)}</small>}
                    </StatLink>
                  ) : null;
                }) : <span className="x-note">Not published.</span>}
              </div>
            ))}
          </div>
        ) : <LockedRow title="Recent form is not published for this unit.">No raw counterpart statistic is published for these teams.</LockedRow>}
        <LockedRow title="Weekly trend is locked.">No per-game series is published for this statistic, so only the season and last-6 windows are shown. See the backend backlog.</LockedRow>
      </div>

      {related.length > 0 && (
        <div className="mx-rel"><span className="x-eyebrow">Related</span>
          <div className="mx-chs">
            {related.map((r) => <StatLink key={r.id} stat={{ slug: g.slug, statId: r.id }} state={{ win: isAdjustedId(r.id) ? MATCHUP_WINDOW : 'SEASON', sel: row.offTeam, opp: row.defTeam }} className="x-chip mx-chip" label={`${nameOf(r.id)}: league ranking`}>{nameOf(r.id)}</StatLink>)}
            <StatLink stat={{ slug: g.slug, statId: unit.off }} state={{ win: MATCHUP_WINDOW, sel: row.offTeam, opp: row.defTeam }} className="x-chip mx-chip" label={`Open the full ${unit.title} ranking`}>Open full ranking <Icon name="chevR" size={12} /></StatLink>
          </div>
        </div>
      )}

      {(total || players.length > 0) && (
        <div className="x-card mx-sec" data-testid="unit-markets">
          <div className="mx-sh"><h2>Where this shows up</h2></div>
          {total && (() => { const a = ask(total.ticker, total.price); return (
            <NavRow to={gameTo} kind="game" label={`${row.offTeam} team total: open the game`} className="mx-mr">
              <div className="mx-mr__in"><span>{row.offTeam} team total over {total.line}<small>Market</small></span><PriceTap ticker={total.ticker} className="mx-mr__p" label={`${row.offTeam} team total over ${total.line}: open contract`}><b className="num">{a != null ? `${a}¢` : '—'}</b></PriceTap><Icon name="chevR" size={16} /></div>
            </NavRow>); })()}
          {players.map((k) => { const a = ask(k.price.ticker, k.price); return (
            <NavRow key={k.playerId} to={routes.player({ slug: g.slug, id: k.playerId }, { stat: k.stat, line: k.line })} kind="player" label={`${k.name}: player research`} className="mx-mr">
              <div className="mx-mr__in"><span className="mx-mr__who"><PlayerLink player={{ slug: g.slug, id: k.playerId }} state={{ stat: k.stat, line: k.line }} className="mx-av mx-av--s" label={`${k.name}: player research`}><Avatar k={k} g={g} /></PlayerLink><span>{k.name} {k.phrase}<small>Props · research</small></span></span><PriceTap ticker={k.price.ticker} className="mx-mr__p" label={`${k.name} ${k.label}: open contract`}><b className="num">{a != null ? `${a}¢` : '—'}</b></PriceTap><Icon name="chevR" size={16} /></div>
            </NavRow>); })}
        </div>
      )}
    </section>
  );
}
