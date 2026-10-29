/* End-to-end checks for the walkthrough: five journeys, the tap-target matrix, and Back restoring exact state.
   Run: CHROMIUM=<path to chrome> node docs/sift3/redesign/walk.test.mjs   (exits 1 on any failure) */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 520, height: 1000 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + new URL('./walkthrough.html', import.meta.url).pathname); await page.waitForTimeout(500);
let pass = 0, fail = 0; const out = [];
const ok = (cond, msg, extra = '') => { if (cond) pass++; else { fail++; out.push('FAIL ' + msg + ' ' + extra); } };
const cur = () => page.evaluate(() => { const c = PE.cur(); return { name: c.name, p: c.p, ui: c.ui, depth: PE.S.stack.length }; });
const sc = () => page.evaluate(() => { const s = document.querySelector('#phone .scr'); return s ? Math.round(s.scrollTop) : null; });
const setScroll = (y) => page.evaluate((y) => { const s = document.querySelector('#phone .scr'); s.scrollTop = y; return s.scrollTop; }, y);
const click = async (sel, n = 0) => { const loc = page.locator('#phone ' + sel); const cnt = await loc.count(); if (cnt <= n) throw new Error('no element ' + sel + ' #' + n); await loc.nth(n).evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))); await page.waitForTimeout(40); };
const back = async () => { await page.evaluate(() => PE.back()); await page.waitForTimeout(40); };
const root = async (name, p = {}, ui = null) => { await page.evaluate(([n, p, u]) => { PE.S.noQuote = false; PE.root(n, p, u); }, [name, p, ui]); await page.waitForTimeout(60); };
const set = async (patch) => { await page.evaluate((p) => PE.set(p, true), patch); await page.waitForTimeout(40); };
const text = (sel) => page.locator('#phone ' + sel).first().innerText();
const exists = async (sel) => (await page.locator('#phone ' + sel).count()) > 0;
const J = (o) => JSON.stringify(o);
const N = (ui) => J({ ...ui, sheet: null });

/* ---- tap-target matrix: [setup, selector, nth, expect(cur) => bool, label] */
async function nav(label, sel, n, expect, { reset } = {}) {
  const before = await cur(), y = await setScroll(60);
  try { await click(sel, n); } catch (e) { ok(false, label, e.message); return; }
  const after = await cur();
  ok(expect(after, before), label, J({ name: after.name, p: after.p, sheet: after.ui.sheet, tab: after.ui.tab }));
  if (after.depth > before.depth || (after.ui.sheet && !before.ui.sheet)) { await back(); const re = await cur(); ok(re.name === before.name && N(re.ui) === N(before.ui) && re.depth === before.depth, label + ' → Back restores state', J(re.ui) + ' vs ' + J(before.ui)); const y2 = await sc(); ok(Math.abs(y2 - y) <= 2, label + ' → Back restores scroll', `${y2} vs ${y}`); }
}
const isGo = (name, f = () => true) => (a) => a.name === name && f(a);
const isSheet = (a) => a.ui.sheet && a.ui.sheet.t === 'contract';

