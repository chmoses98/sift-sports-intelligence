#!/usr/bin/env node
// The built SIFT app in real browsers with REAL internet (a GitHub runner, or your Mac): live scores turned on, real boards, real feeds.
// Records what a person would see (screenshots), what the page asked for (requests, status, CORS), console errors and the text of the score
// surfaces. Usage: node scripts/live-scores/real-browser.mjs <base-url> <out-dir>   (base-url like http://127.0.0.1:4199/sift-sports-intelligence/)
import { chromium, webkit, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SCORE_HOSTS = /sportscore\.com|espn\.com/; // espn.com is listed only to prove the app never contacts it
const profiles = [
  ['iphone-webkit', webkit, devices['iPhone 15 Pro']],
  ['pixel-chromium', chromium, devices['Pixel 7']],
  ['desktop-chromium', chromium, { viewport: { width: 1280, height: 900 } }],
];
const report = { at: new Date().toISOString(), base, runs: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, engine, dev] of profiles) {
  const browser = await engine.launch();
  const run = { name, steps: [], requests: [], failed: {}, consoleErrors: [], pageErrors: [] };
  for (const espn of [false]) {
    const ctx = await browser.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript((e) => { try { localStorage.setItem('sift.v4.prompt', 'later'); if (e) localStorage.setItem('sift.v4.livescores.espn', '1'); } catch { /* ignore */ } }, espn);
    const page = await ctx.newPage();
    const tag = `${name}${espn ? '-espn' : ''}`;
    page.on('response', async (r) => {
      const u = r.url();
      if (r.status() >= 400) run.failed[`${r.status()} ${u.replace(/\?.*$/, '')}`] = (run.failed[`${r.status()} ${u.replace(/\?.*$/, '')}`] ?? 0) + 1;
      if (SCORE_HOSTS.test(u)) run.requests.push({ espn, url: u.replace(/\?.*$/, '?…'), query: u.split('?')[1] ?? '', status: r.status(), acao: r.headers()['access-control-allow-origin'] ?? null, cache: r.headers()['cache-control'] ?? null, at: new Date().toISOString() });
    });
    page.on('console', (m) => { if (m.type() === 'error') run.consoleErrors.push({ espn, text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => run.pageErrors.push({ espn, text: String(e).slice(0, 300) }));
    const facts = async (label) => {
      const f = await page.evaluate(() => ({
        note: document.querySelector('[data-feed-note]')?.textContent ?? null,
        scoredRows: [...document.querySelectorAll('.v4-row')].filter((r) => r.querySelector('.v4-row__sc')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12),
        featured: document.querySelector('[data-featured]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) ?? null,
        liveCard: document.querySelector('[data-live-score]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        attribution: [...document.querySelectorAll('a[href="https://sportscore.com/"]')].map((a) => a.getAttribute('rel')),
      }));
      run.steps.push({ espn, label, ...f });
      return f;
    };
    try {
      await page.goto(`${base}#/v4?livescores=1`);
      await page.waitForSelector('.v4-feature, .v4-skel', { timeout: 45000 });
      await wait(9000);
      await facts('home');
      await page.screenshot({ path: join(out, `${tag}-home.png`) });
      await page.goto(`${base}#/v4/games`);
      await wait(7000);
      await facts('games');
      await page.screenshot({ path: join(out, `${tag}-games.png`) });
      for (const sp of ['nba', 'nhl', 'nfl', 'cfb']) {
        await page.goto(`${base}#/v4?sport=${sp}`);
        await wait(6000);
        await facts(`home-${sp}`);
        await page.screenshot({ path: join(out, `${tag}-home-${sp}.png`) });
      }
      // open one game that shows a score and read its Live tab
      await page.goto(`${base}#/v4/games`);
      await wait(6000);
      const row = page.locator('.v4-row', { has: page.locator('.v4-row__sc') }).first();
      if (await row.count()) {
        await row.locator('a.v4-row__link').click();
        await page.waitForSelector('[data-live-score]', { timeout: 15000 }).catch(() => {});
        await wait(1500);
        await facts('game');
        await page.screenshot({ path: join(out, `${tag}-game.png`) });
      } else run.steps.push({ espn, label: 'game', note: 'no game with a score on screen right now' });
    } catch (e) { run.steps.push({ espn, label: 'error', error: String(e).slice(0, 300) }); }
    await ctx.close();
  }
  await browser.close();
  report.runs.push(run);
}
writeFileSync(join(out, 'real-browser.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.runs.map((r) => ({ name: r.name, requests: r.requests.length, consoleErrors: r.consoleErrors.length, pageErrors: r.pageErrors.length })), null, 1));
