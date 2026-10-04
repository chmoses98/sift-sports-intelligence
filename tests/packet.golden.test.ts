// The TypeScript packet builder against packets produced by the contract's own Python builder
// (scripts/make_golden_packets.py) from the same NFL publication. Byte-identical clipboard text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPacket } from '../src/packet/build';
import { renderText } from '../src/packet/render';
import type { TrayDoc } from '../src/packet/tray';
import { makeTrayItem } from '../src/packet/tray';
import { nflRepo, useDiskFetch } from './helpers';

const GOLDEN = join(__dirname, 'golden');
const read = (f: string) => readFileSync(join(GOLDEN, f), 'utf-8');
const GENERATED_AT = '2026-10-04T01:00:00Z';

function firstDiff(a: string, b: string): string {
  const al = a.split('\n');
  const bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}:\n  ts: ${al[i]?.slice(0, 400)}\n  py: ${bl[i]?.slice(0, 400)}`;
  }
  return 'identical';
}

describe('handicap packet (port of packet.py)', () => {
  beforeAll(() => useDiskFetch());

  it('GAME scope reproduces the Python packet byte for byte', async () => {
    const pkt = await buildPacket(nflRepo(), { scope: 'GAME', eventId: 'evt_0cb333291f580a201a70', generatedAt: GENERATED_AT });
    const text = renderText(pkt);
    const want = read('game.packet.txt');
    expect(firstDiff(text, want)).toBe('identical');
    const summary = JSON.parse(read('game.summary.json'));
    expect(pkt.packet_id).toBe(summary.packet_id);
    expect(pkt.budget).toEqual(summary.budget);
    expect(pkt.quality).toEqual(summary.quality);
    expect(pkt.evidence.map((e) => e.entity_id)).toEqual(summary.evidence_entities);
    expect(pkt.markets.length).toBe(summary.counts.markets);
    expect(pkt.model_evidence.length).toBe(summary.counts.model_evidence);
  });

  it('SLATE scope reproduces the Python packet', async () => {
    const pkt = await buildPacket(nflRepo(), {
      scope: 'SLATE', windowStart: '2026-10-04T16:00:00Z', windowEnd: '2026-10-04T18:00:00Z', generatedAt: GENERATED_AT,
    });
    expect(firstDiff(renderText(pkt), read('slate.packet.txt'))).toBe('identical');
    expect(pkt.packet_id).toBe(JSON.parse(read('slate.summary.json')).packet_id);
  });

  it('CUSTOM (research tray) scope reproduces the Python packet, unresolved items included', async () => {
    const tray = JSON.parse(read('tray.json')) as TrayDoc;
    const pkt = await buildPacket(nflRepo(), { scope: 'CUSTOM', tray, generatedAt: GENERATED_AT });
    expect(firstDiff(renderText(pkt), read('tray.packet.txt'))).toBe('identical');
    const summary = JSON.parse(read('tray.summary.json'));
    expect(pkt.user_focus).toEqual(summary.user_focus);
    expect(pkt.quality.missing).toContain('tray item EVENT evt_00000000000000000000 is not in this publication');
  });

  it('tray item ids match the contract digest', () => {
    const tray = JSON.parse(read('tray.json')) as TrayDoc;
    for (const it of tray.items) {
      const again = makeTrayItem({ ref_kind: it.ref_kind, sport: it.sport, id: it.id, added_at: it.added_at, extra: it.extra, note: it.note });
      expect(again).toEqual(it);
    }
  });

  it('never trims markets or model evidence and always carries the protocol and warning', async () => {
    const pkt = await buildPacket(nflRepo(), { scope: 'GAME', eventId: 'evt_0cb333291f580a201a70', generatedAt: GENERATED_AT, maxChars: 5000 });
    const text = renderText(pkt);
    expect(pkt.markets.length).toBe(796);
    expect(pkt.budget.truncated).toContain('over budget: every market in scope was kept');
    expect(text).toContain('Everything in this packet is EVIDENCE');
    expect(text).toContain('PROTOCOL PRINCIPLES:');
    expect(text).toContain('edge_finder.handicap.nfl.v1');
  });
});
