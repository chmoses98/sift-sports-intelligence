// Every screen's address. Hash routing (#/nfl/game/evt_…) keeps deep links working on GitHub Pages,
// which cannot rewrite unknown paths to index.html.
const q = (params: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const t = s.toString();
  return t ? `?${t}` : '';
};

export const routes = {
  home: () => '/',
  search: (query?: string) => `/search${q({ q: query })}`,
  sport: (sport: string) => `/${sport}`,
  slate: (sport: string) => `/${sport}/slate`,
  parlays: (sport: string) => `/${sport}/parlays`,
  scorecard: (sport: string) => `/${sport}/scorecard`,
  game: (sport: string, eventId: string, ctx?: { team?: string | null; tab?: string | null; script?: string | null }) =>
    `/${sport}/game/${eventId}${q({ team: ctx?.team, tab: ctx?.tab, script: ctx?.script })}`,
  team: (sport: string, teamId: string, tab?: string) => `/${sport}/team/${teamId}${q({ tab })}`,
  player: (sport: string, playerId: string) => `/${sport}/player/${playerId}`,
  metric: (sport: string, metricId: string, ctx?: { team?: string | null; opp?: string | null; event?: string | null }) =>
    `/${sport}/metric/${metricId}${q({ team: ctx?.team, opp: ctx?.opp, event: ctx?.event })}`,
  ranking: (sport: string, rankingId: string, ctx?: { focus?: string | null; opp?: string | null; pin?: string | null }) =>
    `/${sport}/ranking/${rankingId}${q({ focus: ctx?.focus, opp: ctx?.opp, pin: ctx?.pin })}`,
  market: (sport: string, marketId: string, eventId: string) => `/${sport}/market/${marketId}${q({ event: eventId })}`,
  compare: (sport: string, a: string, b?: string | null) => `/${sport}/compare${q({ a, b })}`,
  tray: () => '/tray',
  games: (ctx?: { sport?: string | null; day?: string | null }) => `/games${q({ sport: ctx?.sport, day: ctx?.day })}`,
  explore: () => '/explore',
  season: (sport: string, ctx?: { week?: string | null; team?: string | null }) => `/${sport}/season${q({ week: ctx?.week, team: ctx?.team })}`,
  intelligence: (ctx?: { ws?: string | null; d?: string | null; sport?: string | null }) => `/intelligence${q({ ws: ctx?.ws, d: ctx?.d, sport: ctx?.sport })}`,
  pulse: (sport?: string | null) => `/intelligence/pulse${q({ sport })}`,
  lab: (sport?: string | null) => `/intelligence/lab${q({ sport })}`,
  board: (ctx?: { game?: string | null }) => `/board${q({ game: ctx?.game })}`,
  packet: (p: { sport: string; scope: 'GAME' | 'SLATE' | 'CUSTOM'; event?: string; start?: string; end?: string; items?: string[] }) =>
    `/packet${q({ sport: p.sport, scope: p.scope, event: p.event, start: p.start, end: p.end, items: p.items?.join(',') })}`,
  props: (sport: string, ctx?: { game?: string | null; player?: string | null; stat?: string | null }) => `/${sport}/props${q({ game: ctx?.game, player: ctx?.player, stat: ctx?.stat })}`,
  status: () => '/status',
  sports: () => '/sports',
  news: () => '/news',
  settings: () => '/settings',
  design: () => '/design',
};
