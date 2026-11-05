import { test, expect } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';
const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
test.setTimeout(120000);
test('shots', async ({ page }) => {
  await useRealFeeds(page, { family: 'game' });
  await freshQuotes(page, { family: 'game' });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow('game'));
  await page.addInitScript(() => { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); });
  const out = process.env.SHOTS ?? 'before';
  for (const [name, q] of [['overview', ''], ['matchup', '?tab=matchup'], ['matchup-chart', '?tab=matchup&chart=1'], ['stats', '?tab=stats'], ['script', '?tab=script'], ['props', '?tab=props']]) {
    await page.goto(`./#${GAME}${q}`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `/tmp/claude-0/-home-user-sift-sports-intelligence/a34f9784-8cab-58a4-9796-547560af068d/scratchpad/${out}-${name}.png`, fullPage: true });
  }
});