/* 1. Prop Discovery home */
await root('pdhome');
await nav('PD home: avatar → player', '.pc .av4', 0, isGo('player'));
await nav('PD home: name → player', '.pc .pn b', 0, isGo('player'));
await nav('PD home: game text → game', '.pc .pn span', 0, isGo('game'));
await nav('PD home: price → contract sheet', '.pc .px', 0, isSheet);
await nav('PD home: opponent chip → stat', '.pc .chipD', 0, isGo('stat', (a) => a.p.id === 'adj_def_db_epa'));
await nav('PD home: lanes → expanded prop', '.pc .lanesL', 0, isGo('pdlist', (a) => !!a.ui.exp));
await nav('PD home: See all → list preset', '.seeall', 0, isGo('pdlist', (a) => a.ui.preset === 'model'));
/* 2. Prop Discovery list */
await root('pdlist', {}, { exp: null });
await nav('PD list: avatar → player', '.pr2 .av4', 0, isGo('player'));
await nav('PD list: name → player', '.pr2 .pn b', 0, isGo('player'));
await nav('PD list: game text → game', '.pr2 .pn > span', 0, isGo('game'));
await nav('PD list: price → contract', '.pr2 .px', 0, isSheet);
await nav('PD list: opponent chip → stat', '.pr2 .chipD', 0, isGo('stat'));
await click('.pr2 .ps', 0); const e1 = await cur(); ok(!!e1.ui.exp, 'PD list: stat line expands the prop'); 
await nav('PD list (expanded): Research → player', '.peek .btn.pri', 0, isGo('player'));
await nav('PD list (expanded): Contract → sheet', '.peek .btn:not(.pri):not(.sq)', 0, isSheet);
await nav('PD list (expanded): opponent unit → stat', '.peek .umu', 0, isGo('stat'));
await nav('PD list (expanded): market lane → contract', '.peek .trio.mini > div', 0, isSheet);
await nav('PD list (expanded): history lane → player', '.peek .trio.mini > div', 1, isGo('player'));
await click('.peek .rs', 2); const e2 = await cur(); ok(Object.keys(e2.ui.rungs).length === 1, 'PD list: rung chip changes the line in place');
/* 3. Player Research (Lamb) */
await root('player', { name: 'CeeDee Lamb', stat: 'rec', k: null });
await nav('Player: hero logo → team', '.hero .who [data-go^="team:"]', 0, isGo('team', (a) => a.p.t === 'DAL'));
await nav('Player: game strip left logo → team', '.gstrip > [data-go^="team:"]', 0, isGo('team', (a) => a.p.t === 'DAL'));
await nav('Player: game strip text → game', '.gstrip .c', 0, isGo('game', (a) => a.p.key === '26OCT26DALPHI'));
await nav('Player: game strip right logo → team PHI', '.gstrip > [data-go^="team:"]', 1, isGo('team', (a) => a.p.t === 'PHI'));
await nav('Player: price → contract', '.decide .r', 0, isSheet);
await nav('Player: market lane → contract', '.trio > div', 0, isSheet);
await click('.trio > div', 2); const e3 = await cur(); ok(e3.ui.tab === 'Matchup', 'Player: SIFT model lane → Matchup tab'); await set({ tab: 'Overview' });
await click('.wins > div', 0); const e4 = await cur(); ok(e4.ui.win === 'L5', 'Player: window chip sets the window');
await click('svg [data-act^="bar:"]', 1); const e5 = await cur(); ok(e5.ui.sel === 1, 'Player: bar selects an observation');
await nav('Player: observation → Game Detail (completed game)', '.barcard .btn', 0, isGo('game', (a) => !!a.p.fin));
await nav('Player: tonight bar → Game Detail', 'svg rect[data-go^="game:"]', 0, isGo('game', (a) => a.p.key === '26OCT26DALPHI'));
await click('.pill.f', 0); const e6 = await cur(); ok(e6.ui.sheet && e6.ui.sheet.t === 'filters', 'Player: filter pill opens research filters'); await back();
await set({ tab: 'Matchup' });
await nav('Player Matchup: opponent strip → stat', '.sl', 0, isGo('stat', (a) => a.p.id === 'adj_def_db_epa' && a.ui.sel === 'PHI'));
await set({ tab: 'Props' });
await nav('Player Props tab: price → contract', '.pr2 .px', 0, isSheet);
/* 4. Game Detail and Matchup */
await root('game', { key: '26OCT26DALPHI' }, { tab: 'Matchup' });
await nav('Matchup: team (header) → team', '.teams > div', 0, isGo('team', (a) => a.p.t === 'DAL'));
await nav('Matchup: tilt pill → team', '.tug .tilt[data-go]', 0, isGo('team'));
await nav('Matchup: marker logo → team', '.tug .mkr.o', 0, isGo('team'));
await nav('Matchup: offense value → stat', '.tug .tv > div', 0, isGo('stat', (a) => /^adj_off_/.test(a.p.id)));
await nav('Matchup: defense value → stat', '.tug .tv > div', 1, isGo('stat', (a) => /^adj_def_/.test(a.p.id)));
await nav('Matchup: unit row → expanded unit', '.tug .th b', 0, isGo('unit'));
await click('.lens .lh2', 0); const e7 = await cur(); ok(e7.ui.lens === true, 'Lens: tap opens the evidence');
await nav('Lens: evidence row → stat', '.lens .evr', 0, isGo('stat'));
await nav('Key matchups: avatar → player', '.km .av3', 0, isGo('player'));
await nav('Key matchups: price → contract', '.km .kp', 0, isSheet);
await nav('Key matchups: unit fact → stat', '.km .kt em', 0, isGo('stat'));
await nav('Game shape: team → team', '.sr > span', 0, isGo('team'));
await click('.sg', 0); const e8 = await cur(); ok(e8.ui.dir === 'dal', 'Matchup: direction control switches');
await root('game', { key: '26OCT26DALPHI' }, { tab: 'Overview' });
await nav('Game Overview: win price → contract', '.glp', 0, isSheet);
await nav('Game Overview: player → player', '.km .kt', 0, isGo('player'));
await nav('Game Overview: team row → team', '.card.sec .km[data-go^="team:"]', 0, isGo('team'));
await nav('Game Overview: props → filtered list', '.prow', 0, isGo('pdlist', (a) => a.ui.game === '26OCT26DALPHI'));
await root('unit', { uid: 'pass' });
await nav('Unit: DAL offense strip → stat', '.sl', 0, isGo('stat', (a) => a.p.id === 'adj_off_db_epa'));
await nav('Unit: PHI defense strip → stat', '.sl', 1, isGo('stat', (a) => a.p.id === 'adj_def_db_epa'));
await nav('Unit: Lamb row → player', '.mr', 1, isGo('player', (a) => a.p.name === 'CeeDee Lamb'));
await nav('Unit: team total row → game', '.mr', 0, isGo('game'));
/* 5. Team Research */
await root('team', { t: 'DAL' });
await nav('Team: next game → Game Detail', '.gstrip .c', 0, isGo('game', (a) => a.p.key === '26OCT26DALPHI'));
await nav('Team: opponent logo → team', '.gstrip > [data-go^="team:"]', 0, isGo('team', (a) => a.p.t === 'PHI'));
await nav('Team: props today → filtered props', '.prow', 0, isGo('pdlist', (a) => a.ui.team === 'DAL'));
await nav('Team: offense block → stat', '.idbig .o', 0, isGo('stat', (a) => a.p.id === 'adj_off_epa' && a.ui.sel === 'DAL'));
await nav('Team: defense rank → stat', '.idr .rr b.d', 0, isGo('stat', (a) => a.p.id === 'adj_def_epa'));
await nav('Team: strongest row → stat', '.exr', 0, isGo('stat'));
await nav('Team: margin bar → completed game', 'svg rect[data-go^="fgame:"]', 0, isGo('game', (a) => !!a.p.fin));
await nav('Team: opponent logo under bar → team', '.mlg span', 0, isGo('team'));
await click('.idt .segc i', 1); const e9 = await cur(); ok(e9.ui.adj === false, 'Team: Raw/Adjusted switch');
await set({ tab: 'Profile' });
await nav('Team Profile: row → stat', '.profl .prr', 0, isGo('stat', (a) => a.ui.sel === 'DAL'));
await set({ tab: 'Form' });
await nav('Team Form: result row → game', '.res', 0, isGo('game', (a) => !!a.p.fin));
await nav('Team Form: result logo → team', '.res > span[data-go^="team:"]', 0, isGo('team'));
await set({ tab: 'Schedule' });
await nav('Team Schedule: row → game', '.sch .nm', 0, isGo('game'));
await nav('Team Schedule: logo → team', '.sch > span[data-go^="team:"]', 0, isGo('team'));
await nav('Team Schedule: opponent pill → stat', '.sch .op', 0, isGo('stat', (a) => a.p.id === 'adj_off_epa' && a.ui.sel === 'PHI'));
await set({ tab: 'Players' });
await nav('Team Players: availability → player', '.avr', 0, isGo('player'));
await nav('Team Players: skill player → player', '.plr .nm', 0, isGo('player'));
await nav('Team Players: prop count → filtered props', '.pcnt[data-go]', 0, isGo('pdlist', (a) => !!a.ui.player));
await root('team', { t: 'TOR' });
await nav('NHL Team: next game → Game Detail', '.gstrip .c', 0, isGo('game', (a) => a.p.key === '26OCT26TORCGY'));
await nav('NHL Team: goals-for block → stat', '.idbig .o', 0, isGo('stat', (a) => a.p.sp === 'nhl' && a.p.id === 'gf_per_game'));
/* 6. Stat Detail */
await root('stat', { sp: 'nfl', id: 'adj_off_epa', win: 'ADJ_RIDGE', sel: 'DAL', opp: 'PHI' });
await nav('Stat: team name → team', '.rkr .nm', 0, isGo('team'));
await nav('Stat: team logo → team', '.rkr > span[data-go^="team:"]', 0, isGo('team'));
await nav('Stat: selected card → team', '.selc .sdb2', 0, isGo('team', (a) => a.p.t === 'DAL'));
await nav('Stat: raw switch → counterpart ranking', '.fam .segc i', 1, isGo('stat', (a) => a.p.id === 'off_epa_play' && a.ui.sel === 'DAL'));
await click('.rkr .bw', 0); const e10 = await cur(); ok(e10.ui.sel === 'SF', 'Stat: tapping a bar moves the highlight');
await root('stat', { sp: 'nfl', id: 'points_for', win: 'SEASON', sel: 'DAL', opp: 'PHI' }, { tab: 'Trend' });
await click('svg [data-act^="obs:"]', 3); const e11 = await cur(); ok(e11.ui.obs === 3, 'Stat Trend: bar selects an observation');
await nav('Stat Trend: Game Detail → completed game', '.obs .btn.pri', 0, isGo('game', (a) => !!a.p.fin));
await nav('Stat Trend: opponent → team', '.obs .btn:not(.pri)', 0, isGo('team'));
await root('stat', { sp: 'nfl', id: 'adj_off_epa', win: 'ADJ_RIDGE', sel: 'DAL', opp: 'PHI' }, { tab: 'Compare' });
await nav('Stat Compare: row → stat', '.cr', 0, isGo('stat', (a) => a.ui.sel === 'DAL' && a.ui.opp === 'PHI'));
await nav('Stat Compare: team chip → team', '.who2 .wc', 0, isGo('team'));
await set({ cmpm: 'players' });
await nav('Stat Compare players: player → player', '.sdph', 0, isGo('player'));
await root('stat', { sp: 'nfl', id: 'adj_off_epa', win: 'ADJ_RIDGE', sel: 'DAL', opp: 'PHI' }, { tab: 'About' });
await nav('Stat About: related → stat', '.rr2', 0, isGo('stat', (a) => a.ui.sel === 'DAL'));
await nav('Stat About: team chip → team', '.rel2 .chip', 0, isGo('team'));
const nl = await page.locator('#phone .lim .li').count(); await click('.lim .more2', 0); const nl2 = await page.locator('#phone .lim .li').count(); ok(nl2 >= nl && (await text('.lim .more2')).includes('Showing all'), 'Stat About: all published limits become visible', `${nl}→${nl2}`);
await root('stat', { sp: 'nhl', id: 'pp_pct', win: '2026-27', sel: 'TOR', opp: 'CGY' });
await nav('NHL Stat: next opponent row opens team', '.rkr.opp .nm', 0, isGo('team', (a) => a.p.t === 'CGY'));
/* 7. Saved research */
await root('saved');
await nav('Saved: item opens its state', '.savedc b', 0, isGo('player', (a) => a.ui.k === 6 && a.ui.site === 'away' && a.ui.win === 'L10'));

