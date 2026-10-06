// Small CBB presentation pieces shared by the CBB screens. Shared shells (Stratum, Notice, chips, marks)
// stay generic; these only translate CBB research terms into plain language.
import type { ReactNode } from 'react';
import { TeamMark } from '../../components/ui';
import type { Participant } from '../../contract/types';
import { ago } from '../../lib/format';
import { CONFIDENCE_TEXT, ROLE_SHORT, STATE_TEXT, type Confidence, type Integrity, type ProjectionState } from './data';

export function CbbMark({ p, size = 'md' }: { p: Pick<Participant, 'short_name' | 'display_name'> | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  // Text marks: CBB team logos are not self-hosted (no external image is fetched for 365 teams).
  return <span className="cmark"><TeamMark sport="CBB" abbr={p?.short_name ?? p?.display_name?.slice(0, 4) ?? ''} size={size} /></span>;
}

const CONF_TONE: Record<Confidence, string> = { CONFIRMED: 'ok', LIKELY: 'mid', CONFLICTED: 'warn', STALE: 'warn', UNKNOWN: 'unk' };

export function ConfidenceChip({ c, team, long }: { c: Confidence | null | undefined; team?: string; long?: boolean }) {
  const v = (c ?? 'UNKNOWN') as Confidence;
  return (
    <span className={`cconf cconf--${CONF_TONE[v]}`} title={CONFIDENCE_TEXT[v]}>
      <span className="cconf__dot" aria-hidden="true" />
      {team && <span className="cconf__team">{team}</span>}
      <span className="cconf__v">{v.charAt(0) + v.slice(1).toLowerCase()}</span>
      {long && <span className="cconf__x"> — {CONFIDENCE_TEXT[v]}</span>}
    </span>
  );
}

export function RoleTag({ role, version }: { role: string; version: string }) {
  return (
    <span className={`crole crole--${role}`}>
      <b>{ROLE_SHORT[role] ?? role}</b> <span className="num">{version}</span>
    </span>
  );
}

export function StateLine({ state, compact }: { state: ProjectionState; compact?: boolean }) {
  const short: Record<ProjectionState, string> = {
    PROJECTED: 'Projected before tip',
    PENDING_WINDOW: 'Projection pending',
    AWAITING_CAPTURE: 'Capture window open',
    UNAVAILABLE: 'No pre-tip projection',
  };
  return <span className={`cstate cstate--${state.toLowerCase()}`} title={STATE_TEXT[state]}>{compact ? short[state] : STATE_TEXT[state]}</span>;
}

const GATE_LABEL: Record<string, string> = {
  VALID: 'Prospective evidence · valid', INVALID: 'Integrity gate failed', UNSCORABLE: 'Unscorable',
  PENDING: 'Not settled', NOT_SCORED: 'Settled · awaiting scoreboard',
};

export function IntegrityBadge({ i }: { i: Integrity | null | undefined }) {
  if (!i) return null;
  const tone = i.status === 'VALID' ? 'ok' : i.status === 'UNSCORABLE' || i.status === 'INVALID' ? 'bad' : 'unk';
  return <span className={`cgate cgate--${tone}`} title={i.text ?? undefined}>{GATE_LABEL[i.status] ?? i.status}</span>;
}

export function AsOf({ iso, label = 'archived', now }: { iso: string | null | undefined; label?: string; now: number }) {
  if (!iso) return null;
  return (
    <time className="casof" dateTime={iso} title={iso}>
      {label} {new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {ago(iso, now)}
    </time>
  );
}

export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="ckv">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
