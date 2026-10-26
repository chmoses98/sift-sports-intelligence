/* Renders the redesign mockups from a frozen snapshot of REAL published data (data.js, captured 2026-10-26): tonight's DAL @ PHI.
   Every number on a screen comes from that snapshot; layout and interaction states are design proposals. Nothing here is a model output
   that SIFT has not published: where a lane has no published value it renders as unavailable. */
const D = window.D;
const Q = new URLSearchParams(location.search);
const SCREEN = Q.get('s') || 'p1', ANNOT = Q.has('annot'), LONG = Q.get('h');
const $ = (s, el = document) => el.querySelector(s);
const lg = (t, s = 28, cls = '') => `<img class="lg ${cls}" src="assets/teams/${t}.webp" width="${s}" height="${s}" alt="${t}">`;
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const sgn = (n, d = 3) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d);
const pct = (n) => Math.round(n * 100);
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/* ---------- icons */
const P = { back: 'M15 5l-7 7 7 7', star: 'M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z', bm: 'M7 4h10v16l-5-4-5 4z', sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6', chevR: 'M9 5l7 7-7 7', chevD: 'M5 9l7 7 7-7', info: 'M12 8v.01M12 11v6M12 3a9 9 0 100 18 9 9 0 000-18z', lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z', home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z', games: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', search: 'M10.6 3.8a6.8 6.8 0 100 13.6 6.8 6.8 0 000-13.6zM15.6 15.6l4.8 4.8', follow: 'M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z', bell: 'M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0', lens: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z', arrow: 'M5 12h14M14 7l5 5-5 5', check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18' };
const I = (n, s = 22, c = 'currentColor', fill = 'none', sw = 1.8) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></svg>`;

const chrome = (active) => `<div class="sb"><span>9:41</span><i><svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="#fff"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="#fff"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="#fff"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="#fff"/></svg><svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.5" fill="none" stroke="#fff" opacity=".5"/><rect x="2" y="2" width="16" height="8" rx="2" fill="#fff"/><rect x="23" y="4" width="1.6" height="4" rx=".8" fill="#fff" opacity=".5"/></svg></i></div>
<nav class="tb">${[['home', 'Home'], ['games', 'Games'], ['search', 'Explore'], ['follow', 'Following']].map(([i, t]) => `<a class="${t === active ? 'on' : ''}">${I(i, 24, 'currentColor', 'none', 1.7)}${t}</a>`).join('')}</nav><div class="hi"></div>`;
const st = (kind, tag) => `data-st="${kind}" data-tag="${tag}"`; // data-status annotation: ok = implemented today, wire = published data exists but v3 does not use it yet, new = needs a new integration/data

/* ====================================================================================================================
   PLAYER RESEARCH — CeeDee Lamb, receptions (a PROMOTED projection family), DAL at PHI, Monday 8:15 PM ET
   ==================================================================================================================== */
const PL = D.players['CeeDee Lamb'];
const LOG = PL.log; // 19 real games, 2025 + 2026
const LAST = LOG.slice(-10);
const recOf = (g) => g.receiving.rec;
const ladder = PL.rec_ladder; // Kalshi "N+" receptions, YES ask in cents
const askAt = (k) => (ladder.find((r) => r.k === k) || {}).ask;
const PRJ = PL.proj.receptions, TGT = PL.proj.targets, YDS = PL.proj.receiving_yards;
const sift = (k) => (PRJ.thresholds[String(k)] != null ? Math.round(PRJ.thresholds[String(k)] * 100) : null);
const hits = (games, k) => games.filter((g) => recOf(g) >= k).length;
const nearest50 = ladder.reduce((a, r) => (Math.abs(r.ask - 50) < Math.abs(a.ask - 50) ? r : a));
const K0 = nearest50.k; // rung closest to 50 cents
const dShort = (g) => `${+g.date.slice(5, 7)}/${+g.date.slice(8, 10)}`;

function barChart({ games, k, w = 338, h = 190, scrub = false, ymax = null, proj = true, sel = null }) {
  const L = 22, R = 46, T = 16, B = 36, pw = w - L - R, ph = h - T - B;
  const slots = games.length + (proj ? 1 : 0), sw = pw / slots, bw = Math.min(19, sw - 7);
  const mx = ymax || Math.max(...games.map(recOf), k + 2, proj ? PRJ.p90 : 0);
  const step = mx > 12 ? 5 : 2, top = Math.ceil(mx / step) * step;
  const y = (v) => T + ph - (v / top) * ph, cx = (i) => L + sw * i + sw / 2;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>
  <linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee8c6"/><stop offset="1" stop-color="#12a58f"/></linearGradient>
  <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7e72"/><stop offset="1" stop-color="#d4514a"/></linearGradient>
  <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(22,201,220,.10)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(22,201,220,.55)" stroke-width="2"/></pattern></defs>`;
  for (let v = 0; v <= top; v += step) s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(120,170,200,.14)"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="#7593a8">${v}</text>`;
  games.forEach((g, i) => {
    const v = recOf(g), hit = v >= k, x = cx(i);
    const prev = games[i - 1];
    if (prev && prev.season !== g.season) s += `<line x1="${L + sw * i}" x2="${L + sw * i}" y1="${T - 8}" y2="${h - B + 4}" stroke="rgba(160,200,225,.35)" stroke-dasharray="3 4"/><text x="${L + sw * i - 4}" y="${T - 4}" text-anchor="end" font-size="9.5" fill="#7593a8">${prev.season}</text><text x="${L + sw * i + 4}" y="${T - 4}" font-size="9.5" fill="#7593a8">${g.season}</text>`;
    s += `<rect x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" rx="4" fill="url(#${hit ? 'go' : 'gu'})" ${sel === i ? 'stroke="#fff" stroke-width="1.6"' : ''} opacity="${sel != null && sel !== i ? .55 : 1}"/>`;
    s += `<text x="${x}" y="${y(v) - 4}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${hit ? '#7ff0cf' : '#ffa39c'}">${v}</text>`;
    s += `<image href="assets/teams/${g.opp}.webp" x="${x - 8}" y="${h - B + 8}" width="16" height="16"/>`;
    if (!g.home) s += `<text x="${x - 11}" y="${h - B + 20}" text-anchor="end" font-size="8.5" fill="#7593a8">@</text>`;
    s += `<text x="${x}" y="${h - B + 33}" text-anchor="middle" font-size="9" fill="#8fa9bb">W${g.week}</text>`;
  });
  if (proj) { // the published projection range for tonight: ghost bar with p10..p90 whisker and median tick; never coloured as a hit/miss
    const x = cx(games.length), v = PRJ.median;
    s += `<rect x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="4" fill="url(#hatch)" stroke="rgba(22,201,220,.8)" stroke-dasharray="3 2"/>`;
    s += `<line x1="${x}" x2="${x}" y1="${y(PRJ.p90)}" y2="${y(PRJ.p10)}" stroke="#16c9dc" stroke-width="1.6"/><line x1="${x - 5}" x2="${x + 5}" y1="${y(PRJ.p90)}" y2="${y(PRJ.p90)}" stroke="#16c9dc" stroke-width="1.6"/><line x1="${x - 5}" x2="${x + 5}" y1="${y(PRJ.p10)}" y2="${y(PRJ.p10)}" stroke="#16c9dc" stroke-width="1.6"/>`;
    s += `<rect x="${x - 7}" y="${y(PRJ.mean) - 7}" width="9" height="9" transform="rotate(45 ${x - 2.5} ${y(PRJ.mean) - 2.5})" fill="#16c9dc" stroke="#031523" stroke-width="1.4"/>`;
    s += `<text x="${x}" y="${T - 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#16c9dc">TONIGHT</text><image href="assets/teams/PHI.webp" x="${x - 8}" y="${h - B + 8}" width="16" height="16"/><text x="${x}" y="${h - B + 33}" text-anchor="middle" font-size="9" fill="#16c9dc">W7</text>`;
  }
  // the line
  const ly = y(k - 0.5);
  s += `<line x1="${L}" x2="${w - R + 2}" y1="${ly}" y2="${ly}" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  s += `<g transform="translate(${w - R + 5},${ly - 11})"><rect width="38" height="22" rx="6" fill="#fff"/><text x="19" y="15" text-anchor="middle" font-size="12" font-weight="700" fill="#031523">${k - 0.5}</text></g>`;
  if (scrub) { // drag handle on the line with the ladder rungs as snap points on the right edge
    for (const r of ladder) { const ry = y(r.k - 0.5); if (r.k < 3 || ry < T - 2) continue; s += `<line x1="${w - R - 2}" x2="${w - R + 4}" y1="${ry}" y2="${ry}" stroke="${r.k === k ? '#fff' : 'rgba(160,200,225,.55)'}" stroke-width="${r.k === k ? 2 : 1.2}"/>`; }
    s += `<circle cx="${L + 70}" cy="${ly}" r="15" fill="rgba(255,255,255,.14)"/><circle cx="${L + 70}" cy="${ly}" r="8" fill="#fff" stroke="#031523" stroke-width="2"/>`;
  }
  return s + '</svg>';
}

const heroHtml = () => `<div class="hero"><div class="glow"></div><img class="ph" src="assets/players/dal-ceedee-lamb.webp" alt=""><div class="shade"></div>
  <div class="hbar"><span class="ib">${I('back', 26)}</span><span style="display:flex">${'<span class="ib">' + I('star', 22) + '</span><span class="ib">' + I('bm', 22) + '</span>'}</span></div>
  <div class="who" ${st('ok', 'BUILT')}><div class="wl">${lg('DAL', 46)}<div class="wn"><span class="f">CeeDee</span><span class="l">Lamb</span></div></div><span class="m">WR · DAL · #88 <span class="chip ok" ${st('wire', 'WIRE')}><span class="dot"></span>Likely active</span></span></div>
  <span class="crd">Photo: All-Pro Reels, CC BY-SA 4.0</span></div>`;

const gstripHtml = () => `<div class="card gstrip" ${st('wire', 'WIRE')}>${lg('DAL', 34)}<div class="c"><b>at PHI · Mon 8:15 PM</b><span>${D.weather.temperature_f}°F ${D.weather.short_forecast.toLowerCase()} · wind ${D.weather.wind} · DAL −4.5 · O/U 43.5</span></div>${lg('PHI', 34)}</div>`;
const tabsHtml = (on) => `<div class="tabs">${[['Overview'], ['Props', '11'], ['Matchup'], ['Trends'], ['Log']].map(([t, b]) => `<a class="${t === on ? 'on' : ''}">${t}${b ? `<i>${b}</i>` : ''}</a>`).join('')}</div>`;
const pillsHtml = (badge) => `<div class="pills"><span class="pill on">REC</span><span class="pill">TGT</span><span class="pill">REC YDS</span><span class="pill">TD</span><span class="pill f">${I('sliders', 19)}${badge ? `<b>${badge}</b>` : ''}</span></div>`;

function decideHtml(k = K0, games = LAST) {
  const mk = askAt(k), h = hits(games, k), s = sift(k);
  return `<div class="card decide"><div class="dl"><div><div class="k">Receptions · Over</div><div class="v">${k - 0.5}<small>${k}+ catches · at PHI</small></div></div>
    <div class="r"><div class="p">Over ${mk}¢</div><div class="s">${mk}% implied · pre-fee</div></div><span class="cv">${I('chevD', 20)}</span></div>
    <div class="trio" ${st('wire', 'WIRE')}>
      <div><span class="t m"><span class="sw"></span>Market</span><span class="n m">${mk}%</span><span class="s">Kalshi ask for ${k}+</span></div>
      <div><span class="t h"><span class="sw h"></span>History</span><span class="n h">${pct(h / games.length)}%</span><span class="s">${h} of ${games.length} · observed</span></div>
      <div><span class="t z"><span class="sw z"></span>SIFT model</span><span class="n z">${s != null ? s + '%' : '—'}</span><span class="s">${s != null ? `P(${k}+) · range ${PRJ.p10}–${PRJ.p90}` : 'not published at this rung'}</span></div>
    </div><div class="foot">Three separate lanes · history is observed frequency</div></div>`;
}
const winsHtml = (k, on = 1) => { const sets = [['L5', LOG.slice(-5)], ['L10', LAST], ['2026', LOG.filter((g) => g.season === 2026)], ['vs PHI', LOG.filter((g) => g.opp === 'PHI')], ['All 19', LOG]]; return `<div class="wins" ${st('ok', 'BUILT')}>${sets.map(([n, gs], i) => `<div class="${i === on ? 'on' : ''}">${n}<b>${hits(gs, k)}/${gs.length}</b></div>`).join('')}</div>`; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sumHtml = (k, games = LAST) => { const v = games.map(recOf), avg = v.reduce((a, b) => a + b, 0) / v.length; return `<div class="sum" ${st('ok', 'BUILT')}><div><b class="${hits(games, k) * 2 >= games.length ? 'pos' : 'neg'}">${hits(games, k)}/${games.length}</b><span>Hit rate</span></div><div><b>${f1(avg)}</b><span>Average</span></div><div><b>${med(v)}</b><span>Median</span></div><div><b class="${avg - (k - 0.5) >= 0 ? 'pos' : 'neg'}">${sgn(avg - (k - 0.5), 1)}</b><span>vs line</span></div></div>`; };

function playerOverview() {
  return `<div class="scr">${heroHtml()}${gstripHtml()}${tabsHtml('Overview')}${pillsHtml(0)}${decideHtml()}
  <div class="card chartc">${winsHtml(K0)}<div style="margin-top:4px" ${st('wire', 'WIRE')}>${barChart({ games: LAST, k: K0, h: 160 })}</div>${sumHtml(K0)}</div></div>${chrome('Games')}`;
}

/* P2: dragging the line. The readout replaces the window chips while scrubbing; the ladder below shows all three lanes per rung. */
function playerScrub() {
  const k = 5, g = LAST;
  const rungs = [4, 5, 6, 7, 8, 9];
  const row = (r) => { const mk = askAt(r), hi = Math.round(100 * hits(g, r) / g.length), sf = sift(r); const track = (v, cls, shape) => v == null ? '' : `<i class="mk ${cls}" style="left:${v}%">${shape}</i>`;
    return `<div class="lr ${r === k ? 'on' : ''}"><span class="rk">${r}+</span><div class="tr">${track(mk, 'm', '')}${track(hi, 'h', '')}${track(sf, 'z', '')}</div><span class="vals"><b class="m">${mk}¢</b><b class="h">${hits(g, r)}/${g.length}</b><b class="z">${sf != null ? sf + '%' : '—'}</b></span></div>`; };
  return `<div class="scr"><div class="mini"><span class="ib">${I('back', 24)}</span><img src="assets/players/dal-ceedee-lamb.webp" class="av" alt=""><div class="mt"><b>CeeDee Lamb</b><span>Receptions · at PHI · Mon 8:15 PM</span></div><span class="ib">${I('bm', 22)}</span></div>
  <div class="card chartc" style="margin-top:6px">
    <div class="readout" ${st('new', 'NEW UI')}><span class="rk2">${k}+ <small>over ${k - 0.5}</small></span><span class="m"><i class="sw"></i>${askAt(k)}¢ <small>ask</small></span><span class="h"><i class="sw h"></i>${hits(g, k)}/${g.length} <small>hist.</small></span><span class="z"><i class="sw z"></i>${sift(k)}% <small>SIFT</small></span></div>
    <div ${st('wire', 'WIRE')}>${barChart({ games: g, k, h: 226, scrub: true })}</div><div class="hint">Drag the line · it snaps to the Kalshi rungs · bars recolour and every number updates</div></div>
  <div class="card ladder" ${st('wire', 'WIRE')}><div class="lh"><span class="h2" style="font-size:17px">Alt lines</span><span class="legend"><span class="m"><i class="sw"></i>Market</span><span class="h"><i class="sw h"></i>History</span><span class="z"><i class="sw z"></i>SIFT</span></span></div>
    <div class="axis"><span>0</span><span>50%</span><span>100</span></div>${rungs.map(row).join('')}
    <div class="foot" style="margin-top:6px">Kalshi ask is pre-fee. SIFT publishes P(≥n) at 3+, 5+ and 7+ only; other rungs stay “—”. Lanes are never subtracted into an “edge”.</div></div></div>${chrome('Games')}`;
}

/* P3: research builder. Facets show what they would do BEFORE they are applied: sample size and hit rate per option. */
function playerBuilder() {
  const k = K0, all = LOG, base = LAST;
  const fac = (games) => `${games.length ? `${hits(games, k)}/${games.length}` : '—'}`;
  const bar = (games) => `<i class="fb"><u style="width:${games.length ? Math.round(100 * hits(games, k) / games.length) : 0}%"></u></i>`;
  const chip = (label, games, on = false, off = false) => `<span class="fc ${on ? 'on' : ''} ${off ? 'off' : ''}"><b>${label}</b><em>${off ? 'needs data' : `n ${games.length} · ${fac(games)}`}</em>${off ? '' : bar(games)}</span>`;
  const away = base.filter((g) => !g.home), home = base.filter((g) => g.home);
  const rest = (g, i) => { const prev = all[all.indexOf(g) - 1]; return prev ? (new Date(g.date) - new Date(prev.date)) / 864e5 : null; };
  const won = base.filter((g) => g.score.for > g.score.against), lost = base.filter((g) => g.score.for < g.score.against);
  const oppRank = Object.fromEntries(D.rankings.adj_def_db_epa.entries.map((e) => [e.t, e.r]));
  const tough = base.filter((g) => oppRank[g.opp] != null && oppRank[g.opp] <= 10), soft = base.filter((g) => oppRank[g.opp] != null && oppRank[g.opp] >= 19);
  const snap = base.filter((g) => g.snaps && g.snaps.pct >= 0.85), tshare = base.filter((g) => g.receiving.target_share >= 0.25);
  const matched = away;
  const sq = base.map((g) => { const m = matched.includes(g), hit = recOf(g) >= k; return `<i class="sq ${m ? (hit ? 'h' : 'u') : 'x'}"></i>`; }).join('');
  return `<div class="scr" style="filter:blur(2px) brightness(.55)">${heroHtml()}${gstripHtml()}${tabsHtml('Overview')}${pillsHtml(1)}</div><div class="scrim"></div>
  <div class="sheet"><div class="grab"></div><div class="sh"><span class="h2">Research filters</span><span style="color:var(--cyan);font:500 15px var(--f-ui)">Reset</span></div>
   <div class="live" ${st('ok', 'BUILT')}><div><div class="big num">${matched.length} games match</div><div class="s">Hit ${hits(matched, k)}/${matched.length} at ${k}+ · avg ${f1(matched.reduce((a, g) => a + recOf(g), 0) / matched.length)}</div></div><div class="sqs">${sq}</div></div>
   <div class="fg"><div class="fl">Time range</div><div class="row">${[['L5', all.slice(-5)], ['L10', base], ['2026', all.filter((g) => g.season === 2026)], ['All 19', all]].map(([n, g], i) => `<span class="seg ${i === 1 ? 'on' : ''}">${n}</span>`).join('')}</div></div>
   <div class="fg" ${st('ok', 'BUILT')}><div class="fl">Site</div><div class="row">${chip('All', base)}${chip('Home', home)}${chip('Away', away, true)}</div></div>
   <div class="fg"><div class="fl">Opponent</div><div class="row" ${st('wire', 'WIRE')}>${chip('vs PHI', all.filter((g) => g.opp === 'PHI'))}${chip('Top-10 D', tough)}${chip('Bottom-10 D', soft)}</div><div class="note">Opponent tiers use each team’s current season rank, not its rank on the game date.</div></div>
   <div class="fg" ${st('ok', 'BUILT')}><div class="fl">Role</div><div class="row">${chip('Snaps ≥ 85%', snap)}${chip('Target share ≥ 25%', tshare)}</div></div>
   <div class="fg" ${st('ok', 'BUILT')}><div class="fl">Game script</div><div class="row">${chip('Team won', won)}${chip('Team lost', lost)}${chip('Favorite', [], false, true)}</div></div>
   <div class="fg" ${st('ok', 'BUILT')}><div class="fl">Rest</div><div class="row">${chip('≤ 6 days', base.filter((g) => rest(g) != null && rest(g) <= 6))}${chip('7 days', base.filter((g) => rest(g) === 7))}${chip('8+ days', base.filter((g) => rest(g) >= 8))}</div></div>
   <div class="fg locked" ${st('new', 'NEW DATA')}><div class="fl">${I('lock', 13)} Needs more data</div><div class="row">${chip('Teammate out', [], false, true)}${chip('Weather', [], false, true)}${chip('Pace', [], false, true)}</div></div>
   <div class="apply">Show ${matched.length} games</div></div>${chrome('Games').replace(/<nav.*?<\/nav>/s, '')}`;
}

/* P4: the player’s Matchup tab. Opportunity funnel from published projection rows, opponent strips from published rankings. */
function strip({ key, team, label, unitFmt, inv = false, w = 330 }) {
  const R = D.rankings[key], vals = R.entries.map((e) => e.v), mn = Math.min(...vals), mxv = Math.max(...vals);
  const hib = R.hib; // orient so that RIGHT is always better
  const x = (v) => { let t = (v - mn) / (mxv - mn || 1); if (!hib) t = 1 - t; return 8 + t * (w - 16); };
  const me = R.entries.find((e) => e.t === team);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let s = `<svg width="${w}" height="62" viewBox="0 0 ${w} 62"><line x1="8" x2="${w - 8}" y1="30" y2="30" stroke="rgba(120,170,200,.28)" stroke-width="2" stroke-linecap="round"/>`;
  let lastX = -99, flip = 1; [...R.entries].sort((p, q) => x(p.v) - x(q.v)).forEach((e) => { const px = x(e.v); flip = px - lastX < 7 ? -flip : 1; lastX = px; if (e.t !== team) s += `<circle cx="${px}" cy="${30 + (flip === -1 ? 7 : 0)}" r="3.4" fill="rgba(150,190,215,.6)"/>`; });
  s += `<line x1="${x(avg)}" x2="${x(avg)}" y1="20" y2="40" stroke="#f5bd5b" stroke-width="1.5"/><text x="${x(avg)}" y="14" text-anchor="middle" font-size="9.5" fill="#f5bd5b">league avg</text>`;
  s += `<text x="8" y="58" font-size="10" fill="#7593a8">Worst</text><text x="${w - 8}" y="58" text-anchor="end" font-size="10" fill="#7593a8">Best</text>`;
  s += `<circle cx="${x(me.v)}" cy="30" r="13" fill="#031523" stroke="${inv ? '#ff9b52' : '#16c9dc'}" stroke-width="2.2"/><image href="assets/teams/${team}.webp" x="${x(me.v) - 9}" y="21" width="18" height="18"/>`;
  return s + '</svg>';
}
const rkOf = (key, team) => { const e = D.rankings[key].entries.find((x) => x.t === team); return { r: e.r, n: D.rankings[key].n, v: e.v }; };

function playerMatchup() {
  const tpa = D.team_proj.teams.find((t) => t.team === 'DAL' && t.family === 'team_pass_attempts');
  const ts = TGT.mean / tpa.mean, cr = PRJ.mean / TGT.mean, ypr = YDS.mean / PRJ.mean;
  const rng = (v, lo, hi, max) => `<i class="rg"><u style="left:${100 * lo / max}%;width:${100 * (hi - lo) / max}%"></u><s style="left:${100 * v / max}%"></s></i>`;
  const node = (val, lbl, lo, hi, mean, max) => `<div class="cn"><b class="num">${val}</b><span>${lbl}</span>${rng(mean, lo, hi, max)}<em>${lo}–${hi}</em></div>`;
  const op = (t) => `<div class="cx"><b>${t}</b>${I('arrow', 14, '#16c9dc')}</div>`;
  const e1 = rkOf('adj_def_db_epa', 'PHI'), e2 = rkOf('adj_def_explosive', 'PHI');
  const who = (d) => d.split(':')[0];
  const out = D.inj.filter((i) => i.status === 'OUT');
  const phiD = out.filter((i) => /, PHI\)/.test(who(i.detail)) && /\((CB|S|LB|DE|DT|EDGE)/.test(who(i.detail))), dalO = out.filter((i) => /, DAL\)/.test(who(i.detail)) && /\((WR|TE|QB|OT|OL|RB)/.test(who(i.detail)));
  const nm = (i) => who(i.detail).replace(/ \(([A-Z]+), [A-Z]+\)/, ' <small>$1</small>');
  return `<div class="scr"><div class="mini"><span class="ib">${I('back', 24)}</span><img src="assets/players/dal-ceedee-lamb.webp" class="av" alt=""><div class="mt"><b>CeeDee Lamb</b><span>WR · DAL at PHI · Mon 8:15 PM</span></div><span class="ib">${I('bm', 22)}</span></div>
  ${tabsHtml('Matchup')}
  <div class="card sec" style="margin-top:8px" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">How the projection builds</span><span class="chip cy">research-only</span></div>
    <div class="chain">${node(f1(tpa.mean), 'DAL pass att', tpa.p10, tpa.p90, tpa.mean, 60)}${op(f1(ts * 100) + '%')}${node(f1(TGT.mean), 'Lamb targets', TGT.p10, TGT.p90, TGT.mean, 16)}${op(Math.round(cr * 100) + '%')}${node(f1(PRJ.mean), 'Receptions', PRJ.p10, PRJ.p90, PRJ.mean, 14)}${op(f1(ypr) + ' yds')}${node(Math.round(YDS.mean), 'Rec yards', YDS.p10, YDS.p90, YDS.mean, 140)}</div>
    <div class="adj">${PRJ.adjustments.map((a) => `<div>${I('info', 12, '#7593a8')}<span>${a}</span></div>`).join('')}</div>
    <div class="foot">Published ${D.proj_generated.slice(11, 16)}Z · ${PRJ.participation.status.replace('_', ' ').toLowerCase()} per ${PRJ.participation.source.replace('_', ' ')} · shares and rates are arithmetic on the published rows</div></div>
  <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">PHI pass defense</span><span class="note">opponent-adjusted · 2026</span></div>
    <div class="sl"><div class="slh"><span>EPA per dropback allowed</span><b>${sgn(e1.v)} · ${ord(e1.r)} of ${e1.n}</b></div>${strip({ key: 'adj_def_db_epa', team: 'PHI', inv: true })}</div>
    <div class="sl"><div class="slh"><span>Explosive plays allowed</span><b>${ord(e2.r)} of ${e2.n}</b></div>${strip({ key: 'adj_def_explosive', team: 'PHI', inv: true })}</div>
    <div class="lockrow" ${st('new', 'NEW DATA')}>${I('lock', 14)}<span><b>Defense vs wide receivers</b> needs position-level splits, which are not published yet.</span></div></div>
  <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Availability that matters</span><span class="note">ESPN · ${D.inj[0].as_of.slice(11, 16)}Z</span></div>
    <div class="av2"><div><span class="eyebrow">PHI defense · out</span>${phiD.slice(0, 3).map((i) => `<div class="pr"><span class="chip bad">OUT</span>${nm(i)}</div>`).join('') || '<div class="note">No listed absences</div>'}</div><div><span class="eyebrow">DAL offense · out</span>${dalO.slice(0, 3).map((i) => `<div class="pr"><span class="chip bad">OUT</span>${nm(i)}</div>`).join('') || '<div class="note">No listed absences</div>'}</div></div></div></div>${chrome('Games')}`;
}

/* ====================================================================================================================
   GAME MATCHUP — DAL at PHI, opponent-adjusted offense versus defense
   ==================================================================================================================== */
const M = Object.fromEntries(D.matchup.map((m) => [m.metric.split('.').pop(), m]));
const side = { DAL: 'away', PHI: 'home' };
const UNITS = [
  { id: 'epa', title: 'Overall', unit: 'EPA per play', off: 'adj_off_epa', def: 'adj_def_epa', phr: 'overall efficiency', oL: 'EPA per play', dL: 'EPA per play allowed' },
  { id: 'pass', title: 'Passing', unit: 'EPA per dropback', off: 'adj_off_db_epa', def: 'adj_def_db_epa', phr: 'the passing game', oL: 'EPA per dropback', dL: 'EPA per dropback allowed' },
  { id: 'rush', title: 'Rushing', unit: 'EPA per rush', off: 'adj_off_rush_epa', def: 'adj_def_rush_epa', phr: 'the running game', oL: 'EPA per rush', dL: 'EPA per rush allowed' },
  { id: 'ed', title: 'Early downs', unit: 'EPA per early-down play', off: 'adj_off_ed_epa', def: 'adj_def_ed_epa', phr: 'early downs', oL: 'early-down EPA', dL: 'early-down EPA allowed' },
  { id: 'xp', title: 'Explosive plays', unit: 'explosive-play rate', off: 'adj_off_explosive', def: 'adj_def_explosive', phr: 'explosive plays', oL: 'explosive-play rate', dL: 'explosive plays allowed' },
  { id: 'press', title: 'Pass rush', unit: 'sack rate', off: 'adj_off_sack_rate', def: 'adj_def_sack_rate', phr: 'pass protection vs pass rush', oL: 'sack rate allowed', dL: 'sack rate' },
  { id: 'to', title: 'Turnovers', unit: 'turnover rate', off: 'adj_off_to_rate', def: 'adj_def_to_rate', phr: 'ball security vs takeaways', oL: 'turnover rate', dL: 'takeaway rate' },
];
const pctile = (o) => Math.round(100 * (o.n - o.rank) / (o.n - 1)); // 100 = best in the league for that unit
function unitFor(u, offTeam, defTeam) {
  const o = M[u.off][side[offTeam]], d = M[u.def][side[defTeam]];
  const po = pctile(o), pd = pctile(d), gap = po - pd; // offense percentile minus opposing defense percentile
  return { u, o, d, po, pd, gap, tag: gap >= 15 ? 'off' : gap <= -15 ? 'def' : 'even' };
}
const fmtV = (key, v) => (key.includes('explosive') || key.includes('sack') || key.includes('to_rate') ? (v >= 0 ? '+' : '−') + (Math.abs(v) * 100).toFixed(1) + ' pts' : sgn(v, 3));

function tugRow(r, offT, defT, open = false) {
  const { u, o, d, po, pd, gap } = r, lo = Math.min(po, pd), hi = Math.max(po, pd), win = gap >= 0 ? 'var(--off)' : 'var(--def)';
  const edge = r.tag === 'off' ? `Tilts ${offT} +${Math.abs(gap)}` : r.tag === 'def' ? `Tilts ${defT} +${Math.abs(gap)}` : `Even ${gap >= 0 ? '+' : '−'}${Math.abs(gap)}`;
  return `<div class="tug ${open ? 'open' : ''}"><div class="th">${open ? '<span>Percentile gap · tilt</span>' : `<b>${u.title}</b><span>${u.unit}</span>`}<em style="color:${r.tag === 'off' ? 'var(--off)' : r.tag === 'def' ? 'var(--def)' : 'var(--dim)'}">${edge}</em></div>
   <div class="trk"><div class="rail"></div><div class="gapf" style="left:${lo}%;width:${hi - lo}%;background:${win}"></div>
    <span class="mkr o" style="left:${po}%">${lg(offT, 17)}</span><span class="mkr d" style="left:${pd}%">${lg(defT, 17)}</span></div>
   <div class="tv"><div><span style="color:var(--off)">${offT} offense <em>· ${ord(o.rank)}</em></span><b>${fmtV(u.off, o.value)}</b></div><div style="text-align:right"><span style="color:var(--def)">${defT} defense <em>· ${ord(d.rank)}</em></span><b>${fmtV(u.def, d.value)} allowed</b></div></div></div>`;
}

const edgeMeter = (offT, defT) => { const rs = UNITS.map((u) => unitFor(u, offT, defT)), c = (t) => rs.filter((r) => r.tag === t).length; return { rs, html: `<div class="gb">${rs.map((r) => `<i class="${r.tag}"></i>`).join('')}</div><div class="lgn"><span style="--c:var(--off)">${c('off')} ${offT}</span><span style="--c:#34506a">${c('even')} even</span><span style="--c:var(--def)">${c('def')} ${defT}</span></div>` }; };

function headerHtml(compact = false) {
  if (compact) return `<div class="cbar"><span class="ib">${I('back', 24)}</span><div class="cm">${lg('DAL', 28)}<b>DAL</b><span>at</span><b>PHI</b>${lg('PHI', 28)}</div><span class="cs">Mon 8:15 PM</span><span class="ib">${I('bell', 21)}</span></div>`;
  return `<div class="ghero"><div class="glow2"></div><div class="hbar"><span class="ib">${I('back', 26)}</span><div class="gl0"><b>NFL · Week 7</b><span>Today · 8:15 PM · ESPN</span></div><span style="display:flex"><span class="ib">${I('star', 22)}</span><span class="ib">${I('bell', 22)}</span></span></div>
   <div class="teams"><div>${lg('DAL', 54)}<b>Dallas</b></div><em>at</em><div>${lg('PHI', 54)}<b>Philadelphia</b></div></div></div>
  <div class="sw2" ${st('ok', 'BUILT')}><div class="t on"><span>DAL @ PHI</span><b>8:15 PM</b></div><div class="t"><span>KC @ SEA</span><b>11:30 PM</b></div><div class="t"><span>Games</span>${I('chevR', 16)}</div></div>`;
}
const gtabs = (on) => `<div class="tabs gt">${['Overview', 'Game Script', 'Matchup', 'Props', 'Stats'].map((t) => `<a class="${t === on ? 'on' : ''}">${t}</a>`).join('')}</div>`;

function matchupMain() {
  const A = edgeMeter('DAL', 'PHI'), B = edgeMeter('PHI', 'DAL');
  const rows = UNITS.slice(0, 5).map((u) => tugRow(unitFor(u, 'PHI', 'DAL'), 'PHI', 'DAL')).join('');
  return `<div class="scr">${headerHtml()}${gtabs('Matchup')}
  <div class="pad" style="margin-top:10px"><div class="seg2" ${st('wire', 'WIRE')}>
    <div class="sg"><span class="s1">${lg('DAL', 17)}DAL offense</span><span class="s2">${lg('PHI', 17)}vs PHI defense</span>${A.html}</div>
    <div class="sg on"><span class="s1">${lg('PHI', 17)}PHI offense</span><span class="s2">${lg('DAL', 17)}vs DAL defense</span>${B.html}</div></div>
   <div class="mode"><span class="chip cy">Opponent-adjusted ${I('chevD', 12)}</span><span class="chip">Season ${I('chevD', 12)}</span><span class="note" style="margin:0 0 0 auto">Right = better</span></div>
   <div class="card tugs" ${st('wire', 'WIRE')}>${rows}</div></div></div>${chrome('Games')}`;
}

function matchupExpanded() {
  const T = (t) => D.weeks[t];
  const spark = (vals, color, w = 150, h = 44, lastN = 6, avg = null) => { const v = vals.slice(-lastN), mn = Math.min(...v, avg ?? 9), mx = Math.max(...v, avg ?? -9), x = (i) => 6 + i * ((w - 12) / (v.length - 1)), y = (a) => h - 6 - ((a - mn) / (mx - mn || 1)) * (h - 14);
    return `<svg width="${w}" height="${h}">${avg != null ? `<line x1="4" x2="${w - 4}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(245,189,91,.5)" stroke-dasharray="3 3"/>` : ''}<polyline fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" points="${v.map((a, i) => `${x(i)},${y(a)}`).join(' ')}"/>${v.map((a, i) => `<circle cx="${x(i)}" cy="${y(a)}" r="${i === v.length - 1 ? 4 : 2.4}" fill="${color}"/>`).join('')}</svg>`; };
  const dalO = T('DAL').map((w) => w.o_db_epa), phiD = T('PHI').map((w) => w.d_db_epa);
  const r1 = unitFor(UNITS[1], 'DAL', 'PHI');
  return `<div class="scr">${headerHtml(true)}${gtabs('Matchup')}
  <div class="pad" style="margin-top:10px">
   <div class="card sec" style="padding:12px 12px 8px"><div class="sh2"><span class="h2">Passing</span><span class="note">EPA per dropback · opponent-adjusted</span></div>
    ${tugRow(r1, 'DAL', 'PHI', true)}
    <div class="sl" ${st('wire', 'WIRE')}><div class="slh"><span>${lg('DAL', 16)} DAL offense · league</span><b>${ord(r1.o.rank)} of ${r1.o.n}</b></div>${strip({ key: 'adj_off_db_epa', team: 'DAL', w: 334 })}</div>
    <div class="sl" ${st('wire', 'WIRE')}><div class="slh"><span>${lg('PHI', 16)} PHI defense · league</span><b>${ord(r1.d.rank)} of ${r1.d.n}</b></div>${strip({ key: 'adj_def_db_epa', team: 'PHI', inv: true, w: 334 })}</div></div>
   <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Weekly trend</span><span class="note">raw, not opponent-adjusted</span></div>
    <div class="tw"><div><div class="slh"><span>${lg('DAL', 16)} DAL offense</span><b>${sgn(dalO.slice(-1)[0])}</b></div>${spark(dalO, '#16c9dc', 150, 50, 6, 0)}<span class="note">last 6 weeks · EPA / dropback</span></div>
     <div><div class="slh"><span>${lg('PHI', 16)} PHI defense</span><b>${sgn(phiD.slice(-1)[0])}</b></div>${spark(phiD, '#ff9b52', 150, 50, 6, 0)}<span class="note">last 6 weeks · EPA / dropback</span></div></div></div>
   <div class="rel" ${st('ok', 'BUILT')}><span class="eyebrow">Related</span><div class="chs"><span class="chip">Dropback success rate</span><span class="chip">Pressure rate</span><span class="chip">Explosive pass rate</span><span class="chip">Open full ranking ${I('chevR', 12)}</span></div></div>
   <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Where this shows up</span></div>
    ${[['DAL team total over 21.5', '49¢', 'Market'], ['Lamb receptions 7+', `${askAt(7)}¢`, 'Props · research'], ['Goedert receptions 5+', `${D.players['Dallas Goedert'].rec_ladder.find((r) => r.k === 5).ask}¢`, 'Props · research']].map(([a, b, c]) => `<div class="mr"><span>${a}<small>${c}</small></span><b class="num">${b}</b>${I('chevR', 16, '#7593a8')}</div>`).join('')}</div></div></div>${chrome('Games')}`;
}