/* ---- journeys, end to end, with Back retracing every step */
async function snapshotStack() { return page.evaluate(() => PE.S.stack.map((e) => ({ name: e.name, ui: JSON.stringify({ ...e.ui, sheet: null }), scroll: Math.round(e.scroll || 0) }))); }
async function journey(label, start, steps) {
  await root(...start); await page.evaluate(() => { PE.S.last = 'go'; });
  const leave = [];
  for (const [desc, fn, check] of steps) {
    await setScroll(90);
    try { await fn(); } catch (e) { ok(false, `${label}: ${desc}`, e.message); break; }
    const a = await cur(); ok(check(a), `${label}: ${desc}`, J({ name: a.name, p: a.p, tab: a.ui.tab }));
    const snap = await snapshotStack(); for (let k = 0; k < snap.length - 1; k++) leave[k] = snap[k];
  }
  // retrace with Back: every screen returns exactly as it was when it was left
  if ((await cur()).ui.sheet) { await back(); ok(!(await cur()).ui.sheet, `${label}: Back closes the open sheet first`); }
  let depth = (await cur()).depth, n = 0;
  while (depth > 1) { await back(); n++; depth--; const r = await cur(), y = await sc(), want = leave[depth - 1]; if (!want) break;
    ok(r.name === want.name && N(r.ui) === want.ui && !r.ui.sheet, `${label}: Back ${n} restores ${want.name} state`, N(r.ui) + ' vs ' + want.ui);
    ok(Math.abs(y - want.scroll) <= 3, `${label}: Back ${n} restores scroll of ${want.name}`, `${y} vs ${want.scroll}`); }
}
await journey('J1', ['pdhome'], [
  ['open a prop', () => click('.pc .pcs', 0), (a) => a.name === 'pdlist' && !!a.ui.exp],
  ['Research the player', () => click('.peek .btn.pri', 0), (a) => a.name === 'player'],
  ['Matchup tab', () => click('.tabs a', 2), (a) => a.name === 'player' && a.ui.tab === 'Matchup'],
  ['opponent strip → stat', () => click('.sl, .umu', 0), (a) => a.name === 'stat'],
  ['highlighted team → Team Research', () => click('.rkr.sel .nm', 0), (a) => a.name === 'team'],
  ['next game → Game Detail', () => click('.gstrip .c', 0), (a) => a.name === 'game'],
  ['Matchup tab', () => click('.tabs a', 2), (a) => a.name === 'game' && a.ui.tab === 'Matchup'],
]);
await journey('J2', ['games'], [
  ['open DAL at PHI', () => click('.gl[data-go="game:26OCT26DALPHI"]', 0), (a) => a.name === 'game' && a.p.key === '26OCT26DALPHI'],
  ['Matchup tab', () => click('.tabs a', 2), (a) => a.ui.tab === 'Matchup'],
  ['PHI defense stat', () => click('.tug .tv > div', 1), (a) => a.name === 'stat' && a.ui.tab === 'Ranking' && /^adj_def_/.test(a.p.id)],
]);
await journey('J2b (lens)', ['game', { key: '26OCT26DALPHI' }, { tab: 'Matchup' }], [
  ['open the SIFT Lens evidence', () => click('.lens .lh2', 0), (a) => a.ui.lens === true],
  ['evidence row → ranking', () => click('.lens .evr', 0), (a) => a.name === 'stat'],
]);
await journey('J3', ['team', { t: 'DAL' }], [
  ['Schedule tab', () => click('.tabs a', 4), (a) => a.ui.tab === 'Schedule'],
  ['PHI row → Game Detail', () => click('.sch .nm', 0), (a) => a.name === 'game' && a.p.key === '26OCT26DALPHI'],
  ['Lamb → Player Research', () => click('.km .kt', 0), (a) => a.name === 'player' && a.p.name === 'CeeDee Lamb'],
]);
await journey('J4', ['pdlist'], [
  ['expand a prop', () => click('.pr2 .ps', 0), (a) => !!a.ui.exp],
  ['Compare mode', () => click('.ctrl .chip', 2), (a) => a.ui.cmpMode === true],
  ['tick row 1', () => click('.pr2 > span[data-act^="cmp:"]', 0), (a) => a.ui.cmp.length === 1],
  ['tick row 2', () => click('.pr2 > span[data-act^="cmp:"]', 1), (a) => a.ui.cmp.length === 2],
  ['Compare button', () => click('.tray [data-act="cmpgo"]', 0), (a) => a.name === 'compare' && a.p.ids.length === 2],
  ['Contract', () => click('.btn.ghost', 0), (a) => isSheet(a)],
]);
await journey('J5', ['saved'], [
  ['open Lamb REC 6+', () => click('.savedc b', 0), (a) => a.name === 'player' && a.ui.k === 6 && a.ui.site === 'away' && a.ui.win === 'L10'],
]);

