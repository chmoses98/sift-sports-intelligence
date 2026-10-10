import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { statusFor } from '../contract/freshness';
import type { FreshnessState, ObservationContext, Quality, QualityStatus, Thresholds } from '../contract/types';
import { ago, exactTime, ordinal } from '../lib/format';
import { teamLogo } from '../lib/teams';
import { useHeldImage } from '../lib/useImage';
import { makeTrayItem, type RefKind, type TrayExtra } from '../packet/tray';
import { useTray, type TrayLabel } from '../state/tray';
import { Icon } from './Icon';
import { findingToTray, type Finding } from '../research/findings';
import { FROZEN_LABEL, FROZEN_WHY, isFrozen } from '../lib/lifecycle';
import { useNow } from '../live/hooks';

// ------------------------------------------------------------------ entity links

export type EntityKind = 'team' | 'player' | 'game' | 'metric' | 'ranking' | 'market' | 'history' | 'sport';

const KIND_GLYPH: Record<EntityKind, string> = {
  team: '◆', player: '●', game: '⟷', metric: '∿', ranking: '≡', market: '¢', history: '◷', sport: '▲',
};

/** The one way Sift links to an entity: always a real link, always marked by kind. */
export function EntityLink({ to, kind, children, className, title, quiet }: { to: string; kind: EntityKind; children: ReactNode; className?: string; title?: string; quiet?: boolean }) {
  return (
    <Link to={to} className={`elink elink--${kind}${quiet ? ' elink--quiet' : ''}${className ? ' ' + className : ''}`} title={title}>
      {!quiet && <span className="elink__glyph" aria-hidden="true">{KIND_GLYPH[kind]}</span>}
      <span className="elink__text">{children}</span>
    </Link>
  );
}

/**
 * A team's identity mark: the team's real logo (committed under public/teams/<sport>/, fetched once —
 * see scripts/teams/). Decorative: the team's name is always written next to it.
 */
