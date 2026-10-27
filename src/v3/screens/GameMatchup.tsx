// Game Detail, Matchup tab (locked designs G1 and G3): the direction control, the tug-of-war unit rows, the SIFT Lens (collapsed by
// default, evidence on tap, with its counter-case), game shape, and key matchups. The expanded unit (G2) is GameUnit.tsx and replaces
// this body when `unit` is in the address. State lives in the address (`dir`, `lens`, `unit`): direction and lens change in place
// (history replaced); opening a unit pushes, so Back returns to this list exactly as it was left (scroll included).
//
// Honest by construction: every row is a published league rank from the two team profiles (opponent-adjusted, season-long); a unit
// without published ranks is not a row; the Lens states observed ranks only; game shape is shown only from the approved projection
// authority; prices go through the quote gate and open the addressed contract sheet.
import { canRetry } from '../data/failure';
import { DataState } from '../ui/DataState';
import { useMemo } from 'react';
import { useGameShape, useGatedAsk } from '../data/research/gameHooks';
import { winContracts } from '../data/research/gameMarkets';
import type { KeyMatchup } from '../data/research/keyMatchups';
import { buildLens, HOW_TO_READ, MATCHUP_WINDOW, ordinal, tiltCounts, type MatchupLens } from '../data/research/matchup';
import { lockedReason, isReady } from '../model/capabilities';
import type { V3Team } from '../model/types';
import { NavRow, PlayerLink, PriceTap, StatLink, TeamLink } from '../nav/Targets';
import { routes } from '../nav/routes';
import { gameSchema } from '../nav/schemas';
import { useRouteState } from '../state/url';
import type { MatchupModel } from './GameShared';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { LockedRow } from '../ui/atoms';
import { TiltPill } from '../ui/charts/TiltPill';
import { TugRow } from '../ui/charts/TugRow';
import { meterLabel, UnitMeter } from '../ui/charts/UnitMeter';
import { Avatar, dirParamOf, teamLookup, useMatchupModel, type GameCtx } from './GameShared';
import { UnitView } from './GameUnit';

// ------------------------------------------------------------------------------------------------------------------ the tab

