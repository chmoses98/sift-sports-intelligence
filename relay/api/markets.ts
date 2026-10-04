// Vercel host for Sift's read-only Kalshi quote relay (behaviour in ../core.ts). Vercel Functions run
// on AWS, so upstream calls leave from a different network than Cloudflare Workers, whose shared egress
// Kalshi rate-limits. Served at /markets (vercel.json rewrite) and /api/markets.
//
// Configuration (optional): ALLOWED_ORIGINS, comma-separated; defaults to Sift's Pages origin + local dev.
import { handleRelay, MemoryRelayCache, parseOrigins } from '../core';

// One per warm instance: concurrent and back-to-back identical reads share a single upstream call.
const cache = new MemoryRelayCache();

const handle = (request: Request) => handleRelay(request, { allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS), cache });

// Every method is routed to the core so a write gets its explicit 405 (with CORS), not a platform page.
export { handle as GET, handle as OPTIONS, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
