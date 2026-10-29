// The owner's rule (docs/sift3/QUOTE_DELIVERY.md, "Product rule"): users see clean, automatically updating Kalshi prices. NO stale-quote warnings,
// freshness badges, ages ("4m ago", "just now"), "last known", Fresh/Aging/Stale words, "Published … ago", observation or last-updated timestamps
// anywhere in the v3 interface. A price is either shown (it passed data/quoteGate.ts) or withheld ("—", or "Price unavailable right now").
//
// This test reads every source file under src/v3 with the TypeScript parser and checks what a viewer could be shown: string literals, template
// strings and JSX text (comments, identifiers and imports are not text a viewer reads, so they are not scanned). The pattern is deliberately
// conservative. A hit is a failure unless it is in ALLOWED, each entry naming the file, the exact literal and why it is not a freshness label.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.env.V3_SCAN_ROOT ?? join(__dirname, '..', '..', 'src', 'v3'); // V3_SCAN_ROOT: point the scan at another checkout (to prove it catches the old strings)

/** The vocabulary of freshness. Case-insensitive; matched inside any visible text. */
const FRESHNESS = [
  /\bago\b/i, /just now/i, /last known/i, /stale/i, /\baging\b/i, /last updated/i, /\bas of \d/i, /\bfresh\b/i, /\bfreshness\b/i,
  /\bupdated (\d|just|ago)/i, /\b\d+\s?(s|sec|secs|min|mins|minutes|h|hr|hrs|hours) old\b/i, /\bobserved at\b/i, /\blast (seen|quote|update)\b/i,
];

/** File (relative to src/v3) + exact literal text that may match, with the reason. Keep this list empty unless a real exception appears. */
const ALLOWED: { file: string; text: string; why: string }[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

/** Everything in a file a person could read: string literals, template parts and JSX text (not comments, not import paths). */
export function visibleText(file: string, source: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const add = (n: ts.Node, text: string) => { if (text.trim()) out.push({ text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 }); };
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n, n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) add(n, n.text);
    else if (ts.isJsxText(n)) add(n, n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('no freshness vocabulary is ever visible in the v3 interface', () => {
  const files = walk(ROOT);

  it('scans the whole interface (guard against the walker finding nothing)', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('no string, template or JSX text in src/v3 uses an age, "just now", "last known", stale/aging/fresh or a last-updated stamp', () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      for (const { text, line } of visibleText(f, readFileSync(f, 'utf8'))) {
        const m = FRESHNESS.find((r) => r.test(text));
        if (m && !ALLOWED.some((a) => a.file === rel && a.text === text)) hits.push(`${rel}:${line}  ${m}  ${JSON.stringify(text.slice(0, 90))}`);
      }
    }
    expect(hits, `freshness words in visible text:\n${hits.join('\n')}`).toEqual([]);
  });

  it('every allow-list entry is still needed (no dead exceptions)', () => {
    for (const a of ALLOWED) {
      const src = readFileSync(join(ROOT, a.file), 'utf8');
      expect(visibleText(a.file, src).some((t) => t.text === a.text), `${a.file}: ${a.text}`).toBe(true);
    }
  });

  it('the removed freshness machinery is gone: no quoteState/ago helpers, no state words, no stale or fresh styling classes', () => {
    const banned = [/\bago\(/, /\bquoteState\b/, /\bSTATE_WORD\b/, /\bis-stale\b/, /\bv3-fresh\b/, /export (function|const) ago\b/];
    const hits: string[] = [];
    const all = [...files, ...walkCss(ROOT)];
    for (const f of all) {
      const src = readFileSync(f, 'utf8');
      for (const b of banned) if (b.test(src)) hits.push(`${relative(ROOT, f)}  ${b}`);
    }
    expect(hits).toEqual([]);
  });

  it('the scanner itself sees text (a JSX string with "4m ago" would be caught; a comment would not)', () => {
    const seen = visibleText('x.tsx', `// 4m ago\nconst a = <b>Updated 4m ago</b>; const t = \`${'${x}'} last known\`; const q = "just now";`);
    expect(seen.map((s) => s.text)).toEqual(['Updated 4m ago', ' last known', 'just now']);
    expect(seen.every((s) => FRESHNESS.some((r) => r.test(s.text)))).toBe(true);
  });
});

function walkCss(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walkCss(p, out);
    else if (n.endsWith('.css')) out.push(p);
  }
  return out;
}
