// How SIFT presents the ONE projection for a stat. The number itself is drawn by the page from the same selected value
// (a prop row's `projection`, a team line below); this component adds what travels with it — reliability, availability,
// update time, matchup context — and states plainly when a promoted projection is withheld.
//
//   * legacy stat (approved engine = the existing production model): renders nothing; the page shows its own number;
//   * withheld: says it is withheld and why, never a number from either engine;
//   * authoritative: reliability, availability, update time, opportunity and opponent context. No engine label, no
//     second value, no comparison. `showValue` prints the expected value + range for surfaces that have no number of
//     their own (Player Snapshot).
// Reliability is the projection's data quality, never betting value.
import { useAuthority } from '../data/projections';
import { fmtAge, fmtWhen } from '../lib/projections';
import { RELIABILITY_WORDS, type AuthoritativeValue, type Resolution } from '../lib/projectionAuthority';
import '../styles/intelligence.css';

const fmt = (v: number, ref: number = v) => (Math.abs(ref) >= 20 ? v.toFixed(0) : v.toFixed(1));
const rangeText = (v: AuthoritativeValue) => (v.p10 != null && v.p90 != null ? `${fmt(v.p10, v.mean)}–${fmt(v.p90, v.mean)}` : null);

interface NoteProps {
  resolution: Resolution;
  /** 'full' (Prop Explorer), 'compact' (prop cards), 'micro' (one line: Home, Player Snapshot) */
  variant?: 'full' | 'compact' | 'micro';
  /** print the expected value and 80% range (surfaces with no number of their own) */
  showValue?: boolean;
}

export function ProjectionNote({ resolution, variant = 'full', showValue = false }: NoteProps) {
  if (resolution.kind === 'legacy') return null;
  if (resolution.kind === 'withheld') {
    if (variant === 'micro') return <small className="pf-micro pf-micro--withheld" data-testid="projection-note" data-state="withheld">Projection withheld ({resolution.reason})</small>;
    return (
      <p className={`intel intel--line${variant === 'compact' ? ' intel--compact' : ''}`} role="note" data-testid="projection-note" data-state="withheld">
        <span className="intel__tag">Projection withheld</span> {resolution.reason}.
      </p>
    );
  }
  const v = resolution.value;
  const range = rangeText(v);
  const when = fmtWhen(v.updatedAt);
  const tone = v.reliability === 'HIGH' ? 'ok' : 'caution';
  if (variant === 'micro') {
    return (
      <small className={`pf-micro${v.reliability === 'HIGH' ? '' : ' pf-micro--caution'}`} data-testid="projection-note" data-state="shown" data-reliability={v.reliability}
        title={`${v.availability?.words ?? ''}${when ? ` Updated ${when}.` : ''}${v.reliabilityWhy.length ? ` ${v.reliabilityWhy.join('. ')}.` : ''}`}>
        {showValue && <>Projection <b className="num">{fmt(v.mean)}</b> · </>}{range ? `range ${range} · ` : ''}{RELIABILITY_WORDS[v.reliability]}{when ? ` · updated ${when}` : ''}
      </small>
    );
  }
  const opp = v.opportunity ? `${v.opportunity.family.replace(/_/g, ' ')} ${fmt(v.opportunity.mean)}` : null;
  const oa = v.opponentFactor && Math.abs(v.opponentFactor.factor - 1) >= 0.01
    ? `opponent ×${v.opponentFactor.factor.toFixed(2)}${v.opponentFactor.sampleGames != null ? ` (${v.opponentFactor.sampleGames} games)` : ''}` : null;
  const ctx = [opp, oa].filter(Boolean).join(' · ');
  return (
    <div className={`intel intel--line intel--${tone}${variant === 'compact' ? ' intel--compact' : ''} pf`} role="note" data-testid="projection-note" data-state="shown" data-reliability={v.reliability}>
      {(showValue || range) && <p className="pf__row" data-testid="projection-range">{showValue && <strong className="fx-num">{fmt(v.mean)}</strong>}{range && <>{showValue ? ' · ' : ''}realistic range {range} (80% of outcomes)</>}</p>}
      <p className="pf__row" data-testid="projection-reliability-level"><span className="intel__tag">{RELIABILITY_WORDS[v.reliability]}</span>{v.reliabilityWhy.length > 0 && <> {v.reliabilityWhy.slice(0, 2).join('. ')}.</>}</p>
      {v.availability && <p className="pf__row pf__muted" data-testid="projection-availability">{v.availability.words}{v.availability.source && v.availability.status !== 'UNVERIFIED' ? ` (${v.availability.source.replace(/_/g, ' ')}${fmtWhen(v.availability.capturedUtc) ? `, ${fmtWhen(v.availability.capturedUtc)}` : ''})` : ''}.</p>}
      <p className="pf__row pf__muted" data-testid="projection-updated">Updated {when ?? 'at an unknown time'}{v.ageHours != null ? ` (${fmtAge(v.ageHours)})` : ''}{ctx ? ` · ${ctx}` : ''}</p>
      {variant === 'full' && v.adjustments.length > 0 && <p className="pf__row pf__muted">{v.adjustments.slice(0, 3).join(' · ')}</p>}
    </div>
  );
}

