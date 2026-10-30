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

/** `deployments`: the repository's production deployments, newest first, each with the statuses (newest first) its status endpoint answers. */
type Deployment = { id: number; sha: string; login?: string; statuses: { state: string }[] };
async function run(reply: { status?: number; body: unknown; deployments?: Deployment[] }, sha = 'abc1234'): Promise<{ code: number | null; out: string }> {
  server = http.createServer((q, r) => {
    r.setHeader('content-type', 'application/json');
    const url = q.url ?? '';
    if (url.includes('/deployments')) {
      const m = /deployments\/(\d+)\/statuses/.exec(url);
      const list = reply.deployments ?? [];
      r.end(JSON.stringify(m ? (list.find((d) => d.id === Number(m[1]))?.statuses ?? []) : list.map((d) => ({ id: d.id, sha: d.sha, creator: { login: d.login ?? 'vercel[bot]' } }))));
      return;
    }
    r.statusCode = reply.status ?? 200;
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
  const rateLimited = { statuses: [{ context: 'Vercel', state: 'failure', description: 'Deployment rate limited — retry in 24 hours.' }] };
  it('does not fail a rate-limited attempt that a newer successful production deployment superseded', async () => {
    const r = await run({ body: rateLimited, deployments: [{ id: 2, sha: 'def5678', statuses: [{ state: 'success' }, { state: 'pending' }] }, { id: 1, sha: 'abc1234', statuses: [{ state: 'failure' }] }] });
    expect(r.code).toBe(0);
    expect(r.out).toContain('superseded');
  });
  it('fails when the NEWEST production deployment failed, whatever the commit under check says', async () => {
    const r = await run({ body: { statuses: [{ context: 'Vercel', state: 'success', description: 'ok' }] }, deployments: [{ id: 2, sha: 'def5678', statuses: [{ state: 'error' }, { state: 'pending' }] }, { id: 1, sha: 'abc1234', statuses: [{ state: 'success' }] }] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('def5678');
  });
  it('ignores deployments that are not Vercel\'s and falls back to the commit status while the newest is still building', async () => {
    expect((await run({ body: rateLimited, deployments: [{ id: 3, sha: 'x', login: 'chmoses98', statuses: [{ state: 'success' }] }] })).code).toBe(1);
    expect((await run({ body: rateLimited, deployments: [{ id: 2, sha: 'def5678', statuses: [{ state: 'in_progress' }] }] })).code).toBe(1);
  });
  it('is not a verdict when GitHub itself refuses, and does nothing outside a post-deploy run', async () => {
    expect((await run({ status: 403, body: {} })).code).toBe(0);
    expect((await run({ body: {} }, '')).code).toBe(0);
  });
});
