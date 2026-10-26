// P4: the Matchup tab. (1) How the approved projection builds, end to end, from the published projection rows (only the stages the approval ledger
// lets SIFT show; the rest are "—" with why), (2) the opponent's unit against the whole league, every statistic a target that opens Stat Detail,
// (3) the availability that matters. A player with no matchup rows gets the honest "No matchup rows" state, never a filled-in card.
import { Fragment, useMemo } from 'react';
import { teamLogo } from '../../../lib/teams';
import { teamKey } from '../../../lib/projections';
import { useTeamProfile } from '../../data/research/hooks';
import { useOppProfile, useUnitRanking, type OppUnitView } from '../../data/useOppUnits';
import { LeagueStrip } from '../../ui/charts/LeagueStrip';
import { LockedRow } from '../../ui/atoms';
import { Icon } from '../../ui/Icon';
import { StatLink, PlayerLink } from '../../nav/Targets';
import { siftLaneFor } from '../../model/playerResearch';
import type { PlayerView } from './view';

const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };
const sgn = (n: number, d = 3) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

// ------------------------------------------------------------------------------------------------ 1. how the projection builds

interface Node { label: string; mean: number | null; p10: number | null; p90: number | null; why: string | null }

function niceMax(v: number): number { const steps = [4, 6, 8, 10, 12, 14, 16, 20, 25, 30, 40, 50, 60, 80, 100, 120, 140, 160, 200, 250, 300]; return steps.find((s) => s >= v) ?? Math.ceil(v / 50) * 50; }

function NodeView({ n }: { n: Node }) {
  const max = n.p90 != null ? niceMax(n.p90 * 1.12) : 1;
  return (
    <div className="v3p-cn">
      <b className="num">{n.mean != null ? (n.mean >= 100 ? Math.round(n.mean) : f1(n.mean)) : '—'}</b>
      <span>{n.label}</span>
      {n.mean != null && n.p10 != null && n.p90 != null ? (
        <><i className="rg"><u style={{ left: `${(100 * n.p10) / max}%`, width: `${(100 * (n.p90 - n.p10)) / max}%` }} /><s style={{ left: `${(100 * n.mean) / max}%` }} /></i><em>{n.p10}–{n.p90}</em></>
      ) : <em>{n.why ?? 'not approved yet'}</em>}
    </div>
  );
}

const Edge = ({ text }: { text: string | null }) => (
  <div className="v3p-cx" aria-hidden="true"><b>{text ?? '—'}</b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M14 7l5 5-5 5" /></svg></div>
);