interface PlayerProps {
  sport: string; stat: string; playerId?: string | null; name?: string | null; team?: string | null; gameId?: string | null;
  variant?: 'full' | 'compact' | 'micro'; showValue?: boolean; now?: number;
}

/** For surfaces that do not build a prop row (Player Snapshot): resolves the stat through the same authority. */
export function PlayerProjectionNote({ sport, stat, playerId, name, team, gameId, variant = 'micro', showValue = true, now }: PlayerProps) {
  const { authority, ready } = useAuthority(sport, now);
  if (!ready || !authority) return null;
  return <ProjectionNote resolution={authority.resolve({ stat, playerId, name, team, gameId })} variant={variant} showValue={showValue} />;
}

const TEAM_LABEL: Record<string, string> = {
  team_points: 'Points', plays: 'Plays', team_passing_yards: 'Pass yards', team_rushing_yards: 'Rush yards', points_per_play: 'Points/play', success_rate: 'Success rate',
};
const teamFmt = (family: string, v: number) => (family === 'success_rate' ? `${(v * 100).toFixed(0)}%` : family === 'points_per_play' ? v.toFixed(2) : fmt(v));

/**
 * The selected team projections for one game (Game Command Center). Points lead; any other promoted team family follows on
 * one muted line. Withheld families say why; legacy families render nothing (the page keeps its existing number).
 */
export function TeamProjections({ sport, home, away, startUtc, now }: { sport: string; home: string; away: string; startUtc?: string | null; now?: number }) {
  const { authority, ready } = useAuthority(sport, now);
  if (!ready || !authority) return null;
  const families = Object.keys(TEAM_LABEL).map((family) => ({ family, r: authority.resolveTeams({ family, home, away, startUtc }) })).filter((x) => x.r.kind !== 'legacy');
  if (!families.length) return null;
  const points = families.find((x) => x.family === 'team_points');
  const rest = families.filter((x) => x.family !== 'team_points');
  const lead = points?.r;
  const when = lead?.kind === 'authoritative' ? fmtWhen(lead.teams[0].value.updatedAt) : null;
  return (
    <div className="intel intel--line intel--ok pf" role="note" data-testid="team-projections">
      {lead?.kind === 'authoritative' && (
        <p className="pf__row"><span className="intel__tag">Projected score</span>{' '}
          {lead.teams.map((t, i) => <span key={t.team}>{i ? ' · ' : ''}{t.team} <strong className="fx-num">{fmt(t.value.mean)}</strong>{t.value.p10 != null && t.value.p90 != null ? ` (${fmt(t.value.p10, t.value.mean)}–${fmt(t.value.p90, t.value.mean)})` : ''}</span>)}
        </p>
      )}
      {lead?.kind === 'withheld' && <p className="pf__row" data-testid="team-projections-withheld"><span className="intel__tag">Projected score withheld</span> {lead.reason}.</p>}
      {/* a secondary family that is withheld says nothing: the lead line already states why projections are missing */}
      {rest.map(({ family, r }) => r.kind === 'authoritative'
        ? <p key={family} className="pf__row pf__muted" data-testid={`team-${family}`}>{TEAM_LABEL[family]}: {r.teams.map((t) => `${t.team} ${teamFmt(family, t.value.mean)}`).join(' · ')}</p>
        : null)}
      {lead?.kind === 'authoritative' && <p className="pf__row pf__muted" data-testid="team-projections-updated">Updated {when ?? 'at an unknown time'} · {RELIABILITY_WORDS[lead.teams[0].value.reliability]}. A projection, not a betting signal.</p>}
    </div>
  );
}
