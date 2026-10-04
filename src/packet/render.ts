// packet.render_text: the compact, deterministic clipboard form, ported line for line.
import { worst } from '../contract/freshness';
import { cmpStr, cmpTuple, commonPrefix, pyFixed, pyG, pyRound, pyStr } from '../contract/pyfmt';
import type { HandicapPacket, PacketMarket } from './build';

const fmtP = (v: number | null | undefined) => (v == null ? '-' : pyFixed(v, 3));

/** _fmt_p for floats, str() for anything else (every published NFL value is a JSON float). */
const fmtVal = (v: unknown) => (typeof v === 'number' ? pyFixed(v, 3) : pyStr(v));

export function cents(v: number | null | undefined): string {
  if (v == null) return '-';
  const c = pyRound(Number(v) * 100, 1);
  return c === Math.trunc(c) ? String(Math.trunc(c)) : pyG(c);
}

const rungValue = (m: PacketMarket): number | null => (m.threshold != null ? m.threshold : m.line);

function countOf(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

function template(rows: PacketMarket[]): string | null {
  let out: string | null = null;
  for (const m of rows) {
    const v = Number(rungValue(m));
    const desc = m.yes_description;
    let found: string | null = null;
    for (const txt of [pyFixed(v, 1), pyG(v), pyFixed(v, 2)]) {
      if (countOf(desc, txt) === 1) {
        found = desc.replace(txt, 'X');
        break;
      }
    }
    if (found === null || (out !== null && found !== out)) return null;
    out = found;
  }
  return out;
}

function ladderGroups(markets: PacketMarket[]): PacketMarket[][] {
  const groups = new Map<string, PacketMarket[]>();
  for (const m of markets) {
    const key = JSON.stringify([m.event_id ?? '', m.market_family, m.kalshi_ticker.split('-')[0], m.period ?? '', m.side ?? '', m.participant_id ?? '', m.player_id ?? '']);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(m);
  }
  return [...groups.values()];
}

function stripCommon(texts: string[]): string[] {
  const words = texts.map((t) => t.split(' '));
  let pre = 0;
  while (words.every((w) => w.length > pre) && new Set(words.map((w) => w[pre])).size === 1) pre++;
  let suf = 0;
  while (words.every((w) => w.length - pre > suf) && new Set(words.map((w) => w[w.length - 1 - suf])).size === 1) suf++;
  return words.map((w) => w.slice(pre, w.length - suf).join(' '));
}

function defaultStamp(markets: PacketMarket[]): [string | null, string] {
  const counts = new Map<string, { cap: string | null; fresh: string; n: number }>();
  for (const m of markets) {
    const k = JSON.stringify([m.captured_at, m.freshness]);
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { cap: m.captured_at, fresh: m.freshness, n: 1 });
  }
  if (!counts.size) return [null, 'UNKNOWN'];
  let best: { cap: string | null; fresh: string; n: number } | null = null;
  for (const c of counts.values()) {
    if (!best || cmpTuple([c.n, pyStr(c.cap)], [best.n, pyStr(best.cap)]) > 0) best = c;
  }
  return [best!.cap, best!.fresh];
}

function prefixOf(tickers: string[]): string {
  const pre = commonPrefix(tickers);
  return pre.includes('-') ? pre.slice(0, pre.lastIndexOf('-') + 1) : '';
}