/* ---- specific state-restoration scenarios */
await root('pdlist'); await click('.pr2 .ps', 1); await click('.ctrl .chip', 2); await click('.pr2 > span[data-act^="cmp:"]', 0); await click('.pr2 > span[data-act^="cmp:"]', 2); await click('[data-act="sort:price"]', 0).catch(() => {});
await page.evaluate(() => PE.set({ sort: 'price', sport: 'NHL', fam: 'goals', more: 2 }, false)); await page.waitForTimeout(40);
const s0 = await cur(); const y0 = await setScroll(400);
await click('.pr2 .pn > span', 0); ok((await cur()).name === 'game', 'state: game opened from filtered list'); await back();
const s1 = await cur(); ok(N(s1.ui) === N(s0.ui), 'state: filters, sort, comparison selection and expanded row restored after a round trip', J(s1.ui)); ok(Math.abs((await sc()) - y0) <= 3, 'state: list scroll restored', `${await sc()} vs ${y0}`);
await root('player', { name: 'CeeDee Lamb', stat: 'rec', k: null }); await click('.wins > div', 3); await page.evaluate(() => PE.set({ site: 'away', k: 5 }, false)); await page.waitForTimeout(40);
const n = await page.locator('#phone svg [data-act^="bar:"]').count(); const expected = await page.evaluate(() => LOG.filter((g) => g.opp === 'PHI' && !g.home).length); ok(n === expected, 'state: Away filter on the vs PHI window shows only those games', `${n} vs ${expected}`);
await click('.tabs a', 2); await click('.sl', 0); await click('.rkr.sel .nm', 0); await back(); await back(); await back();
const s2 = await cur(); ok(s2.name === 'player' && s2.ui.site === 'away' && s2.ui.win === 'vs PHI' && s2.ui.k === 5 && s2.ui.tab === 'Matchup', 'state: player line, window, filter and tab restored after three screens deep', J(s2.ui));
// saved research captures the exact state, minus scroll
await set({ tab: 'Overview' }); await page.evaluate(() => { PE.S.saved = []; }); await click('.hero .ib[data-act="save"]', 0);
const saved = await page.evaluate(() => PE.S.saved[0]); ok(saved && saved.name === 'player' && saved.ui.k === 5 && saved.ui.site === 'away' && saved.ui.win === 'vs PHI', 'saved: the exact state is stored', J(saved && saved.ui));
await root('saved'); await click('.savedc b', 0); const s3 = await cur(); ok(s3.name === 'player' && s3.ui.k === 5 && s3.ui.site === 'away' && s3.ui.win === 'vs PHI', 'saved: opening restores player, line, window and filter', J(s3.ui));
// missing price: lists show a dash, the contract shows the unavailable state and hides the price-derived rows
await root('pdlist'); await page.evaluate(() => { PE.S.noQuote = true; PE.render('keep'); });
ok((await text('.pr2 .px')).includes('—'), 'no quote: list price shows —'); ok(!(await text('.pr2 .px')).includes('¢'), 'no quote: no price is shown in lists');
await click('.pr2 .px', 0); ok(await exists('.sheet.pd6 .nq'), 'no quote: contract shows the unavailable state'); ok(!(await exists('.sheet.pd6 .fee')), 'no quote: fee and break-even are hidden'); ok((await text('.sheet.pd6 .nq')).includes('Price unavailable right now'), 'no quote: exact wording');
await click('.nq [data-act="retry"]', 0); ok(await exists('.sheet.pd6 .fee'), 'no quote: Retry restores the contract with fee and break-even'); await back();
// no freshness UI anywhere
const html = await page.evaluate(() => document.getElementById('phone').innerText + ' ' + document.getElementById('phone').innerHTML.length);
await root('pdlist'); await click('.pr2 .px', 0); const sheetText = await text('.sheet.pd6'); ok(!/stale|updated|ago|fresh|\d+ ?(s|sec|min) old/i.test(sheetText), 'contract sheet carries no freshness or age text', sheetText.slice(0, 200));

