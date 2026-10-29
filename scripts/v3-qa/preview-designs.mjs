// The tap paths and locked-structure assertions of the captured-preview crawl (scripts/v3-qa/preview-routes.mjs). Every design is reached from a root
// tab by taps only; `t.tap(label, target)` records the step. Structure assertions use the classes the shipped components render (the same ones the
// real-document e2e specs, e2e/v3-*.spec.ts, assert against), so "renders its locked structure with data" means the same thing here.
// A design whose real state needs data the capture lacks is reached in the state the capture supports, and `t.notes` says what the preview shows.

const flat = (s) => s.replace(/\s+/g, ' ');
/** The open part of a game card (its header), clear of the lines box, the star and the bell: where a thumb opens the game. */
const CARD_BODY = { click: { position: { x: 40, y: 14 } } };
const dialog = (t, name) => t.page.getByRole('dialog', name ? { name } : {});

// ---- shared steps ---------------------------------------------------------------------------------------------------------------------------------
/** Games tab > sport chip > the state chip that holds the card carrying both team names. Returns the card, or null. */
async function gamesCard(t, sport, a, b) {
  await t.root('Games');
  if (sport) await t.tap(`${sport} (sport rail)`, t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]', { hasText: new RegExp(`^${sport}$`) }).first());
  for (const state of ['Today', 'Upcoming', 'Live', 'Final']) {
    const chip = t.page.getByRole('button', { name: new RegExp(`^${state}( \\d+)?$`) }).first();
    if (!(await chip.count())) continue;
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await t.tap(`${state} (state chip)`, chip);
    const card = t.page.locator('.v3-gc', { hasText: a }).filter({ hasText: b }).first();
    if (await card.count()) return card;
  }
  return null;
}

/** Games > NFL > the DAL at PHI card > Game Detail. */
async function nflGame(t) {
  const card = await gamesCard(t, 'NFL', 'Cowboys', 'Eagles');
  if (!card) throw new Error('no Cowboys / Eagles card on the Games tab');
  await t.tap('Cowboys at Eagles card', card.locator('.v3-gc__hit'), CARD_BODY);
  await t.has('Game Detail is open on its Overview', '.v3-gd', { min: 1 });
}

/** Home > Game Center (the featured game's button) > Game Detail. */
async function homeGame(t) {
  await t.tap('Game Center (Home)', t.page.getByRole('link', { name: /Game Center/ }).first());
  await t.has('Game Detail is open on its Overview', '.v3-gd', { min: 1 });
}

/** On Game Detail: the player link of one named player (the Key players / Players to research rows). */
async function openPlayer(t, id, label) {
  await t.tap(label, t.page.locator(`a[data-tap="player"][data-dest*="${id}"]`).first());
  await t.has('Player Research opened', '.v3p-hero h1', { min: 1 });
}
const LAMB = 'prt_4c661ae8b854ff5f66dd';

/** Game Detail > Team (header logo) > Team Research of that team code. */
async function openTeam(t, slug, code, label) {
  await t.tap(label ?? `${code} logo`, t.page.locator(`a[data-tap="team"][data-dest="/v3/team/${slug}/${code}"]`).first());
  await t.has('Team Research opened', '.tm-hero h1', { min: 1 });
}

async function touchDrag(page, from, dy, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + (dy * i) / steps }] });
  return { end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) };
}

/** Tap the open part of a Prop Discovery row (below the price pill, clear of every link on it): the row's own button, as a thumb would. */
async function tapRow(t, label, row) {
  await row.scrollIntoViewIfNeeded();
  const hit = row.locator('.pd-row__hit');
  const b = await hit.boundingBox();
  t.path.push(label);
  await hit.click({ position: { x: Math.max(8, b.width - 34), y: Math.max(8, b.height - 14) } });
  await t.page.waitForTimeout(500);
}

async function propsHome(t) { await t.root('Explore'); await t.has('Prop Discovery home', '.pd-home .pd-h__tt'); }
async function propsList(t) { await propsHome(t); await t.tap('See all (SIFT model published shelf)', t.page.locator('a.pd-seeall').first()); await t.has('the list opened', '.pd-list .pd-row', { min: 5 }); }

