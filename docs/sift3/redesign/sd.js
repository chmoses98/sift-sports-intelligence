/* Stat Detail and League Rankings mockups (SD1 to SD7). Every value, rank, window, summary statistic and definition is the
   publication's own (stats.js: the sports' explorer ranking documents, metric registries and team profiles). Trend bars are
   the published per-game series. Player comparison uses the game-log values already captured for Prop Discovery. Related
   statistics are derived from the registry's category and names: the registry publishes no relation list. Nothing is estimated. */
(function () {
  if (!/^sd\d/.test(SCREEN)) return;
  const S = window.SD, N = S.nfl, H = S.nhl, TD = window.TD, PR = (window.PD || { props: [] }).props;
  const lgx = (sport, t, s = 24) => `<img class="lg" src="assets/teams/${sport === 'NFL' ? '' : sport.toLowerCase() + '/'}${t}.webp" width="${s}" height="${s}" alt="${t}">`;
  const pctOf = (rank, n) => Math.round(100 * (n - rank) / (n - 1));
  const sg3 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3);
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const pc1 = (v) => (v * 100).toFixed(1) + '%';
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const md = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const SEL = 'DAL', OPP = 'PHI';

  /* ---------- pieces */
  const bar = (title, sub, eyebrow) => `<div class="sdh"><span class="ib back">${I('back', 24)}</span><div class="tt"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><small>${sub}</small></div><span class="tr"><span class="ib">${I('bm', 22)}</span></span></div>`;
  const tabs = (on) => `<div class="tabs sdt">${['Ranking', 'Trend', 'Compare', 'About'].map((x) => `<a class="${x === on ? 'on' : ''}">${x}</a>`).join('')}</div>`;
  const ptr = (items, h = 28) => `<div class="ptr" style="height:${h}px"><i class="rail"></i><i class="tick"></i>${items.map((x) => `<span class="mk ${x.cls}" style="left:${x.pct}%">${x.l || ''}</span>`).join('')}</div>`;

  /* beeswarm of every team on the value axis; the selected team and the next opponent are marked */
  function swarm(rk, { hib, sel, opp, sport, fmt, w = 330, h = 74 }) {
    const es = rk.entries, vs = es.map((e) => e.v), lo = Math.min(...vs), hi = Math.max(...vs), x = (v) => 12 + (w - 24) * (hib ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo));
    const placed = [], base = h - 26;
    [...es].sort((a, b) => x(a.v) - x(b.v)).forEach((e) => { const cx = x(e.v); let y = base; for (let k = 0; k < 8; k++) { y = base - k * 8.6; if (!placed.some((p) => Math.hypot(p.cx - cx, p.y - y) < 8.4)) break; } placed.push({ cx, y, e }); });
    const mx = x(rk.summary.median);
    let s = `<svg class="swm" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="${mx}" x2="${mx}" y1="6" y2="${h - 16}" stroke="rgba(255,255,255,.28)" stroke-dasharray="3 3"/>`;
    placed.filter((p) => p.e.t !== sel && p.e.t !== opp).forEach((p) => { s += `<circle cx="${p.cx}" cy="${p.y}" r="3.6" fill="#59626e"/>`; });
    placed.filter((p) => p.e.t === opp).forEach((p) => { s += `<circle cx="${p.cx}" cy="${p.y}" r="5.4" fill="#0a0d11" stroke="#a4acb6" stroke-width="1.6" stroke-dasharray="2.6 2"/>`; });
    placed.filter((p) => p.e.t === sel).forEach((p) => { s += `<circle cx="${p.cx}" cy="${p.y}" r="7.5" fill="#0a0d11" stroke="var(--cyan)" stroke-width="2.4"/><circle cx="${p.cx}" cy="${p.y}" r="2.6" fill="var(--cyan)"/>`; });
    s += `<text x="12" y="${h - 3}" font-size="9.5" fill="${TH.axis}">${hib ? 'worst' : 'best'} ${fmt(hib ? lo : lo)}</text><text x="${mx}" y="${h - 3}" font-size="9.5" fill="${TH.axis}" text-anchor="middle">median ${fmt(rk.summary.median)}</text><text x="${w - 12}" y="${h - 3}" font-size="9.5" fill="${TH.axis}" text-anchor="end">${hib ? 'best' : 'worst'} ${fmt(hi)}</text></svg>`;
    return s;
  }
  function rows(rk, { hib, sel, opp, sport, fmt, role, take }) {
    const es = rk.entries, vs = es.map((e) => e.v), lo = Math.min(...vs), hi = Math.max(...vs), rel = (v) => Math.max(0.04, hib ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo));
    const row = (e) => `<div class="rkr ${e.t === sel ? 'sel' : ''} ${e.t === opp ? 'opp' : ''}"><b class="rn num">${e.r}</b>${lgx(sport, e.t, 26)}<span class="nm">${e.name.split(' ').slice(-1)[0]}${e.t === sel ? '<i>Selected</i>' : e.t === opp ? '<i class="o">Next opponent</i>' : ''}</span><span class="bw"><i class="${role}" style="width:${(rel(e.v) * 100).toFixed(1)}%"></i></span><b class="vl num">${fmt(e.v)}</b><span class="cmpb"></span></div>`;
    const out = [];
    const head = es.slice(0, take);
    head.forEach((e) => out.push(row(e)));
    const gap = (n) => `<div class="rkg">${n} more teams</div>`;
    let last = take;
    [opp].forEach((t) => { const e = es.find((x) => x.t === t); if (e && e.r > take) { out.push(gap(e.r - 1 - last)); out.push(row(e)); last = e.r; } });
    return out.join('');
  }

  /* ---------- SD1: league ranking, adjusted offense (NFL) */
  function sd1() {
    const m = N.adj_off, rk = m.rk, e = rk.entries.find((x) => x.t === SEL), fmt = sg3;
    return `<div class="scr">${bar('Adjusted offensive EPA per play', 'NFL · ' + rk.n + ' teams in the current packet', 'League ranking')}${tabs('Ranking')}
      <div class="fam" ${st('ok', 'BUILT')}><span class="seg2 wide"><i class="on">Opponent-adjusted</i><i>Raw</i></span><span class="fam2">${I('info', 13, TH.info)} Two different statistics, ranked separately</span></div>
      <div class="selc" ${st('wire', 'WIRE')}>${lgx('NFL', SEL, 44)}<div class="sdb2"><small>DAL offense</small><b class="num">${ord(e.r)}</b><small>of ${rk.n} teams</small></div><div class="sv"><b class="num">${fmt(e.v)}</b><small>EPA per play</small></div><div class="sdm2"><small>Ahead of</small><b class="num">${rk.n - e.r}</b><small>teams</small></div></div>
      <div class="card swc" ${st('wire', 'WIRE')}>${swarm(rk, { hib: true, sel: SEL, opp: OPP, sport: 'NFL', fmt })}<div class="swk"><span><i class="kd sel"></i>${SEL}</span><span><i class="kd opp"></i>${OPP} · next opponent, ${ord(rk.entries.find((x) => x.t === OPP).r)}</span><span class="cmpl">Compare ${I('chevR', 12)}</span></div></div>
      <div class="card rkc" ${st('ok', 'BUILT')}>${rows(rk, { hib: true, sel: SEL, opp: OPP, sport: 'NFL', fmt, role: 'o', take: 6 })}<div class="rkm">Show all ${rk.n} teams ${I('chevR', 14)}</div></div>
      </div>${chrome('Explore')}`;
  }

  /* ---------- SD2: trend with tappable observation */
  function sd2() {
    const ser = N.pf.series, ab = N.abbr_by_id, tm = TD.DAL, evMap = Object.fromEntries(tm.games.map((g) => [g.opp + g.t.slice(0, 10), g]));
    const last = ser.slice(-12), mean = N.pf.rk.summary.mean, sel = last.length - 1, n = last.length, W = 338, Hh = 168, mx = Math.max(...last.map((p) => p.v), mean) + 5, w = (W - 8) / n, bw = Math.min(22, w - 8), yv = (v) => Hh - 20 - (v / mx) * (Hh - 34);
    const opp = (p) => ab[p.opp] || '';
    const game = (p) => tm.games.find((g) => g.t.slice(0, 10) === p.t.slice(0, 10));
    let svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><defs><linearGradient id="sdb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf1f7"/><stop offset="1" stop-color="#8f9bab"/></linearGradient></defs>`;
    svg += `<line x1="4" x2="${W - 4}" y1="${yv(mean)}" y2="${yv(mean)}" stroke="rgba(255,255,255,.4)" stroke-dasharray="5 4"/>`;
    last.forEach((p, i) => { const x = 4 + w * i + w / 2, on = i === sel; svg += `<rect x="${x - bw / 2}" y="${yv(p.v)}" width="${bw}" height="${yv(0) - yv(p.v)}" rx="3.5" fill="url(#sdb)" opacity="${on ? 1 : 0.62}" ${on ? 'stroke="var(--cyan)" stroke-width="2"' : ''}/><text x="${x}" y="${yv(p.v) - 4}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${on ? '#fff' : '#a4acb6'}">${p.v}</text>`; });
    const pts = last.map((p, i) => `${4 + w * i + w / 2},${yv(p.roll)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="#ffb27a" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    const logos = `<div class="mlg" style="width:${W - 8}px;margin-left:4px">${last.map((p, i) => `<span>${lgx('NFL', opp(p), 17)}${i === sel ? '<u></u>' : ''}</span>`).join('')}</div>`;
    const sp = ser[sel + (ser.length - last.length)], g = game(sp);
    const bySeason = (yr) => ser.filter((p) => p.x.startsWith(yr + '_'));
    const seas = ['2024', '2025', '2026'].map((y) => { const a = bySeason(y); return a.length ? { y, n: a.length, a: avg(a.map((p) => p.v)) } : null; }).filter(Boolean);
    const homeAway = (h) => { const a = bySeason('2026').filter((p) => (game(p) || {}).ha === h); return a.length ? { n: a.length, a: avg(a.map((p) => p.v)) } : null; };
    const hm = homeAway('HOME'), aw = homeAway('AWAY'), e26 = N.pf.rk.entries.find((x) => x.t === SEL);
    return `<div class="scr">${bar('Points scored per game', 'NFL · ' + N.pf.rk.n + ' teams · Dallas', 'Trend')}${tabs('Trend')}
      <div class="chs2"><span class="chip cy">2025–26 · last 12</span><span class="chip">2026 · 6 g</span><span class="chip">2025</span><span class="chip">2024</span></div>
      <div class="card trc" ${st('wire', 'WIRE')}>${svg}${logos}<div class="trk"><span><i class="bx"></i>Points</span><span><i class="ln"></i>Rolling avg</span><span><i class="dl"></i>League ${f1(mean)}</span></div></div>
      <div class="card obs" ${st('ok', 'BUILT')}><div class="obh"><b>${g ? g.comp.replace(/^\d{4} REG week /, 'Week ') : ''} · ${g && g.ha === 'AWAY' ? 'at' : 'vs'} ${opp(sp)}</b><span>${md(sp.t)}</span></div><div class="obv"><div><b class="num">${g ? g.for + '–' + g.against : sp.v}</b><small>final</small></div><div><b class="num">${f1(sp.roll)}</b><small>rolling average</small></div><div class="obb"><span class="btn sm pri">Game Detail</span><span class="btn sm">${opp(sp)} ${I('chevR', 12)}</span></div></div></div>
      <div class="card seas" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">By season</span></div>${seas.map((s) => `<div class="sr"><b>${s.y}</b><span>${s.n} games</span><b class="num">${f1(s.a)}</b>${s.y === '2026' ? `<em>${ord(e26.r)} of ${N.pf.rk.n}</em>` : '<em class="lk">rank —</em>'}</div>`).join('')}${hm ? `<div class="sr sp"><b>Home, 2026</b><span>${hm.n} games</span><b class="num">${f1(hm.a)}</b><em></em></div>` : ''}${aw ? `<div class="sr sp"><b>Away, 2026</b><span>${aw.n} games</span><b class="num">${f1(aw.a)}</b><em></em></div>` : ''}<p class="idnote">League ranks are published for the current season only.</p></div></div>${chrome('Explore')}`;
  }

  /* ---------- SD3: raw and opponent-adjusted, kept apart */
  function sd3() {
    const ra = N.raw_off, aj = N.adj_off, get = (rk, t) => rk.entries.find((x) => x.t === t);
    const card = (cls, tag, title, win, rk, fmt, def, extra) => { const e = get(rk, SEL), top = rk.entries.slice(0, 3);
      return `<div class="card rvc ${cls}" ${st('wire', 'WIRE')}><div class="th2"><span class="tg">${tag}</span><b>${title}</b></div><div class="win">${win}</div>
        <div class="tw"><div class="o"><b class="num">${ord(e.r)}</b><small>of ${rk.n}</small></div><div class="v"><b class="num">${fmt(e.v)}</b><small>EPA per play</small></div></div>${ptr([{ cls: 'o', pct: pctOf(e.r, rk.n), l: 'O' }], 26)}
        <div class="tops">${top.map((x) => `<span>${x.r}</span>${lgx('NFL', x.t, 20)}<b class="num">${fmt(x.v)}</b>`).join('')}</div>${extra || ''}<div class="open">Open this ranking ${I('chevR', 14)}</div></div>`; };
    const w = (l) => { const e = N.teams[SEL].off_epa_play[l]; return `<div><small>${l === 'SEASON' ? 'Season · 6 g' : l === 'L6' ? 'Last 6' : 'Last 34'}</small><b class="num">${ord(e.r)}</b><span>${sg3(e.v)}</span></div>`; };
    return `<div class="scr">${bar('Offensive EPA per play', 'Raw and opponent-adjusted are separate statistics', 'League ranking')}${tabs('Ranking')}
      <div class="fam" ${st('ok', 'BUILT')}><span class="seg2 wide"><i>Opponent-adjusted</i><i>Raw</i><i class="on">Side by side</i></span><span class="fam2">${I('lock', 13)} Separate rankings, never mixed in one list</span></div>
      ${card('rawc', 'RAW', 'Offensive EPA per play', 'Season window · what happened, not how good', ra.SEASON, sg3, ra.def, `<div class="wpath" ${st('wire', 'WIRE')}>${w('SEASON')}${w('L6')}${w('L34')}</div>`)}
      ${card('adjc', 'ADJUSTED', 'Adjusted offensive EPA per play', 'Three-season weighted rating · opponent-adjusted', aj.rk, sg3, aj.def, '')}
      <p class="idnote" style="padding:0 18px">Windows differ by design (six games against a three-season weighted rating), so the two ranks are never subtracted into a “schedule effect”.</p></div>${chrome('Explore')}`;
  }

  /* ---------- SD4: compare two teams */
  function sd4() {
    const A = N.teams[SEL], B = N.teams[OPP];
    const defs = [['Overall', 'adj_off_epa', 'adj_def_epa'], ['Passing', 'adj_off_db_epa', 'adj_def_db_epa'], ['Rushing', 'adj_off_rush_epa', 'adj_def_rush_epa'], ['Early downs', 'adj_off_ed_epa', 'adj_def_ed_epa']];
    const key = (m) => { const w = Object.keys(A[m])[0]; return w; };
    const line = (lab, id, role) => { const a = A[id][key(id)], b = B[id][key(id)], n = a.n, pa = pctOf(a.r, n), pb = pctOf(b.r, n), aw = a.r < b.r;
      return `<div class="cr"><div class="cl"><b>${lab}</b><span>${sg3(a.v)} · ${sg3(b.v)}</span></div><div class="ctr"><div class="ptr" style="height:30px"><i class="rail"></i><i class="tick"></i><span class="gap ${role}" style="left:${Math.min(pa, pb)}%;width:${Math.abs(pa - pb)}%"></span><span class="mk lg ${role} ${aw ? 'win' : 'lose'}" style="left:${pa}%">${lgx('NFL', SEL, 16)}</span><span class="mk lg ${role} ${aw ? 'lose' : 'win'}" style="left:${pb}%">${lgx('NFL', OPP, 16)}</span></div></div><div class="cn"><b class="${aw ? 'w' : ''}">${a.r}</b><b class="${aw ? '' : 'w'}">${b.r}</b></div></div>`; };
    return `<div class="scr">${bar('Compare teams', 'NFL · opponent-adjusted EPA per play', 'Compare')}${tabs('Compare')}
      <div class="who2" ${st('ok', 'BUILT')}><span class="wc">${lgx('NFL', SEL, 30)}<b>DAL</b><i>${I('x', 11)}</i></span><span class="vs">vs</span><span class="wc">${lgx('NFL', OPP, 30)}<b>PHI</b><i>${I('x', 11)}</i></span><span class="seg2"><i class="on">Teams</i><i>Players</i></span></div>
      <div class="card cmpc" ${st('wire', 'WIRE')}><div class="gh"><span class="rl o">OFF</span><b>Offense</b><small>1st is best · DAL, PHI</small></div>${defs.map(([l, o]) => line(l, o, 'o')).join('')}<div class="gh" style="margin-top:12px"><span class="rl d">DEF</span><b>Defense</b><small>1st is best · DAL, PHI</small></div>${defs.map(([l, , d]) => line(l, d, 'd')).join('')}</div>
      <p class="idnote" style="padding:2px 18px 0">Each marker is a team’s rank among ${A.adj_off_epa[key('adj_off_epa')].n}; the bolder marker is the better rank. Tap a row for that statistic’s full ranking, a logo for the team.</p></div>${chrome('Explore')}`;
  }

  /* ---------- SD5: compare two players (game-log values, no league rank published) */
  function sd5() {
    const find = (n) => PR.find((p) => p.name === n && p.fam === 'rec'), A = find('CeeDee Lamb'), B = find('George Pickens'), k = 5;
    const col = (p) => { const v = p.hist.vals, hit = v.filter((x) => x >= k).length, sorted = [...v].sort((a, b) => a - b), med = (sorted[4] + sorted[5]) / 2, mx = Math.max(...A.hist.vals, ...B.hist.vals, k) + 1;
      const bars = v.map((x) => `<i class="${x >= k ? 'h' : 'm'}" style="height:${(4 + 62 * x / mx).toFixed(0)}px"><b>${x}</b></i>`).join('') + `<u class="thr" style="bottom:${(4 + 62 * (k - 0.5) / mx).toFixed(0)}px"></u>`;
      return { v, hit, avg: avg(v), med, hi: Math.max(...v), html: `<div class="pcc"><div class="sdph"><span class="av4" style="--s:34px">${p.name === 'CeeDee Lamb' ? '<img src="assets/players/dal-ceedee-lamb.webp" alt="">' : lgx('NFL', 'DAL', 24)}</span><div><b>${p.name.split(' ')[1]}</b><small>WR · DAL</small></div></div><div class="pbars">${bars}</div></div>` }; };
    const a = col(A), b = col(B);
    const row = (lab, x, y, f = (n) => n) => `<div class="cmr"><span class="v">${f(x)}</span><b>${lab}</b><span class="v">${f(y)}</span></div>`;
    return `<div class="scr">${bar('Compare players', 'Receptions · last 10 games', 'Compare')}${tabs('Compare')}
      <div class="who2" ${st('ok', 'BUILT')}><span class="wc"><b>Lamb</b><i>${I('x', 11)}</i></span><span class="vs">vs</span><span class="wc"><b>Pickens</b><i>${I('x', 11)}</i></span><span class="seg2"><i>Teams</i><i class="on">Players</i></span></div>
      <div class="chs2"><span class="chip cy">Receptions</span><span class="chip">Receiving yds</span><span class="chip">Touchdowns</span></div>
      <div class="card sdpl" ${st('wire', 'WIRE')}><div class="pcg">${a.html}${b.html}</div><div class="ln5"><span>dashed line = ${k}+ receptions</span></div>
        <div class="sdcm">${row('Last-10 average', f1(a.avg), f1(b.avg))}${row('Median', a.med, b.med)}${row('Best game', a.hi, b.hi)}${row(k + '+ games', a.hit + ' of 10', b.hit + ' of 10')}</div></div>
      <div class="card lockc" ${st('new', 'NEW DATA')}>${I('lock', 15)}<div><b>League rank among receivers</b><span>Player-level rankings are not published; only team rankings are.</span></div></div></div>${chrome('Explore')}`;
  }

  /* ---------- SD6: about, definition and related statistics */
  function sd6() {
    const m = N.adj_off.def, rk = N.adj_off.rk, T = N.teams[SEL];
    const rel = [['Adjusted passing EPA per dropback', 'adj_off_db_epa'], ['Adjusted rushing EPA per rush', 'adj_off_rush_epa'], ['Adjusted early-down EPA', 'adj_off_ed_epa'], ['Adjusted defensive EPA per play', 'adj_def_epa'], ['Offensive EPA per play (raw)', 'off_epa_play']];
    const first = 'An opponent-adjusted rating of the team’s offense: a weighted ridge regression over the last three seasons, with recent games counting more (half-life 10 weeks).';
    return `<div class="scr">${bar('Adjusted offensive EPA per play', 'NFL · opponent-adjusted', 'About this statistic')}${tabs('About')}
      <div class="trbody"><div class="card abt" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">What it measures</span><span class="chip">Higher is better</span></div><p>${first}</p><div class="kv2"><div><small>Window</small><b>Three-season weighted rating</b></div><div><small>Teams</small><b>${rk.n} in the current packet</b></div><div><small>Updated</small><b>Each publication run</b></div></div><div class="more2">Full definition ${I('chevR', 13)}</div></div>
      <div class="card lim" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Limits the publication states</span></div>${rk.limits.slice(0, 3).map((x) => `<div class="li">${I('info', 13, TH.info)}<span class="clamp">${x}</span></div>`).join('')}</div>
      <div class="exh" style="margin:2px 4px 0"><span class="eyebrow">Related statistics</span><span class="seeall">DAL rank</span></div>
      <div class="card relc" ${st('wire', 'WIRE')}>${rel.map(([lab, id]) => { const e = T[id][Object.keys(T[id])[0]]; return `<div class="rr2"><span class="nm">${lab}</span>${ptr([{ cls: /def/.test(id) ? 'd' : 'o', pct: pctOf(e.r, e.n) }], 20)}<b class="num">${ord(e.r)}</b>${I('chevR', 14)}</div>`; }).join('')}</div>
      <div class="rel2" ${st('wire', 'WIRE')}><span class="chip">${I('bm', 12)} Team Research · Dallas</span><span class="chip">Game matchup · DAL at PHI</span></div></div></div>${chrome('Explore')}`;
  }

  /* ---------- SD7: hockey ranking, power play */
  function sd7() {
    const rk = H.pp.cur, prev = H.pp.prev, m = H.pp.def, e = rk.entries.find((x) => x.t === 'TOR'), pe = prev.entries.find((x) => x.t === 'TOR'), fmt = pc1, opp = 'CGY';
    return `<div class="scr">${bar('Power-play percentage', 'NHL · ' + rk.n + ' teams · official', 'League ranking')}${tabs('Ranking')}
      <div class="chs2" ${st('wire', 'WIRE')}><span class="chip cy">2026–27 · 9 to 13 g</span><span class="chip">2025–26 · 82 g</span></div>
      <div class="selc" ${st('wire', 'WIRE')}>${lgx('NHL', 'TOR', 44)}<div class="sdb2"><small>TOR power play</small><b class="num">${ord(e.r)}</b><small>of ${rk.n} teams</small></div><div class="sv"><b class="num">${fmt(e.v)}</b><small>of power plays</small></div><div class="sdm2"><small>Ahead of</small><b class="num">${rk.n - e.r}</b><small>teams</small></div></div>
      <div class="card hst" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Season over season</span></div><div class="sl"><div><small>2025–26</small><b class="num">${ord(pe.r)}</b><span>${fmt(pe.v)}</span></div><svg width="120" height="34" viewBox="0 0 120 34"><line x1="6" y1="${4 + 26 * (pe.r - 1) / 31}" x2="114" y2="${4 + 26 * (e.r - 1) / 31}" stroke="var(--cyan)" stroke-width="2"/><circle cx="6" cy="${4 + 26 * (pe.r - 1) / 31}" r="4" fill="#0a0d11" stroke="#a4acb6" stroke-width="1.6"/><circle cx="114" cy="${4 + 26 * (e.r - 1) / 31}" r="4.5" fill="var(--cyan)"/></svg><div class="r"><small>2026–27</small><b class="num">${ord(e.r)}</b><span>${fmt(e.v)}</span></div></div><p class="idnote">A season-long rank against a 13-game rank: the sample is small, so the gap is shown, not explained.</p></div>
      <div class="card swc" ${st('wire', 'WIRE')}>${swarm(rk, { hib: true, sel: 'TOR', opp, sport: 'NHL', fmt })}<div class="swk"><span><i class="kd sel"></i>TOR</span><span><i class="kd opp"></i>CGY · next opponent, ${ord(rk.entries.find((x) => x.t === opp).r)}</span><span class="cmpl">Compare ${I('chevR', 12)}</span></div></div>
      <div class="card rkc" ${st('ok', 'BUILT')}>${rows(rk, { hib: true, sel: 'TOR', opp, sport: 'NHL', fmt, role: 'o', take: 5 })}<div class="rkm">Show all ${rk.n} teams ${I('chevR', 14)}</div></div></div>${chrome('Explore')}`;
  }

  const MAP = { sd1, sd2, sd3, sd4, sd5, sd6, sd7 };
  document.body.innerHTML = `<div class="phone ${ANNOT ? 'annot' : ''} th${THEME}" id="phone" ${LONG ? `style="height:${LONG}px"` : ''}>${MAP[SCREEN]()}</div>`;
})();