/* ---- the guided journeys complete themselves when the right destinations open */
await page.evaluate(() => PE.startJourney('j2')); await page.waitForTimeout(80);
ok((await page.locator('#coach').isVisible()) && (await page.locator('#coach').innerText()).includes('Step 1 of 4'), 'guide: journey starts with step 1 of 4');
await click('.gl[data-go="game:26OCT26DALPHI"]', 0); await click('.tabs a', 2); await click('.tug .tv > div', 1);
ok(await page.evaluate(() => PE.S.jstep) === 3, 'guide: three steps complete on their own', String(await page.evaluate(() => PE.S.jstep)));
await back(); ok(await page.evaluate(() => PE.S.jstep) === 4 && (await page.locator('#coach').innerText()).includes('Journey complete'), 'guide: Back completes the journey and says so');
await page.evaluate(() => { PE.S.saved = PE.seedSaved(); PE.startJourney('j5'); }); await click('.savedc b', 0); ok(await page.evaluate(() => PE.S.jstep) === 1, 'guide: saved-research journey advances when the exact state opens');
await page.evaluate(() => PE.endJourney());
/* ---- phone-width page: no horizontal overflow, the phone scales to fit */
for (const [w, h] of [[390, 844], [360, 740], [430, 932], [1200, 800]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(80); const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, pw: document.getElementById('phone').getBoundingClientRect().width })); ok(m.sw <= m.iw + 1, `layout: no horizontal overflow at ${w}px`, J(m)); ok(m.pw <= m.iw, `layout: phone fits at ${w}px`, J(m)); }
ok(errs.length === 0, 'no page errors', errs.join(' | '));
console.log(out.join('\n') || 'no failures'); console.log(`${pass} passed, ${fail} failed`);
await b.close(); process.exit(fail ? 1 : 0);