export const ROOT_TABS = [
  {
    id: 'ROOT-Home', from: 'Home', title: 'Home tab shows the captured slate (not sample data)',
    async run(t) {
      await t.has('captured-data banner says captured, date, not live', '[data-capture-banner]', { text: /CAPTURED DATA.*26 Oct 2026.*prices as captured, not live/ });
      await t.has('no sample-data strip', '.v3-demo', { min: 0, max: 0 });
      await t.has('Home has captured games to open', '.v3-main a[data-tap="game"], .v3-main a[href*="/v3/game/"]', { min: 3 });
      await t.text('Home names the captured NFL game (Cowboys at Eagles)', /Cowboys/);
      await t.has('About sheet opens from the banner', '[data-capture-about]', { min: 1 });
      await t.tap('About (banner)', '[data-capture-about]');
      await t.has('About this capture sheet is open', '[data-capture-sheet]', { text: /About this capture.*What is real.*What is transformed.*What is not captured/i });
      await t.tap('Close (About sheet)', t.page.locator('[data-capture-sheet] button', { hasText: 'Close' }));
    },
  },
  {
    id: 'ROOT-Games', from: 'Games', title: 'Games tab lists the captured slate with lines through the quote gate',
    async run(t) {
      await t.root('Games');
      await t.has('game cards are listed', '.v3-gc', { min: 5 });
      await t.has('no sample-data strip', '.v3-demo', { min: 0, max: 0 });
      const card = await gamesCard(t, 'NFL', 'Cowboys', 'Eagles');
      t.check('the Cowboys at Eagles card shows its Kalshi lines (cents, through the gate with the pinned clock)', !!card && /\d+¢/.test(flat(await card.innerText())), card ? flat(await card.innerText()).slice(0, 120) : 'no card');
    },
  },
  {
    id: 'ROOT-Explore', from: 'Explore', title: 'Explore tab is Prop Discovery on the captured props',
    async run(t) {
      await propsHome(t);
      await t.has('shelf cards are listed', '.pd-card', { min: 1 });
      await t.has('prices appear on cards (cents)', '.pd-card .pd-px', { text: /\d+¢/ });
    },
  },
  {
    id: 'ROOT-Following', from: 'Home', title: 'Following tab: save from Player Research, then open the saved state',
    async run(t) {
      await t.root('Home');
      await homeGame(t);
      await openPlayer(t, LAMB, 'CeeDee Lamb (Players to research)');
      await t.tap('Save this research (bookmark)', t.page.getByRole('button', { name: /^Save this research/ }).first());
      await t.root('Following');
      await t.has('Following heading', 'h1, h2', { text: /Following/ });
      await t.has('the saved research is listed', '.v3-main a[data-dest*="/v3/player/"], .v3-main a[href*="/v3/player/"]', { min: 1 });
      await t.tap('the saved Lamb item', t.page.locator('.v3-main a[data-dest*="/v3/player/"], .v3-main a[href*="/v3/player/"]').first());
      await t.has('it reopens Player Research', '.v3p-hero h1', { text: /Lamb/ });
    },
  },
];