export function TeamMark({ sport, abbr, size = 'md' }: { sport: string; abbr: string | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const src = teamLogo(sport, abbr);
  // Held in memory once fetched: re-renders, navigation and offline never refetch or abort a logo.
  const held = useHeldImage(src);
  if (src) {
    return held
      ? <img className={`teammark teammark--logo teammark--${size}`} src={held} alt="" aria-hidden="true" decoding="async" draggable={false} />
      : <span className={`teammark teammark--logo teammark--${size}`} aria-hidden="true" />;
  }
  return (
    <span className={`teammark teammark--text teammark--${size}`} aria-hidden="true">
      {abbr ?? ''}
    </span>
  );
}

// ------------------------------------------------------------------ popover (provenance, timestamps)

export function Popover({ trigger, children, label, align = 'start' }: { trigger: ReactNode; children: ReactNode; label: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="popover" ref={ref}>
      <button type="button" className="popover__trigger" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <span className={`popover__panel popover__panel--${align}`} id={id} role="dialog" aria-label={label}>
          {children}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ freshness

const FRESH_GLYPH: Record<string, string> = { FRESH: '●', AGING: '◐', STALE: '○', UNKNOWN: '◌' };

export function FreshnessChip({
  asOf, component = 'market_data', thresholds, label, now = Date.now(), state,
}: { asOf: string | null | undefined; component?: string; thresholds?: Thresholds; label?: string; now?: number; state?: FreshnessState }) {
  const s = state ?? statusFor(asOf, component, now, thresholds);
  return (
    <Popover
      label={`${label ?? component} freshness: ${s}`}
      trigger={
        <span className={`chip chip--fresh chip--${s.toLowerCase()}`}>
          <span aria-hidden="true">{FRESH_GLYPH[s]}</span>
          {label && <span className="chip__k">{label}</span>}
          <span>{s}</span>
          {asOf && <span className="chip__dim">{ago(asOf, now)}</span>}
        </span>
      }
    >
      <span className="pv">
        <span className="pv__row"><span>State</span><b>{s}</b></span>
        <span className="pv__row"><span>As of</span><b>{exactTime(asOf)}</b></span>
        {thresholds && (
          <span className="pv__row">
            <span>Rule</span>
            <b>
              fresh ≤ {Math.round(thresholds.fresh_after_seconds / 60)}m · stale &gt; {Math.round(thresholds.stale_after_seconds / 60)}m
            </b>
          </span>
        )}
        <span className="pv__note">Recomputed now in your browser with the publication's own thresholds.</span>
      </span>
    </Popover>
  );
}

// ------------------------------------------------------------------ quality / provenance

const Q_GLYPH: Record<string, string> = { VERIFIED: '●', PARTIAL: '◐', RESEARCH: '◌', UNAVAILABLE: '○', UNKNOWN: '?' };

export function QualityBadge({ status, quality, compact }: { status?: QualityStatus | string; quality?: Quality | null; compact?: boolean }) {
  const s = (status ?? quality?.status ?? 'UNKNOWN') as string;
  const badge = (
    <span className={`qbadge qbadge--${s.toLowerCase()}`}>
      <span aria-hidden="true">{Q_GLYPH[s] ?? '?'}</span>
      {!compact && <span>{s}</span>}
      {compact && <span className="sr-only">{s}</span>}
    </span>
  );
  if (!quality) return badge;
  return (
    <Popover label={`Provenance: ${s}`} trigger={badge}>
      <Provenance quality={quality} />
    </Popover>
  );
}

export function Provenance({ quality }: { quality: Quality }) {
  return (
    <span className="pv">
      <span className="pv__row"><span>Status</span><b>{quality.status}{quality.production ? ' · production' : ''}</b></span>
      {quality.source && <span className="pv__row"><span>Source</span><b>{quality.source}</b></span>}
      {quality.methodology_version && <span className="pv__row"><span>Method</span><b>{quality.methodology_version}{quality.source_version ? ` · src ${quality.source_version}` : ''}</b></span>}
      <span className="pv__row"><span>Generated</span><b>{exactTime(quality.generated_at)}</b></span>
      <span className="pv__row"><span>Data as of</span><b>{exactTime(quality.data_as_of)}</b></span>
      {quality.coverage && <span className="pv__row"><span>Coverage</span><b>{quality.coverage}</b></span>}
      {quality.sample_size != null && <span className="pv__row"><span>Sample</span><b>{quality.sample_size}</b></span>}
      {quality.limitations?.length > 0 && (
        <span className="pv__lims">
          <span className="pv__k">Limitations</span>
          {quality.limitations.map((l) => (
            <span key={l} className="pv__lim">{l}</span>
          ))}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ research tray

export function SaveButton({
  ref_kind, sport, id, extra, label, compact, className, text, kickoff, eventStatus, note, savedText,
}: {
  ref_kind: RefKind; sport: string; id: string; extra?: Partial<TrayExtra> | null; label: TrayLabel; compact?: boolean; className?: string; text?: string;
  /** Contract note saved with the item (a finding's statement). */
  note?: string | null;
  savedText?: string;
  /** Scheduled kickoff of the game this item belongs to: after it, nothing new can be saved (lib/lifecycle.ts). */
  kickoff?: string | null;
  eventStatus?: string | null;
}) {
  const tray = useTray();
  const now = useNow(30_000);
  const whyId = useId();
  const [explain, setExplain] = useState(false);
  const saved = tray.has(ref_kind, id, extra);
  const probe = makeTrayItem({ ref_kind, sport, id, extra, added_at: new Date(0) }).item_id;
  const item = saved ? tray.tray.items.find((i) => i.item_id === probe) : undefined;
  const frozen = (kickoff != null || eventStatus != null) && isFrozen(kickoff, now, eventStatus);

  // After kickoff, an item that was not saved before cannot be newly saved: a visibly disabled control that
  // explains itself on hover (title), on tap (an inline note) and to assistive tech (aria-describedby).
  if (frozen && !saved) {
    return (
      <span className={`savebtn-wrap${compact ? ' savebtn-wrap--compact' : ''}`}>
        <button
          type="button"
          className={`savebtn is-frozen${compact ? ' savebtn--compact' : ''}${className ? ' ' + className : ''}`}
          aria-disabled="true"
          aria-label={`${FROZEN_LABEL}: ${label.label} can’t be saved after kickoff`}
          aria-describedby={whyId}
          title={FROZEN_WHY}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExplain((x) => !x);
          }}
        >
          <Icon name="lock" size={compact ? 14 : 15} />
          {!compact && <span>{FROZEN_LABEL}</span>}
        </button>
        <span id={whyId} className={explain ? 'savebtn__why' : 'sr-only'} role={explain ? 'status' : undefined}>{FROZEN_WHY}</span>
      </span>
    );
  }
  const pregameSaved = frozen && saved;
  return (
    <button
      type="button"
      className={`savebtn${saved ? ' is-saved' : ''}${compact ? ' savebtn--compact' : ''}${className ? ' ' + className : ''}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label.label} from My Board${pregameSaved ? ' (saved before kickoff as pregame research)' : ''}` : `Save ${label.label} to My Board`}
      title={pregameSaved ? 'Saved before kickoff: kept as pregame research. Tap to remove it from My Board.' : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (saved && item) tray.remove(item.item_id);
        else tray.add({ ref_kind, sport, id, extra, label, kickoff, eventStatus, note });
      }}
    >
      <Icon name={saved ? 'check' : 'plus'} size={compact ? 14 : 16} />
      {!compact && <span>{saved ? (pregameSaved ? 'Saved pregame' : savedText ?? 'Saved') : text ?? 'Save'}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ structure

export function Stratum({ n, title, sub, actions, children, id, className }: { n?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section className={`stratum${className ? ' ' + className : ''}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="stratum__head">
        {n && <span className="stratum__n" aria-hidden="true">{n}</span>}
        <div className="stratum__titles">
          <h2 className="stratum__title" id={id ? `${id}-h` : undefined}>{title}</h2>
          {sub && <p className="stratum__sub">{sub}</p>}
        </div>
        {actions && <div className="stratum__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function Skeleton({ lines = 3, tall }: { lines?: number; tall?: boolean }) {
  return (
    // A status message, not a labelled generic: ARIA prohibits aria-label on a role-less <div>
    // (axe aria-prohibited-attr), and a busy status region would never be announced.
    <div className={`skel${tall ? ' skel--tall' : ''}`} role="status">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skel__line" style={{ width: `${92 - i * 13}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'research'; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      <Icon name="info" size={16} />
      <div>
        <div className="notice__title">{title}</div>
        {children && <div className="notice__body">{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, what }: { error: Error | undefined; what: string }) {
  const nf = error?.name === 'NotFoundError';
  return (
    <Notice tone={nf ? 'info' : 'error'} title={nf ? `${what} is not published` : `Could not load ${what}`}>
      {nf ? 'The publication does not include this document. Nothing is shown in its place.' : error?.message}
    </Notice>
  );
}

// ------------------------------------------------------------------ ranking context

export function RankPill({ rank, size, hib }: { rank: number | null | undefined; size: number | null | undefined; hib?: boolean | null }) {
  if (rank == null || size == null) return <span className="rankpill rankpill--none">unranked</span>;
  const pctile = 1 - (rank - 1) / Math.max(1, size - 1);
  const tier = pctile >= 0.75 ? 'top' : pctile <= 0.25 ? 'bottom' : 'mid';
  return (
    <span className={`rankpill rankpill--${hib === null ? 'neutral' : tier}`} title={hib === null ? 'Ranked high-to-low; neither direction is better' : undefined}>
      <b>{ordinal(rank)}</b>
      <span>/ {size}</span>
    </span>
  );
}

/**
 * Where a value sits in its comparison universe: worst ← → best, with the league average and median
 * ticked. Purely positional (values, not ranks), so outliers look like outliers.
 */
export function ContextMeter({ value, ctx, oppValue, label }: { value: number | null; ctx: ObservationContext | null; oppValue?: number | null; label?: string }) {
  if (!ctx || value == null || ctx.best_value == null || ctx.worst_value == null) return null;
  const lo = ctx.worst_value;
  const hi = ctx.best_value;
  const span = hi - lo || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  return (
    <span className="cmeter" role="img" aria-label={label ?? `Position between worst (${lo}) and best (${hi})`}>
      <span className="cmeter__track" />
      {ctx.league_average != null && <span className="cmeter__tick cmeter__tick--avg" style={{ left: `${pos(ctx.league_average)}%` }} />}
      {ctx.league_median != null && <span className="cmeter__tick cmeter__tick--med" style={{ left: `${pos(ctx.league_median)}%` }} />}
      {oppValue != null && <span className="cmeter__dot cmeter__dot--opp" style={{ left: `${pos(oppValue)}%` }} />}
      <span className="cmeter__dot" style={{ left: `${pos(value)}%` }} />
    </span>
  );
}

/** "Dig deeper": save one specific finding (not a whole game) to the research tray. */
export function DigDeeper({ finding, compact, className }: { finding: Finding; compact?: boolean; className?: string }) {
  const t = findingToTray(finding);
  return (
    <SaveButton
      ref_kind={t.ref_kind} sport={t.sport} id={t.id} extra={t.extra} label={t.label} note={t.note} kickoff={t.kickoff} eventStatus={t.eventStatus}
      compact={compact} className={`savebtn--dig${className ? ' ' + className : ''}`} text="Dig deeper" savedText="On My Board"
    />
  );
}
