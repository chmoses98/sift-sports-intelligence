// The acceptance suites' static server: `vite preview`, with keep-alive sockets that outlive the longest idle gap in a test.
//
//   node scripts/e2e-preview.mjs --port 4173 [--outDir dist]
//
// Node closes an idle keep-alive socket after 5 s. A browser that reuses that socket in the same instant gets "Connection
// terminated unexpectedly" on a plain same-origin GET (CI, iPhone WebKit: a static explorer file during a client-side route
// change), a failure no test can cause or fix. Tests that drive the fake clock or wait on a slow screen routinely sit idle
// for longer than 5 s, so the server now keeps the socket open for a minute. Nothing else about the preview changes.
import { preview } from 'vite';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const server = await preview({ build: { outDir: arg('outDir', 'dist') }, preview: { port: Number(arg('port', 4173)), strictPort: true } });
server.httpServer.keepAliveTimeout = 60_000;
server.httpServer.headersTimeout = 65_000; // Node requires headersTimeout > keepAliveTimeout
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close().finally(() => process.exit(0)));