export const DESIGNS = [
  // ---------------------------------------------------------------- Player Research (from Home)
  {
    id: 'P1', title: 'Player overview, chart first', from: 'Home',
    async run(t) {
      await homeGame(t);
      await openPlayer(t, LAMB, 'CeeDee Lamb (Players to research)');
      await t.has('hero: name and team', '.v3p-hero h1', { text: /Lamb/ });
      await t.has('game strip: at PHI', '.v3p-strip-g', { text: /at PHI/ });
      await t.has('five tabs (Overview, Props, Matchup, Trends, Log)', '[role=tab]', { min: 5, max: 5 });
      await t.has('decision card: line and the Over price', '.v3p-dl__r .p', { text: /Over \d+¢/ });
      await t.has('three evidence lanes: Market, History, SIFT model', '.x-trio > *', { min: 3, max: 3 });
      await t.has('five window chips', '[data-win]', { min: 5, max: 5 });
      await t.has('chart with ten bars', '.v3p-hb__bar', { min: 10 });
      await t.has('summary strip with the hit rate', '.v3p-sum', { text: /Hit rate/ });
    },
  },
  {
    id: 'P2', title: 'Drag the line, compare every rung', from: 'Home',
    async run(t) {
      t.notes.push('The SIFT lane shows a dash on every rung the model does not publish (it publishes three), as the design locks.');
      await homeGame(t);
      await openPlayer(t, LAMB, 'CeeDee Lamb (Players to research)');
      const grab = t.page.locator('.v3p-hb__grab');
      await grab.scrollIntoViewIfNeeded();
      const before = await grab.getAttribute('aria-valuenow');
      const bb = await grab.boundingBox();
      t.path.push('touch-drag the dashed line');
      const drag = await touchDrag(t.page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }, 70);
      await t.page.waitForTimeout(400);
      await t.has('the readout replaces the window chips while dragging (Market, History, SIFT model)', '.v3p-readout', { text: /Market.*History.*SIFT model/ });
      const now = await grab.getAttribute('aria-valuenow');
      t.check('the line moved to another listed rung', before !== now && Number(now) % 1 === 0.5, `${before} -> ${now}`);
      await drag.end();
      await t.page.waitForTimeout(500);
      await t.has('release commits the line (window chips return)', '.v3p-wins', { min: 1 });
      await t.has('the ladder lists every rung with its three lanes', '.v3p-ladder .v3p-lr', { min: 3 });
      const rung = t.page.locator('.v3p-ladder .v3p-lr').nth(1);
      await t.tap('a ladder rung', rung);
      await t.has('exactly one rung is marked', '.v3p-lr[aria-pressed="true"]', { min: 1, max: 1 });
      await t.tap('Alt lines (chevron on the decision card)', t.page.getByRole('button', { name: 'Alt lines' }).first());
      await t.has('the alt-lines sheet lists every rung', '[role=dialog] .v3p-lr', { min: 3 });
    },
  },
  {
    id: 'P3', title: 'Research builder: cut the sample before you trust it', from: 'Home',
    async run(t) {
      await homeGame(t);
      await openPlayer(t, LAMB, 'CeeDee Lamb (Players to research)');
      await t.tap('Research filters', t.page.getByRole('button', { name: /^Research filters/ }).first());
      const dlg = dialog(t, 'Research filters');
      t.check('the filters sheet is open', (await dlg.count()) === 1);
      await t.has('live card: how many games match', '[role=dialog] .v3p-live', { text: /games? match/ });
      const away = dlg.getByRole('button', { name: /^Away/ });
      t.check('Away option shows n and hits (n 5 · 2/5 style)', /n \d+ · \d+\/\d+/.test(flat(await away.innerText())), flat(await away.innerText()));
      await t.tap('Away (draft filter)', away);
      t.check('locked rows are notes, not controls (Teammate out, Weather, Pace, Favorite)', (await dlg.getByRole('note').count()) >= 4);
      await t.tap('Show N games (apply)', dlg.getByRole('button', { name: /^Show \d+ games?/ }));
      await t.has('the screen lands with a removable filter chip', '.v3p-fchip', { min: 1 });
    },
  },
  {
    id: 'P4', title: 'Matchup tab: why the projection says what it says', from: 'Home',
    async run(t) {
      await homeGame(t);
      await openPlayer(t, LAMB, 'CeeDee Lamb (Players to research)');
      await t.sub('Matchup');
      await t.has('opportunity chain (how the projection builds)', '.v3p-chain', { min: 1 });
      await t.has('the opposing unit on a league strip (28 dots)', '.mx-strip__dot', { min: 28 });
      await t.has('the locked row for position-level defense', '.x-lock', { min: 1 });
    },
  },
  // ---------------------------------------------------------------- Game (from Home)
  {
    id: 'G1', title: 'Matchup: offense against defense, both ways', from: 'Home',
    async run(t) {
      t.notes.push('Shown on Cowboys at Eagles, a game still to be played at the capture instant. A game in play is not captured (the score feed is off), so the live variants of G1 to G3 are not shown.');
      await homeGame(t);
      await t.sub('Matchup');
      await t.has('direction control with the tilt summary', '.mx-sg', { min: 2 });
      await t.has('unit rows: league-percentile tracks with offense and defense markers', '[data-testid=tug-rows] .mx-tug', { min: 5 });
      await t.has('each row has a tilt pill', '.mx-tilt', { min: 5 });
      await t.has('SIFT Lens is on the screen', '[data-testid=sift-lens]', { min: 1 });
    },
  },
  {
    id: 'G2', title: 'One unit, in depth', from: 'Home',
    async run(t) {
      await homeGame(t);
      await t.sub('Matchup');
      await t.tap('Passing unit row', t.page.locator('.v3-navrow.mx-tug').nth(1).locator('.v3-navrow__main'), { click: { position: { x: 40, y: 14 } } });
      await t.has('expanded unit', '[data-testid=unit-view]', { min: 1 });
      await t.has('both teams on the full-league strip (28 dots)', '.mx-strip__dot', { min: 28 });
      await t.has('both teams\' strips: offense and defense', '[data-testid=unit-view] .mx-sl', { min: 2, max: 2 });
      await t.has('recent form', '[data-testid=unit-form]', { min: 1 });
      await t.has('where this shows up (markets and props)', '[data-testid=unit-markets]', { min: 1 });
      await t.has('the weekly-trend lock is stated', '[data-testid=unit-view] .x-lock', { text: /Weekly trend is locked/ });
    },
  },
  {
    id: 'G3', title: 'Lens, game shape, key matchups, context', from: 'Home',
    async run(t) {
      await homeGame(t);
      await t.sub('Matchup');
      const lens = t.page.getByTestId('sift-lens');
      t.check('Lens opens collapsed with the widest gap and the counter-case', /Widest gap:/.test(flat(await lens.innerText())) && /Counter-case:/.test(flat(await lens.innerText())) && (await lens.locator('.mx-evid').count()) === 0);
      await t.tap('SIFT Lens header (expand)', lens.locator('.mx-lh'));
      await t.has('Lens expanded: three evidence rows', '[data-testid=sift-lens] .mx-evr', { min: 3, max: 3 });
      await t.text('the +-15 heuristic is described as descriptive', /descriptive visual heuristic/, '[data-testid=sift-lens]');
      await t.has('game shape (approved projection or the reason it is absent)', '[data-testid=game-shape]', { min: 1 });
      await t.has('key matchups link a player to the unit it faces, with its own price', '[data-testid=key-matchups] .mx-km', { min: 1 });
      await t.has('key matchup price (cents)', '[data-testid=key-matchups] .mx-kp', { text: /\d+¢/ });
    },
  },
  // ---------------------------------------------------------------- Prop Discovery (from Explore)
  {
    id: 'PD1', title: 'Discover: what is interesting today', from: 'Explore',
    async run(t) {
      t.notes.push("The counts in the title are the captured day's (the whole slate), not the mockup's own day.");
      await propsHome(t);
      await t.has('title with the real universe (props, contracts)', '.pd-h__sub', { text: /\d+ games?.*\d+ props.*\d+ contracts/ });
      await t.has('search field', '.pd-field', { min: 1 });
      await t.has('sport rail with counts', '.pd-rail .v3-tap', { min: 3 });
      await t.has('statistic chips across families', '.pd-fams .v3-tap', { min: 5 });
      await t.has('shelves curated by rule: SIFT model published; Facing a bottom-3 defense', '.pd-shelf', { min: 2 });
      await t.has('cards carry three lanes, opponent chip and the ask', '.pd-card .pd-lanesL', { min: 1 });
      await t.has('card ask in cents', '.pd-card .pd-px', { text: /\d+¢/ });
    },
  },
  {
    id: 'PD2', title: 'All props: sort and browse the whole universe', from: 'Explore',
    async run(t) {
      await propsList(t);
      await t.has('sort and filter controls', '.pd-ctrl .pd-btn', { min: 2 });
      await t.has('active filter chips are removable', '.pd-act', { min: 1 });
      await t.has('lane legend', '.pd-leg', { min: 1 });
      await t.has('rows carry player, the three lanes and the ask', '.pd-row .pd-px', { min: 5 });
      await t.has('default sort is Soonest', '.pd-btn--sort', { text: /Soonest/ });
    },
  },
  {
    id: 'PD3', title: 'Peek: depth without leaving the list', from: 'Explore',
    async run(t) {
      await propsList(t);
      await tapRow(t, 'a prop row (expand in place)', t.page.locator('.pd-row').first());
      await t.has('the row expands in place (peek)', '.pd-peek', { min: 1 });
      await t.has('actions: Research, Contract, bookmark', '.pd-acts a, .pd-acts button', { min: 2 });
    },
  },
  {
    id: 'PD4', title: 'Sort and filter the entire universe', from: 'Explore',
    async run(t) {
      await propsList(t);
      await t.tap('Sort and filters', t.page.getByRole('button', { name: /Open sort and filters/ }).first());
      const dlg = dialog(t, 'Sort and filter');
      t.check('the Sort and filter sheet is open', (await dlg.count()) === 1);
      await t.has('live count of matching props', '[role=dialog]', { text: /props? match/ });
      await t.has('sort options (Soonest, Price, History, SIFT model, Matchup, Volume)', '[role=dialog] button', { min: 6 });
      await t.has('facets SIFT cannot support are visible but locked', '[role=dialog] .x-lock, [role=dialog] [role=note]', { min: 1 });
      await t.tap('Apply', dlg.getByRole('button', { name: /^(Show|Apply)/ }).first());
      await t.has('back on the list', '.pd-list', { min: 1 });
    },
  },
  {
    id: 'PD5', title: 'Compare props side by side', from: 'Explore',
    async run(t) {
      await propsList(t);
      await t.tap('Compare (tick mode)', t.page.getByRole('button', { name: /^Compare/ }).first());
      const rows = t.page.locator('.pd-row');
      await tapRow(t, 'tick the first row', rows.nth(0));
      await tapRow(t, 'tick the second row', rows.nth(1));
      await tapRow(t, 'tick the third row', rows.nth(2));
      await t.has('compare tray says 3 selected', '.pd-tray', { text: /3 selected/ });
      await t.tap('Compare in the tray', t.page.locator('.pd-tray a.pd-abtn--pri'));
      await t.has('three columns', '.pd-crow--hd .pd-cell', { min: 3, max: 3 });
      await t.has('rows in lane order (Market, History, SIFT model, Opponent, Status)', '.pd-crow .pd-cap', { min: 5 });
      await t.has('Contract under every column', '.pd-crow--acts .pd-cell a[data-tap="price"]', { min: 3 });
    },
  },
  {
    id: 'PD6', title: 'The exact contract', from: 'Explore',
    async run(t) {
      await propsHome(t);
      await t.tap('a card price pill', t.page.locator('.pd-card a.pd-px[data-tap="price"]').first());
      const dlg = dialog(t, 'Exact contract');
      t.check('the Exact contract sheet is open', (await dlg.count()) === 1);
      await t.has('ticker, ask and bid', '[role=dialog] [data-state="price"]', { min: 1 });
      await t.has('taker fee and break-even rows', '[role=dialog] [data-state="fee"]', { min: 1 });
      await t.text('no bet buttons: the disclaimer says SIFT shows none', /bet|place|order/i, '[role=dialog]');
    },
  },
  // ---------------------------------------------------------------- Team (from Games)
  ...teamDesigns(),
  ...statDesigns(),
];

