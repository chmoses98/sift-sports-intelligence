// The independent Projection Foundation projection, shown the same way on every surface (Home, Game Command Center,
// Player Prop Explorer): one lookup and one set of words from src/lib/projections.ts, so pages cannot contradict each other.
//   - BLOCKed, confirmed-out or incoherent: says it is withheld and why, never shows the number;
//   - otherwise: expected value, realistic range, opportunity, opponent adjustment, availability, reliability and the
//     exact update time, labelled SHADOW (it is not SIFT's headline number until the owner promotes the family);
//   - beside the production number it only states agreement or disagreement — never an edge.
import { useProjections } from '../data/projections';
import {
  agreement, displayState, findProjection, fmtAge, fmtWhen, isPrimary, PARTICIPATION_WORDS, READINESS_WORDS,
  findTeamProjections, type ProjSport,
} from '../lib/projections';
import '../styles/intelligence.css';

const fmt = (v: number, ref: number = v) => (Math.abs(ref) >= 20 ? v.toFixed(0) : v.toFixed(1));

interface Props {
  sport: string; stat: string; playerId?: string | null; name?: string | null; team?: string | null; gameId?: string | null;
  incumbent?: number | null; now?: number;
  /** 'full' (Explorer), 'compact' (prop cards), 'micro' (one line: Home, Player Snapshot) */
  variant?: 'full' | 'compact' | 'micro';
  /** @deprecated use variant="compact" */
  compact?: boolean;
  label?: string;
}

export function FoundationProjection({ sport, stat, playerId, name, team, gameId, incumbent = null, compact = false, variant, now = Date.now(), label }: Props) {
  const v = variant ?? (compact ? 'compact' : 'full');
  const { doc, loading } = useProjections(sport);
  if (loading) return null;
  const st = displayState(doc, findProjection(doc, { playerId, name, team, stat, gameId }), now);
  if (st.kind === 'none') return null;
  if (st.kind === 'withheld') {
    if (v === 'micro') return <small className="pf-micro pf-micro--withheld" data-testid="foundation-projection" data-state="withheld">{label ?? 'Independent'}: withheld ({st.reason})</small>;
    return (
      <p className={`intel intel--line${v === 'compact' ? ' intel--compact' : ''}`} role="note" data-testid="foundation-projection" data-state="withheld">
        <span className="intel__tag">Independent projection withheld</span> {st.reason}.
      </p>
    );
  }
  const { p } = st;
  const primary = isPrimary(sport.toUpperCase() as ProjSport, st);
  const range = p.p10 != null && p.p90 != null ? `${fmt(p.p10, p.mean)}–${fmt(p.p90, p.mean)}` : null;
  const when = fmtWhen(p.dataAsOf);
  const part = p.participation;
  const partOk = part?.status === 'CONFIRMED_ACTIVE';
  if (v === 'micro') {
    return (
      <small className={`pf-micro${st.stale || !partOk ? ' pf-micro--caution' : ''}`} data-testid="foundation-projection" data-state={st.stale ? 'stale' : 'shown'} data-gate={p.gate.status}
        title={`${READINESS_WORDS[p.readiness]}. ${part ? PARTICIPATION_WORDS[part.status] : PARTICIPATION_WORDS.UNVERIFIED}.${when ? ` Updated ${when}.` : ''}`}>
        {label ?? (primary ? 'SIFT projection' : 'Independent (shadow)')}: <b className="num">{fmt(p.mean)}</b>{range ? ` · ${range}` : ''}{st.stale ? ' · stale' : ''}
      </small>
    );
  }
  const agree = primary ? null : agreement(incumbent, p.mean);
  const opp = p.opportunity ? `${p.opportunity.family.replace(/_/g, ' ')} ${fmt(p.opportunity.mean)}` : null;
  const oa = p.opponentAdjustment && Math.abs(p.opponentAdjustment.factor - 1) >= 0.01
    ? `opponent ×${p.opponentAdjustment.factor.toFixed(2)}${p.opponentAdjustment.sampleGames != null ? ` (${p.opponentAdjustment.sampleGames} games)` : ''}` : null;
  const tone = st.stale || st.review.length || p.readiness !== 'READY' || !partOk ? 'caution' : 'ok';
  return (
    <div className={`intel intel--line intel--${tone}${v === 'compact' ? ' intel--compact' : ''} pf`} role="note" data-testid="foundation-projection" data-state={st.stale ? 'stale' : 'shown'} data-gate={p.gate.status}>
      <p className="pf__row">
        <span className="intel__tag">{primary ? 'SIFT projection' : 'Independent projection · shadow'}</span>{' '}
        <strong className="fx-num">{fmt(p.mean)}</strong>
        {range && <> · realistic range {range}</>}
        {opp && <> · {opp}</>}
        {oa && <> · {oa}</>}
      </p>
      <p className="pf__row pf__muted" data-testid="foundation-availability">
        {part ? PARTICIPATION_WORDS[part.status] : PARTICIPATION_WORDS.UNVERIFIED}{part?.source && part.status !== 'UNVERIFIED' ? ` (${part.source.replace(/_/g, ' ')}${fmtWhen(part.capturedUtc) ? `, ${fmtWhen(part.capturedUtc)}` : ''})` : ''}.
      </p>
      {v === 'full' && <p className="pf__row pf__muted">{READINESS_WORDS[p.readiness]}. {primary ? '' : 'Shadow model: shown for comparison, not as SIFT’s headline number. '}Updated {when ?? 'at an unknown time'} ({fmtAge(st.ageHours)}){st.stale ? ' — stale, treat with caution' : ''}.</p>}
      {v === 'compact' && <p className="pf__row pf__muted">Updated {when ?? 'unknown'}{st.stale ? ' — stale' : ''} · {p.readiness.toLowerCase()}</p>}
      {agree && <p className="pf__row pf__muted" data-testid="foundation-agreement">{agree.words}</p>}
      {st.review.length > 0 && <p className="pf__row pf__muted" data-testid="foundation-review">Review: {st.review.slice(0, 2).map((f) => f.what).join('; ')}.</p>}
      {v === 'full' && p.adjustments.length > 0 && <p className="pf__row pf__muted">{p.adjustments.slice(0, 3).join(' · ')}</p>}
    </div>
  );
}

