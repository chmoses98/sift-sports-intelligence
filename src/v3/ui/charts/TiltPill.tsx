// The tilt pill: "PHI offense +30" with the favoured team's logo, or the plain "Even +11". A directional pill is a team target (the logo,
// abbreviation and role name the advantaged unit; it opens that team's Team Research). Even has no direction and no target.
// `link={false}` draws the same pill without a target, for places already inside a link (a Lens evidence row): an anchor never nests.
import { TeamLink } from '../../nav/Targets';
import { signedGap, type UnitRow } from '../../data/research/matchup';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../TeamLogo';

export function TiltPill({ row, team, className, link = true }: { row: UnitRow; team: (code: string) => V3Team; className?: string; link?: boolean }) {
  if (row.tilt === 'even') return <em className={`mx-tilt mx-tilt--even${className ? ` ${className}` : ''}`}>Even {signedGap(row.gap)}</em>;
  const code = row.favours!;
  const role = row.tilt;
  const t = team(code);
  const cls = `mx-tilt mx-tilt--${role}${className ? ` ${className}` : ''}`;
  const inner = (
    <>
      <i className={`mx-ring mx-ring--${role}`}><TeamLogo team={t} size={13} /></i>
      {code} {role === 'off' ? 'offense' : 'defense'} +{Math.abs(row.gap)}
    </>
  );
  if (!link) return <em className={cls}>{inner}</em>;
  return <TeamLink team={{ slug: t.slug, id: code }} className={cls} label={`${code} ${role === 'off' ? 'offense' : 'defense'} +${Math.abs(row.gap)}: team page`}>{inner}</TeamLink>;
}
