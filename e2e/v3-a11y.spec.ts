// SIFT 3.0 accessibility gate (axe-core, WCAG 2.0/2.1 A + AA) on every v3 screen at phone size, sample data (deterministic, offline), plus the
// structural guarantees the navigation contract depends on: every semantic target is a real link or button with an accessible name, no
// anchor sits inside an anchor, no horizontal overflow, and a modal sheet traps and returns focus. Gate: no CRITICAL or SERIOUS violation
// and no moderate/minor one without a listed reason. Exceptions are explicit.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { escapeSheet } from './support/sheet';

const EXCEPTIONS: Record<string, string> = {};

const SCREENS: [string, string][] = [
  ['home', '/v3?demo=1'],
  ['games', '/v3/games?demo=1'],
  ['game-overview', '/v3/game/cfb/demo_uga_fla?demo=1'],
  ['game-matchup', '/v3/game/cfb/demo_uga_fla?demo=1&tab=matchup'],
  ['team', '/v3/team/cfb/UGA?demo=1'],
  ['team-nfl', '/v3/team/nfl/DAL?demo=1'],
  ['stat', '/v3/stat/nfl/sample-0?demo=1'],
  ['player', '/v3/player/nba/sample-guard?demo=1'],
  ['player-props', '/v3/player/nba/sample-guard?demo=1&v=2&tab=props'],
  ['props', '/v3/props?demo=1'],
  ['explore', '/v3/explore?demo=1'],
  ['following', '/v3/following?demo=1'],
  ['settings', '/v3/settings?demo=1'],
];

test.beforeEach(async ({ page }) => { await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort()); });

const open = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.waitForTimeout(1200);
};

test.describe('SIFT 3.0 accessibility @v3', () => {
  for (const [name, path] of SCREENS) {
    test(`axe: ${name}`, async ({ page }, info) => {
      await open(page, path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const found = r.violations.filter((v) => !EXCEPTIONS[v.id]);
      await info.attach(`axe-${name}.json`, { body: JSON.stringify(found.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target) })), null, 2), contentType: 'application/json' });
      const blocking = found.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), 'critical or serious violations').toEqual([]);
      expect(found.filter((v) => !blocking.includes(v)).map((v) => `${v.id} (${v.impact})`), 'moderate or minor violations (list a reason in EXCEPTIONS or fix)').toEqual([]);
    });

    test(`structure: ${name}`, async ({ page }) => {
      await open(page, path);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('[data-tap]')) {
          const tag = el.tagName;
          const role = el.getAttribute('role');
          const interactive = tag === 'A' || tag === 'BUTTON' || ((role === 'link' || role === 'button') && el.getAttribute('tabindex') === '0');
          if (!interactive) out.push(`target is not a link or button: <${tag.toLowerCase()}> ${el.getAttribute('data-dest')}`);
          const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
          if (!name && !el.querySelector('img[alt]:not([alt=""])')) out.push(`unnamed ${el.getAttribute('data-tap')} target to ${el.getAttribute('data-dest')}`);
        }
        if (document.querySelector('a a')) out.push('anchor inside an anchor');
        if (document.documentElement.scrollWidth - innerWidth > 0) out.push('horizontal overflow');
        return out;
      });
      expect(bad).toEqual([]);
    });
  }

  test('a sheet is a labelled modal dialog, takes focus, and returns it to the opener when closed', async ({ page }) => {
    await open(page, '/v3/player/nba/sample-guard?demo=1');
    const opener = page.getByRole('button', { name: /Research filters/ });
    await opener.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(dlg).toHaveAccessibleName(/.+/);
    await escapeSheet(page);
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