/** Independent team projections for one game (Game Command Center). Rendered only when exactly one feed game matches. */
export function FoundationTeams({ sport, home, away, startUtc, now = Date.now() }: { sport: string; home: string; away: string; startUtc?: string | null; now?: number }) {
  const { doc, loading } = useProjections(sport);
  if (loading || !doc) return null;
  const ts = findTeamProjections(doc, { home, away, startUtc });
  if (!ts) return null;
  const pts = ts.filter((t) => /points|runs|goals/.test(t.family) && !/total|margin/.test(t.family));
  if (!pts.length) return null;
  const order = [away.toUpperCase(), home.toUpperCase()];
  pts.sort((a, b) => order.indexOf(a.team.toUpperCase()) - order.indexOf(b.team.toUpperCase()));
  const info = doc.families[pts[0].family];
  const when = fmtWhen(doc.dataAsOf ?? doc.generatedAt);
  const ageH = doc.dataAsOf ? (now - Date.parse(doc.dataAsOf)) / 3.6e6 : null;
  return (
    <p className="intel intel--line intel--caution pf" role="note" data-testid="foundation-teams">
      <span className="intel__tag">Independent team projection · shadow</span>{' '}
      {pts.map((t, i) => <span key={t.team}>{i ? ' · ' : ''}{t.team} <strong className="fx-num">{fmt(t.mean)}</strong>{t.p10 != null && t.p90 != null ? ` (${fmt(t.p10, t.mean)}–${fmt(t.p90, t.mean)})` : ''}</span>)}
      <span className="pf__muted"> — {info ? READINESS_WORDS[info.readiness].toLowerCase() : 'reliability not published'}; updated {when ?? 'unknown'}{ageH != null ? ` (${fmtAge(ageH)})` : ''}. Not a betting signal.</span>
    </p>
  );
}
