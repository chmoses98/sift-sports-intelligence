// THE MATCHUPS TAB (NFL) — readable first, deeper on demand:
//   1. the Adjusted / Raw choice (app-wide), with what each means;
//   2. THE BASICS: box-score numbers per game, both teams, ranked;
//   3. WHERE THIS GAME TILTS: the clear edges and the context behind them (the overview's What Matters, in full);
//   4. UNIT BY UNIT: each offense against the defense it faces, unit by unit, with plain conclusions, then every
//      opponent-adjusted rating pair on one board;
//   5. BUILD A MATCHUP: any unit against any unit;
//   6. SCHEME: both teams' tendencies, then each unusual tendency connected to the player it shapes, his projection,
//      the script that moves his volume, and the market on him (with the publication's own bet status);
//   7. EVERY PUBLISHED METRIC, side by side, in the chosen footing.
import { useMemo } from 'react';
import type { EntityProfileDoc, EventResearchDoc, MetricDef } from '../../contract/types';
import { ModeToggle } from '../../components/statviz';
import { Stratum } from '../../components/ui';
import { useTeamHistory } from '../../history/load';
import { leagueBasics } from '../../insights/basics';
import type { ContextNote } from '../../insights/context';
import type { GameSides } from '../../insights/game';
import type { MatchupInsight } from '../../insights/matchups';
import type { PropCard } from '../../insights/props';
import type { SchemeInsight } from '../../insights/scheme';
import { schemeBoard } from '../../insights/schemeBoard';
import { schemePlayerLinks } from '../../insights/schemePlayers';
import { useSportOpportunities } from '../../opportunity/load';
import { useSport } from '../../state/sport';
import { useStatMode } from '../../state/statMode';
import { basicsSpan, BasicsDuel } from '../stats/Basics';
import { MatchupBuilder } from '../stats/Builder';
import { MatchupBoard, MatchupTable, metricRows } from '../stats/MetricTable';
import { SchemeBoard, SchemePlayers } from '../stats/Scheme';
import { UnitByUnit } from '../stats/UnitByUnit';
import { ContextCard, MatchupCard, SchemeCard, usePropHistories, type GameCtx } from './matters';
import '../../styles/lane-c-views.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

const JUMPS: [string, string][] = [['mx-basics', 'Basics'], ['g-edges', 'Edges'], ['g-matchup', 'Units'], ['mx-build', 'Build'], ['mx-scheme', 'Scheme'], ['mx-all', 'Every metric']];

