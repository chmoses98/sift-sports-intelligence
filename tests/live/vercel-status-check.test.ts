// scripts/vercel-status-check.mjs: the production check fails when Vercel reports a failed or rate-limited deployment of the live commit
// (the failure that kept #150's relay off production), and stays quiet otherwise.
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'vercel-status-check.mjs');
let server: http.Server | null = null;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function run(reply: { status?: number; body: unknown }, sha = 'abc1234'): Promise<{ code: number | null; out: string }> {
  server = http.createServer((_q, r) => {
    r.statusCode = reply.status ?? 200;
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
  const env = { ...process.env, SIFT_EXPECT_SHA: sha, GITHUB_API_URL: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' };
  return new Promise((resolve) => {
    const p = spawn('node', [SCRIPT], { env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

describe('vercel status check', () => {
  it('fails on a rate-limited deployment, naming the reason', async () => {
    const r = await run({ body: { statuses: [{ context: 'Vercel', state: 'failure', description: 'Deployment rate limited — retry in 24 hours.' }] } });
    expect(r.code).toBe(1);
    expect(r.out).toContain('rate limited');
  });
  it('fails on an errored deployment', async () => {
    expect((await run({ body: { statuses: [{ context: 'Vercel – sift-quote-relay', state: 'error', description: 'x' }] } })).code).toBe(1);
  });
  it('passes on a successful, a pending or an absent Vercel status', async () => {
    expect((await run({ body: { statuses: [{ context: 'Vercel', state: 'success', description: 'ok' }] } })).code).toBe(0);
    expect((await run({ body: { statuses: [{ context: 'Vercel', state: 'pending', description: 'building' }] } })).code).toBe(0);
    expect((await run({ body: { statuses: [{ context: 'CI', state: 'failure' }] } })).code).toBe(0);
  });
  it('is not a verdict when GitHub itself refuses, and does nothing outside a post-deploy run', async () => {
    expect((await run({ status: 403, body: {} })).code).toBe(0);
    expect((await run({ body: {} }, '')).code).toBe(0);
  });
});