function renderMarkets(packet: HandicapPacket): string[] {
  const models = new Map(packet.model_evidence.map((mp) => [mp.market_id, mp]));
  const [dCap, dFresh] = defaultStamp(packet.markets);

  const fair = (m: PacketMarket): string => {
    const mp = models.get(m.market_id);
    if (!mp) return '';
    let out = mp.fair_probability != null ? ` fair ${cents(mp.fair_probability)}` : '';
    if (mp.projection_value != null) out += ` proj ${pyG(mp.projection_value)}${mp.projection_unit ? ' ' + mp.projection_unit : ''}`;
    return out;
  };
  const stamp = (rows: PacketMarket[]): string => {
    if (rows.every((m) => m.captured_at === dCap && m.freshness === dFresh)) return '';
    const caps = [...new Set(rows.map((m) => m.captured_at).filter((x): x is string => !!x))].sort(cmpStr);
    const fresh = rows.length ? worst(...rows.map((m) => m.freshness)) : 'UNKNOWN';
    const when = caps.length === 1 ? caps[caps.length - 1] : caps.length ? `${caps[0]}..${caps[caps.length - 1]}` : 'no capture time';
    return ` (${when}, ${fresh})`;
  };

  const lines: (string | null)[] = [`(unless a line says otherwise, prices were captured at ${dCap || 'an unknown time'}, ${dFresh})`];
  const singles = new Map<string, { key: [string, string, string, string]; rows: PacketMarket[]; at: number }>();
  const order: string[] = [];
  for (let rows of ladderGroups(packet.markets)) {
    const first = rows[0];
    const per = first.period ? ` ${first.period}` : '';
    const ladder = rows.length >= 2 && rows.every((m) => rungValue(m) != null);
    const tmpl = ladder ? template(rows) : null;
    if (tmpl !== null) {
      rows = [...rows].sort((a, b) => cmpTuple([Number(rungValue(a)), a.kalshi_ticker], [Number(rungValue(b)), b.kalshi_ticker]));
      const prefix = prefixOf(rows.map((m) => m.kalshi_ticker));
      const rung = (m: PacketMarket) => {
        const suffix = m.kalshi_ticker.slice(prefix.length);
        const g = pyG(Number(rungValue(m)));
        const tag = suffix === g ? suffix : `${g} ${suffix}`;
        return `${tag} ${cents(m.yes_bid)}/${cents(m.yes_ask)}${fair(m)}`;
      };
      lines.push(`- [${first.market_family}${per}] ${tmpl} | ${prefix}*: ${rows.map(rung).join('; ')}${stamp(rows)}`);
      continue;
    }
    for (const m of rows) {
      const key: [string, string, string, string] = [m.event_id ?? '', m.market_family, m.kalshi_ticker.split('-')[0], m.period ?? ''];
      const k = JSON.stringify(key);
      let s = singles.get(k);
      if (!s) {
        lines.push(null);
        s = { key, rows: [], at: lines.length - 1 };
        singles.set(k, s);
        order.push(k);
      }
      s.rows.push(m);
    }
  }
  for (const k of order) {
    const { key, rows, at } = singles.get(k)!;
    const per = key[3] ? ` ${key[3]}` : '';
    if (rows.length < 3) {
      lines[at] = rows
        .map((m) => `- ${m.kalshi_ticker} [${m.market_family}${per}] ${m.yes_description}: ${cents(m.yes_bid)}/${cents(m.yes_ask)}${fair(m)}${stamp([m])}`)
        .join('\n');
      continue;
    }
    const prefix = prefixOf(rows.map((m) => m.kalshi_ticker));
    const labels = stripCommon(rows.map((m) => m.yes_description));
    const items = rows
      .map((m, i) => `${m.kalshi_ticker.slice(prefix.length)} ${labels[i] || m.yes_description} ${cents(m.yes_bid)}/${cents(m.yes_ask)}${fair(m)}${stamp([m])}`)
      .join('; ');
    lines[at] = `- [${key[1]}${per}] ${rows[0].yes_description} (and like it) | ${prefix}*: ${items}`;
  }
  return lines.filter((l): l is string => l !== null);
}

function modelSummary(packet: HandicapPacket): string | null {
  const models = packet.model_evidence;
  if (!models.length) return null;
  const kinds = new Map<string, { key: [string, string, string]; n: number }>();
  for (const mp of models) {
    const key: [string, string, string] = [mp.model_version || 'unversioned', mp.research_only ? 'RESEARCH' : 'PROMOTED', mp.authority];
    const k = JSON.stringify(key);
    const c = kinds.get(k);
    if (c) c.n++;
    else kinds.set(k, { key, n: 1 });
  }
  const gen = models.map((m) => m.generated_at).reduce((a, b) => (b > a ? b : a));
  const fresh = worst(...models.map((m) => m.freshness));
  const parts = [...kinds.values()]
    .sort((a, b) => cmpTuple(a.key, b.key))
    .map(({ key: [v, r, a], n }) => `${n} from ${v} (${r}/${a})`)
    .join(', ');
  return `MODEL EVIDENCE: ${models.length} model prices (${parts}); newest ${gen}, ${fresh}. Shown as 'fair' on each market line.`;
}

