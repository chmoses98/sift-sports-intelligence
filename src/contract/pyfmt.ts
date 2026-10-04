// Python float formatting, reproduced exactly so the clipboard packet is byte-identical to the
// contract's render_text (packet.py). JavaScript's toFixed rounds exact binary ties away from zero;
// Python rounds them half-to-even. Everything else agrees, so only ties need exact arithmetic.

function exactParts(x: number): { mant: bigint; exp: number } {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp: number;
  if (biased === 0) {
    exp = -1074;
  } else {
    mant |= 1n << 52n;
    exp = biased - 1075;
  }
  return { mant, exp };
}

/** Python f"{x:.{d}f}" */
export function pyFixed(x: number, d: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  const { mant, exp } = exactParts(ax);
  if (exp < 0 && ax < 1e21) {
    const n = mant * 10n ** BigInt(d);
    const shift = BigInt(-exp);
    const half = 1n << (shift - 1n);
    const rem = n & ((1n << shift) - 1n);
    if (rem === half) {
      let q = n >> shift;
      if (q & 1n) q += 1n;
      return (neg ? '-' : '') + intToFixed(q, d);
    }
  }
  const s = ax.toFixed(d);
  return (neg ? '-' : '') + s;
}

function intToFixed(q: bigint, d: number): string {
  if (d === 0) return q.toString();
  const s = q.toString().padStart(d + 1, '0');
  return `${s.slice(0, -d)}.${s.slice(-d)}`;
}

/** Python round(x, d) for floats (half-to-even on the exact binary value). */
export function pyRound(x: number, d: number): number {
  return Number(pyFixed(x, d));
}

/** Python format(x, 'g'): 6 significant digits, trailing zeros stripped. */
export function pyG(x: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const e = x.toExponential(5); // d.ddddde±X, correctly rounded to 6 significant digits
  const [m, ex] = e.split('e');
  const X = Number(ex);
  if (X >= -4 && X < 6) {
    const fixed = pyFixed(x, Math.max(0, 5 - X));
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  }
  const mm = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
  const sign = X < 0 ? '-' : '+';
  return `${mm}e${sign}${String(Math.abs(X)).padStart(2, '0')}`;
}

/** Python str() of a JSON value that is not a float. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}

/** os.path.commonprefix over strings. */
export function commonPrefix(xs: string[]): string {
  if (!xs.length) return '';
  let pre = xs[0];
  for (const s of xs) {
    let i = 0;
    while (i < pre.length && i < s.length && pre[i] === s[i]) i++;
    pre = pre.slice(0, i);
  }
  return pre;
}

/** Python's default ordering for str keys (code points). */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare tuples the way Python does (element-wise; numbers numerically, strings by code point). */
export function cmpTuple(a: (string | number)[], b: (string | number)[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return cmpStr(String(x), String(y));
  }
  return a.length - b.length;
}
