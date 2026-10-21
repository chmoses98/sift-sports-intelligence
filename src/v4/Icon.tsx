import { ICON_PATHS, type IconName } from './iconPaths';

/** A Phosphor glyph (regular weight; pass `filled` for the active/on weight). Decorative unless `label` is given. */
export function Icon({ name, filled = false, size, label, className = '' }: { name: IconName; filled?: boolean; size?: 'xs' | 's'; label?: string; className?: string }) {
  const key = (filled && `${name}-f` in ICON_PATHS ? `${name}-f` : name) as IconName;
  return (
    <svg className={`v4-ic${size ? ` v4-ic--${size}` : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 256 256" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d={ICON_PATHS[key]} />
    </svg>
  );
}
export type { IconName };
