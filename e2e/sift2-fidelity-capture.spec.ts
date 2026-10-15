import { test, expect, NOW, noHorizontalOverflow } from './fixtures';
import { writeFileSync } from 'node:fs';
// San Francisco's published home game uses its verified venue and available approved player photographs.
const SF = 'evt_8e764f246d2916e5a347';
test.use({ timezoneId: 'America/Chicago' });
test('matched reference captures and density measurements @smoke', async ({ page, isMobile }) => {
  await page.clock.install({ time: NOW });
  await page.setViewportSize(isMobile ? { width:390, height:1165 } : { width:1536, height:1024 });
  await page.goto(`#/design/sift2/games?game=${SF}`);
  await expect(page.locator('.s2-games__lead .hart__photo')).toBeVisible();
  await expect(page.locator('.s2-games__lead .s2-venue-art')).toHaveAttribute('data-art-status','loaded');
  await expect(page.locator('.s2-games__lead .hart__photo')).toHaveCSS('opacity','1');
  await page.evaluate(() => document.fonts.ready);
  await noHorizontalOverflow(page,'Matched Games');
  await page.screenshot({ path:test.info().outputPath('matched-games.png'),scale:'css' });
  await page.goto(`#/design/sift2/nfl/game/${SF}`);
  await expect(page.locator('.s2-command-overview')).toBeVisible();
  await expect(page.locator('.sift2-command .hart__photo')).toBeVisible();
  await expect(page.locator('.sift2-command .s2-venue-art>.hart__photo')).toHaveCSS('opacity','1');
  await expect(page.locator('.sift2-command .s2-venue-art')).toHaveAttribute('data-art-tone','daylight');
  await expect(page.locator('.sift2-command .s2-venue-art>.hart__photo')).toHaveCSS('object-position',isMobile ? '53% 44%' : '50% 39%');
  await page.evaluate(() => document.fonts.ready);
  await noHorizontalOverflow(page,'Matched Command');
  const metrics = await page.evaluate(() => Object.fromEntries(['.s2-broadcast','.sift2-command>.gtabs','.s2-read','.s2-scripts','.s2-drivers','.s2-featured-players'].map((s)=>{const r=document.querySelector(s)!.getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
  expect(metrics['.s2-broadcast'].height).toBe(isMobile ? 250 : 454);
  expect(metrics['.s2-read'].y).toBe(isMobile ? 301 : 508);
  if(!isMobile) expect(metrics['.s2-featured-players'].y).toBe(814);
  writeFileSync(test.info().outputPath('matched-geometry.json'),JSON.stringify(metrics,null,2));
  await page.screenshot({ path:test.info().outputPath('matched-overview.png'),scale:'css' });
  await page.screenshot({ path:test.info().outputPath('matched-overview-full.png'),fullPage:true,scale:'css' });
  await page.locator('.sift2-command>.gtabs').getByRole('link',{name:'Players',exact:true}).click();
  await expect(page.locator('.s2-player-list .s2-player').first()).toBeVisible();
  await expect(page.locator('.s2-player-art.has-photo').first().locator('.pface>img')).toBeVisible();
  await expect(page.locator('.s2-player-art:not(.has-photo)').first().locator('.teammark')).toBeVisible();
  await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
  await noHorizontalOverflow(page,'Matched Players');
  await page.screenshot({ path:test.info().outputPath('matched-players.png'),scale:'css' });
  // Archive example proves new Arrowhead art is selected only for a verified KC home venue.
  await page.goto('#/design/sift2/nfl/game/evt_d61c6ec73af81c7e4294');
  await expect(page.locator('.s2-broadcast')).toHaveAttribute('data-hero-photo','sift2-arrowhead-night');
  await expect(page.locator('.s2-broadcast .hart__photo')).toBeVisible();
  await expect(page.locator('.s2-broadcast .s2-venue-art')).toHaveAttribute('data-art-tone','night');
  await page.screenshot({path:test.info().outputPath('arrowhead-archive.png'),scale:'css'});
  // A different venue gets its own indoor crop; no night sky is added to a roofed stadium.
  await page.goto('#/design/sift2/nfl/game/evt_5679fabc64613ee78fa0');
  await expect(page.locator('.s2-broadcast .s2-venue-art')).toHaveAttribute('data-art-tone','indoor');
  await expect(page.locator('.s2-broadcast .s2-venue-art>.hart__photo')).toHaveCSS('opacity','1');
  await expect(page.locator('.s2-broadcast .s2-venue-art>.hart__photo')).toHaveCSS('object-position',isMobile ? '57% 70%' : '50% 72%');
  await page.screenshot({path:test.info().outputPath('minneapolis-indoor.png'),scale:'css'});
});

test('unusable photographs retain venue identity and team-branded artwork @smoke',async({page})=>{
  // Successful HTTP with undecodable bytes must also fall back, not leave a broken image.
  const corrupt={status:200,contentType:'image/webp',body:'invalid image bytes'};
  await page.route('**/heroes/**/*.webp',route=>route.fulfill(corrupt));
  await page.route('**/players/nfl/*.webp',route=>route.fulfill(corrupt));
  await page.goto(`#/design/sift2/nfl/game/${SF}`);
  await expect(page.locator('.s2-command-overview')).toBeVisible();
  await expect(page.locator('.s2-broadcast')).toContainText(/Levi's Stadium/i);
  await expect(page.locator('.s2-broadcast .s2-venue-art')).toHaveAttribute('data-art-status','unavailable');
  await expect(page.locator('.s2-broadcast .s2-venue-art>.hart__photo')).toHaveCount(0);
  await expect(page.locator('.s2-broadcast .hart__logo')).toBeVisible();
  await page.locator('.sift2-command>.gtabs').getByRole('link',{name:'Players',exact:true}).click();
  await expect(page.locator('.s2-player-list .s2-player-art[data-photo-state=unavailable]')).toHaveCount(3);
  await expect(page.locator('.s2-player-list .s2-player-art.has-photo')).toHaveCount(0);
  await expect(page.locator('.s2-player-list .s2-player-art .teammark').first()).toBeVisible();
  await noHorizontalOverflow(page,'Failed photograph fallback');
  await page.screenshot({path:test.info().outputPath('photo-unavailable.png'),scale:'css'});
});
