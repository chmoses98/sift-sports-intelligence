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
  // slate priorities
  star: 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.75 1-5.8L3.5 9.7l5.9-.9L12 3.5Z',
  shield: 'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3Zm-3.2 9l2.3 2.3 4.3-4.6',
  flame: 'M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.2 3.6-7.8.5 1.6 1.4 2.6 2.4 3.1C11.6 7 12.8 4.6 15 3c-.3 2.9 1 4.6 2.2 6.3 1 1.4 1.8 3 1.8 5.3 0 3.7-3 6.4-7 6.4Zm0 0c-1.7 0-3-1.2-3-2.8 0-1.8 1.7-2.9 2.3-4.4 1.6 1.2 3.7 2.4 3.7 4.5 0 1.5-1.3 2.7-3 2.7Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  pin: 'M12 21s-6-5.7-6-11a6 6 0 1 1 12 0c0 5.3-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  // game sections (illuminated tabs)
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  medic: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v8M8 12h8',
  play: 'M4.5 4.5h15v15h-15zM10 8.5l5 3.5-5 3.5v-7Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.9.7 3.2 2.5 3.5 5.2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  alert: 'M12 3.5 21.5 20h-19L12 3.5ZM12 10v4.5m0 2.5v.5',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
  // sports
  football: 'M5.6 18.4C3.4 16.2 4 10.6 7.6 7S16.2 3.4 18.4 5.6 20 13.4 16.4 17 7.8 20.6 5.6 18.4ZM9.5 14.5l5-5M10.7 11.3l2 2M12.3 9.7l2 2M9.1 12.9l2 2',
  baseball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM6.3 5c1.8 1.9 2.7 4.3 2.7 7s-.9 5.1-2.7 7M17.7 5c-1.8 1.9-2.7 4.3-2.7 7s.9 5.1 2.7 7',
  basketball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3v18M5.7 5.6C7.8 7.7 9 9.9 9 12s-1.2 4.3-3.3 6.4M18.3 5.6C16.2 7.7 15 9.9 15 12s1.2 4.3 3.3 6.4',
  hockey: 'M15.5 3 10.3 16.8a2.5 2.5 0 0 1-2.3 1.7H3.5M14.5 19.2c0-.9 1.6-1.6 3.5-1.6s3.5.7 3.5 1.6-1.6 1.6-3.5 1.6-3.5-.7-3.5-1.6Z',
  soccer: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.6l3.7 2.7-1.4 4.4H9.7l-1.4-4.4L12 7.6ZM12 3v4.6M15.7 10.3l4.8-1.5M14.3 14.7l2.9 4.1M9.7 14.7l-2.9 4.1M8.3 10.3 3.5 8.8',
  tennis: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM4.7 6.8c3 1.7 4.7 4.2 4.7 7.2 0 2.4-1 4.6-2.8 6.1M19.3 17.2c-3-1.7-4.7-4.2-4.7-7.2 0-2.4 1-4.6 2.8-6.1',
  mma: 'M7.5 11V7.5A4.5 4.5 0 0 1 12 3h2a4.5 4.5 0 0 1 4.5 4.5V13a5 5 0 0 1-5 5H11M7.5 11a2.5 2.5 0 0 0-2.5 2.5v.5A3 3 0 0 0 8 17h1.5M10 18v3h7v-3.6M11 10.5h4.5',
  golf: 'M8 21V3l9 3.6L8 10.2M4.5 21h8',
  more: 'M5 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM19 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  // workspace
  research: 'M6.5 3h11v18l-5.5-3.8L6.5 21V3Z',
  parlays: 'M8 3.5h12v12H8zM4 8v12.5h12.5',
  news: 'M4 5h13v14H6.5A2.5 2.5 0 0 1 4 16.5V5ZM17 9h3v8.5a2 2 0 0 1-3 1.5M7.5 9h6M7.5 12.5h6M7.5 16h3.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z',
  bookmark: 'M6.5 3h11v18l-5.5-3.8L6.5 21V3Z',
  // weather
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  cloud: 'M17.5 19H8a5.5 5.5 0 1 1 1.2-10.9A6 6 0 0 1 20.3 11a4 4 0 0 1-2.8 8Z',
  partly: 'M8.5 2.5v1.6M3.6 4.6l1.1 1.1M13.4 4.6l-1.1 1.1M2 9.5h1.6M5.6 11.6A3.5 3.5 0 0 1 11.7 7M18 20H9.5a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.3 2.2A3 3 0 0 1 18 20Z',
  rain: 'M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.3 8a3.5 3.5 0 0 1-2.8 7ZM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5',
  storm: 'M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.3 8a3.5 3.5 0 0 1-2.8 7ZM12.5 13l-2.5 4h4l-2.5 4',
  wind: 'M3 8h10.5a2.5 2.5 0 1 0-2.4-3.2M3 12h15.5a2.5 2.5 0 1 1-2.4 3.2M3 16h7',
  dome: 'M2.5 19h19M4.5 19a7.5 7.5 0 0 1 15 0M12 11.5V8.5M9 19v-3.5h6V19',
  thermo: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z',
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
      <rect x="3" y="6" width="26" height="4" rx="1" fill="#26355a" />
      <rect x="7" y="13" width="18" height="4" rx="1" fill="#2f6bff" />
      <rect x="11.5" y="20" width="9" height="4" rx="1" fill="#38c8f0" />
      <circle cx="16" cy="28" r="1.8" fill="#f2b53c" />
    </svg>
  );
}

/** The SIFT wordmark: condensed display caps over a tracked descriptor. */
export function SiftWordmark({ compact }: { compact?: boolean }) {
  return (
    <span className={`wordmark${compact ? ' wordmark--compact' : ''}`}>
      <span className="wordmark__w">Sift</span>
      {!compact && <span className="wordmark__d">Sports Intelligence</span>}
    </span>
  );
}