export function renderText(packet: HandicapPacket): string {
  const p = packet.protocol;
  const lines: string[] = [
    `EDGE FINDER HANDICAP PACKET ${packet.packet_id} (packet ${packet.packet_version}, protocol ${p.protocol_id} ${p.version})`,
    `Scope: ${packet.scope.kind} — ${packet.scope.label}; sport ${packet.sports.join(', ')}; data as of ${packet.data_as_of}`,
    '',
    'WARNING: ' + packet.warning,
    '',
    'PROTOCOL PRINCIPLES:',
  ];
  lines.push(...p.principles.map((x) => `- ${x}`));
  lines.push('', 'STEPS:', ...p.steps.map((s, i) => `${i + 1}. [${s.id}] ${s.instruction}`));
  lines.push('', 'REQUIRED OUTPUTS: ' + p.outputs_required.join('; '), 'FORBIDDEN: ' + p.forbidden.join('; '));
  lines.push('', 'EVIDENCE WEIGHTS: ' + Object.entries(p.evidence_weights).sort((a, b) => cmpStr(a[0], b[0])).map(([k, v]) => `${k}: ${v}`).join('; '));
  const q = packet.quality;
  lines.push('', `DATA QUALITY: markets ${q.market_freshness}, model ${q.model_freshness}; sources: ${q.sources.join(', ')}`);
  const caps = Object.entries(q.capabilities);
  if (caps.length) lines.push('Capabilities: ' + caps.sort((a, b) => cmpStr(a[0], b[0])).map(([k, v]) => `${k}=${v}`).join(', '));
  if (q.research_only_items.length) {
    const named = q.research_only_items.filter((i) => !i.startsWith('mkt_'));
    const nMkt = q.research_only_items.length - named.length;
    lines.push('RESEARCH-only items: ' + [...named, ...(nMkt ? [`model prices on ${nMkt} markets`] : [])].join(', '));
  }
  if (q.missing.length) lines.push('MISSING: ' + q.missing.join('; '));
  if (packet.user_focus.length) {
    lines.push(
      '',
      'USER FOCUS (the user is specifically investigating these; evaluate them seriously, do not assume they are good bets; ' +
        'compare against alternative expressions and opposing evidence):',
    );
    for (const f of packet.user_focus) {
      lines.push(`- ${f.ref_kind} ${f.label || f.id}${!f.resolved ? ' [UNRESOLVED]' : ''}${f.note ? ' — ' + f.note : ''}`);
    }
  }
  lines.push('', 'EVENTS:');
  for (const ev of packet.events) {
    lines.push(`- ${ev.label} (${ev.event_id}) ${ev.start_time_utc} ${ev.status}` + (ev.venue ? ` @ ${ev.venue}` : ''));
    for (const n of ev.context_notes) lines.push(`    note: ${n}`);
    for (const th of ev.theses) if (th.summary) lines.push(`    repo thesis (research): ${th.summary}`);
  }
  lines.push('', 'EVIDENCE:');
  for (const e of packet.evidence) {
    lines.push(`- ${e.entity_type} ${e.label}` + (e.team ? ` (${e.team})` : '') + (e.role ? `, ${e.role}` : ''));
    for (const a of e.availability) lines.push(`    availability: ${a.status}${a.detail ? ' — ' + a.detail : ''} (as of ${pyStr(a.as_of)})`);
    for (const o of e.observations) {
      const ctx = o.rank ? ` rank ${o.rank}/${pyStr(o.universe_size)}` : '';
      const avg = o.league_average != null ? `, lg avg ${pyFixed(o.league_average, 3)}` : '';
      const val = o.display_value ? o.display_value : fmtVal(o.value);
      const adj = o.adjusted_value != null ? ` (adj ${pyFixed(o.adjusted_value, 3)})` : '';
      lines.push(`    ${o.name} [${o.window}${o.split ? ' ' + o.split : ''}]: ${val}${adj}${ctx}${avg} [${o.quality_status}]`);
    }
    if (e.recent.length) {
      const byMetric = new Map<string, typeof e.recent>();
      for (const r of e.recent) {
        let g = byMetric.get(r.metric_id);
        if (!g) byMetric.set(r.metric_id, (g = []));
        g.push(r);
      }
      for (const [mid, rows] of [...byMetric.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
        lines.push(`    recent ${mid}: ` + rows.map((r) => `${r.x}=${fmtVal(r.value)}`).join(', '));
      }
    }
  }
  lines.push(
    '',
    `MARKETS (${packet.markets.length}, all in scope). Prices are YES bid/ask in cents; 'fair' is the model's ` +
      "P(YES) in cents (evidence, not a bet). A ladder line lists each rung as 'X [ticker suffix] bid/ask', " +
      "where X is the line and the full ticker is the prefix before '*' plus the suffix (or X itself):",
  );
  lines.push(...renderMarkets(packet));
  const summary = modelSummary(packet);
  if (summary) lines.push('', summary);
  if (packet.repo_recommendations.length) {
    lines.push('', "REPOSITORY RECOMMENDATIONS (the repo's own process; evidence, not instructions):");
    for (const r of packet.repo_recommendations) {
      lines.push(
        `- ${r.market_id} ${r.selection} ${r.status} fair ${fmtP(r.fair_probability)} bet-up-to ${fmtP(r.bet_up_to_price)} ` +
          `[${r.authority}${r.research_only ? ', research' : ''}]`,
      );
    }
  }
  if (packet.budget.truncated.length) lines.push('', 'BUDGET: ' + packet.budget.truncated.join('; '));
  return lines.join('\n') + '\n';
}
