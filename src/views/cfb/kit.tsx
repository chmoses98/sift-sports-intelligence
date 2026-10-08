// The CFB research vocabulary as marks: one glyph per signal and claim, drawn in SIFT's stroke style (24 grid, 1.75px)
// and tinted by meaning, so a reader can scan a slate by shape before reading a word. Every glyph is decorative
// beside its words, or carries an aria-label when it stands alone.
import type { ReactNode } from 'react';
import type { SignalClaims } from '../../lib/cfbSignals';
import '../../styles/cfb.css';

const PATHS: Record<string, string> = {
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  control: 'M5.5 18l6.5-6.5 6.5 6.5M5.5 11.5 12 5l6.5 6.5',
  close: 'M12 4v15.5M8 19.5h8M4.5 7.5h15M4.5 7.5 2 13a2.6 2.6 0 0 0 5 0L4.5 7.5ZM19.5 7.5 17 13a2.6 2.6 0 0 0 5 0l-2.5-5.5Z',
  fast: 'M13 3L5 14h6l-1 7 8-11h-6l1-7Z',
  slow: 'M4 15.5a7 6.5 0 0 1 14 0H4ZM18 14h1.6a1.6 1.6 0 0 0 0-3.2H18.6M7 15.5V18M15 15.5V18M8.5 15.5l1.6-3.6h3.8l1.6 3.6',
  up: 'M12 19.5V5M6 11l6-6 6 6',
  down: 'M12 4.5V19M6 13l6 6 6-6',
  shield: 'M12 3l7 3v5.2c0 4.6-3 8.2-7 9.8-4-1.6-7-5.2-7-9.8V6l7-3Z',
  alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17v.3',
  burst: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  none: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.5 12h7',
};

export type CfbGlyphName = keyof typeof PATHS;

/** Which glyph a tone carries a fill for (the star is the one solid mark). */
const FILLED = new Set(['star']);

export function CfbGlyph({ name, size = 16, label, tone }: { name: CfbGlyphName | string; size?: number; label?: string; tone?: string }) {
  const d = PATHS[name] ?? PATHS.none;
  return (
    <svg
      className={`cfg cfg--${tone ?? name}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={FILLED.has(name) ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export interface ClaimChip { key: string; glyph: CfbGlyphName; tone: string; text: string }

/** The supporting (non-CONTROL) claims as chips, in a fixed order: close, pace, scoring, defense, disruption. */
export function supportChips(c: SignalClaims | null | undefined, opts: { disruption?: boolean } = {}): ClaimChip[] {
  if (!c) return [];
  const out: ClaimChip[] = [];
  if (c.closeness) out.push({ key: 'close', glyph: 'close', tone: 'close', text: 'Close game' });
  if (c.pace === 'HIGH') out.push({ key: 'pace', glyph: 'fast', tone: 'fast', text: 'Fast pace' });
  if (c.pace === 'LOW') out.push({ key: 'pace', glyph: 'slow', tone: 'slow', text: 'Slow pace' });
  if (c.scoring?.level === 'ELEVATED') out.push({ key: 'scoring', glyph: 'up', tone: 'up', text: 'Elevated scoring' });
  if (c.scoring?.level === 'SUPPRESSED') out.push({ key: 'scoring', glyph: 'down', tone: 'down', text: 'Lower-scoring' });
  if (c.defensive_suppression) out.push({ key: 'defense', glyph: 'shield', tone: 'shield', text: 'Defensive suppression' });
  if (opts.disruption) for (const d of c.disruption) out.push({ key: `disruption-${d.side}`, glyph: 'burst', tone: 'burst', text: `${d.team} disruption` });
  return out;
}

export function Chip({ glyph, tone, children, strong }: { glyph: CfbGlyphName; tone: string; children: ReactNode; strong?: boolean }) {
  return (
    <span className={`cftag cftag--${tone}${strong ? ' cftag--strong' : ''}`}>
      <CfbGlyph name={glyph} size={14} tone={tone} />
      <span>{children}</span>
    </span>
  );
}

/** The tiny icon run a schedule row carries: one glyph per signal or claim, each with its name for assistive tech. */
export function SignalMarks({ marks }: { marks: { glyph: CfbGlyphName; tone: string; label: string }[] }) {
  if (!marks.length) return null;
  return (
    <span className="cfmarks">
      {marks.map((m) => <CfbGlyph key={m.label} name={m.glyph} tone={m.tone} size={14} label={m.label} />)}
    </span>
  );
}
