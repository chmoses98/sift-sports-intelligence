// Snaps the long tail of ad-hoc font sizes in src/styles/*.css onto the SIFT 2.0 type scale (src/styles/sift2-system.css).
//
//   node scripts/sift2/css-type-snap.mjs            report only (what would change, per file and per step)
//   node scripts/sift2/css-type-snap.mjs --write    apply
//
// What it changes, and only this:
//   font-size: <px|rem literal up to 28.8px>   ->  var(--sift2-fs-<step>[, <original>])
//   font: <weight> <px|rem literal>[/lh] <family>  (the shorthand, same size rule; a literal Barlow family becomes a token)
//   font-weight: 800|900                       ->  700   (Barlow is self-hosted at 400/500/600/700, so 800 and 900 already rendered as 700)
//   font-family: Barlow, ... (literal)         ->  var(--font-sans)  (adds the metric-matched 'Barlow Fallback')
// Sizes under 12px go to the 12px step (the legibility floor DESIGN_SYSTEM.md already states). Larger sizes go to the nearest step.
// Sizes above 28.8px, clamp(), calc(), em, var() and keywords are left alone.
//
// Legacy safety: in the shared files the original literal stays as the var() fallback. --sift2-fs-* is defined only under
// :root[data-ui='sift2'], so the classic interface (and any page rendered without that attribute) keeps exactly what it had.
// In the sift2-*.css files, which only apply to SIFT 2.0, no fallback is written.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STEPS = [['micro', 12], ['caption', 13], ['small', 14], ['body', 16], ['lead', 18], ['h4', 20], ['h3', 24], ['h2', 28]];
export const MAX_PX = 28.8;

/** The scale step for a size in px: below 12 is the floor; otherwise the nearest step, a tie going to the larger. null above MAX_PX. */
export function snapPx(px) {
  if (!Number.isFinite(px) || px <= 0 || px > MAX_PX) return null;
  if (px < STEPS[0][1]) return STEPS[0];
  let best = STEPS[0], bestD = Infinity;
  for (const s of STEPS) {
    const d = Math.abs(px - s[1]);
    if (d < bestD || (d === bestD && s[1] > best[1])) { best = s; bestD = d; }
  }
  return best;
}

const toPx = (n, unit) => (unit === 'rem' ? n * 16 : n);
const SIZE = /^(-?[\d.]+)(px|rem)$/;

function sizeToken(literal, fallback) {
  const m = SIZE.exec(literal.trim());
  if (!m) return null;
  const step = snapPx(toPx(parseFloat(m[1]), m[2]));
  if (!step) return null;
  return { step, text: `var(--sift2-fs-${step[0]}${fallback ? `, ${literal.trim()}` : ''})` };
}

/** Barlow written out as a literal family, in a font-family value or at the end of a font shorthand. */
function family(value) {
  if (/^\s*['"]?Barlow Condensed['"]?\s*(,|$)/i.test(value)) return 'var(--font-cond)';
  if (/^\s*['"]?Barlow['"]?\s*(,|$)/i.test(value)) return 'var(--font-sans)';
  return null;
}

const SHORTHAND = /^(?<pre>(?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|\d{3})\s+)*)(?<size>-?[\d.]+(?:px|rem))(?<lh>\/\S+)?(?<rest>\s+.*)?$/;

/** Rewrites one stylesheet. Returns the new text and counts. */
export function transform(css, { fallback }) {
  const stats = { sizes: 0, shorthand: 0, weights: 0, families: 0, byStep: {} };
  const bump = (step) => { stats.byStep[step[0]] = (stats.byStep[step[0]] || 0) + 1; };
  let out = css.replace(/(^|[;{\s])font-size(\s*:\s*)([^;}!]+?)(\s*!important)?(?=\s*[;}]|\s*$)/g, (all, pre, colon, value, imp = '') => {
    const t = sizeToken(value, fallback);
    if (!t) return all;
    stats.sizes++; bump(t.step);
    return `${pre}font-size${colon}${t.text}${imp}`;
  });
  out = out.replace(/(^|[;{\s])font(\s*:\s*)([^;}]*?)(?=;|}|$)/g, (all, pre, colon, value) => {
    const m = SHORTHAND.exec(value.trim());
    if (!m) return all;
    const t = sizeToken(m.groups.size, fallback);
    if (!t) return all;
    let rest = m.groups.rest ?? '';
    const fam = family(rest);
    if (fam) { rest = ` ${fam}`; stats.families++; }
    const pre2 = m.groups.pre.replace(/\b(800|900)\b/g, () => { stats.weights++; return '700'; });
    stats.shorthand++; bump(t.step);
    return `${pre}font${colon}${pre2}${t.text}${m.groups.lh ?? ''}${rest}`;
  });
  out = out.replace(/(font-weight\s*:\s*)(800|900)\b/g, (_a, p) => { stats.weights++; return `${p}700`; });
  out = out.replace(/(font-family\s*:\s*)([^;}]+)/g, (all, p, value) => {
    const fam = family(value);
    if (!fam || /var\(/.test(value)) return all;
    stats.families++;
    return `${p}${fam}`;
  });
  return { out, stats };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const write = process.argv.includes('--write');
  const dir = fileURLToPath(new URL('../../src/styles/', import.meta.url));
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => join(dir, f)), fileURLToPath(new URL('../../src/views/intel/chain.css', import.meta.url))];
  const total = { sizes: 0, shorthand: 0, weights: 0, families: 0, byStep: {} };
  for (const file of files) {
    const name = basename(file);
    if (name === 'sift2-system.css' || name === 'sift2-tokens.css' || name === 'tokens.css') continue;
    const css = readFileSync(file, 'utf8');
    const { out, stats } = transform(css, { fallback: !name.startsWith('sift2-') });
    const n = stats.sizes + stats.shorthand + stats.weights + stats.families;
    if (!n) continue;
    for (const k of ['sizes', 'shorthand', 'weights', 'families']) total[k] += stats[k];
    for (const [k, v] of Object.entries(stats.byStep)) total.byStep[k] = (total.byStep[k] || 0) + v;
    console.log(`${name.padEnd(26)} font-size ${String(stats.sizes).padStart(4)}  font: ${String(stats.shorthand).padStart(3)}  weights ${String(stats.weights).padStart(2)}  families ${String(stats.families).padStart(2)}`);
    if (write) writeFileSync(file, out);
  }
  console.log('total', JSON.stringify(total));
  console.log(write ? 'written' : 'dry run (pass --write to apply)');
}
