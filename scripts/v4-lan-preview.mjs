// Serve a production build of the app to other devices on the same Wi-Fi (a phone), and print the exact v4 address.
//
//   npm run preview:lan                 builds into dist-lan, then serves it on 0.0.0.0:4173
//   npm run preview:lan -- --port 4200  another port
//   npm run preview:lan -- --skip-build serve the existing dist-lan as it is
//
// A production build, not the dev server, because performance and font loading on a phone must be judged on the real
// bundle. The build uses the app's own defaults (SIFT 2.0 stays the default interface; v4 is at #/v4). dist-lan is
// separate from dist, which the acceptance suites rebuild with their own flags. Over plain http a phone does not
// register the service worker, so a rebuild is picked up on the next page load.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { preview } from 'vite';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const port = Number(arg('port', 4173));
const outDir = 'dist-lan';
const base = process.env.SIFT_BASE ?? '/sift-sports-intelligence/';

if (!process.argv.includes('--skip-build') || !existsSync(outDir)) {
  console.log(`Building ${outDir} (about a minute)...`);
  const r = spawnSync('npx', ['vite', 'build', '--outDir', outDir], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const server = await preview({ build: { outDir }, preview: { host: '0.0.0.0', port, strictPort: true } });
// Same keep-alive settings as the acceptance suites' server (scripts/e2e-preview.mjs): a phone reuses sockets.
server.httpServer.keepAliveTimeout = 60_000;
server.httpServer.headersTimeout = 65_000;

const addresses = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
console.log('\nSIFT v4 preview is being served. On your iPhone (same Wi-Fi as this computer), open Safari and go to:\n');
if (addresses.length === 0) console.log(`  http://<this computer's Wi-Fi IP address>:${port}${base}#/v4   (no network address was found; check Wi-Fi)`);
for (const a of addresses) console.log(`  http://${a}:${port}${base}#/v4`);
console.log('\nUse the address on your Wi-Fi network (usually 192.168.x.x or 10.x.x.x). Press Ctrl+C here to stop.\n');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close().finally(() => process.exit(0)));
