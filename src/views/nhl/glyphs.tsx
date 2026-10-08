// Hockey glyphs for the NHL screens: the same 24-grid, 1.75px-stroke language as components/Icon, drawn for hockey
// concepts (puck, net, goalie mask, power play, penalty kill, overtime, territory…). Market families and game scripts
// map to a glyph deterministically, so a puck line always looks like a puck line wherever it appears. Glyphs are
// decorative next to their words; given a `label` they become an image with that name.
const PATHS: Record<string, string> = {
  puck: 'M4 9.5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v4.5c0 1.7 3.6 3 8 3s8-1.3 8-3V9.5',
  goal: 'M3.5 19V9a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v10M2 19h20M8.5 6v13M15.5 6v13M3.5 12.5h17M12 17.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
  emptyNet: 'M5 19V9a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v10M3.5 19h18M9.5 6v13M15.5 6v13M2 13h7M6.5 10.5 9 13l-2.5 2.5',
  mask: 'M7.2 4h9.6A2.2 2.2 0 0 1 19 6.2V12c0 4.4-3.1 8-7 8s-7-3.6-7-8V6.2A2.2 2.2 0 0 1 7.2 4ZM8.5 10h7M8.5 13.5h7M12 10v7.5',
  saves: 'M12 3l7 3v5.2c0 4.6-3 8.2-7 9.8-4-1.6-7-5.2-7-9.8V6l7-3ZM8.8 12l2.2 2.2 4.3-4.4',
  shots: 'M13.5 15.5c0-1.2 1.9-2.2 4.2-2.2s4.3 1 4.3 2.2-1.9 2.2-4.3 2.2-4.2-1-4.2-2.2ZM2 8.5h10M4.5 12.5H11M2 16.5h8.5',
  shotVolume: 'M5 7.5c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2Zm0 0v3c0 1.1 3.1 2 7 2s7-.9 7-2v-3M5 13.5v3c0 1.1 3.1 2 7 2s7-.9 7-2v-3',
  chances: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-4.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v3M12 19v3M2 12h3M19 12h3',
  assists: 'M5.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.3 15.4l9.4-6.2M13.6 7.6l3.1 1.6-1.4 3.2',
  points: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  powerPlay: 'M13 3L5 14h6l-1 7 8-11h-6l1-7Z',
  penaltyKill: 'M12 3l7 3v5.2c0 4.6-3 8.2-7 9.8-4-1.6-7-5.2-7-9.8V6l7-3ZM9 12h6',
  specialTeams: 'M3.5 12.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0ZM8 8h12.5v4.5h-8M16 8V5.5',
  overtime: 'M20 12a8 8 0 1 1-2.4-5.7M20.5 3.5v4h-4M12 8v4.2l2.8 1.8',
  period: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 3v9l7.6 4.4',
  territory: 'M7 5h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4ZM12 5v14M15 12h3.5M16.8 10.2 18.6 12l-1.8 1.8',
  highEvent: 'M2.5 16.5 6.5 10l3 4.5 4-9 3 6 2.5-3.5 2.5 3',
  lowEvent: 'M2.5 13h5l1.3-1.6 1.7 2.6 1.3-1H21.5',
  backAndForth: 'M4 9h15M15.5 5.5 19 9l-3.5 3.5M20 15H5M8.5 11.5 5 15l3.5 3.5',
  total: 'M17 5H7l5.5 7L7 19h10',
  moneyline: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6M10 17h4',
  puckLine: 'M3 14c0-1.4 2.7-2.5 6-2.5s6 1.1 6 2.5-2.7 2.5-6 2.5-6-1.1-6-2.5Zm0 0v2.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V14M18.5 3.5v5M16 6h5M16 11h5',
  teamTotal: 'M3.5 19V9a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v10M2 19h20M9 10h6M9 14h6M10.5 8.5 9.5 15.5M14.5 8.5l-1 7',
  stick: 'M15.5 3 10.3 16.8a2.5 2.5 0 0 1-2.3 1.7H3.5M14.5 19.2c0-.9 1.6-1.6 3.5-1.6s3.5.7 3.5 1.6-1.6 1.6-3.5 1.6-3.5-.7-3.5-1.6Z',
  lines: 'M5 6h14M5 12h14M5 18h14M8 4v4M12 10v4M16 16v4',
  alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17v.3',
};

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 18, label, className }: { name: string; size?: number; label?: string; className?: string }) {
  const d = PATHS[name] ?? PATHS.puck;
  return (
    <svg
      className={`nglyph${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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

export const FAMILY_GLYPH: Record<string, string> = {
  game_winner: 'moneyline', game_spread: 'puckLine', game_total: 'total', team_total: 'teamTotal', period_winner: 'period', period_total: 'period',
  period_spread: 'period', game_overtime: 'overtime', game_early_goal: 'overtime', player_points: 'points', player_assists: 'assists',
  player_goals: 'goal', first_goal: 'goal', goalie_saves: 'saves', player_shots: 'shots',
};

export const SCRIPT_GLYPH: Record<string, string> = {
  HOME_CONTROL: 'territory', AWAY_CONTROL: 'territory', OPEN_GAME: 'highEvent', TIGHT_LOW_EVENT: 'lowEvent', SPECIAL_TEAMS: 'powerPlay',
  GOALIE_DRIVEN: 'mask', BACK_AND_FORTH: 'backAndForth',
};

export function familyGlyph(family: string | null | undefined): string {
  return FAMILY_GLYPH[family ?? ''] ?? 'puck';
}
