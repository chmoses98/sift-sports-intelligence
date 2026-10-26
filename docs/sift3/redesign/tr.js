/* Team Research mockups (TR1 to TR6). Every number is read from teams.js: the sport's published explorer team profile
   (NFL: Dallas Cowboys, NHL: Toronto Maple Leafs) and, for opponent strength, the two published opponent-adjusted
   rankings. Ranks, percentiles and windows are the publication's own; records and splits are computed from its game rows.
   Nothing is estimated, and nothing is shown for data SIFT does not publish. */
(function () {
  if (!/^tr\d/.test(SCREEN)) return;
  const T = window.TD, PR = (window.PD || { props: [] }).props;
  const pctOf = (rank, n) => Math.round(100 * (n - rank) / (n - 1)); // 100 = best in the league for that statistic (same rule as the matchup screens)
  const lgx = (sport, t, s = 20) => `<img class="lg" src="assets/teams/${sport === 'NFL' ? '' : sport.toLowerCase() + '/'}${t}.webp" width="${s}" height="${s}" alt="${t}">`;
  const wk = (t, w) => (t.metrics[t.mm] || {}).w;
  const mget = (t, id) => (t._by || (t._by = Object.fromEntries(Object.values(t.metrics).map((m) => [m.id, m]))))[id];
  const M = (t, id, w) => { const m = mget(t, id); if (!m) return null; const x = m.w[w || t.win]; return x ? { ...x, name: m.name, short: m.short, hib: m.hib, unit: m.unit, id } : null; };
  const fmt = (m, d = 3) => (m.v == null ? '—' : Math.abs(m.v) < 1 && m.unit !== 'share' ? (m.v >= 0 ? '+' : '−') + Math.abs(m.v).toFixed(d) : m.unit === 'share' ? (m.v * 100).toFixed(1) + '%' : (+m.v).toFixed(m.unit && /per game|goals/.test(m.unit) ? 2 : 1));
  const rk = (m) => `${ord(m.rank)} of ${m.n}`;
  const f1x = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const dayName = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const md = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const outcome = (o) => (o === 'W' ? 'W' : o === 'L' ? 'L' : o || '');

  /* ---------- team context */
  const DAL = T.DAL, TOR = T.TOR;
  DAL.win = 'SEASON'; TOR.win = '2026-27';
  const rec = (t) => `${t.record[0]}–${t.record[1]}${t.record[2] ? '–' + t.record[2] : ''}`;
  const games = (t, n) => t.games.filter((g) => g.st === 'FINAL').slice(-n);
  const nextG = (t) => t.upcoming[0];
  const oppAbbr = (g) => g.opp;
  const propsOf = (t) => PR.filter((p) => p.team === t.abbr);

  /* ---------- pieces */
  const trHero = (t, glow) => `<div class="hero trh" style="--tc:${glow}"><div class="glow"></div><div class="shade"></div>
    <div class="hbar"><span class="ib">${I('back', 26)}</span><span style="display:flex"><span class="ib">${I('bell' in P ? 'bell' : 'bm', 22)}</span><span class="ib">${I('star', 22)}</span></span></div>
    <div class="who" ${st('ok', 'BUILT')}><div class="wl">${lgx(t.sport, t.abbr, 54)}<div class="wn"><span class="f">${t.name.split(' ').slice(0, -1).join(' ')}</span><span class="l">${t.name.split(' ').slice(-1)[0]}</span></div></div>
    <span class="m">${t.sport} · ${t.season} season <span class="chip rec"><b class="num">${rec(t)}</b></span></span></div></div>`;
  const trBar = (t) => `<div class="trbar" ${st('ok', 'BUILT')}><span class="ib">${I('back', 24)}</span>${lgx(t.sport, t.abbr, 30)}<b>${t.name}</b><span class="chip rec"><b class="num">${rec(t)}</b></span><span class="tr"><span class="ib">${I('star', 22)}</span></span></div>`;
  const trTabs = (on) => `<div class="tabs">${['Overview', 'Profile', 'Form', 'Players', 'Schedule'].map((x) => `<a class="${x === on ? 'on' : ''}">${x}</a>`).join('')}</div>`;
  const nextCard = (t) => { const g = nextG(t), away = g.ha === 'AWAY', me = lgx(t.sport, t.abbr, 34), op = lgx(t.sport, g.opp, 34);
    const gk = Object.values((window.PD || { games: {} }).games).find((x) => x[0] === t.sport && [x[1], x[2]].includes(t.abbr) && [x[1], x[2]].includes(g.opp)), when = gk ? gk[3] : `${dayName(g.t)} ${clock(g.t)}`;
    const total = t.sport === 'NFL' ? ' · O/U 43.5' : '';
    return `<div class="card gstrip" ${st('ok', 'BUILT')}>${me}<div class="c"><b>${away ? 'at' : 'vs'} ${g.opp} · ${when}</b><span>${away ? 'Away' : 'Home'}${total}</span></div>${op}<span class="go">${I('chevR', 18)}</span></div>`; };
  const propsRow = (t) => { const ps = propsOf(t); const fams = [...new Set(ps.map((p) => p.label || p.fam))]; const names = new Set(ps.map((p) => p.name)).size;
    return `<div class="card prow" ${st('wire', 'WIRE')}><div><b>Props today</b><span>${ps.length} props across ${names} ${t.abbr} players</span></div><span class="seeall">Open ${I('chevR', 14)}</span></div>`; };
  const ptrack = (items, { h = 34 } = {}) => `<div class="ptr" style="height:${h}px"><i class="rail"></i><i class="tick"></i>${items.map((x) => `<span class="mk ${x.cls}" style="left:${x.pct}%" title="${x.t || ''}">${x.l || ''}</span>`).join('')}</div>`;

  /* identity: own offense against own defense, opponent-adjusted, one track per unit */
  const PAIRS = [['Overall', 'adj_off_epa', 'adj_def_epa'], ['Passing', 'adj_off_db_epa', 'adj_def_db_epa'], ['Rushing', 'adj_off_rush_epa', 'adj_def_rush_epa'], ['Early downs', 'adj_off_ed_epa', 'adj_def_ed_epa']];
  function identityNFL(t) {
    const rows = PAIRS.map(([lab, o, d]) => ({ lab, o: M(t, o, 'ADJ_RIDGE') || M(t, o, 'SEASON') || M(t, o, Object.keys(mget(t, o).w)[0]), d: M(t, d, Object.keys(mget(t, d).w)[0]) }));
    const ro = rows.map((r) => r.o.rank), rd = rows.map((r) => r.d.rank), n = rows[0].o.n;
    const rng = (a) => (Math.min(...a) === Math.max(...a) ? ord(Math.min(...a)) : `${ord(Math.min(...a))} to ${ord(Math.max(...a))}`);
    const line = `Offense ranks ${rng(ro)} of ${n} and defense ${rng(rd)} of ${n} across these four units.`;
    return `<div class="card idt" ${st('wire', 'WIRE')}><div class="idh"><div><span class="eyebrow">Identity</span><b>Offense vs defense</b></div><span class="seg2"><i class="on">Adjusted</i><i>Raw</i></span></div>
      <div class="idbig"><div class="o"><small>OFFENSE</small><b class="num">${ord(rows[0].o.rank)}</b><span>of ${n} · ${fmt(rows[0].o)} EPA/play</span></div><div class="d"><small>DEFENSE</small><b class="num">${ord(rows[0].d.rank)}</b><span>of ${n} · ${fmt(rows[0].d)} allowed</span></div></div>
      ${rows.map((r) => `<div class="idr"><span class="lab">${r.lab}</span>${ptrack([{ cls: 'd', pct: pctOf(r.d.rank, r.d.n), l: 'D', t: 'defense' }, { cls: 'o', pct: pctOf(r.o.rank, r.o.n), l: 'O', t: 'offense' }])}<span class="rr"><b class="o">${r.o.rank}</b><b class="d">${r.d.rank}</b></span></div>`).join('')}
      <div class="idax"><span class="ax"><i>Worst</i><i>Middle</i><i>Best</i></span></div>
      <p class="idnote">${line} Opponent-adjusted; the raw values are on Profile and never mixed.</p></div>`;
  }
  function identityNHL(t) {
    const w = t.win, pick = (id, ww) => M(t, id, ww || w);
    const rows = [['Goals', pick('gf_per_game'), pick('ga_per_game')], ['Exp. goals', pick('xgf_per60'), pick('xga_per60')], ['Special teams', pick('pp_pct'), pick('pk_pct')]];
    const g = rows[0];
    return `<div class="card idt" ${st('wire', 'WIRE')}><div class="idh"><div><span class="eyebrow">Identity</span><b>Scoring vs preventing</b></div><span class="seg2"><i class="on">2026–27</i><i>L10</i></span></div>
      <div class="idbig"><div class="o"><small>GOALS FOR</small><b class="num">${ord(g[1].rank)}</b><span>of ${g[1].n} · ${g[1].v.toFixed(2)} per game</span></div><div class="d"><small>GOALS AGAINST</small><b class="num">${ord(g[2].rank)}</b><span>of ${g[2].n} · ${g[2].v.toFixed(2)} per game</span></div></div>
      ${rows.map(([lab, o, d]) => `<div class="idr"><span class="lab">${lab}</span>${ptrack([{ cls: 'd', pct: pctOf(d.rank, d.n), l: lab === 'Special teams' ? 'K' : 'D', t: 'prevent' }, { cls: 'o', pct: pctOf(o.rank, o.n), l: lab === 'Special teams' ? 'P' : 'O', t: 'score' }])}<span class="rr"><b class="o">${o.rank}</b><b class="d">${d.rank}</b></span></div>`).join('')}
      <div class="idax"><span class="ax"><i>Worst</i><i>Middle</i><i>Best</i></span></div>
      <p class="idnote">Special teams: P is the power play (${(rows[2][1].v * 100).toFixed(1)}%), K the penalty kill (${(rows[2][2].v * 100).toFixed(1)}%). Season values; the 5v5 opponent-adjusted set is on Profile.</p></div>`;
  }

  /* strongest and weakest, raw season values, de-duplicated by family */
  function extremes(t, k = 3) {
    const cats = t.sport === 'NFL' ? ['offense', 'defense'] : ['advanced', 'official'];
    const skip = /^(off_adot|off_no_huddle|off_plays_per|off_proe|off_shotgun|corsi|fenwick|model|rating|sva|hd_xgf)/;
    const rows = Object.values(t.metrics).filter((m) => cats.includes(m.cat) && !skip.test(m.id)).map((m) => ({ m, x: m.w[t.win] })).filter((r) => r.x && r.x.rank);
    const fam = (id) => { const b = id.replace(/^(off_|def_)/, ''); return /rz/.test(b) ? 'rz' : /rush/.test(b) ? 'rush' : /epa/.test(b) ? 'epa' : b.replace(/_ng$/, '').replace(/(_play|_per60)$/, ''); };
    const pick = (arr) => { const seen = new Set(), out = []; for (const r of arr) { const f = fam(r.m.id) + (/^def_/.test(r.m.id) ? 'd' : /^off_/.test(r.m.id) ? 'o' : ''); if (seen.has(f)) continue; seen.add(f); out.push(r); if (out.length === k) break; } return out; };
    const byBest = [...rows].sort((a, b) => pctOf(b.x.rank, b.x.n) - pctOf(a.x.rank, a.x.n) || a.x.rank - b.x.rank);
    return { best: pick(byBest), worst: pick([...byBest].reverse()) };
  }
  const roleOf = (m) => (/^def_|ga_per|xga|pk_pct/.test(m.id) ? 'd' : 'o');
  const exRow = ({ m, x }) => { const r = roleOf(m); return `<div class="exr"><span class="rl ${r}">${r === 'o' ? 'OFF' : 'DEF'}</span><span class="nm">${m.name.replace(/ allowed$/, '')}</span><b class="num">${rk(x)}</b>${ptrack([{ cls: r, pct: pctOf(x.rank, x.n) }], { h: 20 })}</div>`; };
  function extremesCard(t) { const e = extremes(t);
    return `<div class="card exc" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Highest ranked</span></div>${e.best.map(exRow).join('')}<div class="exh" style="margin-top:8px"><span class="eyebrow">Lowest ranked</span></div>${e.worst.map(exRow).join('')}<p class="idnote">Raw ${t.sport === 'NFL' ? 'season' : '2026–27'} values among ${e.best[0].x.n} teams. Tap any row for its league ranking.</p></div>`; }

  /* margin bars: W green up, L coral down, zero line, opponent logos */
  function margins(t, n, { w = 338, h = 112 } = {}) {
    const gs = games(t, n), ms = gs.map((g) => g.for - g.against), mx = Math.max(6, ...ms.map(Math.abs)), mid = (h - 22) / 2 + 4, sw = (w - 8) / gs.length, bw = Math.min(26, sw - 8);
    const id = 'm' + t.abbr + n;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.go0}"/><stop offset="1" stop-color="${TH.go1}"/></linearGradient><linearGradient id="${id}l" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${TH.gu0}"/><stop offset="1" stop-color="${TH.gu1}"/></linearGradient></defs>`;
    s += `<line x1="4" x2="${w - 4}" y1="${mid}" y2="${mid}" stroke="rgba(255,255,255,.28)" stroke-width="1"/>`;
    gs.forEach((g, i) => { const m = ms[i], x = 4 + sw * i + sw / 2, hh = Math.max(3, Math.abs(m) / mx * (mid - 12)), win = m > 0;
      s += `<rect x="${x - bw / 2}" y="${win ? mid - hh : mid}" width="${bw}" height="${hh}" rx="3.5" fill="url(#${id}${win ? 'w' : 'l'})"/><text x="${x}" y="${win ? mid - hh - 3 : mid + hh + 10}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${win ? TH.hit : TH.miss}">${m > 0 ? '+' : '−'}${Math.abs(m)}</text>`; });
    s += '</svg>';
    const logos = `<div class="mlg" style="width:${w - 8}px;margin-left:4px">${gs.map((g) => `<span>${lgx(t.sport, g.opp, 18)}<i>${g.ha === 'AWAY' ? '@' : ''}</i></span>`).join('')}</div>`;
    return s + logos;
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  /* ---------- TR1 overview (NFL) */
  function tr1() {
    const t = DAL, last = games(t, 6);
    return `<div class="scr">${trHero(t, '#1f3f86')}${trTabs('Overview')}
      <div class="trbody">${nextCard(t)}${propsRow(t)}${identityNFL(t)}${extremesCard(t)}
      <div class="card lst" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Last 6 games</span><span class="seeall">Form ${I('chevR', 14)}</span></div>${margins(t, 6)}<p class="idnote">${rec(t)} this season · scored ${f1x(avg(last.map((g) => g.for)))} and allowed ${f1x(avg(last.map((g) => g.against)))} per game. Bars are the final margin.</p></div></div></div>${chrome('Games')}`;
  }

  /* ---------- TR2 profile: raw or adjusted, window, with the long baseline as a ghost marker */
  function tr2() {
    const t = DAL, rows = Object.values(t.metrics).filter((m) => m.cat === 'offense' && m.w.SEASON && m.w.L34 && /^(off_epa_play|off_dropback_epa|off_rush_epa|off_success_rate|off_explosive_rate|off_td_drive_rate|off_rz_epa|off_sack_rate_allowed)$/.test(m.id));
    const defs = Object.values(t.metrics).filter((m) => m.cat === 'defense' && m.w.SEASON && m.w.L34 && /^(def_epa_play|def_dropback_epa|def_rush_epa|def_success_rate|def_explosive_rate|def_rz_epa|def_sack_rate|def_takeaway_rate)$/.test(m.id));
    const row = (m, r) => { const a = m.w.SEASON, b = m.w.L34, pa = pctOf(a.rank, a.n), pb = pctOf(b.rank, b.n), d = b.rank - a.rank;
      const dv = d > 0 ? `<i class="up">▲ ${d}</i>` : d < 0 ? `<i class="dn">▼ ${-d}</i>` : `<i class="fl">–</i>`;
      return `<div class="pr"><div class="pn"><b>${m.name.replace(/ allowed$/, '')}</b><span class="num">${fmt({ ...a, unit: m.unit })}</span></div>${ptrack([{ cls: 'g', pct: pb }, { cls: r, pct: pa }], { h: 26 })}<div class="pk"><b class="num">${ord(a.rank)}</b><small>${dv} vs last 34</small></div></div>`; };
    const sorted = (xs) => [...xs].sort((a, b) => a.w.SEASON.rank - b.w.SEASON.rank);
    return `<div class="scr">${trBar(t)}${trTabs('Profile')}
      <div class="ctlrow" ${st('ok', 'BUILT')}><span class="seg2 wide"><i class="on">Raw</i><i>Opponent-adjusted</i></span></div>
      <div class="ctlrow"><span class="seg2 wide"><i class="on">Season · 6 g</i><i>Last 6</i><i>Last 34</i></span></div>
      <div class="ctlrow k"><span><i class="kd o"></i>Offense</span><span><i class="kd d"></i>Defense</span><span><i class="kd g"></i>Last 34 games</span></div>
      <div class="profl" ${st('wire', 'WIRE')}><div class="gh"><span class="rl o">OFF</span><b>Offense</b><small>raw, season</small></div>${sorted(rows).slice(0, 4).map((m) => row(m, 'o')).join('')}<div class="gh"><span class="rl d">DEF</span><b>Defense</b><small>raw, season</small></div>${sorted(defs).slice(0, 4).map((m) => row(m, 'd')).join('')}</div>
      <div class="showall">Show all 11 offense and 11 defense stats ${I('chevR', 14)}</div><p class="idnote pn2">Raw values describe what happened, not how good the team is. Opponent-adjusted values are a different statistic and never sit in the same list. Ranks are among the 28 teams in the current packet.</p></div>${chrome('Games')}`;
  }

  /* ---------- TR3 form */
  function tr3() {
    const t = DAL, g12 = games(t, 12), last6 = g12.slice(-6), prev6 = g12.slice(0, 6), g26 = t.s26;
    const split = (arr, f) => { const a = arr.filter(f); return { w: a.filter((g) => g.o === 'W').length, l: a.filter((g) => g.o === 'L').length, mg: a.length ? avg(a.map((g) => g.for - g.against)) : 0, n: a.length }; };
    const hm = split(g12, (g) => g.ha === 'HOME'), aw = split(g12, (g) => g.ha === 'AWAY'), one = split(g12, (g) => Math.abs(g.for - g.against) <= 8);
    const sgn1 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    const cell = (lab, x) => `<div><small>${lab}</small><b class="num">${x.w}–${x.l}</b><span>${sgn1(x.mg)} avg margin</span></div>`;
    const resRow = (g) => `<div class="res"><span class="wk">${g.comp.replace(/^\d{4} REG week /, 'Wk ')}</span>${lgx(t.sport, g.opp, 24)}<span class="nm">${g.ha === 'AWAY' ? '@ ' : 'vs '}${g.opp}</span><b class="num">${g.for}–${g.against}</b><span class="wl ${g.o}">${g.o}</span></div>`;
    return `<div class="scr">${trBar(t)}${trTabs('Form')}
      <div class="trbody"><div class="card frm" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Last 12 games · margin</span><span class="div26">2025 · 2026</span></div>${margins(t, 12, { h: 118 })}
        <div class="two"><div><small>Last 6</small><b class="num">${f1x(avg(last6.map((g) => g.for)))}<i>/</i>${f1x(avg(last6.map((g) => g.against)))}</b><span>scored / allowed</span></div><div><small>Previous 6</small><b class="num">${f1x(avg(prev6.map((g) => g.for)))}<i>/</i>${f1x(avg(prev6.map((g) => g.against)))}</b><span>scored / allowed</span></div></div></div>
      <div class="card spl3" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Splits · last 12</span></div><div class="s3">${cell('Home', hm)}${cell('Away', aw)}${cell('One score', one)}</div></div>
      <div class="card lockc" ${st('new', 'NEW DATA')}>${I('lock', 15)}<div><b>Against the spread · over/under record</b><span>Needs closing lines by game, which SIFT does not publish.</span></div></div>
      <div class="exh" style="margin:6px 4px 0"><span class="eyebrow">2026 results</span></div><div class="card reslist" ${st('ok', 'BUILT')}>${[...g26].reverse().slice(0, 4).map(resRow).join('')}</div></div></div>${chrome('Games')}`;
  }

  /* ---------- TR4 schedule with opponent strength */
  function tr4() {
    const t = DAL, ups = t.upcoming.slice(0, 6), prevT = t.s26[t.s26.length - 1].t;
    const op = (a) => t.opp[a] || null;
    const pill = (kind, o) => (o ? `<span class="op ${kind}"><b class="num">${ord(o.rank)}</b></span>` : `<span class="op none">—</span>`);
    const ok = ups.filter((g) => op(g.opp));
    const avgo = ok.length ? Math.round(avg(ok.map((g) => pctOf(op(g.opp).off.rank, 28)))) : null, avgd = ok.length ? Math.round(avg(ok.map((g) => pctOf(op(g.opp).def.rank, 28)))) : null;
    let last = new Date(prevT).getTime();
    const row = (g, i) => { const o = op(g.opp), days = Math.round((new Date(g.t).getTime() - last) / 86400000); last = new Date(g.t).getTime();
      return `<div class="sch ${i === 0 ? 'now' : ''}"><div class="dt"><b>${md(g.t)}</b><span>${dayName(g.t)}</span></div>${lgx(t.sport, g.opp, 32)}<div class="nm"><b>${g.ha === 'AWAY' ? '@' : 'vs'} ${g.opp}</b><span>${days} days rest</span></div><div class="ops">${pill('o', o && o.off)}</div><div class="ops">${pill('d', o && o.def)}</div></div>`; };
    return `<div class="scr">${trBar(t)}${trTabs('Schedule')}
      <div class="trbody"><div class="card sum6" ${st('wire', 'WIRE')}><span class="eyebrow">Next ${ups.length} opponents</span><div class="s2"><div class="o"><small>Opponent offenses, adjusted</small><b class="num">${avgo ?? '—'}</b><span>average percentile</span></div><div class="d"><small>Opponent defenses, adjusted</small><b class="num">${avgd ?? '—'}</b><span>average percentile</span></div></div><p class="idnote">Descriptive: season-long opponent-adjusted EPA per play, ${ok.length} of ${ups.length} opponents ranked. Higher is stronger; it is not a prediction.</p></div>
      <div class="card schl" ${st('wire', 'WIRE')}><div class="schh"><span></span><span></span><span></span><span class="o">Opp. offense</span><span class="d">Opp. defense</span></div>${ups.map(row).join('')}</div></div></div>${chrome('Games')}`;
  }

  /* ---------- TR5 players and availability */
  function parseAv(a) { const m = /^(.+?) \(([A-Z0-9/]+)(?:, [A-Z]+)?\): (.*?)(?:; return ([0-9-]+))?(?:; impact: (.*))?$/.exec(a.detail); return m ? { name: m[1], pos: m[2], why: m[3], ret: m[4], impact: m[5], status: a.status } : null; }
  const photoOf = (name) => ({ 'CeeDee Lamb': 'dal-ceedee-lamb', 'Dak Prescott': 'dal-dak-prescott', 'Javonte Williams': 'dal-javonte-williams' })[name];
  function tr5() {
    const t = DAL, av = t.avail.filter((a) => a.status !== 'ACTIVE').map(parseAv).filter(Boolean);
    const out = av.filter((a) => a.status === 'OUT'), other = av.filter((a) => a.status !== 'OUT');
    const propCount = (name) => PR.filter((p) => p.name === name && p.team === t.abbr).length;
    const roster = t.players.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.role)).sort((a, b) => propCount(b.display_name) - propCount(a.display_name)).slice(0, 5);
    const avRow = (a) => `<div class="avr"><span class="ps">${a.pos}</span><div class="nm"><b>${a.name}</b><span>${a.why}${a.ret ? ' · return ' + md(a.ret + 'T12:00:00Z') : ''}</span></div><span class="chip ${a.status === 'OUT' ? 'bad' : 'amb'}">${a.status === 'OUT' ? 'Out' : a.status === 'INJURED_RESERVE' ? 'IR' : a.status}</span></div>`;
    const plRow = (p) => { const c = propCount(p.display_name), ph = photoOf(p.display_name), isOut = out.some((a) => a.name === p.display_name);
      return `<div class="plr"><span class="av4" style="--s:38px">${ph ? `<img src="assets/players/${ph}.webp" alt="">` : lgx(t.sport, t.abbr, 26)}</span><div class="nm"><b>${p.display_name}</b><span>${p.role}</span></div>${isOut ? '<span class="chip bad">Out</span>' : c ? `<span class="pcnt">${c} ${c === 1 ? 'prop' : 'props'} <i>›</i></span>` : '<span class="pcnt dim">no props</span>'}</div>`; };
    return `<div class="scr">${trBar(t)}${trTabs('Players')}
      <div class="trbody"><div class="card avc" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Availability</span><span class="cn"><b>${out.length}</b> out${other.length ? ` · <b>${other.length}</b> on IR` : ''}</span></div>${[...out, ...other].slice(0, 4).map(avRow).join('')}${av.length > 4 ? `<div class="more">${av.length - 4} more ${I('chevR', 14)}</div>` : ''}</div>
      <div class="card olc" ${st('wire', 'WIRE')}>${I('info', 15, TH.info)}<span>No pass-block or run-block grades are captured, so no offensive-line quality metric is reported. Linemen who are out are listed above.</span></div>
      <div class="exh" style="margin:6px 4px 0"><span class="eyebrow">Skill players</span><span class="seeall">All ${t.players.length} ${I('chevR', 14)}</span></div>
      <div class="card plist2" ${st('wire', 'WIRE')}>${roster.map(plRow).join('')}</div></div></div>${chrome('Games')}`;
  }

  /* ---------- TR6 NHL overview */
  function tr6() {
    const t = TOR, last = games(t, 8);
    return `<div class="scr">${trHero(t, '#1b4a9e')}${trTabs('Overview')}
      <div class="trbody">${nextCard(t)}${propsRow(t)}${identityNHL(t)}${extremesCard(t)}
      <div class="card lst" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Last 8 games</span><span class="seeall">Form ${I('chevR', 14)}</span></div>${margins(t, 8)}<p class="idnote">${rec(t)} this season · scored ${f1x(avg(last.map((g) => g.for)))} and allowed ${f1x(avg(last.map((g) => g.against)))} per game.</p></div></div></div>${chrome('Games')}`;
  }

  const MAP = { tr1, tr2, tr3, tr4, tr5, tr6 };
  document.body.innerHTML = `<div class="phone ${ANNOT ? 'annot' : ''} th${THEME}" id="phone" ${LONG ? `style="height:${LONG}px"` : ''}>${MAP[SCREEN]()}</div>`;
})();
