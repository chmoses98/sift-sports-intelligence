// The info control for plain-English definitions (lib/glossary.ts). One small icon; the definition opens on
// tap or click (and Escape closes it). Renders nothing when there is no definition: never an empty popover.
import type { ReactNode } from 'react';
import { glossLine, metricGloss, term, type Gloss } from '../lib/glossary';
import { Icon } from './Icon';
import { Popover } from './ui';

export function GlossInfo({ gloss, extra, align }: { gloss: Gloss | null; extra?: ReactNode; align?: 'start' | 'end' }) {
  if (!gloss) return null;
  return (
    <span className="info gloss">
      <Popover label={`What is ${gloss.term}?`} trigger={<Icon name="info" size={15} />} align={align}>
        <span className="info__body">
          <span><b>{gloss.term}:</b> {glossLine(gloss)}</span>
          {extra}
        </span>
      </Popover>
    </span>
  );
}

export function MetricInfo({ metricId, def, align }: { metricId: string; def?: Parameters<typeof metricGloss>[1]; align?: 'start' | 'end' }) {
  return <GlossInfo gloss={metricGloss(metricId, def)} align={align} />;
}

export function TermInfo({ k, extra, align }: { k: string; extra?: ReactNode; align?: 'start' | 'end' }) {
  return <GlossInfo gloss={term(k)} extra={extra} align={align} />;
}