function teamDesigns() {
  const open = async (t) => { await nflGame(t); await openTeam(t, 'nfl', 'DAL', 'Dallas logo (Game Detail header)'); };
  return [
    {
      id: 'TR1', title: 'Overview: what kind of team is this?', from: 'Games',
      async run(t) {
        await open(t);
        await t.has('hero with the record from completed games', '.tm-hero .tm-rec', { text: /\d+–\d+/ });
        await t.has('next game strip', '.tm-gstrip', { min: 1 });
        await t.has('props today link', '.tm-prow[data-tap="props"]', { min: 1 });
        await t.has('Identity card: offense against defense on league tracks', '.tm-idt .idr', { min: 4 });
        await t.has('highest and lowest ranked statistics', '.tm-exc .exr', { min: 2 });
        await t.has('last six margins', '.tm-mb__hit', { min: 6 });
      },
    },
    {
      id: 'TR2', title: 'Profile: how it compares, and what changed', from: 'Games',
      async run(t) {
        await open(t);
        await t.sub('Profile');
        await t.has('Raw / opponent-adjusted switch', '[role=group][aria-label="Statistic basis"]', { min: 1 });
        await t.has('statistic rows with value, rank and the 34-game ghost marker', '.tm .prr', { min: 6 });
        await t.has('Show all offense and defense stats', 'button:has-text("Show all")', { min: 1 });
      },
    },
    {
      id: 'TR3', title: 'Form: results, margins, splits', from: 'Games',
      async run(t) {
        await open(t);
        await t.sub('Form');
        await t.has('margin chart', '.tm-frm', { min: 1 });
        await t.has('results list', '.tm .res', { min: 3 });
        await t.has('splits', '.tm-spl3', { min: 1 });
        await t.has('locked row: against the spread / over-under needs closing lines', '.tm-lockc, .x-lock', { min: 1 });
      },
    },
    {
      id: 'TR4', title: 'Schedule: who is next, and how strong are they', from: 'Games',
      async run(t) {
        await open(t);
        await t.sub('Schedule');
        await t.has('upcoming opponents with rest days and their unit ranks', '.tm .sch', { min: 2 });
        await t.has('opponent unit chips open the statistic', '.tm .sch .op.o[data-tap="stat"]', { min: 1 });
        await t.has('summary of the opponents (descriptive, not a prediction)', '.tm-sum6', { min: 1 });
      },
    },
    {
      id: 'TR5', title: 'Players: availability and today\'s props', from: 'Games',
      async run(t) {
        await open(t);
        await t.sub('Players');
        await t.has('availability (out and injured reserve)', '.tm-avc', { min: 1 });
        await t.has('skill players with their prop counts', '.tm .plr', { min: 3 });
        await t.has('a skill player opens Player Research', '.tm .plr > a[data-tap="player"]', { min: 1 });
      },
    },
    {
      id: 'TR6', title: 'Overview, hockey (Toronto)', from: 'Games',
      async run(t) {
      t.notes.push('Hockey is Toronto, from the Maple Leafs at Flames game on the captured slate; the record is wins-losses-overtime losses as the design locks.');
        const card = await gamesCard(t, 'NHL', 'Maple Leafs', 'Flames');
        if (!card) throw new Error('no Maple Leafs / Flames card on the Games tab');
        await t.tap('Maple Leafs at Flames card', card.locator('.v3-gc__hit'), CARD_BODY);
        await openTeam(t, 'nhl', 'TOR', 'Toronto logo (Game Detail header)');
        await t.has('hero with a wins-losses-overtime-losses record', '.tm-hero .tm-rec', { text: /\d+–\d+–\d+/ });
        await t.has('next game strip (the league schedule)', '.tm-gstrip', { min: 1 });
        await t.has('Identity card with hockey units (goals for, goals against...)', '.tm-idt .idr', { min: 3 });
      },
    },
  ];
}

