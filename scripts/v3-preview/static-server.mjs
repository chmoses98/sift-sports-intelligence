// A tiny static server for the captured-preview build (dist-v3-snapshot/): the crawl and the build's self-check use it so the page is exercised
// the way a static host serves it. `/` answers a minimal HTML5 skeleton around artifact-page.html (the Artifact viewer likewise wraps the page
// fragment in its own skeleton; this stand-in is ours, not the viewer's). Every request is recorded in `log`.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
export const contentType = (p) => TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream';

export function skeleton(fragment) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"></head><body>\n${fragment}\n</body></html>\n`;
}

/** @returns {Promise<{ port: number, url: string, log: { method: string, path: string, status: number }[], close: () => Promise<void> }>} */
export function serve(root, port = 0, { page = 'artifact-page.html', ranges = true } = {}) {
  const log = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    const done = (status, headers, body) => { log.push({ method: req.method ?? 'GET', path, status }); res.writeHead(status, { 'cache-control': 'no-store', ...headers }); res.end(body); };
    if (path === '/' || path === '/index.html') {
      const f = join(root, page);
      return existsSync(f) ? done(200, { 'content-type': TYPES['.html'] }, skeleton(readFileSync(f, 'utf8'))) : done(404, {}, 'no page');
    }
    const f = normalize(join(root, path));
    if (!f.startsWith(normalize(root)) || !existsSync(f) || !statSync(f).isFile()) return done(404, { 'content-type': 'text/plain' }, 'not found');
    const buf = readFileSync(f);
    const m = ranges ? /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '') : null;
    if (m) {
      const a = Number(m[1]); const b = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      return done(206, { 'content-type': contentType(f), 'content-range': `bytes ${a}-${b}/${buf.length}`, 'accept-ranges': 'bytes' }, buf.subarray(a, b + 1));
    }
    return done(200, { 'content-type': contentType(f), ...(ranges ? { 'accept-ranges': 'bytes' } : {}) }, buf);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ port: p, url: `http://127.0.0.1:${p}/`, log, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
