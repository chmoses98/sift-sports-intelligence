import { test, expect, NOW, noHorizontalOverflow } from './fixtures';
import { writeFileSync } from 'node:fs';
// San Francisco's published home game uses its verified venue and available approved player photographs.
const MIN = 'evt_8e764f246d2916e5a347';
test.use({ timezoneId: 'America/Chicago' });
test('matched reference captures and density measurements @smoke', async ({ page, isMobile }) => {
  await page.clock.install({ time: NOW });
  await page.setViewportSize(isMobile ? { width:390, height:1165 } : { width:1536, height:1024 });
  await page.goto(`#/design/sift2/games?game=${MIN}`);
  await expect(page.locator('.s2-games__lead .hart__photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noHorizontalOverflow(page,'Matched Games');
  await page.screenshot({ path:test.info().outputPath('matched-games.png'),scale:'css' });
  await page.goto(`#/design/sift2/nfl/game/${MIN}`);
  await expect(page.locator('.s2-command-overview')).toBeVisible();
  await expect(page.locator('.sift2-command .hart__photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await noHorizontalOverflow(page,'Matched Command');
  const metrics = await page.evaluate(() => Object.fromEntries(['.s2-broadcast','.sift2-command>.gtabs','.s2-read','.s2-scripts','.s2-drivers','.s2-featured-players'].map((s)=>{const r=document.querySelector(s)!.getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
  writeFileSync(test.info().outputPath('matched-geometry.json'),JSON.stringify(metrics,null,2));
  await page.screenshot({ path:test.info().outputPath('matched-overview.png'),scale:'css' });
  await page.screenshot({ path:test.info().outputPath('matched-overview-full.png'),fullPage:true,scale:'css' });
  await page.locator('.sift2-command>.gtabs').getByRole('link',{name:'Players',exact:true}).click();
  await expect(page.locator('.s2-player-list .s2-player').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
  await noHorizontalOverflow(page,'Matched Players');
  await page.screenshot({ path:test.info().outputPath('matched-players.png'),scale:'css' });
  // Archive example proves new Arrowhead art is selected only for a verified KC home venue.
  await page.goto('#/design/sift2/nfl/game/evt_d61c6ec73af81c7e4294');
  await expect(page.locator('.s2-broadcast')).toHaveAttribute('data-hero-photo','sift2-arrowhead-night');
  await expect(page.locator('.s2-broadcast .hart__photo')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('arrowhead-archive.png'),scale:'css'});
});
