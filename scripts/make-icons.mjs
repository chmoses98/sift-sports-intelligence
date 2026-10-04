// Render the Sift mark to the PWA icon sizes with headless Chromium. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
const svg = (pad, bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  ${bg ? '<rect width="32" height="32" fill="#05070d"/><rect y="20" width="32" height="12" fill="#0a1222"/><rect y="25" width="32" height="7" fill="#0e1830"/>' : ''}
  <g transform="translate(${16 - 16 * (1 - 2 * pad)} ${16 - 16 * (1 - 2 * pad)}) scale(${1 - 2 * pad})">
    <rect x="3" y="6" width="26" height="4" rx="2" fill="#2a3a63"/>
    <rect x="7" y="13" width="18" height="4" rx="2" fill="#3461ff"/>
    <rect x="11.5" y="20" width="9" height="4" rx="2" fill="#2ee6f6"/>
    <circle cx="16" cy="28" r="1.8" fill="#f6b93b"/>
  </g>
</svg>`;
const jobs = [
  ['public/icons/icon-192.png', 192, 0.12],
  ['public/icons/icon-512.png', 512, 0.12],
  ['public/icons/icon-maskable-512.png', 512, 0.22],
  ['public/icons/apple-touch-icon.png', 180, 0.12],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, pad] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#05070d">${svg(pad, true)}</body></html>`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}
await browser.close();
