// The Vercel function must be emitted as CommonJS. relay/package.json declares no "type", so Node loads api/markets.js as CommonJS; a
// relay/tsconfig.json with `module: ESNext` made Vercel emit ESM `import`/`export` with an extensionless `../core` specifier, which Node 22
// rejects (ERR_MODULE_NOT_FOUND): every request answered 500 FUNCTION_INVOCATION_FAILED from #160 (2026-10-30) until this was fixed.
// Vercel compiles with the relay's own tsconfig, so this transpiles the function exactly that way and loads the result the way Lambda does.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RELAY = resolve(__dirname, '../relay');
const emit = (file: string) => {
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(join(RELAY, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, RELAY);
  return ts.transpileModule(readFileSync(join(RELAY, file), 'utf8'), { compilerOptions: { ...cfg.options, noEmit: false }, fileName: file }).outputText;
};

describe('relay Vercel build output', () => {
  it('declares no "type": "module" (the emitted .js is CommonJS)', () => {
    expect(JSON.parse(readFileSync(join(RELAY, 'package.json'), 'utf8')).type).not.toBe('module');
  });

  it('api/markets.ts is emitted as CommonJS: require("../core"), no ESM import/export', () => {
    const js = emit('api/markets.ts');
    expect(js).toMatch(/require\("\.\.\/core"\)/);
    expect(js).not.toMatch(/^\s*import\s/m);
    expect(js).not.toMatch(/^\s*export\s/m);
  });

  it('the emitted function loads under Node and answers 200 with CORS and Date for the Pages origin (what Lambda does)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-build-'));
    try {
      mkdirSync(join(dir, 'api'));
      writeFileSync(join(dir, 'api/markets.js'), emit('api/markets.ts'));
      writeFileSync(join(dir, 'core.js'), emit('core.ts'));
      const fn = createRequire(join(dir, 'x.js'))('./api/markets.js') as Record<string, (r: Request) => Promise<Response>>;
      expect(Object.keys(fn).sort()).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response('{"markets":[]}', { status: 200, headers: { 'content-type': 'application/json', date: new Date().toUTCString() } })) as typeof fetch;
      try {
        const res = await fn.GET(new Request('https://relay.test/markets?series_ticker=KXNFLGAME&status=open&limit=2', { headers: { Origin: 'https://chmoses98.github.io' } }));
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('https://chmoses98.github.io');
        expect(res.headers.get('access-control-expose-headers')).toMatch(/\bDate\b/);
        expect(res.headers.get('date')).toBeTruthy();
      } finally {
        globalThis.fetch = realFetch;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
