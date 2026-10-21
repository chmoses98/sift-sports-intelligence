// One-off: vendor the Phosphor icons the prototype uses into src/icons.json (MIT, https://phosphoricons.com).
// usage: node extract-icons.mjs <path to node_modules/@phosphor-icons/core>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = process.argv[2];
const NAMES = ['house', 'calendar-dots', 'target', 'pulse', 'bookmark-simple', 'magnifying-glass', 'caret-left', 'caret-right', 'caret-down', 'caret-up', 'x', 'star', 'bell-simple', 'info', 'warning', 'copy', 'check', 'check-circle', 'plus', 'dots-three', 'clock', 'trend-up', 'shield-check', 'lightning', 'football', 'basketball', 'hockey', 'baseball', 'soccer-ball', 'arrow-up-right', 'arrow-right', 'funnel-simple', 'sliders-horizontal', 'lock-simple', 'minus', 'squares-four', 'cloud-slash', 'hourglass-medium', 'user-circle', 'arrows-left-right', 'chart-line-up', 'scales', 'broadcast', 'stack', 'circle-notch', 'seal-check', 'trophy', 'calendar-blank', 'user', 'eye'];
const out = {};
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
for (const n of NAMES) {
  const r = `${root}/assets/regular/${n}.svg`, f = `${root}/assets/fill/${n}-fill.svg`;
  if (!existsSync(r)) { console.log('missing regular', n); continue; }
  out[n] = inner(readFileSync(r, 'utf8'));
  if (existsSync(f)) out[n + '-f'] = inner(readFileSync(f, 'utf8')); else console.log('no fill', n);
}
writeFileSync(new URL('./src/icons.json', import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length, 'symbols');
