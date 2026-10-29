/* Prop Discovery in the walkthrough: home, the full list (search, sort, filters, expanded prop, comparison selection), comparison,
   and the exact-contract sheet. Rows and numbers are the real contracts captured 2026-10-26 (props.js). */
(function () {
  const E = window.PE, PD = window.PD, PR = PD.props, GAMES = PD.games, S = E.S;
  const nk = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const PHOTO = { ceedeelamb: 'dal-ceedee-lamb', dakprescott: 'dal-dak-prescott', jalenhurts: 'phi-jalen-hurts', javontewilliams: 'dal-javonte-williams' };
  const SHORT = { rec: 'Receptions', recyds: 'Receiving yds', rshyds: 'Rushing yds', passyds: 'Passing yds', td: 'Touchdowns', goals: 'Goals', points: 'Points', assists: 'Assists', hits: 'Hits', tb: 'Total bases', hrr: 'H+R+RBI', rbi: 'RBIs', ks: 'Strikeouts', sb: 'Stolen bases' };
  const ABBR = { rec: 'REC', recyds: 'REC YDS', rshyds: 'RUSH YDS', passyds: 'PASS YDS', td: 'TD', goals: 'GOALS', points: 'PTS', assists: 'AST', hits: 'HITS', tb: 'TB', hrr: 'H+R+RBI', rbi: 'RBI', ks: 'K', sb: 'SB' };
  const byId = Object.fromEntries(PR.map((p) => [p.id, p]));
  const rung = (p, k) => p.ladder.find((r) => r.k === (k == null ? p.featured : k)) || p.ladder[0];
  const hist = (p, k) => (p.hist ? { n: p.hist.vals.length, h: p.hist.vals.filter((v) => v >= (k == null ? p.featured : k)).length, vals: p.hist.vals } : null);
  const mdl = (p, k) => (p.model.status === 'published' && p.model.thresholds[String(k == null ? p.featured : k)] != null ? Math.round(p.model.thresholds[String(k == null ? p.featured : k)] * 100) : null);
  const lgp = (p, s = 28) => E.lgx(p.sport, p.team, s);
  const gm = (p) => { const [, a, h] = GAMES[p.game]; return `${a} at ${h}`; };
  const asks = (p) => rung(p).ask;
  const hitsOf = (p) => { const h = hist(p); return h ? h.h / h.n : -1; };
  const out = (p) => p.avail === 'OUT' || p.avail === 'DOUBTFUL';
  const vol = (p) => parseFloat(rung(p).vol) || 0;
  const statGo = (p) => (p.sport === 'NFL' && p.matchup ? `stat:nfl|${{ 'Pass defense': 'adj_def_db_epa', 'Run defense': 'adj_def_rush_epa', 'Defense overall': 'adj_def_epa' }[p.matchup.unit]}|ADJ_RIDGE|${p.opp}|${p.team}` : p.sport === 'NHL' && p.matchup ? `stat:nhl|ga_per_game|2026-27|${p.opp}|${p.team}` : null);
  const E_ = { SHORT, ABBR, rung, hist, mdl, gm, byId, nk, hitsOf, asks, out, statGo };
  E.PDH = E_;

  const av = (p, s = 40, go = true) => `<span class="av4" style="--s:${s}px" ${go ? `data-go="player:${p.name}|${p.fam}|${p.featured}"` : ''}>${PHOTO[nk(p.name)] ? `<img src="assets/players/${PHOTO[nk(p.name)]}.webp" alt="">` : lgp(p, Math.round(s * 0.68))}</span>`;
  const muChip = (p) => { const g = statGo(p); const t = p.matchup ? `${p.opp} ${p.sport === 'NFL' ? p.matchup.unit.toLowerCase().replace('defense overall', 'defense').replace('pass defense', 'pass D').replace('run defense', 'run D') : 'goals against'} · ${ord(p.matchup.rank)} of ${p.matchup.n}` : 'no matchup rows'; return p.matchup ? `<em class="chipD" ${g ? `data-go="${g}"` : ''}>${t}</em>` : `<em class="chipD none">${t}</em>`; };
  const lanes = (p, k) => { const r = rung(p, k), h = hist(p, k), m = mdl(p, k); return `<div class="ln3" data-act="exp:${p.id}"><span class="m"><i class="sw"></i>${r.ask}%</span><span class="h"><i class="sw h"></i>${h ? `${h.h}/${h.n}` : '<u>—</u>'}</span><span class="z ${m == null ? 'off' : ''}"><i class="sw z"></i>${m != null ? m + '%' : '<u>—</u>'}</span></div>`; };
  const lanesL = (p) => { const r = rung(p), h = hist(p), m = mdl(p); return `<div class="lanesL" data-act="openprop:${p.id}"><div class="m"><span class="t"><i class="sw"></i>Market</span><b class="num">${r.ask}%</b></div><div class="h ${h ? '' : 'off'}"><span class="t"><i class="sw h"></i>History</span><b class="num">${h ? `${h.h}/${h.n}` : '—'}</b></div><div class="z ${m == null ? 'off' : ''}"><span class="t"><i class="sw z"></i>SIFT model</span><b class="num">${m != null ? m + '%' : '—'}</b></div></div>`; };
  const price = (p, k) => { const r = rung(p, k); return S.noQuote ? `<span class="px nop" data-go="contract:${p.id}|${r.k}"><b class="num">—</b><small>ask</small></span>` : `<span class="px" data-go="contract:${p.id}|${r.k}"><b class="num">${r.ask}¢</b><small>ask</small></span>`; };
  E_.av = av; E_.muChip = muChip; E_.price = price;

  /* ---------- rows and cards */
  function rowP(p, o = {}) {
    const k = o.k == null ? p.featured : o.k, cm = o.cmpMode, on = (o.cmp || []).includes(p.id);
    const head = cm ? `<span data-act="cmp:${p.id}" style="position:relative;display:block">${av(p, 40, false)}<i class="cmpbox ${on ? 'on' : ''}" style="position:absolute;right:-5px;bottom:-5px">${on ? '<b style="color:#04202c;font:700 13px var(--f-ui)">✓</b>' : ''}</i></span>` : av(p);
    return `<div class="pr2 ${o.open ? 'is-open' : ''}" ${o.first ? st('ok', 'BUILT') : ''}>${head}<div class="pb"><div class="pn"><b ${cm ? '' : `data-go="player:${p.name}|${p.fam}|${k}"`} data-act="${cm ? 'cmp:' + p.id : 'exp:' + p.id}" style="display:block">${p.name}</b><span data-go="game:${p.game}">${gm(p)} · ${p.when.replace('Mon ', '')}</span></div>
      <div class="ps" data-act="exp:${p.id}">${SHORT[p.fam]} <b>${k}+</b>${muChip(p)}</div>${lanes(p, k)}</div>${price(p, k)}</div>`;
  }
  const bars = (vals, k, w = 322, h = 92) => {
    const mx = Math.max(...vals, k) + 0.6, pw = w - 8, sw = pw / vals.length, bw = Math.min(22, sw - 8), y = (v) => h - 16 - (v / mx) * (h - 26), id = 'pb' + (Math.abs((k + vals.join('')).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 9973);
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.go0}"/><stop offset="1" stop-color="${TH.go1}"/></linearGradient><linearGradient id="${id}u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.gu0}"/><stop offset="1" stop-color="${TH.gu1}"/></linearGradient></defs>`;
    vals.forEach((v, i) => { const x = 4 + sw * i + sw / 2, hit = v >= k; s += `<rect x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" rx="3.5" fill="url(#${id}${hit ? 'o' : 'u'})"/><text x="${x}" y="${y(v) - 3}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${hit ? TH.hit : TH.miss}">${v}</text>`; });
    s += `<line x1="4" x2="${w - 4}" y1="${y(k - 0.5)}" y2="${y(k - 0.5)}" stroke="#fff" stroke-width="1.3" stroke-dasharray="5 4"/><text x="4" y="${h - 3}" font-size="9.5" fill="${TH.axis}">oldest</text><text x="${w - 4}" y="${h - 3}" text-anchor="end" font-size="9.5" fill="${TH.axis}">latest</text></svg>`;
    return s;
  };
  const track = (rank, n, team, sport) => `<div class="utrk"><div class="rail"></div><i class="tick"></i><span class="mkr d" style="left:${100 * (n - rank) / (n - 1)}%">${E.lgx(sport, team, 15)}</span><div class="ends"><span>Worst</span><span>Best</span></div></div>`;
  E_.bars = bars;
  function peekP(p, k) {
    const r = rung(p, k), h = hist(p, k), m = mdl(p, k), wd = p.model.status !== 'published', mm = p.matchup, g = statGo(p);
    return `<div class="card peek" ${st('wire', 'WIRE')}>
      ${h ? `<div class="pk1"><div class="pkh"><b>Last ${h.n} games · ${SHORT[p.fam].toLowerCase()}</b><span>${h.h} of ${h.n} cleared ${k}+</span></div>${bars(h.vals, k)}</div>` : `<div class="whyno">${I('lock', 13)}<span>No game log is published for this player in this sport yet.</span></div>`}
      <div class="trio mini"><div data-go="contract:${p.id}|${k}"><span class="t m"><span class="sw"></span>Market</span><span class="n m">${r.ask}%</span><span class="s">${r.ask}¢ ask · pre-fee</span></div>
        <div data-go="player:${p.name}|${p.fam}|${k}"><span class="t h"><span class="sw h"></span>History</span><span class="n h">${h ? Math.round(100 * h.h / h.n) + '%' : '—'}</span><span class="s">${h ? `${h.h} of ${h.n} · observed` : 'not published'}</span></div>
        <div><span class="t z"><span class="sw z"></span>SIFT model</span><span class="n z ${wd || m == null ? 'off' : ''}">${m != null ? m + '%' : '—'}</span><span class="s">${wd ? 'not approved yet' : m != null ? `P(${k}+) published` : 'not published at this rung'}</span></div></div>
      ${wd && p.model.reason ? `<div class="whyno">${I('lock', 13)}<span>${p.model.reason}. Shown as “—”, never estimated.</span></div>` : ''}
      <div class="rsteps"><span class="eyebrow">Rungs</span>${p.ladder.slice(0, 5).map((x) => `<span class="rs ${x.k === k ? 'on' : ''}" data-act="rung:${p.id}|${x.k}"><b>${x.k}+</b><small>${S.noQuote ? '—' : x.ask + '¢'}</small></span>`).join('')}</div>
      ${mm ? `<div class="umu" ${g ? `data-go="${g}"` : ''}><div class="slh"><span>${E.lgx(p.sport, p.opp, 16)} ${p.opp} ${p.sport === 'NFL' ? mm.unit.toLowerCase() : 'goals against'}</span><b>${ord(mm.rank)} of ${mm.n}${mm.value ? ` · ${mm.value.toFixed(1)}/game` : ''}</b></div>${track(mm.rank, mm.n, p.opp, p.sport)}</div>` : ''}
      <div class="acts"><span class="btn pri" data-go="player:${p.name}|${p.fam}|${k}">Research ${p.name.split(' ')[0]}</span><span class="btn" data-go="contract:${p.id}|${k}">Contract${S.noQuote ? '' : ' · ' + r.ask + '¢'}</span><span class="btn sq" data-act="saveprop:${p.id}|${k}">${I('bm', 18)}</span></div></div>`;
  }
  function cardP(p) {
    return `<article class="pc"><div class="pct">${av(p, 38)}<div class="pn"><b data-go="player:${p.name}|${p.fam}|${p.featured}">${p.name}</b><span data-go="game:${p.game}">${gm(p)} · ${p.when.replace('Mon ', '')}</span></div>${price(p)}</div>
    <div class="pcs" data-act="openprop:${p.id}">${SHORT[p.fam]} <b>${p.featured}+</b></div>${lanesL(p)}<div class="pcm">${muChip(p)}</div></article>`;
  }
  const famCounts = Object.entries(PR.reduce((a, p) => { a[p.fam] = (a[p.fam] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const count = (f) => PR.filter(f).length;
  const sports = [['All', PR.length], ['NFL', count((p) => p.sport === 'NFL')], ['NHL', count((p) => p.sport === 'NHL')], ['MLB', count((p) => p.sport === 'MLB')]];
  E_.famCounts = famCounts;

  /* ---------- Prop Discovery home */
  E.defaults.pdhome = () => ({});
  E.screens.pdhome = () => {
    const published = PR.filter((p) => p.model.status === 'published').sort((a, b) => Math.abs(asks(a) - 50) - Math.abs(asks(b) - 50)).slice(0, 3);
    const bottom = PR.filter((p) => p.matchup && p.matchup.rank >= p.matchup.n - 2 && asks(p) >= 35 && asks(p) <= 65 && hist(p) && !p.avail).sort((a, b) => b.matchup.rank / b.matchup.n - a.matchup.rank / a.matchup.n || Math.abs(asks(a) - 50) - Math.abs(asks(b) - 50)).slice(0, 4);
    const nB = count((p) => p.matchup && p.matchup.rank >= p.matchup.n - 2);
    const shelf = (title, sub, items, preset) => `<section class="shelf"><div class="sh3"><div><b>${title}</b><small>${sub}</small></div><span class="seeall" data-go="props:preset=${preset}">See all ${I('chevR', 14)}</span></div><div class="hs">${items.map(cardP).join('')}</div></section>`;
    return { html: `<div class="scr"><div class="pdh"><div class="tt"><h1>Props</h1><span class="tr"><span class="ib" data-act="openfilter">${I('sliders', 22)}</span></span></div><div class="sub">Mon Oct 26 · ${Object.keys(GAMES).length} games · ${PR.length} props · ${PR.reduce((a, p) => a + p.ladder.length, 0)} contracts</div></div>
      <label class="sfield" data-act="pdsearch">${I('search', 20, '#8b95a1')}<span>Search player, stat or team</span></label>
      <div class="prail" ${st('wire', 'WIRE')}>${sports.map(([n, c]) => `<span class="${n === 'All' ? 'on' : ''}" data-act="${n === 'All' ? 'pdsearch' : 'sportgo:' + n}">${n}<b>${c}</b></span>`).join('')}</div>
      <div class="schips" ${st('wire', 'WIRE')}>${famCounts.map(([f, c]) => `<span class="chip" data-act="famgo:${f}">${SHORT[f]}<b>${c}</b></span>`).join('')}</div>
      <div ${st('wire', 'WIRE')}>${shelf('SIFT model published', `${count((p) => p.model.status === 'published')} of ${PR.length} props today · NFL receptions`, published, 'model')}</div>
      <div ${st('wire', 'WIRE')}>${shelf('Facing a bottom-3 defense', `${nB} props · near-even prices first`, bottom, 'bottom3')}</div></div>${chrome('Explore')}`, sheet: sheetFor(E.cur().ui) };
  };

  /* ---------- the list */
  E.defaults.pdlist = () => ({ sport: 'All', fam: null, sort: 'hist', q: '', hideOut: true, exp: null, pin: null, rungs: {}, cmpMode: false, cmp: [], team: null, player: null, game: null, preset: null, range: 'any', histMin: 0, oppRank: 'any', modelOnly: false, more: 1, sheet: null });
  function filterProps(ui) {
    const q = (ui.q || '').toLowerCase().trim();
    let a = PR.filter((p) => {
      if (ui.hideOut && out(p)) return false;
      if (ui.sport !== 'All' && p.sport !== ui.sport) return false;
      if (ui.fam && p.fam !== ui.fam) return false;
      if (ui.team && p.team !== ui.team) return false;
      if (ui.game && p.game !== ui.game) return false;
      if (ui.player && p.name !== ui.player) return false;
      if (q && !(`${p.name} ${SHORT[p.fam]} ${p.label} ${p.team} ${p.opp} ${p.sport}`).toLowerCase().includes(q)) return false;
      if (ui.preset === 'model' && p.model.status !== 'published') return false;
      if (ui.preset === 'bottom3' && !(p.matchup && p.matchup.rank >= p.matchup.n - 2 && asks(p) >= 35 && asks(p) <= 65 && hist(p) && !p.avail)) return false;
      if (ui.modelOnly && p.model.status !== 'published') return false;
      const ak = asks(p); if (ui.range === '35-65' && (ak < 35 || ak > 65)) return false; if (ui.range === '45-55' && (ak < 45 || ak > 55)) return false; if (ui.range === '55-75' && (ak < 55 || ak > 75)) return false;
      if (ui.histMin) { const h = hist(p); if (!h || h.h < ui.histMin) return false; }
      if (ui.oppRank === 'bottom10' && !(p.matchup && p.matchup.rank > p.matchup.n - 10)) return false;
      if (ui.oppRank === 'top10' && !(p.matchup && p.matchup.rank <= 10)) return false;
      return true;
    });
    const d50 = (p) => Math.abs(asks(p) - 50);
    const cmp = { hist: (x, y) => hitsOf(y) - hitsOf(x) || d50(x) - d50(y), price: (x, y) => asks(x) - asks(y), soon: (x, y) => x.start.localeCompare(y.start) || d50(x) - d50(y), model: (x, y) => (mdl(y) ?? -1) - (mdl(x) ?? -1) || d50(x) - d50(y), match: (x, y) => (y.matchup ? y.matchup.rank / y.matchup.n : -1) - (x.matchup ? x.matchup.rank / x.matchup.n : -1) || d50(x) - d50(y), vol: (x, y) => vol(y) - vol(x) }[ui.sort] || ((x, y) => d50(x) - d50(y));
    a.sort(cmp);
    if (ui.pin) { const i = a.findIndex((p) => p.id === ui.pin); if (i > 0) a.unshift(a.splice(i, 1)[0]); else if (i < 0 && byId[ui.pin]) a.unshift(byId[ui.pin]); }
    return a;
  }
  const nFilters = (ui) => [ui.range !== 'any', ui.histMin > 0, ui.oppRank !== 'any', ui.modelOnly, ui.preset].filter(Boolean).length;
  const SORTL = { hist: 'History', price: 'Price', soon: 'Soonest', model: 'SIFT model', match: 'Matchup', vol: 'Volume' };
  function rowsHtml(ui, all) {
    return all.slice(0, 12 * ui.more).map((p, i) => { const open = ui.exp === p.id, k = ui.rungs[p.id] == null ? p.featured : ui.rungs[p.id]; return rowP(p, { open, k, cmpMode: ui.cmpMode, cmp: ui.cmp, first: i === 0 }) + (open ? peekP(p, k) : ''); }).join('') + (all.length > 12 * ui.more ? `<div class="showall" data-act="more">Show 12 more of ${all.length - 12 * ui.more} ${I('chevR', 14)}</div>` : '') + (!all.length ? `<div class="unk"><b>No props match</b>Loosen a filter. The universe today is ${PR.length} props.</div>` : '');
  }
  E.screens.pdlist = (p, ui) => {
    const all = filterProps(ui), hiddenOut = count(out);
    const title = ui.player ? ui.player : ui.game ? `${GAMES[ui.game][1]} at ${GAMES[ui.game][2]} props` : ui.team ? `${ui.team} props` : 'All props';
    const act = [ui.hideOut ? ['hideOut', `Hide out · ${hiddenOut} hidden`] : null, ui.sport !== 'All' ? ['sport', ui.sport] : null, ui.fam ? ['fam', SHORT[ui.fam]] : null, ui.team ? ['team', ui.team] : null, ui.game ? ['game', GAMES[ui.game][1] + ' at ' + GAMES[ui.game][2]] : null, ui.player ? ['player', ui.player] : null, ui.preset ? ['preset', ui.preset === 'model' ? 'SIFT model published' : 'Bottom-3 defense'] : null, ui.q ? ['q', `“${ui.q}”`] : null].filter(Boolean);
    const sel = ui.cmp.map((id) => byId[id]).filter(Boolean);
    return { html: `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>${title}</h1><span class="cnt">${all.length}</span></div></div>
      <label class="pdsearch">${I('search', 18, '#8b95a1')}<input data-input="q" value="${(ui.q || '').replace(/"/g, '&quot;')}" placeholder="Search player, stat or team" autocomplete="off"></label>
      <div class="ctrl" ${st('wire', 'WIRE')}><span class="chip sort" data-act="sheet:filter">${I('sliders', 13)}Sort: ${SORTL[ui.sort]}<b>▾</b></span><span class="chip" data-act="sheet:filter">Filters${nFilters(ui) ? `<b class="bd">${nFilters(ui)}</b>` : ''}</span><span class="chip ${ui.cmpMode ? 'cy' : ''}" data-act="cmpmode">Compare${ui.cmp.length ? ` · ${ui.cmp.length}` : ''}</span></div>
      <div class="actv" style="flex-wrap:wrap">${act.map(([k, t]) => `<span class="chip cy" data-act="clear:${k}">${t} ${I('x', 11)}</span>`).join('')}</div>
      <div class="pleg"><span>Market <i class="sw"></i> pre-fee implied</span><span>History <i class="sw h"></i> last 10</span><span>SIFT model <i class="sw z"></i></span></div>
      <div class="pnote" ${st('wire', 'WIRE')}>${I('info', 13, TH.info)}<span>SIFT model shows “—” where no approved estimate exists: ${count((p) => p.model.status === 'published')} of ${PR.length} props today.</span></div>
      <div class="plist" id="plist">${rowsHtml(ui, all)}</div>
      ${sel.length ? `<div class="tray" ${st('new', 'NEW UI')}><span class="stack">${sel.map((x) => `<i>${av(x, 26, false)}</i>`).join('')}</span><span class="tt2"><b>${sel.length} selected</b><small>${sel.map((x) => `${x.name.split(' ').slice(-1)[0]} ${ABBR[x.fam]} ${x.featured}+`).join(' · ')}</small></span>${sel.length >= 2 ? `<span class="btn pri sm" data-act="cmpgo">Compare ${I('chevR', 13, '#04202c')}</span>` : `<span class="btn sm" data-act="cmpclear">Clear</span>`}</div>` : ''}</div>${chrome('Explore')}`, sheet: sheetFor(ui) };
  };
  E.onInput = (key, v) => { if (key === 'q' && E.cur().name === 'pdlist') { const c = E.cur(); c.ui = { ...c.ui, q: v, more: 1 }; const el = document.getElementById('plist'); if (el) el.innerHTML = rowsHtml(c.ui, filterProps(c.ui)); const cnt = document.querySelector('.pdh .cnt'); if (cnt) cnt.textContent = filterProps(c.ui).length; } };

  /* ---------- sheets: filter and exact contract */
  function filterSheet(ui) {
    const n = filterProps(ui), bySport = ['NFL', 'NHL', 'MLB'].map((s) => [s, n.filter((p) => p.sport === s).length]);
    const chip = (act, label, on, extra = '') => `<span class="fc2 ${on ? 'on' : ''}" data-act="${act}">${label}${extra}</span>`;
    return `<div class="sheet pd4"><div class="grab"></div><div class="shh"><span class="h2">Sort and filter</span><span class="x" data-act="reset">Reset</span></div>
      <div class="live2" ${st('wire', 'WIRE')}><div><b>${n.length} props match</b><br><small>${bySport.map(([s, c]) => `${s} ${c}`).join(' · ')}</small></div></div>
      <div class="flab">Sort by</div><div class="fchips">${Object.entries(SORTL).map(([k, l]) => chip('sort:' + k, l, ui.sort === k)).join('')}</div>
      <div class="flab">Sport</div><div class="fchips">${['All', 'NFL', 'NHL', 'MLB'].map((s) => chip('sport:' + s, s === 'All' ? 'All sports' : s, ui.sport === s)).join('')}</div>
      <div class="flab">Stat</div><div class="fchips">${chip('fam:', 'Any', !ui.fam)}${famCounts.slice(0, 7).map(([f, c]) => chip('fam:' + f, SHORT[f], ui.fam === f, `<em>${c}</em>`)).join('')}</div>
      <div class="flab">Price of the rung</div><div class="fchips">${[['any', 'Any'], ['35-65', '35¢ to 65¢'], ['45-55', '45¢ to 55¢'], ['55-75', '55¢ to 75¢']].map(([k, l]) => chip('range:' + k, l, ui.range === k)).join('')}</div>
      <div class="flab">History at that rung (last 10)</div><div class="fchips">${[[0, 'Any'], [6, '6 of 10 or better'], [8, '8 of 10 or better']].map(([k, l]) => chip('hist:' + k, l, ui.histMin === k)).join('')}</div>
      <div class="flab">Opponent unit rank</div><div class="fchips">${[['any', 'Any'], ['bottom10', 'Bottom 10'], ['top10', 'Top 10']].map(([k, l]) => chip('opp:' + k, l, ui.oppRank === k)).join('')}</div>
      <div class="tog2" data-act="toggle:modelOnly"><span>SIFT model published only<small>${count((p) => p.model.status === 'published')} props today</small></span><i class="tgl ${ui.modelOnly ? 'on' : ''}"></i></div>
      <div class="tog2" data-act="toggle:hideOut"><span>Hide out and doubtful<small>${count(out)} props hidden</small></span><i class="tgl ${ui.hideOut ? 'on' : ''}"></i></div>
      <div class="fg locked" ${st('new', 'NEW DATA')}><div class="fl">${I('lock', 13)} Needs more data</div><div class="fchips"><span class="fc2" style="opacity:.5">Price move since open</span><span class="fc2" style="opacity:.5">Teammate out</span></div></div>
      <div class="applyb" data-act="sheet:close">Show ${n.length} props</div></div>`;
  }
  function contractSheet(id, k0) {
    if (id.indexOf('g:') === 0) { const m = D.game[+id.slice(2)], ask = m.ask, bid = m.bid, fee = Math.ceil(0.07 * (ask / 100) * (1 - ask / 100) * 100), be = ask + fee;
      const head = `<div class="grab"></div><div class="shh"><span class="h2">Exact contract</span><span class="ib" data-act="sheet:close">${I('x', 20)}</span></div><div class="ctitle" ${st('ok', 'BUILT')}>${E.lgx('NFL', id === 'g:0' ? 'DAL' : 'PHI', 44)}<div><b>${m.title}</b><span><span data-go="game:26OCT26DALPHI">DAL at PHI · Mon 8:15 PM</span> · Kalshi YES</span></div></div>`;
      if (S.noQuote) return `<div class="sheet pd6">${head}<div class="tick-mono">${m.t}</div><div class="nq" ${st('new', 'DEMO STATE')}><b>Price unavailable right now</b><span>No reliable quote could be obtained. Nothing is estimated.</span><span class="btn pri" data-act="retry">Retry</span></div></div>`;
      return `<div class="sheet pd6">${head}<div class="tick-mono" ${st('ok', 'BUILT')}>${m.t}</div><div class="pgrid" style="grid-template-columns:repeat(3,1fr)" ${st('ok', 'BUILT')}><div><small>Ask</small><b class="num m">${ask}¢</b></div><div><small>Bid</small><b class="num">${bid}¢</b></div><div><small>Implied</small><b class="num m">${ask}%</b><em>pre-fee</em></div></div><div class="fee" ${st('ok', 'BUILT')}><div><span>Taker fee at ${ask}¢</span><b>${fee}¢</b></div><div><span>Fee-aware break-even</span><b>${be}¢ · ${be}%</b></div></div><div class="foot" style="margin-top:8px">Prices are Kalshi YES asks before fees. SIFT shows no bet buttons.</div><div class="acts" style="margin-top:12px"><span class="btn pri" data-go="game:26OCT26DALPHI">Game Detail</span><span class="btn" data-act="sheet:close">Back</span></div></div>`; }
    const p = byId[id]; if (!p) return '';
    const r = rung(p, k0), fee = Math.ceil(0.07 * (r.ask / 100) * (1 - r.ask / 100) * 100), be = r.ask + fee, h = (x) => hist(p, x);
    const head = `<div class="grab"></div><div class="shh"><span class="h2">Exact contract</span><span class="ib" data-act="sheet:close">${I('x', 20)}</span></div>
      <div class="ctitle" ${st('ok', 'BUILT')}>${av(p, 44)}<div><b>${p.name}: ${r.k}+ ${SHORT[p.fam].toLowerCase()}</b><span><span data-go="game:${p.game}">${gm(p)} · ${p.when}</span> · Kalshi YES</span></div></div>`;
    if (S.noQuote) return `<div class="sheet pd6">${head}<div class="tick-mono" ${st('ok', 'BUILT')}>${r.ticker}</div><div class="nq" ${st('new', 'DEMO STATE')}><b>Price unavailable right now</b><span>No reliable quote could be obtained. Nothing is estimated.</span><span class="btn pri" data-act="retry">Retry</span></div>
      <div class="acts" style="margin-top:6px"><span class="btn pri" data-go="player:${p.name}|${p.fam}|${r.k}">Research ${p.name.split(' ')[0]}</span><span class="btn" data-act="sheet:close">Back to list</span></div></div>`;
    return `<div class="sheet pd6">${head}<div class="tick-mono" ${st('ok', 'BUILT')}>${r.ticker}</div>
      <div class="pgrid" ${st('ok', 'BUILT')}><div><small>Ask</small><b class="num m">${r.ask}¢</b></div><div><small>Bid</small><b class="num">${r.bid}¢</b></div><div><small>Implied</small><b class="num m">${r.ask}%</b><em>pre-fee</em></div><div><small>Volume</small><b class="num">${Number(r.vol).toLocaleString()}</b></div></div>
      <div class="fee" ${st('ok', 'BUILT')}><div><span>Taker fee at ${r.ask}¢</span><b>${fee}¢</b></div><div><span>Fee-aware break-even</span><b>${be}¢ · ${be}%</b></div></div>
      <div class="nbr" ${st('wire', 'WIRE')}><div class="eyebrow">Neighbouring rungs</div>${p.ladder.map((x) => `<div class="nr ${x.k === r.k ? 'on' : ''}" data-act="ck:${x.k}"><b>${x.k}+ ${SHORT[p.fam].toLowerCase()}</b><span class="num m">${x.ask}¢</span><small>${h(x.k) ? h(x.k).h + '/' + h(x.k).n + ' history' : 'no log'}</small></div>`).join('')}</div>
      <div class="foot" style="margin-top:8px">Prices are Kalshi YES asks before fees. SIFT shows no bet buttons.${p.model.status === 'published' ? '' : ' SIFT model estimates for this prop are not approved and are not shown.'}</div>
      <div class="acts" style="margin-top:12px"><span class="btn pri" data-go="player:${p.name}|${p.fam}|${r.k}">Research ${p.name.split(' ')[0]}</span><span class="btn" data-act="sheet:close">Back</span></div></div>`;
  }
  E_.contractSheet = contractSheet;
  E_.rowP = rowP; E_.peekP = peekP; E_.cardP = cardP; E_.filterProps = filterProps; E_.statGo = statGo; E_.lgp = lgp;
  function sheetFor(ui) {
    if (!ui.sheet) return '';
    if (ui.sheet.t === 'filter') return filterSheet(ui);
    if (ui.sheet.t === 'contract') return contractSheet(ui.sheet.id, ui.sheet.k);
    return '';
  }
  E_.sheetFor = sheetFor;

  /* ---------- compare (three columns) */
  E.defaults.compare = () => ({ sheet: null });
  E.screens.compare = (p, ui) => {
    const cols = p.ids.map((id) => byId[id]).filter(Boolean);
    const cell = (f) => cols.map((x) => `<div class="pcell">${f(x)}</div>`).join('');
    const rowC = (cap, f, tag = '') => `<div class="crow" ${tag}><div class="cap">${cap}</div>${cell(f)}</div>`;
    const spark = (x) => { const hv = hist(x); if (!hv) return ''; const mx = Math.max(...hv.vals, x.featured) + 0.5; return `<svg width="84" height="38" viewBox="0 0 92 40">${hv.vals.map((v, i) => `<rect x="${i * 9.2 + 1}" y="${40 - 2 - (v / mx) * 34}" width="6.6" height="${Math.max(2, (v / mx) * 34)}" rx="1.6" fill="${v >= x.featured ? TH.go0 : TH.gu0}"/>`).join('')}<line x1="0" x2="92" y1="${40 - 2 - ((x.featured - 0.5) / mx) * 34}" y2="${40 - 2 - ((x.featured - 0.5) / mx) * 34}" stroke="#fff" stroke-dasharray="3 3" stroke-width="1"/></svg>`; };
    return { html: `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>Compare</h1><span class="cnt">${cols.length}</span></div></div>
      <div class="cmp5"><div class="crow chd" ${st('ok', 'BUILT')}><div class="cap"></div>${cols.map((x) => `<div class="pcell hd"><span data-go="player:${x.name}|${x.fam}|${x.featured}" style="display:grid;justify-items:center;gap:3px">${av(x, 36, false)}<b>${x.name.split(' ').slice(-1)[0]}</b></span><span data-go="contract:${x.id}|${x.featured}">${ABBR[x.fam]} ${x.featured}+</span><small data-go="game:${x.game}">${gm(x)}</small></div>`).join('')}</div>
      ${rowC('Market', (x) => `<span data-go="contract:${x.id}|${x.featured}" style="display:grid;justify-items:center"><b class="num m">${S.noQuote ? '—' : asks(x) + '%'}</b><small>${S.noQuote ? 'no quote' : asks(x) + '¢ ask'}</small></span>`, st('ok', 'BUILT'))}
      ${rowC('History<br><small>last 10</small>', (x) => { const h = hist(x); return h ? `<span data-go="player:${x.name}|${x.fam}|${x.featured}" style="display:grid;justify-items:center"><b class="num h">${h.h}/${h.n}</b>${spark(x)}</span>` : '<b class="num h">—</b><small class="wd">no log</small>'; }, st('wire', 'WIRE'))}
      ${rowC('SIFT model', (x) => { const m = mdl(x); return m != null ? `<b class="num z">${m}%</b><small>P(${x.featured}+) published</small>` : `<b class="num z off">—</b><small class="wd">not approved</small>`; }, st('wire', 'WIRE'))}
      ${rowC('Opponent', (x) => { const mm = x.matchup, g = statGo(x); return mm ? `<span ${g ? `data-go="${g}"` : ''} style="display:grid;justify-items:center;gap:2px"><b class="un">${x.opp} ${x.sport === 'NFL' ? 'pass D' : 'goals vs'}</b><span class="rk"><b class="num">${ord(mm.rank)}</b> of ${mm.n}</span><span class="mini-trk"><i style="left:${100 * (mm.n - mm.rank) / (mm.n - 1)}%"></i></span></span>` : '<small class="wd">no matchup rows</small>'; }, st('wire', 'WIRE'))}
      <div class="crow acts5"><div class="cap"></div>${cols.map((x) => `<div class="pcell"><span class="btn sm" data-go="player:${x.name}|${x.fam}|${x.featured}">Research</span><span class="btn sm ghost" data-go="contract:${x.id}|${x.featured}">Contract</span></div>`).join('')}</div></div>
      <p class="cnote">“—” means no approved estimate, never a blank to fill. Goals vs = opponent goals allowed per game.</p></div>${chrome('Explore')}`, sheet: sheetFor(ui) };
  };

  /* ---------- acts */
  const A = E.acts, setList = (patch) => E.set({ ...patch, more: 1 }, false);
  A.exp = (id) => { const c = E.cur(); if (c.name !== 'pdlist') return; E.set({ exp: c.ui.exp === id ? null : id }); };
  A.rung = (a) => { const [id, k] = a.split('|'); const c = E.cur(); E.set({ rungs: { ...c.ui.rungs, [id]: +k } }); };
  A.cmpmode = () => { const c = E.cur(); E.set({ cmpMode: !c.ui.cmpMode }); };
  A.cmp = (id) => { const c = E.cur(), has = c.ui.cmp.includes(id); if (!has && c.ui.cmp.length >= 3) return E.toast('Compare up to three props'); E.set({ cmp: has ? c.ui.cmp.filter((x) => x !== id) : [...c.ui.cmp, id] }); };
  A.cmpclear = () => E.set({ cmp: [] });
  A.cmpgo = () => { const c = E.cur(); E.go('compare', { ids: [...c.ui.cmp] }); };
  A.sort = (k) => setList({ sort: k }); A.range = (k) => setList({ range: k }); A.hist = (k) => setList({ histMin: +k }); A.opp = (k) => setList({ oppRank: k });
  A.sport = (k) => { if (E.cur().name === 'pdlist') setList({ sport: k }); };
  A.fam = (k) => { if (E.cur().name === 'pdlist') setList({ fam: k || null }); };
  A.toggle = (k) => { const c = E.cur(); setList({ [k]: !c.ui[k] }); };
  A.reset = () => setList({ sport: 'All', fam: null, sort: 'hist', q: '', hideOut: true, team: null, player: null, preset: null, range: 'any', histMin: 0, oppRank: 'any', modelOnly: false });
  A.more = () => { const c = E.cur(); E.set({ more: c.ui.more + 1 }); };
  A.clear = (k) => { const m = { hideOut: { hideOut: false }, sport: { sport: 'All' }, fam: { fam: null }, team: { team: null }, game: { game: null }, player: { player: null }, preset: { preset: null }, q: { q: '' } }; setList(m[k]); };
  A.openprop = (id) => { const p = byId[id]; E.go('pdlist', {}, { exp: id, pin: id, sport: 'All' }); };
  A.pdsearch = () => { E.go('pdlist', {}, {}); setTimeout(() => { const i = document.querySelector('.pdsearch input'); if (i) i.focus(); }, 50); };
  A.sportgo = (s) => E.go('pdlist', {}, { sport: s });
  A.famgo = (f) => E.go('pdlist', {}, { fam: f });
  A.openfilter = () => E.go('pdlist', {}, { sheet: { t: 'filter' } });
  A.ck = (k) => { const c = E.cur(); E.set({ sheet: { ...c.ui.sheet, k: +k } }); };
  A.retry = () => { S.noQuote = false; document.getElementById('bQ').setAttribute('aria-pressed', 'false'); E.render('keep'); E.toast('Quote obtained'); };
  A.saveprop = (a) => { const [id, k] = a.split('|'), p = byId[id]; if (!p) return; const item = { id: 's' + Date.now(), name: 'player', p: { name: p.name, stat: p.fam, k: +k }, ui: { ...E.defaults.player({ name: p.name, stat: p.fam, k: +k }) } }; S.saved.unshift(item); try { localStorage.setItem('sift3.walk.saved', JSON.stringify(S.saved)); } catch (e) { /* */ } E.toast(`Saved ${p.name} · ${ABBR[p.fam]} ${k}+`); };

  E.describe.pdlist = (p, ui) => { const bits = [ui.player || (ui.team && ui.team + ' props'), ui.sport !== 'All' && ui.sport, ui.fam && SHORT[ui.fam], ui.preset].filter(Boolean); return { title: 'Props' + (bits.length ? ' · ' + bits.join(' · ') : ''), chips: [`Sort: ${SORTL[ui.sort]}`, ui.exp && 'prop expanded', ui.cmp && ui.cmp.length ? `${ui.cmp.length} to compare` : null].filter(Boolean) }; };
  E.describe.compare = (p) => ({ title: 'Compare ' + p.ids.map((id) => (byId[id] ? byId[id].name.split(' ').slice(-1)[0] : '')).join(' · '), chips: [] });
})();
