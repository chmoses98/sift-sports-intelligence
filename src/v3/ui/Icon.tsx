import type { CSSProperties } from 'react';

// One stroke icon set (24px grid, 1.8 stroke, round caps) so every control shares a weight. `fill` fills the shape (active star, active tab).
const P: Record<string, string> = {
  home: 'M4 11.2 12 4l8 7.2V19a1.2 1.2 0 0 1-1.2 1.2H15v-5.7H9v5.7H5.2A1.2 1.2 0 0 1 4 19z',
  explore: 'M10.6 3.8a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM15.6 15.6 20.4 20.4',
  star: 'm12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6 6.9 19.3l1-5.7-4.1-4 5.7-.8z',
  bell: 'M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.6 2.1H4.6zM9.8 20.9h4.4',
  back: 'M15 5.2 8.2 12l6.8 6.8',
  chevR: 'm9 5 7 7-7 7',
  chevD: 'm5 9 7 7 7-7',
  chevU: 'm5 15 7-7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'M10.6 3.8a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM15.6 15.6 20.4 20.4',
  calendar: 'M4.5 6.2h15a.8.8 0 0 1 .8.8v12a.8.8 0 0 1-.8.8h-15a.8.8 0 0 1-.8-.8V7a.8.8 0 0 1 .8-.8zM3.7 10.4h16.6M8 3.8v4M16 3.8v4',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.2M12 7.6v.2',
  share: 'M12 15V3.8M7.8 7.8 12 3.6l4.2 4.2M5.5 12.2v6.4a.9.9 0 0 0 .9.9h11.2a.9.9 0 0 0 .9-.9v-6.4',
  bookmark: 'M7 3.8h10a.8.8 0 0 1 .8.8v15.6L12 15.6l-5.8 4.6V4.6a.8.8 0 0 1 .8-.8z',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 4.6v4.8M7 14.6v4.8',
  check: 'm5 12.6 4.4 4.4L19 7.4',
  plus: 'M12 5v14M5 12h14',
  trend: 'm4 16.5 5-5.2 3.6 3.4L20 7M15 7h5v5',
  clock: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8zM12 7.6V12l3 1.8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.4 20.2a7.6 7.6 0 0 1 15.2 0',
  shield: 'M12 3.4 5 6v5.6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z',
  swap: 'M7 4 3.8 7.2 7 10.4M3.8 7.2H17M17 13.6l3.2 3.2L17 20M20.2 16.8H7',
  wifiOff: 'M3 3l18 18M8.6 8.4A11 11 0 0 0 3 12M5.6 14.6A7.4 7.4 0 0 1 9 12.6M12 19.4h.01M16.2 11.2A11 11 0 0 1 21 14',
  list: 'M8 6.6h11.6M8 12h11.6M8 17.4h11.6M4.4 6.6h.01M4.4 12h.01M4.4 17.4h.01',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  lock: 'M6.2 10.6h11.6a.8.8 0 0 1 .8.8v7.4a.8.8 0 0 1-.8.8H6.2a.8.8 0 0 1-.8-.8v-7.4a.8.8 0 0 1 .8-.8zM8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  refresh: 'M19.6 12a7.6 7.6 0 1 1-2.2-5.4M19.6 4.4v4.4h-4.4',
  ball: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2zM3.6 12h16.8M12 3.4v17.2M6.4 6.2c3.4 3 3.4 8.6 0 11.6M17.6 6.2c-3.4 3-3.4 8.6 0 11.6',
};

export type IconName = keyof typeof P | 'games' | 'following' | 'more' | 'lens';

export function Icon({ name, size = 22, fill = false, className, style, strokeWidth = 1.8 }: { name: IconName; size?: number; fill?: boolean; className?: string; style?: CSSProperties; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', className, style, 'aria-hidden': true as const, focusable: false as const };
  if (name === 'more') return <svg {...common} fill="currentColor"><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></svg>;
  if (name === 'lens') return <LensMark {...common} />;
  const key = name === 'games' ? 'ball' : name === 'following' ? 'star' : name;
  return <svg {...common} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d={P[key]} /></svg>;
}

/** The SIFT Lens mark: a small cluster of four-point sparks in the accent cyan (it is a mark, not an icon, so it keeps its own colour). */
function LensMark(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} fill="none">
      <path d="M8.2 3.2 9.6 6.6 13 8 9.6 9.4 8.2 12.8 6.8 9.4 3.4 8 6.8 6.6z" fill="var(--sift-cyan)" />
      <path d="M17.4 8.6 18.4 11 20.8 12 18.4 13 17.4 15.4 16.4 13 14 12 16.4 11z" fill="var(--sift-cyan)" opacity=".85" />
      <path d="M9.4 14.4 10.4 16.8 12.8 17.8 10.4 18.8 9.4 21.2 8.4 18.8 6 17.8 8.4 16.8z" fill="var(--sift-cyan)" opacity=".7" />
    </svg>
  );
}

/** The SIFT brand mark: two slanted bars, the "S" of the wordmark. */
export function SiftMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <defs><linearGradient id="v3mk" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0fb3d4" /><stop offset="1" stopColor="#5be3f0" /></linearGradient></defs>
      <path d="M5.2 15.4 15.6 5.4" stroke="url(#v3mk)" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M12.4 22.6 22.8 12.6" stroke="url(#v3mk)" strokeWidth="4.6" strokeLinecap="round" />
    </svg>
  );
}
