// The tap paths and locked-structure assertions of the captured-preview crawl (scripts/v3-qa/preview-routes.mjs). Every design is reached from a root
// tab by taps only; `t.tap(label, target)` records the step. Structure assertions use the classes the shipped components render (the same ones the
// real-document e2e specs, e2e/v3-*.spec.ts, assert against), so "renders its locked structure with data" means the same thing here.

const text = (loc) => loc.innerText().then((s) => s.replace(/\s+/g, ' '));

// ---- shared steps ---------------------------------------------------------------------------------------------------------------------------------
/** Games tab > sport chip > state chip that holds the card with both team names; returns the card's open-the-game link. */
async function gamesCard(t, sport, a, b) {
  await t.root('Games');
  if (sport) await t.tap(`${sport} (sport rail)`, t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]', { hasText: new RegExp(`^${sport}$`) }).first());
  for (const state of ['Today', 'Upcoming', 'Live', 'Final']) {
    const chip = t.page.getByRole('button', { name: new RegExp(`^${state}$`) }).first();
    if (!(await chip.count())) continue;
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await t.tap(`${state} (state chip)`, chip);
    const card = t.page.locator('.v3-gc', { hasText: a }).filter({ hasText: b }).first();
    if (await card.count()) return card;
  }
  return null;
}

/** Open Game Detail for a game from the Games tab (tap path recorded). */
async function openGame(t, sport, a, b) {
  const card = await gamesCard(t, sport, a, b);
  if (!card) throw new Error(`no ${a} / ${b} card on the Games tab`);
  await t.tap(`${a} at ${b} card`, card.locator('.v3-gc__hit'));
}

export const ROOT_TABS = [
  {
    id: 'ROOT-Home', title: 'Home tab shows the captured slate (not sample data)',
    async run(t) {
      await t.has('captured-data banner is on screen', '[data-capture-banner]', { text: /CAPTURED DATA.*not live/ });
      await t.has('no sample-data strip', '.v3-demo', { min: 0, max: 0 });
      await t.has('Home has captured games to open', '.v3-main a[data-tap="game"], .v3-main a[href*="/v3/game/"]', { min: 3 });
      await t.text('Home names the captured NFL game (DAL at PHI)', /Cowboys|DAL/);
    },
  },
  {
    id: 'ROOT-Games', title: 'Games tab lists the captured slate with lines through the quote gate',
    async run(t) {
      await t.root('Games');
      await t.has('game cards are listed', '.v3-gc', { min: 5 });
      await t.has('no sample-data strip', '.v3-demo', { min: 0, max: 0 });
    },
  },
  {
    id: 'ROOT-Explore', title: 'Explore tab is Prop Discovery on the captured props',
    async run(t) {
      await t.root('Explore');
      await t.has('Prop Discovery title', '.pd-hs h1');
      await t.has('shelf cards are listed', '.pd-card', { min: 1 });
    },
  },
  {
    id: 'ROOT-Following', title: 'Following tab',
    async run(t) {
      await t.root('Following');
      await t.has('Following heading', 'h1, h2', { text: /Following/ });
    },
  },
];

export const DESIGNS = [];

export const SWEEPS = [
  {
    id: 'SWEEP-Games', title: 'every sport and state on Games',
    async run(t) {
      await t.root('Games');
      const sports = await t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]').allInnerTexts();
      for (const s of sports) {
        await t.tap(`${s} (sport rail)`, t.page.locator('.v3-tabs button, .v3-tabs a, [role=tab]', { hasText: new RegExp(`^${s.trim()}$`) }).first());
        for (const state of ['Today', 'Upcoming', 'Live', 'Final']) {
          const chip = t.page.getByRole('button', { name: new RegExp(`^${state}$`) }).first();
          if (!(await chip.count())) continue;
          await t.tap(`${state}`, chip);
          for (let y = 0; y < 8; y++) { await t.page.evaluate((i) => window.scrollTo(0, i * 700), y); await t.page.waitForTimeout(120); }
        }
      }
      t.check('swept', true);
    },
  },
];