function statDesigns() {
  const teamStat = async (t) => {
    await nflGame(t);
    await openTeam(t, 'nfl', 'DAL', 'Dallas logo (Game Detail header)');
    await t.tap('offense block (Identity card)', t.page.locator('.tm-idt .idbig .o[data-tap="stat"]').first());
    await t.has('Stat Detail opened', '.st-hd h1', { min: 1 });
  };
  return [
    {
      id: 'SD1', title: 'Ranking: where does the team stand, and who is around it?', from: 'Games',
      async run(t) {
        await teamStat(t);
        await t.has('statistic name and the universe of 28 teams', '.st-hd small', { text: /28 teams/ });
        await t.has('the selected team\'s card (rank, value, teams ahead of)', '.st-selc', { text: /5th.*of 28 teams/ });
        await t.has('dot plot with the selected team and next opponent', '[data-dotplot] circle[data-role="sel"]', { min: 1 });
        await t.has('ranked list with the selected row highlighted', '.st-rkr.is-sel', { min: 1 });
        await t.has('the next opponent is pinned', '.st-rkr.is-opp', { min: 1 });
      },
    },
    {
      id: 'SD2', title: 'Trend: how has it moved, game by game?', from: 'Games',
      async run(t) {
      t.notes.push("The per-game series is captured for Dallas's points per game, so that is the statistic shown; a statistic with no series opens the rank-path state instead.");
        await nflGame(t);
        await openTeam(t, 'nfl', 'DAL', 'Dallas logo (Game Detail header)');
        await t.sub('Profile');
        await t.tap('Raw (statistic basis)', t.page.getByRole('button', { name: 'Raw', exact: true }).first());
        await t.tap('Show all offense and defense stats', t.page.getByRole('button', { name: /Show all/ }).first());
        await t.tap('Points scored per game (row)', t.page.locator('.tm .prr', { hasText: 'Points scored per game' }).first());
        await t.sub('Trend');
        await t.has('one bar per game', '.st-obs svg [data-obs]', { min: 6 });
        await t.has('a selected observation card with a Game Detail exit and an opponent exit', '.st-obc', { min: 1 });
        await t.has('points per game by season', '.st-seas', { min: 1 });
      },
    },
    {
      id: 'SD3', title: 'Raw versus opponent-adjusted, kept apart', from: 'Games',
      async run(t) {
        await teamStat(t);
        await t.tap('Side by side', t.page.locator('.st-sbs').first());
        await t.has('a raw card and an adjusted card, each its own statistic', '.st-rvc', { min: 2, max: 2 });
        await t.has('the raw card', '.st-rvc.raw', { min: 1 });
        await t.has('the adjusted card', '.st-rvc.adj', { min: 1 });
      },
    },
    {
      id: 'SD4', title: 'Compare teams', from: 'Games',
      async run(t) {
        await teamStat(t);
        await t.sub('Compare');
        await t.has('heading', '.st-hd h1', { text: /Compare teams/ });
        await t.has('eight unit rows (four offense, four defense)', '.st-cr', { min: 8, max: 8 });
        await t.has('two team chips', '.st-wc', { min: 2 });
      },
    },
    {
      id: 'SD5', title: 'Compare players', from: 'Games',
      async run(t) {
      t.notes.push('The two players are CeeDee Lamb and George Pickens, whose game logs are in the capture; a player without a captured log would show the locked state.');
        await teamStat(t);
        await t.sub('Compare');
        await t.tap('Players (mode)', t.page.getByRole('button', { name: 'Players', exact: true }).first());
        for (const [i, who] of ['CeeDee Lamb', 'George Pickens'].entries()) {
          await t.tap(`Add player ${i + 1}`, t.page.getByRole('button', { name: /^Add player/ }).first());
          await t.tap(`pick ${who}`, dialog(t).getByRole('button', { name: new RegExp(`^${who}`) }).first());
        }
        await t.has('heading', '.st-hd h1', { text: /Compare players/ });
        await t.has('last ten games as bars for both players', '.st-pbars', { min: 2, max: 2 });
        await t.has('the table: average, median, best, games at the threshold', '.st-sdcm', { text: /Median/ });
        await t.has('the locked row: player league rank is not published', '.st-olc', { text: /League rank among players is not published/ });
      },
    },
    {
      id: 'SD6', title: 'About: definition, limits and related statistics', from: 'Games',
      async run(t) {
        await teamStat(t);
        await t.sub('About');
        await t.has('the published limits', '.st-li', { min: 1 });
        await t.has('limits disclosure', '.st-lim', { text: /All \d+ limits in full/ });
        await t.has('related statistics with the selected team\'s rank', '.st-relc .v3-navrow__main', { min: 2 });
        await t.has('Team Research chip', '.st-rel2 a[data-tap="team"]', { min: 1 });
      },
    },
    {
      id: 'SD7', title: 'Hockey ranking: power play', from: 'Games',
      async run(t) {
        const card = await gamesCard(t, 'NHL', 'Maple Leafs', 'Flames');
        if (!card) throw new Error('no Maple Leafs / Flames card on the Games tab');
        await t.tap('Maple Leafs at Flames card', card.locator('.v3-gc__hit'), CARD_BODY);
        await openTeam(t, 'nhl', 'TOR', 'Toronto logo (Game Detail header)');
        await t.tap('power-play (special teams) row', t.page.locator('.tm [data-tap="stat"][data-dest*="/v3/stat/nhl/"]', { hasText: /power/i }).first());
        await t.has('Stat Detail opened', '.st-hd h1', { min: 1 });
        await t.has('the window switch (2026–27 / 2025–26)', '.st-chip', { min: 2 });
        await t.has('selected team card in a 32-team universe', '.st-selc', { text: /of 32 teams/ });
        await t.has('dot plot', '[data-dotplot]', { min: 1 });
        await t.has('ranked list with the next opponent', '.st-rkr', { min: 3 });
      },
    },
  ];
}

