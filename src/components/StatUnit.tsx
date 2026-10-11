// Small pieces that put a unit and a footing on a value (issue 6, NHL / soccer / CBB / CFB): the footing tag reuses
// the NFL stat tags (statviz `svtag`), so "Adjusted" and "Raw" look the same in every sport.
import type { Footing, SportUnit } from '../insights/sportUnits';
import { unitText } from '../insights/sportUnits';
import '../styles/lane-c-stats.css';
import '../styles/wave2-units.css';

const TAG_CLASS: Record<Footing['kind'], string> = { adjusted: 'adjusted', raw: 'raw', model: 'season', roster: 'box', rating: 'season' };

/** "ADJUSTED" / "RAW · SEASON 2026-27" / "MODEL INPUT", with what it means on hover. */
export function FootTag({ f, className }: { f: Footing; className?: string }) {
  return <span className={`svtag svtag--${TAG_CLASS[f.kind]}${className ? ` ${className}` : ''}`} title={f.detail} data-footing={f.kind}>{f.word}</span>;
}

/** The words after a number ("xG / 60 at 5v5"), or "unit not stated" in a quieter style. */
export function UnitWords({ u, className }: { u: SportUnit; className?: string }) {
  const t = unitText(u);
  if (!t) return null;
  return <span className={`sunit${u.stated ? '' : ' sunit--none'}${className ? ` ${className}` : ''}`} title={u.long}>{t}</span>;
}
