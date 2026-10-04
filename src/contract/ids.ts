// Deterministic identities, mirroring kalshi-bet-router contract/edge_finder_contract/ids.py:
// sha256 over a domain-separated, length-prefixed encoding, first 20 hex chars.
import { sha256 } from '@noble/hashes/sha2.js';
import { SCHEMA_VERSION } from './types';

const DOMAIN = 'edge_finder.app.v1/ids';
const enc = new TextEncoder();

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function digest(parts: (string | null | undefined)[], length = 20): string {
  let material = `${DOMAIN}|${SCHEMA_VERSION}|`;
  for (const part of parts) {
    const text = part == null ? '' : String(part);
    material += `${enc.encode(text).length}:${text}`;
  }
  return hex(sha256(enc.encode(material))).slice(0, length);
}

export const makeId = (prefix: string, ...parts: (string | null | undefined)[]) => `${prefix}_${digest(parts)}`;

/** Python's sorted() over str: code-point order (not localeCompare). */
export function pySortStrings(xs: string[]): string[] {
  return [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function packetId(protocolId: string, scopeKind: string, scopeParts: string[], dataAsOf: string | null): string {
  return makeId('pkt', 'packet', protocolId, scopeKind, ...pySortStrings(scopeParts.map(String)), dataAsOf);
}

export function trayItemId(refKind: string, id: string, extra: string | null): string {
  return makeId('try', 'tray', refKind, id, extra);
}

export function tickerFromMarketId(marketId: string): string {
  return marketId.startsWith('mkt_kalshi_') ? marketId.slice('mkt_kalshi_'.length) : marketId;
}