export function MatchupTab({ ctx }: { ctx: GameCtx }) {
  const { g } = ctx;
  const [st, set] = useRouteState(gameSchema);
  const M = useMatchupModel(ctx);
  const team = teamLookup(g);
  if (!isReady(g.slug, 'gameMatchup')) return <section aria-label="Team matchup"><LockedRow title="Matchup">{lockedReason(g.slug, 'gameMatchup')}</LockedRow></section>;
  if (M.demo) return <section aria-label="Team matchup"><LockedRow title="No matchup rows.">Sample data mode has no published team rankings. Open this game with real data to see the league-percentile matchup.</LockedRow></section>;
  if (M.loading || (!M.away && !M.home && ctx.researchLoading)) return <div className="v3-skel mx-skel" role="status" aria-label="Loading matchup" />;
  // A connection failure, a timeout or an unreadable file is "unavailable" with a Retry; profiles that are simply not published keep the locked row below.
  if (!M.rowsAway.length && !M.rowsHome.length && M.failure != null && canRetry(M.failure)) return <section aria-label="Team matchup"><DataState title="Matchup unavailable" err={M.failure} retry={M.retry} alert>The team profiles for this game</DataState></section>;
  if (!M.rowsAway.length && !M.rowsHome.length) {
    return <section aria-label="Team matchup"><LockedRow title="No matchup rows.">{M.away && M.home ? 'The publication carries no opponent-adjusted unit ranks for these two teams.' : 'The team profiles for this game are not published yet, so there is nothing to compare. Nothing is substituted.'}</LockedRow></section>;
  }
  const dir = [g.away.id, g.home.id].find((c) => c.toUpperCase() === (st.dir ?? '').toUpperCase()) ?? g.home.id;
  const rows = dir === g.away.id ? M.rowsAway : M.rowsHome;
  const unitId = st.unit && M.units.some((u) => u.id === st.unit) ? st.unit : null;
  if (unitId) return <UnitView ctx={ctx} model={M} unitId={unitId} dir={dir} />;
  const unitTo = (id: string) => routes.game({ slug: g.slug, eventId: g.eventId }, { tab: 'matchup', dir: dirParamOf(g, dir), unit: id });
  const lens = buildLens(M.rowsAway, M.rowsHome);
  return (
    <section aria-label="Team matchup" className="mx">
      <div className="mx-seg" role="group" aria-label="Matchup direction">
        {([g.away, g.home] as const).map((t) => {
          const rs = t.id === g.away.id ? M.rowsAway : M.rowsHome;
          const o = t.id === g.away.id ? g.home : g.away;
          const c = tiltCounts(rs);
          return (
            <button key={t.id} type="button" className="mx-sg" aria-pressed={dir === t.id} data-dir={t.id} aria-label={meterLabel(t.id, o.id, c)} onClick={() => set({ dir: dirParamOf(g, t.id) })}>
              <span className="mx-s1"><TeamLogo team={t} size={17} />{t.id} offense</span>
              <span className="mx-s2"><TeamLogo team={o} size={17} />vs {o.id} defense</span>
              <UnitMeter rows={rs} counts={c} off={t} def={o} />
            </button>
          );
        })}
      </div>
      <div className="mx-mode"><span className="x-chip x-chip--cy">Opponent-adjusted</span><span className="x-chip">Season</span><span className="x-note mx-mode__n">Right = better</span></div>
      <div className="x-card mx-tugs" data-testid="tug-rows">
        {rows.map((r) => <TugRow key={r.unit.id} row={r} team={team} slug={g.slug} unitTo={unitTo(r.unit.id)} />)}
      </div>
      <LensCard ctx={ctx} lens={lens} open={st.lens} onToggle={() => set({ lens: !st.lens })} team={team} />
      <GameShapeCard ctx={ctx} model={M} />
      <KeyMatchupsCard ctx={ctx} items={M.key} />
      {rows.length < M.units.length && <p className="x-foot mx-foot">{M.units.length - rows.length} of {M.units.length} units have no published rank for both teams and are not shown.</p>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the SIFT Lens

function LensCard({ ctx, lens, open, onToggle, team }: { ctx: GameCtx; lens: MatchupLens; open: boolean; onToggle: () => void; team: (c: string) => V3Team }) {
  const { g } = ctx;
  const wins = useMemo(() => winContracts(ctx.detail?.markets, ctx.detail?.event.away_participant ?? null, ctx.detail?.event.home_participant ?? null), [ctx.detail]);
  const ask = useGatedAsk(g, ctx.detail, ctx.startMs, wins.map((w) => w.ticker));
  // The market line in "How to read it" names the market's favourite, and only when both win prices pass the quote gate.
  const priced = wins.map((w) => ({ w, ask: ask(w.ticker, w.price) })).filter((x): x is { w: typeof wins[number]; ask: number } => x.ask != null);
  const fav = priced.length === wins.length && priced.length === 2 ? [...priced].sort((a, b) => b.ask - a.ask)[0] : null;
  return (
    <div className={`x-card mx-lens${open ? ' is-open' : ''}`} data-testid="sift-lens">
      <button type="button" className="mx-lh" aria-expanded={open} aria-controls="mx-lens-evidence" onClick={onToggle}>
        <Icon name="lens" size={22} /><b>SIFT Lens</b><span className="mx-evb">Evidence <Icon name={open ? 'chevD' : 'chevR'} size={13} /></span>
      </button>
      {lens.observation ? (
        <>
          <p><b>{lens.observation.lead}</b> {lens.observation.text}</p>
          {lens.counter && <p className="mx-cc"><b>{lens.counter.lead}</b> {lens.counter.text}</p>}
        </>
      ) : <p>{lens.allEven ? 'No unit separates beyond Even (15 percentile points or less) in either direction.' : 'There are no published unit ranks to compare.'}</p>}
      {open && (
        <div className="mx-evid" id="mx-lens-evidence">
          {lens.evidence.length > 0 && <div className="mx-evh">Evidence · {lens.evidence.length === 3 ? 'three' : lens.evidence.length === 2 ? 'two' : 'one'} widest {lens.evidence.length === 1 ? 'gap' : 'gaps'}, both directions</div>}
          {lens.evidence.map((e) => (
            <StatLink key={`${e.row.offTeam}-${e.row.unit.id}`} className="mx-evr" stat={{ slug: g.slug, statId: e.side === 'off' ? e.row.unit.off : e.row.unit.def }}
              state={{ win: MATCHUP_WINDOW, sel: e.team, opp: e.side === 'off' ? e.row.defTeam : e.row.offTeam }} label={`${e.phrase}: ${e.detail}. Open the league ranking`}>
              <TiltPill row={e.row} team={team} link={false} /><span className="mx-evr__p">{e.phrase}</span><small>{e.detail}</small>
            </StatLink>
          ))}
          <div className="mx-evm"><b>How to read it.</b> {HOW_TO_READ}{fav && <> The market has {fav.w.team === 'away' ? g.away.name : g.home.name} at <PriceTap ticker={fav.w.ticker} className="mx-inl" label={`${fav.w.team === 'away' ? g.away.name : g.home.name} to win: open contract`}>{fav.ask}¢</PriceTap> to win.</>}</div>
        </div>
      )}
      <div className="mx-evs">Published matchup rows</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ game shape

function GameShapeCard({ ctx, model }: { ctx: GameCtx; model: MatchupModel }) {
  const { g } = ctx;
  const shape = useGameShape(g, ctx.startMs, g.provenance === 'publication');
  const tempo = (code: string) => { const w = (code === g.away.id ? model.away : model.home)?.metrics.get('off_plays_per_drive')?.windows.SEASON; return w && w.value != null ? w : null; };
  const team = teamLookup(g);
  return (
    <div className="x-card mx-sec" data-testid="game-shape">
      <div className="mx-sh"><h2>Game shape</h2><span className="x-chip x-chip--cy">research-only</span></div>
      {shape.state === 'loading' && <div className="v3-skel" style={{ height: 96 }} role="status" aria-label="Loading game shape" />}
      {shape.state === 'none' && <LockedRow title="Not shown.">{shape.reason ?? 'No approved projection is published for this game.'}</LockedRow>}
      {shape.state === 'ok' && (
        <>
          <div className="x-note mx-legend"><i className="mx-lgd mx-lgd--pa" />Pass attempts <i className="mx-lgd mx-lgd--ra" />Rush attempts · projected</div>
          {shape.teams.map((t) => {
            const tot = t.pass + t.rush;
            return (
              <div key={t.team} className="mx-sr">
                <TeamLink team={{ slug: g.slug, id: t.team }} className="mx-sr__t" label={`${t.team}: team page`}><TeamLogo team={team(t.team)} size={18} />{t.team}</TeamLink>
                <div className="mx-sb" role="img" aria-label={`${t.team} projected ${t.pass.toFixed(1)} pass attempts and ${t.rush.toFixed(1)} rush attempts`}>
                  <i className="mx-sb__pa" style={{ width: `${(100 * t.pass) / tot}%` }}><b>{t.pass.toFixed(1)}</b></i><i className="mx-sb__ra" style={{ width: `${(100 * t.rush) / tot}%` }}><b>{t.rush.toFixed(1)}</b></i>
                </div>
              </div>
            );
          })}
        </>
      )}
      {(tempo(g.away.id) || tempo(g.home.id)) && (
        <div className="mx-tp">
          <span>Plays per drive</span>
          {[g.away, g.home].map((t) => {
            const w = tempo(t.id);
            return w ? (
              <StatLink key={t.id} stat={{ slug: g.slug, statId: 'off_plays_per_drive' }} state={{ win: 'SEASON', sel: t.id, opp: t.id === g.away.id ? g.home.id : g.away.id }} className="mx-tp__c" label={`${t.id} plays per drive${w.rank ? `, ${ordinal(w.rank)}` : ''}: league ranking`}>
                <TeamLogo team={t} size={14} /><b>{w.value!.toFixed(1)}</b>{w.rank != null && <small>{ordinal(w.rank)}</small>}
              </StatLink>
            ) : <span key={t.id} />;
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ key matchups

function KeyMatchupsCard({ ctx, items }: { ctx: GameCtx; items: KeyMatchup[] }) {
  const { g } = ctx;
  const ask = useGatedAsk(g, ctx.detail, ctx.startMs, items.map((k) => k.price.ticker));
  return (
    <div className="x-card mx-sec" data-testid="key-matchups">
      <div className="mx-sh"><h2>Key matchups</h2><span className="x-note">player ↔ opposing unit</span></div>
      {items.length === 0 && <LockedRow title="No key matchups.">{ctx.detail ? 'No listed player prop maps to a unit with published ranks for this game.' : 'Player props are loading or not listed for this game.'}</LockedRow>}
      {items.map((k) => {
        const a = ask(k.price.ticker, k.price);
        return (
          <NavRow key={k.playerId} to={routes.player({ slug: g.slug, id: k.playerId }, { stat: k.stat, line: k.line })} kind="player" label={`${k.name}: player research`} className="mx-km">
            <div className="mx-km__in">
              <PlayerLink player={{ slug: g.slug, id: k.playerId }} state={{ stat: k.stat, line: k.line }} className="mx-av" label={`${k.name}: player research`}><Avatar k={k} g={g} /></PlayerLink>
              <div className="mx-kt">
                <b>{k.name}</b>
                <span>{k.role ? `${k.role} · ` : ''}{k.team} → {k.oppTeam} {k.unit.id === 'rush' ? 'run' : 'pass'} defense</span>
                <StatLink stat={{ slug: g.slug, statId: k.unit.def }} state={{ win: MATCHUP_WINDOW, sel: k.oppTeam, opp: k.team }} className="mx-kt__f" label={`${k.oppTeam} defense ${k.unit.unit}, ${ordinal(k.oppSide.rank)} of ${k.oppSide.n}: league ranking`}>
                  {ordinal(k.oppSide.rank)} of {k.oppSide.n} · {k.unit.unit.replace('EPA per ', 'EPA/')}
                </StatLink>
              </div>
              <PriceTap ticker={k.price.ticker} className="mx-kp" label={`${k.name} ${k.label}: open contract`}><b className="num">{a != null ? `${a}¢` : '—'}</b><span>{k.label}</span></PriceTap>
              <Icon name="chevR" size={16} />
            </div>
          </NavRow>
        );
      })}
    </div>
  );
}

