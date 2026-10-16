// TEAM COMPARISON (NFL) — any two teams side by side in their colours: the basics (box score per game, ranked),
// every rating unit against unit (same side: offense with offense, defense with defense) in the reader's footing,
// "if they met" (each offense against the other's defense, unit by unit, and the free matchup builder), and both
// teams' scheme tendencies. Every number is the publication's (team profiles) or nflverse's (box score, charting);
// nothing is combined into a rating Sift invented.
import { useMemo } from 'react';
import { Link, useNavigate } from '../routing';
import type { EntityProfileDoc, MetricDef, Observation } from '../contract/types';
import { BasisTag, DuelRow, ModeToggle } from '../components/statviz';
import { EntityLink, Notice, Skeleton, Stratum, TeamMark } from '../components/ui';
import { useAsync } from '../data/hooks';
import { useTeamHistory } from '../history/load';
import { leagueBasics } from '../insights/basics';
import type { GameSides, Side } from '../insights/game';
import { schemeBoard } from '../insights/schemeBoard';
import { pick } from '../insights/unitAnalysis';
import { formatStat, unitLine } from '../insights/units';
import { displayName } from '../lib/format';
import { routes } from '../lib/routes';
import { teamAccent } from '../lib/teams';
import { useDirectory } from '../state/directory';
import { useSport } from '../state/sport';
import { useStatMode, type StatMode } from '../state/statMode';
import { useVisit } from '../state/trail';
import { BasicsDuel, basicsSpan } from './stats/Basics';
import { BUILDER_UNITS, MatchupBuilder } from './stats/Builder';
import { SchemeBoard } from './stats/Scheme';
import { UnitByUnit } from './stats/UnitByUnit';
import './../styles/lane-c-views.css';

function sideOf(p: EntityProfileDoc, home: boolean): Side {
  const name = displayName(p.entity.display_name);
  const w = name.split(' ');
  return { pid: p.entity.participant_id, abbr: p.entity.short_name ?? '?', nick: w[w.length - 1] || name, city: w.slice(0, -1).join(' '), home };
}

/** Two teams as a game's two sides (A away, B home), so the game components read them unchanged. */
export function sidesFor(a: EntityProfileDoc, b: EntityProfileDoc): GameSides {
  const away = sideOf(a, false);
  const home = sideOf(b, true);
  return {
    home, away,
    opp: (x) => (x === home.abbr ? away : home),
    byAbbr: (x) => (x === home.abbr ? home : away),
    byPid: (pid) => (pid === home.pid ? home : pid === away.pid ? away : null),
    week: null,
    kickoff: '',
  };
}

/** "Rushing efficiency · run offense"; no repeat when the measure already names the unit ("Special teams"). */
function rowLabel(label: string, word: string): string {
  const base = label.replace(/ \(.*\)$/, '');
  return base.toLowerCase().includes(word.split(/[ -]/)[0]) ? base : `${base} · ${word}`;
}

const obs = (p: EntityProfileDoc, id: string | null): Observation | null => (id ? p.metrics.find((m) => m.metric_id === id && !m.split) ?? null : null);

function SameSide({ a, b, side, mode, metrics }: { a: EntityProfileDoc; b: EntityProfileDoc; side: 'off' | 'def'; mode: StatMode; metrics: Map<string, MetricDef> }) {
  const A = sideOf(a, false);
  const B = sideOf(b, true);
  return (
    <div className="lc-card tcm__ratings">
      {BUILDER_UNITS.filter((u) => u.group === 'Ratings' && u[side]).map((u) => {
        const pa = pick(u[side]!, (id) => obs(a, id), mode);
        const pb = pick(u[side]!, (id) => obs(b, id), mode);
        if (!pa && !pb) return null;
        const id = (pa ?? pb)!.obs.metric_id;
        const word = side === 'off' ? u.offWord : u.defWord;
        return (
          <DuelRow
            key={u.key}
            label={rowLabel(u.label, word)}
            unit={unitLine(id, metrics.get(id))}
            left={{ abbr: A.abbr, color: teamAccent('NFL', A.abbr), rank: pa?.obs.context?.rank ?? null, of: pa?.obs.context?.universe_size ?? null, value: pa ? formatStat(pa.obs.metric_id, pa.obs.value, metrics.get(pa.obs.metric_id)) : '—', who: `${A.abbr} ${word}`, tag: pa ? <BasisTag basis={pa.basis} fallback={pa.fallback} /> : null }}
            right={{ abbr: B.abbr, color: teamAccent('NFL', B.abbr), rank: pb?.obs.context?.rank ?? null, of: pb?.obs.context?.universe_size ?? null, value: pb ? formatStat(pb.obs.metric_id, pb.obs.value, metrics.get(pb.obs.metric_id)) : '—', who: `${B.abbr} ${word}`, tag: pb ? <BasisTag basis={pb.basis} fallback={pb.fallback} /> : null }}
          />
        );
      })}
    </div>
  );
}

