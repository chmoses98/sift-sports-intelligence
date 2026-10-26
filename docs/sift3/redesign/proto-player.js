/* Player Research in the walkthrough. CeeDee Lamb receptions is the full approved P1 to P4 experience (19 real games, three lanes, alt lines,
   research filters, matchup). Every other player or stat opens the same layout from the data Prop Discovery already holds (last 10 games, ladder,
   opponent unit): that is a compact version, marked as such. Nothing is estimated for either. */
(function () {
  const E = window.PE, H = E.PDH, S = E.S, PR = window.PD.props;
  const WINS = ['L5', 'L10', '2026', 'vs PHI', 'All 19'];
  const setsOf = () => ({ L5: LOG.slice(-5), L10: LAST, '2026': LOG.filter((g) => g.season === 2026), 'vs PHI': LOG.filter((g) => g.opp === 'PHI'), 'All 19': LOG });
  const isLamb = (p) => p.name === 'CeeDee Lamb' && (!p.stat || p.stat === 'rec');
  const propsOf = (name) => PR.filter((x) => x.name === name);
  E.defaults.player = (p) => ({ tab: 'Overview', win: 'L10', site: 'any', result: 'any', k: p.k || null, sel: null, sheet: null, fam: p.stat || null });

  const gamesFor = (ui) => { let g = setsOf()[ui.win] || LAST; if (ui.site === 'home') g = g.filter((x) => x.home); if (ui.site === 'away') g = g.filter((x) => !x.home); if (ui.result === 'won') g = g.filter((x) => x.score.for > x.score.against); if (ui.result === 'lost') g = g.filter((x) => x.score.for < x.score.against); return g; };
  const standin = (t) => `<div class="standin"><span class="demo-chip">STAND-IN</span> <b>${t}</b> is not part of the approved set (P1 to P4). In the app it is the existing v3 tab.</div>`;
  const obsCard = (g) => `<div class="card barcard" ${st('ok', 'BUILT')}><div class="bh"><b>Week ${g.week} · ${g.home ? 'vs' : 'at'} ${g.opp}</b><span>${g.date.slice(5).replace('-', '/')}</span></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><div><b class="num" style="font-size:21px">${recOf(g)}</b> <small style="color:var(--muted)">receptions · ${g.score.for}–${g.score.against} ${g.score.for > g.score.against ? 'W' : 'L'}</small></div><span class="btn sm pri" style="flex:none;padding:0 12px" data-go="fgame:DAL|${g.game_id}">Game Detail</span></div></div>`;

  function fullOverview(p, ui) {
    const k = ui.k || K0, games = gamesFor(ui), onIdx = WINS.indexOf(ui.win), filt = (ui.site !== 'any' ? 1 : 0) + (ui.result !== 'any' ? 1 : 0);
    const body = games.length ? `<div style="margin-top:4px" ${st('wire', 'WIRE')}>${barChart({ games, k, h: 160, sel: ui.sel })}</div>${sumHtml(k, games)}` : `<div class="unk">No games match these filters.</div>`;
    return `<div class="scr">${heroHtml()}${gstripHtml()}${tabsHtml(ui.tab)}${pillsHtml(filt)}${ui.tab === 'Overview' ? `${decideHtml(k, games.length ? games : LAST)}<div class="card chartc">${winsHtml(k, onIdx)}${body}</div>${ui.sel != null && games[ui.sel] ? obsCard(games[ui.sel]) : ''}` : ''}</div>${chrome('Games')}`;
  }
  function fullTab(p, ui) {
    if (ui.tab === 'Matchup') return playerMatchup();
    if (ui.tab === 'Props') {
      const mine = propsOf('CeeDee Lamb');
      return `<div class="scr">${heroHtml()}${gstripHtml()}${tabsHtml('Props')}<div class="plist" style="padding-top:8px">${mine.map((x) => H.rowP(x, { k: x.featured })).join('')}<div class="showall" data-go="props:player=CeeDee Lamb">Open in Prop Discovery ${I('chevR', 14)}</div></div></div>${chrome('Games')}`;
    }
    return `<div class="scr">${heroHtml()}${gstripHtml()}${tabsHtml(ui.tab)}${standin(ui.tab)}</div>${chrome('Games')}`;
  }
  function ladderSheet(ui) {
    const k0 = ui.k || K0, games = gamesFor(ui).length ? gamesFor(ui) : LAST;
    return `<div class="sheet"><div class="grab"></div><div class="shh"><span class="h2">Alt lines</span><span class="ib" data-act="sheet:close">${I('x', 20)}</span></div>
      <div class="card" style="padding:8px 8px" ${st('wire', 'WIRE')}>${[4, 5, 6, 7, 8, 9].map((r) => { const h = hits(games, r), sf = sift(r); return `<div class="ladr ${r === k0 ? 'on' : ''}" data-act="lk:${r}"><b class="num">${r}+</b><span class="l3"><span style="color:var(--mkt)" data-go="contract:26OCT26DALPHI:rec:ceedeelamb|${r}">${S.noQuote ? '—' : askAt(r) + '¢'}</span><span>${h}/${games.length}</span><span style="color:${sf != null ? 'var(--sift)' : 'var(--dim)'}">${sf != null ? sf + '%' : '—'}</span></span><span style="color:var(--dim);font:400 11px var(--f-ui)">${r === k0 ? 'selected' : ''}</span></div>`; }).join('')}
      <div class="foot" style="margin-top:6px">Market ask · history in the current window · SIFT model. The model publishes 3+, 5+ and 7+ only; other rungs stay “—”. Lanes are never subtracted.</div></div></div>`;
  }
  function fullFilters(ui) {
    const n = gamesFor(ui), k = ui.k || K0, chip = (act, l, on) => `<span class="fc2 ${on ? 'on' : ''}" data-act="${act}">${l}</span>`;
    return `<div class="sheet"><div class="grab"></div><div class="shh"><span class="h2">Research filters</span><span class="x" data-act="pfreset">Reset</span></div>
      <div class="live2" ${st('ok', 'BUILT')}><div><b>${n.length} games match</b><br><small>Hit ${hits(n, k)}/${n.length} at ${k}+ · avg ${n.length ? f1(n.reduce((a, g) => a + recOf(g), 0) / n.length) : '—'}</small></div></div>
      <div class="flab">Time range</div><div class="fchips">${WINS.map((w) => chip('win:' + w, w, ui.win === w)).join('')}</div>
      <div class="flab">Site</div><div class="fchips">${[['any', 'All'], ['home', 'Home'], ['away', 'Away']].map(([v, l]) => chip('site:' + v, l, ui.site === v)).join('')}</div>
      <div class="flab">Game script</div><div class="fchips">${[['any', 'Any'], ['won', 'Team won'], ['lost', 'Team lost']].map(([v, l]) => chip('result:' + v, l, ui.result === v)).join('')}</div>
      <div class="flab" ${st('new', 'NEW DATA')}>${I('lock', 12)} Needs more data</div><div class="fchips"><span class="fc2" style="opacity:.5">Teammate out</span><span class="fc2" style="opacity:.5">Weather</span><span class="fc2" style="opacity:.5">Favorite</span></div>
      <div class="applyb" data-act="sheet:close">Show ${n.length} games</div></div>`;
  }

  /* ---------- compact: the same layout from Prop Discovery's data */
  function compact(p, ui) {
    const mine = propsOf(p.name);
    if (!mine.length) return `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>${p.name}</h1></div></div><div class="unk"><b>No research data for this player</b>This walkthrough holds prices and game logs for players with props today. In the app, Player Research opens for every rostered player.</div></div>${chrome('Games')}`;
    const fams = mine.map((x) => x.fam), fam = fams.includes(ui.fam) ? ui.fam : fams.includes(p.stat) ? p.stat : fams[0], pr = mine.find((x) => x.fam === fam), k = ui.k && ui.fam === fam ? ui.k : pr.featured;
    const photo = { ceedeelamb: 'dal-ceedee-lamb', dakprescott: 'dal-dak-prescott', jalenhurts: 'phi-jalen-hurts', javontewilliams: 'dal-javonte-williams' }[H.nk(p.name)];
    const [, away, home, when] = [0, ...window.PD.games[pr.game].slice(1)], vals = pr.hist ? pr.hist.vals : null, win = ui.win === 'L5' ? 'L5' : 'L10', v = vals ? (win === 'L5' ? vals.slice(-5) : vals) : null;
    const r = H.rung(pr, k), h = v ? { h: v.filter((x) => x >= k).length, n: v.length } : null, m = H.mdl(pr, k);
    const hero = `<div class="hero"><div class="glow"></div>${photo ? `<img class="ph" src="assets/players/${photo}.webp" alt="">` : ''}<div class="shade"></div><div class="hbar"><span class="ib">${I('back', 26)}</span><span style="display:flex"><span class="ib">${I('star', 22)}</span><span class="ib" data-act="save">${I('bm', 22)}</span></span></div>
      <div class="who" ${st('ok', 'BUILT')}><div class="wl"><span data-go="team:${pr.team}">${E.lgx(pr.sport, pr.team, 46)}</span><div class="wn"><span class="f">${p.name.split(' ')[0]}</span><span class="l">${p.name.split(' ').slice(1).join(' ')}</span></div></div><span class="m">${pr.team} · ${pr.sport}</span></div></div>`;
    const gstrip = `<div class="card gstrip" ${st('wire', 'WIRE')}><span data-go="team:${pr.team}">${E.lgx(pr.sport, pr.team, 34)}</span><div class="c" data-go="game:${pr.game}"><b>${pr.at} ${pr.opp} · ${pr.when}</b><span>${away} at ${home}</span></div><span data-go="team:${pr.opp}">${E.lgx(pr.sport, pr.opp, 34)}</span></div>`;
    const tabs = `<div class="tabs">${['Overview', 'Props', 'Matchup'].map((t) => `<a class="${t === ui.tab ? 'on' : ''}" data-act="tab:${t}">${t}${t === 'Props' ? `<i>${mine.length}</i>` : ''}</a>`).join('')}</div>`;
    const pills = `<div class="pills">${mine.map((x) => `<span class="pill ${x.fam === fam ? 'on' : ''}" data-act="pfam:${x.fam}">${H.ABBR[x.fam]}</span>`).join('')}<span class="pill f" data-act="sheet:filters">${I('sliders', 19)}</span></div>`;
    const decide = `<div class="card decide"><div class="dl"><div data-act="sheet:ladder"><div class="k">${H.SHORT[fam]} · Over</div><div class="v">${k - 0.5}<small>${k}+ · ${pr.at} ${pr.opp}</small></div></div><div class="r" data-go="contract:${pr.id}|${k}"><div class="p">${S.noQuote ? 'Over —' : 'Over ' + r.ask + '¢'}</div><div class="s">${S.noQuote ? 'no quote' : r.ask + '% implied · pre-fee'}</div></div><span class="cv" data-act="sheet:ladder">${I('chevD', 20)}</span></div>
      <div class="trio" ${st('wire', 'WIRE')}><div data-go="contract:${pr.id}|${k}"><span class="t m"><span class="sw"></span>Market</span><span class="n m">${S.noQuote ? '—' : r.ask + '%'}</span><span class="s">Kalshi ask for ${k}+</span></div>
      <div data-act="sheet:filters"><span class="t h"><span class="sw h"></span>History</span><span class="n h">${h ? Math.round(100 * h.h / h.n) + '%' : '—'}</span><span class="s">${h ? `${h.h} of ${h.n} · observed` : 'no game log'}</span></div>
      <div data-act="tab:Matchup"><span class="t z"><span class="sw z"></span>SIFT model</span><span class="n z ${m == null ? 'off' : ''}">${m != null ? m + '%' : '—'}</span><span class="s">${m != null ? `P(${k}+) published` : pr.model.status === 'published' ? 'not published at this rung' : 'not approved yet'}</span></div></div><div class="foot">Pre-fee market implied · observed frequency · approved model estimate</div></div>`;
    const med = v ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
    const chart = `<div class="card chartc"><div class="wins" ${st('ok', 'BUILT')}>${['L5', 'L10'].map((w) => `<div class="${w === win ? 'on' : ''}" data-act="win:${w}">${w}<b>${vals ? (w === 'L5' ? vals.slice(-5) : vals).filter((x) => x >= k).length + '/' + (w === 'L5' ? 5 : vals.length) : '—'}</b></div>`).join('')}</div>
      ${v ? `<div ${st('wire', 'WIRE')}>${H.bars(v, k, 338, 150)}</div><div class="sum" ${st('ok', 'BUILT')}><div><b class="${h.h * 2 >= h.n ? 'pos' : 'neg'}">${h.h}/${h.n}</b><span>Hit rate</span></div><div><b>${f1(v.reduce((a, b) => a + b, 0) / v.length)}</b><span>Average</span></div><div><b>${med}</b><span>Median</span></div><div><b>${Math.max(...v)}</b><span>High</span></div></div>` : `<div class="unk" style="margin:10px 0">No game log is published for ${pr.sport} players yet. Prices and the contract are available.</div>`}</div>`;
    let body = decide + chart;
    if (ui.tab === 'Props') body = `<div class="plist" style="padding-top:8px">${mine.map((x) => H.rowP(x, { k: x.featured })).join('')}<div class="showall" data-go="props:player=${p.name}">Open in Prop Discovery ${I('chevR', 14)}</div></div>`;
    if (ui.tab === 'Matchup') { const mm = pr.matchup, g = H.statGo(pr); body = `<div class="card sec" style="margin:8px 16px 0" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">${pr.opp} ${pr.sport === 'NFL' ? 'defense' : 'goals against'}</span><span class="note">opponent unit</span></div>${mm ? `<div class="umu" ${g ? `data-go="${g}"` : ''}><div class="slh"><span>${E.lgx(pr.sport, pr.opp, 16)} ${pr.opp} ${pr.sport === 'NFL' ? mm.unit.toLowerCase() : 'goals against'}</span><b>${ord(mm.rank)} of ${mm.n}</b></div><div class="utrk"><div class="rail"></div><i class="tick"></i><span class="mkr d" style="left:${100 * (mm.n - mm.rank) / (mm.n - 1)}%">${E.lgx(pr.sport, pr.opp, 15)}</span><div class="ends"><span>Worst</span><span>Best</span></div></div></div>` : '<div class="unk" style="margin:6px 0">No opponent rows are published for this sport yet.</div>'}<div class="foot">The SIFT model lane for this prop is ${pr.model.status === 'published' ? 'published' : 'not approved for display'}; “—” is never filled.</div></div>`; }
    return `<div class="scr">${hero}${gstrip}${tabs}${ui.tab === 'Overview' ? pills : ''}<div ${ui.tab === 'Overview' ? '' : ''}>${body}</div><div class="standin" style="margin-top:12px"><span class="demo-chip">COMPACT</span> The approved P1 to P4 layout with the data held for this player. The full experience is built for CeeDee Lamb receptions.</div></div>${chrome('Games')}`;
  }
  function compactLadder(p, ui) {
    const mine = propsOf(p.name), fam = mine.map((x) => x.fam).includes(ui.fam) ? ui.fam : mine.map((x) => x.fam).includes(p.stat) ? p.stat : mine[0].fam, pr = mine.find((x) => x.fam === fam), k0 = ui.k && ui.fam === fam ? ui.k : pr.featured;
    return `<div class="sheet"><div class="grab"></div><div class="shh"><span class="h2">Alt lines</span><span class="ib" data-act="sheet:close">${I('x', 20)}</span></div><div class="card" style="padding:8px">${pr.ladder.map((r) => { const h = H.hist(pr, r.k), m = H.mdl(pr, r.k); return `<div class="ladr ${r.k === k0 ? 'on' : ''}" data-act="lk:${r.k}"><b class="num">${r.k}+</b><span class="l3"><span style="color:var(--mkt)" data-go="contract:${pr.id}|${r.k}">${S.noQuote ? '—' : r.ask + '¢'}</span><span>${h ? h.h + '/' + h.n : '—'}</span><span style="color:${m != null ? 'var(--sift)' : 'var(--dim)'}">${m != null ? m + '%' : '—'}</span></span><span></span></div>`; }).join('')}</div></div>`;
  }
  function compactFilters(p, ui) { const chip = (act, l, on) => `<span class="fc2 ${on ? 'on' : ''}" data-act="${act}">${l}</span>`; return `<div class="sheet"><div class="grab"></div><div class="shh"><span class="h2">Research filters</span><span class="x" data-act="pfreset">Reset</span></div><div class="flab">Time range</div><div class="fchips">${['L5', 'L10'].map((w) => chip('win:' + w, w, (ui.win === 'L5' ? 'L5' : 'L10') === w)).join('')}</div><div class="standin"><span class="demo-chip">COMPACT</span> Site, game script, role, rest and opponent filters need the full game log, which this walkthrough holds for CeeDee Lamb.</div><div class="applyb" data-act="sheet:close">Done</div></div>`; }

  E.screens.player = (p, ui) => {
    const lamb = isLamb(p) || (p.name === 'CeeDee Lamb' && !p.stat);
    let html, sheet = '';
    if (lamb) { html = ui.tab === 'Overview' ? fullOverview(p, ui) : fullTab(p, ui); sheet = ui.sheet ? (ui.sheet.t === 'ladder' ? ladderSheet(ui) : ui.sheet.t === 'filters' ? fullFilters(ui) : H.sheetFor(ui)) : ''; }
    else { html = compact(p, ui); sheet = ui.sheet ? (ui.sheet.t === 'ladder' ? compactLadder(p, ui) : ui.sheet.t === 'filters' ? compactFilters(p, ui) : H.sheetFor(ui)) : ''; }
    return { html, sheet };
  };
  const A = E.acts;
  A.tab = (t) => { const c = E.cur(); if (c.name === 'player') E.set({ tab: t, sel: null }); else if (c.name === 'team') E.set({ tab: t }); else if (c.name === 'stat') E.set({ tab: t }); else E.set({ tab: t }); };
  A.win = (w) => { const c = E.cur(); if (c.name === 'player') E.set({ win: w, sel: null }); };
  A.site = (v) => E.set({ site: v, sel: null }); A.result = (v) => E.set({ result: v, sel: null });
  A.pfreset = () => E.set({ site: 'any', result: 'any', win: 'L10', sel: null });
  A.bar = (i) => { const c = E.cur(); E.set({ sel: c.ui.sel === +i ? null : +i }); };
  A.lk = (k) => E.set({ k: +k, sheet: null, sel: null });
  A.pfam = (f) => { const c = E.cur(); if (c.p.name === 'CeeDee Lamb' && f === 'rec') return E.replace('player', { name: c.p.name, stat: 'rec' }); E.set({ fam: f, k: null, tab: 'Overview' }); };
  A.pill = (l) => { const c = E.cur(), map = { 'REC YDS': 'recyds', TD: 'td' }; if (l === 'TGT') return E.toast('No market for targets; the targets chart is part of the full player log'); E.replace('player', { name: c.p.name, stat: map[l] }); };
  E.describe.player = (p, ui) => { const mine = propsOf(p.name), fam = ui.fam || p.stat || (mine[0] && mine[0].fam) || 'rec', abbr = H.ABBR[fam] || 'REC', k = ui.k || p.k || (mine.find((x) => x.fam === fam) || {}).featured || (typeof K0 !== 'undefined' ? K0 : ''); return { title: `${p.name} · ${abbr} ${k}+`, chips: [ui.win, ui.site !== 'any' && (ui.site === 'away' ? 'Away games' : 'Home games'), ui.result !== 'any' && (ui.result === 'won' ? 'Team won' : 'Team lost'), ui.tab !== 'Overview' && ui.tab].filter(Boolean) }; };
})();
