import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:8099/Game.dc.html'); await p.waitForTimeout(1200);
const sel = () => p.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').textContent.trim());
const drag = async (x1, x2) => { await p.mouse.move(x1, 520); await p.mouse.down(); await p.mouse.move((x1 + x2) / 2, 524, { steps: 4 }); await p.mouse.move(x2, 526, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400); };
const out = [await sel()]; await drag(320, 80); out.push(await sel()); await drag(320, 80); out.push(await sel()); await drag(80, 320); out.push(await sel());
console.log('chromium swipe:', out.join(' -> ')); await b.close();
