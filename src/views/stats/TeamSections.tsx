// Team-page sections (NFL): the basics against the league, the team's scheme tendencies, the depth chart for its next
// game, and a picker to compare it with any other team. Each reads only published documents (the team profile, the
// nflverse history layer, the next game's research).
import { useMemo } from 'react';
import { useNavigate } from '../../routing';
import type { EntityProfileDoc } from '../../contract/types';
import { Skeleton, Stratum } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { useTeamHistory } from '../../history/load';
import { teamBasics } from '../../insights/basics';
import { gameSides } from '../../insights/game';
import { schemeBoard } from '../../insights/schemeBoard';
import { routes } from '../../lib/routes';
import { useDirectory } from '../../state/directory';
import { useSport } from '../../state/sport';
import { BasicsSolo, basicsSpan } from './Basics';
import { DepthChart } from './DepthChart';
import { SchemeBoard } from './Scheme';

export function TeamBasicsStratum({ abbr, nick, n }: { abbr: string; nick: string; n?: string }) {
  const { sport } = useSport();
  const hist = useTeamHistory(sport.code);
  const b = useMemo(() => teamBasics(hist.data, abbr, null), [hist.data, abbr]);
  if (hist.loading) return <Stratum n={n} title="The basics" sub="Box-score numbers per game."><Skeleton lines={3} /></Stratum>;
  if (!b) return null;
  const span = basicsSpan(b);
  return (
    <Stratum n={n} id="t-basics" title="The basics" sub={`Box-score numbers per game this season, each ranked among all ${b.off[0]?.of ?? 32} teams (#1 = best for the job). ${span ? `${span} · ` : ''}nflverse play-by-play; raw results, not adjusted for opponents.`}>
      <BasicsSolo basics={b} team={{ abbr, nick }} />
    </Stratum>
  );
}

export function TeamSchemeStratum({ abbr, nick, profile, n }: { abbr: string; nick: string; profile: EntityProfileDoc; n?: string }) {
  const { sport } = useSport();
  const hist = useTeamHistory(sport.code);
  const rows = useMemo(() => schemeBoard(hist.data, { [abbr]: profile }, [abbr], null), [hist.data, abbr, profile]);
  if (!rows.length) return null;
  return (
    <Stratum n={n} id="t-scheme" title="Scheme tendencies" sub={`How the ${nick} play, not how well: each rate ranked among teams with enough charted plays (#1 = highest). FTN charting via nflverse; pass rate over expected and style from the publication.`}>
      <SchemeBoard rows={rows} teams={[{ abbr, nick }]} caption="Only “EPA per dropback vs the blitz” is ranked best-first. Man/zone coverage shells are not published for 2026." />
    </Stratum>
  );
}

/** The depth chart for the team's next game (the publication captures depth charts per game). */
export function TeamDepthStratum({ teamId, eventId, nick }: { teamId: string; eventId: string | null; nick: string }) {
  const { sport, repo, slug } = useSport();
  const r = useAsync(eventId ? `er:${sport.code}:${eventId}` : null, () => repo.eventResearch(eventId!));
  const side = useMemo(() => (r.data ? gameSides(r.data)?.byPid(teamId) ?? null : null), [r.data, teamId]);
  if (!eventId) return null;
  if (r.loading) return <Skeleton lines={4} />;
  if (!r.data || !side) return null;
  return (
    <Stratum id="t-depth" title="Depth chart" sub={`${nick} skill players for the next game: starters first, with this game's projection, the season per game and any injury designation. Depth order is the captured Sleeper depth chart — a stated intention, not measured snaps.`}>
      <DepthChart r={r.data} teams={[side]} slug={slug} sport={sport.code} />
    </Stratum>
  );
}

export function CompareTeamPicker({ teamId }: { teamId: string }) {
  const { repo, slug } = useSport();
  const dir = useDirectory(repo);
  const nav = useNavigate();
  const teams = useMemo(() => (dir.data?.index.teams ?? []).filter((t) => t.participant_id !== teamId).sort((a, b) => a.display_name.localeCompare(b.display_name)), [dir.data, teamId]);
  if (!teams.length) return null;
  return (
    <label className="tcm__pick">
      <span>Compare with</span>
      <select value="" onChange={(e) => e.target.value && nav(routes.compare(slug, teamId, e.target.value))}>
        <option value="">Choose a team…</option>
        {teams.map((t) => <option key={t.participant_id} value={t.participant_id}>{t.display_name}</option>)}
      </select>
    </label>
  );
}
