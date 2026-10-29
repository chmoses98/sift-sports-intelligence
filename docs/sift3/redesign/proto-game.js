/* Game Detail (Overview, Matchup with the SIFT Lens, Props), the five-game list, completed-game stand-ins, Saved research, and the Home stand-in.
   The Matchup tab is the approved G1 + G2 + G3 composition for DAL at PHI; other games open Overview and Props. */
(function () {
  const E = window.PE, H = E.PDH, TD = window.TD, GAMES = window.PD.games, PR = window.PD.props, S = E.S;
  const dayName = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  const md = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const GL = { 26: 0 };
  const innerPad = (html) => { const d = document.createElement('div'); d.innerHTML = html; return [...d.querySelectorAll('.pad')].map((x) => x.outerHTML).join(''); };
  const standin = (t, why) => `<div class="standin"><span class="demo-chip">STAND-IN</span> <b>${t}</b> ${why || 'is not part of the approved set. In the app it is the existing v3 tab.'}</div>`;

  /* ---------- header for any game */
  function gHeader(g) {
    return `<div class="ghero"><div class="glow2"></div><div class="hbar"><span class="ib">${I('back', 26)}</span><div class="gl0"><b>${g.label}</b><span>${g.sub}</span></div><span style="display:flex"><span class="ib">${I('star', 22)}</span><span class="ib">${I('bell', 21)}</span></span></div>
      <div class="teams"><div data-go="team:${g.away}">${E.lgx(g.sport, g.away, 54)}<b>${g.awayName}</b></div><em>${g.score ? g.score : 'at'}</em><div data-go="team:${g.home}">${E.lgx(g.sport, g.home, 54)}<b>${g.homeName}</b></div></div></div>`;
  }
  const gtabsFor = (tabs, on) => `<div class="tabs gt">${tabs.map((t) => `<a class="${t === on ? 'on' : ''}" data-act="gtab:${t}">${t}</a>`).join('')}</div>`;
  function resolve(p) {
    if (p.key) { const [sport, away, home, when, iso] = GAMES[p.key], nm = (t) => ((window.WD.TN[sport.toLowerCase()] || {})[t] || t).split(' ').slice(-1)[0]; return { key: p.key, sport, away, home, awayName: nm(away), homeName: nm(home), label: `${sport} · ${p.key === '26OCT26DALPHI' ? 'Week 7' : 'Today'}`, sub: `${dayName(iso)} · ${when.replace(/^\w+ /, '')}`, iso, status: 'pre' }; }
    const q = p.fin || p.up, t = TD[q.team], ev = q.ev;
    if (p.fin && /^20\d\d_/.test(ev)) { const g = LOG.find((x) => x.game_id === ev); if (g) { const away = g.home ? g.opp : 'DAL', home = g.home ? 'DAL' : g.opp; return { sport: 'NFL', away, home, awayName: away, homeName: home, label: `NFL · ${g.season} week ${g.week}`, sub: `Final · ${md(g.date + 'T12:00:00Z')}`, score: g.home ? `${g.score.against}–${g.score.for}` : `${g.score.for}–${g.score.against}`, status: 'fin' }; } }
    const g = t && t.games.find((x) => x.ev === ev); if (!g) return { sport: 'NFL', away: '—', home: '—', awayName: '—', homeName: '—', label: 'Game', sub: '', status: 'unk' };
    const away = g.ha === 'AWAY' ? t.abbr : g.opp, home = g.ha === 'AWAY' ? g.opp : t.abbr, nm = (a) => ((window.WD.TN[t.sport.toLowerCase()] || {})[a] || a).split(' ').slice(-1)[0];
    return { sport: t.sport, away, home, awayName: nm(away), homeName: nm(home), label: `${t.sport} · ${g.comp.replace(/^\d{4} REG /, '').replace('regular', '')}`.trim(), sub: p.fin ? `Final · ${md(g.t)}` : `${dayName(g.t)} ${md(g.t)} · ${clock(g.t)}`, score: p.fin ? (g.ha === 'AWAY' ? `${g.for}–${g.against}` : `${g.against}–${g.for}`) : null, status: p.fin ? 'fin' : 'pre' };
  }
  const keyPlayers = (g) => { const key = g.key; if (!key) return []; const by = {}; PR.filter((p) => p.game === key && !H.out(p)).forEach((p) => { (by[p.name] = by[p.name] || { p, n: 0 }).n++; }); return Object.values(by).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.p); };

  /* ---------- Overview */
  function overview(g, ui) {
    const nfl = g.key === '26OCT26DALPHI', ps = g.key ? PR.filter((p) => p.game === g.key) : [], fin = g.status === 'fin';
    const lines = nfl ? `<div class="card sec" style="margin-top:10px" ${st('ok', 'BUILT')}><div class="sh2"><span class="h2">Win prices</span><span class="note">Kalshi · pre-fee</span></div><div class="gl2">${D.game.map((m, i) => `<div class="glp" data-go="contract:g:${i}|"><span>${m.sub}</span><b class="num">${S.noQuote ? '—' : m.ask + '¢'}</b></div>`).join('')}</div></div>` : '';
    const tilt = nfl ? `<div class="card sec" ${st('wire', 'WIRE')} data-act="gtab:Matchup"><div class="sh2"><span class="h2">Where it tilts</span><span class="seeall">Matchup ${I('chevR', 14)}</span></div>${(() => { const A = edgeMeter('DAL', 'PHI'), B = edgeMeter('PHI', 'DAL'); return `<div class="seg2" style="margin-top:4px"><div class="sg on" style="pointer-events:none"><span class="s1">${lg('DAL', 17)}DAL offense</span>${A.html}</div><div class="sg on" style="pointer-events:none"><span class="s1">${lg('PHI', 17)}PHI offense</span>${B.html}</div></div>`; })()}</div>` : '';
    const km = nfl ? `<div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Players to research</span><span class="note">key matchups</span></div>${['CeeDee Lamb', 'Dallas Goedert', 'George Pickens'].map((n) => { const x = PR.find((p) => p.name === n && p.fam === 'rec'); return `<div class="km"><span class="av3" data-go="player:${n}|rec|${x.featured}">${H.av(x, 30, false)}</span><div class="kt" data-go="player:${n}|rec|${x.featured}"><b>${n}</b><span>${x.team} · ${H.SHORT[x.fam]} ${x.featured}+</span></div><div class="kp" data-go="contract:${x.id}|${x.featured}"><b class="num">${S.noQuote ? '—' : H.asks(x) + '¢'}</b><span>Rec ${x.featured}+</span></div></div>`; }).join('')}</div>` : (ps.length ? `<div class="card sec" ${st('wire', 'WIRE')}><div class="sh2"><span class="h2">Players to research</span><span class="note">most props today</span></div>${keyPlayers(g).map((x) => `<div class="km"><span class="av3" data-go="player:${x.name}|${x.fam}|${x.featured}">${H.av(x, 30, false)}</span><div class="kt" data-go="player:${x.name}|${x.fam}|${x.featured}"><b>${x.name}</b><span>${x.team} · ${H.SHORT[x.fam]} ${x.featured}+</span></div><div class="kp" data-go="contract:${x.id}|${x.featured}"><b class="num">${S.noQuote ? '—' : H.asks(x) + '¢'}</b><span>${H.ABBR[x.fam]} ${x.featured}+</span></div></div>`).join('')}</div>` : '');
    const teams = `<div class="card sec" ${st('ok', 'BUILT')}><div class="sh2"><span class="h2">Teams</span></div>${[g.away, g.home].map((t) => `<div class="km" data-go="team:${t}"><span class="av3">${E.lgx(g.sport, t, 30)}</span><div class="kt"><b>${((window.WD.TN[g.sport.toLowerCase()] || {})[t]) || t}</b><span>${TD[t] ? 'Team Research · ' + (TD[t].record3 ? TD[t].record3.join('–') : TD[t].record[0] + '–' + TD[t].record[1]) : 'Team Research'}</span></div>${I('chevR', 16, '#7593a8')}</div>`).join('')}</div>`;
    const propsBtn = ps.length ? `<div class="card prow" style="margin:10px 16px 0" data-go="props:game=${g.key}"><div><b>Props in this game</b><span>${ps.length} props across ${new Set(ps.map((p) => p.name)).size} players</span></div><span class="seeall">Open ${I('chevR', 14)}</span></div>` : '';
    return `<div class="pad" style="margin-top:10px">${fin ? `<div class="standin"><span class="demo-chip">STAND-IN</span> Completed games show the score and both teams here. The box score is the existing v3 tab.</div>` : ''}${lines}${tilt}${km}${teams}</div>${propsBtn}`;
  }
  function propsTab(g) { const ps = g.key ? PR.filter((p) => p.game === g.key && !H.out(p)).sort((a, b) => H.hitsOf(b) - H.hitsOf(a)).slice(0, 8) : []; return `<div class="plist" style="padding-top:8px">${ps.map((p) => H.rowP(p, { k: p.featured })).join('')}${g.key ? `<div class="showall" data-go="props:game=${g.key}">All props in this game ${I('chevR', 14)}</div>` : '<div class="unk">No props are listed for this game.</div>'}</div>`; }

  E.defaults.game = () => ({ tab: 'Overview', dir: 'phi', lens: false, sheet: null });
  E.screens.game = (p, ui) => {
    const g = resolve(p), nfl = g.key === '26OCT26DALPHI';
    const TABS = nfl ? ['Overview', 'Game Script', 'Matchup', 'Props', 'Stats'] : ['Overview', 'Props'];
    if (nfl) { Q = new URLSearchParams({ dir: ui.dir === 'dal' ? 'dal' : '', lens: ui.lens ? 'open' : '' }); }
    const head = nfl ? headerHtml() : gHeader(g);
    const tabs = nfl ? gtabs(ui.tab) : gtabsFor(TABS, ui.tab);
    let body = '';
    if (ui.tab === 'Overview') body = overview(g, ui);
    else if (ui.tab === 'Props') body = propsTab(g);
    else if (ui.tab === 'Matchup' && nfl) body = innerPad(matchupMain()) + innerPad(matchupLower());
    else body = standin(ui.tab);
    if (nfl) body = body.replace(/^<div class="pad" style="margin-top:10px">/, '<div class="pad" style="margin-top:10px">');
    return { html: `<div class="scr">${head}${tabs}${body}</div>${chrome('Games')}`, sheet: H.sheetFor(ui) };
  };
  E.screens.unit = (p, ui) => { Q = new URLSearchParams({}); return { html: matchupExpanded(p.uid), sheet: H.sheetFor(ui) }; };
  E.defaults.unit = () => ({ sheet: null });

  /* ---------- the game list, Home, Saved */
  E.defaults.games = () => ({});
  E.screens.games = () => ({ html: `<div class="scr"><div class="pdh"><div class="tt"><h1>Games</h1></div><div class="sub">Mon Oct 26 · ${Object.keys(GAMES).length} games with props</div></div>${standin('Games', 'is the existing v3 list. Here it is a stand-in listing the five games that have props today.')}
    ${Object.entries(GAMES).sort((a, b) => a[1][4].localeCompare(b[1][4])).map(([k, [sp, a, h, when]]) => `<div class="card gl" data-go="game:${k}" ${st('ok', 'BUILT')}>${E.lgx(sp, a, 34)}<div class="c"><b>${a} at ${h}</b><span>${sp} · ${when.replace(/^\w+ /, '')} · ${PR.filter((p) => p.game === k).length} props</span></div>${E.lgx(sp, h, 34)}</div>`).join('')}</div>${chrome('Games')}` });
  E.defaults.home = () => ({});
  E.screens.home = () => ({ html: `<div class="scr"><div class="pdh"><div class="tt"><h1>Home</h1></div></div>${standin('Home', 'is the existing v3 screen and is not part of this walkthrough.')}
    <div class="card gl" data-go="game:26OCT26DALPHI">${E.lgx('NFL', 'DAL', 34)}<div class="c"><b>Dallas at Philadelphia</b><span>Tonight · 8:15 PM</span></div>${E.lgx('NFL', 'PHI', 34)}</div>
    <div class="card prow" style="margin:10px 16px 0" data-act="nav:Explore"><div><b>Props</b><span>${PR.length} props across ${Object.keys(GAMES).length} games</span></div><span class="seeall">Open ${I('chevR', 14)}</span></div></div>${chrome('Home')}` });
  E.defaults.saved = () => ({});
  E.screens.saved = () => {
    const item = (s) => { const d = (E.describe[s.name] || (() => ({ title: s.name, chips: [] })))(s.p, s.ui); return `<div class="card savedc" ${st('wire', 'WIRE')}><div style="display:flex;justify-content:space-between;gap:10px"><b data-act="opensaved:${s.id}">${d.title}</b><span data-act="rmsaved:${s.id}" style="color:var(--dim);cursor:pointer">${I('x', 16)}</span></div><div class="chs" data-act="opensaved:${s.id}">${d.chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div><small data-act="opensaved:${s.id}">${s.seeded ? 'Sample saved item' : 'Saved in this walkthrough'} · opens exactly as saved</small></div>`; };
    return { html: `<div class="scr"><div class="pdh"><div class="tt"><h1>Saved research</h1></div><div class="sub">Each item restores the player, statistic, line, window and filters you saved</div></div>${S.saved.map(item).join('') || '<div class="unk"><b>Nothing saved yet</b>Tap the bookmark on a player, team or statistic.</div>'}</div>${chrome('Following')}` };
  };
  const A = E.acts;
  A.gtab = (t) => { const c = E.cur(); if (c.name === 'unit') { E.back(); if (t !== 'Matchup') E.set({ tab: t }); return; } E.set({ tab: t }); };
  A.dir = (d) => E.set({ dir: d }); A.lens = () => { const c = E.cur(); E.set({ lens: !c.ui.lens }); };
  A.unit = (id) => E.go('unit', { uid: id });
  A.opensaved = (id) => E.openSaved(id); A.rmsaved = (id) => E.removeSaved(id);
  E.describe.game = (p, ui) => { const g = resolve(p); return { title: `${g.away} at ${g.home}`, chips: [ui.tab] }; };
  E.describe.unit = (p) => ({ title: 'Matchup unit · ' + p.uid, chips: [] });
  E.resolveGame = resolve;
})();
