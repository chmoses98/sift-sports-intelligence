// Turns the probe's records into score-change delays. Pure functions, no I/O (the CLI at the bottom reads files).
//
// What is and is not measurable, stated up front:
//   * A poller sees a change only when it polls. A change first seen at `seenAt` happened after the previous poll
//     (`prevPollAt`), so each observation is a WINDOW [prevPollAt, seenAt]. Every delay is reported with its window
//     half-width (`uncertaintyMs`): a 5 s poller cannot resolve delays smaller than ±2.5 s. Never quote a delay without it.
//   * Without a ground-truth clock at the venue, only RELATIVE delay is measurable: how much later source X showed the
//     same score change than the fastest source (or than a human-marked "truth" press). The absolute event-to-screen
//     latency of Real = Real's mark minus the truth mark; it is only as good as the truth marks.
//   * Real can only be observed by a person (automating a third-party app is outside what this harness does): the
//     operator taps "Real updated" in the mark page when the score changes on their phone. That tap has human reaction
//     error (~0.3–1 s) which is carried as the mark's uncertainty.
//   * A mark and a change are paired by ORDER within a game (n-th mark = n-th score change). A game whose counts differ
//     (a missed tap, a change the poller skipped) is reported UNPAIRED and excluded, never forced.

export const HUMAN_MS = 700;

/** Score changes only (status/period changes are not score-change latency), in order, per source and game. */
export function scoreChanges(records) {
  const by = new Map();
  for (const r of records) {
    if (r.type !== 'change' || r.kind !== 'score') continue;
    const k = `${r.src}\u0000${r.game}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  for (const list of by.values()) list.sort((a, b) => a.seenAt - b.seenAt);
  return by;
}

const mid = (o) => (o.prevPollAt + o.seenAt) / 2;
const half = (o) => (o.seenAt - o.prevPollAt) / 2;

export function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

/**
 * Per source: delay of each paired score change against a reference.
 *   ref = 'fastest'  the earliest source for that change (relative latency between feeds)
 *   ref = 'truth'    the operator's truth marks (absolute, if the truth marks are good)
 *   ref = <src id>   a named source
 * Marks: { kind: 'real'|'truth', game, at }. Real is treated as one more source.
 */
export function compare(records, marks = [], { ref = 'fastest' } = {}) {
  const changes = scoreChanges(records);
  const games = new Set([...changes.keys()].map((k) => k.split('\u0000')[1]));
  const sources = new Set([...changes.keys()].map((k) => k.split('\u0000')[0]));
  const out = { ref, delays: [], unpaired: [], stats: {} };

  for (const game of games) {
    // Observations per "n-th change of this game", one per source that saw it.
    const seqs = new Map(); // src -> [obs]
    for (const s of sources) if (changes.has(`${s}\u0000${game}`)) seqs.set(s, changes.get(`${s}\u0000${game}`));
    const real = marks.filter((m) => m.kind === 'real' && m.game === game).sort((a, b) => a.at - b.at).map((m) => ({ prevPollAt: m.at - HUMAN_MS, seenAt: m.at + HUMAN_MS }));
    const truth = marks.filter((m) => m.kind === 'truth' && m.game === game).sort((a, b) => a.at - b.at).map((m) => ({ prevPollAt: m.at - HUMAN_MS, seenAt: m.at + HUMAN_MS }));
    if (real.length) seqs.set('real', real);
    if (truth.length) seqs.set('truth', truth);

    // Candidates are every source plus Real; truth marks are only ever a reference.
    const cands = [...seqs].filter(([s]) => s !== 'truth');
    const target = ref === 'truth' ? truth.length : ref === 'fastest' ? Math.max(0, ...cands.map(([, l]) => l.length)) : (seqs.get(ref)?.length ?? 0);
    if (!target) continue;
    const paired = cands.filter(([, l]) => l.length === target);
    for (const [s, l] of cands) if (l.length !== target && s !== ref) out.unpaired.push({ game, src: s, got: l.length, expected: target });

    for (let n = 0; n < target; n++) {
      const refObs = ref === 'truth' ? truth[n] : ref === 'fastest' ? paired.map(([, l]) => l[n]).sort((x, y) => mid(x) - mid(y))[0] : seqs.get(ref)?.[n];
      if (!refObs) continue;
      for (const [s, l] of paired) {
        if (s === ref) continue;
        const o = l[n];
        out.delays.push({ game, n: n + 1, src: s, delayMs: Math.round(mid(o) - mid(refObs)), uncertaintyMs: Math.round(half(o) + half(refObs)) });
      }
    }
  }

  for (const s of new Set(out.delays.map((d) => d.src))) {
    const ds = out.delays.filter((d) => d.src === s);
    const xs = ds.map((d) => d.delayMs);
    out.stats[s] = {
      n: xs.length, medianMs: Math.round(quantile(xs, 0.5)), p90Ms: Math.round(quantile(xs, 0.9)), maxMs: Math.max(...xs), minMs: Math.min(...xs),
      medianUncertaintyMs: Math.round(quantile(ds.map((d) => d.uncertaintyMs), 0.5)),
    };
  }
  return out;
}

export function toMarkdown(result) {
  const f = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
  const lines = [`Reference: **${result.ref}**. Delay = when the source showed the change minus the reference (positive = later). ± is the polling-window half-width.`, '', '| source | n | median | p90 | max | min | ± |', '|---|---|---|---|---|---|---|'];
  for (const [s, v] of Object.entries(result.stats).sort((a, b) => a[1].medianMs - b[1].medianMs)) lines.push(`| ${s} | ${v.n} | ${f(v.medianMs)} | ${f(v.p90Ms)} | ${f(v.maxMs)} | ${f(v.minMs)} | ${f(v.medianUncertaintyMs)} |`);
  if (result.unpaired.length) lines.push('', `Unpaired (excluded): ${result.unpaired.map((u) => `${u.game}/${u.src} ${u.got}≠${u.expected}`).join('; ')}`);
  return lines.join('\n');
}

// CLI: node analyze.mjs <out-dir> [--ref fastest|truth|<src>]
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { readFileSync, existsSync } = await import('node:fs');
  const dir = process.argv[2];
  const ref = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : 'fastest';
  const read = (f) => (existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  console.log(toMarkdown(compare(read('changes.jsonl'), read('marks.jsonl'), { ref })));
}