export function MatchupTab({ r, g, profiles, ctx, insights, context, scheme, props, metrics, now }: {
  r: EventResearchDoc; g: GameSides; profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null }; ctx: GameCtx;
  insights: MatchupInsight[]; context: ContextNote[]; scheme: SchemeInsight[]; props: PropCard[]; metrics: Map<string, MetricDef>; now: number;
}) {
  const { sport, repo, slug } = useSport();
  const [mode] = useStatMode();
  const teamHist = useTeamHistory(sport.code);
  const doc = teamHist.data ?? null;
  const week = g.week;
  const basics = useMemo(() => (doc ? leagueBasics(doc, week) : null), [doc, week]);
  const byAbbr = useMemo(() => ({ [g.home.abbr]: profiles.home, [g.away.abbr]: profiles.away }), [g, profiles]);
  const board = useMemo(() => schemeBoard(doc, byAbbr, [g.away.abbr, g.home.abbr], week), [doc, byAbbr, g, week]);
  // Game logs for the players the scheme links name (their own splits vs the blitz and by box count).
  const linksNoHist = useMemo(() => schemePlayerLinks(r, g, doc, props, profiles), [r, g, doc, props, profiles]);
  const linkPlayers = useMemo(() => linksNoHist.filter((l) => l.player).map((l) => ({ name: l.player!.name, team: l.offense.abbr })), [linksNoHist]);
  const hist = usePropHistories(sport.code, linkPlayers);
  const links = useMemo(() => schemePlayerLinks(r, g, doc, props, profiles, hist).filter((l) => l.score >= 0.25), [r, g, doc, props, profiles, hist]);
  const opps = useSportOpportunities(repo, now);
  const mine = useMemo(() => opps.opportunities.filter((o) => o.eventId === r.event.event_id), [opps.opportunities, r]);
  const rows = useMemo(() => metricRows(r, profiles, mode, metrics), [r, profiles, mode, metrics]);
  const ext = r.extensions as any;
  const homeId = g.home.pid;
  const awayId = g.away.pid;
  const span = basicsSpan(basics?.get(g.home.abbr) ?? basics?.get(g.away.abbr));
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="mx">
      <div className="mx__bar">
        <ModeToggle note={mode === 'adjusted'
          ? <><b>Adjusted</b>: results after accounting for who each team played — the publication's primary footing. A value with no adjusted version says <i>Raw only</i>.</>
          : <><b>Raw</b>: what happened, over the publication's last 34 games. A value with no raw version says <i>Adjusted only</i>. Box-score basics are always raw.</>} />
        <nav className="mx__jump" aria-label="Matchup sections">
          {JUMPS.map(([id, l]) => <button key={id} type="button" className="mx__j" onClick={() => jump(id)}>{l}</button>)}
        </nav>
      </div>

      <Stratum id="mx-basics" title="The basics" sub={`Box-score numbers per game, ranked among all 32 teams (#1 = best for the job). ${span ? `${span} before this game · ` : ''}nflverse play-by-play.`}>
        {teamHist.loading ? <p className="muted small">Loading box scores…</p> : (
          <BasicsDuel basics={basics} left={g.away} right={g.home} foot="Passing yards are net of sack yards. Turnovers are interceptions plus fumbles lost. Third-down and red-zone figures are percentages of attempts, with the counts beside them. Raw results — not adjusted for opponents." />
        )}
      </Stratum>

      {(insights.length > 0 || context.length > 0 || scheme.length > 0) && (
        <Stratum id="g-edges" title="Where this game tilts" sub="Every clear edge, strongest first, with the context that changes how to read it.">
          <div className="mgrid">
            {context.map((c) => <ContextCard key={c.id} note={c} ctx={ctx} />)}
            {insights.map((x) => <MatchupCard key={x.id} ins={x} ctx={ctx} />)}
            {scheme.map((x) => <SchemeCard key={x.id} s={x} ctx={ctx} />)}
          </div>
        </Stratum>
      )}

      <Stratum id="g-matchup" title="Unit by unit" sub="Pick an offense: each football unit against the one it faces, with a plain conclusion, then the numbers behind it.">
        <UnitByUnit r={r} profiles={profiles} g={g} mode={mode} basics={basics} metrics={metrics} slug={slug} />
        <details className="mx__more" open>
          <summary>Every opponent-adjusted rating pair, both directions</summary>
          <MatchupBoard ext={ext} r={r} slug={slug} homeId={homeId} awayId={awayId} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} sportCode={sport.code} />
        </details>
      </Stratum>

      <Stratum id="mx-build" title="Build a matchup" sub="Choose a measure and the sides — an offense against either defense, both offenses or both defenses.">
        <MatchupBuilder r={r} profiles={profiles} g={g} mode={mode} basics={basics} metrics={metrics} slug={slug} />
      </Stratum>

      <Stratum id="mx-scheme" title="Scheme" sub="How each team plays, then the tendencies that bear on a specific player. Charted by FTN (via nflverse), games before this week; pass rate over expected and style from the publication.">
        {board.length ? <SchemeBoard rows={board} teams={[g.away, g.home]} caption="Tendencies are ranked highest-first and have no better direction; only “EPA per dropback vs the blitz” is ranked best-first. Man/zone coverage shells are not published for 2026." /> : <p className="muted small">No scheme tendencies are published for these teams yet.</p>}
        <h3 className="mx__h3">Scheme meets players</h3>
        <p className="mx__lead">Each unusual tendency, the player it shapes, his projection, the game script that moves his volume, and the market — labelled for what each step is.</p>
        <SchemePlayers links={links} slug={slug} eventId={r.event.event_id} opps={mine} />
      </Stratum>

      <Stratum id="mx-all" title="Every published metric" sub={mode === 'adjusted' ? 'Opponent-adjusted ratings from this game’s research, both teams side by side.' : 'Raw measures from each team’s profile (last 34 games), both teams side by side.'}>
        <MatchupTable rows={rows} metrics={metrics} slug={slug} homeId={homeId} awayId={awayId} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} eventId={r.event.event_id} mode={mode} />
      </Stratum>
    </div>
  );
}
