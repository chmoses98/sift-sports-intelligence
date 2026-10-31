// TR5: who is out, and where the props are. Availability from the publication (out and injured reserve first), the honest note that
// offensive-line quality is not published, and the skill players ordered by the props listed on the next game. A row opens Player
// Research; a prop count opens Prop Discovery for that player.
import { useMemo } from 'react';
import { NavRow, PropsLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { broadcastPlayerPhoto } from '../../../components/sift2/playerArt';
import { Icon } from '../../ui/Icon';
import { LockedRow } from '../../ui/atoms';
import { TeamLogo } from '../../ui/TeamLogo';
import { availabilityCounts, availabilityOf, skillPlayersOf, type AvailabilityVM, type SkillPlayerVM } from '../../model/teamResearch';
import { dateOnly, Eyebrow, Skel, toggleExp, type TeamPageCtx } from './parts';

const AV_SHOWN = 4;
const SKILL_SHOWN = 6;

function AvRow({ c, a }: { c: TeamPageCtx; a: AvailabilityVM }) {
  const body = (
    <>
      <span className="ps">{a.pos ?? '—'}</span>
      <div className="nm"><b>{a.name}</b><span>{[a.reason, a.returnDate ? `return ${dateOnly(a.returnDate)}` : null].filter(Boolean).join(' · ') || 'No detail published'}</span></div>
      <span className={`chip ${a.kind === 'out' ? 'bad' : 'amb'}`}>{a.label}</span>
    </>
  );
  if (!a.playerId) return <div className="avr">{body}</div>;
  return <NavRow to={routes.player({ slug: c.slug, id: a.playerId })} kind="player" label={`${a.name}, ${a.label}. Open player research`} className="avr">{body}</NavRow>;
}

function SkillRow({ c, p }: { c: TeamPageCtx; p: SkillPlayerVM }) {
  const photo = useMemo(() => (c.demo ? null : broadcastPlayerPhoto(p.id, p.name, c.code, 'portrait')), [c.demo, p.id, p.name, c.code]);
  return (
    <NavRow to={routes.player({ slug: c.slug, id: p.id })} kind="player" label={`${p.name}${p.role ? `, ${p.role}` : ''}. Open player research`} className="plr">
      <span className="av4">{photo ? <img src={photo.src} alt="" style={{ objectPosition: photo.focus }} loading="lazy" decoding="async" /> : <TeamLogo team={c.team} size={26} />}</span>
      <div className="nm"><b>{p.name}</b><span>{p.role ?? 'Player'}</span></div>
      {p.out ? <span className="chip bad">Out</span>
        : p.props ? <PropsLink state={{ player: p.id, sport: c.slug }} label={`${p.name}: ${p.props} ${p.props === 1 ? 'prop' : 'props'}. Open Prop Discovery for ${p.name}`} className="pcnt">{p.props} {p.props === 1 ? 'prop' : 'props'} <i aria-hidden="true">›</i></PropsLink>
        : p.props === 0 ? <span className="pcnt dim">no props</span> : <span />}
    </NavRow>
  );
}

export function Players({ c, propCounts }: { c: TeamPageCtx; propCounts: Map<string, number> | null }) {
  const profile = c.profile;
  const av = useMemo(() => (profile ? availabilityOf(profile) : []), [profile]);
  const skill = useMemo(() => (profile ? skillPlayersOf(c.slug, profile, propCounts, av) : []), [c.slug, profile, propCounts, av]);
  if (!profile) return <div className="tm-body"><Skel h={330} label="Loading players" /><Skel h={30} /><Skel h={340} /></div>;
  const counts = availabilityCounts(av);
  const allAv = c.state.exp.includes('av');
  const allSk = c.state.exp.includes('roster');
  const ol = c.state.exp.includes('ol');
  const lineNote = c.decl.players?.lineNote ?? null;
  const label = c.decl.players?.label ?? 'Skill players';
  const rows = allAv ? av : av.slice(0, AV_SHOWN);
  const skillRows = allSk ? skill : skill.slice(0, SKILL_SHOWN);
  return (
    <div className="tm-body">
      <section className="tm-card tm-avc" aria-label="Availability">
        <div className="exh"><Eyebrow>Availability</Eyebrow>
          <span className="cn"><b>{counts.out}</b> out{counts.ir ? <> · <b>{counts.ir}</b> on IR</> : null}{counts.other ? <> · <b>{counts.other}</b> listed</> : null}</span>
        </div>
        {rows.map((a) => <AvRow key={a.key} c={c} a={a} />)}
        {!av.length && <p className="tm-note tm-note--pad">The publication lists no players as out or injured for this team.</p>}
        {av.length > AV_SHOWN && (
          <button type="button" className="more" aria-expanded={allAv} onClick={() => toggleExp(c, 'av')}>
            {allAv ? 'Show fewer' : `${av.length - AV_SHOWN} more`} <Icon name={allAv ? 'chevU' : 'chevR'} size={14} />
          </button>
        )}
      </section>
      {lineNote && (
        <>
          <div className="olc">
            <Icon name="info" size={14} />
            <span>{lineNote}</span>
            <button type="button" className="why" aria-expanded={ol} onClick={() => toggleExp(c, 'ol')}>Why <Icon name={ol ? 'chevU' : 'chevR'} size={12} /></button>
          </div>
          {ol && <LockedRow title="Offensive line">The publication captures no pass-block or run-block grades and no snap-level continuity, so no offensive-line metric exists to show. Linemen who are out are listed above.</LockedRow>}
        </>
      )}
      <div className="exh exh--pad"><Eyebrow>{label}</Eyebrow>
        {skill.length > SKILL_SHOWN && <button type="button" className="seeall" aria-expanded={allSk} onClick={() => toggleExp(c, 'roster')}>{allSk ? 'Show fewer' : `All ${skill.length}`} <Icon name={allSk ? 'chevU' : 'chevR'} size={14} /></button>}
      </div>
      <section className="tm-card tm-plist2" aria-label={label}>
        {skillRows.map((p) => <SkillRow key={p.id} c={c} p={p} />)}
        {!skill.length && <p className="tm-note tm-note--pad">The publication lists no players for this team.</p>}
      </section>
    </div>
  );
}
