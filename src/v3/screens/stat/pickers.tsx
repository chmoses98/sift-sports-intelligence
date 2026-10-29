// Choosers opened as sheets: a team (Trend's team, Compare's two teams) and a player (Compare players). A pick is an address change
// (`sel`, `a`, `b`); it lands on the screen underneath after the sheet closes (useQueryPatch handles that), so Back never meets a sheet.
import { useTeamIndex, useTeamProfile } from '../../data/research/hooks';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../../ui/TeamLogo';

export function TeamPickerBody({ slug, team, picked, onPick }: { slug: string; team: (code: string, name?: string) => V3Team; picked: (string | null)[]; onPick: (code: string) => void }) {
  const ti = useTeamIndex(slug);
  const teams = [...ti.teams].filter((t) => t.short_name).sort((a, b) => a.display_name.localeCompare(b.display_name));
  if (!teams.length) return <p className="st-note">{ti.loading ? 'Loading teams.' : 'The publication lists no teams for this sport.'}</p>;
  return (
    <div className="st-pick" role="listbox" aria-label="Teams">
      {teams.map((t) => (
        <button key={t.participant_id} type="button" role="option" aria-selected={picked.includes(t.short_name)} aria-pressed={picked.includes(t.short_name)} onClick={() => onPick(t.short_name!)}>
          <TeamLogo team={team(t.short_name!, t.display_name)} size={28} />{t.display_name}<small>{t.short_name}</small>
        </button>
      ))}
    </div>
  );
}

export function PlayerPickerBody({ slug, teams, team, picked, onPick }: { slug: string; teams: (string | null)[]; team: (code: string, name?: string) => V3Team; picked: (string | null)[]; onPick: (playerId: string) => void }) {
  return (
    <div className="st-pick">
      {[...new Set(teams.filter((t): t is string => !!t))].map((code) => <TeamPlayers key={code} slug={slug} code={code} team={team} picked={picked} onPick={onPick} />)}
      {!teams.some(Boolean) && <p className="st-note">Select a team first: players are listed from the teams in view.</p>}
    </div>
  );
}

function TeamPlayers({ slug, code, team, picked, onPick }: { slug: string; code: string; team: (code: string, name?: string) => V3Team; picked: (string | null)[]; onPick: (playerId: string) => void }) {
  const p = useTeamProfile(slug, code);
  const t = team(code);
  return (
    <section aria-label={`${t.name} players`}>
      <h3>{t.name}</h3>
      {p.loading && <p className="st-note">Loading players.</p>}
      {!p.loading && !p.profile?.players.length && <p className="st-note">The publication lists no players for {t.name}.</p>}
      {p.profile?.players.map((pl) => (
        <button key={pl.participantId} type="button" aria-pressed={picked.includes(pl.participantId)} onClick={() => onPick(pl.participantId)}>{pl.name}<small>{pl.role ?? ''}</small></button>
      ))}
    </section>
  );
}
