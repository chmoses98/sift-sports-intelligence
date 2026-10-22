// The candidate free score feeds and the terms pages that govern them. Used by probe.mjs (on a GitHub runner or your Mac).
// Nothing here is a recommendation: every entry is a candidate to be verified by running the probe and reading its output.

const ymd = (d = new Date()) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const dash = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
/** ESPN's public scoreboard: one URL per sport/league. */
export const ESPN_LEAGUES = [
  ['nfl', 'football/nfl'],
  ['cfb', 'football/college-football?groups=80&limit=400'],
  ['nba', 'basketball/nba'],
  ['nhl', 'hockey/nhl'],
  ['mlb', 'baseball/mlb'],
  ['cbb', 'basketball/mens-college-basketball?groups=50&limit=400'],
  ['mls', 'soccer/usa.1'],
  ['epl', 'soccer/eng.1'],
  ['ucl', 'soccer/uefa.champions'],
  ['atp', 'tennis/atp'],
  ['wta', 'tennis/wta'],
];

export function feedTargets(now = new Date()) {
  const t = [];
  const sb = (p, q = '') => { const [path, query = ''] = p.split('?'); return `${ESPN}/${path}/scoreboard?${[query, q].filter(Boolean).join('&')}`; };
  for (const [k, p] of ESPN_LEAGUES) t.push({ id: `espn-${k}`, group: 'espn', url: sb(p, `dates=${ymd(now)}`), expect: 'json' });
  for (const [k, p] of ESPN_LEAGUES.slice(0, 5)) t.push({ id: `espn-${k}-nodate`, group: 'espn', url: sb(p), expect: 'json' });
  t.push({ id: 'espn-cdn-nfl', group: 'espn', url: 'https://cdn.espn.com/core/nfl/scoreboard?xhr=1&limit=100', expect: 'json' });
  t.push({ id: 'espn-web-header', group: 'espn', url: 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl&limit=20', expect: 'json' });
  // SportScore (free tier, attribution): the endpoint named in its developer docs
  for (const sp of ['basketball', 'football', 'tennis']) t.push({ id: `sportscore-${sp}`, group: 'sportscore', url: `https://sportscore.com/api/widget/matches/?sport=${sp}&limit=50&src=sift-personal-probe`, expect: 'json' });
  // SportScore day fixtures (documented REST v1): by UTC date, with a live filter, and one match detail
  const sc = 'https://sportscore.com/api/v1';
  for (const sp of ['basketball', 'football', 'tennis']) {
    t.push({ id: `sportscore-fixtures-${sp}`, group: 'sportscore', url: `${sc}/fixtures/?sport=${sp}&date=${dash(now)}&limit=200&src=sift-personal-probe`, expect: 'json' });
    t.push({ id: `sportscore-live-${sp}`, group: 'sportscore', url: `${sc}/fixtures/?sport=${sp}&status=live&limit=200&src=sift-personal-probe`, expect: 'json' });
  }
  t.push({ id: 'sportscore-fixtures-basketball-tomorrow', group: 'sportscore', url: `${sc}/fixtures/?sport=basketball&date=${dash(new Date(now.getTime() + 86400000))}&limit=200&src=sift-personal-probe`, expect: 'json' });
  t.push({ id: 'sportscore-match-nba', group: 'sportscore', url: 'https://sportscore.com/api/widget/match/?sport=basketball&slug=memphis-grizzlies-vs-utah-jazz&src=sift-personal-probe', expect: 'json' });
  // NHL official
  t.push({ id: 'nhl-score-now', group: 'nhl', url: 'https://api-web.nhle.com/v1/score/now', expect: 'json' });
  t.push({ id: 'nhl-scoreboard-now', group: 'nhl', url: 'https://api-web.nhle.com/v1/scoreboard/now', expect: 'json' });
  t.push({ id: 'nhl-schedule-now', group: 'nhl', url: 'https://api-web.nhle.com/v1/schedule/now', expect: 'json' });
  // NBA official
  t.push({ id: 'nba-today', group: 'nba', url: 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', expect: 'json' });
  t.push({ id: 'nba-today-browserua', group: 'nba', url: 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', expect: 'json', browserUa: true });
  // MLB official
  for (const back of [1, 2, 3, 4]) t.push({ id: `mlb-schedule-d${back}`, group: 'mlb', url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dash(new Date(now.getTime() - back * 86400000))}&hydrate=linescore,team`, expect: 'json' });
  t.push({ id: 'mlb-schedule', group: 'mlb', url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dash(now)}&hydrate=linescore,team`, expect: 'json' });
  // NFL legacy official scorestrip
  t.push({ id: 'nfl-scorestrip', group: 'nfl', url: 'https://static.nfl.com/liveupdate/scorestrip/ss.xml', expect: 'text' });
  // TheSportsDB (free key 3)
  t.push({ id: 'tsdb-eventsday-nfl', group: 'tsdb', url: `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dash(now)}&l=4391`, expect: 'json' });
  t.push({ id: 'tsdb-eventsday-nhl', group: 'tsdb', url: `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dash(now)}&l=4380`, expect: 'json' });
  t.push({ id: 'tsdb-eventsday-nba', group: 'tsdb', url: `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dash(now)}&l=4387`, expect: 'json' });
  t.push({ id: 'tsdb-eventsday-nhl-browserua', group: 'tsdb', url: `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dash(now)}&l=4380`, expect: 'json', browserUa: true });
  t.push({ id: 'tsdb-livescore-v1', group: 'tsdb', url: 'https://www.thesportsdb.com/api/v1/json/3/latestsoccer.php', expect: 'json' });
  // NCAA (community wrapper over ncaa.com)
  t.push({ id: 'ncaa-fbs', group: 'ncaa', url: 'https://ncaa-api.henrygd.me/scoreboard/football/fbs', expect: 'json' });
  t.push({ id: 'ncaa-mbb', group: 'ncaa', url: 'https://ncaa-api.henrygd.me/scoreboard/basketball-men/d1', expect: 'json' });
  return t;
}

/** Pages whose TEXT decides what we are allowed to do. Saved verbatim (HTML and stripped text). */
/** [id, url, options?] */
export const TERMS = [
  ['espn-disney-terms', 'https://disneytermsofuse.com/'],
  ['espn-disney-terms-full', 'https://disneytermsofuse.com/english/'],
  ['espn-disney-terms-full2', 'https://disneytermsofuse.com/terms-of-use/'],
  ['sportscore-openapi-1', 'https://sportscore.com/developers/openapi.yaml'],
  ['sportscore-openapi-2', 'https://sportscore.com/api/openapi.yaml'],
  ['sportscore-openapi-3', 'https://sportscore.com/static/openapi.yaml'],
  ['nba-terms-browserua', 'https://www.nba.com/termsofuse', { browserUa: true }],
  ['espn-terms-legacy', 'https://www.espn.com/espn/news/story?page=termsofuse'],
  ['espn-robots', 'https://www.espn.com/robots.txt'],
  ['espn-api-robots', 'https://site.api.espn.com/robots.txt'],
  ['nhl-terms', 'https://www.nhl.com/info/terms-of-service'],
  ['nhl-api-robots', 'https://api-web.nhle.com/robots.txt'],
  ['nba-terms', 'https://www.nba.com/termsofuse'],
  ['nba-cdn-robots', 'https://cdn.nba.com/robots.txt'],
  ['mlb-copyright', 'https://gdx.mlb.com/components/copyright.txt'],
  ['mlb-terms', 'https://www.mlb.com/official-information/terms-of-use'],
  ['mlb-statsapi-docs', 'https://statsapi.mlb.com/docs/'],
  ['tsdb-terms', 'https://www.thesportsdb.com/terms'],
  ['tsdb-api', 'https://www.thesportsdb.com/api.php'],
  ['tsdb-docs', 'https://www.thesportsdb.com/documentation'],
  ['sportscore-developers', 'https://sportscore.com/developers/'],
  ['sportscore-api', 'https://sportscore.com/developers/api/'],
  ['sportscore-terms', 'https://sportscore.com/developers/terms/'],
  ['sportscore-sitemap-dev', 'https://sportscore.com/robots.txt'],
  ['rtsapi-terms', 'https://www.realtimesportsapi.com/terms'],
  ['rtsapi-docs', 'https://www.realtimesportsapi.com/docs'],
  ['sportbusy-terms', 'https://www.sportbusy.com/terms/'],
  ['sportbusy-widget', 'https://www.sportbusy.com/widget/'],
  ['ncaa-terms', 'https://www.ncaa.com/terms-use'],
  ['henrygd-readme', 'https://raw.githubusercontent.com/henrygd/ncaa-api/main/README.md'],
];