function ProjectionCard({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const a = v.modelReady.authority;
  const stat = v.stat!;
  const value = (s: string) => { const r = v.modelReady.resolve(s); return r?.kind === 'authoritative' ? r.value : null; };
  const why = (s: string) => { const r = v.modelReady.resolve(s); return r ? siftLaneFor(r, vm.sport, s, 0).reason ?? 'not approved yet' : 'not approved yet'; };
  const mine = value(stat);
  const receiving = vm.sport === 'NFL' && ['receptions', 'targets', 'receiving_yards'].includes(stat);
  const teamAtt = useMemo(() => {
    if (!receiving || !a || !vm.next || !vm.team) return null;
    const r = a.resolveTeams({ family: 'team_pass_attempts', home: vm.next.home.abbr, away: vm.next.away.abbr, startUtc: new Date(vm.nextStartMs ?? vm.next.startMs).toISOString() });
    if (r.kind !== 'authoritative') return null;
    return r.teams.find((t) => teamKey(t.team) === teamKey(vm.team!.abbr))?.value ?? null;
  }, [receiving, a, vm.next, vm.team, vm.nextStartMs]);

  if (!mine && !receiving) {
    return (
      <section className="v3p-sec v3p-card" aria-label="How the projection builds">
        <div className="v3p-sh"><h2>How the projection builds</h2><span className="v3p-chip is-cy">research-only</span></div>
        <LockedRow title={`${v.statDef?.label}:`}>the SIFT model has no approved projection for this statistic yet ({why(stat)}), so there is nothing to build. “—” is never estimated.</LockedRow>
      </section>
    );
  }
  const tg = value('targets'), rc = value('receptions'), yd = value('receiving_yards');
  const node = (label: string, x: { mean: number; p10: number | null; p90: number | null } | null, s?: string): Node => ({ label, mean: x?.mean ?? null, p10: x?.p10 ?? null, p90: x?.p90 ?? null, why: x ? null : s ? why(s) : 'not approved yet' });
  const nodes: Node[] = receiving
    ? [node(`${vm.team?.abbr} pass att`, teamAtt, 'team_pass_attempts'), node(`${vm.name.split(' ').slice(-1)[0]} targets`, tg, 'targets'), node('Receptions', rc, 'receptions'), node('Rec yards', yd, 'receiving_yards')]
    : [node(v.statDef?.label ?? stat, mine, stat)];
  const edges = receiving ? [
    teamAtt && tg ? `${f1((tg.mean / teamAtt.mean) * 100)}%` : null,
    tg && rc ? `${Math.round((rc.mean / tg.mean) * 100)}%` : null,
    rc && yd ? `${f1(yd.mean / rc.mean)} yds` : null,
  ] : [];
  const notes = (mine ?? rc ?? tg)?.adjustments ?? [];
  const src = (mine ?? rc ?? tg)?.availability;
  return (
    <section className="v3p-sec v3p-card" aria-label="How the projection builds">
      <div className="v3p-sh"><h2>How the projection builds</h2><span className="v3p-chip is-cy">research-only</span></div>
      <div className="v3p-chain" style={{ gridTemplateColumns: nodes.map((_, i) => (i ? '26px 1fr' : '1fr')).join(' ') }}>
        {nodes.map((n, i) => <Fragment key={n.label}>{i > 0 && <Edge text={edges[i - 1] ?? null} />}<NodeView n={n} /></Fragment>)}
      </div>
      {notes.length > 0 && <div className="v3p-adj">{notes.slice(0, 3).map((t) => <div key={t}><Icon name="info" size={12} /><span>{t}</span></div>)}</div>}
      {receiving && !yd && <LockedRow title="Receiving yards:">the SIFT model does not have an approved projection for this statistic yet, so the chain stops at receptions.</LockedRow>}
      <p className="v3p-foot">{src?.words ? `${src.words}${src.source ? ` per ${src.source.replace(/_/g, ' ')}` : ''} · ` : ''}shares and rates are arithmetic on the published rows</p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ 2. the opponent's unit

function UnitRow({ v, u, opp, own }: { v: PlayerView; u: OppUnitView; opp: string; own: string }) {
  const vm = v.vm!;
  const { ranking } = useUnitRanking(v.slug, u);
  const o = u.obs;
  const isEpa = /epa/.test(u.id);
  return (
    <StatLink stat={{ slug: v.slug, statId: u.id }} state={{ win: u.window, sel: opp, opp: own }} label={`${u.label}: ${opp} ${ord(o.rank!)} of ${o.n}. Open the league ranking`} className="v3p-sl">
      <span className="v3p-slh"><span>{u.label}</span><b>{o.value != null && isEpa ? `${sgn(o.value)} · ` : ''}{ord(o.rank!)} of {o.n}</b></span>
      {ranking ? <LeagueStrip entries={ranking.entries} team={opp} higherIsBetter={ranking.higherIsBetter ?? false} role="def" logo={teamLogo(vm.sport, opp)} label={`${opp} ${u.label}: ${ord(o.rank!)} of ${o.n}`} />
        : <span className="v3p-strip v3p-strip--none" aria-hidden="true" />}
    </StatLink>
  );
}

const POSITION_WORDS: Record<string, string> = { WR: 'wide receivers', TE: 'tight ends', RB: 'running backs', QB: 'quarterbacks' };

function OppCard({ v, profile }: { v: PlayerView; profile: ReturnType<typeof useOppProfile> }) {
  const vm = v.vm!;
  const opp = vm.opp!.abbr;
  const pos = vm.position ? POSITION_WORDS[vm.position] : null;
  return (
    <section className="v3p-sec v3p-card" aria-label={`${opp} ${profile.unit}`}>
      <div className="v3p-sh"><h2>{opp} {profile.unit}</h2><span className="v3p-note">opponent-adjusted{vm.season ? ` · ${vm.season}` : ''}</span></div>
      {profile.loading && <div className="v3-skel" style={{ height: 120 }} role="status" aria-label="Loading opponent unit" />}
      {profile.shown.map((u) => <UnitRow key={u.id} v={v} u={u} opp={opp} own={vm.team!.abbr} />)}
      {profile.missing.length > 0 && !profile.loading && <LockedRow title={`${profile.missing.map((m) => m.label).join(', ')}:`}>not published for {opp} yet.</LockedRow>}
      <LockedRow title={`Defense vs ${pos ?? 'this position'}`}>needs position-level splits, which are not published yet.</LockedRow>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ 3. availability

const DEF_POS = /\((CB|S|FS|SS|DB|LB|ILB|OLB|MLB|DE|DT|DL|EDGE|NT)\b/, OFF_POS = /\((WR|TE|QB|OT|OG|OL|C|RB|FB|T|G)\b/;
const personOf = (detail: string | null) => /^(.+?) \(([A-Z]+),/.exec(detail ?? '');

function OutList({ title, rows, players, slug }: { title: string; rows: { detail: string | null }[]; players: { participantId: string; name: string }[]; slug: string }) {
  return (
    <div>
      <span className="v3p-eb">{title}</span>
      {rows.slice(0, 3).map((r) => {
        const m = personOf(r.detail);
        const name = m?.[1] ?? r.detail ?? '';
        const hit = players.find((p) => p.name === name);
        const label = <><span className="v3p-chip is-bad">OUT</span>{name}{m && <small> {m[2]}</small>}</>;
        return <div key={r.detail} className="v3p-pr">{hit ? <PlayerLink player={{ slug, id: hit.participantId }} className="v3p-pr__l">{label}</PlayerLink> : <span className="v3p-pr__l">{label}</span>}</div>;
      })}
      {!rows.length && <p className="v3p-note">No listed absences</p>}
    </div>
  );
}

function AvailabilityCard({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const opp = useTeamProfile(v.slug, vm.opp!.abbr);
  const own = useTeamProfile(v.slug, vm.team!.abbr);
  if (!opp.profile && !own.profile) return null;
  const out = (p: typeof opp.profile, re: RegExp) => (p?.availability ?? []).filter((a) => a.status === 'OUT' && re.test(a.detail ?? ''));
  return (
    <section className="v3p-sec v3p-card" aria-label="Availability that matters">
      <div className="v3p-sh"><h2>Availability that matters</h2><span className="v3p-note">{opp.profile?.availability[0]?.source?.toUpperCase() ?? ''}</span></div>
      <div className="v3p-av">
        <OutList title={`${vm.opp!.abbr} defense · out`} rows={out(opp.profile, DEF_POS)} players={opp.profile?.players ?? []} slug={v.slug} />
        <OutList title={`${vm.team!.abbr} offense · out`} rows={out(own.profile, OFF_POS)} players={own.profile?.players ?? []} slug={v.slug} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ the tab

export function MatchupTab({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const oppCode = vm.opp?.abbr ?? null;
  const profile = useOppProfile(v.slug, vm.sport, v.stat, oppCode, true);
  const hasUnit = v.vm!.sport === 'NFL';
  if (!v.stat) return null;
  if (!hasUnit) {
    return (
      <div className="v3p-empty" role="status"><b>No matchup rows</b>{v.researchWhy ?? `No opposing-unit rankings are published for ${vm.sport} players yet.`}</div>
    );
  }
  return (
    <div className="v3p-mt">
      {vm.next && vm.opp ? (
        <>
          <ProjectionCard v={v} />
          <OppCard v={v} profile={profile} />
          <AvailabilityCard v={v} />
        </>
      ) : <div className="v3p-empty" role="status"><b>No matchup rows</b>There is no coming game for this player on the published slate.</div>}
    </div>
  );
}