function Head({ p, other, side }: { p: EntityProfileDoc; other: string; side: 'a' | 'b' }) {
  const { slug, repo } = useSport();
  const dir = useDirectory(repo);
  const nav = useNavigate();
  const abbr = p.entity.short_name ?? '';
  const rec = (p.extensions as { record?: { wins: number; losses: number; ties?: number } } | null)?.record;
  const teams = (dir.data?.index.teams ?? []).filter((t) => t.participant_id !== other).sort((x, y) => x.display_name.localeCompare(y.display_name));
  return (
    <div className={`tcm__side tcm__side--${side}`} style={{ ['--tc' as string]: teamAccent('NFL', abbr) }}>
      <TeamMark sport="NFL" abbr={abbr} size="xl" />
      <Link to={routes.team(slug, p.entity.participant_id)} className="tcm__name">{displayName(p.entity.display_name)}</Link>
      {rec && <span className="tcm__rec num">{rec.wins}–{rec.losses}{rec.ties ? `–${rec.ties}` : ''} this season</span>}
      <label className="sr-only" htmlFor={`tcm-${side}`}>Change team</label>
      <select id={`tcm-${side}`} value={p.entity.participant_id} onChange={(e) => nav(side === 'a' ? routes.compare(slug, e.target.value, other) : routes.compare(slug, other, e.target.value), { replace: true })}>
        <option value={p.entity.participant_id}>Change team…</option>
        {teams.map((t) => <option key={t.participant_id} value={t.participant_id}>{t.display_name}</option>)}
      </select>
    </div>
  );
}

export function TeamCompareView({ a, b }: { a: string; b: string | null }) {
  const { sport, repo, slug, metrics } = useSport();
  const pa = useAsync(`prof:${sport.code}:${a}`, () => repo.profile(a));
  const pb = useAsync(b ? `prof:${sport.code}:${b}` : null, () => repo.profile(b!));
  const hist = useTeamHistory(sport.code);
  const [mode] = useStatMode();
  const A = pa.data;
  const B = pb.data;
  useVisit(A && B ? `${A.entity.short_name} vs ${B.entity.short_name}` : null, 'compare');
  const g = useMemo(() => (A && B ? sidesFor(A, B) : null), [A, B]);
  const basics = useMemo(() => (hist.data ? leagueBasics(hist.data, null) : null), [hist.data]);
  const profiles = useMemo(() => ({ away: A, home: B }), [A, B]);
  const board = useMemo(() => (g && A && B ? schemeBoard(hist.data, { [g.away.abbr]: A, [g.home.abbr]: B }, [g.away.abbr, g.home.abbr], null) : []), [hist.data, g, A, B]);
  if (pa.loading || pb.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!A) return <div className="page"><Notice title="That team is not in this publication." /></div>;
  if (!B || !g) {
    return (
      <div className="page compare compare--teams">
        <div className="eyebrow"><EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Compare teams</div>
        <h1 className="h-display h-display--md">Compare {displayName(A.entity.display_name)}</h1>
        <div className="tcm__head"><Head p={A} other={b ?? ''} side="a" /></div>
        <p className="muted">Choose a second team above.</p>
      </div>
    );
  }
  const span = basicsSpan(basics?.get(g.away.abbr));
  return (
    <div className="page compare compare--teams">
      <div className="eyebrow"><EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Compare teams</div>
      <h1 className="sr-only">{displayName(A.entity.display_name)} compared with {displayName(B.entity.display_name)}</h1>
      <div className="tcm__head">
        <Head p={A} other={B.entity.participant_id} side="a" />
        <span className="tcm__vs" aria-hidden="true">vs</span>
        <Head p={B} other={A.entity.participant_id} side="b" />
      </div>
      <ModeToggle note={mode === 'adjusted' ? 'Ratings are opponent-adjusted (the publication’s primary footing). Box-score basics are always raw.' : 'Ratings are raw over the publication’s last 34 games. Box-score basics are this season’s raw results.'} />

      <Stratum id="tc-basics" title="The basics" sub={`Box-score numbers per game this season, ranked among all 32 teams. ${span ? `${span} · ` : ''}nflverse play-by-play.`}>
        <BasicsDuel basics={basics} left={g.away} right={g.home} foot="Passing yards are net of sack yards; turnovers are interceptions plus fumbles lost; third-down and red-zone figures are percentages of attempts." />
      </Stratum>

      <Stratum id="tc-ratings" title="Unit against unit" sub="Each team's offense next to the other's offense, and defense next to defense: league rank of N (#1 = best for the job), value with its unit and footing.">
        <div className="lc-grid lc-grid--2">
          <div><h3 className="mx__h3">Offense</h3><SameSide a={A} b={B} side="off" mode={mode} metrics={metrics} /></div>
          <div><h3 className="mx__h3">Defense</h3><SameSide a={A} b={B} side="def" mode={mode} metrics={metrics} /></div>
        </div>
      </Stratum>

      <Stratum id="tc-met" title="If they met" sub="Each offense against the other's defense, unit by unit, with plain conclusions from the published ranks (observations, not a projection).">
        <UnitByUnit r={null} profiles={profiles} g={g} mode={mode} basics={basics} metrics={metrics} slug={slug} />
        <h3 className="mx__h3">Build a matchup</h3>
        <MatchupBuilder r={null} profiles={profiles} g={g} mode={mode} basics={basics} metrics={metrics} slug={slug} />
      </Stratum>

      {board.length > 0 && (
        <Stratum id="tc-scheme" title="Scheme tendencies" sub="How each team plays, ranked among teams with enough charted plays (#1 = highest). FTN charting via nflverse; pass rate over expected and style from the publication.">
          <SchemeBoard rows={board} teams={[g.away, g.home]} />
        </Stratum>
      )}
    </div>
  );
}
