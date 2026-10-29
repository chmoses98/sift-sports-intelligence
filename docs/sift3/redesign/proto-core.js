/* Walkthrough core: one router with a state stack. Every screen is a function of (params, ui); Back pops the stack and restores the
   exact ui object (tabs, filters, expanded row, comparison selection, window, line) and the scroll position of the entry below.
   This is demo navigation orchestration around the approved screens; the data is real published data. */
(function () {
  const E = (window.PE = { screens: {}, defaults: {}, acts: {}, describe: {}, S: { stack: [], saved: [], noQuote: false, status: false, jid: null, jstep: 0 }, afterRender: [] });
  const S = E.S, phone = () => document.getElementById('phone');
  E.cur = () => S.stack[S.stack.length - 1];
  E.lgx = (sport, t, s = 24) => `<img class="lg" src="assets/teams/${sport === 'NFL' || sport === 'nfl' ? '' : sport.toLowerCase() + '/'}${t}.webp" width="${s}" height="${s}" alt="${t}">`;
  E.sportOf = (t) => (TD[t] ? TD[t].sport : ['DAL', 'PHI', 'KC', 'SEA'].includes(t) ? 'NFL' : 'NHL');
  const NFLT = new Set(Object.keys(window.WD ? Object.fromEntries(WD.RK['nfl|adj_off_epa|ADJ_RIDGE'].e.map((e) => [e[0], 1])) : {}));
  E.isNFL = (t) => NFLT.has(t);

  const scrollEl = () => { const p = phone(); return p && p.querySelector('.scr'); };
  const saveScroll = () => { const c = E.cur(), s = scrollEl(); if (c && s) c.scroll = s.scrollTop; };

  E.toast = (msg) => { const p = phone(); const old = p.querySelector('.toast'); if (old) old.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; p.appendChild(t); setTimeout(() => t.remove(), 2600); };

  E.render = (restore) => {
    const c = E.cur(), p = phone(), fn = E.screens[c.name];
    const out = fn ? fn(c.p, c.ui, c) : { html: `<div class="scr"><div class="unk"><b>${c.name}</b>This screen is not in the walkthrough.</div></div>${chrome('Explore')}` };
    const keep = restore === 'keep' && scrollEl() ? scrollEl().scrollTop : null;
    p.className = 'phone thB' + (S.status ? ' annot' : '');
    p.innerHTML = out.html + (c.ui.sheet && out.sheet ? `<div class="scrim" data-act="sheet:close"></div>${out.sheet}` : '');
    // universal Back affordance: every back arrow in the locked designs goes back
    p.querySelectorAll('.ib').forEach((el) => { if (/M15 5l-7 7 7 7/.test(el.innerHTML) && !el.dataset.act) el.dataset.act = 'back'; });
    const sc = scrollEl();
    if (sc) sc.scrollTop = keep != null ? keep : restore ? c.scroll || 0 : 0;
    if (out.after) out.after(p);
    E.afterRender.forEach((f) => f(c));
    fit();
  };
  E.go = (name, params = {}, ui = null) => {
    S.last = 'go'; saveScroll(); const c = E.cur(); if (c && c.ui.sheet) c.ui = { ...c.ui, sheet: null };
    S.stack.push({ name, p: params, ui: { ...(E.defaults[name] ? E.defaults[name](params) : {}), ...(ui || {}) }, scroll: 0 });
    E.render(false);
  };
  E.replace = (name, params = {}, ui = null) => { const c = E.cur(); c.name = name; c.p = params; c.ui = { ...(E.defaults[name] ? E.defaults[name](params) : {}), ...(ui || {}) }; c.scroll = 0; E.render(false); };
  E.root = (name, params = {}, ui = null) => { S.stack = []; E.go(name, params, ui); };
  E.back = () => {
    const c = E.cur();
    if (c.ui.sheet) { c.ui = { ...c.ui, sheet: null }; return E.render('keep'); }
    if (S.stack.length < 2) return E.toast('This is where the walkthrough starts');
    S.last = 'back'; S.stack.pop(); E.render(true);
  };
  E.set = (patch, keep = true) => { const c = E.cur(); c.ui = { ...c.ui, ...patch }; E.render(keep ? 'keep' : false); };

  E.goStr = (str) => {
    const i = str.indexOf(':'), kind = str.slice(0, i), parts = str.slice(i + 1).split('|');
    if (kind === 'team') return E.go('team', { t: parts[0] });
    if (kind === 'player') return E.go('player', { name: parts[0], stat: parts[1] || null, k: parts[2] ? +parts[2] : null });
    if (kind === 'stat') return E.go('stat', { sp: parts[0], id: parts[1], win: parts[2] || null, sel: parts[3] || null, opp: parts[4] || null });
    if (kind === 'game') return E.go('game', { key: parts[0] });
    if (kind === 'fgame') return E.go('game', { fin: { team: parts[0], ev: parts[1] } });
    if (kind === 'ugame') return E.go('game', { up: { team: parts[0], ev: parts[1] } });
    if (kind === 'props') { const q = Object.fromEntries(new URLSearchParams(parts[0])); return E.go('pdlist', {}, { sport: q.sport || 'All', fam: q.fam || null, team: q.team || null, player: q.player || null, game: q.game || null, preset: q.preset || null }); }
    if (kind === 'contract') return E.set({ sheet: { t: 'contract', id: parts[0], k: parts[1] ? +parts[1] : null } });
    console.warn('unknown go', str);
  };
  E.act = (str, el) => {
    const i = str.indexOf(':'), name = i < 0 ? str : str.slice(0, i), arg = i < 0 ? '' : str.slice(i + 1);
    if (name === 'back') return E.back();
    if (name === 'nav') return E.nav(arg);
    if (name === 'sheet') return arg === 'close' ? E.back() : E.set({ sheet: { t: arg } });
    if (name === 'save') return E.saveCurrent();
    const f = E.acts[name]; if (f) return f(arg, el);
    console.warn('unknown act', str);
  };
  E.nav = (t) => { if (t === 'Home') return E.root('home'); if (t === 'Games') return E.root('games'); if (t === 'Explore') return E.root('pdhome'); if (t === 'Following') return E.root('saved'); };

  /* ---------- saved research: the exact state, minus the scroll offset */
  const KEY = 'sift3.walk.saved';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S.saved)); } catch (e) { /* storage may be unavailable */ } };
  E.seedSaved = () => [
    { id: 's1', name: 'player', p: { name: 'CeeDee Lamb', stat: 'rec', k: 6 }, ui: { tab: 'Overview', win: 'L10', site: 'away', result: 'any', k: 6, sel: null, sheet: null }, seeded: true },
    { id: 's2', name: 'stat', p: { sp: 'nfl', id: 'adj_def_db_epa', win: 'ADJ_RIDGE', sel: 'PHI', opp: 'DAL' }, ui: { tab: 'Ranking', win: 'ADJ_RIDGE', sel: 'PHI', opp: 'DAL', all: false, obs: null, cmpm: 'teams', cmpA: 'PHI', cmpB: 'DAL', aboutOpen: false, sheet: null }, seeded: true },
    { id: 's3', name: 'pdlist', p: {}, ui: { sport: 'NHL', fam: 'goals', sort: 'hist', q: '', hideOut: true, exp: null, rungs: {}, cmpMode: false, cmp: [], team: null, player: null, preset: null, range: 'any', histMin: 6, oppRank: 'any', modelOnly: false, more: 1, sheet: null }, seeded: true },
  ];
  E.saveCurrent = () => {
    const c = E.cur(), d = E.describe[c.name]; if (!d) return E.toast('Nothing to save on this screen');
    const ui = { ...c.ui, sheet: null };
    const sig = JSON.stringify([c.name, c.p, ui]);
    if (S.saved.some((s) => JSON.stringify([s.name, s.p, s.ui]) === sig)) return E.toast('Already in Saved research');
    S.saved.unshift({ id: 's' + Date.now(), name: c.name, p: JSON.parse(JSON.stringify(c.p)), ui: JSON.parse(JSON.stringify(ui)) });
    persist(); E.toast('Saved with its exact state: ' + d(c.p, c.ui).title);
  };
  E.removeSaved = (id) => { S.saved = S.saved.filter((s) => s.id !== id); persist(); E.render('keep'); };
  E.openSaved = (id) => { const s = S.saved.find((x) => x.id === id); if (!s) return; saveScroll(); const c = E.cur(); if (c.ui.sheet) c.ui = { ...c.ui, sheet: null }; S.stack.push({ name: s.name, p: JSON.parse(JSON.stringify(s.p)), ui: { ...(E.defaults[s.name] ? E.defaults[s.name](s.p) : {}), ...JSON.parse(JSON.stringify(s.ui)) }, scroll: 0 }); E.render(false); };
  S.saved = load() || E.seedSaved();

  /* ---------- scaling: the phone is drawn at 390 x 844 CSS pixels and scaled to fit the page */
  function fit() {
    const stage = document.getElementById('stage'), p = phone(); if (!stage || !p) return;
    const top = stage.getBoundingClientRect().top + window.scrollY, availH = window.innerHeight - Math.min(top, 220) - 14, availW = document.body.clientWidth - 24;
    const s = Math.max(0.5, Math.min(1.15, availW / 390, availH / 844));
    p.style.transform = `scale(${s})`; stage.style.width = 390 * s + 'px'; stage.style.height = 844 * s + 'px';
  }
  window.addEventListener('resize', fit);
  E.fit = fit;

  E.init = () => {
    const p = phone();
    p.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-go],[data-act]'); if (!el || !p.contains(el)) return;
      ev.preventDefault(); ev.stopPropagation();
      if (el.dataset.go) E.goStr(el.dataset.go); else E.act(el.dataset.act, el);
    });
    p.addEventListener('input', (ev) => { const t = ev.target; if (t.dataset && t.dataset.input && E.onInput) E.onInput(t.dataset.input, t.value); });
    document.getElementById('bS').addEventListener('click', (e) => { S.status = !S.status; e.target.setAttribute('aria-pressed', S.status); E.render('keep'); });
    document.getElementById('bQ').addEventListener('click', (e) => { S.noQuote = !S.noQuote; e.target.setAttribute('aria-pressed', S.noQuote); E.render('keep'); E.toast(S.noQuote ? 'Demo: no reliable quote can be obtained' : 'Demo: quotes available'); });
    document.getElementById('bR').addEventListener('click', () => { S.saved = E.seedSaved(); persist(); E.endJourney(); E.root('pdhome'); });
  };
})();
