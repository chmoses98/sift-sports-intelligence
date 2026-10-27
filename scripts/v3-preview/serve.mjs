// Serve the captured preview build statically, the way the crawl and the self-check do:
//   node scripts/v3-preview/serve.mjs [dist-v3-snapshot] [port]      then open http://127.0.0.1:<port>/ (a minimal skeleton around artifact-page.html)
import { serve } from './static-server.mjs';

const root = process.argv[2] ?? 'dist-v3-snapshot';
const port = Number(process.argv[3] ?? process.env.PREVIEW_PORT ?? 8777);
const s = await serve(root, port);
console.log(`serving ${root} at ${s.url} (Ctrl-C to stop)`);
