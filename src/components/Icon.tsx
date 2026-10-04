// A small, consistent icon set (1.75px strokes on a 24 grid). Decorative unless given a label.
const PATHS: Record<string, string> = {
  search: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21',
  tray: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6l2-8Z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4v-9Z',
  layers: 'M12 3l9 5-9 5-9-5 9-5Zm-9 9l9 5 9-5M3 16l9 5 9-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9.5v.5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  compare: 'M7 4v16M17 4v16M3 8h8M13 16h8',
  chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6l1-7Z',
  pin: 'M12 21s-6-5.7-6-11a6 6 0 1 1 12 0c0 5.3-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
};

export function Icon({ name, size = 18, label, className }: { name: keyof typeof PATHS | string; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/** The Sift mark: three strata, the last one sifted down to a bright signal. */
export function SiftMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="26" height="4" rx="2" fill="#2a3a63" />
      <rect x="7" y="13" width="18" height="4" rx="2" fill="#3461ff" />
      <rect x="11.5" y="20" width="9" height="4" rx="2" fill="#2ee6f6" />
      <circle cx="16" cy="28" r="1.8" fill="#f6b93b" />
    </svg>
  );
}