/** Tap every statistic link on a team page (its tabs), open each statistic's tabs, and come back: records which documents the reachable graph needs. */
async function teamClosure(t, sport, a, b, code) {
  const card = await gamesCard(t, sport, a, b);
  if (!card) throw new Error(`no ${a} / ${b} card`);
  await t.tap(`${a} at ${b} card`, card.locator('.v3-gc__hit'), CARD_BODY);
  await openTeam(t, sport.toLowerCase(), code, `${code} logo (Game Detail header)`);
  const hasTab = async (name) => (await t.page.getByRole('tab', { name: new RegExp(`^${name}`) }).count()) > 0;
  const states = [
    { name: 'Overview', setup: async () => { await t.sub('Overview'); } },
    ...(await hasTab('Profile') ? [
      { name: 'Profile (adjusted)', setup: async () => { await t.sub('Profile'); const adj = t.page.getByRole('button', { name: 'Opponent-adjusted', exact: true }).first(); if (await adj.count()) await t.tap('Opponent-adjusted', adj); const all = t.page.getByRole('button', { name: /Show all/ }).first(); if (await all.count()) await t.tap('Show all', all); } },
      { name: 'Profile (raw)', setup: async () => { await t.sub('Profile'); const raw = t.page.getByRole('button', { name: 'Raw', exact: true }).first(); if (await raw.count()) await t.tap('Raw', raw); const all = t.page.getByRole('button', { name: /Show all/ }).first(); if (await all.count()) await t.tap('Show all', all); } },
    ] : []),
    ...(await hasTab('Schedule') ? [{ name: 'Schedule', setup: async () => { await t.sub('Schedule'); } }] : []),
  ];
  let found = 0; let opened = 0; const seen = new Set();
  for (const st of states) {
    await st.setup();
    const stateHash = await t.hash();
    const dests = await t.page.locator('.tm [data-tap="stat"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-dest')).filter(Boolean))]);
    found += dests.length;
    for (const d of dests) {
      if (seen.has(d)) continue;
      seen.add(d);
      try {
        const link = t.page.locator(`.tm a[data-tap="stat"][data-dest="${d}"]`).first();
        await link.scrollIntoViewIfNeeded({ timeout: 5000 });
        await link.click({ timeout: 5000 });
        await settleQuiet(t);
        opened++;
        for (const tb of ['Trend', 'Compare', 'About']) { const tabEl = t.page.getByRole('tab', { name: new RegExp(`^${tb}`) }).first(); if (await tabEl.count()) { await tabEl.click().catch(() => {}); await settleQuiet(t); } }
      } catch (e) { void e; }
      for (let i = 0; i < 4 && (await t.hash()) !== stateHash; i++) { await t.page.goBack(); await settleQuiet(t); }
    }
  }
  t.notes.push(`${found} statistic links on ${code}'s ${states.map((x) => x.name).join(', ')} were opened by tapping (${opened} distinct), each with its Trend, Compare and About tabs.`);
  t.check(`statistics opened from ${code}`, opened > 0, `${opened} of ${seen.size}`);
}
const settleQuiet = (t) => t.page.waitForTimeout(450);

