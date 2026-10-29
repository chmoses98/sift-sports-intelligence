/* Stat Detail in the walkthrough: any NFL or NHL statistic with a published ranking (149 ranking documents), with Ranking, Trend, Compare and About.
   Raw and opponent-adjusted versions are separate statistics; the switch opens the counterpart's own ranking. */
(function () {
  const E = window.PE, WD = window.WD, TD = window.TD, H = E.PDH, PR = window.PD.props, S = E.S;
  const RK = WD.RK, DEF = WD.DEF, TN = WD.TN;
  const pctOf = (rank, n) => Math.round(100 * (n - rank) / (n - 1));
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const md = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const nick = (sp, t) => ((TN[sp] || {})[t] || t).split(' ').slice(-1)[0];
  const winsOf = (sp, id) => Object.keys(RK).filter((k) => k.startsWith(`${sp}|${id}|`)).map((k) => k.split('|')[2]);
  const pickWin = (sp, id, w) => { const ws = winsOf(sp, id); return ws.includes(w) ? w : ['ADJ_RIDGE', 'SEASON', '2026-27'].find((x) => ws.includes(x)) || ws[0]; };
  const role = (id) => (/^(adj_def|def_|ga_|xga|pk_)/.test(id) ? 'd' : 'o');
  const nameOf = (sp, id) => (DEF[`${sp}|${id}`] || { name: id }).name;
  const fmtFor = (sp, id) => (v) => { if (v == null) return '—'; if (/pct|share/.test(id) && sp === 'nhl') return (v * 100).toFixed(1) + '%'; if (/per_game|per60/.test(id)) return (+v).toFixed(2); if (/explosive|sack|to_rate|success|_sr$|rate/.test(id) && Math.abs(v) < 1) return (v >= 0 && /^adj/.test(id) ? '+' : v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(1) + ' pts'; if (Math.abs(v) < 1) return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3); return (+v).toFixed(2); };
  const COUNTER = { adj_off_epa: 'off_epa_play', adj_off_db_epa: 'off_dropback_epa', adj_off_rush_epa: 'off_rush_epa', adj_off_ed_epa: 'off_early_down_epa', adj_off_explosive: 'off_explosive_rate', adj_off_to_rate: 'off_turnover_rate', adj_off_sack_rate: 'off_sack_rate_allowed', adj_off_sr: 'off_success_rate', adj_def_epa: 'def_epa_play', adj_def_db_epa: 'def_dropback_epa', adj_def_rush_epa: 'def_rush_epa', adj_def_ed_epa: 'def_early_down_epa', adj_def_explosive: 'def_explosive_rate', adj_def_to_rate: 'def_takeaway_rate', adj_def_sack_rate: 'def_sack_rate', adj_def_sr: 'def_success_rate' };
  const COUNTER_REV = Object.fromEntries(Object.entries(COUNTER).map(([a, b]) => [b, a]));
  const isAdj = (id) => /^adj_/.test(id);
  const counterpart = (id) => COUNTER[id] || COUNTER_REV[id] || null;
  const related = (sp, id) => {
    if (sp === 'nhl') return ['gf_per_game', 'ga_per_game', 'xgf_per60', 'xga_per60', 'pp_pct', 'pk_pct'].filter((x) => x !== id && RK[`nhl|${x}|2026-27`]).map((x) => [x, '2026-27']);
    const fam = id.replace(/^(adj_)?(off|def)_/, ''), out = [];
    const add = (x) => { const w = pickWin('nfl', x); if (x !== id && RK[`nfl|${x}|${w}`] && !out.some((o) => o[0] === x)) out.push([x, w]); };
    const base = isAdj(id) ? id.replace(/^adj_(off|def)_/, '') : null;
    if (isAdj(id)) { const side = /^adj_off/.test(id) ? 'off' : 'def', opp = side === 'off' ? 'def' : 'off'; ['epa', 'db_epa', 'rush_epa', 'ed_epa'].forEach((f) => add(`adj_${side}_${f}`)); add(`adj_${opp}_${base}`); if (counterpart(id)) add(counterpart(id)); }
    else { if (counterpart(id)) add(counterpart(id)); ['epa_play', 'dropback_epa', 'rush_epa', 'success_rate'].forEach((f) => add(`${/^off_/.test(id) ? 'off' : 'def'}_${f}`)); }
    return out.slice(0, 5);
  };
  E.STATK = { nameOf, role, fmtFor, pickWin };

  const bar = (title, sub, eyebrow) => `<div class="sdh"><span class="ib back">${I('back', 24)}</span><div class="tt"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><small>${sub}</small></div><span class="tr"><span class="ib" data-act="save">${I('bm', 22)}</span></span></div>`;
  const tabs = (on) => `<div class="tabs sdt">${['Ranking', 'Trend', 'Compare', 'About'].map((x) => `<a class="${x === on ? 'on' : ''}" data-act="stab:${x}">${x}</a>`).join('')}</div>`;
  const ptr = (items, h = 28) => `<div class="ptr" style="height:${h}px"><i class="rail"></i><i class="tick"></i>${items.map((x) => `<span class="mk ${x.cls}" ${x.go ? `data-go="${x.go}"` : ''} style="left:${x.pct}%">${x.l || ''}</span>`).join('')}</div>`;

  function swarm(es, sum, { hib, sel, opp, fmt, w = 330, h = 74 }) {
    const vs = es.map((e) => e.v), lo = Math.min(...vs), hi = Math.max(...vs), x = (v) => 12 + (w - 24) * (hib ? (v - lo) / (hi - lo || 1) : (hi - v) / (hi - lo || 1)), placed = [], base = h - 26;
    [...es].sort((a, b) => x(a.v) - x(b.v)).forEach((e) => { const cx = x(e.v); let y = base; for (let k = 0; k < 8; k++) { y = base - k * 8.6; if (!placed.some((p) => Math.hypot(p.cx - cx, p.y - y) < 8.4)) break; } placed.push({ cx, y, e }); });
    const mx = x(sum.median);
    let s = `<svg class="swm" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="${mx}" x2="${mx}" y1="6" y2="${h - 16}" stroke="rgba(255,255,255,.28)" stroke-dasharray="3 3"/>`;
    placed.filter((p) => p.e.t !== sel && p.e.t !== opp).forEach((p) => { s += `<circle data-act="selrow:${p.e.t}" cx="${p.cx}" cy="${p.y}" r="3.6" fill="#59626e"/>`; });
    placed.filter((p) => p.e.t === opp).forEach((p) => { s += `<circle cx="${p.cx}" cy="${p.y}" r="5.4" fill="#0a0d11" stroke="#a4acb6" stroke-width="1.6" stroke-dasharray="2.6 2"/>`; });
    placed.filter((p) => p.e.t === sel).forEach((p) => { s += `<circle cx="${p.cx}" cy="${p.y}" r="7.5" fill="#0a0d11" stroke="var(--cyan)" stroke-width="2.4"/><circle cx="${p.cx}" cy="${p.y}" r="2.6" fill="var(--cyan)"/>`; });
    return s + `<text x="12" y="${h - 3}" font-size="9.5" fill="${TH.axis}">worst ${fmt(hib ? lo : hi)}</text><text x="${mx}" y="${h - 3}" font-size="9.5" fill="${TH.axis}" text-anchor="middle">median ${fmt(sum.median)}</text><text x="${w - 12}" y="${h - 3}" font-size="9.5" fill="${TH.axis}" text-anchor="end">best ${fmt(hib ? hi : lo)}</text></svg>`;
  }

  E.defaults.stat = (p) => ({ tab: 'Ranking', win: p.win, sel: p.sel, opp: p.opp, all: false, obs: null, cmpm: 'teams', cmpA: p.sel, cmpB: p.opp, aboutOpen: false, sheet: null });
  const ctx = (p, ui) => { const sp = p.sp, id = p.id, win = pickWin(sp, id, ui.win || p.win), rk = RK[`${sp}|${id}|${win}`], sport = sp === 'nfl' ? 'NFL' : 'NHL'; return { sp, id, win, rk, sport, hib: rk ? rk.hib : true, fmt: fmtFor(sp, id), r: role(id), name: nameOf(sp, id), es: rk ? rk.e.map(([t, v, r]) => ({ t, v, r, name: (TN[sp] || {})[t] || t })) : [] }; };
  const noRank = (sport, name) => `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>${name}</h1></div></div><div class="unk"><b>No ranking is published for this statistic</b>The walkthrough holds every ranking the publications provide for ${sport}.</div></div>${chrome('Explore')}`;

  function ranking(p, ui, c) {
    const { rk, es, fmt, hib, sport } = c, sel = ui.sel, opp = ui.opp, e = es.find((x) => x.t === sel), counter = counterpart(c.id), adj = isAdj(c.id), wins = winsOf(c.sp, c.id);
    const row = (x) => `<div class="rkr ${x.t === sel ? 'sel' : ''} ${x.t === opp ? 'opp' : ''}"><b class="rn num">${x.r}</b><span data-go="team:${x.t}">${E.lgx(sport, x.t, 26)}</span><span class="nm" data-go="team:${x.t}">${nick(c.sp, x.t)}${x.t === sel ? '<i>Selected</i>' : x.t === opp ? '<i class="o">Next opponent</i>' : ''}</span><span class="bw" data-act="selrow:${x.t}"><i class="${c.r}" style="width:${(Math.max(0.04, hib ? (x.v - Math.min(...es.map((q) => q.v))) / ((Math.max(...es.map((q) => q.v)) - Math.min(...es.map((q) => q.v))) || 1) : (Math.max(...es.map((q) => q.v)) - x.v) / ((Math.max(...es.map((q) => q.v)) - Math.min(...es.map((q) => q.v))) || 1)) * 100).toFixed(1)}%"></i></span><b class="vl num" data-act="selrow:${x.t}">${fmt(x.v)}</b></div>`;
    const want = new Set(ui.all ? es.map((x) => x.r) : [1, 2, 3, 4, 5, ...(e ? [e.r] : []), ...(es.find((x) => x.t === opp) ? [es.find((x) => x.t === opp).r] : [])]);
    const list = []; let prev = 0;
    es.filter((x) => want.has(x.r)).sort((a, b) => a.r - b.r).forEach((x) => { if (x.r - prev > 1) list.push(`<div class="rkg">${x.r - prev - 1} more teams</div>`); list.push(row(x)); prev = x.r; });
    if (prev < es.length && !ui.all) list.push(`<div class="rkg">${es.length - prev} more teams</div>`);
    return `<div class="scr">${bar(c.name, `${sport} · ${rk.n} teams · ${rk.uni.replace(/^.*?, /, '')}`, 'League ranking')}${tabs('Ranking')}
      <div class="fam" ${st('ok', 'BUILT')}>${counter ? `<span class="segc wide"><i class="${adj ? 'on' : ''}" ${adj ? '' : `data-go="stat:${c.sp}|${counter}||${sel || ''}|${opp || ''}"`}>Opponent-adjusted</i><i class="${adj ? '' : 'on'}" ${adj ? `data-go="stat:${c.sp}|${counter}||${sel || ''}|${opp || ''}"` : ''}>Raw</i></span><span class="fam2">${I('info', 13, TH.info)} Two different statistics, ranked separately</span>` : `<span class="fam2">${I('info', 13, TH.info)} ${adj ? 'Opponent-adjusted' : 'Raw'} · no counterpart ranking is linked in the registry</span>`}</div>
      ${wins.length > 1 ? `<div class="chs2" ${st('wire', 'WIRE')}>${wins.map((w) => `<span class="chip ${w === c.win ? 'cy' : ''}" data-act="swin:${w}">${w === 'SEASON' ? 'Season' : w === 'L6' ? 'Last 6' : w === 'L34' ? 'Last 34' : w === 'L10' ? 'Last 10' : w}</span>`).join('')}</div>` : ''}
      ${e ? `<div class="selc" ${st('wire', 'WIRE')}><span data-go="team:${e.t}">${E.lgx(sport, e.t, 44)}</span><div class="sdb2" data-go="team:${e.t}"><small>${e.t}</small><b class="num">${ord(e.r)}</b><small>of ${rk.n} teams</small></div><div class="sv"><b class="num" style="color:var(--${c.r === 'd' ? 'def' : 'off'})">${fmt(e.v)}</b><small>${rk.w === 'ADJ_RIDGE' ? 'adjusted' : rk.w}</small></div><div class="sdm2"><small>Ahead of</small><b class="num">${rk.n - e.r}</b><small>teams</small></div></div>` : `<div class="standin" style="margin-top:10px">Tap a team’s bar or value to select it.</div>`}
      <div class="card swc" ${st('wire', 'WIRE')}>${swarm(es, rk.sum, { hib, sel, opp, fmt })}<div class="swk">${e ? `<span><i class="kd sel"></i>${e.t}</span>` : ''}${opp && es.find((x) => x.t === opp) ? `<span><i class="kd opp"></i>${opp} · next opponent, ${ord(es.find((x) => x.t === opp).r)}</span>` : ''}${e && opp ? `<span class="cmpl" data-act="scmp">Compare ${I('chevR', 12)}</span>` : ''}</div></div>
      <div class="card rkc" ${st('ok', 'BUILT')}>${list.join('')}<div class="rkm" data-act="allrows">${ui.all ? 'Show fewer' : `Show all ${rk.n} teams`} ${I('chevR', 14)}</div></div></div>${chrome('Explore')}`;
  }

  function trend(p, ui, c) {
    const sel = ui.sel, ser = c.id === 'points_for' ? (TD[sel] && TD[sel].pf) : c.id === 'points_against' ? (TD[sel] && TD[sel].pa) : c.id === 'point_margin' ? (TD[sel] && TD[sel].pf && TD[sel].pf.map((x, i) => ({ ...x, v: x.v - TD[sel].pa[i].v, roll: null }))) : null;
    const head = `${bar(c.name, `${c.sport} · ${c.rk.n} teams${sel ? ' · ' + nick(c.sp, sel) : ''}`, 'Trend')}${tabs('Trend')}`;
    if (ser && ser.length) {
      const last = ser.slice(-12), n = last.length, W = 338, Hh = 168, mean = c.rk.sum.mean, sIdx = ui.obs == null ? n - 1 : ui.obs, mx = Math.max(...last.map((q) => Math.abs(q.v)), Math.abs(mean)) + 5, w = (W - 8) / n, bw = Math.min(22, w - 8), signed = c.id === 'point_margin', zero = signed ? Hh / 2 - 6 : Hh - 20, yv = (v) => (signed ? zero - (v / mx) * (Hh / 2 - 22) : Hh - 20 - (v / mx) * (Hh - 34));
      let svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><defs><linearGradient id="sdb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf1f7"/><stop offset="1" stop-color="#8f9bab"/></linearGradient></defs>`;
      svg += `<line x1="4" x2="${W - 4}" y1="${yv(mean)}" y2="${yv(mean)}" stroke="rgba(255,255,255,.4)" stroke-dasharray="5 4"/>`;
      last.forEach((q, i) => { const x = 4 + w * i + w / 2, on = i === sIdx, y0 = yv(0), y1 = yv(q.v); svg += `<rect data-act="obs:${i}" x="${x - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(2, Math.abs(y0 - y1))}" rx="3.5" fill="url(#sdb)" opacity="${on ? 1 : 0.62}" ${on ? 'stroke="var(--cyan)" stroke-width="2"' : ''}/><text x="${x}" y="${Math.min(y0, y1) - 4}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${on ? '#fff' : '#a4acb6'}">${q.v}</text>`; });
      if (last.every((q) => q.roll != null)) svg += `<polyline points="${last.map((q, i) => `${4 + w * i + w / 2},${yv(q.roll)}`).join(' ')}" fill="none" stroke="#ffb27a" stroke-width="1.8" stroke-linejoin="round"/>`;
      svg += '</svg>';
      const t = TD[sel], o = last[sIdx], g = t.games.find((x) => x.t.slice(0, 10) === o.t.slice(0, 10));
      return `<div class="scr">${head}<div class="card trc" style="margin-top:12px" ${st('wire', 'WIRE')}>${svg}<div class="mlg" style="width:${W - 8}px;margin-left:4px">${last.map((q, i) => `<span data-go="team:${q.opp}">${E.lgx('NFL', q.opp, 17)}${i === sIdx ? '<u></u>' : ''}</span>`).join('')}</div><div class="trkl"><span><i class="bx"></i>${signed ? 'Margin' : 'Points'}</span>${last.every((q) => q.roll != null) ? '<span><i class="ln"></i>Rolling avg</span>' : ''}<span><i class="dl"></i>League ${f1(mean)}</span></div></div>
        <div class="card obs" ${st('ok', 'BUILT')}><div class="obh"><b>${g ? g.comp.replace(/^\d{4} REG week /, 'Week ') : ''} · ${g && g.ha === 'AWAY' ? 'at' : 'vs'} ${o.opp}</b><span>${md(o.t)}</span></div><div class="obv"><div><b class="num">${g ? g.for + '–' + g.against : o.v}</b><small>final</small></div><div><b class="num">${o.roll != null ? f1(o.roll) : o.v}</b><small>${o.roll != null ? 'rolling average' : 'this game'}</small></div><div class="obb"><span class="btn sm pri" data-go="${g ? `fgame:${sel}|${g.ev}` : `game:`}">Game Detail</span><span class="btn sm" data-go="team:${o.opp}">${o.opp} ${I('chevR', 12)}</span></div></div></div></div>${chrome('Explore')}`;
    }
    const ws = winsOf(c.sp, c.id), e = ui.sel ? ws.map((w) => { const r = RK[`${c.sp}|${c.id}|${w}`], x = r.e.find((q) => q[0] === ui.sel); return x ? { w, v: x[1], r: x[2], n: r.n } : null; }).filter(Boolean) : [];
    return `<div class="scr">${head}${e.length > 1 ? `<div class="card swc" style="margin-top:12px" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">${ui.sel} across windows</span></div>${e.map((x) => `<div class="rkr" data-act="swin:${x.w}" style="grid-template-columns:70px 1fr 56px 60px"><span class="nm">${x.w === 'SEASON' ? 'Season' : x.w === 'L6' ? 'Last 6' : x.w === 'L34' ? 'Last 34' : x.w}</span>${ptr([{ cls: c.r, pct: pctOf(x.r, x.n) }], 24)}<b class="num" style="text-align:right">${ord(x.r)}</b><b class="vl num">${c.fmt(x.v)}</b></div>`).join('')}<p class="idnote">The rank in each published window; tap one to open its ranking.</p></div>` : `<div class="unk"><b>One window only</b>${c.name} is published with a single window, so there is no path to draw.</div>`}
      <div class="standin"><span class="demo-chip">DATA</span> A per-game series is published for points scored, allowed and margin (Dallas loaded here). Other statistics show how the rank moves between windows.</div></div>${chrome('Explore')}`;
  }

  function compare(p, ui, c) {
    const A = ui.cmpA, B = ui.cmpB;
    const modes = `<div class="who2" ${st('ok', 'BUILT')}>${A ? `<span class="wc" data-go="team:${A}">${E.lgx(c.sport, A, 30)}<b>${A}</b></span>` : ''}<span class="vs">vs</span>${B ? `<span class="wc" data-go="team:${B}">${E.lgx(c.sport, B, 30)}<b>${B}</b></span>` : ''}<span class="swapb" data-act="swap">⇄</span><span class="segc"><i class="${ui.cmpm === 'teams' ? 'on' : ''}" data-act="cmpm:teams">Teams</i><i class="${ui.cmpm === 'players' ? 'on' : ''}" data-act="cmpm:players">Players</i></span></div>`;
    if (ui.cmpm === 'players') {
      const f = (n) => PR.find((q) => q.name === n && q.fam === 'rec'), a = f('CeeDee Lamb'), b = f('George Pickens'), k = 5, mx = Math.max(...a.hist.vals, ...b.hist.vals, k) + 1;
      const col = (q, ph) => { const v = q.hist.vals, hit = v.filter((x) => x >= k).length, sorted = [...v].sort((x, y) => x - y); return { v, hit, avg: avg(v), med: (sorted[4] + sorted[5]) / 2, hi: Math.max(...v), html: `<div class="pcc"><div class="sdph" data-go="player:${q.name}|rec|5"><span class="av4" style="--s:34px">${ph ? `<img src="assets/players/${ph}.webp" alt="">` : E.lgx('NFL', 'DAL', 24)}</span><div><b>${q.name.split(' ')[1]}</b><small>WR · DAL</small></div></div><div class="pbars">${v.map((x) => `<i class="${x >= k ? 'h' : 'm'}" style="height:${(4 + 62 * x / mx).toFixed(0)}px"><b>${x}</b></i>`).join('')}<u class="thr" style="bottom:${(4 + 62 * (k - 0.5) / mx).toFixed(0)}px"></u></div></div>` }; };
      const L = col(a, 'dal-ceedee-lamb'), R = col(b, null), row = (lab, x, y) => `<div class="cmr"><span class="v">${x}</span><b>${lab}</b><span class="v">${y}</span></div>`;
      return `<div class="scr">${bar('Compare players', 'Receptions · last 10 games', 'Compare')}${tabs('Compare')}${modes}<div class="card sdpl" ${st('wire', 'WIRE')}><div class="pcg">${L.html}${R.html}</div><div class="ln5"><span>dashed line = ${k}+ receptions</span></div><div class="sdcm">${row('Last-10 average', f1(L.avg), f1(R.avg))}${row('Median', L.med, R.med)}${row('Best game', L.hi, R.hi)}${row(k + '+ games', L.hit + ' of 10', R.hit + ' of 10')}</div></div>
        <div class="olc" ${st('new', 'NEW DATA')}>${I('info', 14, TH.info)}<span>League rank among players is not published</span><i class="why">Why ${I('chevR', 12)}</i></div></div>${chrome('Explore')}`;
    }
    const sets = c.sp === 'nfl' ? { off: [['Overall', 'adj_off_epa'], ['Passing', 'adj_off_db_epa'], ['Rushing', 'adj_off_rush_epa'], ['Early downs', 'adj_off_ed_epa']], def: [['Overall', 'adj_def_epa'], ['Passing', 'adj_def_db_epa'], ['Rushing', 'adj_def_rush_epa'], ['Early downs', 'adj_def_ed_epa']] } : { off: [['Goals for', 'gf_per_game'], ['Exp. goals for', 'xgf_per60'], ['Power play', 'pp_pct']], def: [['Goals against', 'ga_per_game'], ['Exp. goals against', 'xga_per60'], ['Penalty kill', 'pk_pct']] };
    const get = (id, t) => { const w = pickWin(c.sp, id, null), r = RK[`${c.sp}|${id}|${w}`]; const x = r && r.e.find((q) => q[0] === t); return x ? { v: x[1], r: x[2], n: r.n, w } : null; };
    const line = (lab, id, rl) => { const a = A && get(id, A), b = B && get(id, B); if (!a || !b) return ''; const pa = pctOf(a.r, a.n), pb = pctOf(b.r, b.n), aw = a.r < b.r, f = fmtFor(c.sp, id);
      return `<div class="cr" data-go="stat:${c.sp}|${id}|${a.w}|${A}|${B}"><div class="cl"><b>${lab}</b><span>${f(a.v)} · ${f(b.v)}</span></div><div class="ctr"><div class="ptr" style="height:30px"><i class="rail"></i><i class="tick"></i><span class="gap ${rl}" style="left:${Math.min(pa, pb)}%;width:${Math.abs(pa - pb)}%"></span><span class="mk lg ${rl} ${aw ? 'win' : 'lose'}" data-go="team:${A}" style="left:${pa}%">${E.lgx(c.sport, A, 16)}</span><span class="mk lg ${rl} ${aw ? 'lose' : 'win'}" data-go="team:${B}" style="left:${pb}%">${E.lgx(c.sport, B, 16)}</span></div></div><div class="cnk"><b class="${aw ? 'w' : ''}">${a.r}</b><b class="${aw ? '' : 'w'}">${b.r}</b></div></div>`; };
    return `<div class="scr">${bar('Compare teams', `${c.sport} · ${c.sp === 'nfl' ? 'opponent-adjusted EPA per play' : 'official and season statistics'}`, 'Compare')}${tabs('Compare')}${modes}
      <div class="card cmpc" ${st('wire', 'WIRE')}><div class="grh"><span class="rl o">OFF</span><b>${c.sp === 'nfl' ? 'Offense' : 'Scoring'}</b><small>1st is best · ${A}, ${B}</small></div>${sets.off.map(([l, id]) => line(l, id, 'o')).join('')}<div class="grh" style="margin-top:12px"><span class="rl d">DEF</span><b>${c.sp === 'nfl' ? 'Defense' : 'Preventing'}</b><small>1st is best · ${A}, ${B}</small></div>${sets.def.map(([l, id]) => line(l, id, 'd')).join('')}</div>
      <p class="idnote" style="padding:2px 18px 0">Each marker is a team’s rank; the bolder marker is the better rank. Tap a row for that statistic’s ranking, a logo for the team.</p></div>${chrome('Explore')}`;
  }

  function about(p, ui, c) {
    const d = DEF[`${c.sp}|${c.id}`] || {}, rk = c.rk, sel = ui.sel, rel = related(c.sp, c.id);
    const brief = c.sp === 'nfl' && isAdj(c.id) ? `An opponent-adjusted rating of the team’s ${/^adj_off/.test(c.id) ? 'offense' : 'defense'}: a weighted ridge regression over the last three seasons, with recent games counting more (half-life 10 weeks).` : (d.description || '').split('. ')[0] + '.';
    const lims = rk.lim || [], reg = d.known_limitations || [];
    const open = ui.aboutOpen;
    return `<div class="scr">${bar(c.name, `${c.sport} · ${isAdj(c.id) ? 'opponent-adjusted' : 'raw'}`, 'About this statistic')}${tabs('About')}
      <div class="trbody"><div class="card abt" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">What it measures</span><span class="chip">${c.hib == null ? 'Descriptive' : c.hib ? 'Higher is better' : 'Lower is better'}</span></div><p>${brief}</p>
        <div class="kv2"><div><small>Window</small><b>${c.win === 'ADJ_RIDGE' ? 'Three-season weighted rating' : c.win}</b></div><div><small>Teams</small><b>${rk.n} · ${rk.uni}</b></div><div><small>Source</small><b>${d.source || '—'}</b></div><div><small>Updated</small><b>Each publication run</b></div></div>
        <div class="more2" data-act="aboutopen">${open ? 'Hide the full definition' : 'Full definition'} ${I(open ? 'chevD' : 'chevR', 13)}</div>
        ${open ? `<div class="fulldef"><p>${d.description || ''}</p>${d.methodology_version ? `<div class="kv2"><div><small>Methodology</small><b>${d.methodology_version}</b></div></div>` : ''}</div>` : ''}</div>
      <div class="card lim" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Limits the publication states</span></div>${(open ? lims : lims.slice(0, 3)).map((x) => `<div class="li">${I('info', 13, TH.info)}<span class="${open ? '' : 'clamp'}">${x}</span></div>`).join('')}${open ? reg.map((x) => `<div class="li">${I('info', 13, TH.info)}<span>${x}</span></div>`).join('') : ''}${!lims.length && !reg.length ? '<div class="li"><span>The publication states no limits for this statistic.</span></div>' : ''}<div class="more2" data-act="aboutopen">${open ? `Showing all ${lims.length + reg.length} limits, methodology and source` : `All ${lims.length + reg.length} limits in full, methodology and source`} ${I(open ? 'chevD' : 'chevR', 13)}</div></div>
      <div class="exh" style="margin:2px 4px 0"><span class="eyebrow">Related statistics</span><span class="seeall">${sel || ''} rank</span></div>
      <div class="card relc" ${st('wire', 'WIRE')}>${rel.map(([id, w]) => { const r = RK[`${c.sp}|${id}|${w}`], x = sel && r.e.find((q) => q[0] === sel); return `<div class="rr2" data-go="stat:${c.sp}|${id}|${w}|${sel || ''}|${ui.opp || ''}"><span class="nm">${nameOf(c.sp, id)}</span>${x ? ptr([{ cls: role(id), pct: pctOf(x[2], r.n) }], 20) : '<span></span>'}<b class="num">${x ? ord(x[2]) : '—'}</b>${I('chevR', 14)}</div>`; }).join('')}</div>
      <p class="idnote" style="padding:0 6px">Related statistics are derived here from the registry’s category and names, because its own related list is empty (backend backlog item 1).</p>
      <div class="rel2" ${st('wire', 'WIRE')}>${sel ? `<span class="chip" data-go="team:${sel}">${E.lgx(c.sport, sel, 14)} Team Research · ${sel}</span>` : ''}${sel && ui.opp && c.sp === 'nfl' && ['DAL', 'PHI'].includes(sel) ? `<span class="chip" data-go="game:26OCT26DALPHI">Game matchup · DAL at PHI</span>` : ''}</div></div></div>${chrome('Explore')}`;
  }

  E.screens.stat = (p, ui) => {
    const c = ctx(p, ui); if (!c.rk) return { html: noRank(c.sport, c.name) };
    const html = ui.tab === 'Trend' ? trend(p, ui, c) : ui.tab === 'Compare' ? compare(p, ui, c) : ui.tab === 'About' ? about(p, ui, c) : ranking(p, ui, c);
    return { html };
  };
  const A = E.acts;
  A.stab = (t) => E.set({ tab: t, obs: null }); A.swin = (w) => E.set({ win: w, obs: null }); A.selrow = (t) => { const c = E.cur(); if (c.ui.sel === t) return E.go('team', { t }); E.set({ sel: t, cmpA: t }); };
  A.allrows = () => { const c = E.cur(); E.set({ all: !c.ui.all }); }; A.obs = (i) => E.set({ obs: +i }); A.cmpm = (m) => E.set({ cmpm: m }); A.aboutopen = () => { const c = E.cur(); E.set({ aboutOpen: !c.ui.aboutOpen }); };
  A.swap = () => { const c = E.cur(); E.set({ cmpA: c.ui.cmpB, cmpB: c.ui.cmpA }); }; A.scmp = () => { const c = E.cur(); E.set({ tab: 'Compare', cmpA: c.ui.sel, cmpB: c.ui.opp }); };
  E.describe.stat = (p, ui) => { const sp = p.sp; const id = p.id; return { title: nameOf(sp, id), chips: [ui.tab, ui.sel && 'highlight ' + ui.sel, ui.win && ui.win !== 'ADJ_RIDGE' && ui.win].filter(Boolean) }; };
})();
