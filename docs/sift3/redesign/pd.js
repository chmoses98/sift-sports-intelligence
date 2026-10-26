/* Prop Discovery mockups (PD1 to PD6). Every row is a real contract from the five per-game quote feeds of 2026-10-26 (17:42Z): 335 player props,
   902 contracts, NFL / NHL / MLB. History comes from the NFL history layer and NHL player logs; the SIFT model lane shows only values the
   approval ledger lets SIFT display (NFL receptions today) and is otherwise empty. Nothing is estimated to fill a gap. */
(function () {
  if (!/^pd/.test(SCREEN)) return;
  const PR = window.PD.props, GAMES = window.PD.games;
  const PHOTO = { ceedeelamb: 'dal-ceedee-lamb', dakprescott: 'dal-dak-prescott', jalenhurts: 'phi-jalen-hurts', javontewilliams: 'dal-javonte-williams' };
  const nk = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const SHORT = { rec: 'Receptions', recyds: 'Receiving yds', rshyds: 'Rushing yds', passyds: 'Passing yds', td: 'Touchdowns', goals: 'Goals', points: 'Points', assists: 'Assists', hits: 'Hits', tb: 'Total bases', hrr: 'H+R+RBI', rbi: 'RBIs', ks: 'Strikeouts', sb: 'Stolen bases' };
  const ABBR = { rec: 'REC', recyds: 'REC YDS', rshyds: 'RUSH YDS', passyds: 'PASS YDS', td: 'TD', goals: 'GOALS', points: 'PTS', assists: 'AST', hits: 'HITS', tb: 'TB', hrr: 'H+R+RBI', rbi: 'RBI', ks: 'K', sb: 'SB' };
  const lgs = (p, s = 28) => `<img class="lg" src="assets/teams/${p.sport === 'NFL' ? '' : p.sport.toLowerCase() + '/'}${p.team}.webp" width="${s}" height="${s}" alt="${p.team}">`;
  const lgt = (sport, t, s = 18) => `<img class="lg" src="assets/teams/${sport === 'NFL' ? '' : sport.toLowerCase() + '/'}${t}.webp" width="${s}" height="${s}" alt="${t}">`;
  const rung = (p, k = p.featured) => p.ladder.find((r) => r.k === k);
  const hist = (p, k = p.featured) => (p.hist ? { n: p.hist.vals.length, h: p.hist.vals.filter((v) => v >= k).length, vals: p.hist.vals } : null);
  const mdl = (p, k = p.featured) => (p.model.status === 'published' && p.model.thresholds[String(k)] != null ? Math.round(p.model.thresholds[String(k)] * 100) : null);
  const photo = (p) => PHOTO[nk(p.name)];
  const av = (p, s = 40) => `<span class="av4" style="--s:${s}px">${photo(p) ? `<img src="assets/players/${photo(p)}.webp" alt="">` : lgs(p, Math.round(s * 0.68))}</span>`;
  const gm = (p) => { const [, a, h] = GAMES[p.game]; return `${a} at ${h}`; };
  const muChip = (p) => (p.matchup ? `<em class="chipD">${p.opp} ${p.sport === 'NFL' ? p.matchup.unit.toLowerCase().replace('defense overall', 'defense').replace('pass defense', 'pass D').replace('run defense', 'run D') : 'goals against'} · ${ord(p.matchup.rank)} of ${p.matchup.n}</em>` : `<em class="chipD none">no matchup rows</em>`);
  const lines = (p) => { const r = rung(p), h = hist(p), m = mdl(p); return { r, h, m }; };
  const lanes = (p, big = false) => { const { r, h, m } = lines(p);
    return `<div class="ln3 ${big ? 'big' : ''}"><span class="m"><i class="sw"></i>${r.ask}%</span><span class="h"><i class="sw h"></i>${h ? `${h.h}/${h.n}` : '<u>—</u>'}</span><span class="z"><i class="sw z"></i>${m != null ? m + '%' : '<u>—</u>'}</span></div>`; };
  const lanesL = (p) => { const { r, h, m } = lines(p);
    return `<div class="lanesL"><div class="m"><span class="t"><i class="sw"></i>Market</span><b class="num">${r.ask}%</b></div><div class="h ${h ? '' : 'off'}"><span class="t"><i class="sw h"></i>History</span><b class="num">${h ? `${h.h}/${h.n}` : '—'}</b></div><div class="z ${m == null ? 'off' : ''}"><span class="t"><i class="sw z"></i>SIFT model</span><b class="num">${m != null ? m + '%' : '—'}</b></div></div>`; };
  const price = (p) => `<span class="px"><b class="num">${rung(p).ask}¢</b><small>ask</small></span>`;
  const rowOf = (p, opt = {}) => `<div class="pr2 ${opt.open ? 'is-open' : ''}" ${opt.st || ''}>${av(p)}<div class="pb"><div class="pn"><b>${p.name}</b><span>${gm(p)} · ${p.when.replace('Mon ', '')}</span></div>
    <div class="ps">${SHORT[p.fam]} <b>${p.featured}+</b>${muChip(p)}</div>${lanes(p)}</div>${price(p)}</div>`;
  const find = (name, fam) => PR.find((p) => p.name === name && p.fam === fam);
  const asks = (p) => rung(p).ask;
  const hitsOf = (p) => { const h = hist(p); return h ? h.h / h.n : -1; };

  /* ---------- shared pieces */
  const searchField = `<label class="sfield">${I('search', 20, '#8b95a1')}<span>Search player, stat or team</span></label>`;
  const count = (f) => PR.filter(f).length;
  const sports = [['All', PR.length], ['NFL', count((p) => p.sport === 'NFL')], ['NHL', count((p) => p.sport === 'NHL')], ['MLB', count((p) => p.sport === 'MLB')]];
  const railHtml = (on = 'All') => `<div class="prail" ${st('wire', 'WIRE')}>${sports.map(([n, c]) => `<span class="${n === on ? 'on' : ''}">${n}<b>${c}</b></span>`).join('')}</div>`;
  const famCounts = Object.entries(PR.reduce((a, p) => { a[p.fam] = (a[p.fam] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const chipsHtml = (on = null) => `<div class="schips" ${st('wire', 'WIRE')}>${famCounts.map(([f, c]) => `<span class="chip ${f === on ? 'cy' : ''}">${SHORT[f]}<b>${c}</b></span>`).join('')}</div>`;
  const legend = `<div class="pleg"><span>Market <i class="sw"></i> pre-fee implied</span><span>History <i class="sw h"></i> last 10</span><span>SIFT model <i class="sw z"></i></span></div>`;

  /* ---------- PD1: discover */
  const shelf = (title, sub, items) => `<section class="shelf"><div class="sh3"><div><b>${title}</b><small>${sub}</small></div><span class="seeall">See all ${I('chevR', 14)}</span></div><div class="hs">${items.map((p) => card(p)).join('')}</div></section>`;
  const card = (p) => `<article class="pc"><div class="pct">${av(p, 38)}<div class="pn"><b>${p.name}</b><span>${gm(p)} · ${p.when.replace('Mon ', '')}</span></div>${price(p)}</div>
    <div class="pcs">${SHORT[p.fam]} <b>${p.featured}+</b></div>${lanesL(p)}<div class="pcm">${muChip(p)}</div></article>`;
  function pd1() {
    const published = PR.filter((p) => p.model.status === 'published').sort((a, b) => Math.abs(asks(a) - 50) - Math.abs(asks(b) - 50)).slice(0, 4);
    const bottom = PR.filter((p) => p.matchup && p.matchup.rank >= p.matchup.n - 2 && asks(p) >= 35 && asks(p) <= 65 && hist(p) && !p.avail).sort((a, b) => b.matchup.rank / b.matchup.n - a.matchup.rank / a.matchup.n || Math.abs(asks(a) - 50) - Math.abs(asks(b) - 50)).slice(0, 4);
    const nBottom = count((p) => p.matchup && p.matchup.rank >= p.matchup.n - 2);
    return `<div class="scr"><div class="pdh"><div class="tt"><h1>Props</h1><span class="tr"><span class="ib">${I('sliders', 22)}</span></span></div><div class="sub">Mon Oct 26 · ${Object.keys(GAMES).length} games · ${PR.length} props · ${PR.reduce((a, p) => a + p.ladder.length, 0)} contracts</div></div>
      ${searchField}${railHtml()}${chipsHtml()}
      <div ${st('wire', 'WIRE')}>${shelf('SIFT model published', `${count((p) => p.model.status === 'published')} of ${PR.length} props today · NFL receptions`, published.slice(0, 3))}</div>
      <div ${st('wire', 'WIRE')}>${shelf('Facing a bottom-3 defense', `${nBottom} props · near-even prices first`, bottom)}</div></div>${chrome('Explore')}`;
  }

  /* ---------- PD2: browse (sorted by history, hide out) */
  function filtered() { return PR.filter((p) => !(p.avail === 'OUT' || p.avail === 'DOUBTFUL') && hist(p)); }
  function pd2() {
    const hiddenOut = count((p) => p.avail === 'OUT' || p.avail === 'DOUBTFUL');
    const rows = filtered().sort((a, b) => hitsOf(b) - hitsOf(a) || Math.abs(asks(a) - 50) - Math.abs(asks(b) - 50)).slice(0, 5);
    return `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>All props</h1><span class="cnt">${filtered().length}</span><span class="tr"><span class="ib">${I('search', 22)}</span></span></div></div>
      <div class="ctrl" ${st('wire', 'WIRE')}><span class="chip sort">${I('sliders', 13)}Sort: History<b>▾</b></span><span class="chip">Filters<b class="bd">2</b></span><span class="chip">Compare</span></div>
      <div class="actv"><span class="chip cy">Hide out · ${hiddenOut} hidden ${I('x', 11)}</span><span class="chip">Has history ${I('x', 11)}</span></div>
      ${legend}
      <div class="pnote" ${st('wire', 'WIRE')}>${I('info', 13, TH.info)}<span>SIFT model shows “—” where no approved estimate exists: ${count((p) => p.model.status === 'published')} of ${PR.length} props today.</span></div>
      <div class="plist">${rows.map((p, i) => rowOf(p, { st: i === 0 ? st('ok', 'BUILT') : '' })).join('')}</div></div>${chrome('Explore')}`;
  }

  /* ---------- PD3: peek (progressive disclosure) */
  const bars = (vals, k, w = 322, h = 92, label = '') => {
    const mx = Math.max(...vals, k) + 0.6, pw = w - 8, sw = pw / vals.length, bw = Math.min(22, sw - 8), y = (v) => h - 16 - (v / mx) * (h - 26), id = 'b' + Math.abs((k + vals.join('')).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973);
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.go0}"/><stop offset="1" stop-color="${TH.go1}"/></linearGradient><linearGradient id="${id}u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TH.gu0}"/><stop offset="1" stop-color="${TH.gu1}"/></linearGradient></defs>`;
    vals.forEach((v, i) => { const x = 4 + sw * i + sw / 2, hit = v >= k; s += `<rect x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" rx="3.5" fill="url(#${id}${hit ? 'o' : 'u'})"/><text x="${x}" y="${y(v) - 3}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${hit ? TH.hit : TH.miss}">${v}</text>`; });
    s += `<line x1="4" x2="${w - 4}" y1="${y(k - 0.5)}" y2="${y(k - 0.5)}" stroke="#fff" stroke-width="1.3" stroke-dasharray="5 4"/>`;
    s += `<text x="4" y="${h - 3}" font-size="9.5" fill="${TH.axis}">oldest</text><text x="${w - 4}" y="${h - 3}" text-anchor="end" font-size="9.5" fill="${TH.axis}">latest</text></svg>`;
    return s;
  };
  const track = (rank, n, team, sport) => `<div class="utrk"><div class="rail"></div><i class="tick"></i><span class="mkr d" style="left:${100 * (n - rank) / (n - 1)}%">${lgt(sport, team, 15)}</span><div class="ends"><span>Worst</span><span>Best</span></div></div>`;
  function peekCard(p) {
    const { r, h, m } = lines(p), k = p.featured, hv = hist(p);
    const wd = p.model.status !== 'published';
    return `<div class="card peek" ${st('wire', 'WIRE')}>
      <div class="pk1"><div class="pkh"><b>Last 10 games · ${SHORT[p.fam].toLowerCase()}</b><span>${hv.h} of ${hv.n} cleared ${k}+</span></div>${bars(hv.vals, k)}</div>
      <div class="trio mini">
        <div><span class="t m"><span class="sw"></span>Market</span><span class="n m">${r.ask}%</span><span class="s">${r.ask}¢ ask · pre-fee</span></div>
        <div><span class="t h"><span class="sw h"></span>History</span><span class="n h">${Math.round(100 * hv.h / hv.n)}%</span><span class="s">${hv.h} of ${hv.n} · observed</span></div>
        <div><span class="t z"><span class="sw z"></span>SIFT model</span><span class="n z ${wd ? 'off' : ''}">${m != null ? m + '%' : '—'}</span><span class="s">${wd ? 'not approved yet' : `P(${k}+) published`}</span></div></div>
      ${wd ? `<div class="whyno">${I('lock', 13)}<span>${p.model.reason}. Shown as “—”, never estimated.</span></div>` : ''}
      <div class="rsteps"><span class="eyebrow">Rungs</span>${p.ladder.slice(0, 5).map((x) => `<span class="rs ${x.k === k ? 'on' : ''}"><b>${x.k}+</b><small>${x.ask}¢</small></span>`).join('')}</div>
      <div class="umu"><div class="slh"><span>${lgt(p.sport, p.opp, 16)} ${p.opp} ${p.matchup.unit.toLowerCase()}</span><b>${ord(p.matchup.rank)} of ${p.matchup.n}${p.matchup.value ? ` · ${p.matchup.value.toFixed(1)}/game` : ''}</b></div>${track(p.matchup.rank, p.matchup.n, p.opp, p.sport)}</div>
      <div class="acts"><span class="btn pri">Research ${p.name.split(' ')[0]}</span><span class="btn">Contract · ${r.ask}¢</span><span class="btn sq">${I('bm', 18)}</span></div></div>`;
  }
  function pd3() {
    const open = find('Kirill Marchenko', 'points');
    const others = filtered().filter((p) => p.id !== open.id).sort((a, b) => hitsOf(b) - hitsOf(a)).slice(0, 1);
    return `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>All props</h1><span class="cnt">${filtered().length}</span><span class="tr"><span class="ib">${I('search', 22)}</span></span></div></div>
      <div class="plist tight">${rowOf(open, { open: true })}${peekCard(open)}${rowOf(others[0])}</div>
      <div class="tray" ${st('new', 'NEW UI')}><span class="stack"><i>${av(find('CeeDee Lamb', 'rec'), 26)}</i><i>${av(open, 26)}</i></span><span class="tt2"><b>2 selected</b><small>Lamb REC 7+ · Marchenko PTS 1+</small></span><span class="btn pri sm">Compare ${I('chevR', 13, '#04202c')}</span></div></div>${chrome('Explore')}`;
  }

  /* ---------- PD4: sort and filters */
  const inRange = (p) => asks(p) >= 35 && asks(p) <= 75 && hist(p) && hist(p).h >= 6 && !(p.avail === 'OUT' || p.avail === 'DOUBTFUL');
  function pd4() {
    const matched = PR.filter(inRange), bySport = ['NFL', 'NHL', 'MLB'].map((s) => [s, matched.filter((p) => p.sport === s).length]);
    const buckets = Array.from({ length: 10 }, (_, i) => PR.filter((p) => Math.floor(asks(p) / 10) === i).length), mxb = Math.max(...buckets);
    const hs = buckets.map((c, i) => { const inb = i >= 3 && i <= 7; return `<i style="height:${4 + 26 * c / mxb}px" class="${inb ? 'in' : ''}"></i>`; }).join('');
    const nm = (a) => PR.filter(a).length;
    return `<div class="scr" style="filter:blur(2px) brightness(.5)"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>All props</h1></div></div></div><div class="scrim"></div>
    <div class="sheet pd4"><div class="grab"></div><div class="sh"><span class="h2">Sort and filter</span><span style="color:var(--cyan);font:500 15px var(--f-ui)">Reset</span></div>
     <div class="live" ${st('wire', 'WIRE')}><div><div class="big num">${matched.length} props match</div><div class="s">${bySport.map(([s, c]) => `${s} ${c}`).join(' · ')}</div></div><div class="spl">${bySport.map(([s, c]) => `<i class="${s}" style="flex:${Math.max(c, 1)}"></i>`).join('')}</div></div>
     <div class="fg"><div class="fl">Sort by</div><div class="row sortrow">${[['Soonest', 0], ['Price', 0], ['History', 1], ['SIFT model', 0], ['Matchup', 0], ['Volume', 0]].map(([n, on]) => `<span class="seg sm ${on ? 'on' : ''}">${n}</span>`).join('')}</div></div>
     <div class="fg" ${st('wire', 'WIRE')}><div class="fl">Sport and stat</div><div class="row wrap"><span class="fc2 on">All sports</span>${famCounts.slice(0, 4).map(([f, c]) => `<span class="fc2">${SHORT[f]}<em>${c}</em></span>`).join('')}<span class="fc2 more">+ ${famCounts.length - 4} more</span></div></div>
     <div class="fg" ${st('wire', 'WIRE')}><div class="fl">Price of the rung <b class="rngv">35¢ to 75¢</b></div><div class="hist">${hs}</div><div class="rng"><i></i><span style="left:30%"></span><span style="left:75%"></span></div></div>
     <div class="fg" ${st('wire', 'WIRE')}><div class="fl">History at that rung</div><div class="row"><span class="stp">${I('back', 14)}</span><span class="stv"><b class="num">6 of 10</b> or better</span><span class="stp">${I('chevR', 14)}</span><span class="seg sm on">L10</span><span class="seg sm">L5</span></div></div>
     <div class="fg"><div class="fl">Opponent unit rank</div><div class="row"><span class="seg sm on">Any</span><span class="seg sm">Bottom 10</span><span class="seg sm">Top 10</span></div></div>
     <div class="fg" ${st('wire', 'WIRE')}><div class="fl">SIFT model and availability</div>
       <div class="tog2"><span>SIFT model published only<small>${nm((p) => p.model.status === 'published')} props today</small></span><i class="sw2"></i></div>
       <div class="tog2"><span>Hide out and doubtful<small>${nm((p) => p.avail === 'OUT' || p.avail === 'DOUBTFUL')} props hidden</small></span><i class="sw2 on"></i></div></div>
     <div class="fg locked" ${st('new', 'NEW DATA')}><div class="fl">${I('lock', 13)} Needs more data</div><div class="row"><span class="fc off"><b>Price move since open</b><em>no prop price history</em></span><span class="fc off"><b>Teammate out</b><em>needs data</em></span></div></div>
     <div class="apply">Show ${matched.length} props</div></div>${chrome('Explore').replace(/<nav.*?<\/nav>/s, '')}`;
  }

  /* ---------- PD5: compare */
  function pd5() {
    const cols = [find('CeeDee Lamb', 'rec'), find('Dallas Goedert', 'rec'), find('Kirill Marchenko', 'points')];
    const cell = (f) => cols.map((p) => `<div class="cc">${f(p)}</div>`).join('');
    const rowC = (cap, f, tag = '') => `<div class="crow" ${tag}><div class="cap">${cap}</div>${cell(f)}</div>`;
    const spark = (p) => { const hv = hist(p); const mx = Math.max(...hv.vals, p.featured) + 0.5; return `<svg width="84" height="38" viewBox="0 0 92 40">${hv.vals.map((v, i) => `<rect x="${i * 9.2 + 1}" y="${40 - 2 - (v / mx) * 34}" width="6.6" height="${Math.max(2, (v / mx) * 34)}" rx="1.6" fill="${v >= p.featured ? TH.go0 : TH.gu0}"/>`).join('')}<line x1="0" x2="92" y1="${40 - 2 - ((p.featured - 0.5) / mx) * 34}" y2="${40 - 2 - ((p.featured - 0.5) / mx) * 34}" stroke="#fff" stroke-dasharray="3 3" stroke-width="1"/></svg>`; };
    return `<div class="scr"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>Compare</h1><span class="cnt">3</span><span class="tr"><span class="chip">Add prop ${I('chevR', 11)}</span></span></div></div>
     <div class="cmp5">
      <div class="crow chd" ${st('ok', 'BUILT')}><div class="cap"></div>${cols.map((p) => `<div class="cc hd">${av(p, 36)}<b>${p.name.split(' ').slice(-1)[0]}</b><span>${ABBR[p.fam]} ${p.featured}+</span><small>${gm(p)}</small></div>`).join('')}</div>
      ${rowC('Market', (p) => `<b class="num m">${asks(p)}%</b><small>${asks(p)}¢ ask</small>`, st('ok', 'BUILT'))}
      ${rowC('History<br><small>last 10</small>', (p) => { const h = hist(p); return `<b class="num h">${h.h}/${h.n}</b>${spark(p)}`; }, st('wire', 'WIRE'))}
      ${rowC('SIFT model', (p) => { const m = mdl(p); return m != null ? `<b class="num z">${m}%</b><small>P(${p.featured}+) published</small>` : `<b class="num z off">—</b><small class="wd">not approved</small>`; }, st('wire', 'WIRE'))}
      ${rowC('Opponent', (p) => `<b class="un">${p.opp} ${p.sport === 'NFL' ? 'pass D' : 'goals vs'}</b><span class="rk"><b class="num">${ord(p.matchup.rank)}</b> of ${p.matchup.n}</span><span class="mini-trk"><i style="left:${100 * (p.matchup.n - p.matchup.rank) / (p.matchup.n - 1)}%"></i></span>`, st('wire', 'WIRE'))}
      ${rowC('Status', (p) => (p.avail ? `<span class="chip bad">${p.avail}</span>` : `<span class="chip ok"><span class="dot"></span>Listed</span>`), st('wire', 'WIRE'))}
      <div class="crow acts5"><div class="cap"></div>${cols.map(() => `<div class="cc"><span class="btn sm">Research</span><span class="btn sm ghost">Contract</span></div>`).join('')}</div>
     </div>
     <p class="cnote">“—” means no approved estimate, never a blank to fill. Goals vs = opponent goals allowed per game.</p></div>${chrome('Explore')}`;
  }

  /* ---------- PD6: exact contract */
  function pd6() {
    const p = find('Kirill Marchenko', 'points'), r = rung(p), fee = Math.ceil(0.07 * (r.ask / 100) * (1 - r.ask / 100) * 100), be = r.ask + fee;
    return `<div class="scr" style="filter:blur(2px) brightness(.5)"><div class="pdh slim"><div class="tt"><span class="ib back">${I('back', 24)}</span><h1>All props</h1></div></div></div><div class="scrim"></div>
    <div class="sheet pd6"><div class="grab"></div><div class="sh"><span class="h2">Exact contract</span><span class="ib">${I('x', 20)}</span></div>
     <div class="ctitle" ${st('ok', 'BUILT')}>${av(p, 44)}<div><b>${p.name}: ${r.k}+ points</b><span>${gm(p)} · ${p.when} · Kalshi YES</span></div></div>
     <div class="tick-mono" ${st('ok', 'BUILT')}>${r.ticker}</div>
     <div class="pgrid" ${st('ok', 'BUILT')}><div><small>Ask</small><b class="num m">${r.ask}¢</b></div><div><small>Bid</small><b class="num">${r.bid}¢</b></div><div><small>Implied</small><b class="num m">${r.ask}%</b><em>pre-fee</em></div><div><small>Volume</small><b class="num">${r.vol.toLocaleString()}</b></div></div>
     <div class="fee" ${st('ok', 'BUILT')}><div><span>Taker fee at ${r.ask}¢</span><b>${fee}¢</b></div><div><span>Fee-aware break-even</span><b>${be}¢ · ${be}%</b></div></div>
     <div class="nbr" ${st('wire', 'WIRE')}><div class="eyebrow">Neighbouring rungs</div>${p.ladder.map((x) => `<div class="nr ${x.k === r.k ? 'on' : ''}"><b>${x.k}+ points</b><span class="num m">${x.ask}¢</span><small>${hist(p, x.k).h}/${hist(p, x.k).n} history</small></div>`).join('')}</div>
     <div class="foot" style="margin-top:8px">Prices are Kalshi YES asks before fees. SIFT shows no bet buttons. SIFT model for NHL skaters is under validation and is not shown.</div>
     <div class="acts" style="margin-top:12px"><span class="btn pri">Research ${p.name.split(' ')[0]}</span><span class="btn">Back to list</span></div></div>${chrome('Explore').replace(/<nav.*?<\/nav>/s, '')}`;
  }

  const MAP = { pd1, pd2, pd3, pd4, pd5, pd6 };
  document.body.innerHTML = `<div class="phone ${ANNOT ? 'annot' : ''} th${THEME}" id="phone">${MAP[SCREEN]()}</div>`;
})();
