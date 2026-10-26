/* Team Research in the walkthrough: Dallas, Philadelphia (NFL) and Toronto, Calgary (NHL) from the published explorer team profiles.
   NFL has all five tabs; hockey has Overview and Form (the other hockey tabs repeat the same patterns and are marked stand-in). */
(function () {
  const E = window.PE, H = E.PDH, TD = window.TD, WD = window.WD, GAMES = window.PD.games, PR = window.PD.props;
  const GLOW = { DAL: '#1f3f86', PHI: '#0c6b58', TOR: '#1b4a9e', CGY: '#a02a2a' };
  const pctOf = (rank, n) => Math.round(100 * (n - rank) / (n - 1));
  const mget = (t, id) => (t._by || (t._by = Object.fromEntries(Object.values(t.metrics).map((m) => [m.id, m]))))[id];
  const M = (t, id, w) => { const m = mget(t, id); if (!m) return null; const k = w && m.w[w] ? w : Object.keys(m.w)[0], x = m.w[k]; return x ? { ...x, name: m.name, unit: m.unit, id, win: k } : null; };
  const fmt = (m) => (m.v == null ? '—' : m.unit === 'share' ? (m.v * 100).toFixed(1) + '%' : Math.abs(m.v) < 1 ? (m.v >= 0 ? '+' : '−') + Math.abs(m.v).toFixed(3) : (+m.v).toFixed(2));
  const rec = (t) => (t.record3 ? t.record3.join('–') : `${t.record[0]}–${t.record[1]}${t.record[2] ? '–' + t.record[2] : ''}`);
  const dayName = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const md = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const lgx = E.lgx;
  const spOf = (t) => (t.sport === 'NFL' ? 'nfl' : 'nhl');
  const sgo = (t, id, win, sel, opp) => `stat:${spOf(t)}|${id}|${win}|${sel || ''}|${opp || ''}`;
  const gameGo = (t, g) => { const k = Object.keys(GAMES).find((key) => { const x = GAMES[key]; return [x[1], x[2]].includes(t.abbr) && [x[1], x[2]].includes(g.opp); }); return k ? `game:${k}` : `ugame:${t.abbr}|${g.ev}`; };
  const games = (t, n) => t.games.filter((g) => g.st === 'FINAL').slice(-n);
  const ptrack = (items, h = 34) => `<div class="ptr" style="height:${h}px"><i class="rail"></i><i class="tick"></i>${items.map((x) => `<span class="mk ${x.cls}" ${x.go ? `data-go="${x.go}"` : ''} style="left:${x.pct}%">${x.l || ''}</span>`).join('')}</div>`;

  E.defaults.team = () => ({ tab: 'Overview', adj: true, pw: 'SEASON', sheet: null });
  const hero = (t) => `<div class="hero trh" style="--tc:${GLOW[t.abbr]}"><div class="glow"></div><div class="shade"></div><div class="hbar"><span class="ib">${I('back', 26)}</span><span style="display:flex"><span class="ib">${I('bell', 22)}</span><span class="ib" data-act="save">${I('bm', 22)}</span></span></div>
    <div class="who" ${st('ok', 'BUILT')}><div class="wl">${lgx(t.sport, t.abbr, 54)}<div class="wn"><span class="f">${t.name.split(' ').slice(0, -1).join(' ')}</span><span class="l">${t.name.split(' ').slice(-1)[0]}</span></div></div><span class="m">${t.sport} · ${t.season} season <span class="chip rec"><b class="num">${rec(t)}</b></span></span></div></div>`;
  const bar = (t) => `<div class="trbar" ${st('ok', 'BUILT')}><span class="ib">${I('back', 24)}</span>${lgx(t.sport, t.abbr, 30)}<b>${t.name}</b><span class="chip rec"><b class="num">${rec(t)}</b></span><span class="tr"><span class="ib" data-act="save">${I('bm', 22)}</span></span></div>`;
  const tabs = (on) => `<div class="tabs">${['Overview', 'Profile', 'Form', 'Players', 'Schedule'].map((x) => `<a class="${x === on ? 'on' : ''}" data-act="tab:${x}">${x}</a>`).join('')}</div>`;
  const nextCard = (t) => { const g = t.upcoming[0], away = g.ha === 'AWAY'; return `<div class="card gstrip" ${st('ok', 'BUILT')}>${lgx(t.sport, t.abbr, 34)}<div class="c" data-go="${gameGo(t, g)}"><b>${away ? 'at' : 'vs'} ${g.opp} · ${dayName(g.t)} ${clock(g.t)}</b><span>${away ? 'Away' : 'Home'}${t.sport === 'NFL' ? ' · O/U 43.5' : ''}</span></div><span data-go="team:${g.opp}">${lgx(t.sport, g.opp, 34)}</span><span class="go" data-go="${gameGo(t, g)}">${I('chevR', 18)}</span></div>`; };
  const propsRow = (t) => { const ps = PR.filter((p) => p.team === t.abbr); return `<div class="card prow" ${st('wire', 'WIRE')} data-go="props:team=${t.abbr}"><div><b>Props today</b><span>${ps.length} props across ${new Set(ps.map((p) => p.name)).size} ${t.abbr} players</span></div><span class="seeall">Open ${I('chevR', 14)}</span></div>`; };

  const PAIRS = { adj: [['Overall', 'adj_off_epa', 'adj_def_epa'], ['Passing', 'adj_off_db_epa', 'adj_def_db_epa'], ['Rushing', 'adj_off_rush_epa', 'adj_def_rush_epa'], ['Early downs', 'adj_off_ed_epa', 'adj_def_ed_epa']], raw: [['Overall', 'off_epa_play', 'def_epa_play'], ['Passing', 'off_dropback_epa', 'def_dropback_epa'], ['Rushing', 'off_rush_epa', 'def_rush_epa'], ['Early downs', 'off_early_down_epa', 'def_early_down_epa']] };
  function identityNFL(t, ui) {
    const set = ui.adj ? PAIRS.adj : PAIRS.raw, win = ui.adj ? 'ADJ_RIDGE' : 'SEASON';
    const rows = set.map(([lab, o, d]) => ({ lab, o: M(t, o, win), d: M(t, d, win) })), n = rows[0].o.n, rng = (a) => (Math.min(...a) === Math.max(...a) ? ord(Math.min(...a)) : `${ord(Math.min(...a))} to ${ord(Math.max(...a))}`);
    const og = (r) => sgo(t, r.o.id, r.o.win, t.abbr), dg = (r) => sgo(t, r.d.id, r.d.win, t.abbr);
    return `<div class="card idt" ${st('wire', 'WIRE')}><div class="idh"><div><span class="eyebrow">Identity</span><b>Offense vs defense</b></div><span class="segc"><i class="${ui.adj ? 'on' : ''}" data-act="adj:1">Adjusted</i><i class="${ui.adj ? '' : 'on'}" data-act="adj:0">Raw</i></span></div>
      <div class="idbig"><div class="o" data-go="${og(rows[0])}"><small>OFFENSE</small><b class="num">${ord(rows[0].o.rank)}</b><span>of ${n} · ${fmt(rows[0].o)} EPA/play</span></div><div class="d" data-go="${dg(rows[0])}"><small>DEFENSE</small><b class="num">${ord(rows[0].d.rank)}</b><span>of ${n} · ${fmt(rows[0].d)} allowed</span></div></div>
      ${rows.map((r) => `<div class="idr"><span class="lab" data-go="${og(r)}">${r.lab}</span>${ptrack([{ cls: 'd', pct: pctOf(r.d.rank, r.d.n), l: 'D', go: dg(r) }, { cls: 'o', pct: pctOf(r.o.rank, r.o.n), l: 'O', go: og(r) }])}<span class="rr"><b class="o" data-go="${og(r)}">${r.o.rank}</b><b class="d" data-go="${dg(r)}">${r.d.rank}</b></span></div>`).join('')}
      <div class="idax"><span class="ax"><i>Worst</i><i>Middle</i><i>Best</i></span></div>
      <p class="idnote">Offense ranks ${rng(rows.map((r) => r.o.rank))} of ${n} and defense ${rng(rows.map((r) => r.d.rank))} of ${n} across these four units. ${ui.adj ? 'Opponent-adjusted; the raw values are one switch away and never mixed.' : 'Raw season values: what happened, not how good the team is.'}</p></div>`;
  }
  function identityNHL(t) {
    const w = t.win || '2026-27', pk = (id) => M(t, id, w), rows = [['Goals', pk('gf_per_game'), pk('ga_per_game')], ['Exp. goals', pk('xgf_per60'), pk('xga_per60')], ['Special teams', pk('pp_pct'), pk('pk_pct')]], g = rows[0];
    return `<div class="card idt" ${st('wire', 'WIRE')}><div class="idh"><div><span class="eyebrow">Identity</span><b>Scoring vs preventing</b></div><span class="segc"><i class="on">2026–27</i><i>L10</i></span></div>
      <div class="idbig"><div class="o" data-go="${sgo(t, 'gf_per_game', w, t.abbr)}"><small>GOALS FOR</small><b class="num">${ord(g[1].rank)}</b><span>of ${g[1].n} · ${g[1].v.toFixed(2)} per game</span></div><div class="d" data-go="${sgo(t, 'ga_per_game', w, t.abbr)}"><small>GOALS AGAINST</small><b class="num">${ord(g[2].rank)}</b><span>of ${g[2].n} · ${g[2].v.toFixed(2)} per game</span></div></div>
      ${rows.map(([lab, o, d]) => `<div class="idr"><span class="lab" data-go="${sgo(t, o.id, o.win, t.abbr)}">${lab}</span>${ptrack([{ cls: 'd', pct: pctOf(d.rank, d.n), l: lab === 'Special teams' ? 'K' : 'D', go: sgo(t, d.id, d.win, t.abbr) }, { cls: 'o', pct: pctOf(o.rank, o.n), l: lab === 'Special teams' ? 'P' : 'O', go: sgo(t, o.id, o.win, t.abbr) }])}<span class="rr"><b class="o" data-go="${sgo(t, o.id, o.win, t.abbr)}">${o.rank}</b><b class="d" data-go="${sgo(t, d.id, d.win, t.abbr)}">${d.rank}</b></span></div>`).join('')}
      <div class="idax"><span class="ax"><i>Worst</i><i>Middle</i><i>Best</i></span></div><p class="idnote">Special teams: P is the power play (${(rows[2][1].v * 100).toFixed(1)}%), K the penalty kill (${(rows[2][2].v * 100).toFixed(1)}%). Season values.</p></div>`;
  }
  const roleOf = (m) => (/^def_|ga_per|xga|pk_pct/.test(m.id) ? 'd' : 'o');
  function extremes(t, win, k = 3) {
    const cats = t.sport === 'NFL' ? ['offense', 'defense'] : ['advanced', 'official'], skip = /^(off_adot|off_no_huddle|off_plays_per|off_proe|off_shotgun|corsi|fenwick|model|rating|sva|hd_xgf)/;
    const rows = Object.values(t.metrics).filter((m) => cats.includes(m.cat) && !skip.test(m.id)).map((m) => ({ m, x: m.w[win] })).filter((r) => r.x && r.x.rank);
    const fam = (id) => { const b = id.replace(/^(off_|def_)/, ''); return /rz/.test(b) ? 'rz' : /rush/.test(b) ? 'rush' : /epa/.test(b) ? 'epa' : b.replace(/_ng$/, '').replace(/(_play|_per60)$/, ''); };
    const pick = (arr) => { const seen = new Set(), o = []; for (const r of arr) { const f = fam(r.m.id) + (/^def_/.test(r.m.id) ? 'd' : /^off_/.test(r.m.id) ? 'o' : ''); if (seen.has(f)) continue; seen.add(f); o.push(r); if (o.length === k) break; } return o; };
    const by = [...rows].sort((a, b) => pctOf(b.x.rank, b.x.n) - pctOf(a.x.rank, a.x.n) || a.x.rank - b.x.rank);
    return { best: pick(by), worst: pick([...by].reverse()) };
  }
  const exRow = (t, win) => ({ m, x }) => { const r = roleOf(m); return `<div class="exr" data-go="${sgo(t, m.id, win, t.abbr)}"><span class="rl ${r}">${r === 'o' ? 'OFF' : 'DEF'}</span><span class="nm">${m.name.replace(/ allowed$/, '')}</span><b class="num">${ord(x.rank)} of ${x.n}</b>${ptrack([{ cls: r, pct: pctOf(x.rank, x.n) }], 20)}</div>`; };
  const extremesCard = (t) => { const win = t.sport === 'NFL' ? 'SEASON' : '2026-27', e = extremes(t, win), row = exRow(t, win); return `<div class="card exc" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Highest ranked</span></div>${e.best.map(row).join('')}<div class="exh" style="margin-top:8px"><span class="eyebrow">Lowest ranked</span></div>${e.worst.map(row).join('')}<p class="idnote">Raw ${t.sport === 'NFL' ? 'season' : '2026–27'} values among ${e.best[0].x.n} teams. Tap any row for its league ranking.</p></div>`; };
  function margins(t, n, { w = 338, h = 112 } = {}) {
    const gs = games(t, n), ms = gs.map((g) => g.for - g.against), mx = Math.max(6, ...ms.map(Math.abs)), mid = (h - 22) / 2 + 4, sw = (w - 8) / gs.length, bw = Math.min(26, sw - 8), id = 'm' + t.abbr + n;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.go0}"/><stop offset="1" stop-color="${TH.go1}"/></linearGradient><linearGradient id="${id}l" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${TH.gu0}"/><stop offset="1" stop-color="${TH.gu1}"/></linearGradient></defs><line x1="4" x2="${w - 4}" y1="${mid}" y2="${mid}" stroke="rgba(255,255,255,.28)"/>`;
    gs.forEach((g, i) => { const m = ms[i], x = 4 + sw * i + sw / 2, hh = Math.max(3, Math.abs(m) / mx * (mid - 12)), win = m > 0; s += `<rect data-go="fgame:${t.abbr}|${g.ev}" x="${x - bw / 2}" y="${win ? mid - hh : mid}" width="${bw}" height="${hh}" rx="3.5" fill="url(#${id}${win ? 'w' : 'l'})"/><text x="${x}" y="${win ? mid - hh - 3 : mid + hh + 10}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${win ? TH.hit : TH.miss}">${m > 0 ? '+' : '−'}${Math.abs(m)}</text>`; });
    return s + `</svg><div class="mlg" style="width:${w - 8}px;margin-left:4px">${gs.map((g) => `<span data-go="team:${g.opp}">${lgx(t.sport, g.opp, 18)}<i>${g.ha === 'AWAY' ? '@' : ''}</i></span>`).join('')}</div>`;
  }

  /* ---------- screens */
  function overview(t, ui) {
    const n = t.sport === 'NFL' ? 6 : 8, last = games(t, n);
    return `<div class="scr">${hero(t)}${tabs('Overview')}<div class="trbody">${nextCard(t)}${propsRow(t)}${t.sport === 'NFL' ? identityNFL(t, ui) : identityNHL(t)}${extremesCard(t)}
      <div class="card lst" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Last ${n} games</span><span class="seeall" data-act="tab:Form">Form ${I('chevR', 14)}</span></div>${margins(t, n)}<p class="idnote">${rec(t)} this season · scored ${f1(avg(last.map((g) => g.for)))} and allowed ${f1(avg(last.map((g) => g.against)))} per game. Bars are the final margin.</p></div></div></div>${chrome('Games')}`;
  }
  function profile(t, ui) {
    const adj = ui.adj, W = ui.pw;
    const cat = adj ? ['opponent-adjusted'] : null;
    const offIds = adj ? ['adj_off_epa', 'adj_off_db_epa', 'adj_off_rush_epa', 'adj_off_ed_epa', 'adj_off_sr', 'adj_off_explosive'] : ['off_epa_play', 'off_dropback_epa', 'off_rush_epa', 'off_success_rate', 'off_explosive_rate', 'off_td_drive_rate', 'off_rz_epa', 'off_sack_rate_allowed'];
    const defIds = adj ? ['adj_def_epa', 'adj_def_db_epa', 'adj_def_rush_epa', 'adj_def_ed_epa', 'adj_def_sr', 'adj_def_explosive'] : ['def_epa_play', 'def_dropback_epa', 'def_rush_epa', 'def_success_rate', 'def_explosive_rate', 'def_rz_epa', 'def_sack_rate', 'def_takeaway_rate'];
    const row = (id, r) => { const m = mget(t, id); if (!m) return ''; const w = adj ? 'ADJ_RIDGE' : W, a = m.w[w] || m.w[Object.keys(m.w)[0]], b = !adj && W !== 'L34' ? m.w.L34 : null, pa = pctOf(a.rank, a.n), d = b ? b.rank - a.rank : 0;
      return `<div class="prr" data-go="${sgo(t, id, adj ? 'ADJ_RIDGE' : W, t.abbr)}"><div class="pn"><b>${m.name.replace(/ allowed$/, '')}</b><span class="num">${fmt({ ...a, unit: m.unit })}</span></div>${ptrack([...(b ? [{ cls: 'g', pct: pctOf(b.rank, b.n) }] : []), { cls: r, pct: pa }], 26)}<div class="pk"><b class="num">${ord(a.rank)}</b><small>${b ? (d > 0 ? `<i class="up">▲ ${d}</i>` : d < 0 ? `<i class="dn">▼ ${-d}</i>` : '<i class="fl">–</i>') + ' vs last 34' : 'adjusted'}</small></div></div>`; };
    const sort = (ids) => ids.filter((id) => mget(t, id)).sort((x, y) => (mget(t, x).w[adj ? 'ADJ_RIDGE' : W] || { rank: 99 }).rank - (mget(t, y).w[adj ? 'ADJ_RIDGE' : W] || { rank: 99 }).rank);
    return `<div class="scr">${bar(t)}${tabs('Profile')}
      <div class="ctlrow" ${st('ok', 'BUILT')}><span class="segc wide"><i class="${adj ? '' : 'on'}" data-act="adj:0">Raw</i><i class="${adj ? 'on' : ''}" data-act="adj:1">Opponent-adjusted</i></span></div>
      <div class="ctlrow">${adj ? '<span class="segc wide"><i class="on">Three-season weighted rating</i></span>' : `<span class="segc wide">${[['SEASON', 'Season · 6 g'], ['L6', 'Last 6'], ['L34', 'Last 34']].map(([w, l]) => `<i class="${W === w ? 'on' : ''}" data-act="pw:${w}">${l}</i>`).join('')}</span>`}</div>
      <div class="ctlrow k"><span><i class="kd o"></i>Offense</span><span><i class="kd d"></i>Defense</span>${adj ? '' : '<span><i class="kd g"></i>Last 34 games</span>'}</div>
      <div class="profl" ${st('wire', 'WIRE')}><div class="grh"><span class="rl o">OFF</span><b>Offense</b><small>${adj ? 'opponent-adjusted' : 'raw, ' + (W === 'SEASON' ? 'season' : W)}</small></div>${sort(offIds).map((id) => row(id, 'o')).join('')}<div class="grh"><span class="rl d">DEF</span><b>Defense</b><small>${adj ? 'opponent-adjusted' : 'raw'}</small></div>${sort(defIds).map((id) => row(id, 'd')).join('')}</div>
      <p class="idnote pn2">Raw values describe what happened, not how good the team is. Opponent-adjusted values are a different statistic and never sit in the same list. Ranks are among the 28 teams in the current packet.</p></div>${chrome('Games')}`;
  }
  function form(t) {
    const nfl = t.sport === 'NFL', N = nfl ? 12 : 8, g12 = games(t, N), half = Math.floor(g12.length / 2), last = g12.slice(half), prev = g12.slice(0, half), g26 = t.s26, close = nfl ? 8 : 1;
    const split = (f) => { const a = g12.filter(f); return { w: a.filter((g) => g.o === 'W').length, l: a.filter((g) => g.o !== 'W').length, mg: a.length ? avg(a.map((g) => g.for - g.against)) : 0 }; };
    const sg = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1), cell = (lab, x) => `<div><small>${lab}</small><b class="num">${x.w}–${x.l}</b><span>${sg(x.mg)} avg margin</span></div>`;
    const res = (g) => `<div class="res" data-go="fgame:${t.abbr}|${g.ev}"><span class="wk">${nfl ? g.comp.replace(/^\d{4} REG week /, 'Wk ') : md(g.t)}</span><span data-go="team:${g.opp}">${lgx(t.sport, g.opp, 24)}</span><span class="nm">${g.ha === 'AWAY' ? '@ ' : 'vs '}${g.opp}</span><b class="num">${g.for}–${g.against}</b><span class="wl ${g.o === 'W' ? 'W' : 'L'}">${g.o === 'W' ? 'W' : 'L'}</span></div>`;
    return `<div class="scr">${bar(t)}${tabs('Form')}<div class="trbody"><div class="card frm" ${st('wire', 'WIRE')}><div class="exh"><span class="eyebrow">Last ${N} games · margin</span></div>${margins(t, N, { h: 118 })}
      <div class="twov"><div><small>Last ${last.length}</small><b class="num">${f1(avg(last.map((g) => g.for)))}<i>/</i>${f1(avg(last.map((g) => g.against)))}</b><span>scored / allowed</span></div><div><small>Previous ${prev.length}</small><b class="num">${f1(avg(prev.map((g) => g.for)))}<i>/</i>${f1(avg(prev.map((g) => g.against)))}</b><span>scored / allowed</span></div></div></div>
      <div class="card spl3" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Splits · last ${N}</span></div><div class="s3">${cell('Home', split((g) => g.ha === 'HOME'))}${cell('Away', split((g) => g.ha === 'AWAY'))}${cell(nfl ? 'One score' : 'One goal', split((g) => Math.abs(g.for - g.against) <= close))}</div>${nfl ? '' : '<p class="idnote">Losses include overtime and shootout losses: the record keeps them apart (' + rec(t) + '), the game rows do not say which.</p>'}</div>
      <div class="card lockc" ${st('new', 'NEW DATA')}>${I('lock', 15)}<div><b>Against the spread · over/under record</b><span>Needs closing lines by game, which SIFT does not publish.</span></div></div>
      <div class="exh" style="margin:6px 4px 0"><span class="eyebrow">${nfl ? '2026 results' : 'Recent results'}</span></div><div class="card reslist" ${st('ok', 'BUILT')}>${[...g26].reverse().slice(0, nfl ? 6 : 8).map(res).join('')}</div></div></div>${chrome('Games')}`;
  }
  function schedule(t) {
    const ups = t.upcoming.slice(0, 6), prevT = t.s26[t.s26.length - 1].t, op = (a) => t.opp[a] || null;
    const pill = (kind, o, id, abbr) => (o ? `<span class="op ${kind}" data-go="stat:nfl|${id}|ADJ_RIDGE|${abbr}|${t.abbr}"><b class="num">${ord(o.rank)}</b></span>` : '<span class="op none">—</span>');
    const ok = ups.filter((g) => op(g.opp)), avgo = ok.length ? Math.round(avg(ok.map((g) => pctOf(op(g.opp).off.rank, 28)))) : null, avgd = ok.length ? Math.round(avg(ok.map((g) => pctOf(op(g.opp).def.rank, 28)))) : null;
    let last = new Date(prevT).getTime();
    const row = (g, i) => { const o = op(g.opp), days = Math.round((new Date(g.t).getTime() - last) / 864e5); last = new Date(g.t).getTime();
      return `<div class="sch ${i === 0 ? 'now' : ''}"><div class="dt" data-go="${gameGo(t, g)}"><b>${md(g.t)}</b><span>${dayName(g.t)}</span></div><span data-go="team:${g.opp}">${lgx(t.sport, g.opp, 32)}</span><div class="nm" data-go="${gameGo(t, g)}"><b>${g.ha === 'AWAY' ? '@' : 'vs'} ${g.opp}</b><span>${days} days rest</span></div><div class="ops">${pill('o', o && o.off, 'adj_off_epa', g.opp)}</div><div class="ops">${pill('d', o && o.def, 'adj_def_epa', g.opp)}</div></div>`; };
    return `<div class="scr">${bar(t)}${tabs('Schedule')}<div class="trbody"><div class="card sum6" ${st('wire', 'WIRE')}><span class="eyebrow">Next ${ups.length} opponents</span><div class="s2g"><div class="o"><small>Opponent offenses, adjusted</small><b class="num">${avgo ?? '—'}</b><span>average percentile</span></div><div class="d"><small>Opponent defenses, adjusted</small><b class="num">${avgd ?? '—'}</b><span>average percentile</span></div></div><p class="idnote">Descriptive: season-long opponent-adjusted EPA per play, ${ok.length} of ${ups.length} opponents ranked. Higher is stronger; it is not a prediction.</p></div>
      <div class="card schl" ${st('wire', 'WIRE')}><div class="schh"><span></span><span></span><span></span><span class="o">Opp. offense</span><span class="d">Opp. defense</span></div>${ups.map(row).join('')}</div></div></div>${chrome('Games')}`;
  }
  function parseAv(a) { const m = /^(.+?) \(([A-Z0-9/]+)(?:, [A-Z]+)?\): (.*?)(?:; return ([0-9-]+))?(?:; impact: (.*))?$/.exec(a.detail); return m ? { name: m[1], pos: m[2], why: m[3], ret: m[4], status: a.status } : null; }
  const photoOf = (n) => ({ 'CeeDee Lamb': 'dal-ceedee-lamb', 'Dak Prescott': 'dal-dak-prescott', 'Javonte Williams': 'dal-javonte-williams' })[n];
  function players(t, ui) {
    const av = t.avail.filter((a) => a.status !== 'ACTIVE').map(parseAv).filter(Boolean), outp = av.filter((a) => a.status === 'OUT'), other = av.filter((a) => a.status !== 'OUT');
    const cnt = (n) => PR.filter((p) => p.name === n && p.team === t.abbr).length;
    const roster = t.players.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.role)).sort((a, b) => cnt(b.display_name) - cnt(a.display_name)).slice(0, 6);
    const avRow = (a) => `<div class="avr" data-go="player:${a.name}"><span class="ps">${a.pos}</span><div class="nm"><b>${a.name}</b><span>${a.why}${a.ret ? ' · return ' + md(a.ret + 'T12:00:00Z') : ''}</span></div><span class="chip ${a.status === 'OUT' ? 'bad' : 'amb'}">${a.status === 'OUT' ? 'Out' : 'IR'}</span></div>`;
    const plRow = (p) => { const c = cnt(p.display_name), ph = photoOf(p.display_name), isOut = outp.some((a) => a.name === p.display_name); return `<div class="plr"><span data-go="player:${p.display_name}"><span class="av4" style="--s:38px">${ph ? `<img src="assets/players/${ph}.webp" alt="">` : lgx(t.sport, t.abbr, 26)}</span></span><div class="nm" data-go="player:${p.display_name}"><b>${p.display_name}</b><span>${p.role}</span></div>${isOut ? '<span class="chip bad">Out</span>' : c ? `<span class="pcnt" data-go="props:player=${p.display_name}">${c} ${c === 1 ? 'prop' : 'props'} <i>›</i></span>` : '<span class="pcnt dim">no props</span>'}</div>`; };
    const lim = ui.sheet ? 0 : 4, shown = [...outp, ...other];
    return `<div class="scr">${bar(t)}${tabs('Players')}<div class="trbody"><div class="card avc" ${st('ok', 'BUILT')}><div class="exh"><span class="eyebrow">Availability</span><span class="cn"><b>${outp.length}</b> out${other.length ? ` · <b>${other.length}</b> on IR` : ''}</span></div>${(ui.allAv ? shown : shown.slice(0, 4)).map(avRow).join('')}${shown.length > 4 && !ui.allAv ? `<div class="more" data-act="allav">${shown.length - 4} more ${I('chevR', 14)}</div>` : ''}</div>
      <div class="olc" ${st('wire', 'WIRE')} data-act="olwhy">${I('info', 14, TH.info)}<span>Offensive-line quality is not published</span><i class="why">Why ${I('chevR', 12)}</i></div>${ui.olwhy ? '<div class="standin" style="margin:0">The publication captures no pass-block or run-block grades and no snap-level continuity, so no offensive-line metric exists to show. Linemen who are out are listed above.</div>' : ''}
      <div class="exh" style="margin:6px 4px 0"><span class="eyebrow">Skill players</span><span class="seeall" data-go="props:team=${t.abbr}">Props ${I('chevR', 14)}</span></div><div class="card plist2" ${st('wire', 'WIRE')}>${roster.map(plRow).join('')}</div></div></div>${chrome('Games')}`;
  }
  const standin = (t, name) => `<div class="scr">${bar(t)}${tabs(name)}<div class="standin"><span class="demo-chip">STAND-IN</span> <b>${name}</b> for hockey repeats the NFL pattern with hockey statistics. Overview and Form are built in this walkthrough; this tab is not.</div></div>${chrome('Games')}`;

  E.screens.team = (p, ui) => {
    const t = TD[p.t];
    if (!t) { const sp = E.isNFL(p.t) ? 'NFL' : 'NHL'; return { html: `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span>${lgx(sp, p.t, 30)}<h1>${p.t}</h1></div></div><div class="unk"><b>Team Research for ${p.t} is not loaded in this walkthrough</b>Dallas, Philadelphia, Toronto and Calgary are. In the app every team has the same page. <span class="seeall" data-go="stat:${sp.toLowerCase()}|${sp === 'NFL' ? 'adj_off_epa|ADJ_RIDGE' : 'pp_pct|2026-27'}|${p.t}|">Open a ranking with ${p.t} highlighted ${I('chevR', 14)}</span></div></div>${chrome('Games')}` }; }
    const nfl = t.sport === 'NFL', tab = ui.tab;
    let html;
    if (tab === 'Overview') html = overview(t, ui); else if (tab === 'Form') html = form(t);
    else if (!nfl) html = standin(t, tab);
    else if (tab === 'Profile') html = profile(t, ui); else if (tab === 'Schedule') html = schedule(t); else html = players(t, ui);
    return { html };
  };
  const A = E.acts;
  A.adj = (v) => E.set({ adj: v === '1' }); A.pw = (w) => E.set({ pw: w }); A.allav = () => E.set({ allAv: true }); A.olwhy = () => { const c = E.cur(); E.set({ olwhy: !c.ui.olwhy }); };
  E.describe.team = (p, ui) => ({ title: `${(TD[p.t] || { name: p.t }).name} · ${ui.tab}`, chips: [ui.tab === 'Profile' && (ui.adj ? 'Adjusted' : 'Raw ' + ui.pw)].filter(Boolean) });
  E.TEAMK = { rec, margins, games };
})();
