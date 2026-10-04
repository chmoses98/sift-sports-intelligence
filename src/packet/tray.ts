// Research tray items, exactly as the contract defines them (packet.tray_item / packet.tray):
// references only, never payloads.
import { trayItemId } from '../contract/ids';
import { SCHEMA_VERSION } from '../contract/types';

export type RefKind = 'TEAM' | 'PLAYER' | 'EVENT' | 'METRIC' | 'RANKING' | 'SERIES' | 'CHART_POINT' | 'MARKET' | 'PROJECTION';

export interface TrayExtra {
  series_id: string | null;
  x: string | null;
  metric_id: string | null;
  market_id: string | null;
  event_id: string | null;
}

export interface TrayItem {
  item_id: string;
  ref_kind: RefKind;
  sport: string;
  id: string;
  extra: TrayExtra | null;
  note: string | null;
  added_at: string;
}

export interface TrayDoc {
  schema_version: string;
  kind: 'research_tray';
  tray_version: string;
  items: TrayItem[];
  updated_at: string;
}

/** Python json.dumps(obj, sort_keys=True) for a flat object of strings/numbers/nulls (ensure_ascii). */
export function pyJsonDumpsSorted(obj: Record<string, string | number | null>): string {
  const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const str = (s: string) =>
    JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const val = (v: string | number | null) => (v === null ? 'null' : typeof v === 'number' ? String(v) : str(v));
  return '{' + keys.map((k) => `${str(k)}: ${val(obj[k])}`).join(', ') + '}';
}

export function toIso(t: string | number | Date): string {
  const d = t instanceof Date ? t : new Date(t);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function makeTrayItem(args: {
  ref_kind: RefKind;
  sport: string;
  id: string;
  added_at: string | Date;
  extra?: Partial<TrayExtra> | null;
  note?: string | null;
}): TrayItem {
  let ex: TrayExtra | null = null;
  if (args.extra && Object.keys(args.extra).length) {
    ex = {
      series_id: args.extra.series_id ?? null,
      x: args.extra.x ?? null,
      metric_id: args.extra.metric_id ?? null,
      market_id: args.extra.market_id ?? null,
      event_id: args.extra.event_id ?? null,
    };
  }
  const exText = ex ? pyJsonDumpsSorted(ex as unknown as Record<string, string | null>) : null;
  return {
    item_id: trayItemId(args.ref_kind, String(args.id), exText),
    ref_kind: args.ref_kind,
    sport: args.sport.toUpperCase(),
    id: String(args.id),
    extra: ex,
    note: args.note == null ? null : String(args.note),
    added_at: toIso(args.added_at),
  };
}

export function makeTray(items: TrayItem[], updatedAt: string | Date): TrayDoc {
  return { schema_version: SCHEMA_VERSION, kind: 'research_tray', tray_version: '1.0.0', items, updated_at: toIso(updatedAt) };
}
