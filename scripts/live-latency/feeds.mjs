// Score-change extractors for the latency probe. Each turns one feed's JSON into rows
//   { sport, game, away, home, awayScore, homeScore, status, period, clock, live }
// where `game` is a cross-feed key ("NHL:NYR@BOS") so the same game from different feeds lines up.
//
// STATUS: these parse the feeds' commonly documented shapes from memory and from the public wrapper READMEs. They have
// NOT been run against live payloads (the session that wrote them had no network). The first real run will show any
// drift; a row an extractor cannot read is skipped, never guessed. Tests use SYNTHETIC payloads (code paths only).
//
// RIGHTS: pointing this at an unofficial or unlicensed endpoint is a short, low-rate MEASUREMENT by the owner, not a
// licence to run it as a product. See docs/LIVE_PUSH_ARCHITECTURE.md.

/** Provider abbreviations that differ across feeds -> one spelling, so `NYK` (NBA) and `NY` (ESPN) are one team. */
const ALIAS = {
  NBA: { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX' },
  NHL: { TB: 'TBL', NJ: 'NJD', SJ: 'SJS', LA: 'LAK', UTAH: 'UTA' },
  MLB: { CHW: 'CWS', WSN: 'WSH', AZ: 'ARI', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB' },
  NFL: { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' },
};
export const abbr = (sport, a) => {
  const u = String(a ?? '').trim().toUpperCase();
  return ALIAS[sport]?.[u] ?? u;
};
const int = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : null);
const row = (sport, away, home, awayScore, homeScore, status, period, clock, live) => {
  const a = abbr(sport, away);
  const h = abbr(sport, home);
  if (!a || !h) return null;
  return { sport, game: `${sport}:${a}@${h}`, away: a, home: h, awayScore: int(awayScore), homeScore: int(homeScore), status: status ?? null, period: int(period), clock: clock ?? null, live: !!live };
};

function espn(sport) {
  return (body) => (Array.isArray(body?.events) ? body.events : []).flatMap((ev) => {
    const c = ev.competitions?.[0];
    const home = c?.competitors?.find((x) => x.homeAway === 'home');
    const away = c?.competitors?.find((x) => x.homeAway === 'away');
    const st = c?.status ?? ev.status ?? {};
    const r = home && away ? row(sport, away.team?.abbreviation, home.team?.abbreviation, away.score, home.score, st.type?.name, st.period, st.displayClock, st.type?.state === 'in') : null;
    return r ? [r] : [];
  });
}

const mlb = (body) => (Array.isArray(body?.dates) ? body.dates : []).flatMap((d) => (d.games ?? []).flatMap((g) => {
  const r = row('MLB', g.teams?.away?.team?.abbreviation, g.teams?.home?.team?.abbreviation, g.teams?.away?.score, g.teams?.home?.score,
    g.status?.detailedState, g.linescore?.currentInning, g.linescore?.inningHalf, g.status?.abstractGameState === 'Live');
  return r ? [r] : [];
}));

const nhl = (body) => (Array.isArray(body?.games) ? body.games : []).flatMap((g) => {
  const r = row('NHL', g.awayTeam?.abbrev, g.homeTeam?.abbrev, g.awayTeam?.score, g.homeTeam?.score, g.gameState, g.periodDescriptor?.number ?? g.period, g.clock?.timeRemaining, g.gameState === 'LIVE' || g.gameState === 'CRIT');
  return r ? [r] : [];
});

const nba = (body) => (Array.isArray(body?.scoreboard?.games) ? body.scoreboard.games : []).flatMap((g) => {
  const r = row('NBA', g.awayTeam?.teamTricode, g.homeTeam?.teamTricode, g.awayTeam?.score, g.homeTeam?.score, g.gameStatusText, g.period, g.gameClock, g.gameStatus === 2);
  return r ? [r] : [];
});

/** name -> { sport, url(dateYmd), extract }. A licensed vendor adds its own entry here (written from a recorded sample). */
export const EXTRACTORS = {
  'espn-nfl': { sport: 'NFL', url: () => 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', extract: espn('NFL') },
  'espn-cfb': { sport: 'CFB', url: () => 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard', extract: espn('CFB') },
  'espn-nba': { sport: 'NBA', url: () => 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', extract: espn('NBA') },
  'espn-cbb': { sport: 'CBB', url: () => 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard', extract: espn('CBB') },
  'espn-nhl': { sport: 'NHL', url: () => 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard', extract: espn('NHL') },
  'espn-mlb': { sport: 'MLB', url: () => 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard', extract: espn('MLB') },
  'espn-ucl': { sport: 'SOCCER', url: () => 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', extract: espn('SOCCER') },
  'mlb-statsapi': { sport: 'MLB', url: (ymd) => `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${ymd}&hydrate=team,linescore`, extract: mlb },
  'nhl-web': { sport: 'NHL', url: () => 'https://api-web.nhle.com/v1/score/now', extract: nhl },
  'nba-cdn': { sport: 'NBA', url: () => 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', extract: nba },
};
