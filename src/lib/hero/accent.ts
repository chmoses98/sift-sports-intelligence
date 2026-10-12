// Team colour as an accent on Sift's near-black: the authentic club colours, lifted only as far as accessibility
// needs. A bar, rule or glow is a graphical object (WCAG 1.4.11: at least 3:1 against what it sits on); text on
// team colour is never relied on — labels stay white on the dark surface beside the colour.

const SURFACE = '#02080e';

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance (0–1). */
export function luminance(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Mix a colour toward white by `t` (0–1). */
function lift(hex: string, t: number): string {
  const c = rgb(hex);
  if (!c) return hex;
  return toHex(c.map((v) => v + (255 - v) * t) as [number, number, number]);
}

/**
 * The club colour to accent with on the dark hero: its primary colour when that is visible on near-black, else its
 * secondary, else the primary lifted toward white just enough to reach 3:1 (navy, black and deep maroon clubs stay
 * recognisably theirs).
 */
export function accentOnDark(colors: readonly [string, string] | readonly string[], surface = SURFACE): string {
  const valid = colors.filter((c) => rgb(c));
  if (!valid.length) return '#8fd0ff';
  if (contrast(valid[0], surface) >= 3) return toHex(rgb(valid[0])!);
  // A deep primary (cardinal red, maroon) that a light lift makes visible stays the identity colour.
  for (let t = 0.05; t <= 0.3; t += 0.05) {
    const c = lift(valid[0], t);
    if (contrast(c, surface) >= 3) return c;
  }
  const ok = valid.find((c) => contrast(c, surface) >= 3);
  if (ok) return toHex(rgb(ok)!);
  const best = [...valid].sort((a, b) => contrast(b, surface) - contrast(a, surface))[0];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = lift(best, t);
    if (contrast(c, surface) >= 3) return c;
  }
  return '#ffffff';
}

/** HSL saturation × lightness weight: how "lit" a colour reads against black (navy and black score low, gold and red high). */
function vividness(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return (mx - mn) * (0.35 + mx);
}

/**
 * The team-colour clash palette: each club's two colours split into the one that lights the frame ("hot": gold,
 * red, orange — the most vivid) and the one that fills it ("cool": the royal blue, lifted to be visible). Two clubs
 * therefore read as different even when both are blue (Rams gold + blue against Bills red + blue).
 */
export function clashPalette(colors: readonly string[]): { hot: string; cool: string } {
  const valid = colors.filter((c) => rgb(c));
  if (!valid.length) return { hot: '#8fd0ff', cool: '#3b6fd8' };
  const [first, second = first] = [...valid].sort((a, b) => vividness(b) - vividness(a));
  const cool = lift(second, 0.28);
  return { hot: accentOnDark([first]), cool: contrast(cool, SURFACE) >= 3 ? cool : accentOnDark([second]) };
}
