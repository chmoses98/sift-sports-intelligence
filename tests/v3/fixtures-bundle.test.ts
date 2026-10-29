// @vitest-environment node
// The real-document fixture bundle: format, sanitization, deduplication, tamper detection, and the browser-side reader (scripts/v3-fixtures).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FAMILIES, bundleDir, emptyBundle, loadBundle, openBundle, scanText, sha256, writeBundle, checkUrl } from '../../scripts/v3-fixtures/lib.mjs';
import { verifyBundle } from '../../scripts/v3-fixtures/verify.mjs';
import { openWebBundle } from '../../scripts/v3-fixtures/webLoader.mjs';

const tmp: string[] = [];
const mk = () => { const d = mkdtempSync(join(tmpdir(), 'v3fx-')); tmp.push(d); return d; };
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });

const U = (p: string) => `https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/${p}`;
const doc = (o: unknown) => Buffer.from(JSON.stringify(o));

function synthetic() {
  const b = emptyBundle();
  const shared = doc({ kind: 'shared', n: 1 });
  const a = doc({ kind: 'event_detail', markets: [{ ticker: 'T1' }] });
  const c = doc({ schema: 'sift.live_quotes.v1', markets: [] });
  for (const d of [shared, a, c]) b.docs.set(sha256(d), d);
  const clock = { captured_at: '2026-10-26T23:25:00Z', basis: 'test' };
  const meta = (specs: string[]) => ({ captured_start: '2026-10-26T23:20:00Z', captured_end: '2026-10-26T23:24:00Z', clock, specs });
  const e = (d: Buffer, extra = {}) => ({ status: 200, sha256: sha256(d), contentType: 'application/json', fetchedAt: '2026-10-26T23:21:00Z', ...extra });
  b.families.stat = { meta: meta(['e2e/a.spec.ts']), urls: { [U('shared.json')]: e(shared), [U('a.json')]: e(a), [U('gone.json')]: { status: 404, fetchedAt: '2026-10-26T23:21:00Z' } } };
  b.families.game = { meta: meta(['e2e/b.spec.ts']), urls: { [U('shared.json')]: e(shared), 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes/games/26OCT26DALPHI.json': e(c) } };
  return { b, shared, a, c };
}

describe('sanitization', () => {
  it('flags secrets and personal data patterns', () => {
    const bad: Record<string, string> = {
      'github-token': 'x ghp_abcdefghijklmnopqrstuvwxyz0123456789 y',
      'aws-key': 'AKIAABCDEFGHIJKLMNOP',
      'authorization-header': '{"Authorization": "x"}',
      'bearer-token': 'Bearer abcdefghijklmnopqrstuvwxyz',
      email: 'contact someone@example.com now',
      phone: 'call 415-555-0123 now',
      'secret-field': '{"api_key": "abcd1234"}',
      'private-url': 'see http://192.168.1.4/x',
      'url-userinfo': 'https://user:pw@example.com/x',
      'private-key': '-----BEGIN RSA PRIVATE KEY-----',
    };
    for (const [rule, text] of Object.entries(bad)) expect(scanText(text).map((f) => f.rule), rule).toContain(rule);
  });
  it('passes a typical published document (numbers, dates, ids, tickers)', () => {
    const t = JSON.stringify({ generated_at: '2026-10-26T23:14:06Z', event_id: 'evt_cd335cc6d5f5b8d8f7b3', ticker: 'KXNFLGAME-26OCT27DALPHI-DAL', yes_ask: 0.37, spread: [-3.5, 1.2, 44.5], ids: [1234567890123, 20261026], team: 'Dallas Cowboys' });
    expect(scanText(t)).toEqual([]);
  });
  it('an allow entry exempts exactly one reasoned match', () => {
    expect(scanText('a@b.co', [{ rule: 'email', match: 'a@b.co', reason: 'test' }])).toEqual([]);
    expect(scanText('c@d.co', [{ rule: 'email', match: 'a@b.co', reason: 'test' }]).length).toBe(1);
  });
  it('only https raw.githubusercontent.com URLs without credentials are accepted', () => {
    expect(checkUrl(U('x.json'))).toEqual([]);
    expect(checkUrl('http://raw.githubusercontent.com/x')).not.toEqual([]);
    expect(checkUrl('https://example.com/x')).not.toEqual([]);
    expect(checkUrl('https://raw.githubusercontent.com/x?token=abcdef123456')).not.toEqual([]);
  });
});

describe('bundle format', () => {
  it('stores a shared document once and round-trips byte-exact', () => {
    const d = mk(); const { b, shared, a } = synthetic();
    const { index, manifest } = writeBundle(d, b, { tool: { name: 't', version: '0', git_sha: null } });
    expect(Object.keys(index.documents)).toHaveLength(3);                 // shared, a, c: shared is not stored twice
    expect(index.documents[sha256(shared)].pack).toMatch(/^stat-/);       // the first family in FAMILIES order owns a shared document
    expect(manifest.totals.urls).toBe(5);
    expect(manifest.families.stat.documents).toBe(2);
    const r = loadBundle(d);
    expect(r.docs.get(sha256(a))!.equals(a)).toBe(true);
    expect(r.families.stat.urls[U('gone.json')]).toMatchObject({ status: 404 });
    const rd = openBundle(d).family('game');
    expect(rd.get(U('shared.json'))!.body.equals(shared)).toBe(true);
    expect(rd.get(U('missing.json'))).toBeNull();                         // a miss is the caller's 404
    expect(verifyBundle(d).errs).toEqual([]);
  });
  it('writing is deterministic', () => {
    const d1 = mk(); const d2 = mk();
    writeBundle(d1, synthetic().b, { tool: { name: 't', version: '0', git_sha: null } });
    writeBundle(d2, synthetic().b, { tool: { name: 't', version: '0', git_sha: null } });
    for (const f of ['index.json', 'packs/stat-1.bin.gz', 'packs/game-1.bin.gz']) expect(readFileSync(join(d1, f)).equals(readFileSync(join(d2, f))), f).toBe(true);
  });
  it('verify catches a tampered pack, a secret and an orphan document', () => {
    const d = mk(); writeBundle(d, synthetic().b, { tool: { name: 't', version: '0', git_sha: null } });
    const pack = join(d, 'packs', 'stat-1.bin.gz'); const orig = readFileSync(pack);
    writeFileSync(pack, Buffer.concat([orig, Buffer.from([0])]));
    expect(verifyBundle(d).errs.join('\n')).toMatch(/hash|gunzip|size/);
    writeFileSync(pack, orig);
    expect(verifyBundle(d).errs).toEqual([]);
    const s = synthetic(); const leaky = doc({ kind: 'x', note: 'mail me at someone@example.com' });
    s.b.docs.set(sha256(leaky), leaky);
    s.b.families.stat.urls[U('leaky.json')] = { status: 200, sha256: sha256(leaky), contentType: 'application/json', fetchedAt: '2026-10-26T23:21:00Z' };
    const d2 = mk(); writeBundle(d2, s.b, { tool: { name: 't', version: '0', git_sha: null } });
    expect(verifyBundle(d2).errs.join('\n')).toMatch(/sanitize: email/);
  });
  it('the browser-side reader answers the same bytes as the Node reader', async () => {
    const d = mk(); const { b, a } = synthetic();
    writeBundle(d, b, { tool: { name: 't', version: '0', git_sha: null } });
    const fetchImpl = async (u: string) => { const p = u.replace(/^file:\/\//, ''); try { const buf = readFileSync(p); return new Response(buf, { status: 200 }); } catch { return new Response('', { status: 404 }); } };
    const w = await openWebBundle(`file://${d}/`, fetchImpl as typeof fetch);
    const got = await w.family('stat').get(U('a.json'));
    expect(Buffer.from(got!.body).equals(a)).toBe(true);
    expect(await w.family('stat').get(U('nope.json'))).toBeNull();
    expect(w.family('game').clock.captured_at).toBe('2026-10-26T23:25:00Z');
  });
});

describe('the committed bundle (fixtures/real)', () => {
  it('verifies (hashes, shapes, index = manifest, sizes) and names every family the specs use', () => {
    const { errs } = verifyBundle(bundleDir(), { scan: false });
    expect(errs).toEqual([]);
    expect(openBundle().families().sort()).toEqual([...FAMILIES].sort());
  }, 120_000);
});