/** What Game Detail shows for the first game of each sport: a coverage table for the About sheet and the docs (what the capture can open, and what it cannot). */
async function gameCoverage(t) {
  await t.root('Games');
  const sports = (await t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]').allInnerTexts()).map((x) => x.trim()).filter((x) => x && x !== 'All');
  const rows = [];
  for (const sp of sports) {
    await t.root('Games');
    await t.tap(`${sp} (sport rail)`, t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]', { hasText: new RegExp(`^${sp}$`) }).first());
    for (const state of ['Today', 'Upcoming', 'Final']) {
      const chip = t.page.getByRole('button', { name: new RegExp(`^${state}( \\d+)?$`) }).first();
      if (!(await chip.count())) continue;
      await t.tap(state, chip);
      const card = t.page.locator('.v3-gc').first();
      if (!(await card.count())) continue;
      const label = flat(await card.innerText()).slice(0, 60);
      try {
        await t.tap(`${label}`, card.locator('.v3-gc__hit'), CARD_BODY);
        await t.page.waitForTimeout(1200);
        const txt = flat(await t.page.locator('.v3-main').innerText());
        const hasData = !/No Kalshi lines are listed|No win-price contract|not published/i.test(txt);
        rows.push({ sport: sp, state, game: label, opens: hasData, text: hasData ? '' : txt.slice(0, 100) });
        await t.page.goBack(); await settleQuiet(t);
      } catch (e) { rows.push({ sport: sp, state, game: label, opens: false, text: `tap failed: ${String(e.message).split('\n')[0].slice(0, 60)}` }); await t.root('Games'); }
    }
  }
  t.notes.push(`Game Detail coverage by sport and state: ${rows.map((r) => `${r.sport}/${r.state} ${r.opens ? 'opens with its game documents' : `opens from the slate row only ("${r.text.slice(0, 60)}")`}`).join('; ')}.`);
  t.check('coverage recorded', rows.length > 0, `${rows.length} games tried`);
}