function matchupLower() {
  const tp = (t, f) => D.team_proj.teams.find((x) => x.team === t && x.family === f);
  const shape = (t) => { const p = tp(t, 'team_pass_attempts'), r = tp(t, 'team_rush_attempts'), tot = p.mean + r.mean; return `<div class="sr"><span>${lg(t, 18)}${t}</span><div class="sb2"><i class="pa" style="width:${100 * p.mean / tot}%"><b>${f1(p.mean)}</b></i><i class="ra" style="width:${100 * r.mean / tot}%"><b>${f1(r.mean)}</b></i></div></div>`; };
  const tempo = (t) => { const v = Object.entries(D.tempo).sort((a, b) => b[1].plays - a[1].plays), i = v.findIndex((x) => x[0] === t); return { v: D.tempo[t].plays, r: i + 1 }; };
  const KM = [
    { n: 'CeeDee Lamb', t: 'DAL', pos: 'WR', unit: 'PHI pass defense', fact: `${ord(rkOf('adj_def_db_epa', 'PHI').r)} of 28 · EPA/dropback`, p: 'Rec 7+', ask: askAt(7), photo: true },
    { n: 'Dallas Goedert', t: 'PHI', pos: 'TE', unit: 'DAL pass defense', fact: `${ord(rkOf('adj_def_db_epa', 'DAL').r)} of 28 · EPA/dropback`, p: 'Rec 5+', ask: D.players['Dallas Goedert'].rec_ladder.find((r) => r.k === 5).ask },
    { n: 'George Pickens', t: 'DAL', pos: 'WR', unit: 'PHI pass defense', fact: `${ord(rkOf('adj_def_db_epa', 'PHI').r)} of 28 · EPA/dropback`, p: 'Rec 5+', ask: D.players['George Pickens'].rec_ladder.find((r) => r.k === 5).ask },
  ];
  const mhp = D.mh[0].pts, W = 330, H = 46, ys = mhp.map((p) => p.ask), mn = Math.min(...ys), mx = Math.max(...ys), x = (i) => 4 + i * ((W - 8) / (mhp.length - 1)), y = (v) => H - 6 - ((v - mn) / (mx - mn || 1)) * (H - 12);
  const outs = (t) => D.inj.filter((i) => i.status === 'OUT' && i.detail.split(':')[0].includes(`, ${t})`)).map((i) => i.detail.split(' (')[0]);
  const all = [...UNITS.map((u) => ({ ...unitFor(u, 'PHI', 'DAL'), off: 'PHI', def: 'DAL' })), ...UNITS.map((u) => ({ ...unitFor(u, 'DAL', 'PHI'), off: 'DAL', def: 'PHI' }))].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const top = all[0], bestDal = all.filter((r) => r.off === 'DAL').sort((a, b) => b.gap - a.gap)[0];
  const dalWin = D.game.find((g) => /-DAL$/.test(g.t)).ask;
  return `<div class="scr">${headerHtml(true)}${gtabs('Matchup')}
  <div class="pad" style="margin-top:10px">
   <div class="card lens" ${st('ok', 'BUILT')}><div class="lh2">${I('lens', 22, '#16c9dc')}<b>SIFT Lens</b><span class="note">from published matchup rows · 02:45Z</span></div>
    <p>The widest gap in this game is <b>${top.off}’s offense against ${top.def}’s defense in ${top.u.phr}</b>: ${top.def} ranks ${ord(top.d.rank)} of ${top.d.n} in ${top.u.dL}, and ${top.off} ranks ${ord(top.o.rank)} in ${top.u.oL}.</p>
    <p class="cc"><b>Counter-case:</b> ${bestDal.off}’s best matchup is ${bestDal.u.phr} (${ord(bestDal.o.rank)} against ${ord(bestDal.d.rank)}). Rank gaps compare season-long unit strength, not this game; the market has Dallas at ${dalWin}¢ to win.</p></div>
   <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Game shape</span><span class="chip cy">research-only</span></div>
    <div class="note" style="margin-bottom:6px"><i class="lgd pa"></i>Pass attempts <i class="lgd ra" style="margin-left:10px"></i>Rush attempts · projected</div>${shape('DAL')}${shape('PHI')}
    <div class="tp"><span>Plays per game</span><b>${lg('DAL', 14)} ${f1(tempo('DAL').v)} <small>${ord(tempo('DAL').r)}</small></b><b>${lg('PHI', 14)} ${f1(tempo('PHI').v)} <small>${ord(tempo('PHI').r)}</small></b></div></div>
   <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Key matchups</span><span class="note">player ↔ opposing unit</span></div>
    ${KM.map((k) => `<div class="km"><span class="av3">${k.photo ? `<img src="assets/players/dal-ceedee-lamb.webp" alt="">` : lg(k.t, 30)}</span><div class="kt"><b>${k.n}</b><span>${k.pos} · ${k.t} → ${k.unit}</span><em>${k.fact}</em></div><div class="kp"><b class="num">${k.ask}¢</b><span>${k.p}</span></div>${I('chevR', 16, '#7593a8')}</div>`).join('')}</div>
   <div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Context</span><span class="note">published ${D.inj[0].as_of.slice(11, 16)}Z</span></div>
    <div class="ctx"><div><span class="eyebrow">Out</span><div class="pr">${lg('DAL', 14)}<span>${outs('DAL').join(', ') || '—'}</span></div><div class="pr">${lg('PHI', 14)}<span>${outs('PHI').join(', ') || '—'}</span></div></div>
     <div><span class="eyebrow">Weather</span><div class="pr"><b>${D.weather.temperature_f}°F</b><span>${D.weather.short_forecast} · ${D.weather.wind} ${D.weather.wind_direction} · ${D.weather.roof}</span></div></div></div>
    <div class="slh" style="margin-top:8px"><span>DAL win price since open</span><b>${Math.round(ys[0])}¢ → ${Math.round(ys[ys.length - 1])}¢</b></div>
    <svg width="${W}" height="${H}"><polyline fill="none" stroke="#93a9ff" stroke-width="2" points="${mhp.map((p, i) => `${x(i)},${y(p.ask)}`).join(' ')}"/><circle cx="${x(mhp.length - 1)}" cy="${y(ys[ys.length - 1])}" r="4" fill="#93a9ff"/></svg></div></div></div>${chrome('Games')}`;
}

const SCREENS = { p1: playerOverview, p2: playerScrub, p3: playerBuilder, p4: playerMatchup, g1: matchupMain, g2: matchupExpanded, g3: matchupLower };
document.body.innerHTML = `<div class="phone ${ANNOT ? 'annot' : ''}" id="phone" ${LONG ? `style="height:${LONG}px"` : ''}>${(SCREENS[SCREEN] || playerOverview)()}</div>`;
if (LONG) document.querySelectorAll('.tb,.hi').forEach((e) => e.remove());