export const SWEEPS = [
  { id: 'SWEEP-GameCoverage', title: 'what Game Detail shows for the first game of each sport and state', run: gameCoverage },
  { id: 'SWEEP-TeamsNFL', title: 'every statistic reachable from Dallas', run: (t) => teamClosure(t, 'NFL', 'Cowboys', 'Eagles', 'DAL') },
  { id: 'SWEEP-TeamsNHL', title: 'every statistic reachable from Toronto', run: (t) => teamClosure(t, 'NHL', 'Maple Leafs', 'Flames', 'TOR') },
  {
    id: 'SWEEP-Games', title: 'every sport and state on Games (assets the lists show)',
    async run(t) {
      await t.root('Games');
      const sports = (await t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]').allInnerTexts()).map((s) => s.trim());
      for (const s of sports) {
        await t.tap(`${s} (sport rail)`, t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]', { hasText: new RegExp(`^${s}$`) }).first());
        for (const state of ['Today', 'Upcoming', 'Live', 'Final']) {
          const chip = t.page.getByRole('button', { name: new RegExp(`^${state}( \\d+)?$`) }).first();
          if (!(await chip.count())) continue;
          await t.tap(`${state}`, chip);
          for (let y = 0; y < 8; y++) { await t.page.evaluate((i) => window.scrollTo(0, i * 700), y); await t.page.waitForTimeout(120); }
        }
      }
      t.check('swept', true);
    },
  },
];

/**
 * States of the preview itself (not among the 26 designs). "Demo: no reliable quote" skips the observation re-stamp, so the app's own quote gate
 * withholds every captured price: lists print a dash, the exact-contract sheet says "Price unavailable right now" with Retry. Run last: it restores the switch.
 */
export const STATES = [
  {
    id: 'STATE-NoQuote', from: 'Home', title: 'Demo: no reliable quote (the real withheld-price path)',
    async run(t) {
      await t.tap('About (banner)', '[data-capture-about]');
      const box = t.page.locator('[data-capture-noquote]');
      path_note(t, 'tick "Demo: no reliable quote" (the page reloads)');
      await Promise.all([t.page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}), box.click()]);
      await t.page.waitForSelector('[data-capture-banner]', { timeout: 30_000 });
      await t.has('the banner says DEMO: no reliable quote', '[data-capture-banner]', { text: /DEMO: no reliable quote/ });
      const card = await gamesCard(t, 'NFL', 'Cowboys', 'Eagles');
      t.check('the Cowboys at Eagles card prints no price (dash) while the demo is on', !!card && !/\d+¢/.test(flat(await card.innerText())), card ? flat(await card.innerText()).slice(0, 140) : 'no card');
      await propsHome(t);
      await t.has('cards print a dash for the withheld price', '.pd-card a.pd-px[data-tap="price"]', { text: /—/ });
      await t.tap('a withheld price pill', t.page.locator('.pd-card a.pd-px[data-tap="price"]').first());
      await t.has('the contract sheet says Price unavailable right now', '[role=dialog] [data-state="unavailable"]', { text: /Price unavailable right now/ });
      await t.has('with Retry', '[role=dialog] button', { min: 1 });
      t.check('the fee and break-even rows are hidden', (await t.page.locator('[role=dialog] [data-state="fee"]').count()) === 0);
      await t.page.goBack(); await t.page.waitForTimeout(500);
      await t.tap('About (banner)', '[data-capture-about]');
      path_note(t, 'untick the demo (the page reloads)');
      await Promise.all([t.page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}), t.page.locator('[data-capture-noquote]').click()]);
      await t.page.waitForSelector('[data-capture-banner]', { timeout: 30_000 });
      await t.has('the banner no longer says DEMO', '[data-capture-banner]', { text: /^((?!DEMO).)*$/ });
    },
  },
];
const path_note = (t, label) => t.path.push(label);
